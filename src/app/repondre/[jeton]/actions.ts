"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { etablissementDuLien, lienValide } from "@/lib/liens";
import { campagneDe, classesDeLaCampagne, enregistrerReponse, lirePlaces } from "@/lib/campagne";
import { envoyer } from "@/lib/messages";
import type { Etat } from "@/components/Formulaire";

/**
 * Réponse d'une entreprise à la campagne de rentrée, avec son lien personnel, sans compte.
 * Comme pour la signature par lien, c'est le jeton (secret, à usage unique, limité dans le temps) qui ouvre le droit
 * de répondre, pour une seule entreprise.
 */
export async function repondreCampagne(_: Etat, fd: FormData): Promise<Etat> {
  const jeton = String(fd.get("jeton") ?? "");
  const lien = await lienValide(jeton, "campagne");
  if (!lien?.entrepriseId) return { erreur: "Ce lien a expiré ou a déjà servi. Répondez simplement au mail du lycée." };
  const etab = await etablissementDuLien(lien.etablissementId);
  const c = etab ? await campagneDe(etab) : null;
  if (!etab || !c) return { erreur: "Cette campagne n'est plus ouverte." };
  const repondant = String(fd.get("repondant") ?? "").trim();
  if (repondant.length < 3 || repondant.length > 120) return { erreur: "Indiquez votre prénom et votre nom." };
  const commentaire = String(fd.get("commentaire") ?? "").trim().slice(0, 1000) || null;
  const places = lirePlaces(fd, (await classesDeLaCampagne(etab)).map((x) => x.id));
  const total = Object.values(places).reduce((a, b) => a + b, 0);
  await enregistrerReponse(etab.id, c.id, lien.entrepriseId, places, { repondant, commentaire });
  await db.insert(schema.journal).values({ etablissementId: etab.id, action: "campagne_reponse_par_lien", entite: "entreprise", entiteId: lien.entrepriseId, details: { places, total, repondant } });
  // La personne qui a lancé la campagne est prévenue.
  const [ent] = await db.select().from(schema.entreprises).where(and(eq(schema.entreprises.id, lien.entrepriseId), eq(schema.entreprises.etablissementId, etab.id))).limit(1);
  const [auteur] = c.creeParId ? await db.select().from(schema.users).where(eq(schema.users.id, c.creeParId)).limit(1) : [];
  if (ent && auteur?.actif) {
    await envoyer({ etab }, {
      canal: "mail", destinataire: auteur.email, sujet: `Campagne de rentrée : réponse de ${ent.nom}`, entrepriseId: ent.id,
      corps: `Bonjour ${auteur.prenom},\n\n${repondant} a répondu pour ${ent.nom} : ${total} place(s) au total.${commentaire ? `\nCommentaire : « ${commentaire} »` : ""}\n\nLe détail par classe est dans Cap PFMP, rubrique « Campagne ».\n\n${etab.nom}`,
    });
  }
  revalidatePath("/campagne");
  redirect(`/repondre/${jeton}`);
}
