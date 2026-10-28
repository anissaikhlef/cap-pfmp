"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { compteReel, contexte, ouvrirSessionEntrainement, revenirAuVraiCompte } from "@/lib/auth";
import { compteDeLaPlace, creerLyceeEntrainement, PLACES, supprimerLyceeEntrainement, type Place } from "@/lib/entrainement";
import { profilDe } from "@/lib/aide";
import { noteQuiz, QUIZ, REUSSITE_QUIZ } from "@/lib/formation";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import type { Etat } from "@/components/Formulaire";

const ACCUEIL: Record<Place, string> = { equipe: "/", eleve: "/mon-stage", parent: "/mon-enfant", entreprise: "/stagiaires" };
const lirePlace = (v: FormDataEntryValue | null): Place => ((PLACES as readonly string[]).includes(String(v)) ? (String(v) as Place) : "equipe");

/**
 * Entrer dans son lycée d'entraînement (créé à la première fois), ou y changer de place : équipe, élève, parent, entreprise.
 * Réservé à l'équipe du lycée (pour les élèves, les parents et les entreprises, la visite guidée suffit).
 */
export async function entrerEntrainement(fd: FormData) {
  const ctx = await contexte();
  const place = lirePlace(fd.get("place"));
  let proprietaire = ctx.etab.entrainementDeId;
  if (!proprietaire) {
    const p = profilDe(ctx.user.roles);
    if (p !== "gestion" && p !== "professeur" && p !== "vie_scolaire") redirect("/formation");
    await creerLyceeEntrainement(ctx);
    await journaliser(ctx, "entrainement_ouvert", "utilisateur", ctx.user.id);
    proprietaire = ctx.user.id;
  }
  const u = await compteDeLaPlace(proprietaire, place);
  if (!u) redirect("/formation");
  // Les fiches de connexion préparées pendant l'entraînement demandent un nouveau mot de passe : pas pour y entrer d'ici.
  if (u.doitChangerMotDePasse) await db.update(schema.users).set({ doitChangerMotDePasse: false }).where(eq(schema.users.id, u.id));
  await ouvrirSessionEntrainement(u.id);
  redirect(ACCUEIL[place]);
}

/** Revenir à son vrai lycée. */
export async function quitterEntrainement() {
  await revenirAuVraiCompte();
  redirect("/formation");
}

/** Remettre à zéro son lycée d'entraînement : il sera recréé, tout neuf, à la prochaine entrée. */
export async function remettreAZero(fd: FormData) {
  const ctx = await contexte();
  const reel = ctx.etab.entrainementDeId ? await compteReel() : ctx;
  if (!reel) redirect("/connexion");
  if (ctx.etab.entrainementDeId) await revenirAuVraiCompte();
  await supprimerLyceeEntrainement(reel.user.id);
  revenirAvec(String(fd.get("__retour") ?? "/formation").startsWith("/formation") ? fd : "/formation", "Lycée d'entraînement remis à zéro : il sera tout neuf à votre prochaine entrée.");
}

/** Le quiz de prise en main : la meilleure note est gardée. */
export async function repondreQuiz(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (ctx.etab.entrainementDeId) return { erreur: "Revenez à votre lycée pour passer le quiz." };
  const profil = profilDe(ctx.user.roles);
  const questions = QUIZ[profil] ?? [];
  if (!questions.length) return { erreur: "Pas de quiz pour votre rôle." };
  const reponses = questions.map((_, i) => { const v = fd.get(`q_${i}`); return v === null ? null : Number(v); });
  if (reponses.some((r) => r === null)) return { erreur: "Répondez à toutes les questions." };
  const note = noteQuiz(profil, reponses);
  if (note > (ctx.user.quizNote ?? -1)) await db.update(schema.users).set({ quizNote: note, quizLe: new Date() }).where(eq(schema.users.id, ctx.user.id));
  await journaliser(ctx, "quiz_formation", "utilisateur", ctx.user.id, { note });
  return note >= REUSSITE_QUIZ
    ? { ok: `Quiz réussi : ${note} sur ${questions.length}.` }
    : { erreur: `${note} sur ${questions.length} : il faut ${REUSSITE_QUIZ} bonnes réponses. Relisez l'aide « ? » des pages, puis réessayez.` };
}
