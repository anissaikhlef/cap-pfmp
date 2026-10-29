"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { CategorieArticle, Mesure } from "@/db/schema";
import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import { lireJours } from "@/lib/regles";
import { equipe } from "@/lib/requetes";
import { CATALOGUE, CATEGORIES, MESURES } from "@/lib/tenues-def";

const rafraichir = () => { revalidatePath("/organisation/tenues"); revalidatePath("/tenues", "layout"); };
const quantite = (v: FormDataEntryValue | null) => { const n = Number(v ?? 1); return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 1; };

async function formationDuLycee(etabId: string, id: unknown) {
  const fid = z.string().uuid().safeParse(id).data;
  const [f] = fid ? await db.select().from(schema.formations).where(and(eq(schema.formations.id, fid), eq(schema.formations.etablissementId, etabId))).limit(1) : [];
  return f;
}

/** Les articles d'une formation : cochés dans la liste préremplie (décision d'Anissa), avec la quantité remise à chaque élève. */
export async function enregistrerArticles(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const f = await formationDuLycee(ctx.etab.id, fd.get("formationId"));
  if (!f) return { erreur: "Formation introuvable." };
  const avant = await db.select().from(schema.articlesFormation).where(eq(schema.articlesFormation.formationId, f.id));
  for (const x of CATALOGUE) {
    const deja = avant.find((y) => y.code === x.code);
    const coche = fd.get(`c_${x.code}`) === "oui";
    if (coche && deja) await db.update(schema.articlesFormation).set({ quantite: quantite(fd.get(`q_${x.code}`)) }).where(eq(schema.articlesFormation.id, deja.id));
    else if (coche) await db.insert(schema.articlesFormation).values({ etablissementId: ctx.etab.id, formationId: f.id, code: x.code, libelle: x.libelle, categorie: x.categorie, mesure: x.mesure, quantite: quantite(fd.get(`q_${x.code}`)) });
    else if (deja) await db.delete(schema.articlesFormation).where(eq(schema.articlesFormation.id, deja.id));
  }
  // Les articles ajoutés par le lycée : gardés s'ils restent cochés.
  for (const y of avant.filter((y) => !y.code)) {
    if (fd.get(`p_${y.id}`) === "oui") await db.update(schema.articlesFormation).set({ quantite: quantite(fd.get(`qp_${y.id}`)) }).where(eq(schema.articlesFormation.id, y.id));
    else await db.delete(schema.articlesFormation).where(eq(schema.articlesFormation.id, y.id));
  }
  const n = (await db.select({ id: schema.articlesFormation.id }).from(schema.articlesFormation).where(eq(schema.articlesFormation.formationId, f.id))).length;
  await journaliser(ctx, "articles_formation_choisis", "formation", f.id, { articles: n });
  rafraichir();
  return { ok: `${f.libelle} : ${n} article(s).` };
}

/** Un article qui manque à la liste préremplie, avec sa taille à demander. */
export async function ajouterArticle(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const f = await formationDuLycee(ctx.etab.id, fd.get("formationId"));
  if (!f) return { erreur: "Formation introuvable." };
  const libelle = String(fd.get("libelle") ?? "").trim().slice(0, 60);
  if (libelle.length < 2) return { erreur: "Indiquez le nom de l'article (ex. Gilet pare-lame)." };
  const categorie = String(fd.get("categorie")) as CategorieArticle;
  if (!(categorie in CATEGORIES)) return { erreur: "Choisissez la sorte d'article." };
  const m = String(fd.get("mesure") ?? "");
  const mesure = m ? (m as Mesure) : null;
  if (mesure && !(mesure in MESURES)) return { erreur: "Choisissez la taille à demander." };
  await db.insert(schema.articlesFormation).values({ etablissementId: ctx.etab.id, formationId: f.id, libelle, categorie, mesure, quantite: quantite(fd.get("quantite")) });
  await journaliser(ctx, "article_ajoute", "formation", f.id, { libelle, mesure });
  rafraichir();
  return { ok: `« ${libelle} » ajouté à ${f.libelle}.` };
}

/** Les personnes que le DDFPT désigne pour la distribution (décision d'Anissa), et les relances avant la date limite. */
export async function enregistrerDistribution(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const membres = new Set((await equipe(ctx)).filter((u) => u.actif).map((u) => u.id));
  const distributeurs = fd.getAll("distributeur").map(String).filter((id) => membres.has(id));
  const tailles = lireJours(String(fd.get("relances") ?? ""));
  if (tailles === null) return { erreur: "Relances : des nombres de jours entre 1 et 60, séparés par des virgules (ex. 7, 2)." };
  const reglages = { ...ctx.etab.reglages, tenues: { distributeurs }, relances: { ...ctx.etab.reglages.relances, tailles } };
  await db.update(schema.etablissements).set({ reglages }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "distribution_reglee", "etablissement", ctx.etab.id, { distributeurs: distributeurs.length, tailles });
  revalidatePath("/", "layout");
  return { ok: "Distribution et relances enregistrées." };
}
