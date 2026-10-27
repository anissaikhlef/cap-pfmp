import { describe, expect, it } from "vitest";
import { placeSurLaFrise, semainesDeStage } from "@/lib/regles";

describe("calendrier des PFMP", () => {
  it("compte les semaines d'une période", () => {
    expect(semainesDeStage("2026-10-05", "2026-10-23")).toBe(3);
    expect(semainesDeStage("2026-11-16", "2026-12-11")).toBe(4);
    expect(semainesDeStage("2026-10-26", "2026-10-30")).toBe(1);
  });
  const annee = { debut: "2026-09-01", fin: "2027-06-30" };
  it("place une période sur la frise de l'année", () => {
    const x = placeSurLaFrise({ debut: "2026-09-01", fin: "2026-09-30" }, annee);
    expect(x.gauche).toBe(0);
    expect(x.largeur).toBeCloseTo((30 / 303) * 100, 5);
  });
  it("une période qui dépasse la frise est coupée à son bord", () => {
    const x = placeSurLaFrise({ debut: "2027-06-21", fin: "2027-07-09" }, annee);
    expect(x.gauche + x.largeur).toBeCloseTo(100, 5);
  });
});
