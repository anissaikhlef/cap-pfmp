import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { estReferentDe, gereToutLEtablissement } from "./acces";
import { responsablesDe } from "./alertes";
import { aujourdhui } from "./dates";
import { concerneLEleve } from "./periodes";
import { joursEffectues, joursManquants, joursPrevus, type ManqueStage } from "./regles";
import { referentDe } from "./requetes";

/**
 * Cap Admin, jours de stage manquants (décision d'Anissa : « n'attends pas l'année d'examen ») : sur toutes les années de
 * l'élève, les jours de stage non effectués et pas encore rattrapés, et la période en cours sans lieu de stage.
 */
type Eleve = typeof schema.eleves.$inferSelect;
type Periode = typeof schema.periodes.$inferSelect;
export type Arret = typeof schema.arretsRappels.$inferSelect & { par: string };
export type BilanManques = { total: number; detail: ManqueStage[]; rattrapes: number; sansStageEnCours: Periode | null; finsAvecManque: string[]; arrets: Arret[] };

export async function manquesDesEleves(etabId: string, eleves: Eleve[], jour = aujourdhui()): Promise<Map<string, BilanManques>> {
  const res = new Map<string, BilanManques>();
  if (!eleves.length) return res;
  const ids = eleves.map((e) => e.id);
  const stages = await db.select({ s: schema.stages, p: schema.periodes, c: schema.classes }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(inArray(schema.stages.eleveId, ids), eq(schema.classes.etablissementId, etabId)));
  const stageIds = stages.map((x) => x.s.id);
  const [absences, attestations] = stageIds.length ? await Promise.all([
    db.select().from(schema.absences).where(inArray(schema.absences.stageId, stageIds)),
    db.select().from(schema.documents).where(and(inArray(schema.documents.stageId, stageIds), eq(schema.documents.type, "attestation"), eq(schema.documents.statut, "valide"))),
  ]) : [[], []];
  const classeIds = [...new Set(eleves.map((e) => e.classeId).filter((x): x is string => !!x))];
  const periodes = classeIds.length ? await db.select().from(schema.periodes).where(and(inArray(schema.periodes.classeId, classeIds), isNull(schema.periodes.eleveId))) : [];
  const arrets = await db.select({ a: schema.arretsRappels, prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.arretsRappels)
    .leftJoin(schema.users, eq(schema.users.id, schema.arretsRappels.parId))
    .where(and(eq(schema.arretsRappels.etablissementId, etabId), inArray(schema.arretsRappels.eleveId, ids))).orderBy(desc(schema.arretsRappels.le));
  for (const e of eleves) {
    const siens = stages.filter((x) => x.s.eleveId === e.id);
    const termines = siens.filter((x) => x.p.fin < jour).map(({ s, p, c }) => {
      const prevus = joursPrevus(s.horaires, p.debut, p.fin).length;
      // Les jours déclarés par l'entreprise dans l'attestation en ligne validée, sinon les jours prévus moins les absences.
      const declare = s.attestation && attestations.some((d) => d.id === s.attestation!.documentId);
      const effectues = declare ? s.attestation!.joursEffectues : joursEffectues(s.horaires, p.debut, p.fin, absences.filter((x) => x.stageId === s.id), p.fin).effectues;
      return { libelle: `${p.libelle} (${c.libelle})`, prevus, effectues, rattrapage: !!p.eleveId, fin: p.fin };
    });
    const deLaClasse = periodes.filter((p) => p.classeId === e.classeId && concerneLEleve(p, e) && !siens.some((x) => x.p.id === p.id));
    const sansStage = deLaClasse.filter((p) => p.fin < jour);
    const m = joursManquants(termines, sansStage);
    res.set(e.id, {
      ...m,
      sansStageEnCours: deLaClasse.find((p) => p.debut <= jour && jour <= p.fin) ?? null,
      finsAvecManque: [...termines.filter((x) => !x.rattrapage && x.prevus > x.effectues).map((x) => x.fin), ...sansStage.map((p) => p.fin)],
      arrets: arrets.filter((x) => x.a.eleveId === e.id).map((x) => ({ ...x.a, par: x.prenom ? `${x.prenom} ${x.nom}` : "" })),
    });
  }
  return res;
}

/** Arrête ou réactive les rappels : le DDFPT (et la direction) ou le professeur référent de l'élève. */
export async function peutArreterRappels(ctx: Contexte, e: Eleve): Promise<boolean> {
  return e.etablissementId === ctx.etab.id && (gereToutLEtablissement(ctx) || (await estReferentDe(ctx, e)));
}

type Dest = { email: string; prenom: string; userId: string; famille: boolean; eleve?: boolean };

/** L'élève et ses parents, son professeur référent et le DDFPT (à défaut de compte DDFPT, la direction). */
export async function destinatairesDesManques(e: Eleve): Promise<Dest[]> {
  const dest: Dest[] = [];
  if (e.userId) {
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1);
    if (u) dest.push({ email: u.email, prenom: u.prenom, userId: u.id, famille: true, eleve: true });
  }
  for (const u of await responsablesDe(e.id)) dest.push({ email: u.email, prenom: u.prenom, userId: u.id, famille: true });
  const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, e.etablissementId), eq(schema.users.actif, true)));
  const ref = await referentDe(e);
  const ddfpt = equipe.filter((u) => u.roles.includes("gestionnaire"));
  for (const u of [...equipe.filter((x) => x.id === ref), ...(ddfpt.length ? ddfpt : equipe.filter((x) => x.roles.includes("direction")))]) {
    if (!dest.some((d) => d.email === u.email)) dest.push({ email: u.email, prenom: u.prenom, userId: u.id, famille: false });
  }
  return dest;
}

/** Les destinataires à qui le rappel n'a pas été arrêté. */
export const sansArret = (dest: Dest[], arrets: { cible: string }[]) =>
  dest.filter((d) => !arrets.some((a) => (d.famille ? a.cible === "famille" : a.cible === d.userId)));
