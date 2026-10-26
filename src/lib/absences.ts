import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, peutGererEleve } from "./acces";
import { ageAu, aujourdhui } from "./dates";
import type { ContexteConvention } from "./convention";

export type Absence = typeof schema.absences.$inferSelect;

export async function absencesDuStage(stageId: string) {
  return db.select().from(schema.absences).where(eq(schema.absences.stageId, stageId)).orderBy(asc(schema.absences.debut));
}

async function estResponsable(ctx: Contexte, eleveId: string) {
  if (!a(ctx, "parent")) return false;
  const [r] = await db.select().from(schema.responsables)
    .where(and(eq(schema.responsables.eleveId, eleveId), eq(schema.responsables.userId, ctx.user.id))).limit(1);
  return !!r;
}

/**
 * Ce que l'utilisateur peut faire sur les absences d'un stage :
 * - le tuteur de l'entreprise signale ;
 * - le responsable légal (ou l'élève majeur lui-même) signale et justifie ;
 * - la gestion des PFMP enregistre une absence ou une justification reçue par téléphone ou sur papier.
 */
export async function droitsAbsences(ctx: Contexte, cv: ContexteConvention): Promise<{ signaler: Absence["origine"] | null; justifier: boolean }> {
  if (await peutGererEleve(ctx, cv.e)) return { signaler: "lycee", justifier: true };
  if (await estResponsable(ctx, cv.e.id)) return { signaler: "famille", justifier: true };
  const majeur = (ageAu(cv.e.dateNaissance, aujourdhui()) ?? 0) >= 18;
  if (cv.e.userId === ctx.user.id && majeur) return { signaler: "famille", justifier: true };
  if (a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId) return { signaler: "entreprise", justifier: false };
  return { signaler: null, justifier: false };
}
