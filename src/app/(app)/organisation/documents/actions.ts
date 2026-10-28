"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { enregistrerFichier } from "@/lib/stockage";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { lireChampsPdf } from "@/lib/modeles-pdf";
import { lireCompetences, lireGrille, lireNiveaux, lireQuestions, SOURCES_SPECIALES, sourceValable } from "@/lib/modeles";
import { modeleDuLycee } from "@/lib/modeles-documents";
import type { Etat } from "@/components/Formulaire";
import type { ChampPdf, PersonnalisationModele, TypeModele } from "@/db/schema";

const TYPES = ["convention", "ordre_mission", "attestation", "livret"] as const;
/** Documents dont le lycée peut déposer son propre PDF (avec des champs) : la convention, pour l'instant. */
const TYPES_PDF = ["convention"] as const;
const REFUS = "Seuls le DDFPT et la direction adaptent les modèles de documents.";
const NB_RUBRIQUES = 5;

type Ctx = Awaited<ReturnType<typeof contexte>>;

async function enregistrerModele(ctx: Ctx, type: TypeModele, v: Partial<typeof schema.modelesDocuments.$inferInsert>) {
  const maj = { ...v, majLe: new Date(), majParId: ctx.user.id };
  await db.insert(schema.modelesDocuments).values({ etablissementId: ctx.etab.id, type, ...maj })
    .onConflictDoUpdate({ target: [schema.modelesDocuments.etablissementId, schema.modelesDocuments.type], set: maj });
  for (const p of ["/organisation/documents", `/organisation/documents/${type}`]) revalidatePath(p);
}

/** Le lycée choisit, pour un document, le modèle Cap PFMP adapté ou son propre PDF. */
export async function choisirMode(fd: FormData) {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) revenirAvec(fd, REFUS, "err");
  const type = z.enum(TYPES).parse(fd.get("type"));
  const mode = z.enum(["cap_pfmp", "pdf"]).parse(fd.get("mode"));
  if (mode === "pdf" && type !== "convention") revenirAvec(fd, "Pour l'instant, seule la convention peut suivre le PDF de votre lycée.", "err");
  if (mode === "pdf" && !(await modeleDuLycee(ctx.etab.id, type)).pdfCle) revenirAvec(fd, "Déposez d'abord le PDF de votre lycée, plus bas sur cette page.", "err");
  await enregistrerModele(ctx, type, { mode });
  await journaliser(ctx, "modele_choisi", "etablissement", ctx.etab.id, { type, mode });
  revenirAvec(fd, mode === "pdf"
    ? "Les nouvelles conventions sont remplies dans le PDF de votre lycée. Celles déjà signées gardent leur modèle."
    : "Les nouvelles conventions suivent le modèle Cap PFMP. Celles déjà signées gardent leur modèle.");
}

/** Le modèle Cap PFMP adapté : titre, introduction, engagements, rubriques ajoutées, pied de page. */
export async function enregistrerPersonnalisation(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const type = z.enum(TYPES).parse(fd.get("type"));
  const texte = (n: string, max: number) => String(fd.get(n) ?? "").trim().slice(0, max);
  const rubriques = Array.from({ length: NB_RUBRIQUES }, (_, i) => ({ titre: texte(`rubrique_titre_${i}`, 150), texte: texte(`rubrique_texte_${i}`, 4000) }))
    .filter((r) => r.titre || r.texte);
  const p: PersonnalisationModele = {
    ...(texte("titre", 200) ? { titre: texte("titre", 200) } : {}),
    ...(texte("introduction", 2000) ? { introduction: texte("introduction", 2000) } : {}),
    ...(texte("engagements", 4000) ? { engagements: texte("engagements", 4000) } : {}),
    ...(rubriques.length ? { rubriques } : {}),
    ...(texte("piedDePage", 500) ? { piedDePage: texte("piedDePage", 500) } : {}),
  };
  if (type === "ordre_mission") {
    const questions = lireQuestions(String(fd.get("questions") ?? ""));
    const grille = lireGrille(String(fd.get("grille") ?? ""));
    if (!questions.length) return { erreur: "Indiquez au moins une question pour l'appel de la première semaine." };
    if (!grille.length) return { erreur: "Indiquez au moins un critère dans la grille des attitudes professionnelles." };
    p.questions = questions;
    p.grille = grille;
  }
  if (type === "livret") {
    const niveaux = lireNiveaux(String(fd.get("niveauxCompetences") ?? ""));
    if (!niveaux) return { erreur: "Indiquez au moins deux niveaux d'acquisition des compétences, séparés par « / »." };
    p.niveauxCompetences = niveaux;
    p.competences = Array.from({ length: 20 }, (_, i) => ({ filiere: texte(`filiere_${i}`, 200), liste: lireCompetences(String(fd.get(`competences_${i}`) ?? "")) }))
      .filter((c) => c.filiere && c.liste.length);
  }
  await enregistrerModele(ctx, type, { personnalisation: p });
  await journaliser(ctx, "modele_adapte", "etablissement", ctx.etab.id, { type });
  return { ok: type === "convention" ? "Modèle enregistré. Il s'applique aux conventions qui ne sont pas encore signées."
    : type === "attestation" ? "Modèle enregistré. Il s'applique aux attestations remplies à partir de maintenant ; celles déjà signées ne changent pas."
    : type === "livret" ? "Modèle enregistré. Il s'applique aux livrets remplis à partir de maintenant ; ceux déjà signés ne changent pas."
    : "Modèle enregistré." };
}

/** Dépôt du PDF du lycée (un « PDF modifiable », avec ses champs) : chaque champ reçoit une donnée proposée. */
export async function deposerPdfModele(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const type = z.enum(TYPES_PDF).parse(fd.get("type"));
  const f = fd.get("pdf");
  if (!(f instanceof File) || f.size === 0) return { erreur: "Choisissez le PDF de votre lycée." };
  const champs = await lireChampsPdf(new Uint8Array(await f.arrayBuffer()));
  if (typeof champs === "string") return { erreur: champs };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  if (r.mime !== "application/pdf") return { erreur: "Déposez un fichier PDF." };
  // Un PDF mis à jour garde ce qui avait été choisi pour les champs du même nom.
  const avant = (await modeleDuLycee(ctx.etab.id, type)).champs;
  const fusion: ChampPdf[] = champs.map((c) => {
    const a = avant.find((x) => x.nom === c.nom && x.type === c.type);
    return a ? { ...c, source: a.source, ...(a.fixe ? { fixe: a.fixe } : {}), ...(a.libelle ? { libelle: a.libelle } : {}) } : { ...c, ...(c.source === SOURCES_SPECIALES.famille || c.source === SOURCES_SPECIALES.entreprise ? { libelle: c.nom } : {}) };
  });
  await enregistrerModele(ctx, type, { pdfCle: r.cle, pdfNom: r.nom, champs: fusion });
  await journaliser(ctx, "modele_pdf_depose", "etablissement", ctx.etab.id, { type, champs: fusion.length });
  return { ok: `PDF déposé : ${fusion.length} champ(s). Vérifiez ci-dessous ce que Cap PFMP écrit dans chacun.` };
}

/** Ce que Cap PFMP écrit dans chaque champ du PDF du lycée. */
export async function enregistrerChamps(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const type = z.enum(TYPES_PDF).parse(fd.get("type"));
  const m = await modeleDuLycee(ctx.etab.id, type);
  if (!m.pdfCle) return { erreur: "Déposez d'abord le PDF de votre lycée." };
  if (fd.get("cle") !== m.pdfCle) return { erreur: "Le PDF a été remplacé entre-temps : rechargez la page." };
  let refuses = 0;
  const champs: ChampPdf[] = m.champs.map((c, i) => {
    const source = String(fd.get(`src_${i}`) ?? c.source);
    if (!sourceValable(source, c.type)) { refuses++; return c; }
    const fixe = String(fd.get(`fixe_${i}`) ?? "").trim().slice(0, 300);
    const libelle = String(fd.get(`q_${i}`) ?? "").trim().slice(0, 120);
    return {
      nom: c.nom, type: c.type, pages: c.pages, ...(c.options ? { options: c.options } : {}), source,
      ...(source === SOURCES_SPECIALES.fixe ? { fixe } : {}),
      ...(source === SOURCES_SPECIALES.famille || source === SOURCES_SPECIALES.entreprise ? { libelle: libelle || c.nom } : {}),
    };
  });
  await enregistrerModele(ctx, type, { champs });
  await journaliser(ctx, "modele_champs", "etablissement", ctx.etab.id, { type });
  return refuses ? { erreur: `${refuses} champ(s) n'ont pas été modifiés : choix impossible pour ce type de champ.` } : { ok: "Champs enregistrés." };
}

/** Le logo du lycée, en tête des documents du modèle Cap PFMP. */
export async function deposerLogo(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: REFUS };
  const f = fd.get("logo");
  if (!(f instanceof File) || f.size === 0) return { erreur: "Choisissez l'image du logo." };
  if (f.size > 1024 * 1024) return { erreur: "Logo trop lourd : 1 Mo au plus." };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  if (r.mime !== "image/png" && r.mime !== "image/jpeg") return { erreur: "Déposez une image PNG ou JPG." };
  await db.update(schema.etablissements).set({ logoCle: r.cle }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "logo_depose", "etablissement", ctx.etab.id);
  revalidatePath("/organisation/documents");
  return { ok: "Logo enregistré. Il apparaît sur les conventions qui ne sont pas encore signées." };
}

export async function retirerLogo(fd: FormData) {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) revenirAvec(fd, REFUS, "err");
  await db.update(schema.etablissements).set({ logoCle: null }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "logo_retire", "etablissement", ctx.etab.id);
  revenirAvec(fd, "Logo retiré.");
}
