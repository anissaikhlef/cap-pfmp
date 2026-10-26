import { describe, expect, it } from "vitest";
import { dateProposee, repartir, type AVisiter } from "@/lib/repartition";

const s = (id: string, ent: string, ref: string | null, v: string | null = null, per = "P1"): AVisiter =>
  ({ stageId: id, entrepriseId: ent, periodeId: per, referentId: ref, visiteurId: v });

describe("répartition des visites", () => {
  it("donne la visite au référent quand il n'est pas surchargé", () => {
    expect(repartir([s("1", "A", "martin")], ["martin", "benali"]).get("1")).toBe("martin");
  });
  it("regroupe les élèves d'une même entreprise", () => {
    const r = repartir([s("1", "A", "martin"), s("2", "A", "benali")], ["martin", "benali"]);
    expect(r.get("1")).toBe(r.get("2"));
  });
  it("ne regroupe pas deux périodes différentes", () => {
    const r = repartir([s("1", "A", "martin", null, "P1"), s("2", "A", "benali", null, "P2")], ["martin", "benali"]);
    expect(r.get("2")).toBe("benali");
  });
  it("équilibre la charge quand le référent est surchargé", () => {
    const liste = [s("1", "A", "martin"), s("2", "B", "martin"), s("3", "C", "martin"), s("4", "D", "martin")];
    const r = repartir(liste, ["martin", "benali"]);
    const nMartin = [...r.values()].filter((v) => v === "martin").length;
    expect(nMartin).toBeLessThanOrEqual(3);
    expect([...r.values()].filter((v) => v === "benali").length).toBeGreaterThanOrEqual(1);
  });
  it("tient compte des visites déjà attribuées", () => {
    const r = repartir([s("1", "A", null, "martin"), s("2", "B", null, "martin"), s("3", "C", null)], ["martin", "benali"]);
    expect(r.get("3")).toBe("benali");
    expect(r.has("1")).toBe(false);
  });
  it("ignore un référent qui ne fait pas partie des visiteurs", () => {
    expect(repartir([s("1", "A", "garnier")], ["martin"]).get("1")).toBe("martin");
  });
  it("ne fait rien sans visiteur", () => expect(repartir([s("1", "A", null)], []).size).toBe(0));
});

describe("date de visite proposée", () => {
  it("prend le milieu de la période (samedi 28 → lundi 30)", () => expect(dateProposee("2026-11-16", "2026-12-11", "2026-10-26")).toBe("2026-11-30"));
  it("évite le week-end", () => expect(dateProposee("2026-11-14", "2026-11-15", "2026-10-26")).toBe("2026-11-16"));
  it("ne propose pas une date passée", () => expect(dateProposee("2026-10-01", "2026-10-31", "2026-10-26")).toBe("2026-10-28"));
});
