import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { adresseDuSite, creerLien } from "./liens";
import { dateLongue } from "./dates";

/** Durée de validité du lien envoyé à l'entreprise pour déposer l'attestation et le livret. */
export const JOURS_LIEN_DOCUMENTS = 30;

/** L'adresse où écrire pour un stage : le tuteur, à défaut l'entreprise. */
export function contactDuStage(s: typeof schema.stages.$inferSelect, ent: typeof schema.entreprises.$inferSelect) {
  return s.tuteur?.email ?? ent.email ?? ent.representantEmail ?? null;
}

/** Lien personnel pour déposer l'attestation et le livret d'un stage sans compte, valable 30 jours et une seule fois. */
export async function lienDeDepot(etabId: string, stageId: string, destinataire: string, base?: string) {
  const { jeton, expireLe } = await creerLien(etabId, { objet: "documents", destinataire, jours: JOURS_LIEN_DOCUMENTS, stageId });
  return { url: `${base ?? (await adresseDuSite())}/deposer/${jeton}`, jusquau: dateLongue(expireLe.toISOString().slice(0, 10)) };
}

/** Les entreprises qui accueillent des élèves pendant une période, avec l'adresse où leur écrire et les élèves accueillis. */
export async function entreprisesDeLaPeriode(etabId: string, periodeId: string) {
  const rows = await db.select({ s: schema.stages, e: schema.eleves, ent: schema.entreprises, c: schema.classes }).from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.stages.periodeId, periodeId), eq(schema.classes.etablissementId, etabId), eq(schema.eleves.archive, false)));
  const parEntreprise = new Map<string, { ent: typeof schema.entreprises.$inferSelect; email: string | null; eleves: string[] }>();
  for (const r of rows) {
    const x = parEntreprise.get(r.ent.id) ?? { ent: r.ent, email: r.ent.email ?? r.ent.representantEmail ?? null, eleves: [] };
    x.email ??= r.s.tuteur?.email ?? null;
    x.eleves.push(`${r.e.prenom} ${r.e.nom} (${r.c.libelle})`);
    parEntreprise.set(r.ent.id, x);
  }
  return [...parEntreprise.values()].sort((a, b) => a.ent.nom.localeCompare(b.ent.nom));
}

/** L'attestation et le livret d'un stage qui manquent encore : ni validés, ni en attente de vérification (un document refusé est à redéposer). */
export async function documentsManquants(stageId: string) {
  const recus = await db.select({ type: schema.documents.type }).from(schema.documents)
    .where(and(eq(schema.documents.stageId, stageId), inArray(schema.documents.type, ["attestation", "livret"]), inArray(schema.documents.statut, ["valide", "a_verifier"])));
  return (["attestation", "livret"] as const).filter((t) => !recus.some((r) => r.type === t));
}
