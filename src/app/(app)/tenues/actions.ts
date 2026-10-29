"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Tailles } from "@/db/schema";
import { contexte } from "@/lib/auth";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import { revenirAvec } from "@/lib/retour";
import { classesDesTenues, enregistrerRemise, gereLesTenues, peutSaisirTailles, prevenirPourLesTailles } from "@/lib/tenues";
import { MESURES, tailleValide } from "@/lib/tenues-def";

const rafraichir = () => { revalidatePath("/tenues", "layout"); revalidatePath("/mon-stage"); revalidatePath("/mon-enfant"); };

/**
 * Le DDFPT ouvre la saisie des tailles d'une classe, avec une date limite (décision d'Anissa) : l'élève et sa famille
 * sont prévenus, puis relancés avant la date limite tant que les tailles manquent. Changer la date ne renvoie pas de message.
 */
export async function ouvrirSaisie(fd: FormData) {
  const ctx = await contexte();
  if (!gereLesTenues(ctx)) revenirAvec(fd, "Seuls le DDFPT et la direction ouvrent la saisie des tailles.", "err");
  const dateLimite = String(fd.get("dateLimite") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLimite) || dateLimite < aujourdhui()) revenirAvec(fd, "Choisissez une date limite à venir.", "err");
  const ids = fd.getAll("classeId").map(String);
  const classes = (await classesDesTenues(ctx)).filter((c) => ids.includes(c.id));
  if (!classes.length) revenirAvec(fd, "Cochez au moins une classe.", "err");
  let ouvertes = 0, messages = 0;
  for (const c of classes) {
    const [deja] = await db.select().from(schema.campagnesTenues).where(eq(schema.campagnesTenues.classeId, c.id)).limit(1);
    if (deja) { await db.update(schema.campagnesTenues).set({ dateLimite }).where(eq(schema.campagnesTenues.id, deja.id)); continue; }
    await db.insert(schema.campagnesTenues).values({ etablissementId: ctx.etab.id, classeId: c.id, dateLimite, ouverteParId: ctx.user.id });
    ouvertes++;
    if (!c.articles.some((x) => x.mesure)) continue;
    const eleves = await db.select().from(schema.eleves).where(and(eq(schema.eleves.classeId, c.id), eq(schema.eleves.archive, false)));
    for (const e of eleves) messages += await prevenirPourLesTailles(ctx, e, dateLimite, false);
  }
  await journaliser(ctx, "saisie_tailles_ouverte", "etablissement", ctx.etab.id, { classes: classes.map((c) => c.libelle), dateLimite, messages });
  rafraichir();
  revenirAvec(fd, ouvertes
    ? `Saisie des tailles ouverte jusqu'au ${dateLongue(dateLimite)} pour ${classes.map((c) => c.libelle).join(", ")} : ${messages} message(s) envoyé(s) aux élèves et aux familles.`
    : `Date limite changée : ${dateLongue(dateLimite)}.`);
}

/** Les tailles d'un élève : par lui-même, sa famille, ou l'équipe pour un élève qui n'a pas de compte. */
export async function enregistrerTailles(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().safeParse(fd.get("eleveId")).data;
  const [e] = id ? await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1) : [];
  if (!e || !(await peutSaisirTailles(ctx, e))) return { erreur: "Vous ne pouvez pas indiquer les tailles de cet élève." };
  const tailles: Tailles = { ...e.tailles };
  for (const m of Object.keys(MESURES) as (keyof typeof MESURES)[]) {
    if (!fd.has(m)) continue;
    const v = String(fd.get(m) ?? "").trim().toUpperCase();
    if (!v) { delete tailles[m]; continue; }
    if (!tailleValide(m, v)) return { erreur: `${MESURES[m].libelle} : choisissez dans la liste.` };
    tailles[m] = v;
  }
  await db.update(schema.eleves).set({ tailles, taillesLe: new Date(), taillesParId: ctx.user.id }).where(eq(schema.eleves.id, e.id));
  await journaliser(ctx, "tailles_indiquees", "eleve", e.id, tailles);
  rafraichir();
  return { ok: "Tailles enregistrées. Merci !" };
}

/** La remise, signée par l'élève sur l'appareil de la personne qui distribue. */
export async function remettre(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().safeParse(fd.get("eleveId")).data;
  if (!id) return { erreur: "Élève introuvable." };
  const r = await enregistrerRemise(ctx, id, fd.getAll("article").map(String), String(fd.get("image") ?? ""));
  if ("erreur" in r) return r;
  await journaliser(ctx, "tenue_remise", "eleve", id, { articles: fd.getAll("article").length });
  rafraichir();
  return r;
}

