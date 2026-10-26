"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutVoirNotes } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";

function rafraichir(eleveId: string) {
  revalidatePath(`/eleves/${eleveId}`);
  revalidatePath(`/vie-scolaire/eleves/${eleveId}`);
}

/** Note de suivi sur un élève : vie scolaire, gestion, référent. Jamais visible par l'élève, sa famille ou l'entreprise. */
export async function ajouterNote(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const texte = String(fd.get("texte") ?? "").trim();
  if (texte.length < 2) return { erreur: "Écrivez la note avant de l'enregistrer." };
  if (texte.length > 2000) return { erreur: "Note trop longue (2 000 caractères au maximum)." };
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e || !(await peutVoirNotes(ctx, e))) return { erreur: "Vous ne pouvez pas ajouter de note sur cet élève." };
  await db.insert(schema.notesEleves).values({ etablissementId: ctx.etab.id, eleveId, auteurId: ctx.user.id, texte });
  await journaliser(ctx, "note_ajoutee", "eleve", eleveId);
  rafraichir(eleveId);
  return { ok: "Note enregistrée. Elle est visible par la vie scolaire, la gestion des stages et le professeur référent." };
}

/** Seul l'auteur retire sa note. */
export async function retirerNote(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("id"));
  const [n] = await db.select().from(schema.notesEleves)
    .where(and(eq(schema.notesEleves.id, id), eq(schema.notesEleves.etablissementId, ctx.etab.id), eq(schema.notesEleves.auteurId, ctx.user.id))).limit(1);
  if (!n) return;
  await db.delete(schema.notesEleves).where(eq(schema.notesEleves.id, id));
  await journaliser(ctx, "note_retiree", "eleve", n.eleveId);
  rafraichir(n.eleveId);
}
