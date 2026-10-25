import { describe, expect, it } from "vitest";
import { lireCsv, lireDate, normaliserEntete } from "@/lib/csv";

describe("CSV", () => {
  it("détecte le point-virgule et gère les guillemets", () => {
    expect(lireCsv('nom;prenom\n"Haddad; née X";Inès\n')).toEqual([["nom", "prenom"], ["Haddad; née X", "Inès"]]);
  });
  it("détecte la virgule et ignore les lignes vides", () => {
    expect(lireCsv("a,b\r\n\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("normalise les entêtes", () => expect(normaliserEntete("Date de naissance")).toBe("date_de_naissance"));
  it("lit les dates françaises", () => expect(lireDate("4/3/2009")).toBe("2009-03-04"));
  it("refuse une date illisible", () => expect(lireDate("mars 2009")).toBeNull());
});
