import "server-only";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesGerees } from "./acces";
import { aujourdhui, ecartJours, ageAu } from "./dates";
import { periodeDeReference, periodeDeReferenceEleve, estRattrapage } from "./periodes";
import { aRelire, candidaturesDe } from "./candidatures";
import { signatairesAttendus, signaturesCompletes, statutEleve, verifierStage, stageConforme, type Statut } from "./regles";
import type { Signataire } from "@/db/schema";

export type Periode = typeof schema.periodes.$inferSelect;
export { periodeDeReference, periodeDeReferenceEleve, estRattrapage };

export function texteperiode(p: Periode | null, jour = aujourdhui()): string {
  if (!p) return "Aucune période renseignée";
  if (jour < p.debut) return `${p.libelle} · J-${ecartJours(jour, p.debut)}`;
  if (jour <= p.fin) return `${p.libelle} · en cours`;
  return `${p.libelle} · terminée`;
}

/** Les rattrapages des élèves donnés (périodes propres à un élève), du plus ancien au plus récent. */
export async function rattrapagesDe(eleveIds: string[]) {
  if (!eleveIds.length) return [];
  return db.select().from(schema.periodes).where(inArray(schema.periodes.eleveId, eleveIds)).orderBy(asc(schema.periodes.debut));
}

export async function classesAvecPeriodes(ctx: Contexte, ids?: string[]) {
  const referent = alias(schema.users, "referent");
  const rows = await db
    .select({ classe: schema.classes, referentPrenom: referent.prenom, referentNom: referent.nom })
    .from(schema.classes)
    .leftJoin(referent, eq(referent.id, schema.classes.referentId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), ids ? inArray(schema.classes.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : undefined))
    .orderBy(asc(schema.classes.libelle));
  // Seulement les périodes de la classe : les rattrapages, propres à un élève, n'en font pas partie.
  const per = rows.length
    ? await db.select().from(schema.periodes)
      .where(and(inArray(schema.periodes.classeId, rows.map((r) => r.classe.id)), isNull(schema.periodes.eleveId)))
      .orderBy(asc(schema.periodes.debut))
    : [];
  return rows.map((r) => ({
    ...r.classe,
    referent: r.referentPrenom ? `${r.referentPrenom} ${r.referentNom}` : null,
    periodes: per.filter((p) => p.classeId === r.classe.id),
  }));
}

export type LigneEleve = Awaited<ReturnType<typeof elevesSuivis>>[number];

/** Élèves des classes gérées, avec leur période de référence (rattrapages compris), leur stage et leur statut. */
export async function elevesSuivis(ctx: Contexte, filtreClasse?: string) {
  const gerees = await classesGerees(ctx);
  const ids = filtreClasse ? gerees.filter((c) => c === filtreClasse) : gerees;
  if (!ids.length) return [];
  const classes = await classesAvecPeriodes(ctx, ids);
  const referentEleve = alias(schema.users, "referent_eleve");
  const eleves = await db
    .select({ e: schema.eleves, dominante: schema.dominantes.libelle, refPrenom: referentEleve.prenom, refNom: referentEleve.nom })
    .from(schema.eleves)
    .leftJoin(schema.dominantes, eq(schema.dominantes.id, schema.eleves.dominanteId))
    .leftJoin(referentEleve, eq(referentEleve.id, schema.eleves.referentId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, ids), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.eleves.nom), asc(schema.eleves.prenom));
  if (!eleves.length) return [];
  const idsEleves = eleves.map((x) => x.e.id);
  const jour = aujourdhui();

  const rattrapages = (await rattrapagesDe(idsEleves)).filter((r) => ids.includes(r.classeId));
  const periodesRef = new Map(eleves.map(({ e }) => {
    const classe = classes.find((c) => c.id === e.classeId)!;
    return [e.id, periodeDeReferenceEleve([...classe.periodes, ...rattrapages.filter((r) => r.eleveId === e.id)], jour)];
  }));
  const idsPeriodes = [...new Set([...periodesRef.values()].filter(Boolean).map((p) => p!.id))];
  const stages = idsPeriodes.length
    ? await db.select({ s: schema.stages, ent: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(and(inArray(schema.stages.periodeId, idsPeriodes), inArray(schema.stages.eleveId, idsEleves)))
    : [];
  const docs = stages.length
    ? await db.select({ stageId: schema.documents.stageId, type: schema.documents.type }).from(schema.documents)
      .where(and(inArray(schema.documents.stageId, stages.map((x) => x.s.id)), eq(schema.documents.statut, "valide")))
    : [];
  const candidatures = await candidaturesDe(idsEleves);
  // Absences non justifiées sur les stages de l'année, toutes périodes confondues
  const nonJustifiees = await db.select({ eleveId: schema.absences.eleveId }).from(schema.absences)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.absences.stageId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .where(and(inArray(schema.absences.eleveId, idsEleves), isNull(schema.absences.justifieeLe), inArray(schema.periodes.classeId, ids)));

  return eleves.map(({ e, dominante, refPrenom, refNom }) => {
    const classe = classes.find((c) => c.id === e.classeId)!;
    const periode = periodesRef.get(e.id) ?? null;
    const st = stages.find((x) => x.s.eleveId === e.id && x.s.periodeId === periode?.id) ?? null;
    const requis = signatairesRequis(e.dateNaissance, periode?.debut ?? jour, !!st?.s.tuteur);
    const conventionComplete = !!st && signaturesCompletes(st.s.signatures, requis);
    const docsStage = st ? docs.filter((d) => d.stageId === st.s.id).map((d) => d.type) : [];
    const statut: Statut | null = periode
      ? statutEleve({
          aujourdhui: jour, debut: periode.debut, fin: periode.fin, aUnStage: !!st, conventionComplete,
          attestationValidee: docsStage.includes("attestation"), livretValide: docsStage.includes("livret"),
        })
      : null;
    const regles = st
      ? verifierStage({
          horaires: st.s.horaires, regleStructure: classe.regleStructure, secteurEntreprise: st.ent.secteur,
          domaineEntreprise: st.ent.domaine, dominanteEleve: dominante, signatures: st.s.signatures, signatairesRequis: requis,
          ageAuDebut: ageAu(e.dateNaissance, periode?.debut ?? jour),
        }, ctx.etab.reglages.regles)
      : [];
    return {
      eleve: e,
      dominante,
      referent: refPrenom ? `${refPrenom} ${refNom}` : classe.referent,
      classe,
      periode,
      stage: st?.s ?? null,
      entreprise: st?.ent ?? null,
      statut,
      regles,
      conforme: st ? stageConforme(regles) : true,
      documentsValides: docsStage,
      enRattrapage: estRattrapage(periode),
      /** Rattrapages en cours ou à venir */
      rattrapages: rattrapages.filter((r) => r.eleveId === e.id && r.fin >= jour),
      absencesNonJustifiees: nonJustifiees.filter((a) => a.eleveId === e.id).length,
      /** CV ou lettre de motivation déposé, pas encore relu */
      candidatureARelire: aRelire(candidatures.get(e.id)),
    };
  });
}

/** Rattrapages en cours ou à venir dans l'établissement (année en cours), pour la vie scolaire et la gestion. */
export async function rattrapagesAVenir(ctx: Contexte, depuis = aujourdhui()) {
  return db.select({ p: schema.periodes, e: schema.eleves, c: schema.classes }).from(schema.periodes)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.periodes.eleveId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire), gte(schema.periodes.fin, depuis)))
    .orderBy(asc(schema.periodes.debut));
}

/**
 * Un élève majeur au début de la période signe seul : le responsable légal n'est pas requis.
 * Le tuteur de stage ne signe que s'il a été désigné pour ce stage.
 */
export function signatairesRequis(dateNaissance: string | null, auJour: string, tuteurDesigne = false): Signataire[] {
  return signatairesAttendus(ageAu(dateNaissance, auJour), tuteurDesigne);
}

export async function equipe(ctx: Contexte) {
  return db.select().from(schema.users)
    .where(eq(schema.users.etablissementId, ctx.etab.id))
    .orderBy(asc(schema.users.nom), asc(schema.users.prenom));
}

export async function professeurs(ctx: Contexte) {
  const tous = await equipe(ctx);
  return tous.filter((u) => u.actif && u.roles.some((r) => r === "professeur" || r === "gestionnaire" || r === "direction"));
}

/** Le professeur référent d'un élève : celui de l'élève s'il est désigné, sinon celui de sa classe. */
export async function referentDe(e: { referentId: string | null; classeId: string | null }): Promise<string | null> {
  if (e.referentId) return e.referentId;
  if (!e.classeId) return null;
  const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1);
  return c?.ref ?? null;
}
