import { describe, expect, it } from "vitest";
import { CATALOGUE, MESURES, mesuresDe, resteARemettre, tailleDe, tailleValide, taillesManquantes, totauxCommande, type Article } from "@/lib/tenues-def";

const art = (id: string, libelle: string, mesure: Article["mesure"], quantite = 1): Article => ({ id, libelle, categorie: "tenue", mesure, quantite });
const polo = art("p", "Polo", "haut", 2), pantalon = art("b", "Pantalon de travail", "bas"), chaussures = art("c", "Chaussures de sécurité", "pointure"), lampe = art("l", "Lampe torche", null);

describe("tenues et matériel (décisions d'Anissa)", () => {
  it("une liste préremplie complète, sans doublon", () => {
    const codes = CATALOGUE.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of ["Polo", "Pantalon de travail", "Blouse", "Parka", "Ceinture", "Chaussures de sécurité", "Boîte à outils"]) expect(CATALOGUE.some((x) => x.libelle === l)).toBe(true);
  });
  it("tailles en lettres ou en chiffres, pointures", () => {
    expect(MESURES.haut.valeurs).toEqual(expect.arrayContaining(["XS", "S", "M", "L", "XL", "XXL", "34", "36", "38", "60"]));
    expect(tailleValide("pointure", "42")).toBe(true);
    expect(tailleValide("pointure", "XL")).toBe(false);
    expect(tailleValide("bas", "38")).toBe(true);
  });
  it("les tailles à demander et celles qui manquent", () => {
    expect(mesuresDe([lampe, chaussures, polo, pantalon])).toEqual(["haut", "bas", "pointure"]);
    expect(taillesManquantes([polo, chaussures, lampe], { haut: "M" })).toEqual(["pointure"]);
    expect(tailleDe(polo, { haut: "M" })).toBe("M");
    expect(tailleDe(chaussures, {})).toBe("à indiquer");
    expect(tailleDe(lampe, {})).toBeNull();
  });
  it("la commande : le nombre par article et par taille, dans l'ordre des tailles", () => {
    const f = "Bac pro MS";
    const l = totauxCommande([
      { formation: f, articles: [polo, lampe], tailles: { haut: "L" } },
      { formation: f, articles: [polo, lampe], tailles: { haut: "S" } },
      { formation: f, articles: [polo, lampe], tailles: { haut: "L" } },
      { formation: f, articles: [polo, lampe], tailles: {} },
    ]);
    expect(l).toEqual([
      { formation: f, article: "Polo", taille: "S", quantite: 2 },
      { formation: f, article: "Polo", taille: "L", quantite: 4 },
      { formation: f, article: "Polo", taille: "à indiquer", quantite: 2 },
      { formation: f, article: "Lampe torche", taille: "taille unique", quantite: 4 },
    ]);
  });
  it("un article manquant le jour de la remise reste à remettre", () => {
    const remises = [{ articles: [{ articleId: "p", libelle: "Polo", taille: "M", quantite: 2 }, { articleId: "l", libelle: "Lampe torche", taille: null, quantite: 1 }] }];
    expect(resteARemettre([polo, chaussures, lampe], remises).map((x) => x.id)).toEqual(["c"]);
    expect(resteARemettre([polo], [{ articles: [{ articleId: "p", libelle: "Polo", taille: "M", quantite: 1 }] }])).toEqual([{ ...polo, quantite: 1 }]);
    expect(resteARemettre([polo, chaussures], [...remises, { articles: [{ articleId: "c", libelle: "Chaussures", taille: "42", quantite: 1 }] }])).toEqual([]);
  });
});
