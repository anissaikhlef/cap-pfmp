import { describe, expect, it } from "vitest";
import {
  blocageSignature, dossierAllocationComplet, heuresHebdo, lireJours, pauseConforme, piecesAVerifier, piecesManquantes, plagesDuJour,
  relanceHebdomadaireDue, reposHebdoMineur, reposQuotidienMinimal, signatairesAttendus, texteJour, verifierStage,
} from "@/lib/regles";
import { lireCsv, versCsv } from "@/lib/csv";
import { completerReglages, REGLAGES_PAR_DEFAUT, type Horaires, type Plage, type Reglages, type Signatures } from "@/db/schema";

const R = REGLAGES_PAR_DEFAUT.regles;
const MATIN: Plage = ["08:30", "12:00"], APRES_MIDI: Plage = ["13:00", "16:30"];
const JOURNEE = [MATIN, APRES_MIDI];
// Lundi à jeudi en deux plages, vendredi matin : 31 h 30
const STD: Horaires = [JOURNEE, JOURNEE, JOURNEE, JOURNEE, [MATIN], null, null];
const semaine = (jour: Plage[]): Horaires => [jour, jour, jour, jour, jour, null, null];

function regles(h: Horaires, age: number | null, r = R) {
  return verifierStage({ horaires: h, regleStructure: "libre", secteurEntreprise: "prive", domaineEntreprise: null, dominanteEleve: null, signatures: {}, ageAuDebut: age }, r);
}
const ok = (h: Horaires, age: number | null, code: string) => regles(h, age).find((x) => x.code === code)?.ok;

describe("horaires en deux plages", () => {
  it("additionne le matin et l'après-midi (31 h 30)", () => expect(heuresHebdo(STD)).toBe(31.5));
  it("écrit une journée en deux plages", () => expect(texteJour(STD, 0)).toBe("08:30 – 12:00 · 13:00 – 16:30"));
  it("un jour de repos n'a pas de plage", () => expect([plagesDuJour(STD, 5), texteJour(STD, 6)]).toEqual([[], null]));
  it("range les plages dans l'ordre de la journée", () => expect(plagesDuJour([[APRES_MIDI, MATIN]], 0)).toEqual([MATIN, APRES_MIDI]));
  it("lit encore l'ancien format à une plage par jour", () => {
    const ancien = [["08:00", "15:00"], null] as unknown as Horaires;
    expect(plagesDuJour(ancien, 0)).toEqual([["08:00", "15:00"]]);
  });
});

describe("pause d'un élève mineur", () => {
  it("accepte une pause déjeuner d'une heure", () => expect(pauseConforme(JOURNEE)).toBe(true));
  it("refuse 5 h d'affilée", () => expect(pauseConforme([["08:00", "13:00"]])).toBe(false));
  it("accepte 4 h 30 d'affilée sans pause", () => expect(pauseConforme([["08:00", "12:30"]])).toBe(true));
  it("refuse une pause de 15 min quand la journée dépasse 4 h 30", () => expect(pauseConforme([["08:00", "12:00"], ["12:15", "14:00"]])).toBe(false));
  it("accepte une pause de 30 min", () => expect(pauseConforme([["08:00", "12:00"], ["12:30", "14:00"]])).toBe(true));
});

describe("repos d'un élève mineur", () => {
  it("mesure le repos entre deux journées (16 h)", () => expect(reposQuotidienMinimal(STD)).toBe(16 * 60));
  it("repère un repos trop court (fin à 22 h, reprise à 6 h)", () => {
    expect(reposQuotidienMinimal([[["14:00", "22:00"]], [["06:00", "12:00"]], null, null, null, null, null])).toBe(8 * 60);
  });
  it("sans deux jours de suite, pas de repos quotidien à mesurer", () => expect(reposQuotidienMinimal([[MATIN], null, [MATIN], null, null, null, null])).toBeNull());
  it("samedi et dimanche de repos : conforme", () => expect(reposHebdoMineur(STD)).toBe(true));
  it("repos du dimanche au lundi : conforme", () => expect(reposHebdoMineur([null, JOURNEE, JOURNEE, JOURNEE, JOURNEE, JOURNEE, null])).toBe(true));
  it("seul le dimanche de repos : refusé", () => expect(reposHebdoMineur([JOURNEE, JOURNEE, JOURNEE, JOURNEE, null, JOURNEE, null])).toBe(false));
  it("travail le dimanche : refusé", () => expect(reposHebdoMineur([null, null, JOURNEE, JOURNEE, JOURNEE, JOURNEE, JOURNEE])).toBe(false));
});

describe("règles des élèves mineurs dans le contrôle du stage", () => {
  it("un horaire en deux plages respecte toutes les règles d'un mineur de 16 ans", () => {
    expect(regles(STD, 16).filter((x) => x.code.startsWith("mineur")).every((x) => x.ok)).toBe(true);
  });
  it("refuse plus de 8 h dans une journée", () => expect(ok(semaine([["08:00", "12:00"], ["13:00", "17:30"]]), 17, "mineur_jour")).toBe(false));
  it("refuse 7 h sans pause", () => expect(ok(semaine([["08:00", "15:00"]]), 17, "mineur_pause")).toBe(false));
  it("refuse 21 h avant 16 ans", () => expect(ok(semaine([["13:00", "16:00"], ["17:00", "21:00"]]), 15, "mineur_nuit")).toBe(false));
  it("accepte 21 h à 16 ans", () => expect(ok(semaine([["13:00", "16:00"], ["17:00", "21:00"]]), 16, "mineur_nuit")).toBe(true));
  it("exige 14 h de repos avant 16 ans", () => {
    const h: Horaires = semaine([["09:00", "12:00"], ["14:00", "19:00"]]); // repos de 19 h à 9 h : 14 h
    expect(ok(h, 15, "mineur_repos")).toBe(true);
    expect(ok(semaine([["08:00", "12:00"], ["14:00", "19:00"]]), 15, "mineur_repos")).toBe(false); // 13 h
  });
  it("ne s'applique pas à un élève majeur", () => expect(regles(semaine([["08:00", "15:00"]]), 18).some((x) => x.code.startsWith("mineur"))).toBe(false));
  it("ne s'applique pas si l'âge est inconnu", () => expect(regles(STD, null).some((x) => x.code.startsWith("mineur"))).toBe(false));
  it("le lycée peut désactiver ces contrôles", () => {
    expect(regles(semaine([["08:00", "15:00"]]), 16, { ...R, reglesMineurs: false }).some((x) => x.code.startsWith("mineur"))).toBe(false);
  });
});

describe("signataires de la convention", () => {
  it("un élève mineur avec un tuteur désigné : six signataires", () => {
    expect(signatairesAttendus(17, true)).toEqual(["eleve", "parent", "entreprise", "tuteur", "professeur", "direction"]);
  });
  it("un élève majeur sans tuteur désigné : ni parent ni tuteur", () => {
    expect(signatairesAttendus(18, false)).toEqual(["eleve", "entreprise", "professeur", "direction"]);
  });
});

describe("ordre des signatures", () => {
  const requis = signatairesAttendus(17, true);
  const signe = (...q: (keyof Signatures)[]): Signatures => Object.fromEntries(q.map((k) => [k, { le: "2026-10-27", par: null, mode: "enligne" }]));
  it("le référent qui signe en dernier attend les autres", () => {
    expect(blocageSignature("professeur", requis, signe("eleve", "parent"), "professeur", true)).toContain("En attente de");
  });
  it("le référent ne signe pas en dernier un stage hors règles", () => {
    expect(blocageSignature("professeur", requis, signe("eleve", "parent", "entreprise", "tuteur", "direction"), "professeur", false)).toContain("ne respecte pas toutes les règles");
  });
  it("le référent signe en dernier quand tout est prêt", () => {
    expect(blocageSignature("professeur", requis, signe("eleve", "parent", "entreprise", "tuteur", "direction"), "professeur", true)).toBeNull();
  });
  it("la direction signe à tout moment quand le référent signe en dernier", () => {
    expect(blocageSignature("direction", requis, signe(), "professeur", false)).toBeNull();
  });
  it("et inversement quand la direction signe en dernier", () => {
    expect(blocageSignature("professeur", requis, signe(), "direction", true)).toBeNull();
    expect(blocageSignature("direction", requis, signe("eleve"), "direction", true)).toContain("En attente de");
  });
});

describe("dossier d'allocation", () => {
  const valide = { statut: "valide" as const }, attente = { statut: "a_verifier" as const }, refuse = { statut: "refuse" as const };
  it("demande les pièces jamais déposées", () => expect(piecesManquantes(undefined)).toEqual(["rib", "piece_identite"]));
  it("redemande une pièce refusée, pas une pièce en cours de vérification", () => {
    expect(piecesManquantes({ rib: refuse, piece_identite: attente })).toEqual(["rib"]);
  });
  it("signale une pièce à vérifier", () => {
    expect(piecesAVerifier({ rib: valide, piece_identite: attente })).toBe(true);
    expect(piecesAVerifier({ rib: valide, piece_identite: refuse })).toBe(false);
  });
  it("est complet avec les deux pièces vérifiées et l'attestation de chaque stage terminé", () => {
    const p = { rib: valide, piece_identite: valide };
    expect(dossierAllocationComplet(p, [{ termine: true, attestation: valide }, { termine: false, attestation: null }])).toBe(true);
    expect(dossierAllocationComplet(p, [{ termine: true, attestation: attente }])).toBe(false);
  });
  it("n'est pas complet sans stage dans l'année, ni avec une pièce en attente", () => {
    expect(dossierAllocationComplet({ rib: valide, piece_identite: valide }, [])).toBe(false);
    expect(dossierAllocationComplet({ rib: valide, piece_identite: attente }, [{ termine: true, attestation: valide }])).toBe(false);
  });
});

describe("relances automatiques", () => {
  it("lit les jours saisis dans « Organisation »", () => {
    expect(lireJours("7, 3")).toEqual([7, 3]);
    expect(lireJours("3 et 7")).toEqual([3, 7]);
    expect(lireJours(" 14 ; 7 ; 7 ")).toEqual([14, 7]);
    expect(lireJours("")).toEqual([]);
  });
  it("refuse une saisie qui n'est pas une liste de jours", () => {
    expect(lireJours("une semaine")).toBeNull();
    expect(lireJours("0")).toBeNull();
    expect(lireJours("90")).toBeNull();
    expect(lireJours("1, 2, 3, 4, 5, 6")).toBeNull();
  });
  it("relance une famille une fois par semaine", () => {
    expect(relanceHebdomadaireDue([], "2026-10-26", 3)).toBe(true);
    expect(relanceHebdomadaireDue(["2026-10-20"], "2026-10-26", 3)).toBe(false);
    expect(relanceHebdomadaireDue(["2026-10-19"], "2026-10-26", 3)).toBe(true);
  });
  it("au plus le nombre de fois réglé", () => {
    expect(relanceHebdomadaireDue(["2026-10-05", "2026-10-12", "2026-10-19"], "2026-10-26", 3)).toBe(false);
    expect(relanceHebdomadaireDue([], "2026-10-26", 0)).toBe(false);
  });
  it("un lycée enregistré avant les relances reçoit les délais par défaut", () => {
    const r = completerReglages({ gestion: "ddfpt" } as Partial<Reglages>);
    expect(r.relances).toEqual({ convention: [7, 3], absences: [2, 7], piecesMax: 3, eleveQuotidien: true, eleveRechercheJours: 30, entrepriseIntervalle: 3, entrepriseMax: 5, accueilAvant: 3, remerciementApres: 1, attestationAvant: 2 });
    expect(completerReglages({ relances: { entrepriseIntervalle: 4 } } as unknown as Partial<Reglages>).relances).toMatchObject({ entrepriseIntervalle: 4, entrepriseMax: 5 });
  });
});

describe("export pour un tableur", () => {
  const csv = versCsv([["Nom", "Jours"], ["Koné", 4], ["Dupont; Martin", null], ['Le "Cap"', "=1+1"]]);
  it("commence par la marque qui garde les accents dans Excel", () => expect(csv.charCodeAt(0)).toBe(0xfeff));
  it("sépare les colonnes par un point-virgule et les lignes par un retour Windows", () => expect(csv.slice(1).startsWith("Nom;Jours\r\nKoné;4\r\n")).toBe(true));
  it("met entre guillemets une cellule qui contient un point-virgule ou des guillemets", () => {
    expect(csv).toContain('"Dupont; Martin";\r\n');
    expect(csv).toContain('"Le ""Cap"""');
  });
  it("neutralise une cellule qui serait lue comme une formule", () => expect(csv).toContain(";'=1+1\r\n"));
  it("se relit à l'identique, sauf la formule neutralisée", () => {
    expect(lireCsv(csv)).toEqual([["Nom", "Jours"], ["Koné", "4"], ["Dupont; Martin", ""], ['Le "Cap"', "'=1+1"]]);
  });
});
