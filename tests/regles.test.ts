import { describe, expect, it } from "vitest";
import { heuresHebdo, plusLongRepos, statutEleve, toucheLaNuit, verifierStage } from "@/lib/regles";
import { REGLAGES_PAR_DEFAUT, type Horaires } from "@/db/schema";

const R = REGLAGES_PAR_DEFAUT.regles;
const STD: Horaires = [["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "12:00"], null, null];
const TOUT_SIGNE = Object.fromEntries(["eleve", "parent", "professeur", "entreprise", "direction"].map((k) => [k, { le: "2026-10-01", par: null, mode: "papier" }]));

function ctx(h: Horaires, extra: Partial<Parameters<typeof verifierStage>[0]> = {}) {
  return verifierStage({ horaires: h, regleStructure: "libre", secteurEntreprise: "prive", domaineEntreprise: null, dominanteEleve: null, signatures: TOUT_SIGNE, ...extra }, R);
}
const ok = (res: ReturnType<typeof ctx>, code: string) => res.find((r) => r.code === code)?.ok;

describe("durée hebdomadaire", () => {
  it("compte 32 h pour un horaire standard", () => expect(heuresHebdo(STD)).toBe(32));
  it("refuse moins de 25 h", () => expect(ok(ctx([["09:00", "12:00"], null, null, null, null, null, null]), "duree")).toBe(false));
  it("refuse plus de 35 h", () => expect(ok(ctx([["08:00", "16:00"], ["08:00", "16:00"], ["08:00", "16:00"], ["08:00", "16:00"], ["08:00", "16:00"], null, null]), "duree")).toBe(false));
  it("accepte exactement 35 h", () => expect(ok(ctx([["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], null, null]), "duree")).toBe(true));
});

describe("travail de nuit", () => {
  it("accepte 08:00–15:00", () => expect(toucheLaNuit(["08:00", "15:00"], "22:00", "06:00")).toBe(false));
  it("refuse une fin à 22:30", () => expect(toucheLaNuit(["14:00", "22:30"], "22:00", "06:00")).toBe(true));
  it("accepte une fin à 22:00 pile", () => expect(toucheLaNuit(["14:00", "22:00"], "22:00", "06:00")).toBe(false));
  it("refuse un début à 05:30", () => expect(toucheLaNuit(["05:30", "12:00"], "22:00", "06:00")).toBe(true));
  it("accepte un début à 06:00 pile", () => expect(toucheLaNuit(["06:00", "12:00"], "22:00", "06:00")).toBe(false));
  it("refuse une plage qui passe minuit", () => expect(toucheLaNuit(["20:00", "02:00"], "22:00", "06:00")).toBe(true));
});

describe("dimanche et repos", () => {
  it("refuse le dimanche", () => expect(ok(ctx([null, null, ["09:00", "16:00"], ["09:00", "16:00"], ["09:00", "16:00"], ["10:00", "17:00"], ["10:00", "16:00"]]), "dimanche")).toBe(false));
  it("trouve deux jours consécutifs samedi-dimanche", () => expect(plusLongRepos(STD)).toBe(2));
  it("compte dimanche puis lundi comme consécutifs", () => expect(plusLongRepos([null, ["8:00", "15:00"], ["8:00", "15:00"], ["8:00", "15:00"], ["8:00", "15:00"], ["8:00", "15:00"], null])).toBe(2));
  it("refuse deux repos non consécutifs", () => expect(ok(ctx([["08:00", "15:00"], null, ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "12:00"], null]), "repos")).toBe(false));
});

describe("structure et dominante", () => {
  it("exige le privé quand la règle le demande", () => expect(ok(ctx(STD, { regleStructure: "prive", secteurEntreprise: "public" }), "structure")).toBe(false));
  it("compare la dominante sans tenir compte de la casse", () => expect(ok(ctx(STD, { regleStructure: "dominante", domaineEntreprise: "Sécurité incendie", dominanteEleve: "sécurité incendie" }), "dominante")).toBe(true));
  it("refuse une autre dominante", () => expect(ok(ctx(STD, { regleStructure: "dominante", domaineEntreprise: "Sécurité publique", dominanteEleve: "Sécurité incendie" }), "dominante")).toBe(false));
  it("refuse si la dominante de l'élève manque", () => expect(ok(ctx(STD, { regleStructure: "dominante", domaineEntreprise: "Sécurité publique" }), "dominante")).toBe(false));
});

describe("convention", () => {
  it("n'exige pas le responsable légal pour un majeur", () => {
    const { parent: _p, ...sansParent } = TOUT_SIGNE;
    expect(ok(ctx(STD, { signatures: sansParent, signatairesRequis: ["eleve", "professeur", "entreprise", "direction"] }), "convention")).toBe(true);
  });
  it("signale une convention incomplète", () => expect(ok(ctx(STD, { signatures: {} }), "convention")).toBe(false));
});

describe("statut", () => {
  const base = { debut: "2026-11-16", fin: "2026-12-11", aUnStage: true, conventionComplete: true, attestationValidee: false, livretValide: false };
  it("sans stage", () => expect(statutEleve({ ...base, aujourdhui: "2026-10-26", aUnStage: false })).toBe("sans_stage"));
  it("prêt à partir", () => expect(statutEleve({ ...base, aujourdhui: "2026-10-26" })).toBe("pret"));
  it("en stage le premier jour", () => expect(statutEleve({ ...base, aujourdhui: "2026-11-16" })).toBe("en_stage"));
  it("en stage le dernier jour", () => expect(statutEleve({ ...base, aujourdhui: "2026-12-11" })).toBe("en_stage"));
  it("documents à rendre après la fin", () => expect(statutEleve({ ...base, aujourdhui: "2026-12-12" })).toBe("documents"));
  it("alerte si en stage sans convention", () => expect(statutEleve({ ...base, aujourdhui: "2026-11-20", conventionComplete: false })).toBe("en_stage_sans_convention"));
  it("terminé quand tout est validé", () => expect(statutEleve({ ...base, aujourdhui: "2026-12-20", attestationValidee: true, livretValide: true })).toBe("termine"));
});
