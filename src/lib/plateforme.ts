import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Agent, Plafonds, Tarifs } from "@/db/schema";
import { moisDe } from "./agents";

/** Tarifs à 0 : pas encore fixés par l'administration de Cap PFMP. */
export const TARIFS_PAR_DEFAUT: Tarifs = { seul: 0, veille: 0, entreprises: 0, complet: 0 };
export const PLAFONDS_PAR_DEFAUT: Plafonds = { administratif: 400, veille: 0, entreprises: 300 };

/** Tarifs et plafonds de la plateforme (une seule ligne, créée par l'administration ; valeurs par défaut sinon). */
export async function reglagesPlateforme(): Promise<{ tarifs: Tarifs; plafonds: Plafonds }> {
  const [p] = await db.select().from(schema.plateforme).where(eq(schema.plateforme.id, "cap-pfmp")).limit(1);
  return { tarifs: { ...TARIFS_PAR_DEFAUT, ...(p?.tarifs ?? {}) }, plafonds: { ...PLAFONDS_PAR_DEFAUT, ...(p?.plafonds ?? {}) } };
}

/**
 * Le nombre de demandes faites à chaque agent ce mois-ci (mois réel, celui de la facturation), pour un lycée
 * (null : l'administration de Cap PFMP).
 */
export async function usageDuMois(etabId: string | null, jour = new Date().toISOString().slice(0, 10)): Promise<Record<Agent, number>> {
  const { debut, suivant } = moisDe(jour);
  const rows = await db.select({ agent: schema.usageIa.agent, n: sql<number>`count(*)::int` }).from(schema.usageIa)
    .where(and(etabId ? eq(schema.usageIa.etablissementId, etabId) : isNull(schema.usageIa.etablissementId),
      gte(schema.usageIa.at, new Date(`${debut}T00:00:00Z`)), lt(schema.usageIa.at, new Date(`${suivant}T00:00:00Z`))))
    .groupBy(schema.usageIa.agent);
  const u: Record<Agent, number> = { administratif: 0, veille: 0, entreprises: 0 };
  for (const r of rows) u[r.agent] = r.n;
  return u;
}
