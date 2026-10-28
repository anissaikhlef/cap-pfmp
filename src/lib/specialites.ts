import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Les périodes d'une seule spécialité portent son nom dans leur libellé (calendrier, campagne de rentrée) : par exemple
 * « PFMP 2 · spécialité Sûreté » (décision d'Anissa : dans une même classe, une spécialité peut partir à d'autres dates).
 */
export async function avecSpecialite<T extends { libelle: string; dominanteId: string | null }>(etabId: string, periodes: T[]): Promise<T[]> {
  if (!periodes.some((p) => p.dominanteId)) return periodes;
  const doms = await db.select().from(schema.dominantes).where(eq(schema.dominantes.etablissementId, etabId));
  return periodes.map((p) => {
    const d = p.dominanteId ? doms.find((x) => x.id === p.dominanteId) : null;
    return d ? { ...p, libelle: `${p.libelle} · spécialité ${d.libelle}` } : p;
  });
}
