import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";

export async function domaines(ctx: Contexte): Promise<string[]> {
  const d = await db.select({ l: schema.dominantes.libelle }).from(schema.dominantes).where(eq(schema.dominantes.etablissementId, ctx.etab.id)).orderBy(asc(schema.dominantes.libelle));
  return d.map((x) => x.l);
}
