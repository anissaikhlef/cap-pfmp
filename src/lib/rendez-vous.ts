import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { envoyer } from "./messages";
import { dateLongue, jourSemaine, JOURS } from "./dates";

type Etab = typeof schema.etablissements.$inferSelect;
type Mode = "presentiel" | "distanciel";

/** Jours de validité du lien de prise de rendez-vous envoyé à l'entreprise. */
export const JOURS_LIEN_RENDEZ_VOUS = 14;

/** « mardi 3 novembre à 10h ». */
export function texteCreneau([d, h]: [string, string]) {
  return `${JOURS[jourSemaine(d)].toLowerCase()} ${dateLongue(d).replace(/ \d{4}$/, "")} à ${h.replace(":", "h")}`;
}

export const texteMode = (m: Mode) => (m === "presentiel" ? "sur place" : "à distance");

/**
 * Ferme le lien de prise de rendez-vous encore ouvert pour ce stage (nouvelle proposition, visite rendue ou autre visiteur) :
 * il expire, et la page invite l'entreprise à utiliser le dernier message reçu.
 */
export async function fermerLienRendezVous(stageId: string) {
  const maintenant = new Date();
  await db.update(schema.liensAcces).set({ expireLe: maintenant }).where(and(
    eq(schema.liensAcces.stageId, stageId), eq(schema.liensAcces.objet, "rendezvous"), isNull(schema.liensAcces.utiliseLe), gt(schema.liensAcces.expireLe, maintenant),
  ));
}

/** La visite d'un stage, avec ce qu'il faut pour prendre rendez-vous (élève, entreprise, professeur). */
export async function visitePourRendezVous(etabId: string, stageId: string) {
  const [r] = await db.select({ v: schema.visites, s: schema.stages, e: schema.eleves, ent: schema.entreprises }).from(schema.visites)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(eq(schema.visites.stageId, stageId)).limit(1);
  if (!r || r.e.etablissementId !== etabId) return null;
  const [visiteur] = r.v.visiteurId ? await db.select().from(schema.users).where(eq(schema.users.id, r.v.visiteurId)).limit(1) : [];
  return { ...r, visiteur: visiteur ?? null };
}
export type VisiteRdv = NonNullable<Awaited<ReturnType<typeof visitePourRendezVous>>>;

/**
 * Le rendez-vous est pris : la visite reçoit sa date, son heure et sa forme ; le professeur et l'entreprise reçoivent
 * une confirmation (avec le lien de visio ou le téléphone pour une visite à distance).
 */
export async function confirmerRendezVous(ctx: { etab: Etab; user: { id: string } | null }, x: VisiteRdv, i: number, mode: Mode, commentaire: string | null, par: "entreprise" | "professeur") {
  const creneau = x.v.creneauxProposes![i];
  const [d, h] = creneau;
  await db.update(schema.visites).set({ date: d, heure: h, mode, rdvCommentaire: commentaire }).where(eq(schema.visites.id, x.v.id));
  const quand = `le ${texteCreneau(creneau)}, ${texteMode(mode)}`;
  const distance = mode === "distanciel" && x.v.lienDistance ? `\nPour la visite à distance : ${x.v.lienDistance}` : "";
  // Le professeur est prévenu quand c'est l'entreprise qui a choisi ; l'entreprise reçoit toujours la confirmation.
  if (x.visiteur && par === "entreprise") {
    await envoyer(ctx, {
      canal: "mail", destinataire: x.visiteur.email, sujet: `Visite de ${x.e.prenom} ${x.e.nom} : rendez-vous pris`, eleveId: x.e.id, entrepriseId: x.ent.id,
      corps: `${x.ent.nom} a choisi le rendez-vous ${quand}.${commentaire ? `\nSon message : « ${commentaire} »` : ""}${distance}\n\n${ctx.etab.nom}`,
    });
  }
  const contact = x.s.tuteur?.email ?? x.ent.email;
  if (contact) {
    await envoyer(ctx, {
      canal: "mail", destinataire: contact, sujet: `Visite de stage de ${x.e.prenom} ${x.e.nom} : ${texteCreneau(creneau)}`, eleveId: x.e.id, entrepriseId: x.ent.id,
      corps: `Madame, Monsieur,\n\nLa visite de stage de ${x.e.prenom} ${x.e.nom} est confirmée ${quand}${x.visiteur ? `, avec ${x.visiteur.prenom} ${x.visiteur.nom}` : ""}.${distance}\n\nMerci,\n${ctx.etab.nom}`,
    });
  }
  return quand;
}

/** Aucun créneau ne convient à l'entreprise : le professeur reçoit son message et propose d'autres créneaux. */
export async function signalerAucunCreneau(ctx: { etab: Etab; user: { id: string } | null }, x: VisiteRdv, commentaire: string) {
  await db.update(schema.visites).set({ rdvCommentaire: commentaire }).where(eq(schema.visites.id, x.v.id));
  if (x.visiteur) {
    await envoyer(ctx, {
      canal: "mail", destinataire: x.visiteur.email, sujet: `Visite de ${x.e.prenom} ${x.e.nom} : aucun créneau ne convient`, eleveId: x.e.id, entrepriseId: x.ent.id,
      corps: `${x.ent.nom} ne peut à aucun des créneaux proposés. Son message : « ${commentaire} »\nProposez-lui d'autres créneaux depuis la page de la visite.\n\n${ctx.etab.nom}`,
    });
  }
}
