import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { ajouterJours, jourSemaine } from "./dates";
import { texteJour } from "./regles";

/**
 * Pour un jour donné, les élèves de l'établissement dont la classe (ou le rattrapage) est en période de PFMP :
 * en stage, ou attendus au lycée faute de lieu de stage. Avec l'entreprise, les horaires du jour et une éventuelle absence.
 */
export async function situationDuJour(ctx: Contexte, jour: string) {
  const classes = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
  if (!classes.length) return [];
  const ids = classes.map((c) => c.id);
  const periodes = await db.select().from(schema.periodes)
    .where(and(inArray(schema.periodes.classeId, ids), lte(schema.periodes.debut, jour), gte(schema.periodes.fin, jour)));
  if (!periodes.length) return [];
  const eleves = await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, ids), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.eleves.nom), asc(schema.eleves.prenom));
  const stages = await db.select({ s: schema.stages, ent: schema.entreprises }).from(schema.stages)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(inArray(schema.stages.periodeId, periodes.map((p) => p.id)));
  const absents = await db.select().from(schema.absences)
    .where(and(eq(schema.absences.etablissementId, ctx.etab.id), lte(schema.absences.debut, jour), gte(schema.absences.fin, jour)));
  const lignes = [];
  for (const e of eleves) {
    const rattrapage = periodes.find((p) => p.eleveId === e.id);
    const periode = rattrapage ?? periodes.find((p) => !p.eleveId && p.classeId === e.classeId);
    if (!periode) continue;
    const st = stages.find((x) => x.s.eleveId === e.id && x.s.periodeId === periode.id);
    lignes.push({
      eleve: e,
      classe: classes.find((c) => c.id === e.classeId)!,
      periode,
      rattrapage: !!rattrapage,
      stage: st?.s ?? null,
      entreprise: st?.ent ?? null,
      horairesDuJour: st ? texteJour(st.s.horaires, jourSemaine(jour)) : null,
      absence: absents.find((a) => a.eleveId === e.id && a.stageId === st?.s.id) ?? null,
    });
  }
  return lignes;
}

/** Absences en stage récentes (30 derniers jours) ou encore non justifiées, les plus récentes d'abord. */
export async function absencesRecentes(ctx: Contexte, jour: string) {
  return db.select({ a: schema.absences, e: schema.eleves, c: schema.classes, ent: schema.entreprises }).from(schema.absences)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.absences.eleveId))
    .innerJoin(schema.stages, eq(schema.stages.id, schema.absences.stageId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(
      eq(schema.absences.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire),
      or(gte(schema.absences.fin, ajouterJours(jour, -30)), isNull(schema.absences.justifieeLe)),
    ))
    .orderBy(desc(schema.absences.debut)).limit(100);
}

/** Lieu de stage de chaque période donnée (rattrapages en particulier). */
export async function lieuxDesPeriodes(periodeIds: string[]) {
  if (!periodeIds.length) return [];
  return db.select({ s: schema.stages, ent: schema.entreprises }).from(schema.stages)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(inArray(schema.stages.periodeId, periodeIds));
}
