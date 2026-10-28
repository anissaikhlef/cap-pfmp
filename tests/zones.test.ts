import { describe, expect, it } from "vitest";
import { sourcesZones, zonesValables, ZONE_FIXE } from "@/lib/zones";

const g = {
  attitudes: [{ critere: "Ponctualité", niveaux: ["Insuffisant", "Satisfaisant"] }],
  competences: [["Surveiller un site", "Contrôler les accès"], ["Accueillir le public"]],
  niveauxCompetences: ["Non acquise", "Acquise"],
  questions: ["L'élève est-il présent ?"],
};
const pages = [{ l: 595, h: 842 }];

describe("zones du PDF du lycée : ce que Cap PFMP peut y écrire", () => {
  it("chaque document a ses données, en plus de l'élève, de l'entreprise et du stage", () => {
    const cles = (t: Parameters<typeof sourcesZones>[0]) => sourcesZones(t, g).map((s) => s.cle);
    expect(cles("attestation")).toEqual(expect.arrayContaining(["eleve.nomPrenom", "attestation.joursEffectues", "attestation.signature"]));
    expect(cles("ordre_mission")).toEqual(expect.arrayContaining(["om.transport.vehicule", "cachet.signature", "appel.q.0.oui", "cr.att.0.1"]));
    expect(cles("convention")).toEqual(expect.arrayContaining(["horaires.lundi", "signature.eleve"]));
    expect(cles("attestation")).not.toContain("signature.eleve");
  });
  it("le livret : une case par niveau de chaque attitude et de chaque compétence (la plus longue liste des diplômes)", () => {
    const s = sourcesZones("livret", g);
    expect(s.filter((x) => x.cle.startsWith("livret.comp.") && x.sorte === "croix").map((x) => x.cle)).toEqual(["livret.comp.0.0", "livret.comp.0.1", "livret.comp.1.0", "livret.comp.1.1"]);
    expect(s.find((x) => x.cle === "livret.att.0.1")).toMatchObject({ sorte: "croix", libelle: "Ponctualité : case « Satisfaisant »" });
  });
});

describe("zones envoyées par l'éditeur", () => {
  const sources = sourcesZones("attestation", g);
  it("garde les zones valables, arrondies", () => {
    expect(zonesValables([{ page: 1, x: 50.04, y: 700, l: 200, h: 14, source: "eleve.nomPrenom" }, { page: 1, x: 50, y: 600, l: 100, h: 14, source: ZONE_FIXE, fixe: " Paris " }], sources, pages))
      .toEqual([{ page: 1, x: 50, y: 700, l: 200, h: 14, source: "eleve.nomPrenom" }, { page: 1, x: 50, y: 600, l: 100, h: 14, source: "fixe", fixe: "Paris" }]);
  });
  it("refuse une page absente, une zone hors de la page, une donnée d'un autre document ou un texte fixe vide", () => {
    expect(zonesValables([{ page: 2, x: 0, y: 0, l: 10, h: 10, source: "eleve.nom" }], sources, pages)).toMatch(/page qui n'existe pas/);
    expect(zonesValables([{ page: 1, x: 590, y: 0, l: 50, h: 10, source: "eleve.nom" }], sources, pages)).toMatch(/dépasse/);
    expect(zonesValables([{ page: 1, x: 0, y: 0, l: 50, h: 10, source: "signature.eleve" }], sources, pages)).toMatch(/Choisissez/);
    expect(zonesValables([{ page: 1, x: 0, y: 0, l: 50, h: 10, source: "fixe", fixe: " " }], sources, pages)).toMatch(/texte fixe/);
    expect(zonesValables("n'importe quoi", sources, pages)).toMatch(/illisibles/);
  });
});
