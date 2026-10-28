"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer, peutFixerLesDates, peutGererClasse } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";

const REGLE_PAR_NIVEAU = { CAP: "prive", "2NDE": "prive", "1RE": "dominante", TLE: "dominante" } as const;

const ClasseSchema = z.object({
  libelle: z.string().trim().min(1, "Donnez un nom à la classe").max(60),
  niveau: z.enum(["CAP", "2NDE", "1RE", "TLE"]),
  filiere: z.string().trim().max(80).optional(),
  codeRome: z.union([z.string().trim().toUpperCase().regex(/^[A-Z]\d{4}$/, "Code ROME : une lettre et quatre chiffres (ex. K2503)"), z.literal("")]).optional(),
  anneeExamen: z.enum(["oui", "non"]).default("non"),
  formationId: z.union([z.string().uuid(), z.literal("")]).optional(),
  regleStructure: z.enum(["prive", "dominante", "libre", "auto"]).default("auto"),
  referentId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

/** La formation choisie (du lycée) : la classe reprend son libellé comme diplôme préparé, et son code ROME à défaut du sien. */
async function formationChoisie(etabId: string, id: string | undefined) {
  if (!id) return null;
  const [f] = await db.select().from(schema.formations).where(and(eq(schema.formations.id, id), eq(schema.formations.etablissementId, etabId))).limit(1);
  return f ?? null;
}

async function referentValide(etabId: string, id: string | undefined) {
  if (!id) return null;
  const [u] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.id, id), eq(schema.users.etablissementId, etabId))).limit(1);
  return u ? u.id : null;
}

export async function creerClasse(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: "Seuls la direction et les gestionnaires peuvent créer une classe." };
  const p = ClasseSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  const f = await formationChoisie(ctx.etab.id, v.formationId || undefined);
  const [c] = await db.insert(schema.classes).values({
    etablissementId: ctx.etab.id, libelle: v.libelle, niveau: v.niveau, filiere: f?.libelle ?? (v.filiere || null), codeRome: v.codeRome || f?.codeRome || null, formationId: f?.id ?? null, anneeExamen: v.niveau === "CAP" && v.anneeExamen === "oui",
    anneeScolaire: ctx.etab.anneeScolaire,
    regleStructure: v.regleStructure === "auto" ? REGLE_PAR_NIVEAU[v.niveau] : v.regleStructure,
    referentId: await referentValide(ctx.etab.id, v.referentId || undefined),
  }).returning({ id: schema.classes.id });
  await journaliser(ctx, "classe_creee", "classe", c.id);
  redirect(`/classes/${c.id}`);
}

export async function modifierClasse(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  if (!(await peutGererClasse(ctx, id))) return { erreur: "Vous ne gérez pas cette classe." };
  const p = ClasseSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  // Un professeur référent ne peut pas se retirer lui-même la gestion de sa classe : seule l'administration change le référent.
  const changeReferent = peutAdministrer(ctx);
  const f = await formationChoisie(ctx.etab.id, v.formationId || undefined);
  await db.update(schema.classes).set({
    libelle: v.libelle, niveau: v.niveau, filiere: f?.libelle ?? (v.filiere || null), codeRome: v.codeRome || f?.codeRome || null, formationId: f?.id ?? null, anneeExamen: v.niveau === "CAP" && v.anneeExamen === "oui",
    regleStructure: v.regleStructure === "auto" ? REGLE_PAR_NIVEAU[v.niveau] : v.regleStructure,
    ...(changeReferent ? { referentId: await referentValide(ctx.etab.id, v.referentId || undefined) } : {}),
  }).where(and(eq(schema.classes.id, id), eq(schema.classes.etablissementId, ctx.etab.id)));
  await journaliser(ctx, "classe_modifiee", "classe", id);
  revalidatePath(`/classes/${id}`);
  return { ok: "Classe enregistrée." };
}

/** Les dates de PFMP des classes sont fixées par le DDFPT (ou la direction) seulement ; elles figurent dans le calendrier commun. */
const REFUS_DATES = "Les dates de PFMP sont fixées par le DDFPT.";
async function datesModifiables(ctx: Awaited<ReturnType<typeof contexte>>, classeId: string) {
  return peutFixerLesDates(ctx) && (await peutGererClasse(ctx, classeId));
}

const PeriodeSchema = z.object({
  classeId: z.string().uuid(),
  libelle: z.string().trim().min(1).max(60),
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début manquante"),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin manquante"),
  /** Vide : toute la classe ; sinon, seulement les élèves de cette spécialité (décision d'Anissa). */
  dominanteId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

export async function ajouterPeriode(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const p = PeriodeSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  if (!(await datesModifiables(ctx, p.data.classeId))) return { erreur: REFUS_DATES };
  if (p.data.fin < p.data.debut) return { erreur: "La fin de la période est avant son début." };
  let dominanteId: string | null = null;
  if (p.data.dominanteId) {
    const [d] = await db.select().from(schema.dominantes).where(and(eq(schema.dominantes.id, p.data.dominanteId), eq(schema.dominantes.etablissementId, ctx.etab.id))).limit(1);
    if (!d) return { erreur: "Spécialité introuvable." };
    dominanteId = d.id;
  }
  await db.insert(schema.periodes).values({ classeId: p.data.classeId, libelle: p.data.libelle, debut: p.data.debut, fin: p.data.fin, dominanteId });
  await journaliser(ctx, "periode_ajoutee", "classe", p.data.classeId, p.data);
  for (const x of [`/classes/${p.data.classeId}`, "/calendrier"]) revalidatePath(x);
  return { ok: "Période ajoutée." };
}

export async function modifierPeriode(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const p = PeriodeSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  if (!(await datesModifiables(ctx, p.data.classeId))) return { erreur: REFUS_DATES };
  if (p.data.fin < p.data.debut) return { erreur: "La fin de la période est avant son début." };
  await db.update(schema.periodes).set({ libelle: p.data.libelle, debut: p.data.debut, fin: p.data.fin })
    .where(and(eq(schema.periodes.id, id), eq(schema.periodes.classeId, p.data.classeId), isNull(schema.periodes.eleveId)));
  await journaliser(ctx, "periode_modifiee", "classe", p.data.classeId, p.data);
  for (const x of [`/classes/${p.data.classeId}`, "/calendrier"]) revalidatePath(x);
  return { ok: "Période mise à jour." };
}

export async function supprimerPeriode(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const classeId = z.string().uuid().parse(fd.get("classeId"));
  if (!(await datesModifiables(ctx, classeId))) return;
  const [st] = await db.select({ id: schema.stages.id }).from(schema.stages).where(eq(schema.stages.periodeId, id)).limit(1);
  if (st) return; // une période avec des stages ne peut pas être supprimée
  // Seulement une période de la classe : un rattrapage se gère depuis la fiche de l'élève.
  await db.delete(schema.periodes).where(and(eq(schema.periodes.id, id), eq(schema.periodes.classeId, classeId), isNull(schema.periodes.eleveId)));
  await journaliser(ctx, "periode_supprimee", "classe", classeId);
  for (const x of [`/classes/${classeId}`, "/calendrier"]) revalidatePath(x);
}
