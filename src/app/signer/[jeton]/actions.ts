"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { chargerConventionEtab } from "@/lib/convention";
import { adresseDuSite, etablissementDuLien, lienValide, marquerUtilise } from "@/lib/liens";
import { enregistrerSignature } from "@/lib/signature";
import type { Etat } from "@/components/Formulaire";

/**
 * Signature par lien personnel, sans compte. Seule action publique de l'application avec la réponse à la campagne :
 * pas de session, c'est le jeton (secret, à usage unique, limité dans le temps) qui ouvre le droit de signer,
 * pour une seule convention et une seule qualité.
 */
export async function signerParLien(_: Etat, fd: FormData): Promise<Etat> {
  const jeton = String(fd.get("jeton") ?? "");
  const lien = await lienValide(jeton, "signature");
  if (!lien?.stageId || !lien.qualite) return { erreur: "Ce lien a expiré ou a déjà servi. Demandez un nouveau lien au lycée." };
  const nom = String(fd.get("nom") ?? "").trim();
  if (nom.length < 3 || nom.length > 120) return { erreur: "Indiquez votre prénom et votre nom." };
  const etab = await etablissementDuLien(lien.etablissementId);
  if (!etab || etab.reglages.signature === "papier") return { erreur: "La signature en ligne n'est plus proposée par le lycée." };
  const cv = await chargerConventionEtab(etab, lien.stageId);
  if (!cv) return { erreur: "Convention introuvable." };
  const erreur = await enregistrerSignature(etab, cv, lien.qualite, fd, { par: null, nom, lien: true }, await adresseDuSite());
  if (erreur) return { erreur };
  await marquerUtilise(lien.id);
  await db.insert(schema.journal).values({ etablissementId: etab.id, action: "convention_signee_par_lien", entite: "stage", entiteId: cv.s.id, details: { qualite: lien.qualite, nom } });
  for (const p of [`/eleves/${cv.e.id}`, "/a-signer", "/stagiaires", "/mon-enfant", "/mon-stage", "/"]) revalidatePath(p);
  redirect(`/signer/${jeton}`);
}
