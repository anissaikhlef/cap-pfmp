import { describe, expect, it } from "vitest";
import { calculFrais, euros, montantBareme, montantKilometrique } from "@/lib/regles";
import type { BaremeFrais, TrancheBareme } from "@/db/schema";

// Exemple de barème par tranches de kilomètres parcourus dans l'année (forme du barème kilométrique fiscal).
const voiture5cv: TrancheBareme[] = [
  { jusqua: 5000, taux: 0.636, fixe: 0 },
  { jusqua: 20000, taux: 0.357, fixe: 1395 },
  { jusqua: null, taux: 0.427, fixe: 0 },
];
// Forme du barème de la fonction publique : un taux par tranche, écrit en montant cumulé (km × taux + fixe).
const tauxParTranche: TrancheBareme[] = [
  { jusqua: 2000, taux: 0.32, fixe: 0 },
  { jusqua: 10000, taux: 0.4, fixe: -160 },
  { jusqua: null, taux: 0.23, fixe: 1540 },
];

describe("frais de visite : barème kilométrique du lycée", () => {
  it("un trajet en début d'année : km × taux de la première tranche", () => {
    expect(montantKilometrique(voiture5cv, 0, 40)).toBe(25.44);
  });
  it("un trajet qui change de tranche : la différence du barème sur l'année", () => {
    expect(montantKilometrique(voiture5cv, 4980, 40)).toBe(19.86);
    expect(montantKilometrique(tauxParTranche, 1990, 20)).toBe(7.2);
  });
  it("trajet après trajet, on retrouve le montant de l'année entière", () => {
    const trajets = [1200, 3000, 2500, 900];
    let cumul = 0, total = 0;
    for (const km of trajets) { total += montantKilometrique(voiture5cv, cumul, km); cumul += km; }
    expect(Math.round(total * 100) / 100).toBe(Math.round(montantBareme(voiture5cv, cumul) * 100) / 100);
  });
  it("rien pour un trajet nul ou un barème vide", () => {
    expect(montantKilometrique(voiture5cv, 100, 0)).toBe(0);
    expect(montantKilometrique([], 0, 50)).toBe(0);
  });
});

describe("frais de visite : la demande de remboursement", () => {
  const bareme: BaremeFrais = {
    kilometrique: [{ vehicule: "Voiture 5 CV", tranches: voiture5cv }],
    repas: 20.2,
    nuitees: [{ zone: "Paris et petite couronne", montant: 72.5 }, { zone: "Autres départements", montant: 53.8 }],
    consignes: "",
  };
  const base = { bareme, vehicule: "Voiture 5 CV", km: 40, cumulAvant: 0, peage: 3.5, billets: 0, repas: 1, nuitees: 0, zoneNuitee: null };
  it("kilomètres, péage et repas, en centimes", () => {
    expect(calculFrais(base)).toEqual({ montantKm: 2544, montantRepas: 2020, montantNuitees: 0, total: 4914 });
  });
  it("une nuitée au montant de sa zone", () => {
    expect(calculFrais({ ...base, nuitees: 1, zoneNuitee: "Autres départements" }).montantNuitees).toBe(5380);
  });
  it("en transport en commun : les billets, sans kilomètres", () => {
    expect(calculFrais({ ...base, vehicule: null, km: 0, peage: 0, billets: 12.4, repas: 0 }).total).toBe(1240);
  });
  it("montant en euros", () => {
    expect(euros(4914).replace(/\s/g, " ")).toBe("49,14 €");
  });
});
