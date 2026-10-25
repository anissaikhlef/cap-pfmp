"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte, hacherMotDePasse, motDePasseProvisoire } from "@/lib/auth";
import { classesGerees, peutGererEleve } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { lireCsv, lireDate, normaliserEntete } from "@/lib/csv";
import type { Etat } from "@/components/Formulaire";

const uuidOuVide = z.union([z.string().uuid(), z.literal("")]).optional();

const EleveSchema = z.object({
  prenom: z.string().trim().min(1, "Prénom manquant").max(60),
  nom: z.string().trim().min(1, "Nom manquant").max(60),
  classeId: z.string().uuid("Choisissez une classe"),
  dateNaissance: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  email: z.union([z.string().trim().toLowerCase().email("Adresse e-mail invalide"), z.literal("")]).optional(),
  dominanteId: uuidOuVide,
  referentId: uuidOuVide,
});

async function verifierLiens(etabId: string, v: { dominanteId?: string; referentId?: string }) {
  let dominanteId: string | null = null, referentId: string | null = null;
  if (v.dominanteId) {
    const [d] = await db.select({ id: schema.dominantes.id }).from(schema.dominantes)
      .where(and(eq(schema.dominantes.id, v.dominanteId), eq(schema.dominantes.etablissementId, etabId))).limit(1);
    dominanteId = d?.id ?? null;
  }
  if (v.referentId) {
    const [u] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, v.referentId), eq(schema.users.etablissementId, etabId))).limit(1);
    referentId = u?.id ?? null;
  }
  return { dominanteId, referentId };
}

export async function creerEleve(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const p = EleveSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  if (!(await classesGerees(ctx)).includes(v.classeId)) return { erreur: "Vous ne gérez pas cette classe." };
  const liens = await verifierLiens(ctx.etab.id, { dominanteId: v.dominanteId || undefined, referentId: v.referentId || undefined });
  const [e] = await db.insert(schema.eleves).values({
    etablissementId: ctx.etab.id, classeId: v.classeId, prenom: v.prenom, nom: v.nom.toUpperCase(),
    dateNaissance: v.dateNaissance || null, email: v.email || null, ...liens,
  }).returning({ id: schema.eleves.id });
  await journaliser(ctx, "eleve_cree", "eleve", e.id);
  redirect(`/eleves/${e.id}`);
}

async function eleveGere(ctxId: Awaited<ReturnType<typeof contexte>>, id: string) {
  const [e] = await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctxId.etab.id))).limit(1);
  if (!e || !(await peutGererEleve(ctxId, e))) return null;
  return e;
}

export async function modifierEleve(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const e = await eleveGere(ctx, id);
  if (!e) return { erreur: "Vous ne gérez pas cet élève." };
  const p = EleveSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  if (!(await classesGerees(ctx)).includes(v.classeId)) return { erreur: "Vous ne gérez pas la classe choisie." };
  const liens = await verifierLiens(ctx.etab.id, { dominanteId: v.dominanteId || undefined, referentId: v.referentId || undefined });
  await db.update(schema.eleves).set({
    classeId: v.classeId, prenom: v.prenom, nom: v.nom.toUpperCase(), dateNaissance: v.dateNaissance || null, email: v.email || null, ...liens,
  }).where(eq(schema.eleves.id, id));
  await journaliser(ctx, "eleve_modifie", "eleve", id);
  revalidatePath(`/eleves/${id}`);
  return { ok: "Fiche enregistrée." };
}

export async function archiverEleve(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const e = await eleveGere(ctx, id);
  if (!e) return;
  await db.update(schema.eleves).set({ archive: !e.archive }).where(eq(schema.eleves.id, id));
  await journaliser(ctx, e.archive ? "eleve_desarchive" : "eleve_archive", "eleve", id);
  revalidatePath("/eleves");
  redirect("/eleves");
}

/* -------------------------- Comptes élève et famille -------------------------- */

export async function creerCompteEleve(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("eleveId"));
  const e = await eleveGere(ctx, id);
  if (!e) return { erreur: "Vous ne gérez pas cet élève." };
  if (e.userId) return { erreur: "Cet élève a déjà un compte." };
  const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide").safeParse(fd.get("email"));
  if (!email.success) return { erreur: email.error.issues[0]?.message };
  const [existe] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email.data)).limit(1);
  if (existe) return { erreur: "Cette adresse est déjà utilisée par un autre compte." };
  const secret = motDePasseProvisoire();
  const [u] = await db.insert(schema.users).values({
    etablissementId: ctx.etab.id, email: email.data, prenom: e.prenom, nom: e.nom, roles: ["eleve"],
    passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true,
  }).returning({ id: schema.users.id });
  await db.update(schema.eleves).set({ userId: u.id, email: email.data }).where(eq(schema.eleves.id, id));
  await journaliser(ctx, "compte_eleve_cree", "eleve", id);
  revalidatePath(`/eleves/${id}`);
  return { ok: `Compte créé pour ${e.prenom} (${email.data}).`, secret };
}

export async function ajouterResponsable(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("eleveId"));
  const e = await eleveGere(ctx, id);
  if (!e) return { erreur: "Vous ne gérez pas cet élève." };
  const p = z.object({
    prenom: z.string().trim().min(1, "Prénom manquant").max(60),
    nom: z.string().trim().min(1, "Nom manquant").max(60),
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
    telephone: z.string().trim().max(30).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const [existe] = await db.select().from(schema.users).where(eq(schema.users.email, p.data.email)).limit(1);
  if (existe) {
    // Un même parent peut avoir plusieurs enfants dans le lycée : on rattache le compte existant.
    if (existe.etablissementId !== ctx.etab.id || !existe.roles.includes("parent")) return { erreur: "Cette adresse est déjà utilisée par un autre compte." };
    await db.insert(schema.responsables).values({ eleveId: id, userId: existe.id }).onConflictDoNothing();
    await journaliser(ctx, "responsable_rattache", "eleve", id);
    revalidatePath(`/eleves/${id}`);
    return { ok: `${existe.prenom} ${existe.nom} a déjà un compte : il est maintenant rattaché à ${e.prenom}.` };
  }
  const secret = motDePasseProvisoire();
  const [u] = await db.insert(schema.users).values({
    etablissementId: ctx.etab.id, email: p.data.email, prenom: p.data.prenom, nom: p.data.nom.toUpperCase(), roles: ["parent"],
    telephone: p.data.telephone || null, passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true,
  }).returning({ id: schema.users.id });
  await db.insert(schema.responsables).values({ eleveId: id, userId: u.id });
  await journaliser(ctx, "compte_responsable_cree", "eleve", id);
  revalidatePath(`/eleves/${id}`);
  return { ok: `Compte créé pour ${p.data.prenom} ${p.data.nom} (${p.data.email}).`, secret };
}

export async function retirerResponsable(fd: FormData) {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const userId = z.string().uuid().parse(fd.get("userId"));
  if (!(await eleveGere(ctx, eleveId))) return;
  await db.delete(schema.responsables).where(and(eq(schema.responsables.eleveId, eleveId), eq(schema.responsables.userId, userId)));
  await journaliser(ctx, "responsable_retire", "eleve", eleveId);
  revalidatePath(`/eleves/${eleveId}`);
}

/* ------------------------------- Import CSV ------------------------------- */

export type RapportImport = (NonNullable<Etat> & { lignes?: { n: number; nom: string; resultat: string; ok: boolean }[] }) | null;

export async function importerEleves(_: RapportImport, fd: FormData): Promise<RapportImport> {
  const ctx = await contexte();
  const fichier = fd.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez un fichier CSV." };
  if (fichier.size > 2 * 1024 * 1024) return { erreur: "Fichier trop lourd (2 Mo maximum)." };
  const lignes = lireCsv(await fichier.text());
  if (lignes.length < 2) return { erreur: "Le fichier ne contient aucune ligne d'élève." };
  const entetes = lignes[0].map(normaliserEntete);
  const col = (...noms: string[]) => entetes.findIndex((h) => noms.includes(h));
  const iNom = col("nom"), iPrenom = col("prenom"), iClasse = col("classe", "division"),
    iNaiss = col("date_de_naissance", "date_naissance", "naissance", "ne_e_le"), iEmail = col("email", "mail", "e_mail", "courriel"),
    iDom = col("dominante");
  if (iNom < 0 || iPrenom < 0 || iClasse < 0) return { erreur: "Colonnes obligatoires : nom, prenom, classe." };

  const gerees = await classesGerees(ctx);
  const classes = (await db.select().from(schema.classes).where(eq(schema.classes.etablissementId, ctx.etab.id))).filter((c) => gerees.includes(c.id));
  const doms = await db.select().from(schema.dominantes).where(eq(schema.dominantes.etablissementId, ctx.etab.id));
  const existants = await db.select({ nom: schema.eleves.nom, prenom: schema.eleves.prenom, classeId: schema.eleves.classeId }).from(schema.eleves).where(eq(schema.eleves.etablissementId, ctx.etab.id));
  const cle = (n: string, p: string) => `${n.toUpperCase()}|${p.toLowerCase()}`;
  const deja = new Set(existants.map((x) => cle(x.nom, x.prenom)));
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  const rapport: { n: number; nom: string; resultat: string; ok: boolean }[] = [];
  let crees = 0;
  for (let i = 1; i < lignes.length && i <= 1000; i++) {
    const l = lignes[i];
    const nom = (l[iNom] ?? "").trim(), prenom = (l[iPrenom] ?? "").trim();
    const libelle = `${prenom} ${nom}`.trim() || `ligne ${i + 1}`;
    if (!nom || !prenom) { rapport.push({ n: i + 1, nom: libelle, resultat: "Nom ou prénom manquant", ok: false }); continue; }
    const classe = classes.find((c) => norm(c.libelle) === norm(l[iClasse] ?? ""));
    if (!classe) { rapport.push({ n: i + 1, nom: libelle, resultat: `Classe « ${l[iClasse] ?? ""} » inconnue ou non gérée`, ok: false }); continue; }
    if (deja.has(cle(nom, prenom))) { rapport.push({ n: i + 1, nom: libelle, resultat: "Déjà présent, ignoré", ok: false }); continue; }
    const naissance = iNaiss >= 0 ? lireDate(l[iNaiss] ?? "") : null;
    const emailBrut = iEmail >= 0 ? (l[iEmail] ?? "").trim().toLowerCase() : "";
    const email = z.string().email().safeParse(emailBrut).success ? emailBrut : null;
    const dom = iDom >= 0 ? doms.find((d) => norm(d.libelle) === norm(l[iDom] ?? "")) : undefined;
    await db.insert(schema.eleves).values({
      etablissementId: ctx.etab.id, classeId: classe.id, nom: nom.toUpperCase(), prenom, dateNaissance: naissance, email, dominanteId: dom?.id ?? null,
    });
    deja.add(cle(nom, prenom));
    crees++;
    rapport.push({ n: i + 1, nom: libelle, resultat: `Ajouté en ${classe.libelle}`, ok: true });
  }
  await journaliser(ctx, "eleves_importes", "eleve", null, { crees });
  revalidatePath("/eleves");
  return { ok: `${crees} élève(s) ajouté(s) sur ${lignes.length - 1} ligne(s).`, lignes: rapport };
}
