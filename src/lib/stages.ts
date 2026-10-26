import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import type { Horaires } from "@/db/schema";
import { periodeDeReference, signatairesRequis } from "./requetes";
import { verifierStage, type ResultatRegle } from "./regles";

export type Entreprise = typeof schema.entreprises.$inferSelect;

/** Lit les 7 jours d'horaires d'un formulaire (champs debut_0…6, fin_0…6, repos_0…6). */
export function lireHoraires(fd: FormData): Horaires | string {
  const h: Horaires = [];
  for (let i = 0; i < 7; i++) {
    const repos = fd.get(`repos_${i}`) === "on";
    const d = String(fd.get(`debut_${i}`) ?? "").trim(), f = String(fd.get(`fin_${i}`) ?? "").trim();
    if (repos || (!d && !f)) { h.push(null); continue; }
    if (!/^\d{2}:\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(f)) return "Chaque jour travaillé doit avoir une heure de début et de fin.";
    if (d === f) return "Une plage horaire ne peut pas commencer et finir à la même heure.";
    h.push([d, f]);
  }
  return h;
}

/** Nombre d'élèves déjà placés dans l'entreprise sur des périodes qui chevauchent celle-ci. */
export async function placesOccupees(entrepriseId: string, debut: string, fin: string, saufEleve?: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .where(and(
      eq(schema.stages.entrepriseId, entrepriseId),
      lte(schema.periodes.debut, fin), gte(schema.periodes.fin, debut),
      saufEleve ? ne(schema.stages.eleveId, saufEleve) : undefined,
    ));
  return n;
}

export async function entreprisesDuLycee(ctx: Contexte) {
  return db.select().from(schema.entreprises).where(eq(schema.entreprises.etablissementId, ctx.etab.id)).orderBy(asc(schema.entreprises.nom));
}

export async function entrepriseDuLycee(ctx: Contexte, id: string) {
  const [e] = await db.select().from(schema.entreprises)
    .where(and(eq(schema.entreprises.id, id), eq(schema.entreprises.etablissementId, ctx.etab.id))).limit(1);
  return e ?? null;
}

/** Historique : nombre d'élèves accueillis par entreprise, toutes années confondues. */
export async function historiqueAccueil(ctx: Contexte): Promise<Map<string, number>> {
  const rows = await db.select({ id: schema.stages.entrepriseId, n: sql<number>`count(*)::int` }).from(schema.stages)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(eq(schema.entreprises.etablissementId, ctx.etab.id))
    .groupBy(schema.stages.entrepriseId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Tout ce qu'il faut pour afficher le stage d'un élève sur sa période de référence. */
export async function dossierStage(ctx: Contexte, eleve: typeof schema.eleves.$inferSelect, periodeId?: string) {
  const [classe] = eleve.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, eleve.classeId)).limit(1) : [];
  const periodes = classe ? await db.select().from(schema.periodes).where(eq(schema.periodes.classeId, classe.id)).orderBy(asc(schema.periodes.debut)) : [];
  const periode = periodes.find((p) => p.id === periodeId) ?? periodeDeReference(periodes);
  const [dom] = eleve.dominanteId ? await db.select().from(schema.dominantes).where(eq(schema.dominantes.id, eleve.dominanteId)).limit(1) : [];
  const [st] = periode
    ? await db.select({ s: schema.stages, e: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(and(eq(schema.stages.eleveId, eleve.id), eq(schema.stages.periodeId, periode.id))).limit(1)
    : [];
  const requis = signatairesRequis(eleve.dateNaissance, periode?.debut ?? ctx.etab.anneeScolaire.slice(0, 4) + "-09-01");
  const regles: ResultatRegle[] = st && classe
    ? verifierStage({
        horaires: st.s.horaires, regleStructure: classe.regleStructure, secteurEntreprise: st.e.secteur,
        domaineEntreprise: st.e.domaine, dominanteEleve: dom?.libelle ?? null, signatures: st.s.signatures, signatairesRequis: requis,
      }, ctx.etab.reglages.regles)
    : [];
  return { classe: classe ?? null, periodes, periode, dominante: dom?.libelle ?? null, stage: st?.s ?? null, entreprise: st?.e ?? null, regles, requis };
}

/** Entreprises partenaires compatibles avec la règle de la classe, qui ont encore de la place sur la période. */
export async function suggestions(ctx: Contexte, d: Awaited<ReturnType<typeof dossierStage>>, eleveId: string) {
  if (!d.classe || !d.periode) return [];
  const toutes = await entreprisesDuLycee(ctx);
  const compatibles = toutes.filter((e) => {
    if (d.classe!.regleStructure === "prive") return e.secteur === "prive";
    if (d.classe!.regleStructure === "dominante") return !!d.dominante && e.domaine?.toLowerCase() === d.dominante.toLowerCase();
    return true;
  });
  const res: (Entreprise & { restantes: number })[] = [];
  for (const e of compatibles) {
    const occ = await placesOccupees(e.id, d.periode.debut, d.periode.fin, eleveId);
    const restantes = Math.max(0, e.placesParDefaut - occ);
    if (restantes > 0) res.push({ ...e, restantes });
  }
  return res;
}

export async function demarchesDe(eleveId: string) {
  return db.select().from(schema.demarches).where(eq(schema.demarches.eleveId, eleveId)).orderBy(asc(schema.demarches.date));
}

export async function stagiairesEntreprise(ctx: Contexte) {
  if (!ctx.user.entrepriseId) return [];
  return db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(
      eq(schema.stages.entrepriseId, ctx.user.entrepriseId),
      eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire),
      eq(schema.eleves.etablissementId, ctx.etab.id),
    ))
    .orderBy(asc(schema.periodes.debut), asc(schema.eleves.nom));
}

export async function elevesParIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(schema.eleves).where(inArray(schema.eleves.id, ids));
}
