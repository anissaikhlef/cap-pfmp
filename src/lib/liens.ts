import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { completerReglages, type ObjetLien, type Signataire } from "@/db/schema";

/** Durée de validité d'un lien personnel de signature. */
export const JOURS_LIEN_SIGNATURE = 7;

const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

/** Durée de validité d'un lien de connexion sans mot de passe. */
export const MINUTES_LIEN_CONNEXION = 15;

/** Crée un lien personnel et renvoie le jeton (seule son empreinte est enregistrée). Validité en jours, ou en minutes. */
export async function creerLien(etablissementId: string, v: {
  objet: ObjetLien; destinataire: string; jours?: number; minutes?: number;
  stageId?: string; qualite?: Signataire; entrepriseId?: string; userId?: string; creeParId?: string | null;
}): Promise<{ jeton: string; expireLe: Date }> {
  const jeton = randomBytes(32).toString("base64url");
  const expireLe = new Date(Date.now() + (v.minutes !== undefined ? v.minutes * 60_000 : (v.jours ?? 1) * 86_400_000));
  await db.insert(schema.liensAcces).values({
    etablissementId, jeton: empreinte(jeton), objet: v.objet, destinataire: v.destinataire, expireLe,
    stageId: v.stageId ?? null, qualite: v.qualite ?? null, entrepriseId: v.entrepriseId ?? null, userId: v.userId ?? null, creeParId: v.creeParId ?? null,
  });
  return { jeton, expireLe };
}

/** Le lien correspondant au jeton, s'il existe, n'a pas expiré et n'a pas encore servi. */
export async function lienValide(jeton: string, objet: ObjetLien) {
  if (!/^[\w-]{30,60}$/.test(jeton)) return null;
  const [l] = await db.select().from(schema.liensAcces)
    .where(and(eq(schema.liensAcces.jeton, empreinte(jeton)), eq(schema.liensAcces.objet, objet), isNull(schema.liensAcces.utiliseLe), gt(schema.liensAcces.expireLe, new Date())))
    .limit(1);
  return l ?? null;
}

export async function marquerUtilise(id: string) {
  await db.update(schema.liensAcces).set({ utiliseLe: new Date() }).where(eq(schema.liensAcces.id, id));
}

/** Quand le stage change (entreprise, horaires), les liens de signature encore ouverts ne valent plus. */
export async function annulerLiensDuStage(stageId: string) {
  await db.delete(schema.liensAcces).where(and(eq(schema.liensAcces.stageId, stageId), isNull(schema.liensAcces.utiliseLe)));
}

/**
 * Adresse du site, pour écrire les liens dans les mails et SMS : SITE_URL si elle est réglée,
 * sinon l'adresse de production Vercel, sinon celle de la requête en cours.
 */
export async function adresseDuSite(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  try {
    const h = await headers();
    const hote = h.get("x-forwarded-host") ?? h.get("host");
    if (hote) return `${h.get("x-forwarded-proto") ?? "http"}://${hote}`;
  } catch {
    // hors d'une requête (script) : adresse locale
  }
  return "http://localhost:3000";
}

/** Le lien correspondant au jeton, même expiré ou déjà utilisé (pour expliquer à la personne où elle en est). */
export async function lienParJeton(jeton: string, objet: ObjetLien) {
  if (!/^[\w-]{30,60}$/.test(jeton)) return null;
  const [l] = await db.select().from(schema.liensAcces)
    .where(and(eq(schema.liensAcces.jeton, empreinte(jeton)), eq(schema.liensAcces.objet, objet))).limit(1);
  return l ?? null;
}

/** L'établissement d'un lien, avec ses réglages complétés. */
export async function etablissementDuLien(etablissementId: string) {
  const [e] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId)).limit(1);
  return e ? { ...e, reglages: completerReglages(e.reglages) } : null;
}
