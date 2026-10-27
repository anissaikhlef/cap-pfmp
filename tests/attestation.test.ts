import { describe, expect, it } from "vitest";
import { ouvertureAttestation, statutAttestation } from "@/lib/regles";

describe("attestation de stage en ligne", () => {
  it("s'ouvre quelques jours avant la fin du stage, pour la remplir avec l'élève encore présent", () => {
    expect(ouvertureAttestation("2026-10-05", "2026-10-23", 2)).toBe("2026-10-21");
    expect(ouvertureAttestation("2026-10-05", "2026-10-23", 0)).toBe("2026-10-23");
  });
  it("jamais avant le début du stage", () => {
    expect(ouvertureAttestation("2026-10-26", "2026-10-30", 7)).toBe("2026-10-26");
  });
  it("est validée d'office quand le tuteur déclare les mêmes jours que Cap PFMP", () => {
    expect(statutAttestation({ effectues: 14, absences: 1 }, { effectues: 14, absences: 1 })).toBe("valide");
  });
  it("sinon, la gestion des PFMP vérifie l'écart", () => {
    expect(statutAttestation({ effectues: 13, absences: 2 }, { effectues: 14, absences: 1 })).toBe("a_verifier");
    expect(statutAttestation({ effectues: 15, absences: 0 }, { effectues: 15, absences: 1 })).toBe("a_verifier");
  });
});
