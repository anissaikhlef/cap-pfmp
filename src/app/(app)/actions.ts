"use server";
import { redirect } from "next/navigation";
import { fermerSession } from "@/lib/auth";

export async function seDeconnecter() {
  await fermerSession();
  redirect("/connexion");
}

import { contexte } from "@/lib/auth";
import { classesGerees } from "@/lib/acces";
import { relancesDuJour } from "@/lib/relances";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";

export async function envoyerRelancesDuJour(fd: FormData) {
  const ctx = await contexte();
  const classes = await classesGerees(ctx);
  if (!classes.length) return;
  const n = await relancesDuJour(ctx.etab, { classes, userId: ctx.user.id });
  await journaliser(ctx, "relances_du_jour", "etablissement", ctx.etab.id, { n });
  revenirAvec(fd, n ? `${n} relance(s) envoyée(s). Retrouvez-les dans « Messages ».` : "Aucune relance à envoyer aujourd'hui : elles partent 7 et 3 jours avant le départ, puis 3 et 10 jours après la fin du stage.");
}
