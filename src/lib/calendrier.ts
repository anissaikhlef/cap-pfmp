import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, estReferentDe, voitToutLEtablissement } from "./acces";

/** Les périodes de PFMP de toutes les classes de l'année (sans les rattrapages, propres à un élève). */
export async function periodesDuLycee(etab: { id: string; anneeScolaire: string }) {
  const classes = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)))
    .orderBy(asc(schema.classes.libelle));
  if (!classes.length) return [];
  const periodes = await db.select().from(schema.periodes)
    .where(and(inArray(schema.periodes.classeId, classes.map((c) => c.id)), isNull(schema.periodes.eleveId)))
    .orderBy(asc(schema.periodes.debut));
  return classes.map((c) => ({ classe: c, periodes: periodes.filter((p) => p.classeId === c.id) }));
}

/**
 * Les rattrapages visibles par la personne connectée (décision d'Anissa) : le DDFPT, la direction et la vie scolaire les voient
 * tous ; un professeur, ceux des élèves de ses classes (référent ou heures de face à face). Le motif, souvent médical, n'est montré
 * qu'à la gestion, à la vie scolaire et au professeur référent de l'élève. La famille voit le rattrapage dans son espace.
 * null : la personne ne voit pas cette rubrique.
 */
export async function rattrapagesVisibles(ctx: Contexte) {
  const tout = voitToutLEtablissement(ctx);
  if (!tout && !a(ctx, "professeur")) return null;
  const rows = await db.select({ p: schema.periodes, e: schema.eleves, c: schema.classes }).from(schema.periodes)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.periodes.eleveId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(isNotNull(schema.periodes.eleveId), eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.periodes.debut));
  if (tout) return rows.map((r) => ({ ...r, motif: r.p.motif }));
  const heures = await db.select({ classeId: schema.heuresClasses.classeId }).from(schema.heuresClasses)
    .where(and(eq(schema.heuresClasses.professeurId, ctx.user.id), eq(schema.heuresClasses.etablissementId, ctx.etab.id)));
  const mesClasses = new Set(heures.map((h) => h.classeId));
  const res = [];
  for (const r of rows) {
    const referent = await estReferentDe(ctx, r.e);
    if (referent || r.c.referentId === ctx.user.id || mesClasses.has(r.c.id)) res.push({ ...r, motif: referent ? r.p.motif : null });
  }
  return res;
}
