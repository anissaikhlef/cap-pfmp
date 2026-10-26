import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envoyer } from "./messages";
import { aujourdhui, ecartJours, dateLongue } from "./dates";
import { signatairesRequis } from "./requetes";
import { SIGNATAIRES } from "./regles";

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
export async function relancesDuJour(etab: Etab, opts: { classes?: string[]; userId?: string | null } = {}) {
  const jour = aujourdhui();
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

    // 1. Convention incomplète avant le départ
    if (JOURS_AVANT_DEPART.includes(avant)) {
      const requis = signatairesRequis(l.e.dateNaissance, l.p.debut);
      const manquants = requis.filter((k) => !l.s.signatures[k] && k !== "direction");
      const cle = `${l.s.id}:convention:${jour}`;
      if (manquants.length && !(await dejaFait(etab.id, cle))) {
        const dest: { email: string; prenom: string }[] = [];
        if (manquants.includes("eleve")) {
          const [u] = l.e.userId ? await db.select().from(schema.users).where(eq(schema.users.id, l.e.userId)) : [];
          if (u) dest.push(u); else if (l.e.email) dest.push({ email: l.e.email, prenom: l.e.prenom });
        }
        if (manquants.includes("parent")) {
          const rs = await db.select({ u: schema.users }).from(schema.responsables).innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId)).where(eq(schema.responsables.eleveId, l.e.id));
          dest.push(...rs.map((r) => r.u));
        }
        if (manquants.includes("professeur")) {
          const refId = l.e.referentId ?? l.c.referentId;
          const [u] = refId ? await db.select().from(schema.users).where(eq(schema.users.id, refId)) : [];
          if (u) dest.push(u);
        }
        if (manquants.includes("entreprise") && l.ent.email) dest.push({ email: l.ent.email, prenom: l.ent.tuteurNom ?? "Madame, Monsieur" });
        for (const d of dest) {
          await envoyer(ctx, {
            canal: "mail", destinataire: d.email, sujet: `Stage de ${l.e.prenom} ${l.e.nom} dans ${avant} jours : convention à signer`, eleveId: l.e.id, entrepriseId: l.ent.id,
            corps: `Bonjour ${d.prenom},\n\nLe stage de ${l.e.prenom} ${l.e.nom} chez ${l.ent.nom} commence le ${dateLongue(l.p.debut)}. La convention n'est pas encore signée par : ${manquants.map((k) => SIGNATAIRES.find((s) => s.cle === k)!.libelle.toLowerCase()).join(", ")}.\nSans convention signée, l'élève ne peut pas partir en stage.\n\n${etab.nom}`,
          });
          n++;
        }
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
