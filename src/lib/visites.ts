import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesGerees } from "./acces";
import { ajouterJours, aujourdhui } from "./dates";

/** Professeurs pouvant faire les visites, selon l'organisation du lycée. */
export async function visiteursPossibles(ctx: Contexte) {
  const tous = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, ctx.etab.id), eq(schema.users.actif, true))).orderBy(asc(schema.users.nom));
  return tous.filter((u) => u.roles.includes("professeur") && (ctx.etab.reglages.visiteurs === "equipe" || u.enseignementPro));
}

export type LigneVisite = Awaited<ReturnType<typeof visitesAOrganiser>>[number];

/** Stages de l'année en cours dont la période n'est pas terminée depuis plus de 30 jours. */
export async function visitesAOrganiser(ctx: Contexte, filtre: { gerees?: boolean; visiteurId?: string; visiteId?: string }) {
  const conds = [eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)];
  if (filtre.gerees) {
    const ids = await classesGerees(ctx);
    if (!ids.length) return [];
    conds.push(inArray(schema.classes.id, ids));
    conds.push(gte(schema.periodes.fin, ajouterJours(aujourdhui(), -30)));
  }
  if (filtre.visiteurId) conds.push(eq(schema.visites.visiteurId, filtre.visiteurId));
  if (filtre.visiteId) conds.push(eq(schema.visites.id, filtre.visiteId));
  const rows = await db
    .select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises, v: schema.visites })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .leftJoin(schema.visites, eq(schema.visites.stageId, schema.stages.id))
    .where(and(...conds))
    .orderBy(asc(schema.periodes.debut), asc(schema.entreprises.nom), asc(schema.eleves.nom));
  return rows.map((r) => ({ ...r, referentId: r.e.referentId ?? r.c.referentId }));
}

export async function chargerVisite(ctx: Contexte, visiteId: string) {
  const [l] = await visitesAOrganiser(ctx, { visiteId });
  return l ?? null;
}
