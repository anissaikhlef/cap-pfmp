import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { classesAvecPeriodes } from "./requetes";
import { classesGerees } from "./acces";
import { dateLongue } from "./dates";

export async function campagneEnCours(ctx: Contexte) {
  const [c] = await db.select().from(schema.campagnes)
    .where(and(eq(schema.campagnes.etablissementId, ctx.etab.id), eq(schema.campagnes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(desc(schema.campagnes.envoyeeLe)).limit(1);
  return c ?? null;
}

export async function reponsesCampagne(campagneId: string) {
  return db.select({ r: schema.campagneReponses, e: schema.entreprises }).from(schema.campagneReponses)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.campagneReponses.entrepriseId))
    .where(eq(schema.campagneReponses.campagneId, campagneId)).orderBy(asc(schema.entreprises.nom));
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
