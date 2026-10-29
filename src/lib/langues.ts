/**
 * Langues des familles (décision d'Anissa) : les langues les plus courantes dans les familles des lycées professionnels,
 * et celles que le lycée ajoute. Le code sert à reconnaître la langue ; le libellé est montré aux familles et à l'équipe.
 */
export const LANGUES: Record<string, { libelle: string; nom: string }> = {
  ar: { libelle: "Arabe", nom: "العربية" },
  en: { libelle: "Anglais", nom: "English" },
  es: { libelle: "Espagnol", nom: "Español" },
  pt: { libelle: "Portugais", nom: "Português" },
  tr: { libelle: "Turc", nom: "Türkçe" },
  ro: { libelle: "Roumain", nom: "Română" },
  ru: { libelle: "Russe", nom: "Русский" },
  uk: { libelle: "Ukrainien", nom: "Українська" },
  zh: { libelle: "Chinois", nom: "中文" },
  ta: { libelle: "Tamoul", nom: "தமிழ்" },
  ur: { libelle: "Ourdou", nom: "اردو" },
  bn: { libelle: "Bengali", nom: "বাংলা" },
};

/** Une langue ajoutée par le lycée : son code est tiré de son nom (« Soninké » → « x-soninke »). */
export const codeLangue = (libelle: string) => `x-${libelle.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** Les langues proposées dans un lycée : la liste, puis celles qu'il a ajoutées. */
export function languesDuLycee(ajoutees: string[]): { code: string; libelle: string; nom: string }[] {
  return [
    ...Object.entries(LANGUES).map(([code, l]) => ({ code, ...l })),
    ...ajoutees.filter((l) => l.trim()).map((l) => ({ code: codeLangue(l), libelle: l.trim(), nom: l.trim() })),
  ];
}

/** Le nom d'une langue, pour l'IA et pour l'affichage (null : le français, pas de traduction). */
export function libelleLangue(code: string | null | undefined, ajoutees: string[]): string | null {
  if (!code || code === "fr") return null;
  return languesDuLycee(ajoutees).find((l) => l.code === code)?.libelle ?? null;
}

/** Les langues écrites de droite à gauche. */
export const droiteAGauche = (code: string | null | undefined) => code === "ar" || code === "ur";
