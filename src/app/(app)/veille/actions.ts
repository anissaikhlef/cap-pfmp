"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { aLAgent } from "@/lib/agents";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { sourceOfficielle } from "@/lib/agents";
import { lireJours } from "@/lib/regles";
import { aujourdhui } from "@/lib/dates";
import { appliquerChangement, CIBLES, valeurDe, type Cible } from "@/lib/veille-def";
import { alerteVisible, comparerDocuments, peutProposerChangement, peutValiderChangement, suiteDe } from "@/lib/veille-lycee";

/** Lue, ou une décision sur une proposition : « c'est fait » ou « pas pour nous ». Rien ne change tout seul dans Cap PFMP. */
export async function suiteAlerte(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!aLAgent(ctx.etab.reglages, "veille")) revenirAvec(fd, "Votre lycée n'a pas choisi Cap Veille.", "err");
  const P = z.object({ alerteId: z.string().uuid(), proposition: z.coerce.number().int().min(0).max(20).optional(), decision: z.enum(["fait", "pas_pour_nous"]).optional() })
    .safeParse({ alerteId: fd.get("alerteId"), proposition: fd.get("proposition") ?? undefined, decision: fd.get("decision") ?? undefined });
  if (!P.success) revenirAvec(fd, "Demande invalide.", "err");
  const [al] = await db.select().from(schema.alertesVeille).where(and(eq(schema.alertesVeille.id, P.data.alerteId), isNotNull(schema.alertesVeille.publieeLe))).limit(1);
  if (!al || !alerteVisible(ctx, al)) revenirAvec(fd, "Alerte introuvable.", "err");
  const [s] = await db.select().from(schema.suitesVeille).where(and(eq(schema.suitesVeille.alerteId, al.id), eq(schema.suitesVeille.etablissementId, ctx.etab.id))).limit(1);
  const decisions = { ...(s?.decisions ?? {}) };
  if (P.data.proposition !== undefined && P.data.decision && P.data.proposition < al.propositions.length) decisions[String(P.data.proposition)] = P.data.decision;
  await db.insert(schema.suitesVeille).values({ alerteId: al.id, etablissementId: ctx.etab.id, lueLe: new Date(), decisions, parId: ctx.user.id })
    .onConflictDoUpdate({ target: [schema.suitesVeille.alerteId, schema.suitesVeille.etablissementId], set: { lueLe: s?.lueLe ?? new Date(), decisions, parId: ctx.user.id } });
  await journaliser(ctx, "veille_suite", "alerte_veille", al.id, { proposition: P.data.proposition, decision: P.data.decision });
  revalidatePath("/", "layout");
  revenirAvec(fd, P.data.decision ? (P.data.decision === "fait" ? "Proposition notée comme faite." : "Proposition écartée pour votre lycée.") : "Alerte marquée comme lue.");
}

async function chargerAlerte(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!aLAgent(ctx.etab.reglages, "veille")) revenirAvec(fd, "Votre lycée n'a pas choisi Cap Veille.", "err");
  const id = z.string().uuid().safeParse(fd.get("alerteId")).data;
  const [al] = id ? await db.select().from(schema.alertesVeille).where(eq(schema.alertesVeille.id, id)).limit(1) : [];
  if (!al || !alerteVisible(ctx, al)) revenirAvec(fd, "Alerte introuvable.", "err");
  return { ctx, al };
}

/** Compare le texte officiel avec tous les documents du lycée dans Cap PFMP (décision d'Anissa). */
export async function comparer(fd: FormData) {
  const { ctx, al } = await chargerAlerte(fd);
  const r = await comparerDocuments(ctx, al);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "veille_comparaison", "alerte_veille", al.id, { ecarts: r.n });
  revalidatePath("/veille");
  revenirAvec(fd, r.n ? `Cap Veille a trouvé ${r.n} écart(s) avec vos documents.` : "Cap Veille n'a trouvé aucun écart avec vos documents.");
}

/**
 * Appliquer en un clic un changement proposé (décision d'Anissa : « le DDFPT propose, la direction valide ») :
 * proposer, puis valider (le réglage change aussitôt) ou refuser.
 */
export async function decisionChangement(fd: FormData) {
  const { ctx, al } = await chargerAlerte(fd);
  const n = Number(fd.get("n"));
  const c = al.changements[n];
  if (!c) revenirAvec(fd, "Changement introuvable.", "err");
  const quoi = String(fd.get("quoi"));
  const s = await suiteDe(ctx, al.id);
  const applications = { ...(s?.applications ?? {}) };
  const a = applications[String(n)];
  const maintenant = new Date().toISOString();
  let message = "";
  if (quoi === "proposer") {
    if (!peutProposerChangement(ctx)) revenirAvec(fd, "C'est le DDFPT qui propose d'appliquer un changement.", "err");
    if (a) revenirAvec(fd, "Ce changement est déjà proposé.", "err");
    applications[String(n)] = { proposeParId: ctx.user.id, proposeLe: maintenant };
    message = "Changement proposé : la direction le valide avant qu'il s'applique.";
  } else {
    if (!peutValiderChangement(ctx)) revenirAvec(fd, "C'est la direction qui valide un changement.", "err");
    if (!a || a.valideLe || a.refuseLe) revenirAvec(fd, "Ce changement n'attend pas de validation.", "err");
    if (quoi === "valider") {
      const r = appliquerChangement(ctx.etab.reglages, { cible: c.cible as Cible, valeur: c.valeur });
      if (!r) revenirAvec(fd, "Ce changement ne peut pas s'appliquer (valeur incohérente avec vos autres réglages).", "err");
      await db.update(schema.etablissements).set({ reglages: r }).where(eq(schema.etablissements.id, ctx.etab.id));
      applications[String(n)] = { ...a, valideParId: ctx.user.id, valideLe: maintenant };
      message = `Changement appliqué : ${CIBLES[c.cible as Cible].libelle} = ${valeurDe({ cible: c.cible as Cible, valeur: c.valeur })}.`;
    } else {
      applications[String(n)] = { ...a, refuseLe: maintenant };
      message = "Changement refusé : rien ne change.";
    }
  }
  await db.insert(schema.suitesVeille).values({ alerteId: al.id, etablissementId: ctx.etab.id, lueLe: new Date(), applications, parId: ctx.user.id })
    .onConflictDoUpdate({ target: [schema.suitesVeille.alerteId, schema.suitesVeille.etablissementId], set: { applications } });
  await journaliser(ctx, `veille_changement_${quoi}`, "alerte_veille", al.id, { n, cible: c.cible, valeur: c.valeur });
  revalidatePath("/", "layout");
  revenirAvec(fd, message);
}

const Echeance = z.object({
  titre: z.string().trim().min(3, "Indiquez l'échéance (ex. Envoi des attestations à l'académie).").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date."),
  concerne: z.enum(["toutes", "examen"]),
});

/** Le calendrier des échéances : le DDFPT retient ou corrige une échéance proposée, en ajoute ou en retire. */
export async function enregistrerEcheance(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().safeParse(fd.get("id")).data;
  if (fd.get("quoi") === "retirer" && id) {
    await db.delete(schema.echeances).where(and(eq(schema.echeances.id, id), eq(schema.echeances.etablissementId, ctx.etab.id)));
    await journaliser(ctx, "echeance_retiree", "echeance", id);
    revalidatePath("/veille");
    revenirAvec(fd, "Échéance retirée du calendrier.");
  }
  const p = Echeance.safeParse({ titre: fd.get("titre"), date: fd.get("date"), concerne: fd.get("concerne") || "toutes" });
  if (!p.success) revenirAvec(fd, p.error.issues[0].message, "err");
  if (p.data.date < aujourdhui()) revenirAvec(fd, "Cette date est déjà passée.", "err");
  if (id) {
    const r = await db.update(schema.echeances).set({ ...p.data, statut: "retenue", majParId: ctx.user.id, majLe: new Date() })
      .where(and(eq(schema.echeances.id, id), eq(schema.echeances.etablissementId, ctx.etab.id))).returning({ id: schema.echeances.id });
    if (!r.length) revenirAvec(fd, "Échéance introuvable.", "err");
  } else {
    await db.insert(schema.echeances).values({ etablissementId: ctx.etab.id, ...p.data, statut: "retenue", majParId: ctx.user.id });
  }
  await journaliser(ctx, id ? "echeance_retenue" : "echeance_ajoutee", "echeance", id ?? null, p.data);
  revalidatePath("/veille");
  revenirAvec(fd, `Échéance ${id ? "retenue" : "ajoutée"} : ${p.data.titre}, le ${p.data.date.split("-").reverse().join("/")}.`);
}

/** Les rappels des échéances (jours avant la date) et les pages de l'académie que le lycée fait lire chaque semaine. */
export async function enregistrerVeilleDuLycee(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const jours = lireJours(String(fd.get("rappels") ?? ""));
  if (jours === null) revenirAvec(fd, "Rappels : des nombres de jours entre 1 et 60, séparés par des virgules (ex. 15, 3).", "err");
  const pages = [...new Set(String(fd.get("pages") ?? "").split("\n").map((x) => x.trim()).filter(Boolean))].slice(0, 10);
  const refusees = pages.filter((x) => !sourceOfficielle(x) && !/^https:\/\/([\w-]+\.)*ac-[\w-]+\.fr(\/|$)/.test(x));
  if (refusees.length) revenirAvec(fd, `Seuls les sites officiels sont acceptés (ministère, Légifrance, Éduscol, site de l'académie) : ${refusees.join(", ")}`, "err");
  const reglages = { ...ctx.etab.reglages, veillePages: pages, relances: { ...ctx.etab.reglages.relances, echeances: jours } };
  await db.update(schema.etablissements).set({ reglages }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "veille_lycee", "etablissement", ctx.etab.id, { pages, rappels: jours });
  revalidatePath("/veille");
  revenirAvec(fd, "Réglages de la veille enregistrés.");
}
