import "server-only";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";

export async function journaliser(ctx: Contexte | null, action: string, entite: string, entiteId?: string | null, details?: unknown) {
  await db.insert(schema.journal).values({
    etablissementId: ctx?.etab.id ?? null,
    userId: ctx?.user.id ?? null,
    action,
    entite,
    entiteId: entiteId ?? null,
    details: details ?? null,
  });
}
