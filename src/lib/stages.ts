import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import type { Horaires, Plage } from "@/db/schema";
import { ageAu, JOURS } from "./dates";
import { periodeDeReferenceEleve, rattrapagesDe, signatairesRequis } from "./requetes";
import { verifierStage, type ResultatRegle } from "./regles";

export type Entreprise = typeof schema.entreprises.$inferSelect;

/**
 * Lit les 7 jours d'horaires d'un formulaire : une plage le matin (debut_i, fin_i), une l'après-midi (debut2_i, fin2_i),
 * ou repos (repos_i). Une seule plage peut passer minuit ; avec deux plages, l'après-midi suit le matin.
 */
export function lireHoraires(fd: FormData): Horaires | string {
  const h: Horaires = [];
  for (let i = 0; i < 7; i++) {
    const lire = (k: string) => String(fd.get(`${k}_${i}`) ?? "").trim();
    const plages: Plage[] = [];
    if (fd.get(`repos_${i}`) !== "on") {
      for (const [d, f] of [[lire("debut"), lire("fin")], [lire("debut2"), lire("fin2")]]) {
        if (!d && !f) continue;
        if (!/^\d{2}:\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(f)) return `${JOURS[i]} : chaque plage horaire doit avoir une heure de début et de fin.`;
        if (d === f) return `${JOURS[i]} : une plage horaire ne peut pas commencer et finir à la même heure.`;
        plages.push([d, f]);
      }
    }
    if (plages.length === 2) {
      plages.sort((x, y) => x[0].localeCompare(y[0]));
      const [[d1, f1], [d2, f2]] = plages;
      if (f1 < d1 || f2 < d2 || d2 < f1) return `${JOURS[i]} : avec deux plages, la seconde commence après la fin de la première, sans passer minuit.`;
    }
    h.push(plages.length ? plages : null);
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

/**
 * Tout ce qu'il faut pour afficher le stage d'un élève sur sa période de référence.
 * Ses périodes : celles de sa classe, plus ses rattrapages.
 */
export async function dossierStage(ctx: Contexte, eleve: typeof schema.eleves.$inferSelect, periodeId?: string) {
  const [classe] = eleve.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, eleve.classeId)).limit(1) : [];
  const deLaClasse = classe
    ? await db.select().from(schema.periodes).where(and(eq(schema.periodes.classeId, classe.id), isNull(schema.periodes.eleveId))).orderBy(asc(schema.periodes.debut))
    : [];
  const rattrapages = classe ? (await rattrapagesDe([eleve.id])).filter((r) => r.classeId === classe.id) : [];
  const periodes = [...deLaClasse, ...rattrapages].sort((x, y) => x.debut.localeCompare(y.debut));
  const periode = periodes.find((p) => p.id === periodeId) ?? periodeDeReferenceEleve(periodes);
  const [dom] = eleve.dominanteId ? await db.select().from(schema.dominantes).where(eq(schema.dominantes.id, eleve.dominanteId)).limit(1) : [];
  const [st] = periode
    ? await db.select({ s: schema.stages, e: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(and(eq(schema.stages.eleveId, eleve.id), eq(schema.stages.periodeId, periode.id))).limit(1)
    : [];
  const debutPeriode = periode?.debut ?? ctx.etab.anneeScolaire.slice(0, 4) + "-09-01";
  const requis = signatairesRequis(eleve.dateNaissance, debutPeriode, !!st?.s.tuteur);
  const regles: ResultatRegle[] = st && classe
    ? verifierStage({
        horaires: st.s.horaires, regleStructure: classe.regleStructure, secteurEntreprise: st.e.secteur,
        domaineEntreprise: st.e.domaine, dominanteEleve: dom?.libelle ?? null, signatures: st.s.signatures, signatairesRequis: requis,
        ageAuDebut: ageAu(eleve.dateNaissance, debutPeriode),
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
