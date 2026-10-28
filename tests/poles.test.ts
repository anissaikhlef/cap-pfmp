import { describe, expect, it } from "vitest";
import { completerReglages } from "@/db/schema";
import { concerneLEleve, rangsDesPeriodes } from "@/lib/periodes";
import { professeurAutorise, quiPeutVisiter } from "@/lib/regles";
import { repartir } from "@/lib/repartition";

describe("dates de PFMP par spécialité (décision d'Anissa)", () => {
  const eleve = { id: "e1", dominanteId: "surete" };
  it("un élève suit les périodes de toute sa classe, celles de sa spécialité et ses rattrapages", () => {
    expect(concerneLEleve({ eleveId: null, dominanteId: null }, eleve)).toBe(true);
    expect(concerneLEleve({ eleveId: null, dominanteId: "surete" }, eleve)).toBe(true);
    expect(concerneLEleve({ eleveId: null, dominanteId: "incendie" }, eleve)).toBe(false);
    expect(concerneLEleve({ eleveId: "e1", dominanteId: null }, eleve)).toBe(true);
    expect(concerneLEleve({ eleveId: "e2", dominanteId: null }, eleve)).toBe(false);
    expect(concerneLEleve({ eleveId: null, dominanteId: "surete" }, { id: "e3", dominanteId: null })).toBe(false);
  });
  it("le rang d'une période se compte pour son groupe (toute la classe, ou la spécialité avec la classe)", () => {
    const r = rangsDesPeriodes([
      { id: "p1", debut: "2026-10-05", dominanteId: null },
      { id: "s1", debut: "2027-01-11", dominanteId: "surete" },
      { id: "i1", debut: "2027-03-08", dominanteId: "incendie" },
      { id: "r1", debut: "2027-04-01", eleveId: "e1" },
    ]);
    expect(r.get("p1")).toEqual({ rang: 0, nombre: 3 });
    expect(r.get("s1")).toEqual({ rang: 1, nombre: 2 });
    expect(r.get("i1")).toEqual({ rang: 1, nombre: 2 });
    expect(r.has("r1")).toBe(false);
  });
});

describe("qui visite quoi, selon le lycée", () => {
  const anissa = { premiere: "pro", derniere: "general", autres: "tous", examen: "pro" } as const;
  it("première période, dernière, autres, et classes d'examen d'abord", () => {
    expect(quiPeutVisiter(anissa, { examen: false, rang: 0, nombre: 3 })).toBe("pro");
    expect(quiPeutVisiter(anissa, { examen: false, rang: 2, nombre: 3 })).toBe("general");
    expect(quiPeutVisiter(anissa, { examen: false, rang: 1, nombre: 3 })).toBe("tous");
    expect(quiPeutVisiter(anissa, { examen: true, rang: 2, nombre: 3 })).toBe("pro");
    // Une seule période dans l'année : c'est la première.
    expect(quiPeutVisiter(anissa, { examen: false, rang: 0, nombre: 1 })).toBe("pro");
  });
  it("enseignement professionnel, général, ou toute l'équipe", () => {
    expect(professeurAutorise("pro", { enseignementPro: true })).toBe(true);
    expect(professeurAutorise("pro", { enseignementPro: false })).toBe(false);
    expect(professeurAutorise("general", { enseignementPro: false })).toBe(true);
    expect(professeurAutorise("general", { enseignementPro: true })).toBe(false);
    expect(professeurAutorise("tous", { enseignementPro: false })).toBe(true);
  });
  it("un lycée réglé avant garde son choix (« enseignement professionnel » ou « toute l'équipe »)", () => {
    expect(completerReglages({ visiteurs: "pro" } as never).quiVisite).toEqual({ premiere: "pro", derniere: "pro", autres: "pro", examen: "pro" });
    expect(completerReglages({ visiteurs: "equipe" } as never).quiVisite.examen).toBe("tous");
  });
  it("la répartition automatique respecte les règles du lycée", () => {
    const liste = [
      { stageId: "a", entrepriseId: "x", periodeId: "exam", referentId: "general1", visiteurId: null },
      { stageId: "b", entrepriseId: "y", periodeId: "autre", referentId: null, visiteurId: null },
    ];
    const pro = new Set(["pro1"]);
    const res = repartir(liste, ["general1", "pro1"], 1, (x, v) => x.periodeId !== "exam" || pro.has(v));
    expect(res.get("a")).toBe("pro1");
    expect(res.get("b")).toBe("general1");
  });
});
