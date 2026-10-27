"use server";
import { redirect } from "next/navigation";
import { fermerSession } from "@/lib/auth";

export async function seDeconnecter() {
  await fermerSession();
  redirect("/connexion");
}

import { contexte } from "@/lib/auth";
import { classesGerees, gereToutLEtablissement } from "@/lib/acces";
import { relancesDuJour } from "@/lib/relances";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";

/** Envoie tout de suite les relances du jour pour les classes gérées (elles partent aussi seules, chaque matin). */
export async function envoyerRelancesDuJour(fd: FormData) {
  const ctx = await contexte();
  const classes = await classesGerees(ctx);
  if (!classes.length) return;
  // La campagne de rentrée concerne tout le lycée : seuls ceux qui gèrent tout l'établissement la relancent d'ici.
  const n = await relancesDuJour(ctx.etab, { classes, userId: ctx.user.id, campagne: gereToutLEtablissement(ctx) });
  await journaliser(ctx, "relances_du_jour", "etablissement", ctx.etab.id, { n });
  revenirAvec(fd, n ? `${n} relance(s) envoyée(s). Retrouvez-les dans « Messages ».` : "Aucune relance à envoyer aujourd'hui. Les jours de relance se règlent dans « Organisation ».");
}
