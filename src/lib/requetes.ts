import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesGerees } from "./acces";
import { aujourdhui, ecartJours, ageAu } from "./dates";
import { SIGNATAIRES, signaturesCompletes, statutEleve, verifierStage, stageConforme, type Statut } from "./regles";
import type { Signataire } from "@/db/schema";

export type Periode = typeof schema.periodes.$inferSelect;

/** La période « en cours » d'une classe : celle qui se déroule, sinon la prochaine, sinon la dernière passée. */
export function periodeDeReference(periodes: Periode[], jour = aujourdhui()): Periode | null {
  if (!periodes.length) return null;
  const tri = [...periodes].sort((x, y) => x.debut.localeCompare(y.debut));
  const enCours = tri.find((p) => p.debut <= jour && jour <= p.fin);
  if (enCours) return enCours;
  // Une période terminée depuis moins de 30 jours reste la référence (documents à récupérer).
  const recente = [...tri].reverse().find((p) => p.fin < jour && ecartJours(p.fin, jour) <= 30);
  if (recente) return recente;
  return tri.find((p) => p.debut > jour) ?? tri.at(-1) ?? null;
}

export function texteperiode(p: Periode | null, jour = aujourdhui()): string {
  if (!p) return "Aucune période renseignée";
  if (jour < p.debut) return `${p.libelle} · J-${ecartJours(jour, p.debut)}`;
  if (jour <= p.fin) return `${p.libelle} · en cours`;
  return `${p.libelle} · terminée`;
}

export async function classesAvecPeriodes(ctx: Contexte, ids?: string[]) {
  const referent = alias(schema.users, "referent");
  const rows = await db
    .select({ classe: schema.classes, referentPrenom: referent.prenom, referentNom: referent.nom })
    .from(schema.classes)
    .leftJoin(referent, eq(referent.id, schema.classes.referentId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), ids ? inArray(schema.classes.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : undefined))
    .orderBy(asc(schema.classes.libelle));
  const per = rows.length
    ? await db.select().from(schema.periodes).where(inArray(schema.periodes.classeId, rows.map((r) => r.classe.id))).orderBy(asc(schema.periodes.debut))
    : [];
  return rows.map((r) => ({
    ...r.classe,
    referent: r.referentPrenom ? `${r.referentPrenom} ${r.referentNom}` : null,
    periodes: per.filter((p) => p.classeId === r.classe.id),
  }));
}

export type LigneEleve = Awaited<ReturnType<typeof elevesSuivis>>[number];

/** Élèves des classes gérées, avec leur période de référence, leur stage et leur statut. */
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

  const periodesRef = new Map(classes.map((c) => [c.id, periodeDeReference(c.periodes)]));
  const idsPeriodes = [...periodesRef.values()].filter(Boolean).map((p) => p!.id);
  const stages = idsPeriodes.length
    ? await db.select({ s: schema.stages, ent: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(and(inArray(schema.stages.periodeId, idsPeriodes), inArray(schema.stages.eleveId, eleves.map((x) => x.e.id))))
    : [];
  const docs = stages.length
    ? await db.select({ stageId: schema.documents.stageId, type: schema.documents.type }).from(schema.documents)
      .where(and(inArray(schema.documents.stageId, stages.map((x) => x.s.id)), eq(schema.documents.statut, "valide")))
    : [];
  const jour = aujourdhui();

  return eleves.map(({ e, dominante, refPrenom, refNom }) => {
    const classe = classes.find((c) => c.id === e.classeId)!;
    const periode = periodesRef.get(classe.id) ?? null;
    const st = stages.find((x) => x.s.eleveId === e.id && x.s.periodeId === periode?.id) ?? null;
    const requis = signatairesRequis(e.dateNaissance, periode?.debut ?? jour);
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
    };
  });
}

/** Un élève majeur au début de la période signe seul : le responsable légal n'est pas requis. */
export function signatairesRequis(dateNaissance: string | null, auJour: string): Signataire[] {
  const age = ageAu(dateNaissance, auJour);
  return SIGNATAIRES.map((s) => s.cle).filter((k) => k !== "parent" || age === null || age < 18);
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
