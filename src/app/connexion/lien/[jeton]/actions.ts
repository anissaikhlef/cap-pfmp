"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hacherMotDePasse, ouvrirSession } from "@/lib/auth";
import { lienValide, marquerUtilise } from "@/lib/liens";
import type { Etat } from "@/components/Formulaire";

/**
 * Connexion avec un lien personnel (élève, parent, entreprise) : le jeton secret, à usage unique et valable
 * quelques minutes, remplace le mot de passe. Un mot de passe provisoire encore jamais changé (fiche imprimée)
 * cesse de fonctionner : la personne se connecte désormais par lien, ou demande un nouveau mot de passe au DDFPT.
 */
export async function utiliserLienConnexion(_: Etat, fd: FormData): Promise<Etat> {
  const lien = await lienValide(String(fd.get("jeton") ?? ""), "connexion");
  if (!lien?.userId) return { erreur: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau sur la page de connexion." };
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, lien.userId), eq(schema.users.actif, true))).limit(1);
  if (!u || !u.roles.every((r) => r === "eleve" || r === "parent" || r === "entreprise")) return { erreur: "Ce lien ne permet pas de se connecter." };
  await marquerUtilise(lien.id);
  if (u.doitChangerMotDePasse) {
    await db.update(schema.users).set({ passwordHash: await hacherMotDePasse(randomBytes(24).toString("base64url")), doitChangerMotDePasse: false }).where(eq(schema.users.id, u.id));
  }
  await db.insert(schema.journal).values({ etablissementId: u.etablissementId, userId: u.id, action: "connexion_par_lien", entite: "user", entiteId: u.id });
  if (u.totpActif) {
    await ouvrirSession(u.id, false);
    redirect("/double-authentification");
  }
  await ouvrirSession(u.id);
  redirect("/");
}
