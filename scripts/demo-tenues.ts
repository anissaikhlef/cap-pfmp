/**
 * Tenues et matériel du lycée de démonstration : les articles des formations de la sécurité, choisis dans la liste
 * préremplie (exemple fictif, que chaque DDFPT adapte).
 */
import { and, eq, ilike } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { CATALOGUE } from "../src/lib/tenues-def";

const ARTICLES: Record<string, [string, number][]> = {
  "Bac Pro Métiers de la sécurité": [["polo", 2], ["pantalon_travail", 1], ["parka", 1], ["ceinture", 1], ["chaussures_securite", 1], ["lampe_torche", 1], ["brassard", 1]],
  "CAP Agent de sécurité": [["polo", 2], ["pantalon_travail", 1], ["chaussures_securite", 1], ["brassard", 1]],
};

/** Ajoute les articles aux formations de la sécurité qui n'en ont pas encore. Renvoie le nombre d'articles ajoutés. */
export async function installerTenuesDemo(db: NodePgDatabase<typeof schema>, etablissementId: string) {
  let n = 0;
  for (const [libelle, liste] of Object.entries(ARTICLES)) {
    const [f] = await db.select().from(schema.formations).where(and(eq(schema.formations.etablissementId, etablissementId), ilike(schema.formations.libelle, libelle))).limit(1);
    if (!f) continue;
    const deja = await db.select({ id: schema.articlesFormation.id }).from(schema.articlesFormation).where(eq(schema.articlesFormation.formationId, f.id)).limit(1);
    if (deja.length) continue;
    await db.insert(schema.articlesFormation).values(liste.map(([code, quantite]) => {
      const x = CATALOGUE.find((y) => y.code === code)!;
      return { etablissementId, formationId: f.id, code, libelle: x.libelle, categorie: x.categorie, mesure: x.mesure, quantite };
    }));
    n += liste.length;
  }
  return n;
}
