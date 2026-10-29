"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { eleveVisible, estReferentDe, gereToutLEtablissement } from "@/lib/acces";
import { proposerLieux, relireCv } from "@/lib/agent-entreprises";
import { ficheEntretien, guiderLettre, peutLancerPourLaClasse, preparerProspection, proposerPourLaClasse, prospects, relireLettre, tourEntretien } from "@/lib/agent-partenaires";
import { journaliser } from "@/lib/journal";
import { texteDuDocument } from "@/lib/ocr";
import { revenirAvec } from "@/lib/retour";

/** Cap Partenaires : l'élève lui-même, ou l'équipe qui le suit. */
async function eleveDe(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur", "eleve"] });
  const id = z.string().uuid().safeParse(fd.get("eleveId"));
  if (!id.success) revenirAvec(fd, "Élève introuvable.", "err");
  return { ctx, e: await eleveVisible(ctx, id.data) };
}

export async function proposerLieuxDeStage(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const r = await proposerLieux(ctx, e);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "lieux_proposes", "eleve", e.id, { n: r.n });
  revalidatePath("/", "layout");
  revenirAvec(fd, `Cap Partenaires propose ${r.n} lieu(x) de stage.`);
}

/**
 * Le texte d'un CV ou d'une lettre : collé, ou lu dans le document déposé (PDF, photo), sur le serveur de Cap PFMP
 * (décision d'Anissa : rien n'est envoyé à l'IA avant que le nom et les coordonnées soient retirés).
 */
async function texteDe(fd: FormData, quoi: string): Promise<string> {
  const f = fd.get("fichier");
  let texte = String(fd.get("texte") ?? "").trim();
  if (f instanceof File && f.size > 0) {
    const r = await texteDuDocument(f);
    if ("erreur" in r) revenirAvec(fd, r.erreur, "err");
    texte = r.texte;
  }
  if (texte.length < 40) revenirAvec(fd, `Colle le texte de ${quoi}, ou dépose le document (PDF ou photo).`, "err");
  if (texte.length > 8000) revenirAvec(fd, `Le texte est trop long : ${quoi} tient sur une page.`, "err");
  return texte;
}

export async function faireRelireCv(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const r = await relireCv(ctx, e, await texteDe(fd, "ton CV"));
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "cv_relu", "eleve", e.id, { depose: fd.get("fichier") instanceof File && (fd.get("fichier") as File).size > 0 });
  revalidatePath("/", "layout");
  revenirAvec(fd, "Cap Partenaires a relu le CV.");
}

export async function faireRelireLettre(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const r = await relireLettre(ctx, e, await texteDe(fd, "ta lettre"));
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "lettre_relue", "eleve", e.id);
  revalidatePath("/", "layout");
  revenirAvec(fd, "Cap Partenaires a relu la lettre de motivation.");
}

export async function guiderMaLettre(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const v = (k: string) => String(fd.get(k) ?? "").trim().slice(0, 1000);
  const rep = { entreprise: v("entreprise"), pourquoi: v("pourquoi"), savoirFaire: v("savoirFaire"), apprendre: v("apprendre") };
  if (!rep.entreprise && !rep.pourquoi && !rep.savoirFaire && !rep.apprendre) revenirAvec(fd, "Réponds à au moins une question.", "err");
  const r = await guiderLettre(ctx, e, rep);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "lettre_guidee", "eleve", e.id);
  revalidatePath("/", "layout");
  revenirAvec(fd, "Cap Partenaires t'a préparé un guide pour écrire ta lettre.");
}

export async function preparerEntretien(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const entreprise = String(fd.get("entreprise") ?? "").trim();
  if (entreprise.length < 2) revenirAvec(fd, "Indique l'entreprise à appeler.", "err");
  const r = await ficheEntretien(ctx, e, entreprise);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "entretien_fiche", "eleve", e.id);
  revalidatePath("/", "layout");
  revenirAvec(fd, "Ta fiche pour l'appel et l'entretien est prête.");
}

/** L'entraînement à l'entretien : commencer, ou répondre à la question du tuteur. */
export async function sEntrainer(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const commencer = fd.get("quoi") === "commencer";
  const reponse = String(fd.get("reponse") ?? "").trim();
  if (!commencer && reponse.length < 2) revenirAvec(fd, "Écris ta réponse.", "err");
  const r = await tourEntretien(ctx, e, commencer ? null : reponse, fd.get("oral") === "oui");
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  revalidatePath("/", "layout");
  revenirAvec(fd, commencer ? "L'entraînement commence : réponds au tuteur." : "Réponse envoyée.");
}

/** Propositions pour toute une classe (décision d'Anissa) : lancées par le DDFPT ou le référent, relues par le référent. */
export async function lancerPourLaClasse(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  const classeId = z.string().uuid().safeParse(fd.get("classeId")).data;
  if (!classeId || !(await peutLancerPourLaClasse(ctx, classeId))) revenirAvec(fd, "Seuls le DDFPT et le référent de la classe lancent la recherche.", "err");
  const r = await proposerPourLaClasse(ctx, classeId);
  if (r.erreur) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "lieux_proposes_classe", "classe", classeId, { eleves: r.eleves });
  revalidatePath("/", "layout");
  revenirAvec(fd, r.eleves ? `Cap Partenaires a préparé des propositions pour ${r.eleves} élève(s) sans stage : le référent les relit avant que les élèves les voient (« Propositions à relire »).` : "Aucun élève sans stage dans cette classe pour sa prochaine période.");
}

/** Le référent relit une proposition : il la montre à l'élève (en retirant les entreprises qui ne conviennent pas) ou l'écarte. */
export async function relireProposition(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  const id = z.string().uuid().safeParse(fd.get("id")).data;
  const [s] = id ? await db.select({ s: schema.suggestionsIa, e: schema.eleves }).from(schema.suggestionsIa)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.suggestionsIa.eleveId))
    .where(and(eq(schema.suggestionsIa.id, id), eq(schema.suggestionsIa.etablissementId, ctx.etab.id), eq(schema.suggestionsIa.aRelire, true), isNull(schema.suggestionsIa.relueLe))).limit(1) : [];
  if (!s || !(gereToutLEtablissement(ctx) || (await estReferentDe(ctx, s.e)))) revenirAvec(fd, "Proposition introuvable.", "err");
  if (fd.get("quoi") === "ecarter") {
    await db.delete(schema.suggestionsIa).where(eq(schema.suggestionsIa.id, s.s.id));
    await journaliser(ctx, "proposition_ecartee", "eleve", s.e.id);
    revalidatePath("/", "layout");
    revenirAvec(fd, `Proposition écartée pour ${s.e.prenom} ${s.e.nom}.`);
  }
  const gardees = (s.s.contenu.entreprises ?? []).filter((_, i) => fd.get(`garder_${i}`) === "oui");
  if (!gardees.length) revenirAvec(fd, "Gardez au moins une entreprise, ou écartez la proposition.", "err");
  await db.update(schema.suggestionsIa).set({ contenu: { ...s.s.contenu, entreprises: gardees }, relueLe: new Date(), relueParId: ctx.user.id }).where(eq(schema.suggestionsIa.id, s.s.id));
  await journaliser(ctx, "proposition_relue", "eleve", s.e.id, { entreprises: gardees.length });
  revalidatePath("/", "layout");
  revenirAvec(fd, `${s.e.prenom} ${s.e.nom} voit maintenant ${gardees.length} lieu(x) de stage proposé(s).`);
}

/**
 * Nouvelles entreprises pour le lycée (décision d'Anissa) : autour des communes des élèves d'une formation ; un mail de
 * prise de contact par entreprise attend la validation du DDFPT dans « Mails à valider ».
 */
export async function prospecter(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const formationId = z.string().uuid().safeParse(fd.get("formationId")).data;
  if (!formationId) revenirAvec(fd, "Choisissez la formation.", "err");
  const p = await prospects(ctx, formationId);
  const choisies = p.liste.filter((_, i) => fd.get(`prospect_${i}`) === "oui").slice(0, 10);
  if (!fd.has("prospect_0") && !choisies.length) revenirAvec(fd, "Cochez les entreprises à contacter.", "err");
  let n = 0;
  for (const x of choisies) {
    const r = await preparerProspection(ctx, x, p.formation);
    if (!r.ok) revenirAvec(fd, r.erreur, "err");
    n++;
  }
  await journaliser(ctx, "prospection", "formation", formationId, { entreprises: n });
  revalidatePath("/", "layout");
  revenirAvec(fd, n ? `${n} mail(s) de prise de contact préparé(s) : relisez-les dans « Mails à valider », indiquez l'adresse de chaque entreprise, puis envoyez.` : "Cochez les entreprises à contacter.", n ? "ok" : "err");
}
