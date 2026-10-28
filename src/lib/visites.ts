import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesGerees } from "./acces";
import { ajouterJours, aujourdhui } from "./dates";
import { heuresDesClasses, quotasDesPeriodes } from "./heures";
import { quotasVisites } from "./repartition";
import { rangsDesPeriodes } from "./periodes";
import { anneeDExamen, professeurAutorise, quiPeutVisiter } from "./regles";
import type { QuiVisite } from "@/db/schema";

/** Professeurs pouvant faire au moins une visite, selon l'organisation du lycée (qui visite quoi). */
export async function visiteursPossibles(ctx: Contexte) {
  const tous = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, ctx.etab.id), eq(schema.users.actif, true))).orderBy(asc(schema.users.nom));
  const regles = Object.values(ctx.etab.reglages.quiVisite);
  return tous.filter((u) => u.roles.includes("professeur") && regles.some((q) => professeurAutorise(q, u)));
}

/**
 * Qui peut visiter les stages de chaque période (décision d'Anissa : « chaque lycée a son organisation ») : selon le rang
 * de la période dans l'année de la classe (première, dernière, autres) et les classes d'examen. Un rattrapage suit la
 * période qu'il rattrape.
 */
export async function reglesDesPeriodes(ctx: Contexte, periodeIds: string[]): Promise<Map<string, QuiVisite>> {
  const res = new Map<string, QuiVisite>();
  if (!periodeIds.length) return res;
  const cibles = await db.select({ p: schema.periodes, c: schema.classes }).from(schema.periodes)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(inArray(schema.periodes.id, periodeIds), eq(schema.classes.etablissementId, ctx.etab.id)));
  const classes = [...new Set(cibles.map((x) => x.c.id))];
  const toutes = classes.length ? await db.select().from(schema.periodes).where(inArray(schema.periodes.classeId, classes)) : [];
  for (const { p, c } of cibles) {
    const rangs = rangsDesPeriodes(toutes.filter((x) => x.classeId === c.id));
    const r = rangs.get(p.eleveId ? p.rattrapeId ?? "" : p.id) ?? { rang: 1, nombre: 3 };
    res.set(p.id, quiPeutVisiter(ctx.etab.reglages.quiVisite, { examen: anneeDExamen(c), ...r }));
  }
  return res;
}

/** Un professeur peut-il faire la visite d'un stage de cette période (règles du lycée) ? */
export const peutFaireLaVisite = (regles: Map<string, QuiVisite>, periodeId: string, prof: { enseignementPro: boolean }) =>
  professeurAutorise(regles.get(periodeId) ?? "tous", prof);

export type LigneVisite = Awaited<ReturnType<typeof visitesAOrganiser>>[number];

/** Stages de l'année en cours dont la période n'est pas terminée depuis plus de 30 jours. */
export async function visitesAOrganiser(ctx: Contexte, filtre: { gerees?: boolean; visiteurId?: string; visiteId?: string; periodeIds?: string[] }) {
  const conds = [eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)];
  if (filtre.gerees) {
    const ids = await classesGerees(ctx);
    if (!ids.length) return [];
    conds.push(inArray(schema.classes.id, ids));
    conds.push(gte(schema.periodes.fin, ajouterJours(aujourdhui(), -30)));
  }
  if (filtre.visiteurId) conds.push(eq(schema.visites.visiteurId, filtre.visiteurId));
  if (filtre.visiteId) conds.push(eq(schema.visites.id, filtre.visiteId));
  if (filtre.periodeIds) {
    if (!filtre.periodeIds.length) return [];
    conds.push(inArray(schema.periodes.id, filtre.periodeIds));
  }
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

/**
 * Répartition selon les heures de face à face : pour chaque période de classe qui a des stages à visiter,
 * le nombre de visites proposé à chaque professeur (en proportion de ses heures dans la classe),
 * le nombre validé par la gestion et le nombre de visites qu'il a déjà choisies.
 * Les rattrapages, propres à un élève, s'attribuent directement dans la liste des visites.
 */
export async function repartitionParHeures(ctx: Contexte) {
  const lignes = (await visitesAOrganiser(ctx, { gerees: true })).filter((l) => !l.p.eleveId);
  const pool = await visiteursPossibles(ctx);
  const personnes = await db.select().from(schema.users).where(eq(schema.users.etablissementId, ctx.etab.id));
  const periodes = [...new Map(lignes.map((l) => [l.p.id, l])).values()];
  const heures = await heuresDesClasses(ctx, [...new Set(periodes.map((l) => l.c.id))]);
  const quotas = await quotasDesPeriodes(periodes.map((l) => l.p.id));
  const regles = await reglesDesPeriodes(ctx, periodes.map((l) => l.p.id));
  return periodes.map(({ p, c }) => {
    const aVisiter = lignes.filter((l) => l.p.id === p.id);
    const hClasse = heures.filter((h) => h.classeId === c.id && pool.some((u) => u.id === h.professeurId && peutFaireLaVisite(regles, p.id, u)));
    const proposition = quotasVisites(aVisiter.length, hClasse.map((h) => ({ id: h.professeurId, heures: h.heures })));
    const valides = quotas.filter((q) => q.periodeId === p.id);
    const ids = [...new Set([...hClasse.map((h) => h.professeurId), ...valides.map((q) => q.professeurId)])];
    const profs = ids.map((id) => ({
      prof: personnes.find((u) => u.id === id)!,
      heures: hClasse.find((h) => h.professeurId === id)?.heures ?? 0,
      proposition: proposition.get(id) ?? 0,
      valide: valides.find((q) => q.professeurId === id)?.nombre ?? null,
      choisies: aVisiter.filter((l) => l.v?.visiteurId === id).length,
    })).filter((x) => x.prof).sort((x, y) => y.heures - x.heures || x.prof.nom.localeCompare(y.prof.nom));
    const valideLe = valides.length ? new Date(Math.max(...valides.map((q) => q.valideLe.getTime()))) : null;
    return { periode: p, classe: c, qui: regles.get(p.id) ?? "tous", stages: aVisiter.length, sansVisiteur: aVisiter.filter((l) => !l.v?.visiteurId).length, profs, valideLe };
  });
}
