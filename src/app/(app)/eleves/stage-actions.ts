"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererEleve, eleveVisible } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { lireHoraires, placesOccupees, entrepriseDuLycee } from "@/lib/stages";
import { aujourdhui } from "@/lib/dates";
import type { Etat } from "@/components/Formulaire";

async function eleveEtPeriode(ctx: Awaited<ReturnType<typeof contexte>>, eleveId: string, periodeId: string) {
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e || !e.classeId) return null;
  const [p] = await db.select().from(schema.periodes).where(and(eq(schema.periodes.id, periodeId), eq(schema.periodes.classeId, e.classeId))).limit(1);
  if (!p) return null;
  return { e, p };
}

export async function enregistrerStage(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const periodeId = z.string().uuid().safeParse(fd.get("periodeId"));
  const entrepriseId = z.string().uuid().safeParse(fd.get("entrepriseId"));
  if (!periodeId.success) return { erreur: "Choisissez la période." };
  if (!entrepriseId.success) return { erreur: "Choisissez l'entreprise." };
  const x = await eleveEtPeriode(ctx, eleveId, periodeId.data);
  if (!x || !(await peutGererEleve(ctx, x.e))) return { erreur: "Vous ne gérez pas cet élève." };
  const ent = await entrepriseDuLycee(ctx, entrepriseId.data);
  if (!ent) return { erreur: "Entreprise introuvable." };
  const h = lireHoraires(fd);
  if (typeof h === "string") return { erreur: h };
  const [existant] = await db.select().from(schema.stages).where(and(eq(schema.stages.eleveId, eleveId), eq(schema.stages.periodeId, x.p.id))).limit(1);
  const occ = await placesOccupees(ent.id, x.p.debut, x.p.fin, eleveId);
  const avertissement = occ >= ent.placesParDefaut ? ` Attention : ${ent.nom} accueille déjà ${occ} élève(s) sur cette période pour ${ent.placesParDefaut} place(s) annoncée(s).` : "";
  if (existant) {
    // Changer d'entreprise ou d'horaires invalide les signatures déjà recueillies : la convention doit être refaite.
    const change = existant.entrepriseId !== ent.id || JSON.stringify(existant.horaires) !== JSON.stringify(h);
    await db.update(schema.stages).set({ entrepriseId: ent.id, horaires: h, ...(change ? { signatures: {} } : {}) }).where(eq(schema.stages.id, existant.id));
    await journaliser(ctx, "stage_modifie", "eleve", eleveId, { entreprise: ent.nom, signaturesEffacees: change });
    revalidatePath(`/eleves/${eleveId}`);
    const msg = (change && Object.keys(existant.signatures).length ? "Stage modifié. Les signatures déjà recueillies ont été effacées : la convention doit être signée de nouveau." : "Stage enregistré.") + avertissement;
    redirect(`/eleves/${eleveId}?periode=${x.p.id}&msg=${encodeURIComponent(msg)}`);
  }
  await db.insert(schema.stages).values({ eleveId, periodeId: x.p.id, entrepriseId: ent.id, horaires: h, signatures: {} });
  // La démarche correspondante passe en « accord »
  await db.update(schema.demarches).set({ reponse: "accord" }).where(and(eq(schema.demarches.eleveId, eleveId), eq(schema.demarches.entrepriseId, ent.id)));
  await journaliser(ctx, "stage_cree", "eleve", eleveId, { entreprise: ent.nom });
  revalidatePath(`/eleves/${eleveId}`);
  redirect(`/eleves/${eleveId}?periode=${x.p.id}&msg=${encodeURIComponent("Stage enregistré. Vérifiez les règles avant de lancer la convention." + avertissement)}`);
}

export async function supprimerStage(fd: FormData) {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e || !(await peutGererEleve(ctx, e))) return;
  await db.delete(schema.stages).where(and(eq(schema.stages.id, stageId), eq(schema.stages.eleveId, eleveId)));
  await journaliser(ctx, "stage_supprime", "eleve", eleveId);
  revalidatePath(`/eleves/${eleveId}`);
}

/* ------------------------------- Démarches ------------------------------- */

const REPONSES = ["attente", "refus", "entretien", "accord"] as const;

/** L'élève lui-même, ou un gestionnaire, peut tenir le journal des démarches. */
async function peutTenirDemarches(ctx: Awaited<ReturnType<typeof contexte>>, eleveId: string) {
  const e = await eleveVisible(ctx, eleveId).catch(() => null);
  if (!e) return null;
  if (e.userId === ctx.user.id) return e;
  if (await peutGererEleve(ctx, e)) return e;
  return null;
}

export async function ajouterDemarche(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const e = await peutTenirDemarches(ctx, eleveId);
  if (!e) return { erreur: "Action non autorisée." };
  const p = z.object({
    entrepriseNom: z.string().trim().min(2, "Nom de l'entreprise manquant").max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    reponse: z.enum(REPONSES),
    entrepriseId: z.union([z.string().uuid(), z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  if (p.data.date > aujourdhui()) return { erreur: "La date ne peut pas être dans le futur." };
  let entrepriseId: string | null = null;
  if (p.data.entrepriseId) entrepriseId = (await entrepriseDuLycee(ctx, p.data.entrepriseId))?.id ?? null;
  else {
    // Rattache la démarche à une entreprise de l'annuaire si le nom correspond
    const [m] = await db.select({ id: schema.entreprises.id }).from(schema.entreprises)
      .where(and(eq(schema.entreprises.etablissementId, ctx.etab.id), sql`lower(${schema.entreprises.nom}) = lower(${p.data.entrepriseNom})`)).limit(1);
    entrepriseId = m?.id ?? null;
  }
  await db.insert(schema.demarches).values({ eleveId, entrepriseNom: p.data.entrepriseNom, entrepriseId, date: p.data.date, reponse: p.data.reponse });
  await journaliser(ctx, "demarche_ajoutee", "eleve", eleveId);
  revalidatePath("/mon-stage"); revalidatePath(`/eleves/${eleveId}`);
  return { ok: "Démarche ajoutée." };
}

/** Ajout rapide depuis une suggestion : « Je l'ai contactée ». */
export async function contacterSuggestion(fd: FormData) {
  const ctx = await contexte({ roles: ["eleve"] });
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const entrepriseId = z.string().uuid().parse(fd.get("entrepriseId"));
  const e = await peutTenirDemarches(ctx, eleveId);
  const ent = await entrepriseDuLycee(ctx, entrepriseId);
  if (!e || !ent) return;
  await db.insert(schema.demarches).values({ eleveId, entrepriseNom: ent.nom, entrepriseId: ent.id, date: aujourdhui(), reponse: "attente" });
  await journaliser(ctx, "demarche_ajoutee", "eleve", eleveId);
  revalidatePath("/mon-stage");
}

export async function majDemarche(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const reponse = z.enum(REPONSES).parse(fd.get("reponse"));
  const [d] = await db.select().from(schema.demarches).where(eq(schema.demarches.id, id)).limit(1);
  if (!d || !(await peutTenirDemarches(ctx, d.eleveId))) return;
  await db.update(schema.demarches).set({ reponse }).where(eq(schema.demarches.id, id));
  revalidatePath("/mon-stage"); revalidatePath(`/eleves/${d.eleveId}`);
}

export async function supprimerDemarche(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const [d] = await db.select().from(schema.demarches).where(eq(schema.demarches.id, id)).limit(1);
  if (!d || !(await peutTenirDemarches(ctx, d.eleveId))) return;
  await db.delete(schema.demarches).where(eq(schema.demarches.id, id));
  revalidatePath("/mon-stage"); revalidatePath(`/eleves/${d.eleveId}`);
}

