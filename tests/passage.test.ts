import { describe, expect, it } from "vitest";
import { anneeSuivante, proposition } from "@/lib/passage";

describe("passage à l'année suivante", () => {
  it("calcule l'année suivante", () => expect(anneeSuivante("2026-2027")).toBe("2027-2028"));
  it("la 2nde passe en 1re", () => expect(proposition("2nde MS", "2NDE")).toEqual({ destination: "suivante", niveau: "1RE", libelle: "1re MS" }));
  it("la 1re passe en terminale", () => expect(proposition("1re MS B", "1RE").libelle).toBe("Tle MS B"));
  it("la terminale termine sa formation", () => expect(proposition("Tle MS", "TLE").destination).toBe("fin"));
  it("le CAP continue en 2e année par défaut", () => expect(proposition("CAP AS", "CAP")).toEqual({ destination: "suivante", niveau: "CAP", libelle: "CAP AS" }));
});
