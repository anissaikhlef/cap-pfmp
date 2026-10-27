"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { chargerConventionEtab } from "@/lib/convention";
import { etablissementDuLien, lienValide, marquerUtilise } from "@/lib/liens";
import { enregistrerFichier } from "@/lib/stockage";
import { documentsManquants } from "@/lib/entreprises-accueil";
import { enregistrerAttestation } from "@/lib/attestation";
import type { Etat } from "@/components/Formulaire";

/**
 * Dépôt de l'attestation et du livret par l'entreprise, avec son lien personnel, sans compte. Comme pour la signature,
 * le jeton (secret, à usage unique, limité dans le temps) ouvre le droit de déposer, pour un seul stage.
 * Les documents arrivent « à vérifier » dans la boîte du lycée.
 */
export async function deposerParLien(_: Etat, fd: FormData): Promise<Etat> {
  const jeton = String(fd.get("jeton") ?? "");
  const lien = await lienValide(jeton, "documents");
  if (!lien?.stageId) return { erreur: "Ce lien a expiré ou a déjà servi. Répondez simplement au mail du lycée avec les documents." };
  const etab = await etablissementDuLien(lien.etablissementId);
  const cv = etab ? await chargerConventionEtab(etab, lien.stageId) : null;
  if (!etab || !cv) return { erreur: "Stage introuvable." };
  // Seulement les documents encore attendus : un document déjà validé ne se remplace pas par ce lien.
  const manquent = await documentsManquants(cv.s.id);
  const fichiers = manquent.map((type) => ({ type, f: fd.get(type) })).filter((x): x is { type: "attestation" | "livret"; f: File } => x.f instanceof File && x.f.size > 0);
  if (!fichiers.length) return { erreur: "Choisissez au moins un fichier." };
  for (const { type, f } of fichiers) {
    const r = await enregistrerFichier(etab.id, f);
    if (typeof r === "string") return { erreur: r };
    await db.insert(schema.documents).values({
      etablissementId: etab.id, eleveId: cv.e.id, stageId: cv.s.id, anneeScolaire: cv.c.anneeScolaire, classeLibelle: cv.c.libelle, type,
      nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille, deposeParId: null, statut: "a_verifier",
    });
  }
  await marquerUtilise(lien.id);
  await db.insert(schema.journal).values({ etablissementId: etab.id, action: "documents_deposes_par_lien", entite: "stage", entiteId: cv.s.id, details: { types: fichiers.map((x) => x.type) } });
  for (const p of [`/eleves/${cv.e.id}`, "/documents", "/"]) revalidatePath(p);
  redirect(`/deposer/${jeton}`);
}

/**
 * L'entreprise remplit et signe l'attestation en ligne avec son lien personnel. Le lien sert encore pour déposer
 * le livret s'il manque ; sinon, il a fini de servir.
 */
export async function remplirAttestationParLien(_: Etat, fd: FormData): Promise<Etat> {
  const jeton = String(fd.get("jeton") ?? "");
  const lien = await lienValide(jeton, "documents");
  if (!lien?.stageId) return { erreur: "Ce lien a expiré ou a déjà servi. Répondez simplement au mail du lycée." };
  const etab = await etablissementDuLien(lien.etablissementId);
  const cv = etab ? await chargerConventionEtab(etab, lien.stageId) : null;
  if (!etab || !cv) return { erreur: "Stage introuvable." };
  const r = await enregistrerAttestation(etab, cv, fd, { depuis: "lien", parId: null });
  if ("erreur" in r) return r;
  if (!(await documentsManquants(cv.s.id)).length) await marquerUtilise(lien.id);
  for (const p of [`/eleves/${cv.e.id}`, "/documents", "/"]) revalidatePath(p);
  redirect(`/deposer/${jeton}`);
}
