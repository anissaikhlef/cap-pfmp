import { describe, expect, it } from "vitest";
import { aideDe, profilDe } from "@/lib/aide";
import { attestationPossible, MISSIONS, missionsReussies, noteQuiz, QUIZ } from "@/lib/formation";

describe("formation incluse", () => {
  it("la visite guidée suit le rôle", () => {
    expect(profilDe(["direction"])).toBe("gestion");
    expect(profilDe(["professeur", "parent"])).toBe("professeur");
    expect(profilDe(["entreprise"])).toBe("entreprise");
    expect(profilDe(["eleve"])).toBe("eleve");
  });
  it("l'aide « ? » choisit la page la plus précise", () => {
    expect(aideDe("/organisation/documents/attestation")?.titre).toBe("Modèles de documents");
    expect(aideDe("/organisation")?.titre).toBe("Organisation");
    expect(aideDe("/")?.titre).toBe("Tableau de bord");
    expect(aideDe("/inconnue")).toBeNull();
  });
  it("une mission est réussie dès qu'une de ses actions est faite", () => {
    const r = missionsReussies("vie_scolaire", new Set(["absence_signalee"]));
    expect(r).toEqual([true, false]);
  });
  it("l'attestation demande toutes les missions et le quiz réussi", () => {
    const toutes = MISSIONS.gestion!.map(() => true);
    const bonnes = QUIZ.gestion!.map((q) => q.bonne);
    expect(noteQuiz("gestion", bonnes)).toBe(5);
    expect(attestationPossible(toutes, 4)).toBe(true);
    expect(attestationPossible(toutes, 3)).toBe(false);
    expect(attestationPossible([true, false], 5)).toBe(false);
    expect(attestationPossible(toutes, null)).toBe(false);
  });
});
