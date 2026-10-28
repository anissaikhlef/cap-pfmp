import { describe, expect, it } from "vitest";
import { jourDuCarnetValable, ouvertureFinDeStage, statutAttestation } from "@/lib/regles";
import { competencesDe, lireCompetences, lireNiveaux, niveauxRetenus } from "@/lib/modeles";

describe("attestation de stage en ligne", () => {
  it("s'ouvre quelques jours avant la fin du stage, pour la remplir avec l'élève encore présent", () => {
    expect(ouvertureFinDeStage("2026-10-05", "2026-10-23", 2)).toBe("2026-10-21");
    expect(ouvertureFinDeStage("2026-10-05", "2026-10-23", 0)).toBe("2026-10-23");
  });
  it("jamais avant le début du stage", () => {
    expect(ouvertureFinDeStage("2026-10-26", "2026-10-30", 7)).toBe("2026-10-26");
  });
  it("est validée d'office quand le tuteur déclare les mêmes jours que Cap PFMP", () => {
    expect(statutAttestation({ effectues: 14, absences: 1 }, { effectues: 14, absences: 1 })).toBe("valide");
  });
  it("sinon, la gestion des PFMP vérifie l'écart", () => {
    expect(statutAttestation({ effectues: 13, absences: 2 }, { effectues: 14, absences: 1 })).toBe("a_verifier");
    expect(statutAttestation({ effectues: 15, absences: 0 }, { effectues: 15, absences: 1 })).toBe("a_verifier");
  });
});

describe("livret de compétences en ligne", () => {
  it("lit les compétences d'un diplôme, une par ligne", () => {
    expect(lireCompetences(" Surveiller un site \n\nContrôler les accès\n")).toEqual(["Surveiller un site", "Contrôler les accès"]);
  });
  it("lit les niveaux séparés par « / », au moins deux", () => {
    expect(lireNiveaux("Non acquise / En cours / Acquise")).toEqual(["Non acquise", "En cours", "Acquise"]);
    expect(lireNiveaux("Acquise")).toBeNull();
  });
  it("trouve les compétences du diplôme de la classe", () => {
    const p = { competences: [{ filiere: "Bac Pro Métiers de la sécurité", liste: ["Surveiller un site"] }] };
    expect(competencesDe(p, "Bac Pro Métiers de la sécurité")).toEqual(["Surveiller un site"]);
    expect(competencesDe(p, "CAP Agent de sécurité")).toEqual([]);
    expect(competencesDe(p, null)).toEqual([]);
  });
  it("demande un niveau pour chaque ligne, parmi ceux proposés", () => {
    const grille = [{ libelle: "Ponctualité", niveaux: ["Insuffisant", "Satisfaisant"] }, { libelle: "Sociabilité", niveaux: ["Insuffisant", "Satisfaisant"] }];
    expect(niveauxRetenus(grille, ["Satisfaisant", "Insuffisant"])).toEqual([{ libelle: "Ponctualité", niveau: "Satisfaisant" }, { libelle: "Sociabilité", niveau: "Insuffisant" }]);
    expect(niveauxRetenus(grille, ["Satisfaisant", null])).toBeNull();
    expect(niveauxRetenus(grille, ["Satisfaisant", "Excellent"])).toBeNull();
  });
});

describe("carnet de bord de l'élève", () => {
  it("un jour du stage, passé ou en cours", () => {
    expect(jourDuCarnetValable("2026-10-26", "2026-10-19", "2026-11-13", "2026-10-26")).toBe(true);
    expect(jourDuCarnetValable("2026-10-19", "2026-10-19", "2026-11-13", "2026-10-26")).toBe(true);
  });
  it("jamais un jour à venir, ni hors du stage", () => {
    expect(jourDuCarnetValable("2026-10-27", "2026-10-19", "2026-11-13", "2026-10-26")).toBe(false);
    expect(jourDuCarnetValable("2026-10-16", "2026-10-19", "2026-11-13", "2026-10-26")).toBe(false);
    expect(jourDuCarnetValable("26/10/2026", "2026-10-19", "2026-11-13", "2026-10-26")).toBe(false);
  });
});
