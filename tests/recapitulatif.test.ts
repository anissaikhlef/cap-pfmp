import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dureeDuCycle, regrouperPfmp, semainesAttendues, semainesDeJours, semainesParDefaut, sessionDExamen, texteDuree, titreDuDiplome } from "@/lib/regles";
import { casesManquantes, ecrireCase, jourExcel, lireZip, ouvrirClasseur, remplirRecapitulatif, reperer } from "@/lib/xlsx-modele";
import { classeurXlsx } from "@/lib/xlsx";

const MODELE = readFileSync("scripts/modeles/attestation-recapitulative-academie.xlsx");

describe("attestation récapitulative : règles (décisions d'Anissa)", () => {
  it("semaines attendues : bac pro 20 en 3 ans, 15 en 2 ans ; CAP 12", () => {
    expect(semainesParDefaut("Bac Pro Métiers de la sécurité")).toEqual({ "2": 15, "3": 20 });
    expect(semainesParDefaut("CAP Agent de sécurité")).toEqual({ "2": 12 });
    expect(semainesAttendues(null, "Bac pro CIEL", 2)).toBe(15);
    expect(semainesAttendues({ "3": 22 }, "Bac pro CIEL", 3)).toBe(22);
    expect(semainesAttendues(null, "BTS Tourisme", 2)).toBeNull();
  });
  it("durée du cycle : celle de l'élève, sinon de la formation, sinon 2 ans en CAP et 3 ans ailleurs", () => {
    expect(dureeDuCycle(2, 3, "Bac pro", "TLE")).toBe(2);
    expect(dureeDuCycle(null, 1, "CAP", "CAP")).toBe(1);
    expect(dureeDuCycle(null, null, "CAP Agent de sécurité", "CAP")).toBe(2);
    expect(dureeDuCycle(null, null, "Bac pro", "TLE")).toBe(3);
    expect([1, 2, 3].map(texteDuree)).toEqual(["1 an", "2 ans", "3 ans"]);
  });
  it("session, titre du diplôme, semaines", () => {
    expect(sessionDExamen("2026-2027")).toBe("2027");
    expect(titreDuDiplome("Bac Pro Métiers de la sécurité")).toBe("Baccalauréat professionnel Métiers de la sécurité");
    expect(titreDuDiplome("CAP Agent de sécurité")).toBe("CAP Agent de sécurité");
    expect(semainesDeJours(20)).toBe(4);
    expect(semainesDeJours(23)).toBe(4.6);
  });
  it("au-delà des lignes prévues, les dernières PFMP sont regroupées et le total reste juste", () => {
    const p = [1, 2, 3, 4].map((i) => ({ debut: `2026-0${i}-01`, fin: `2026-0${i}-20`, entreprise: `E${i}\nadresse`, jours: 10 * i }));
    expect(regrouperPfmp(p, 4)).toEqual(p);
    const r = regrouperPfmp(p, 3);
    expect(r).toHaveLength(3);
    expect(r[2]).toEqual({ debut: "2026-03-01", fin: "2026-04-20", entreprise: "E3 ; E4", jours: 70 });
    expect(r.reduce((t, x) => t + x.jours, 0)).toBe(100);
  });
});

describe("le fichier Excel de l'académie", () => {
  it("ses cases sont reconnues d'après leurs intitulés", () => {
    const s = reperer(ouvrirClasseur(MODELE));
    expect(s.feuillesEleves).toHaveLength(30);
    expect(s.cases).toEqual({ titre: "A1", academie: "B3", session: "E3", etablissement: "A6", nom: "D6", prenom: "E6", numero: "D8", duree: "C8", derogation: "C10", visa: "B7" });
    expect(s.lignes).toEqual({ premiere: 13, nombre: 5, debut: "A", fin: "B", entreprise: "C", jours: "D" });
    expect(s.synthese).toMatchObject({ premiere: 2, numero: "B", nom: "C", prenom: "D" });
    expect(s.garde).toMatchObject({ premiere: 7, numero: "A", nom: "B", prenom: "C", semaines: "D", duree: "E", derogation: "F", observations: "G", etablissement: "C3" });
    expect(casesManquantes(s)).toEqual([]);
  });
  it("une case est écrite en gardant son style ; une formule n'est jamais remplacée", () => {
    const xml = `<sheetData><row r="2"><c r="A2" s="4"><v>1</v></c><c r="C2"><f>A2*2</f><v>2</v></c></row></sheetData>`;
    expect(ecrireCase(xml, "A2", "Nom & co")).toContain(`<c r="A2" s="4" t="inlineStr"><is><t xml:space="preserve">Nom &amp; co</t></is></c>`);
    expect(ecrireCase(xml, "C2", 5)).toBe(xml);
    expect(ecrireCase(xml, "B2", 7)).toContain(`<c r="A2" s="4"><v>1</v></c><c r="B2"><v>7</v></c><c r="C2">`);
    expect(ecrireCase(xml, "A5", 3)).toContain(`</row><row r="5"><c r="A5"><v>3</v></c></row></sheetData>`);
  });
  it("il est rempli sans perdre ses onglets ni ses formules, et se recalcule à l'ouverture", () => {
    const s = reperer(ouvrirClasseur(MODELE));
    const pfmp = [{ debut: jourExcel("2025-11-17"), fin: jourExcel("2025-12-12"), entreprise: "Atlas Sûreté\nIssy", jours: 20 }];
    const b = remplirRecapitulatif(MODELE, s, { titre: "Bac pro test", academie: "VERSAILLES", session: "2027", etablissement: "Lycée fictif", candidats: [
      { numero: "0269990001", nom: "DUPONT", prenom: "Léa", duree: "3 ans", derogation: true, visa: true, pfmp, semaines: 4, attendues: 20 },
    ] });
    const c = ouvrirClasseur(b);
    const f = (n: string) => c.feuilles.find((x) => x.nom === n)!.cellules;
    expect(c.feuilles.map((x) => x.nom)).toEqual(ouvrirClasseur(MODELE).feuilles.map((x) => x.nom));
    expect(f("synthese ").get("C2")?.valeur).toBe("DUPONT");
    expect(f("ELEVE 1").get("A1")?.valeur).toBe("BAC PRO TEST");
    expect(f("ELEVE 1").get("B7")?.valeur).toBe("X");
    expect(f("ELEVE 1").get("C10")?.valeur).toBe("OUI");
    expect(f("ELEVE 1").get("A13")?.valeur).toBe(String(jourExcel("2025-11-17")));
    expect(f("ELEVE 1").get("D6")?.formule).toBe(true);
    expect(f("ELEVE 2").get("B3")?.formule).toBe(true);
    expect(f("PAGE DE GARDE ").get("G7")?.valeur).toBe("16 semaine(s) manquante(s) sur 20");
    const z = lireZip(b);
    expect(z.get("xl/workbook.xml")!.toString()).toContain(`fullCalcOnLoad="1"`);
    expect(z.has("xl/calcChain.xml")).toBe(false);
  });
  it("refuse une classe plus grande que le modèle", () => {
    const s = reperer(ouvrirClasseur(MODELE));
    const un = { numero: "", nom: "X", prenom: "Y", duree: "3 ans", derogation: false, visa: false, pfmp: [], semaines: 0, attendues: 20 };
    expect(() => remplirRecapitulatif(MODELE, s, { titre: "", academie: "", session: "2027", etablissement: "", candidats: Array(31).fill(un) })).toThrow(/30 élèves au plus/);
  });
  it("jours d'Excel", () => expect(jourExcel("2026-10-26")).toBe(46321));
});

describe("classeur de plusieurs onglets", () => {
  it("un onglet par liste, aux noms distincts", () => {
    const f = { titre: "Liste", sousTitre: "", colonnes: ["A"], lignes: [["1"]] };
    const t = new TextDecoder().decode(classeurXlsx([{ ...f, onglet: "Synthèse" }, { ...f, onglet: "Synthèse" }]));
    expect(t).toContain(`<sheet name="Synthèse" sheetId="1" r:id="rId1"/><sheet name="Synthèse (2)" sheetId="2" r:id="rId2"/>`);
    expect(t).toContain("xl/worksheets/sheet2.xml");
  });
});
