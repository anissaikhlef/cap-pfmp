"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contexte } from "@/lib/auth";
import { eleveVisible } from "@/lib/acces";
import { proposerLieux, relireCv } from "@/lib/agent-entreprises";
import { journaliser } from "@/lib/journal";
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

export async function faireRelireCv(fd: FormData) {
  const { ctx, e } = await eleveDe(fd);
  const texte = String(fd.get("texte") ?? "").trim();
  if (texte.length < 40) revenirAvec(fd, "Colle le texte de ton CV (au moins quelques lignes).", "err");
  if (texte.length > 8000) revenirAvec(fd, "Le texte est trop long : un CV tient sur une page.", "err");
  const r = await relireCv(ctx, e, texte);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "cv_relu", "eleve", e.id);
  revalidatePath("/", "layout");
  revenirAvec(fd, "Cap Partenaires a relu le CV.");
}
