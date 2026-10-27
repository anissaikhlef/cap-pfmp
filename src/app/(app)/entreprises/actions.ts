"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte, hacherMotDePasse, motDePasseProvisoire } from "@/lib/auth";
import { estGestionnaire, gereLesAcces } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";

const vide = z.literal("");
const EntrepriseSchema = z.object({
  nom: z.string().trim().min(2, "Nom de l'entreprise manquant").max(120),
  secteur: z.enum(["prive", "public"]),
  domaine: z.string().trim().max(80).optional(),
  adresse: z.string().trim().max(200).optional(),
  ville: z.string().trim().max(80).optional(),
  tuteurNom: z.string().trim().max(80).optional(),
  tuteurFonction: z.string().trim().max(80).optional(),
  email: z.union([z.string().trim().toLowerCase().email("Adresse e-mail invalide"), vide]).optional(),
  telephone: z.string().trim().max(30).optional(),
  placesParDefaut: z.coerce.number().int().min(0).max(50),
  notesInternes: z.string().trim().max(2000).optional(),
  representantNom: z.string().trim().max(80).optional(),
  representantFonction: z.string().trim().max(80).optional(),
  representantEmail: z.union([z.string().trim().toLowerCase().email("Adresse e-mail du représentant invalide"), vide]).optional(),
});

function valeurs(v: z.infer<typeof EntrepriseSchema>) {
  return {
    nom: v.nom, secteur: v.secteur, domaine: v.domaine || null, adresse: v.adresse || null, ville: v.ville || null,
    tuteurNom: v.tuteurNom || null, tuteurFonction: v.tuteurFonction || null, email: v.email || null,
    telephone: v.telephone || null, placesParDefaut: v.placesParDefaut, notesInternes: v.notesInternes || null,
    representantNom: v.representantNom || null, representantFonction: v.representantFonction || null, representantEmail: v.representantEmail || null,
  };
}

export async function creerEntreprise(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return { erreur: "Seuls les gestionnaires des PFMP peuvent ajouter une entreprise." };
  const p = EntrepriseSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const [e] = await db.insert(schema.entreprises).values({ etablissementId: ctx.etab.id, ...valeurs(p.data) }).returning({ id: schema.entreprises.id });
  await journaliser(ctx, "entreprise_creee", "entreprise", e.id);
  redirect(`/entreprises/${e.id}`);
}

export async function modifierEntreprise(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return { erreur: "Seuls les gestionnaires des PFMP peuvent modifier une entreprise." };
  const id = z.string().uuid().parse(fd.get("id"));
  const p = EntrepriseSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  await db.update(schema.entreprises).set(valeurs(p.data)).where(and(eq(schema.entreprises.id, id), eq(schema.entreprises.etablissementId, ctx.etab.id)));
  await journaliser(ctx, "entreprise_modifiee", "entreprise", id);
  revalidatePath(`/entreprises/${id}`);
  return { ok: "Fiche entreprise enregistrée." };
}

export async function creerCompteTuteur(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!gereLesAcces(ctx)) return { erreur: "Seul le DDFPT crée les comptes et donne les mots de passe." };
  const id = z.string().uuid().parse(fd.get("entrepriseId"));
  const [ent] = await db.select().from(schema.entreprises).where(and(eq(schema.entreprises.id, id), eq(schema.entreprises.etablissementId, ctx.etab.id))).limit(1);
  if (!ent) return { erreur: "Entreprise introuvable." };
  const p = z.object({
    prenom: z.string().trim().min(1, "Prénom manquant").max(60),
    nom: z.string().trim().min(1, "Nom manquant").max(60),
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const [existe] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, p.data.email)).limit(1);
  if (existe) return { erreur: "Cette adresse est déjà utilisée par un autre compte." };
  const secret = motDePasseProvisoire();
  await db.insert(schema.users).values({
    etablissementId: ctx.etab.id, email: p.data.email, prenom: p.data.prenom, nom: p.data.nom.toUpperCase(),
    roles: ["entreprise"], entrepriseId: ent.id, passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true,
  });
  await journaliser(ctx, "compte_tuteur_cree", "entreprise", ent.id);
  revalidatePath(`/entreprises/${id}`);
  return { ok: `Accès créé pour ${p.data.prenom} ${p.data.nom}. Il ne verra que ses stagiaires.`, secret };
}

export async function reinitialiserTuteur(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!gereLesAcces(ctx)) return { erreur: "Seul le DDFPT crée les comptes et donne les mots de passe." };
  const userId = z.string().uuid().parse(fd.get("userId"));
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.etablissementId, ctx.etab.id))).limit(1);
  if (!u || !u.roles.includes("entreprise") || u.roles.length > 1) return { erreur: "Compte introuvable." };
  const secret = motDePasseProvisoire();
  await db.update(schema.users).set({ passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true }).where(eq(schema.users.id, userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await journaliser(ctx, "mot_de_passe_reinitialise", "user", userId);
  return { ok: `Nouveau mot de passe provisoire pour ${u.prenom} ${u.nom} :`, secret };
}
