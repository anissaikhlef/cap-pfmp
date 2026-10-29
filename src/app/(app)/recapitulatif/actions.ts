"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import { classesDuRecapitulatif, peutViser } from "@/lib/recapitulatif";
import { revenirAvec } from "@/lib/retour";

/** L'élève, s'il est dans une classe d'examen dont la personne prépare l'attestation récapitulative. */
async function eleveAutorise(eleveId: unknown) {
  const ctx = await contexte();
  const id = z.string().uuid().safeParse(eleveId).data;
  const classes = (await classesDuRecapitulatif(ctx)).map((c) => c.id);
  const [e] = id && classes.length ? await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, classes))).limit(1) : [];
  return { ctx, e };
}

/** Numéro de candidat, durée du cycle (si elle diffère de la formation) et dérogation d'un élève. */
export async function enregistrerCandidat(_: Etat, fd: FormData): Promise<Etat> {
  const { ctx, e } = await eleveAutorise(fd.get("eleveId"));
  if (!e) return { erreur: "Vous ne préparez pas l'attestation de cet élève." };
  const numero = String(fd.get("numero") ?? "").trim().toUpperCase();
  if (numero && !/^[A-Z0-9\- ]{1,20}$/.test(numero)) return { erreur: "Numéro de candidat : des chiffres et des lettres, 20 caractères au plus." };
  const brut = String(fd.get("dureeCycle") ?? "");
  const dureeCycle = brut ? Number(brut) : null;
  if (dureeCycle !== null && ![1, 2, 3].includes(dureeCycle)) return { erreur: "Durée du cycle : 1, 2 ou 3 ans." };
  const derogation = fd.get("derogation") === "oui";
  await db.update(schema.eleves).set({ numeroCandidat: numero || null, dureeCycle, derogation }).where(eq(schema.eleves.id, e.id));
  await journaliser(ctx, "candidat_modifie", "eleve", e.id, { numero: numero || null, dureeCycle, derogation });
  revalidatePath("/recapitulatif");
  return { ok: `${e.prenom} ${e.nom} : enregistré.` };
}

/** Visa du chef d'établissement : seule la direction vise (décision d'Anissa). */
export async function viserClasse(fd: FormData) {
  const ctx = await contexte();
  if (!peutViser(ctx)) revenirAvec(fd, "Seule la direction vise l'attestation récapitulative.", "err");
  const classeId = String(fd.get("classeId") ?? "");
  if (!(await classesDuRecapitulatif(ctx)).some((c) => c.id === classeId)) revenirAvec(fd, "Classe introuvable.", "err");
  const vises = await db.update(schema.eleves).set({ visaRecapLe: new Date(), visaRecapParId: ctx.user.id })
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.eleves.classeId, classeId), eq(schema.eleves.archive, false), isNull(schema.eleves.visaRecapLe)))
    .returning({ id: schema.eleves.id });
  await journaliser(ctx, "recapitulatif_vise", "classe", classeId, { eleves: vises.length });
  revalidatePath("/recapitulatif");
  revenirAvec(fd, vises.length ? `Attestations visées : ${vises.length} élève(s). La croix du visa figure désormais dans les fichiers.` : "Toutes les attestations de la classe étaient déjà visées.");
}

export async function retirerVisa(fd: FormData) {
  const { ctx, e } = await eleveAutorise(fd.get("eleveId"));
  if (!peutViser(ctx)) revenirAvec(fd, "Seule la direction vise l'attestation récapitulative.", "err");
  if (!e) revenirAvec(fd, "Élève introuvable.", "err");
  await db.update(schema.eleves).set({ visaRecapLe: null, visaRecapParId: null }).where(eq(schema.eleves.id, e.id));
  await journaliser(ctx, "recapitulatif_visa_retire", "eleve", e.id, {});
  revalidatePath("/recapitulatif");
  revenirAvec(fd, `Visa retiré pour ${e.prenom} ${e.nom}.`);
}
