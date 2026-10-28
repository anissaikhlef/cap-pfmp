import { describe, expect, it } from "vitest";
import { listePermise, NOMS_LISTES, nomDeFichier, semainesEntre } from "@/lib/listes-def";

describe("listes exportables (décision d'Anissa)", () => {
  it("le DDFPT et la direction exportent tout", () => {
    expect(NOMS_LISTES.every((l) => listePermise(l, { gestion: true, professeur: false }))).toBe(true);
  });
  it("le professeur exporte tout sauf les RIB", () => {
    expect(listePermise("rib", { gestion: false, professeur: true })).toBe(false);
    expect(NOMS_LISTES.filter((l) => l !== "rib").every((l) => listePermise(l, { gestion: false, professeur: true }))).toBe(true);
  });
  it("les autres comptes n'exportent rien", () => {
    expect(NOMS_LISTES.some((l) => listePermise(l, { gestion: false, professeur: false }))).toBe(false);
  });
  it("durée en semaines et nom de fichier", () => {
    expect(semainesEntre("2026-10-19", "2026-11-13")).toBe(4);
    expect(semainesEntre("2026-10-19", "2026-10-19")).toBe(1);
    expect(nomDeFichier("Lieux de stage", "Tle MS", "2026-2027")).toBe("lieux-de-stage-tle-ms-2026-2027");
  });
});
