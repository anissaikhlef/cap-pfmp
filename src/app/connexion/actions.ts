"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ouvrirSession, verifierIdentifiants } from "@/lib/auth";
import { adresseDuSite, creerLien, MINUTES_LIEN_CONNEXION } from "@/lib/liens";
import { envoyer } from "@/lib/messages";
import type { Etat } from "@/components/Formulaire";

export async function seConnecter(_: Etat, fd: FormData): Promise<Etat> {
  const email = String(fd.get("email") ?? "");
  const mdp = String(fd.get("motdepasse") ?? "");
  if (!email || !mdp) return { erreur: "Saisissez votre adresse et votre mot de passe." };
  const r = await verifierIdentifiants(email, mdp);
  if ("erreur" in r) return { erreur: r.erreur };
  if (r.user.totpActif) {
    await ouvrirSession(r.user.id, false);
    redirect("/double-authentification");
  }
  await ouvrirSession(r.user.id);
  redirect(r.user.doitChangerMotDePasse ? "/mot-de-passe" : "/");
}

/** Les comptes qui peuvent se connecter avec un lien, sans mot de passe ; l'équipe garde mot de passe et double authentification. */
const ROLES_LIEN = ["eleve", "parent", "entreprise"];
const LIENS_PAR_HEURE = 3;

/**
 * Connexion sans mot de passe : un lien personnel, valable quelques minutes et une seule fois, envoyé par mail.
 * La réponse est la même que le compte existe ou non, pour ne pas révéler qui a un compte.
 */
export async function demanderLienConnexion(_: Etat, fd: FormData): Promise<Etat> {
  const p = z.string().trim().toLowerCase().email("Adresse e-mail invalide").safeParse(fd.get("email"));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const email = p.data;
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.email, email), eq(schema.users.actif, true))).limit(1);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.liensAcces)
    .where(and(eq(schema.liensAcces.objet, "connexion"), eq(schema.liensAcces.destinataire, email), gt(schema.liensAcces.createdAt, new Date(Date.now() - 3_600_000))));
  if (u?.etablissementId && u.roles.every((r) => ROLES_LIEN.includes(r)) && n < LIENS_PAR_HEURE) {
    const etabId = u.etablissementId;
    const [etab] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.id, etabId)).limit(1);
    const { jeton } = await creerLien(etabId, { objet: "connexion", destinataire: email, minutes: MINUTES_LIEN_CONNEXION, userId: u.id });
    await envoyer({ etab: { id: etabId } }, {
      canal: "mail", destinataire: email, sujet: "Votre lien de connexion à Cap PFMP",
      corps: `Bonjour ${u.prenom},\n\nPour vous connecter à Cap PFMP sans mot de passe, ouvrez ce lien personnel, valable ${MINUTES_LIEN_CONNEXION} minutes et une seule fois :\n${await adresseDuSite()}/connexion/lien/${jeton}\n\nSi vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans ce lien.\n\n${etab?.nom ?? "Cap PFMP"}`,
    });
  }
  return { ok: `Si un compte élève, parent ou entreprise utilise cette adresse, un lien de connexion vient d'y être envoyé. Il est valable ${MINUTES_LIEN_CONNEXION} minutes.` };
}
