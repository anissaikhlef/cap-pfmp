import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, peutGererEleve } from "./acces";
import { signatairesRequis } from "./requetes";
import { ageAu } from "./dates";
import { blocageSignature, stageConforme, verifierStage } from "./regles";
import type { Reglages, Signataire } from "@/db/schema";

export type ContexteConvention = NonNullable<Awaited<ReturnType<typeof chargerConvention>>>;
type Etab = { id: string; reglages: Reglages };

/**
 * Charge un stage avec tout ce qu'il faut pour décider qui peut signer, pour un établissement donné.
 * Sert aussi aux pages publiques à lien personnel, qui n'ont pas de compte connecté.
 */
export async function chargerConventionEtab(etab: Etab, stageId: string) {
  const [r] = await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(eq(schema.stages.id, stageId), eq(schema.eleves.etablissementId, etab.id)))
    .limit(1);
  if (!r) return null;
  const [dom] = r.e.dominanteId ? await db.select().from(schema.dominantes).where(eq(schema.dominantes.id, r.e.dominanteId)).limit(1) : [];
  const requis = signatairesRequis(r.e.dateNaissance, r.p.debut, !!r.s.tuteur);
  const regles = verifierStage({
    horaires: r.s.horaires, regleStructure: r.c.regleStructure, secteurEntreprise: r.ent.secteur, domaineEntreprise: r.ent.domaine,
    dominanteEleve: dom?.libelle ?? null, signatures: r.s.signatures, signatairesRequis: requis, ageAuDebut: ageAu(r.e.dateNaissance, r.p.debut),
  }, etab.reglages.regles);
  const referentId = r.e.referentId ?? r.c.referentId;
  return { ...r, dominante: dom?.libelle ?? null, requis, regles, conforme: stageConforme(regles), referentId };
}

/** Charge un stage de l'établissement de la personne connectée. */
export async function chargerConvention(ctx: Contexte, stageId: string) {
  return chargerConventionEtab(ctx.etab, stageId);
}

/** Le compte connecté est-il le tuteur désigné du stage ? (même entreprise et, si elle est connue, même adresse) */
function estLeTuteur(ctx: Contexte, cv: ContexteConvention) {
  if (!cv.s.tuteur || !a(ctx, "entreprise") || ctx.user.entrepriseId !== cv.s.entrepriseId) return false;
  return !cv.s.tuteur.email || cv.s.tuteur.email.toLowerCase() === ctx.user.email.toLowerCase();
}

/** En quelle qualité l'utilisateur peut-il signer cette convention en ligne ? */
export async function qualitesSignature(ctx: Contexte, cv: ContexteConvention): Promise<Signataire[]> {
  if (ctx.etab.reglages.signature === "papier") return [];
  const q: Signataire[] = [];
  if (cv.e.userId === ctx.user.id) q.push("eleve");
  if (a(ctx, "parent") && cv.requis.includes("parent")) {
    const [r] = await db.select().from(schema.responsables)
      .where(and(eq(schema.responsables.eleveId, cv.e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
    if (r) q.push("parent");
  }
  if (a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId) q.push("entreprise");
  if (cv.requis.includes("tuteur") && estLeTuteur(ctx, cv)) q.push("tuteur");
  if (cv.referentId === ctx.user.id || (!cv.referentId && (await peutGererEleve(ctx, cv.e)))) q.push("professeur");
  if (a(ctx, "direction")) q.push("direction");
  return q.filter((k) => !cv.s.signatures[k]);
}

/** Raison pour laquelle cette qualité ne peut pas encore signer (dernier signataire : tous les autres d'abord, stage conforme), ou null. */
export function blocage(etab: Etab, cv: ContexteConvention, qualite: Signataire): string | null {
  return blocageSignature(qualite, cv.requis, cv.s.signatures, etab.reglages.dernierSignataire, cv.conforme);
}
