import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { envoyer } from "./messages";
import { ageAu, anneeScolaireDe, aujourdhui, dateLongue, ecartJours, jourDe, texteDates } from "./dates";
import { chargerConventionEtab } from "./convention";
import { inviterASigner } from "./invitations";
import { adresseDuSite } from "./liens";
import { responsablesDe } from "./alertes";
import { piecesAllocation } from "./allocations";
import { campagneDe, relancerEntreprise, reponsesCampagne } from "./campagne";
import { piecesManquantes, relanceHebdomadaireDue } from "./regles";
import { completerReglages, type Reglages } from "@/db/schema";

type Etab = typeof schema.etablissements.$inferSelect;
type EtabC = Etab & { reglages: Reglages };
type Eleve = typeof schema.eleves.$inferSelect;
type Expediteur = { etab: Etab; user: { id: string } | null };

async function dejaFait(etabId: string, cle: string) {
  const [x] = await db.select({ id: schema.journal.id }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etabId), eq(schema.journal.action, "relance_auto"), eq(schema.journal.entiteId, cle))).limit(1);
  return !!x;
}

async function noter(etabId: string, entite: string, cle: string, details: unknown) {
  await db.insert(schema.journal).values({ etablissementId: etabId, action: "relance_auto", entite, entiteId: cle, details });
}

/**
 * La famille à relancer pour un élève : ses responsables légaux qui ont un compte ;
 * l'élève lui-même s'il est majeur et a un compte (ses responsables, s'il n'en a pas).
 */
async function familleDe(e: Eleve, jour: string) {
  if ((ageAu(e.dateNaissance, jour) ?? 0) >= 18 && e.userId) {
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1);
    if (u) return [{ email: u.email, prenom: u.prenom, eleve: true }];
  }
  return (await responsablesDe(e.id)).map((u) => ({ email: u.email, prenom: u.prenom, eleve: false }));
}

/** « Mon enfant » pour un parent, « Mon stage » pour l'élève majeur, avec l'adresse de la page. */
const espace = (eleve: boolean, base: string) => (eleve ? `« Mon stage » : ${base}/mon-stage` : `« Mon enfant » : ${base}/mon-enfant`);

/**
 * Envoie les relances du jour pour un établissement, aux jours réglés dans « Organisation ».
 * Sans doublon : chaque relance n'est envoyée qu'une fois (clé objet + jour), et les pièces de l'allocation
 * au plus une fois par semaine. Si `classes` est fourni, se limite à ces classes ; la campagne de rentrée
 * (qui concerne tout le lycée) n'est relancée qu'avec `campagne`.
 */
export async function relancesDuJour(etab: Etab, opts: { classes?: string[]; userId?: string | null; base?: string; campagne?: boolean } = {}) {
  const jour = aujourdhui();
  const etabC: EtabC = { ...etab, reglages: completerReglages(etab.reglages) };
  const R = etabC.reglages.relances;
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
  const ctx: Expediteur = { etab, user: opts.userId ? { id: opts.userId } : null };
  let n = 0;

  for (const l of lignes) {
    const avant = ecartJours(jour, l.p.debut);
    const apres = ecartJours(l.p.fin, jour);

    // 1. Convention incomplète avant le départ : chacun est invité à signer (lien personnel s'il n'a pas de compte).
    //    La direction signe depuis « À signer » ; le dernier signataire est prévenu quand tous les autres ont signé.
    if (R.convention.includes(avant)) {
      const cle = `${l.s.id}:convention:${jour}`;
      const cv = await chargerConventionEtab(etabC, l.s.id);
      const manquants = cv ? cv.requis.filter((k) => !cv.s.signatures[k] && k !== "direction" && k !== etabC.reglages.dernierSignataire) : [];
      if (cv && manquants.length && !(await dejaFait(etab.id, cle))) {
        const r = await inviterASigner(ctx, cv, manquants, base, true, `Le stage commence le ${dateLongue(l.p.debut)}, dans ${avant} jours : sans convention signée, l'élève ne peut pas partir en stage.`);
        n += r.messages;
        await noter(etab.id, "stage", cle, { manquants });
      }
    }

    // 2. Attestation et livret après la fin
    if (R.finDeStage.includes(apres) && l.ent.email) {
      const recus = await db.select({ type: schema.documents.type }).from(schema.documents)
        .where(and(eq(schema.documents.stageId, l.s.id), sql`${schema.documents.statut} in ('valide', 'a_verifier')`));
      const manquent = (["attestation", "livret"] as const).filter((t) => !recus.some((r) => r.type === t));
      const cle = `${l.s.id}:fin:${jour}`;
      if (manquent.length && !(await dejaFait(etab.id, cle))) {
        await envoyer(ctx, {
          canal: "mail", destinataire: l.ent.email, sujet: `Fin du stage de ${l.e.prenom} ${l.e.nom} : documents à transmettre`, eleveId: l.e.id, entrepriseId: l.ent.id,
          corps: `Madame, Monsieur,\n\nLe stage de ${l.e.prenom} ${l.e.nom} s'est terminé le ${dateLongue(l.p.fin)}. Merci de nous transmettre ${manquent.map((t) => (t === "attestation" ? "l'attestation de stage" : "le livret de compétences complété")).join(" et ")}, signé(s), en le(s) déposant sur Cap PFMP ou en répondant à ce message.\n\nMerci pour l'accueil de notre élève.\n${etab.nom}`,
        });
        await noter(etab.id, "stage", cle, { manquent });
        n++;
      }
    }
  }

  const eleves = new Map(lignes.map((l) => [l.e.id, l.e]));
  n += await relancerPieces(ctx, etabC, [...eleves.values()], jour, base);
  n += await relancerAbsences(ctx, etabC, lignes.map((l) => l.s.id), eleves, jour, base);
  if (opts.campagne ?? !opts.classes) n += await relancerCampagne(ctx, etabC, jour, base);
  return n;
}

/**
 * 3. Pièces de l'allocation (RIB, pièce d'identité) : les familles des élèves qui ont un stage cette année,
 * une fois par semaine tant qu'il en manque, au plus le nombre de fois réglé dans l'année.
 */
async function relancerPieces(ctx: Expediteur, etab: EtabC, eleves: Eleve[], jour: string, base: string) {
  const max = etab.reglages.relances.piecesMax;
  if (max <= 0 || !eleves.length) return 0;
  const pieces = await piecesAllocation(eleves.map((e) => e.id));
  const passees = await db.select({ cle: schema.journal.entiteId }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), eq(schema.journal.action, "relance_auto"), eq(schema.journal.entite, "pieces")));
  let n = 0;
  for (const e of eleves) {
    const manquent = piecesManquantes(pieces.get(e.id));
    if (!manquent.length) continue;
    // Clé « élève:pieces:jour » : les relances déjà envoyées à cette famille pendant l'année scolaire
    const dates = passees.map((x) => x.cle ?? "").filter((c) => c.startsWith(`${e.id}:pieces:`)).map((c) => c.slice(-10))
      .filter((d) => anneeScolaireDe(d) === etab.anneeScolaire);
    if (!relanceHebdomadaireDue(dates, jour, max)) continue;
    const famille = await familleDe(e, jour);
    if (!famille.length) continue;
    const quoi = manquent.map((t) => (t === "rib" ? "le RIB" : "une pièce d'identité")).join(" et ");
    for (const f of famille) {
      await envoyer(ctx, {
        canal: "mail", destinataire: f.email, sujet: `Allocation de stage de ${e.prenom} ${e.nom} : document à déposer`, eleveId: e.id,
        corps: `Bonjour ${f.prenom},\n\nPour le versement de l'allocation de stage${f.eleve ? "" : ` de ${e.prenom}`}, il manque encore ${quoi}. Vous pouvez ${manquent.length > 1 ? "les" : "le"} déposer en quelques secondes dans Cap PFMP, rubrique ${espace(f.eleve, base)}\n\nCes documents sont conservés pour toute la scolarité : vous n'aurez pas à les déposer de nouveau.\n\n${etab.nom}`,
      });
      n++;
    }
    await noter(etab.id, "pieces", `${e.id}:pieces:${jour}`, { manquent, destinataires: famille.length });
  }
  return n;
}

/** 4. Absence pas encore justifiée : la famille, aux jours réglés après le signalement de l'absence. */
async function relancerAbsences(ctx: Expediteur, etab: EtabC, stageIds: string[], eleves: Map<string, Eleve>, jour: string, base: string) {
  const jours = etab.reglages.relances.absences;
  if (!jours.length || !stageIds.length) return 0;
  const absences = await db.select().from(schema.absences).where(and(inArray(schema.absences.stageId, stageIds), isNull(schema.absences.justifieeLe)));
  let n = 0;
  for (const a of absences) {
    const e = eleves.get(a.eleveId);
    const cle = `${a.id}:absence:${jour}`;
    if (!e || !jours.includes(ecartJours(jourDe(a.createdAt), jour)) || (await dejaFait(etab.id, cle))) continue;
    const famille = await familleDe(e, jour);
    for (const f of famille) {
      await envoyer(ctx, {
        canal: "mail", destinataire: f.email, sujet: `Absence de ${e.prenom} en stage : à justifier`, eleveId: e.id,
        corps: `Bonjour ${f.prenom},\n\n${f.eleve ? "Votre absence" : `L'absence de ${e.prenom} ${e.nom}`} en stage ${texteDates(a.debut, a.fin)} n'est pas encore justifiée. Merci d'en indiquer le motif dans Cap PFMP, rubrique ${espace(f.eleve, base)}\nVous pouvez joindre un justificatif (certificat médical, convocation…).\n\nLes jours d'absence sont déduits des jours de stage effectués.\n\n${etab.nom}`,
      });
      n++;
    }
    if (famille.length) await noter(etab.id, "absence", cle, { destinataires: famille.length });
  }
  return n;
}

/** 5. Campagne de rentrée : les entreprises sans réponse, aux jours réglés après l'envoi, avec un nouveau lien personnel. */
async function relancerCampagne(ctx: Expediteur, etab: EtabC, jour: string, base: string) {
  const c = await campagneDe(etab);
  if (!c?.envoyeeLe || !etab.reglages.relances.campagne.includes(ecartJours(jourDe(c.envoyeeLe), jour))) return 0;
  let n = 0;
  for (const { r, e } of await reponsesCampagne(c.id)) {
    const cle = `${c.id}:${e.id}:campagne:${jour}`;
    if (r.reponduLe || (await dejaFait(etab.id, cle))) continue;
    if (await relancerEntreprise(ctx, c, e, base)) {
      await noter(etab.id, "entreprise", cle, {});
      n++;
    }
  }
  return n;
}
