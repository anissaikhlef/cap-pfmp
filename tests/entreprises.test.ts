import { describe, expect, it } from "vitest";
import { notePartenariat, type FaitsPartenariat } from "@/lib/regles";

const vide: FaitsPartenariat = { annees: 0, campagneRepondue: null, conventionsATemps: 0, conventionsTotal: 0, documentsRendus: 0, documentsAttendus: 0, avisVisites: [], soucis: 0 };

describe("note de partenariat d'une entreprise", () => {
  it("une nouvelle entreprise n'a pas encore de note", () => {
    expect(notePartenariat(vide)).toEqual({ note: null, fiable: false, raisons: ["Pas encore d'historique avec le lycée"] });
  });
  it("une entreprise qui joue le jeu est un partenaire fiable", () => {
    const r = notePartenariat({ ...vide, annees: 2, campagneRepondue: true, conventionsATemps: 3, conventionsTotal: 3, documentsRendus: 6, documentsAttendus: 6, avisVisites: ["Très satisfaisant"] });
    expect(r.note).toBe(5);
    expect(r.fiable).toBe(true);
    expect(r.raisons).toContain("Conventions signées avant le départ : 3 sur 3");
  });
  it("les documents jamais rendus font baisser la note", () => {
    const r = notePartenariat({ ...vide, annees: 1, conventionsATemps: 1, conventionsTotal: 1, documentsRendus: 0, documentsAttendus: 2 });
    expect(r.note).toBe(2.6);
    expect(r.fiable).toBe(false);
  });
  it("un souci signalé empêche d'être « partenaire fiable »", () => {
    const r = notePartenariat({ ...vide, annees: 2, campagneRepondue: true, conventionsATemps: 2, conventionsTotal: 2, documentsRendus: 4, documentsAttendus: 4, soucis: 1 });
    expect(r.fiable).toBe(false);
    expect(r.note).toBeLessThan(4);
    expect(r.raisons).toContain("1 souci signalé");
  });
  it("une campagne sans réponse ne suffit pas à noter une entreprise qui n'a encore accueilli personne", () => {
    const r = notePartenariat({ ...vide, campagneRepondue: false });
    expect(r.note).toBeNull();
    expect(r.raisons).toEqual(["Pas encore d'historique avec le lycée", "N'a pas encore répondu à la campagne de rentrée"]);
  });
  it("chaque souci retire 1,25 point sur 5", () => {
    const base = { ...vide, annees: 2, conventionsATemps: 1, conventionsTotal: 1 };
    expect(notePartenariat({ ...base, soucis: 1 }).note).toBe(3.8);
    expect(notePartenariat({ ...base, soucis: 2 }).note).toBe(2.5);
    expect(notePartenariat({ ...base, soucis: 5 }).note).toBe(0);
  });
  it("un point sans recul ne compte pas : pas encore interrogée à la campagne", () => {
    const r = notePartenariat({ ...vide, annees: 2, conventionsATemps: 1, conventionsTotal: 1 });
    expect(r.note).toBe(5);
  });
});
