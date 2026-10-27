"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { revenirAvec } from "@/lib/retour";
import { adresseDuSite } from "@/lib/liens";
import { campagneEnCours, enregistrerReponse, lienDeReponse, lirePlaces, relancerEntreprise, reponsesCampagne } from "@/lib/campagne";
import type { Etat } from "@/components/Formulaire";

export async function lancerCampagne(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return { erreur: "Action réservée aux gestionnaires des PFMP." };
  const sujet = String(fd.get("sujet") ?? "").trim().slice(0, 200);
  const message = String(fd.get("message") ?? "").trim().slice(0, 8000);
  if (!sujet || message.length < 20) return { erreur: "Le message est vide." };
  const ids = fd.getAll("entreprises").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  if (!ids.length) return { erreur: "Cochez au moins une entreprise." };
  const ents = await db.select().from(schema.entreprises).where(and(eq(schema.entreprises.etablissementId, ctx.etab.id), inArray(schema.entreprises.id, ids)));
  const sansMail = ents.filter((e) => !e.email);
  // Les liens de la campagne précédente encore ouverts ne valent plus : la réponse porte sur la nouvelle campagne.
  await db.delete(schema.liensAcces).where(and(eq(schema.liensAcces.etablissementId, ctx.etab.id), eq(schema.liensAcces.objet, "campagne"), isNull(schema.liensAcces.utiliseLe)));
  const [c] = await db.insert(schema.campagnes).values({ etablissementId: ctx.etab.id, anneeScolaire: ctx.etab.anneeScolaire, sujet, message, envoyeeLe: new Date(), creeParId: ctx.user.id }).returning();
  const base = await adresseDuSite();
  for (const e of ents) {
    await db.insert(schema.campagneReponses).values({ campagneId: c.id, entrepriseId: e.id }).onConflictDoNothing();
    if (!e.email) continue;
    // Chaque entreprise reçoit son lien personnel pour répondre en ligne, sans compte.
    const lien = await lienDeReponse(ctx, { ...e, email: e.email }, base);
    await envoyer(ctx, { canal: "mail", destinataire: e.email, sujet, corps: `${message.replaceAll("{entreprise}", e.nom)}\n\n${lien}`, entrepriseId: e.id });
  }
  await journaliser(ctx, "campagne_envoyee", "campagne", c.id, { n: ents.length });
  revalidatePath("/campagne");
  revenirAvec(fd, `Campagne envoyée à ${ents.length - sansMail.length} entreprise(s), chacune avec son lien pour répondre en ligne${sansMail.length ? ` ; ${sansMail.length} sans adresse e-mail (${sansMail.map((e) => e.nom).join(", ")}) à contacter autrement` : ""}. Envoi simulé tant qu'aucun prestataire n'est branché.`);
}

export async function saisirReponse(fd: FormData) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return;
  const c = await campagneEnCours(ctx);
  if (!c) return;
  const entrepriseId = z.string().uuid().parse(fd.get("entrepriseId"));
  const [r] = await db.select().from(schema.campagneReponses)
    .where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, entrepriseId))).limit(1);
  if (!r) return;
  const places = lirePlaces(fd);
  const total = Object.values(places).reduce((a, b) => a + b, 0);
  await enregistrerReponse(ctx.etab.id, c.id, entrepriseId, places);
  await journaliser(ctx, "campagne_reponse", "entreprise", entrepriseId, { places, total });
  revalidatePath("/campagne");
  revenirAvec(fd, `Réponse enregistrée : ${total} place(s) au total.`);
}

export async function relancerCampagne(fd: FormData) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return;
  const c = await campagneEnCours(ctx);
  if (!c) return;
  const base = await adresseDuSite();
  let n = 0;
  for (const { r, e } of await reponsesCampagne(c.id)) {
    if (!r.reponduLe && (await relancerEntreprise(ctx, c, e, base))) n++;
  }
  await journaliser(ctx, "campagne_relance", "campagne", c.id, { n });
  revalidatePath("/campagne");
  revenirAvec(fd, `${n} entreprise(s) relancée(s).`);
}
