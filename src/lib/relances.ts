import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envoyer } from "./messages";
import { aujourdhui, ecartJours, dateLongue } from "./dates";
import { chargerConventionEtab } from "./convention";
import { inviterASigner } from "./invitations";
import { adresseDuSite } from "./liens";
import { completerReglages } from "@/db/schema";

/** Jours où l'on relance : avant le départ pour la convention, après la fin pour l'attestation et le livret. */
export const JOURS_AVANT_DEPART = [7, 3];
export const JOURS_APRES_FIN = [3, 10];

type Etab = typeof schema.etablissements.$inferSelect;

async function dejaFait(etabId: string, cle: string) {
  const [x] = await db.select({ id: schema.journal.id }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etabId), eq(schema.journal.action, "relance_auto"), eq(schema.journal.entiteId, cle))).limit(1);
  return !!x;
}

/**
 * Envoie les relances du jour pour un établissement. Sans doublon : chaque relance n'est envoyée qu'une fois
 * (clé stage + objet + jour). Si `classes` est fourni, se limite à ces classes.
 */
export async function relancesDuJour(etab: Etab, opts: { classes?: string[]; userId?: string | null; base?: string } = {}) {
  const jour = aujourdhui();
  const etabC = { ...etab, reglages: completerReglages(etab.reglages) };
  const base = opts.base ?? (await adresseDuSite());
  const conds = [eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)];
  if (opts.classes) { if (!opts.classes.length) return 0; conds.push(inArray(schema.classes.id, opts.classes)); }
  const lignes = await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(...conds, eq(schema.eleves.archive, false)));
  const ctx = { etab, user: opts.userId ? { id: opts.userId } : null };
  let n = 0;

  for (const l of lignes) {
    const avant = ecartJours(jour, l.p.debut);
    const apres = ecartJours(l.p.fin, jour);

    // 1. Convention incomplète avant le départ : chacun est invité à signer (lien personnel s'il n'a pas de compte).
    //    La direction signe depuis « À signer » ; le dernier signataire est prévenu quand tous les autres ont signé.
    if (JOURS_AVANT_DEPART.includes(avant)) {
      const cle = `${l.s.id}:convention:${jour}`;
      const cv = await chargerConventionEtab(etabC, l.s.id);
      const manquants = cv ? cv.requis.filter((k) => !cv.s.signatures[k] && k !== "direction" && k !== etabC.reglages.dernierSignataire) : [];
      if (cv && manquants.length && !(await dejaFait(etab.id, cle))) {
        const r = await inviterASigner(ctx, cv, manquants, base, true, `Le stage commence le ${dateLongue(l.p.debut)}, dans ${avant} jours : sans convention signée, l'élève ne peut pas partir en stage.`);
        n += r.messages;
        await db.insert(schema.journal).values({ etablissementId: etab.id, action: "relance_auto", entite: "stage", entiteId: cle, details: { manquants } });
      }
    }

    // 2. Attestation et livret après la fin
    if (JOURS_APRES_FIN.includes(apres) && l.ent.email) {
      const recus = await db.select({ type: schema.documents.type }).from(schema.documents)
        .where(and(eq(schema.documents.stageId, l.s.id), sql`${schema.documents.statut} in ('valide', 'a_verifier')`));
      const manquent = (["attestation", "livret"] as const).filter((t) => !recus.some((r) => r.type === t));
      const cle = `${l.s.id}:fin:${jour}`;
      if (manquent.length && !(await dejaFait(etab.id, cle))) {
        await envoyer(ctx, {
          canal: "mail", destinataire: l.ent.email, sujet: `Fin du stage de ${l.e.prenom} ${l.e.nom} : documents à transmettre`, eleveId: l.e.id, entrepriseId: l.ent.id,
          corps: `Madame, Monsieur,\n\nLe stage de ${l.e.prenom} ${l.e.nom} s'est terminé le ${dateLongue(l.p.fin)}. Merci de nous transmettre ${manquent.map((t) => (t === "attestation" ? "l'attestation de stage" : "le livret de compétences complété")).join(" et ")}, signé(s), en le(s) déposant sur Cap PFMP ou en répondant à ce message.\n\nMerci pour l'accueil de notre élève.\n${etab.nom}`,
        });
        await db.insert(schema.journal).values({ etablissementId: etab.id, action: "relance_auto", entite: "stage", entiteId: cle, details: { manquent } });
        n++;
      }
    }
  }
  return n;
}
