"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte, contexteOptionnel, fermerSession, validerSecondFacteur } from "@/lib/auth";
import { verifier, nouveauSecret } from "@/lib/totp";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";

async function tropDEssais(cle: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.tentativesConnexion)
    .where(and(eq(schema.tentativesConnexion.email, cle), eq(schema.tentativesConnexion.reussie, false), gt(schema.tentativesConnexion.at, sql`now() - interval '15 minutes'`)));
  return n >= 5;
}

/** Second facteur à la connexion. */
export async function verifierCode(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexteOptionnel({ nonVerifiee: true });
  if (!ctx) redirect("/connexion");
  const cle = `2fa:${ctx.user.email}`;
  if (await tropDEssais(cle)) { await fermerSession(); return { erreur: "Trop d'essais. Reconnectez-vous dans 15 minutes." }; }
  const ok = !!ctx.user.totpSecret && verifier(ctx.user.totpSecret, String(fd.get("code") ?? ""));
  await db.insert(schema.tentativesConnexion).values({ email: cle, reussie: ok });
  if (!ok) return { erreur: "Code incorrect. Saisissez le code à 6 chiffres affiché dans votre application." };
  await validerSecondFacteur();
  redirect(ctx.user.doitChangerMotDePasse ? "/mot-de-passe" : "/");
}

/** Activation : génère le secret (une seule fois), puis confirme avec un premier code. */
export async function preparerActivation() {
  const ctx = await contexte({ ignorerDoubleAuth: true });
  if (!ctx.user.totpSecret || !ctx.user.totpActif) {
    if (!ctx.user.totpSecret) await db.update(schema.users).set({ totpSecret: nouveauSecret() }).where(eq(schema.users.id, ctx.user.id));
  }
}

export async function confirmerActivation(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ ignorerDoubleAuth: true });
  if (ctx.user.totpActif) redirect("/");
  if (!ctx.user.totpSecret) return { erreur: "Rechargez la page." };
  if (!verifier(ctx.user.totpSecret, String(fd.get("code") ?? ""))) return { erreur: "Code incorrect. Vérifiez que l'heure de votre téléphone est juste, puis réessayez." };
  await db.update(schema.users).set({ totpActif: true }).where(eq(schema.users.id, ctx.user.id));
  await journaliser(ctx, "double_auth_activee", "user", ctx.user.id);
  redirect("/?msg=" + encodeURIComponent("Double authentification activée. Elle vous sera demandée à chaque connexion."));
}
