"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, elevesDuParent, estReferentDe, gereToutLEtablissement } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { languesDuLycee, libelleLangue } from "@/lib/langues";
import { revenirAvec } from "@/lib/retour";

/**
 * La langue de la famille (décision d'Anissa) : indiquée par le DDFPT ou le référent sur la fiche de l'élève, ou choisie
 * par les parents dans « Mon enfant ». Vide : le français.
 */
export async function choisirLangue(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().safeParse(fd.get("eleveId")).data;
  const [e] = id ? await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1) : [];
  const permis = !!e && (gereToutLEtablissement(ctx) || (await estReferentDe(ctx, e)) || (a(ctx, "parent") && (await elevesDuParent(ctx)).includes(e.id)));
  if (!e || !permis) revenirAvec(fd, "Vous ne pouvez pas choisir la langue de cette famille.", "err");
  const code = String(fd.get("langue") ?? "");
  if (code && !languesDuLycee(ctx.etab.reglages.langues).some((l) => l.code === code)) revenirAvec(fd, "Langue inconnue.", "err");
  await db.update(schema.eleves).set({ langueFamille: code || null }).where(eq(schema.eleves.id, e.id));
  await journaliser(ctx, "langue_famille_choisie", "eleve", e.id, { langue: code || "fr" });
  revalidatePath("/mon-enfant");
  revalidatePath(`/eleves/${e.id}`);
  const l = libelleLangue(code, ctx.etab.reglages.langues);
  revenirAvec(fd, l ? `Langue de la famille : ${l}. Les messages aux parents et l'espace « Mon enfant » sont traduits, avec le français dessous.` : "Langue de la famille : français.");
}
