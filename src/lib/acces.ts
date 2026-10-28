import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { AccesRefuse } from "./auth";
import { anneeDExamen } from "./regles";

/**
 * Règles d'accès (cahier des charges, section 2).
 * Toute lecture ou écriture passe par ces fonctions : le cloisonnement entre lycées
 * et entre rôles est contrôlé côté serveur, jamais seulement dans l'affichage.
 */

export const a = (ctx: Contexte, ...roles: string[]) => roles.some((r) => ctx.user.roles.includes(r as never));

/** Direction, ou compte « gestionnaire » (BDE, DDFPT) : voit et gère tout l'établissement. */
export function gereToutLEtablissement(ctx: Contexte): boolean {
  return a(ctx, "direction", "gestionnaire");
}

/** Identifiants des classes que l'utilisateur gère (organise et suit). */
export async function classesGerees(ctx: Contexte): Promise<string[]> {
  const toutes = db.select({ id: schema.classes.id }).from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
  if (gereToutLEtablissement(ctx)) return (await toutes).map((c) => c.id);
  if (ctx.etab.reglages.gestion === "referent" && a(ctx, "professeur")) {
    const rows = await db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.referentId, ctx.user.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
    return rows.map((c) => c.id);
  }
  return [];
}

export async function peutGererClasse(ctx: Contexte, classeId: string): Promise<boolean> {
  return (await classesGerees(ctx)).includes(classeId);
}

/** Vrai si l'utilisateur gère au moins une classe : il a alors accès aux écrans de gestion. */
export async function estGestionnaire(ctx: Contexte): Promise<boolean> {
  return (await classesGerees(ctx)).length > 0;
}

/** Peut paramétrer l'organisation et gérer les comptes de l'équipe. */
export function peutAdministrer(ctx: Contexte): boolean {
  return a(ctx, "direction", "gestionnaire");
}

/** Signe l'ordre de mission avant la visite : la direction et/ou la gestion des PFMP, selon l'organisation du lycée. */
export function peutSignerOrdreMission(ctx: Contexte): boolean {
  return ctx.etab.reglages.ordreMission && ctx.etab.reglages.signatairesOrdreMission.some((r) => a(ctx, r));
}

/**
 * Créer les comptes, donner les mots de passe et les accès (élèves, parents, entreprises) : seulement le DDFPT
 * (compte « Gestion des PFMP ») et la direction, même dans un lycée où les référents gèrent leurs classes (décision d'Anissa).
 */
export function gereLesAcces(ctx: Contexte): boolean {
  return a(ctx, "direction", "gestionnaire");
}

/** Fixer les dates des périodes de PFMP des classes : seulement le DDFPT et la direction (décision d'Anissa). */
export function peutFixerLesDates(ctx: Contexte): boolean {
  return a(ctx, "direction", "gestionnaire");
}

/** Professeurs d'une classe : son référent et ceux qui y ont déclaré des heures de face à face. */
export async function professeursDeLaClasse(etabId: string, classeId: string): Promise<string[]> {
  const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes)
    .where(and(eq(schema.classes.id, classeId), eq(schema.classes.etablissementId, etabId))).limit(1);
  const heures = await db.select({ id: schema.heuresClasses.professeurId }).from(schema.heuresClasses)
    .where(and(eq(schema.heuresClasses.classeId, classeId), eq(schema.heuresClasses.etablissementId, etabId)));
  return [...new Set([...(c?.ref ? [c.ref] : []), ...heures.map((h) => h.id)])];
}

/** Charge un élève de l'établissement et vérifie que l'utilisateur peut le voir. */
export async function eleveVisible(ctx: Contexte, eleveId: string) {
  const [e] = await db
    .select()
    .from(schema.eleves)
    .where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id)))
    .limit(1);
  if (!e) throw new AccesRefuse();
  if (await peutVoirEleve(ctx, e)) return e;
  throw new AccesRefuse();
}

export async function peutVoirEleve(ctx: Contexte, e: typeof schema.eleves.$inferSelect): Promise<boolean> {
  if (e.etablissementId !== ctx.etab.id) return false;
  if (e.classeId && (await peutGererClasse(ctx, e.classeId))) return true;
  if (e.userId === ctx.user.id) return true;
  if (e.referentId === ctx.user.id) return true;
  if (a(ctx, "professeur") && e.classeId) {
    const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1);
    if (c?.ref === ctx.user.id) return true;
  }
  if (a(ctx, "parent")) {
    const [r] = await db.select().from(schema.responsables)
      .where(and(eq(schema.responsables.eleveId, e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
    if (r) return true;
  }
  if (a(ctx, "professeur")) {
    const v = await db.select({ id: schema.visites.id }).from(schema.visites)
      .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
      .where(and(eq(schema.stages.eleveId, e.id), eq(schema.visites.visiteurId, ctx.user.id))).limit(1);
    if (v.length) return true;
  }
  if (a(ctx, "entreprise") && ctx.user.entrepriseId) {
    const s = await db.select({ id: schema.stages.id }).from(schema.stages)
      .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
      .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
      .where(and(
        eq(schema.stages.eleveId, e.id),
        eq(schema.stages.entrepriseId, ctx.user.entrepriseId),
        eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire),
      )).limit(1);
    if (s.length) return true;
  }
  return false;
}

/** Peut agir comme gestionnaire sur cet élève (valider, relancer, modifier). */
export async function peutGererEleve(ctx: Contexte, e: { classeId: string | null; etablissementId: string }): Promise<boolean> {
  return e.etablissementId === ctx.etab.id && !!e.classeId && (await peutGererClasse(ctx, e.classeId));
}

export async function elevesDuParent(ctx: Contexte): Promise<string[]> {
  const rows = await db.select({ id: schema.responsables.eleveId }).from(schema.responsables)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.responsables.eleveId))
    .where(and(eq(schema.responsables.userId, ctx.user.id), eq(schema.eleves.etablissementId, ctx.etab.id)));
  return rows.map((r) => r.id);
}

export async function idsElevesGeres(ctx: Contexte): Promise<string[]> {
  const cl = await classesGerees(ctx);
  if (!cl.length) return [];
  const rows = await db.select({ id: schema.eleves.id }).from(schema.eleves)
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, cl)));
  return rows.map((r) => r.id);
}

/**
 * Un document est visible par ceux qui voient l'élève ; une entreprise ne voit que les documents de ses propres stages,
 * jamais les justificatifs d'absence. La vie scolaire ne voit que les justificatifs d'absence.
 * Le RIB et la pièce d'identité (allocation de stage) ne sont vus que par la gestion des PFMP, l'élève et ses responsables légaux.
 */
/**
 * Le livret de compétences de l'année d'examen (terminale, 2e année de CAP) n'est pas montré à l'élève ni à sa famille
 * (décision d'Anissa) ; l'équipe et l'entreprise le voient. Vrai si ce livret est caché à la personne connectée.
 */
export async function livretCacheALaFamille(ctx: Contexte, stageId: string | null): Promise<boolean> {
  if (!stageId || a(ctx, "direction", "gestionnaire", "professeur", "vie_scolaire", "entreprise")) return false;
  const [c] = await db.select({ niveau: schema.classes.niveau, anneeExamen: schema.classes.anneeExamen }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(eq(schema.stages.id, stageId)).limit(1);
  return !!c && anneeDExamen(c);
}

export async function peutVoirDocument(ctx: Contexte, d: typeof schema.documents.$inferSelect): Promise<boolean> {
  if (d.etablissementId !== ctx.etab.id) return false;
  const [e] = await db.select().from(schema.eleves).where(eq(schema.eleves.id, d.eleveId)).limit(1);
  if (!e) return false;
  const autresRoles = a(ctx, "direction", "gestionnaire", "professeur", "parent", "eleve");
  if (a(ctx, "vie_scolaire") && !autresRoles && !a(ctx, "entreprise")) return d.type === "justificatif";
  const seulementEntreprise = a(ctx, "entreprise") && !autresRoles;
  if (seulementEntreprise) {
    if (d.type === "justificatif") return false;
    if (!d.stageId || !ctx.user.entrepriseId) return false;
    const [s] = await db.select({ ent: schema.stages.entrepriseId }).from(schema.stages).where(eq(schema.stages.id, d.stageId)).limit(1);
    return s?.ent === ctx.user.entrepriseId;
  }
  if (d.type === "rib" || d.type === "piece_identite") {
    if (e.etablissementId !== ctx.etab.id) return false;
    if (e.userId === ctx.user.id || (await peutGererEleve(ctx, e))) return true;
    if (!a(ctx, "parent")) return false;
    const [r] = await db.select().from(schema.responsables)
      .where(and(eq(schema.responsables.eleveId, e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
    return !!r;
  }
  if (d.type === "livret" && (await livretCacheALaFamille(ctx, d.stageId))) return false;
  return peutVoirEleve(ctx, e);
}

/** Élèves dont l'utilisateur est le professeur référent (de l'élève ou de sa classe), qu'il gère ou non les PFMP. */
export async function idsElevesReferent(ctx: Contexte): Promise<string[]> {
  if (!a(ctx, "professeur")) return [];
  const rows = await db.select({ id: schema.eleves.id, refE: schema.eleves.referentId, refC: schema.classes.referentId })
    .from(schema.eleves).innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.eleves.archive, false), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
  return rows.filter((r) => r.refE === ctx.user.id || (!r.refE && r.refC === ctx.user.id)).map((r) => r.id);
}

/** Comptes qui voient tous les élèves de l'établissement : vie scolaire, direction, gestion des PFMP. */
export function voitToutLEtablissement(ctx: Contexte): boolean {
  return a(ctx, "vie_scolaire", "direction", "gestionnaire");
}

/** Vrai si l'utilisateur est le professeur référent de l'élève (désigné pour l'élève, ou à défaut pour sa classe). */
export async function estReferentDe(ctx: Contexte, e: { referentId: string | null; classeId: string | null }): Promise<boolean> {
  if (!a(ctx, "professeur")) return false;
  if (e.referentId) return e.referentId === ctx.user.id;
  if (!e.classeId) return false;
  const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1);
  return c?.ref === ctx.user.id;
}

/** La gestion des PFMP de l'élève, ou son professeur référent : ils suivent l'élève (rattrapages, relecture du CV). */
export async function suitLEleve(ctx: Contexte, e: typeof schema.eleves.$inferSelect): Promise<boolean> {
  if (e.etablissementId !== ctx.etab.id) return false;
  return (await peutGererEleve(ctx, e)) || (await estReferentDe(ctx, e));
}

/** Programmer ou modifier un rattrapage : la gestion des PFMP de l'élève, ou son professeur référent. */
export const peutGererRattrapage = suitLEleve;

/** Notes de suivi : vie scolaire, direction, gestion et référent. Jamais l'élève, sa famille ni l'entreprise. */
export async function peutVoirNotes(ctx: Contexte, e: typeof schema.eleves.$inferSelect): Promise<boolean> {
  if (e.etablissementId !== ctx.etab.id) return false;
  if (voitToutLEtablissement(ctx)) return true;
  return (await peutGererEleve(ctx, e)) || (await estReferentDe(ctx, e));
}
