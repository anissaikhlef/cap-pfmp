"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte, hacherMotDePasse, motDePasseProvisoire } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import type { Role } from "@/db/schema";

const ROLES_PERSONNEL = ["direction", "gestionnaire", "professeur"] as const;

const Nouveau = z.object({
  prenom: z.string().trim().min(1).max(60),
  nom: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  discipline: z.string().trim().max(80).optional(),
  enseignementPro: z.enum(["oui", "non"]),
  telephone: z.string().trim().max(30).optional(),
});

export async function creerMembre(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const p = Nouveau.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const roles = fd.getAll("roles").map(String).filter((r): r is (typeof ROLES_PERSONNEL)[number] => (ROLES_PERSONNEL as readonly string[]).includes(r));
  if (!roles.length) return { erreur: "Cochez au moins un rôle." };
  if (roles.includes("direction") && !ctx.user.roles.includes("direction")) return { erreur: "Seule la direction peut créer un compte direction." };
  const [existe] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, p.data.email)).limit(1);
  if (existe) return { erreur: "Un compte existe déjà avec cette adresse." };
  const secret = motDePasseProvisoire();
  const [u] = await db.insert(schema.users).values({
    etablissementId: ctx.etab.id, email: p.data.email, prenom: p.data.prenom, nom: p.data.nom, roles: roles as Role[],
    discipline: p.data.discipline || null, enseignementPro: p.data.enseignementPro === "oui", telephone: p.data.telephone || null,
    passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true,
  }).returning({ id: schema.users.id });
  await journaliser(ctx, "compte_cree", "user", u.id, { roles });
  revalidatePath("/equipe");
  return { ok: `Compte créé pour ${p.data.prenom} ${p.data.nom} (${p.data.email}).`, secret };
}

async function membreDuLycee(ctxEtab: string, id: string) {
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.etablissementId, ctxEtab))).limit(1);
  return u;
}

export async function reinitialiserMotDePasse(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  const u = await membreDuLycee(ctx.etab.id, id);
  if (!u) return { erreur: "Compte introuvable." };
  if (u.roles.includes("direction") && !ctx.user.roles.includes("direction")) return { erreur: "Seule la direction peut réinitialiser un compte direction." };
  const secret = motDePasseProvisoire();
  await db.update(schema.users).set({ passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true }).where(eq(schema.users.id, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await journaliser(ctx, "mot_de_passe_reinitialise", "user", id);
  return { ok: `Nouveau mot de passe provisoire pour ${u.prenom} ${u.nom}.`, secret };
}

export async function basculerActif(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  if (id === ctx.user.id) return;
  const u = await membreDuLycee(ctx.etab.id, id);
  if (!u || (u.roles.includes("direction") && !ctx.user.roles.includes("direction"))) return;
  await db.update(schema.users).set({ actif: !u.actif }).where(eq(schema.users.id, id));
  if (u.actif) await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await journaliser(ctx, u.actif ? "compte_desactive" : "compte_reactive", "user", id);
  revalidatePath("/equipe");
}
