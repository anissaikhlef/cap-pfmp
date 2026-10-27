"use server";
import { z } from "zod";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { envoyer } from "@/lib/messages";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { entreprisesDeLaPeriode } from "@/lib/entreprises-accueil";
import type { Etat } from "@/components/Formulaire";

/** Message groupé du DDFPT (ou de la direction) à toutes les entreprises qui accueillent les élèves d'une période. */
export async function ecrireAuxEntreprises(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: "Seuls le DDFPT et la direction écrivent aux entreprises d'accueil." };
  const p = z.object({
    periodeId: z.string().uuid("Choisissez une période"),
    sujet: z.string().trim().min(3, "Indiquez l'objet du message").max(200),
    message: z.string().trim().min(20, "Écrivez votre message").max(8000),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const liste = await entreprisesDeLaPeriode(ctx.etab.id, p.data.periodeId);
  if (!liste.length) return { erreur: "Aucune entreprise n'accueille d'élève sur cette période." };
  let n = 0;
  for (const x of liste) {
    if (!x.email) continue;
    await envoyer(ctx, {
      canal: "mail", destinataire: x.email, sujet: p.data.sujet, entrepriseId: x.ent.id,
      corps: `${p.data.message.replaceAll("{entreprise}", x.ent.nom)}\n\n—\nÉlève${x.eleves.length > 1 ? "s" : ""} accueilli${x.eleves.length > 1 ? "s" : ""} : ${x.eleves.join(", ")}.\n${ctx.etab.nom}`,
    });
    n++;
  }
  const sans = liste.filter((x) => !x.email).map((x) => x.ent.nom);
  await journaliser(ctx, "message_entreprises", "periode", p.data.periodeId, { n, sans: sans.length });
  revenirAvec(fd, `Message envoyé à ${n} entreprise(s)${sans.length ? ` ; sans adresse e-mail, à contacter autrement : ${sans.join(", ")}` : ""}. Envoi simulé tant qu'aucun prestataire n'est branché.`);
}
