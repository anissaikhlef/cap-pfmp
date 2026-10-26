import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { AccesRefuse } from "./auth";

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

/** Un document est visible par ceux qui voient l'élève ; une entreprise ne voit que les documents de ses propres stages. */
export async function peutVoirDocument(ctx: Contexte, d: typeof schema.documents.$inferSelect): Promise<boolean> {
  if (d.etablissementId !== ctx.etab.id) return false;
  const [e] = await db.select().from(schema.eleves).where(eq(schema.eleves.id, d.eleveId)).limit(1);
  if (!e) return false;
  const seulementEntreprise = a(ctx, "entreprise") && !a(ctx, "direction", "gestionnaire", "professeur", "parent", "eleve");
  if (seulementEntreprise) {
    if (!d.stageId || !ctx.user.entrepriseId) return false;
    const [s] = await db.select({ ent: schema.stages.entrepriseId }).from(schema.stages).where(eq(schema.stages.id, d.stageId)).limit(1);
    return s?.ent === ctx.user.entrepriseId;
  }
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
