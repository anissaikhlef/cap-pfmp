"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contexte } from "@/lib/auth";
import { chargerConvention } from "@/lib/convention";
import { noterActivites } from "@/lib/livret";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { jourDuCarnetValable } from "@/lib/regles";
import type { Etat } from "@/components/Formulaire";

/** Carnet de bord : l'élève note les activités d'un jour de son stage (une note par jour, qu'il peut corriger). */
export async function noterActivitesDuJour(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["eleve"] });
  const cv = await chargerConvention(ctx, z.string().uuid().parse(fd.get("stageId")));
  // L'élève ne note que son propre stage.
  if (!cv || cv.e.userId !== ctx.user.id) return { erreur: "Stage introuvable." };
  const date = String(fd.get("date") ?? "");
  if (!jourDuCarnetValable(date, cv.p.debut, cv.p.fin, aujourdhui())) return { erreur: "Choisissez un jour de votre stage : aujourd'hui ou un jour passé." };
  const texte = String(fd.get("texte") ?? "").trim().slice(0, 2000);
  if (texte.length < 5) return { erreur: "Décrivez ce que vous avez fait ce jour-là." };
  await noterActivites(ctx.etab.id, cv.s.id, date, texte, ctx.user.id);
  revalidatePath("/mon-stage");
  return { ok: `Activités du ${dateLongue(date)} enregistrées.` };
}
