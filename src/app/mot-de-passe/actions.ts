"use server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { contexte, fermerSession, hacherMotDePasse, motDePasseValide } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";

export async function changerMotDePasse(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ ignorerChangementMdp: true });
  const actuel = String(fd.get("actuel") ?? "");
  const nouveau = String(fd.get("nouveau") ?? "");
  const confirmation = String(fd.get("confirmation") ?? "");
  if (!(await bcrypt.compare(actuel, ctx.user.passwordHash))) return { erreur: "Le mot de passe actuel est incorrect." };
  const pb = motDePasseValide(nouveau);
  if (pb) return { erreur: pb };
  if (nouveau !== confirmation) return { erreur: "Les deux nouveaux mots de passe ne correspondent pas." };
  if (nouveau === actuel) return { erreur: "Choisissez un mot de passe différent de l'actuel." };
  await db.update(schema.users).set({ passwordHash: await hacherMotDePasse(nouveau), doitChangerMotDePasse: false }).where(eq(schema.users.id, ctx.user.id));
  // Toutes les sessions ouvertes avec l'ancien mot de passe sont fermées, y compris celle-ci.
  await fermerSession();
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, ctx.user.id));
  await journaliser(ctx, "mot_de_passe_change", "user", ctx.user.id);
  redirect("/connexion?mdp=ok");
}
