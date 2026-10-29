import type { ArticleRemis, CategorieArticle, Mesure, Tailles } from "@/db/schema";

/**
 * Tenues professionnelles et matériel (décisions d'Anissa) : une liste préremplie, la plus complète possible ; le DDFPT
 * coche ce dont chaque formation a besoin et ajoute ce qui manque. Fonctions pures, testées.
 */

const LETTRES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const CHIFFRES = Array.from({ length: 14 }, (_, i) => String(34 + 2 * i)); // 34 à 60

/** Ce que l'élève indique, et les tailles proposées (« en XS, S, M… ou bien 34, 36, 38… »). */
export const MESURES: Record<Mesure, { libelle: string; valeurs: string[] }> = {
  haut: { libelle: "Taille du haut", valeurs: [...LETTRES, ...CHIFFRES] },
  bas: { libelle: "Taille du bas", valeurs: [...LETTRES, ...CHIFFRES] },
  pointure: { libelle: "Pointure", valeurs: Array.from({ length: 14 }, (_, i) => String(35 + i)) }, // 35 à 48
  gants: { libelle: "Taille des gants", valeurs: ["6", "7", "8", "9", "10", "11"] },
  ceinture: { libelle: "Tour de taille (ceinture)", valeurs: LETTRES.slice(0, 6) },
};
export const NOMS_MESURES = Object.keys(MESURES) as Mesure[];

export const CATEGORIES: Record<CategorieArticle, string> = { tenue: "Tenue", protection: "Protection", materiel: "Matériel" };

export type ArticleCatalogue = { code: string; libelle: string; categorie: CategorieArticle; mesure: Mesure | null };
const a = (code: string, libelle: string, categorie: CategorieArticle, mesure: Mesure | null = null): ArticleCatalogue => ({ code, libelle, categorie, mesure });

/** La liste préremplie. */
export const CATALOGUE: ArticleCatalogue[] = [
  a("polo", "Polo", "tenue", "haut"), a("tee_shirt", "Tee-shirt", "tenue", "haut"), a("chemise", "Chemise", "tenue", "haut"),
  a("sweat", "Sweat", "tenue", "haut"), a("pull", "Pull", "tenue", "haut"), a("veste", "Veste", "tenue", "haut"),
  a("blouson", "Blouson", "tenue", "haut"), a("parka", "Parka", "tenue", "haut"), a("blouse", "Blouse", "tenue", "haut"),
  a("veste_cuisine", "Veste de cuisine", "tenue", "haut"), a("combinaison", "Combinaison de travail", "tenue", "haut"),
  a("cotte", "Cotte à bretelles", "tenue", "haut"),
  a("pantalon_travail", "Pantalon de travail", "tenue", "bas"), a("pantalon_cuisine", "Pantalon de cuisine", "tenue", "bas"),
  a("bermuda", "Bermuda", "tenue", "bas"),
  a("tablier", "Tablier", "tenue"), a("ceinture", "Ceinture", "tenue", "ceinture"),
  a("casquette", "Casquette", "tenue"), a("calot", "Calot", "tenue"), a("toque", "Toque", "tenue"), a("charlotte", "Charlotte", "tenue"),
  a("chaussures_securite", "Chaussures de sécurité", "tenue", "pointure"), a("chaussures_cuisine", "Chaussures de cuisine", "tenue", "pointure"),
  a("gants", "Gants", "protection", "gants"), a("lunettes", "Lunettes de protection", "protection"),
  a("casque_antibruit", "Casque antibruit", "protection"), a("gilet_hv", "Gilet haute visibilité", "protection", "haut"),
  a("boite_outils", "Boîte à outils", "materiel"), a("mallette_couteaux", "Mallette de couteaux", "materiel"),
  a("trousse_coiffure", "Trousse de coiffure", "materiel"), a("trousse_esthetique", "Trousse d'esthétique", "materiel"),
  a("lampe_torche", "Lampe torche", "materiel"), a("sifflet", "Sifflet", "materiel"), a("brassard", "Brassard", "materiel"),
  a("carnet_rondes", "Carnet de rondes", "materiel"), a("calculatrice", "Calculatrice", "materiel"), a("cle_usb", "Clé USB", "materiel"),
];

export type Article = { id: string; libelle: string; categorie: CategorieArticle; mesure: Mesure | null; quantite: number };

/** Les tailles à demander pour ces articles, dans l'ordre (haut, bas, pointure…). */
export const mesuresDe = (articles: Pick<Article, "mesure">[]) => NOMS_MESURES.filter((m) => articles.some((x) => x.mesure === m));

/** Les tailles encore à indiquer. */
export const taillesManquantes = (articles: Pick<Article, "mesure">[], t: Tailles) => mesuresDe(articles).filter((m) => !t[m]);

/** Une taille acceptée pour cette mesure. */
export const tailleValide = (m: Mesure, v: string) => MESURES[m].valeurs.includes(v);

/** La taille d'un article pour un élève : « M », « 42 », null si l'article n'a pas de taille, « à indiquer » si elle manque. */
export const tailleDe = (x: Pick<Article, "mesure">, t: Tailles) => (x.mesure ? t[x.mesure] ?? "à indiquer" : null);

export type LigneCommande = { formation: string; article: string; taille: string; quantite: number };
/**
 * Le total à commander : pour chaque formation et chaque article, le nombre par taille (dans l'ordre des tailles),
 * les tailles pas encore indiquées à part (« à indiquer »).
 */
export function totauxCommande(eleves: { formation: string; articles: Article[]; tailles: Tailles }[]): LigneCommande[] {
  const total = new Map<string, LigneCommande & { rang: number; ordre: number }>();
  let ordre = 0;
  for (const e of eleves) {
    for (const x of e.articles) {
      const taille = tailleDe(x, e.tailles) ?? "taille unique";
      const cle = `${e.formation}|${x.libelle}|${taille}`;
      const rang = x.mesure ? (MESURES[x.mesure].valeurs.indexOf(taille) + 1 || 999) : 0;
      const l = total.get(cle) ?? { formation: e.formation, article: x.libelle, taille, quantite: 0, rang, ordre: ordre++ };
      l.quantite += x.quantite;
      total.set(cle, l);
    }
  }
  const premier = new Map<string, number>();
  for (const l of total.values()) { const k = `${l.formation}|${l.article}`; if (!premier.has(k)) premier.set(k, l.ordre); }
  return [...total.values()]
    .sort((x, y) => x.formation.localeCompare(y.formation, "fr") || premier.get(`${x.formation}|${x.article}`)! - premier.get(`${y.formation}|${y.article}`)! || x.rang - y.rang)
    .map(({ formation, article, taille, quantite }) => ({ formation, article, taille, quantite }));
}

/** Ce qui reste à remettre à un élève, d'après les remises déjà signées (un article manquant est remis plus tard). */
export function resteARemettre(articles: Article[], remises: { articles: ArticleRemis[] }[]): Article[] {
  const recu = new Map<string, number>();
  for (const r of remises) for (const x of r.articles) recu.set(x.articleId, (recu.get(x.articleId) ?? 0) + x.quantite);
  return articles.map((x) => ({ ...x, quantite: x.quantite - (recu.get(x.id) ?? 0) })).filter((x) => x.quantite > 0);
}
