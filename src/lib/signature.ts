import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Reglages, Signataire, Signature } from "@/db/schema";
import { blocage, chargerConventionEtab, type ContexteConvention } from "./convention";
import { enregistrerSignatureDessinee } from "./stockage";
import { prevenirDernierSignataire } from "./invitations";
import { completeParQualite } from "./modeles";
import { figerModeleConvention, modeleDeLaConvention } from "./modeles-documents";

type Etab = { id: string; nom: string; reglages: Reglages; logoCle?: string | null };

/**
 * Les champs du PDF du lycée que la personne complète en signant (famille : élève et parent ; entreprise : représentant
 * et tuteur), lus dans le formulaire de signature (« cp_<n° du champ> ») et ajoutés à ceux déjà complétés.
 */
async function enregistrerComplements(etab: Etab, cv: ContexteConvention, qualite: Signataire, fd: FormData) {
  const role = completeParQualite(qualite);
  if (!role) return;
  const m = await modeleDeLaConvention(etab, cv);
  if (m.mode !== "pdf") return;
  const valeurs: Record<string, string> = {};
  m.champs.forEach((c, i) => {
    if (c.source !== role) return;
    const v = fd.get(`cp_${i}`);
    if (c.type === "case") valeurs[c.nom] = v === "oui" ? "oui" : "non";
    else if (typeof v === "string") valeurs[c.nom] = v.trim().slice(0, 300);
  });
  if (!Object.keys(valeurs).length) return;
  await db.update(schema.stages).set({
    complements: sql`${schema.stages.complements} || jsonb_build_object('convention', coalesce(${schema.stages.complements} -> 'convention', '{}'::jsonb) || ${JSON.stringify(valeurs)}::jsonb)`,
  }).where(eq(schema.stages.id, cv.s.id));
}

/** Modèles de signature en ligne autorisés par le lycée. */
export function modelesAutorises(r: Reglages): ("simple" | "dessinee")[] {
  return r.signatureModele === "les2" ? ["simple", "dessinee"] : [r.signatureModele];
}

/**
 * Enregistre une signature en ligne (depuis un compte ou un lien personnel) après toutes les vérifications :
 * case « J'ai lu », modèle autorisé, ordre des signatures, signature dessinée lisible.
 * Prévient ensuite le dernier signataire quand il ne manque plus que lui. Renvoie un message d'erreur, ou null.
 */
export async function enregistrerSignature(etab: Etab, cv: ContexteConvention, qualite: Signataire, fd: FormData, v: { par: string | null; nom?: string; lien?: boolean; userId?: string | null }, base: string): Promise<string | null> {
  if (fd.get("lu") !== "on") return "Cochez la case pour confirmer que vous avez lu la convention.";
  if (!cv.requis.includes(qualite) || cv.s.signatures[qualite]) return "Cette signature n'est plus attendue.";
  const modeles = modelesAutorises(etab.reglages);
  const modele = String(fd.get("modele") ?? modeles[0]);
  if (modele !== "simple" && modele !== "dessinee") return "Choisissez une façon de signer.";
  if (!modeles.includes(modele)) return "Ce modèle de signature n'est pas utilisé par le lycée.";
  const b = blocage(etab, cv, qualite);
  if (b) return b;
  const sig: Signature = { le: new Date().toISOString(), par: v.par, mode: "enligne", modele, ...(v.nom ? { nom: v.nom } : {}), ...(v.lien ? { lien: true } : {}) };
  if (modele === "dessinee") {
    const r = await enregistrerSignatureDessinee(etab.id, String(fd.get("image") ?? ""));
    if (typeof r === "string") return r;
    sig.image = r.cle;
  }
  // Le modèle est figé avant la première signature : ce qui est signé ne change plus ensuite.
  await figerModeleConvention(etab, cv.s.id);
  await enregistrerComplements(etab, cv, qualite, fd);
  // Mise à jour atomique : on ajoute la signature sans écraser celles posées entre-temps, et une seule fois.
  const maj = await db.update(schema.stages).set({
    signatures: sql`${schema.stages.signatures} || jsonb_build_object(${qualite}::text, ${JSON.stringify(sig)}::jsonb)`,
  }).where(and(eq(schema.stages.id, cv.s.id), sql`not (${schema.stages.signatures} ? ${qualite})`)).returning({ id: schema.stages.id });
  if (!maj.length) return "Cette convention vient d'être signée en cette qualité.";
  const apres = await chargerConventionEtab(etab, cv.s.id);
  if (apres) await prevenirDernierSignataire({ etab, user: v.userId ? { id: v.userId } : null }, apres, etab.reglages.dernierSignataire, base);
  return null;
}
