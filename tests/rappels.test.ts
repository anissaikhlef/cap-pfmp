import { describe, expect, it } from "vitest";
import { estJourOuvre, jourDeRelance, prochainJourOuvre, relanceCyclique, relanceHebdomadaireDue, tachesEleve } from "@/lib/regles";

// Le lundi 26 octobre 2026, date des parcours de test
const LUNDI = "2026-10-26";

describe("jamais de rappel le week-end", () => {
  it("du lundi au vendredi seulement", () => {
    expect([LUNDI, "2026-10-30", "2026-10-31", "2026-11-01"].map(estJourOuvre)).toEqual([true, true, false, false]);
  });
  it("une date de week-end est reportée au lundi", () => {
    expect(prochainJourOuvre("2026-10-31")).toBe("2026-11-02");
    expect(prochainJourOuvre("2026-10-30")).toBe("2026-10-30");
  });
  it("une relance prévue un dimanche part le lundi", () => {
    // Stage le mercredi 4 novembre : 7 jours avant = mercredi 28 octobre, 3 jours avant = dimanche 1er novembre
    const dates = ["2026-10-28", "2026-11-01"];
    expect(jourDeRelance("2026-10-28", dates)).toBe(true);
    expect(jourDeRelance("2026-11-01", dates)).toBe(false);
    expect(jourDeRelance("2026-11-02", dates)).toBe(true);
  });
  it("pas de relance hebdomadaire des familles le week-end", () => {
    expect(relanceHebdomadaireDue([], "2026-10-31", 3)).toBe(false);
  });
});

describe("rappel d'une entreprise tous les 3 jours, 5 fois au plus", () => {
  const cycle = { jour: LUNDI, intervalle: 3, max: 5 };
  it("relance 3 jours après l'envoi, puis 3 jours après le dernier rappel", () => {
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-23", dejaEnvoyees: [] })).toBe("relancer");
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-12", dejaEnvoyees: ["2026-10-23"] })).toBe("relancer");
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-12", dejaEnvoyees: ["2026-10-24"] })).toBeNull();
  });
  it("attend 3 jours après l'envoi", () => {
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-24", dejaEnvoyees: [] })).toBeNull();
  });
  it("jamais le week-end", () => {
    expect(relanceCyclique({ ...cycle, jour: "2026-10-31", depuis: "2026-10-12", dejaEnvoyees: [] })).toBeNull();
  });
  it("après 5 rappels sans réponse, le lycée doit appeler", () => {
    const cinq = ["2026-10-08", "2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"];
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-05", dejaEnvoyees: cinq })).toBe("appeler");
    expect(relanceCyclique({ ...cycle, depuis: "2026-10-05", dejaEnvoyees: [...cinq.slice(1), LUNDI] })).toBeNull();
  });
  it("0 jour : pas de rappel", () => {
    expect(relanceCyclique({ ...cycle, intervalle: 0, depuis: "2026-10-12", dejaEnvoyees: [] })).toBeNull();
  });
});

describe("rappel quotidien de l'élève", () => {
  const pfmp = { id: "p1", libelle: "PFMP 1", debut: "2026-11-16", fin: "2026-12-11" };
  const base = { jour: LUNDI, rechercheJours: 30, signatureEnLigne: true, aUnCv: true, periodes: [pfmp], stages: [], demarchesEnAttente: [] };
  it("sans lieu de stage, à moins de 30 jours du départ : trouver son stage", () => {
    expect(tachesEleve(base)).toEqual(["Trouver votre lieu de stage : PFMP 1, du 16 novembre 2026 au 11 décembre 2026 (dans 21 jours)."]);
  });
  it("trop tôt : pas encore de rappel pour la recherche", () => {
    expect(tachesEleve({ ...base, rechercheJours: 14 })).toEqual([]);
  });
  it("rappelle les entreprises sans réponse depuis 7 jours et le CV à déposer", () => {
    const t = tachesEleve({ ...base, aUnCv: false, demarchesEnAttente: [{ entreprise: "Atlas Sûreté", date: "2026-10-16" }, { entreprise: "Évent'Sûr", date: "2026-10-22" }] });
    expect(t).toContain("  · Relancer Atlas Sûreté, contactée le 16 octobre 2026 et toujours sans réponse.");
    expect(t.join(" ")).not.toContain("Évent'Sûr");
    expect(t).toContain("  · Déposer votre CV : votre professeur référent pourra le relire.");
  });
  it("avec un lieu de stage : signer sa convention, tant qu'il ne l'a pas fait", () => {
    const stage = { periodeId: "p1", entreprise: "Atlas Sûreté", signeeParLEleve: false };
    expect(tachesEleve({ ...base, stages: [stage] })).toEqual(["Signer votre convention de stage chez Atlas Sûreté."]);
    expect(tachesEleve({ ...base, stages: [{ ...stage, signeeParLEleve: true }] })).toEqual([]);
    expect(tachesEleve({ ...base, stages: [stage], signatureEnLigne: false })).toEqual([]);
  });
  it("une période terminée ne demande plus rien", () => {
    expect(tachesEleve({ ...base, periodes: [{ ...pfmp, debut: "2026-10-05", fin: "2026-10-23" }] })).toEqual([]);
  });
});
