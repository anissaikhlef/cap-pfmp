"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererRattrapage } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { alerterRattrapage } from "@/lib/rattrapages";
import { revenirAvec } from "@/lib/retour";
import { dateCourte, dateLongue } from "@/lib/dates";
import type { Etat } from "@/components/Formulaire";

type Ctx = Awaited<ReturnType<typeof contexte>>;

async function eleveAutorise(ctx: Ctx, eleveId: string) {
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e?.classeId || !(await peutGererRattrapage(ctx, e))) return null;
  return e;
}

/** Les périodes de l'élève cette année : celles de sa classe et ses rattrapages. */
async function periodesDeLEleve(classeId: string, eleveId: string) {
  return db.select().from(schema.periodes)
    .where(and(eq(schema.periodes.classeId, classeId), or(isNull(schema.periodes.eleveId), eq(schema.periodes.eleveId, eleveId))));
}

const Dates = z.object({
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début manquante"),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin manquante"),
  motif: z.string().trim().min(3, "Indiquez le motif du rattrapage (par exemple : absence pour maladie pendant la PFMP 1).").max(300),
  rattrapeId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

function chevauchement(periodes: { id: string; libelle: string; debut: string; fin: string }[], debut: string, fin: string, sauf?: string) {
  return periodes.find((x) => x.id !== sauf && x.debut <= fin && x.fin >= debut) ?? null;
}

export async function programmerRattrapage(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const e = await eleveAutorise(ctx, z.string().uuid().parse(fd.get("eleveId")));
  if (!e?.classeId) return { erreur: "Vous ne pouvez pas programmer de rattrapage pour cet élève." };
  const p = Dates.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const { debut, fin, motif } = p.data;
  if (fin < debut) return { erreur: "La fin du rattrapage est avant son début." };
  const siennes = await periodesDeLEleve(e.classeId, e.id);
  const conflit = chevauchement(siennes, debut, fin);
  if (conflit) return { erreur: `Ces dates chevauchent « ${conflit.libelle} » (du ${dateCourte(conflit.debut)} au ${dateCourte(conflit.fin)}).` };
  const rattrapee = siennes.find((x) => x.id === p.data.rattrapeId && !x.eleveId) ?? null;
  const [periode] = await db.insert(schema.periodes).values({
    classeId: e.classeId, eleveId: e.id, libelle: rattrapee ? `Rattrapage ${rattrapee.libelle}` : "Rattrapage",
    debut, fin, motif, rattrapeId: rattrapee?.id ?? null, creeParId: ctx.user.id,
  }).returning();
  await journaliser(ctx, "rattrapage_programme", "eleve", e.id, { debut, fin, motif });
  const n = await alerterRattrapage(ctx, e, periode, "programme");
  revalidatePath(`/eleves/${e.id}`);
  revalidatePath("/vie-scolaire");
  revenirAvec(`/eleves/${e.id}?periode=${periode.id}`, `Rattrapage programmé du ${dateLongue(debut)} au ${dateLongue(fin)}.${n ? ` La vie scolaire et l'équipe sont prévenues (${n} message${n > 1 ? "s" : ""}).` : ""} Enregistrez maintenant le lieu de stage de ce rattrapage.`);
}

export async function modifierRattrapage(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const e = await eleveAutorise(ctx, z.string().uuid().parse(fd.get("eleveId")));
  if (!e?.classeId) return { erreur: "Vous ne pouvez pas modifier ce rattrapage." };
  const id = z.string().uuid().parse(fd.get("id"));
  const p = Dates.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  const { debut, fin, motif } = p.data;
  if (fin < debut) return { erreur: "La fin du rattrapage est avant son début." };
  const siennes = await periodesDeLEleve(e.classeId, e.id);
  const actuel = siennes.find((x) => x.id === id && x.eleveId === e.id);
  if (!actuel) return { erreur: "Rattrapage introuvable." };
  const conflit = chevauchement(siennes, debut, fin, id);
  if (conflit) return { erreur: `Ces dates chevauchent « ${conflit.libelle} » (du ${dateCourte(conflit.debut)} au ${dateCourte(conflit.fin)}).` };
  const [periode] = await db.update(schema.periodes).set({ debut, fin, motif }).where(eq(schema.periodes.id, id)).returning();
  await journaliser(ctx, "rattrapage_modifie", "eleve", e.id, { debut, fin, motif });
  if (actuel.debut !== debut || actuel.fin !== fin) await alerterRattrapage(ctx, e, periode, "modifie");
  revalidatePath(`/eleves/${e.id}`);
  revalidatePath("/vie-scolaire");
  return { ok: actuel.debut !== debut || actuel.fin !== fin ? "Rattrapage modifié. La vie scolaire est prévenue des nouvelles dates." : "Rattrapage modifié." };
}

export async function annulerRattrapage(fd: FormData) {
  const ctx = await contexte();
  const e = await eleveAutorise(ctx, z.string().uuid().parse(fd.get("eleveId")));
  if (!e) return;
  const id = z.string().uuid().parse(fd.get("id"));
  const [p] = await db.select().from(schema.periodes).where(and(eq(schema.periodes.id, id), eq(schema.periodes.eleveId, e.id))).limit(1);
  if (!p) return;
  const [st] = await db.select({ id: schema.stages.id }).from(schema.stages).where(eq(schema.stages.periodeId, id)).limit(1);
  if (st) revenirAvec(fd, "Retirez d'abord le lieu de stage de ce rattrapage.", "err");
  await db.delete(schema.periodes).where(eq(schema.periodes.id, id));
  await journaliser(ctx, "rattrapage_annule", "eleve", e.id, { debut: p.debut, fin: p.fin });
  await alerterRattrapage(ctx, e, p, "annule");
  revalidatePath("/vie-scolaire");
  revenirAvec(`/eleves/${e.id}`, "Rattrapage annulé. La vie scolaire est prévenue.");
}
