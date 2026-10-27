import "server-only";
import { and, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Taille du formulaire du barème : lignes (véhicules), tranches par ligne, lieux de nuitée. */
export const NB_LIGNES = 12;
export const NB_TRANCHES = 3;
export const NB_ZONES = 4;

/**
 * Kilomètres déjà parcourus par le professeur dans l'année civile avant ce trajet (demandes envoyées ou validées) :
 * le barème s'applique par tranches de kilomètres annuels.
 */
export async function kmAvant(professeurId: string, date: string, demande?: { id: string; createdAt: Date }): Promise<number> {
  const f = schema.fraisDeplacement;
  // Le même jour, seules comptent les demandes faites avant celle-ci.
  const memeJour = demande ? and(eq(f.date, date), lt(f.createdAt, demande.createdAt)) : eq(f.date, date);
  const [r] = await db.select({ km: sql<number>`coalesce(sum(${f.km}), 0)::float` }).from(f)
    .where(and(
      eq(f.professeurId, professeurId),
      inArray(f.statut, ["envoyee", "validee"]),
      gte(f.date, `${date.slice(0, 4)}-01-01`),
      or(lt(f.date, date), memeJour),
      ...(demande ? [ne(f.id, demande.id)] : []),
    ));
  return r?.km ?? 0;
}
