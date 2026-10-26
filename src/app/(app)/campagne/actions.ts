"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { revenirAvec } from "@/lib/retour";
import { campagneEnCours } from "@/lib/campagne";
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
  const [c] = await db.insert(schema.campagnes).values({ etablissementId: ctx.etab.id, anneeScolaire: ctx.etab.anneeScolaire, sujet, message, envoyeeLe: new Date(), creeParId: ctx.user.id }).returning();
  for (const e of ents) {
    await db.insert(schema.campagneReponses).values({ campagneId: c.id, entrepriseId: e.id }).onConflictDoNothing();
    if (e.email) await envoyer(ctx, { canal: "mail", destinataire: e.email, sujet, corps: message.replaceAll("{entreprise}", e.nom), entrepriseId: e.id });
  }
  await journaliser(ctx, "campagne_envoyee", "campagne", c.id, { n: ents.length });
  revalidatePath("/campagne");
  revenirAvec(fd, `Campagne envoyée à ${ents.length - sansMail.length} entreprise(s)${sansMail.length ? ` ; ${sansMail.length} sans adresse e-mail (${sansMail.map((e) => e.nom).join(", ")}) à contacter autrement` : ""}. Envoi simulé tant qu'aucun prestataire n'est branché.`);
}

export async function saisirReponse(fd: FormData) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return;
  const c = await campagneEnCours(ctx);
  if (!c) return;
  const entrepriseId = z.string().uuid().parse(fd.get("entrepriseId"));
  const places: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^places_([0-9a-f-]{36})$/);
    if (m && String(v).trim() !== "") places[m[1]] = Math.max(0, Math.min(20, Math.floor(Number(v)) || 0));
  }
  const total = Object.values(places).reduce((a, b) => a + b, 0);
  await db.update(schema.campagneReponses).set({ placesParClasse: places, reponduLe: new Date() })
    .where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, entrepriseId)));
  // Les places annoncées alimentent l'annuaire et les suggestions faites aux élèves.
  await db.update(schema.entreprises).set({ placesParDefaut: Math.max(...Object.values(places), 0) })
    .where(and(eq(schema.entreprises.id, entrepriseId), eq(schema.entreprises.etablissementId, ctx.etab.id)));
  await journaliser(ctx, "campagne_reponse", "entreprise", entrepriseId, { places, total });
  revalidatePath("/campagne");
  revenirAvec(fd, `Réponse enregistrée : ${total} place(s) au total.`);
}

export async function relancerCampagne(fd: FormData) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) return;
  const c = await campagneEnCours(ctx);
  if (!c) return;
  const sans = await db.select({ r: schema.campagneReponses, e: schema.entreprises }).from(schema.campagneReponses)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.campagneReponses.entrepriseId))
    .where(eq(schema.campagneReponses.campagneId, c.id));
  let n = 0;
  for (const { r, e } of sans.filter((x) => !x.r.reponduLe)) {
    if (!e.email) continue;
    await envoyer(ctx, { canal: "mail", destinataire: e.email, sujet: `Relance : ${c.sujet}`, corps: `Madame, Monsieur,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre réponse à notre message ci-dessous. Elle nous aiderait beaucoup à placer nos élèves.\n\n---\n${c.message.replaceAll("{entreprise}", e.nom)}`, entrepriseId: e.id });
    await db.update(schema.campagneReponses).set({ relanceLe: new Date() }).where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, r.entrepriseId)));
    n++;
  }
  await journaliser(ctx, "campagne_relance", "campagne", c.id, { n });
  revalidatePath("/campagne");
  revenirAvec(fd, `${n} entreprise(s) relancée(s).`);
}
