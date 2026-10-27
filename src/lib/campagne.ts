import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesAvecPeriodes } from "./requetes";
import { classesGerees } from "./acces";
import { dateLongue } from "./dates";
import { envoyer } from "./messages";
import { creerLien } from "./liens";

/** Durée de validité du lien personnel envoyé aux entreprises pour répondre à la campagne. */
export const JOURS_LIEN_CAMPAGNE = 30;

type Campagne = typeof schema.campagnes.$inferSelect;
type Entreprise = typeof schema.entreprises.$inferSelect;
type Expediteur = { etab: { id: string }; user?: { id: string } | null };

/** La dernière campagne envoyée par le lycée pour son année scolaire en cours. */
export async function campagneDe(etab: { id: string; anneeScolaire: string }) {
  const [c] = await db.select().from(schema.campagnes)
    .where(and(eq(schema.campagnes.etablissementId, etab.id), eq(schema.campagnes.anneeScolaire, etab.anneeScolaire)))
    .orderBy(desc(schema.campagnes.envoyeeLe)).limit(1);
  return c ?? null;
}

export async function campagneEnCours(ctx: Contexte) {
  return campagneDe(ctx.etab);
}

export async function reponsesCampagne(campagneId: string) {
  return db.select({ r: schema.campagneReponses, e: schema.entreprises }).from(schema.campagneReponses)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.campagneReponses.entrepriseId))
    .where(eq(schema.campagneReponses.campagneId, campagneId)).orderBy(asc(schema.entreprises.nom));
}

/** Les classes de l'année qui ont des périodes de PFMP : ce sont elles que l'entreprise voit en répondant. */
export async function classesDeLaCampagne(etab: { id: string; anneeScolaire: string }) {
  const classes = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)))
    .orderBy(asc(schema.classes.libelle));
  if (!classes.length) return [];
  const periodes = await db.select().from(schema.periodes)
    .where(and(inArray(schema.periodes.classeId, classes.map((c) => c.id)), isNull(schema.periodes.eleveId)))
    .orderBy(asc(schema.periodes.debut));
  return classes.map((c) => ({ ...c, periodes: periodes.filter((p) => p.classeId === c.id) })).filter((c) => c.periodes.length > 0);
}

/** Crée le lien personnel d'une entreprise et le texte qui l'accompagne dans le mail. */
export async function lienDeReponse(exp: Expediteur, e: Entreprise & { email: string }, base: string) {
  const { jeton, expireLe } = await creerLien(exp.etab.id, {
    objet: "campagne", destinataire: e.email, jours: JOURS_LIEN_CAMPAGNE, entrepriseId: e.id, creeParId: exp.user?.id ?? null,
  });
  return `Pour répondre en une minute, sans créer de compte, utilisez ce lien personnel (valable jusqu'au ${dateLongue(expireLe.toISOString().slice(0, 10))}) :\n${base}/repondre/${jeton}`;
}

/**
 * Enregistre la réponse d'une entreprise, saisie par la gestion ou donnée en ligne avec son lien :
 * l'annuaire et les suggestions faites aux élèves se mettent à jour, et ses autres liens ne servent plus.
 */
export async function enregistrerReponse(etabId: string, campagneId: string, entrepriseId: string, places: Record<string, number>, extra: { repondant?: string; commentaire?: string | null } = {}) {
  const v = { placesParClasse: places, reponduLe: new Date(), ...extra };
  await db.insert(schema.campagneReponses).values({ campagneId, entrepriseId, ...v })
    .onConflictDoUpdate({ target: [schema.campagneReponses.campagneId, schema.campagneReponses.entrepriseId], set: v });
  await db.update(schema.entreprises).set({ placesParDefaut: Math.max(0, ...Object.values(places)) })
    .where(and(eq(schema.entreprises.id, entrepriseId), eq(schema.entreprises.etablissementId, etabId)));
  await db.update(schema.liensAcces).set({ utiliseLe: new Date() })
    .where(and(eq(schema.liensAcces.etablissementId, etabId), eq(schema.liensAcces.objet, "campagne"), eq(schema.liensAcces.entrepriseId, entrepriseId), isNull(schema.liensAcces.utiliseLe)));
}

/** Places annoncées classe par classe (champs « places_<classe> »), entre 0 et 20 ; un champ vide est ignoré. */
export function lirePlaces(fd: FormData, classesPermises?: string[]): Record<string, number> {
  const places: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^places_([0-9a-f-]{36})$/);
    if (!m || String(v).trim() === "" || (classesPermises && !classesPermises.includes(m[1]))) continue;
    places[m[1]] = Math.max(0, Math.min(20, Math.floor(Number(v)) || 0));
  }
  return places;
}

/** Relance une entreprise qui n'a pas répondu à la campagne, avec un nouveau lien personnel. Renvoie faux sans adresse e-mail. */
export async function relancerEntreprise(exp: Expediteur, c: Campagne, e: Entreprise, base: string): Promise<boolean> {
  if (!e.email) return false;
  const lien = await lienDeReponse(exp, { ...e, email: e.email }, base);
  await envoyer(exp, {
    canal: "mail", destinataire: e.email, sujet: `Relance : ${c.sujet}`, entrepriseId: e.id,
    corps: `Madame, Monsieur,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre réponse à notre message ci-dessous. Elle nous aiderait beaucoup à placer nos élèves.\n\n${lien}\n\n---\n${c.message.replaceAll("{entreprise}", e.nom)}`,
  });
  await db.update(schema.campagneReponses).set({ relanceLe: new Date() })
    .where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, e.id)));
  return true;
}

/** Modèle de message : les dates viennent des périodes saisies pour chaque classe. */
export async function messageParDefaut(ctx: Contexte) {
  const classes = await classesAvecPeriodes(ctx, await classesGerees(ctx));
  const lignes = classes.flatMap((c) => c.periodes.map((p) => `– ${c.libelle}${c.filiere ? ` (${c.filiere})` : ""}, ${p.libelle} : du ${dateLongue(p.debut)} au ${dateLongue(p.fin)}`));
  return {
    sujet: `Accueil de stagiaires en PFMP – année ${ctx.etab.anneeScolaire}`,
    message: `Madame, Monsieur,

${ctx.etab.nom} prépare les périodes de formation en milieu professionnel (PFMP) de ses élèves pour l'année ${ctx.etab.anneeScolaire} :

${lignes.join("\n") || "– (renseignez les périodes de vos classes)"}

Nous serions heureux de poursuivre ou de démarrer un partenariat avec {entreprise}. Pourriez-vous nous indiquer combien d'élèves vous pourriez accueillir sur chacune de ces périodes ?

Les stages suivent un cadre précis : convention signée avant le départ, ${ctx.etab.reglages.regles.heuresMin} à ${ctx.etab.reglages.regles.heuresMax} heures par semaine, pas d'horaire de nuit${ctx.etab.reglages.regles.dimancheInterdit ? ", pas de stage le dimanche" : ""} et ${ctx.etab.reglages.regles.joursReposConsecutifs} jours de repos consécutifs. Chaque élève est suivi par un professeur référent, qui vous rendra visite pendant la période.

Nous restons à votre disposition pour toute question.

Cordialement,
${ctx.user.prenom} ${ctx.user.nom}
${ctx.etab.nom}`,
    classes,
  };
}
