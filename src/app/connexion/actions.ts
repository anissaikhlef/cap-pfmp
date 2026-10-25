"use server";
import { redirect } from "next/navigation";
import { ouvrirSession, verifierIdentifiants } from "@/lib/auth";
import type { Etat } from "@/components/Formulaire";

export async function seConnecter(_: Etat, fd: FormData): Promise<Etat> {
  const email = String(fd.get("email") ?? "");
  const mdp = String(fd.get("motdepasse") ?? "");
  if (!email || !mdp) return { erreur: "Saisissez votre adresse et votre mot de passe." };
  const r = await verifierIdentifiants(email, mdp);
  if ("erreur" in r) return { erreur: r.erreur };
  await ouvrirSession(r.user.id);
  redirect(r.user.doitChangerMotDePasse ? "/mot-de-passe" : "/");
}
