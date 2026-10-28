import { describe, expect, it } from "vitest";
import { classeurXlsx, dateExcel, lettre, nomDOnglet } from "@/lib/xlsx";

describe("fichiers Excel .xlsx (décision d'Anissa)", () => {
  it("lettres des colonnes", () => {
    expect([0, 25, 26, 27, 701, 702].map(lettre)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("les dates jj/mm/aaaa deviennent des dates d'Excel", () => {
    expect(dateExcel("01/01/1900")).toBe(2);
    expect(dateExcel("26/10/2026")).toBe(46321);
    expect(dateExcel("en cours")).toBeNull();
  });
  it("nom d'onglet accepté par Excel", () => {
    const n = nomDOnglet("RIB et pièces d'identité : 2026/2027 [classe]");
    expect(n.length).toBeLessThanOrEqual(31);
    expect(n).not.toMatch(/[:\\/?*[\]]/);
    expect(n.startsWith("RIB et pièces d'identité")).toBe(true);
  });
  it("une archive ZIP lisible, avec ses fichiers et le texte échappé", () => {
    const b = classeurXlsx({ titre: "Liste", sousTitre: "Lycée", colonnes: ["A & B"], lignes: [["<x>"]] });
    expect(String.fromCharCode(b[0], b[1])).toBe("PK");
    const texte = new TextDecoder().decode(b);
    expect(texte).toContain("xl/worksheets/sheet1.xml");
    expect(texte).toContain("A &amp; B");
    expect(texte).toContain("&lt;x&gt;");
    expect(texte).not.toContain("<x>");
  });
});
