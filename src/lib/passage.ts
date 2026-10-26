/** Propositions par défaut pour le passage à l'année suivante (fonctions pures, testées). */
export type Niveau = "CAP" | "2NDE" | "1RE" | "TLE";

export function anneeSuivante(annee: string): string {
  const [a, b] = annee.split("-").map(Number);
  return `${a + 1}-${b + 1}`;
}

export function proposition(libelle: string, niveau: Niveau): { destination: "suivante" | "fin"; libelle: string; niveau: Niveau } {
  if (niveau === "2NDE") return { destination: "suivante", niveau: "1RE", libelle: libelle.replace(/2nde|seconde/i, "1re") };
  if (niveau === "1RE") return { destination: "suivante", niveau: "TLE", libelle: libelle.replace(/1re|1ère|premi[eè]re/i, "Tle") };
  if (niveau === "TLE") return { destination: "fin", niveau: "TLE", libelle };
  // CAP en deux ans : par défaut, la classe passe en 2e année sous le même nom
  return { destination: "suivante", niveau: "CAP", libelle };
}
