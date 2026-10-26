import { describe, expect, it } from "vitest";
import { estRattrapage, periodeDeReference, periodeDeReferenceEleve } from "@/lib/periodes";
import { joursDAbsence, joursEffectues, joursPrevus } from "@/lib/regles";
import { quotasVisites } from "@/lib/repartition";
import { cleNom, lireHeures } from "@/lib/csv";
import { completerReglages, REGLAGES_PAR_DEFAUT, type Horaires } from "@/db/schema";

// Horaires du lundi au vendredi (vendredi matin seulement), repos le week-end
const STD: Horaires = [["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "12:00"], null, null];
// Du mercredi au dimanche
const WEEKEND: Horaires = [null, null, ["09:00", "16:00"], ["09:00", "16:00"], ["09:00", "16:00"], ["10:00", "17:00"], ["10:00", "16:00"]];

const classe = (id: string, debut: string, fin: string) => ({ id, debut, fin, eleveId: null });
const rattrapage = (id: string, debut: string, fin: string) => ({ id, debut, fin, eleveId: "eleve" });

describe("période de référence d'une classe", () => {
  const P1 = classe("P1", "2026-10-05", "2026-10-23"), P2 = classe("P2", "2027-02-01", "2027-02-26");
  it("prend la période en cours", () => expect(periodeDeReference([P1, P2], "2026-10-12")?.id).toBe("P1"));
  it("garde 30 jours une période terminée", () => expect(periodeDeReference([P1, P2], "2026-11-10")?.id).toBe("P1"));
  it("passe ensuite à la prochaine", () => expect(periodeDeReference([P1, P2], "2026-12-01")?.id).toBe("P2"));
  it("sans période, rien", () => expect(periodeDeReference([], "2026-12-01")).toBeNull());
});

describe("période de référence d'un élève en rattrapage", () => {
  const P1 = classe("P1", "2026-10-05", "2026-10-23");
  const R = rattrapage("R", "2026-10-26", "2026-10-30");
  it("reconnaît un rattrapage", () => {
    expect(estRattrapage(R)).toBe(true);
    expect(estRattrapage(P1)).toBe(false);
  });
  it("un rattrapage en cours passe avant tout", () => expect(periodeDeReferenceEleve([P1, R], "2026-10-27")?.id).toBe("R"));
  it("un rattrapage à venir passe avant une période de classe terminée", () => expect(periodeDeReferenceEleve([P1, R], "2026-10-24")?.id).toBe("R"));
  it("une période de classe en cours reste la référence tant que le rattrapage n'a pas commencé", () => {
    expect(periodeDeReferenceEleve([classe("P1", "2026-10-05", "2026-10-30"), rattrapage("R", "2026-11-09", "2026-11-13")], "2026-10-20")?.id).toBe("P1");
  });
  it("une période de classe à venir avant le rattrapage passe d'abord", () => {
    const P2 = classe("P2", "2026-11-02", "2026-11-06"), R2 = rattrapage("R2", "2026-12-07", "2026-12-11");
    expect(periodeDeReferenceEleve([P1, P2, R2], "2026-10-28")?.id).toBe("P2");
  });
  it("un rattrapage terminé suit la règle habituelle des 30 jours", () => expect(periodeDeReferenceEleve([P1, R], "2026-11-05")?.id).toBe("R"));
  it("sans rattrapage, même résultat que pour la classe", () => {
    const P2 = classe("P2", "2027-02-01", "2027-02-26");
    for (const j of ["2026-10-12", "2026-11-10", "2026-12-01"]) expect(periodeDeReferenceEleve([P1, P2], j)?.id).toBe(periodeDeReference([P1, P2], j)?.id);
  });
});

describe("jours effectués", () => {
  it("compte les jours prévus selon les horaires (3 semaines du lundi au vendredi = 15 jours)", () => {
    expect(joursPrevus(STD, "2026-10-05", "2026-10-23")).toHaveLength(15);
  });
  it("tient compte des jours travaillés de l'élève (du mercredi au dimanche)", () => {
    expect(joursPrevus(WEEKEND, "2026-10-19", "2026-10-25")).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });
  it("retire les jours d'absence, semaine par semaine", () => {
    const b = joursEffectues(STD, "2026-10-05", "2026-10-23", [{ debut: "2026-10-12", fin: "2026-10-16" }], "2026-10-26");
    expect(b.prevus).toBe(15);
    expect(b.absences).toBe(5);
    expect(b.effectues).toBe(10);
    expect(b.semaines.map((s) => [s.lundi, s.effectues])).toEqual([["2026-10-05", 5], ["2026-10-12", 0], ["2026-10-19", 5]]);
  });
  it("ne compte pas les jours de repos d'une absence qui couvre un week-end", () => {
    expect(joursDAbsence(STD, { debut: "2026-10-09", fin: "2026-10-12" })).toBe(2);
  });
  it("les jours après la date du jour sont à venir", () => {
    const b = joursEffectues(STD, "2026-10-26", "2026-10-30", [], "2026-10-27");
    expect([b.effectues, b.aVenir]).toEqual([2, 3]);
  });
  it("une absence annoncée à l'avance compte comme absence", () => {
    const b = joursEffectues(STD, "2026-10-26", "2026-10-30", [{ debut: "2026-10-29", fin: "2026-10-29" }], "2026-10-27");
    expect([b.effectues, b.absences, b.aVenir]).toEqual([2, 1, 2]);
  });
});

describe("nombre de visites selon les heures de face à face", () => {
  const somme = (m: Map<string, number>) => [...m.values()].reduce((t, n) => t + n, 0);
  it("répartit en proportion des heures (6 h et 2 h : trois fois plus)", () => {
    const q = quotasVisites(8, [{ id: "pro", heures: 6 }, { id: "gen", heures: 2 }]);
    expect([q.get("pro"), q.get("gen")]).toEqual([6, 2]);
  });
  it("respecte toujours le nombre total de visites (plus fort reste)", () => {
    const q = quotasVisites(4, [{ id: "diallo", heures: 8 }, { id: "martin", heures: 4 }, { id: "garnier", heures: 3 }, { id: "haddou", heures: 2 }, { id: "leroy", heures: 2 }]);
    expect(somme(q)).toBe(4);
    expect(q.get("diallo")).toBe(2);
    expect(q.get("martin")).toBe(1);
    expect(q.get("garnier")).toBe(1);
  });
  it("à égalité, le professeur qui a le plus d'heures passe d'abord", () => {
    const q = quotasVisites(1, [{ id: "a", heures: 2 }, { id: "b", heures: 6 }]);
    expect(q.get("b")).toBe(1);
  });
  it("un professeur sans heure n'a pas de visite", () => {
    const q = quotasVisites(3, [{ id: "a", heures: 4 }, { id: "b", heures: 0 }]);
    expect([q.get("a"), q.get("b")]).toEqual([3, 0]);
  });
  it("sans heures saisies, personne n'a de visite", () => expect(somme(quotasVisites(5, [{ id: "a", heures: 0 }]))).toBe(0));
  it("sans stage, aucune visite", () => expect(somme(quotasVisites(0, [{ id: "a", heures: 4 }]))).toBe(0));
  it("reste exact sur de grands nombres", () => {
    const q = quotasVisites(31, [{ id: "a", heures: 3.5 }, { id: "b", heures: 1.5 }, { id: "c", heures: 7 }]);
    expect(somme(q)).toBe(31);
  });
});

describe("lecture des heures et des noms", () => {
  it("lit les écritures courantes", () => {
    expect(["6", "6,5", "6.5", "6h", "6h30", "6 h 30", "06:30", "4,25"].map(lireHeures)).toEqual([6, 6.5, 6.5, 6, 6.5, 6.5, 6.5, 4.25]);
  });
  it("refuse une valeur illisible ou hors limites", () => {
    expect(["", "six", "-2", "45"].map(lireHeures)).toEqual([null, null, null, null]);
  });
  it("compare les noms sans accents ni casse", () => expect(cleNom("  MARTIN  Hélène-Zoé ")).toBe(cleNom("martin helene zoe")));
});

describe("réglages", () => {
  it("complète un lycée créé avant l'ajout d'un réglage", () => {
    const ancien = { ...REGLAGES_PAR_DEFAUT, gestion: "ddfpt" as const } as Partial<typeof REGLAGES_PAR_DEFAUT>;
    delete ancien.repartition;
    const r = completerReglages(ancien);
    expect(r.repartition).toBe("auto");
    expect(r.gestion).toBe("ddfpt");
  });
  it("garde les règles enregistrées", () => {
    expect(completerReglages({ regles: { ...REGLAGES_PAR_DEFAUT.regles, heuresMax: 30 } }).regles.heuresMax).toBe(30);
  });
});
