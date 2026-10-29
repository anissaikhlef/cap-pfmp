"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CaseRecap, StructureRecap } from "@/db/schema";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import { enregistrerClasseur, lireFichier } from "@/lib/stockage";
import { casesManquantes, ouvrirClasseur, reperer } from "@/lib/xlsx-modele";
import { modeleRecapitulatif } from "@/lib/recapitulatif";

const REFUS = "Seuls la direction et la gestion des PFMP règlent l'attestation récapitulative.";
const rafraichir = () => { revalidatePath("/organisation/recapitulatif"); revalidatePath("/recapitulatif"); };

/**
 * Dépôt du fichier Excel de l'académie (décision d'Anissa : « chaque lycée doit avoir l'option pour déposer le sien ») :
 * Cap PFMP repère ses cases d'après leurs intitulés ; le lycée vérifie et corrige si besoin.
 */
export async function deposerModeleRecap(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const f = fd.get("fichier");
  if (!(f instanceof File) || f.size === 0) return { erreur: "Choisissez le fichier Excel de l'académie." };
  const r = await enregistrerClasseur(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  let structure: StructureRecap;
  try {
    structure = reperer(ouvrirClasseur(await lireFichier(r.cle)));
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Ce fichier Excel n'a pas pu être lu." };
  }
  const valeurs = { cle: r.cle, nom: r.nom, structure, deposeLe: new Date(), deposeParId: ctx.user.id };
  await db.insert(schema.modelesRecapitulatifs).values({ etablissementId: ctx.etab.id, ...valeurs })
    .onConflictDoUpdate({ target: schema.modelesRecapitulatifs.etablissementId, set: valeurs });
  await journaliser(ctx, "modele_recapitulatif_depose", "etablissement", ctx.etab.id, { nom: r.nom, eleves: structure.feuillesEleves.length, manque: casesManquantes(structure) });
  rafraichir();
  const manque = casesManquantes(structure);
  return manque.length
    ? { erreur: `Fichier déposé, mais Cap PFMP n'a pas trouvé ${manque.join(", ")}. Indiquez ces cases ci-dessous.` }
    : { ok: `Fichier déposé : ${structure.feuillesEleves.length} onglets d'élèves et leurs cases reconnus. Vérifiez-les ci-dessous.` };
}

export async function enregistrerAcademie(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const academie = String(fd.get("academie") ?? "").trim().toUpperCase().slice(0, 60);
  await db.update(schema.etablissements).set({ reglages: { ...ctx.etab.reglages, academie } }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "academie_modifiee", "etablissement", ctx.etab.id, { academie });
  rafraichir();
  return { ok: academie ? `Académie enregistrée : ${academie}.` : "Académie retirée." };
}

const CASE = /^[A-Z]{1,3}[1-9]\d{0,4}$/, COL = /^[A-Z]{1,3}$/;
const CASES: CaseRecap[] = ["titre", "academie", "session", "etablissement", "nom", "prenom", "numero", "duree", "derogation", "visa"];

/** Corrections du lycée : où écrire chaque information (une case vide : rien n'y est écrit). */
export async function corrigerStructure(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const m = await modeleRecapitulatif(ctx.etab.id);
  if (!m) return { erreur: "Déposez d'abord le fichier de l'académie." };
  const lire = (k: string) => String(fd.get(k) ?? "").trim().toUpperCase().replace(/\$/g, "");
  const cases: StructureRecap["cases"] = {};
  for (const k of CASES) {
    const v = lire(`case_${k}`);
    if (v && !CASE.test(v)) return { erreur: `« ${v} » n'est pas une case (ex. D6).` };
    if (v) cases[k] = v;
  }
  const entier = (k: string) => { const n = Number(lire(k)); return Number.isInteger(n) && n > 0 && n < 10000 ? n : null; };
  const cols = ["debut", "fin", "entreprise", "jours"].map((k) => lire(`lignes_${k}`));
  let lignes: StructureRecap["lignes"] = null;
  if (cols.some(Boolean) || lire("lignes_premiere")) {
    const premiere = entier("lignes_premiere"), nombre = entier("lignes_nombre");
    if (!premiere || !nombre || cols.some((c) => !COL.test(c))) return { erreur: "Tableau des PFMP : indiquez la première ligne, le nombre de lignes et la colonne (lettre) de chaque information." };
    lignes = { premiere, nombre, debut: cols[0], fin: cols[1], entreprise: cols[2], jours: cols[3] };
  }
  const structure: StructureRecap = { ...m.structure, cases, lignes };
  await db.update(schema.modelesRecapitulatifs).set({ structure }).where(eq(schema.modelesRecapitulatifs.etablissementId, ctx.etab.id));
  await journaliser(ctx, "modele_recapitulatif_corrige", "etablissement", ctx.etab.id, { cases, lignes });
  rafraichir();
  const manque = casesManquantes(structure);
  return manque.length ? { erreur: `Enregistré. Il manque encore ${manque.join(", ")}.` } : { ok: "Cases enregistrées : le fichier de l'académie est prêt à être rempli." };
}

export async function retirerModeleRecap(_: Etat): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  await db.delete(schema.modelesRecapitulatifs).where(eq(schema.modelesRecapitulatifs.etablissementId, ctx.etab.id));
  await journaliser(ctx, "modele_recapitulatif_retire", "etablissement", ctx.etab.id, {});
  rafraichir();
  return { ok: "Fichier de l'académie retiré. La version Cap PFMP (Excel et PDF) reste disponible." };
}
