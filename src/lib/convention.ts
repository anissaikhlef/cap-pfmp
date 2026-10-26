import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, peutGererEleve } from "./acces";
import { signatairesRequis } from "./requetes";
import { SIGNATAIRES, stageConforme, verifierStage } from "./regles";
import type { Signataire } from "@/db/schema";

export type ContexteConvention = NonNullable<Awaited<ReturnType<typeof chargerConvention>>>;

/** Charge un stage avec tout ce qu'il faut pour décider qui peut signer. Vérifie l'appartenance à l'établissement. */
export async function chargerConvention(ctx: Contexte, stageId: string) {
  const [r] = await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(eq(schema.stages.id, stageId), eq(schema.eleves.etablissementId, ctx.etab.id)))
    .limit(1);
  if (!r) return null;
  const [dom] = r.e.dominanteId ? await db.select().from(schema.dominantes).where(eq(schema.dominantes.id, r.e.dominanteId)).limit(1) : [];
  const requis = signatairesRequis(r.e.dateNaissance, r.p.debut);
  const regles = verifierStage({
    horaires: r.s.horaires, regleStructure: r.c.regleStructure, secteurEntreprise: r.ent.secteur, domaineEntreprise: r.ent.domaine,
    dominanteEleve: dom?.libelle ?? null, signatures: r.s.signatures, signatairesRequis: requis,
  }, ctx.etab.reglages.regles);
  const referentId = r.e.referentId ?? r.c.referentId;
  return { ...r, dominante: dom?.libelle ?? null, requis, regles, conforme: stageConforme(regles), referentId };
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
  if (cv.referentId === ctx.user.id || (!cv.referentId && (await peutGererEleve(ctx, cv.e)))) q.push("professeur");
  if (a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId) q.push("entreprise");
  if (a(ctx, "direction")) q.push("direction");
  return q.filter((k) => !cv.s.signatures[k]);
}

/** La direction signe en dernier, et seulement un stage conforme. Renvoie la raison d'un refus, ou null. */
export function blocageDirection(cv: ContexteConvention): string | null {
  const autres = cv.requis.filter((k) => k !== "direction");
  const manquants = autres.filter((k) => !cv.s.signatures[k]);
  if (manquants.length) return `En attente de : ${manquants.map((k) => SIGNATAIRES.find((s) => s.cle === k)!.libelle.toLowerCase()).join(", ")}.`;
  if (!cv.conforme) return "Le stage ne respecte pas toutes les règles : la direction ne peut pas signer.";
  return null;
}
