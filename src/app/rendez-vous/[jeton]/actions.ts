"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { aujourdhui } from "@/lib/dates";
import { etablissementDuLien, lienValide, marquerUtilise } from "@/lib/liens";
import { confirmerRendezVous, signalerAucunCreneau, visitePourRendezVous } from "@/lib/rendez-vous";
import { modeRetenu } from "@/lib/regles";
import type { Etat } from "@/components/Formulaire";

/** Le lien (secret, à usage unique, limité dans le temps) remplace la session : il ouvre le choix du rendez-vous d'une seule visite. */
async function depuisLeLien(jeton: string) {
  const lien = await lienValide(jeton, "rendezvous");
  if (!lien?.stageId) return null;
  const etab = await etablissementDuLien(lien.etablissementId);
  const x = etab ? await visitePourRendezVous(etab.id, lien.stageId) : null;
  return etab && x ? { lien, etab, x } : null;
}

/** L'entreprise choisit son créneau et, quand le professeur lui laisse le choix, la visite sur place ou à distance. */
export async function prendreRendezVous(_: Etat, fd: FormData): Promise<Etat> {
  const jeton = String(fd.get("jeton") ?? "");
  const r = await depuisLeLien(jeton);
  if (!r) return { erreur: "Ce lien a expiré ou a déjà servi. Répondez simplement au message du professeur." };
  const i = z.coerce.number().int().min(0).max(2).safeParse(fd.get("creneau"));
  const creneau = i.success ? r.x.v.creneauxProposes?.[i.data] : undefined;
  if (!i.success || !creneau) return { erreur: "Choisissez un créneau." };
  if (creneau[0] < aujourdhui()) return { erreur: "Ce créneau est passé : choisissez-en un autre." };
  const mode = modeRetenu(r.x.v.modesProposes, fd.get("mode") as string | null, r.x.v.mode);
  if (!mode) return { erreur: "Choisissez la forme de la visite : sur place ou à distance." };
  const commentaire = String(fd.get("commentaire") ?? "").trim().slice(0, 500) || null;
  await confirmerRendezVous({ etab: r.etab, user: null }, r.x, i.data, mode, commentaire, "entreprise");
  await marquerUtilise(r.lien.id);
  await db.insert(schema.journal).values({ etablissementId: r.etab.id, action: "rendez_vous_pris_par_lien", entite: "visite", entiteId: r.x.v.id, details: { creneau, mode } });
  for (const p of ["/visites", "/mes-visites", `/visites/${r.x.v.id}`, "/stagiaires"]) revalidatePath(p);
  redirect(`/rendez-vous/${jeton}`);
}

/** Aucun créneau ne convient : le professeur reçoit le message de l'entreprise et propose d'autres créneaux. */
export async function aucunCreneau(_: Etat, fd: FormData): Promise<Etat> {
  const r = await depuisLeLien(String(fd.get("jeton") ?? ""));
  if (!r) return { erreur: "Ce lien a expiré ou a déjà servi. Répondez simplement au message du professeur." };
  const commentaire = String(fd.get("commentaire") ?? "").trim().slice(0, 500);
  if (commentaire.length < 5) return { erreur: "Indiquez vos disponibilités pour le professeur." };
  await signalerAucunCreneau({ etab: r.etab, user: null }, r.x, commentaire);
  await db.insert(schema.journal).values({ etablissementId: r.etab.id, action: "rendez_vous_aucun_creneau", entite: "visite", entiteId: r.x.v.id, details: {} });
  for (const p of ["/visites", "/mes-visites", `/visites/${r.x.v.id}`]) revalidatePath(p);
  return { ok: "Merci : votre message est transmis au professeur, qui vous proposera d'autres créneaux." };
}
