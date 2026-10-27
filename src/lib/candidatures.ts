import "server-only";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";

export const LIBELLES_CANDIDATURE = { cv: "CV", lettre: "Lettre de motivation" } as const;
export type TypeCandidature = keyof typeof LIBELLES_CANDIDATURE;
type Document = typeof schema.documents.$inferSelect;

/** Le dernier CV et la dernière lettre de motivation de chaque élève. */
export async function candidaturesDe(eleveIds: string[]) {
  const res = new Map<string, { cv?: Document; lettre?: Document }>();
  if (!eleveIds.length) return res;
  const docs = await db.select().from(schema.documents)
    .where(and(inArray(schema.documents.eleveId, eleveIds), inArray(schema.documents.type, ["cv", "lettre"])))
    .orderBy(desc(schema.documents.deposeLe));
  for (const d of docs) {
    const x = res.get(d.eleveId) ?? {};
    const t = d.type as TypeCandidature;
    if (!x[t]) x[t] = d;
    res.set(d.eleveId, x);
  }
  return res;
}

/** Vrai si le dernier CV ou la dernière lettre attend encore une relecture. */
export function aRelire(x: { cv?: Document; lettre?: Document } | undefined): boolean {
  return !!x && (x.cv?.statut === "a_verifier" || x.lettre?.statut === "a_verifier");
}

/** Les candidatures envoyées par l'élève depuis l'application, les plus récentes d'abord. */
export async function candidaturesEnvoyees(eleveId: string) {
  return db.select().from(schema.messages)
    .where(and(eq(schema.messages.eleveId, eleveId), like(schema.messages.sujet, "Candidature de stage%")))
    .orderBy(desc(schema.messages.createdAt)).limit(20);
}
