"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { classesGerees, eleveVisible, gereToutLEtablissement } from "@/lib/acces";
import { envoyerMailValide, mailsDuJour, peutValiderMail, preparerMail } from "@/lib/agent-administratif";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";

async function charger(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  const id = z.string().uuid().parse(fd.get("id"));
  const [m] = await db.select().from(schema.mailsAValider)
    .where(and(eq(schema.mailsAValider.id, id), eq(schema.mailsAValider.etablissementId, ctx.etab.id), eq(schema.mailsAValider.statut, "a_valider"))).limit(1);
  if (!m) revenirAvec(fd, "Ce mail a déjà été traité.", "err");
  if (!(await peutValiderMail(ctx, m))) revenirAvec(fd, "Ce mail est validé par le professeur référent de l'élève ou par la gestion des PFMP.", "err");
  return { ctx, m };
}

/** « Envoyer » : le mail part tel que l'agent l'a préparé (ou modifié dans le formulaire). */
export async function validerMail(fd: FormData) {
  const { ctx, m } = await charger(fd);
  const Texte = z.object({ sujet: z.string().trim().min(3, "Sujet du mail manquant").max(200), corps: z.string().trim().min(10, "Texte du mail manquant").max(5000) });
  const t = Texte.safeParse({ sujet: fd.get("sujet") ?? m.sujet, corps: fd.get("corps") ?? m.corps });
  if (!t.success) revenirAvec(fd, t.error.issues[0].message, "err");
  const modifie = t.data.sujet !== m.sujet || t.data.corps !== m.corps;
  const { sms } = await envoyerMailValide(ctx, m, t.data, fd.get("sms") === "oui");
  await journaliser(ctx, "mail_agent_envoye", "mail_a_valider", m.id, { modifie, sms });
  revalidatePath("/", "layout");
  revenirAvec(fd, `Mail envoyé à ${m.destinataires.map((d) => d.nom).join(", ")}${modifie ? ", avec vos modifications" : ""}${sms ? `, et ${sms} SMS` : ""}.`);
}

/** « Ne pas envoyer » : le mail est écarté ; l'agent ne le proposera plus. */
export async function ecarterMail(fd: FormData) {
  const { ctx, m } = await charger(fd);
  await db.update(schema.mailsAValider).set({ statut: "abandonne", traiteParId: ctx.user.id, traiteLe: new Date() })
    .where(and(eq(schema.mailsAValider.id, m.id), eq(schema.mailsAValider.etablissementId, ctx.etab.id)));
  await journaliser(ctx, "mail_agent_ecarte", "mail_a_valider", m.id);
  revalidatePath("/", "layout");
  revenirAvec(fd, "Mail écarté : il ne partira pas.");
}

/** « Préparer les mails du jour » : Cap Admin passe tout de suite sur les classes de la personne (il passe aussi chaque matin). */
export async function preparerMailsDuJour(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  const classes = gereToutLEtablissement(ctx) ? undefined : await classesGerees(ctx);
  const r = await mailsDuJour(ctx.etab, { classes });
  await journaliser(ctx, "mails_agent_prepares", "etablissement", ctx.etab.id, { prepares: r.prepares });
  revalidatePath("/", "layout");
  if (r.erreur) revenirAvec(fd, `${r.prepares} mail(s) préparé(s). ${r.erreur}`, "err");
  revenirAvec(fd, r.prepares ? `Cap Admin a préparé ${r.prepares} mail(s) : relisez-les avant de les envoyer.` : "Cap Admin n'a trouvé aucun nouveau mail à préparer.");
}

/** Depuis la fiche d'un élève : l'équipe demande un mail à Cap Admin. */
export async function demanderMail(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  const P = z.object({
    eleveId: z.string().uuid(), pour: z.enum(["famille", "tuteur"]),
    consigne: z.string().trim().min(10, "Dites en une phrase ce que le mail doit dire.").max(1000),
  }).safeParse(Object.fromEntries(fd));
  if (!P.success) revenirAvec(fd, P.error.issues[0].message, "err");
  const e = await eleveVisible(ctx, P.data.eleveId);
  const r = await preparerMail(ctx, e, P.data.pour, P.data.consigne);
  if (!r.ok) revenirAvec(fd, r.erreur, "err");
  await journaliser(ctx, "mail_agent_demande", "eleve", e.id, { pour: P.data.pour });
  revalidatePath("/", "layout");
  revenirAvec(fd, "Cap Admin a préparé le mail : relisez-le dans « Mails à valider » avant de l'envoyer.");
}
