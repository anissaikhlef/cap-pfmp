/**
 * Données des élèves cachées à l'IA (décision d'Anissa) : « l'IA ne voit aucun nom ; l'application le remet au moment de
 * la relecture. Pour relire un CV, l'IA reçoit le texte sans les coordonnées. » Fonctions pures.
 */
export type Masque = { valeur: string; jeton: string };

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remplace chaque valeur (nom, prénom…) par son jeton, sans tenir compte des majuscules ; les plus longues d'abord. */
export function masquer(texte: string, masques: Masque[]): string {
  return [...masques].filter((m) => m.valeur.trim().length >= 2).sort((a, b) => b.valeur.length - a.valeur.length)
    .reduce((t, m) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(m.valeur.trim())}(?![\\p{L}\\p{N}])`, "giu"), m.jeton), texte);
}

/** Remet les vraies valeurs à la place des jetons, une fois le texte revenu de l'IA. */
export function remettre(texte: string, masques: Masque[]): string {
  return masques.reduce((t, m) => t.split(m.jeton).join(m.valeur), texte);
}

/** Retire les coordonnées d'un texte (CV) : adresses mail, numéros de téléphone, liens, adresses postales, dates de naissance. */
export function sansCoordonnees(texte: string): string {
  return texte
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[adresse mail]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[lien]")
    .replace(/(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[téléphone]")
    .replace(/^.*\b\d{5}\b.*$/gm, "[adresse]")
    .replace(/^.*\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|allée|impasse|place|route|cours|quai)\b.*$/gim, "[adresse]")
    .replace(/\b(?:né|née)e?\s+le\s+\S+(?:\s+\S+){0,2}/gi, "[date de naissance]")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, "[date]");
}

/**
 * Pour une traduction : les adresses mail, liens et numéros de téléphone sont remplacés par des repères ([MAIL1], [LIEN1],
 * [TEL1]) avant l'envoi à l'IA, puis remis tels quels au retour (avec `remettre`).
 */
export function masquerCoordonnees(texte: string): { texte: string; masques: Masque[] } {
  const masques: Masque[] = [];
  const remplacer = (t: string, re: RegExp, nom: string) => t.replace(re, (v) => {
    const deja = masques.find((m) => m.valeur === v);
    if (deja) return deja.jeton;
    const jeton = `[${nom}${masques.filter((m) => m.jeton.startsWith(`[${nom}`)).length + 1}]`;
    masques.push({ valeur: v, jeton });
    return jeton;
  });
  let t = remplacer(texte, /https?:\/\/[^\s)»]+/gi, "LIEN");
  t = remplacer(t, /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "MAIL");
  t = remplacer(t, /(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, "TEL");
  return { texte: t, masques };
}
