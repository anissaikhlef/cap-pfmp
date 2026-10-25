import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesGerees } from "./acces";
import { professeurs } from "./requetes";

/** Listes déroulantes de la fiche élève. */
export async function optionsEleve(ctx: Contexte) {
  const gerees = await classesGerees(ctx);
  const cl = await db.select().from(schema.classes).where(eq(schema.classes.etablissementId, ctx.etab.id)).orderBy(asc(schema.classes.libelle));
  const doms = await db.select().from(schema.dominantes).where(eq(schema.dominantes.etablissementId, ctx.etab.id)).orderBy(asc(schema.dominantes.libelle));
  const profs = await professeurs(ctx);
  return {
    classes: cl.filter((c) => gerees.includes(c.id)).map((c) => ({ id: c.id, libelle: c.libelle })),
    dominantes: doms.map((d) => ({ id: d.id, libelle: d.libelle })),
    profs: profs.map((p) => ({ id: p.id, libelle: `${p.prenom} ${p.nom}` })),
  };
}
