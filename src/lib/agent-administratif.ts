import "server-only";
import { concerneLEleve } from "./periodes";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { completerReglages, type Reglages } from "@/db/schema";
import type { Contexte } from "./auth";
import { a, gereToutLEtablissement } from "./acces";
import { responsablesDe } from "./alertes";
import { ageAu, ajouterJours, aujourdhui, dateLongue, ecartJours } from "./dates";
import { demanderIA } from "./ia";
import { adresseDuSite } from "./liens";
import { masquer, remettre, type Masque } from "./anonymisation";
import { envoyer } from "./messages";
import { referentDe } from "./requetes";
import { grilleEtQuestions } from "./modeles-documents";
import { rentreeDe } from "./regles";

/**
 * Agent 1, obligatoire : Cap Admin, l'agent administratif. Il repère les situations qui demandent un mail et le rédige ;
 * le mail attend dans « Mails à valider » qu'une personne l'envoie, le modifie ou l'écarte (décision d'Anissa : validé par
 * le professeur référent de la classe, « le DDFPT peut valider si besoin »). Les rappels automatiques restent à part.
 */
type Etab = typeof schema.etablissements.$inferSelect;
type Eleve = typeof schema.eleves.$inferSelect;
type Destinataire = { email: string; nom: string };

/** Au plus ce nombre de nouveaux mails préparés à chaque passage, pour laisser à l'équipe le temps de les relire. */
const MAX_PAR_PASSAGE = 25;

const CONSIGNES = `Tu es l'agent administratif d'un lycée professionnel. Tu rédiges des mails courts (8 à 12 lignes), clairs et bienveillants, aux familles des élèves ou aux entreprises qui les accueillent en stage. Un mail commence par « Madame, Monsieur, » et se termine par la formule de politesse et le nom du lycée. Il propose toujours une aide concrète et une personne à contacter, sans culpabiliser. Pas de jargon : « stage » plutôt que « PFMP » quand c'est plus clair. Réponds avec le sujet et le corps du mail.`;
const SCHEMA_MAIL = {
  type: "object", additionalProperties: false, required: ["sujet", "corps"],
  properties: { sujet: { type: "string" }, corps: { type: "string" } },
};
const Mail = z.object({ sujet: z.string().trim().min(3).max(200), corps: z.string().trim().min(20).max(5000) });
const verifierMail = (x: unknown) => Mail.safeParse(x).data ?? null;

/** Le repère de l'élève dans les textes envoyés à l'IA, remplacé par son prénom au retour. */
const masquesEleve = (e: Pick<Eleve, "prenom" | "nom">): Masque[] => [
  { valeur: `${e.prenom} ${e.nom}`, jeton: "[ÉLÈVE]" }, { valeur: `${e.nom} ${e.prenom}`, jeton: "[ÉLÈVE]" },
  { valeur: e.prenom, jeton: "[ÉLÈVE]" }, { valeur: e.nom, jeton: "[ÉLÈVE]" },
];
const remettreEleve = (t: string, e: Pick<Eleve, "prenom">) => remettre(t, [{ valeur: e.prenom, jeton: "[ÉLÈVE]" }]);

/**
 * À qui écrire pour un élève : ses responsables qui ont un compte, et lui-même s'il est majeur. Si aucun responsable n'a
 * de compte, le mail s'adresse à l'élève lui-même (s'il a un compte), en le tutoyant ; son professeur référent et le DDFPT
 * (comptes « Gestion des PFMP ») en sont prévenus à l'envoi (décision d'Anissa).
 */
async function famille(e: Eleve): Promise<{ dest: Destinataire[]; aLEleve: boolean; prevenir: Destinataire[] }> {
  const resp = (await responsablesDe(e.id)).map((u) => ({ email: u.email, nom: `${u.prenom} ${u.nom}` }));
  const [u] = e.userId ? await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1) : [];
  const eleve = u ? [{ email: u.email, nom: `${u.prenom} ${u.nom}` }] : [];
  if ((ageAu(e.dateNaissance, aujourdhui()) ?? 0) >= 18) return { dest: [...eleve, ...resp], aLEleve: false, prevenir: [] };
  if (resp.length || !eleve.length) return { dest: resp, aLEleve: false, prevenir: [] };
  const referent = await referentDe(e);
  const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, e.etablissementId), eq(schema.users.actif, true)));
  const prevenir = equipe.filter((x) => x.id === referent || x.roles.includes("gestionnaire")).map((x) => ({ email: x.email, nom: `${x.prenom} ${x.nom}` }));
  return { dest: eleve, aLEleve: true, prevenir };
}

async function enregistrer(etab: Etab, m: {
  eleveId?: string | null; entrepriseId?: string | null; cle: string; motif: string; priorite: number;
  destinataires: Destinataire[]; prevenir?: Destinataire[]; sujet: string; corps: string; simule: boolean; demandeParId?: string | null;
}) {
  const r = await db.insert(schema.mailsAValider).values({ etablissementId: etab.id, agent: "administratif", ...m })
    .onConflictDoNothing().returning({ id: schema.mailsAValider.id });
  return r.length;
}

/**
 * Le passage quotidien de Cap Admin (et le bouton « Préparer les mails du jour ») : élèves toujours sans stage à
 * l'approche de leur période, absences répétées non justifiées. Chaque situation n'est proposée qu'une fois.
 */
export async function mailsDuJour(etabBrut: Etab, opts: { classes?: string[] } = {}): Promise<{ prepares: number; erreur?: string }> {
  // Un lycée créé avant les agents reçoit leurs réglages par défaut.
  const R: Reglages = completerReglages(etabBrut.reglages);
  const etab: Etab = { ...etabBrut, reglages: R };
  const jour = aujourdhui();
  const base = await adresseDuSite();
  const deja = new Set((await db.select({ cle: schema.mailsAValider.cle }).from(schema.mailsAValider)
    .where(eq(schema.mailsAValider.etablissementId, etab.id))).map((x) => x.cle));
  const conds = [eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)];
  if (opts.classes) { if (!opts.classes.length) return { prepares: 0 }; conds.push(inArray(schema.classes.id, opts.classes)); }
  let prepares = 0;
  const signer = `${etab.nom}`;

  // 1. Élèves toujours sans stage, à l'approche de la période de leur classe.
  if (R.agents.sansStageJours > 0) {
    const periodes = await db.select({ p: schema.periodes, c: schema.classes }).from(schema.periodes)
      .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
      .where(and(...conds, isNull(schema.periodes.eleveId), gte(schema.periodes.debut, jour), lte(schema.periodes.debut, ajouterJours(jour, R.agents.sansStageJours))))
      .orderBy(asc(schema.periodes.debut));
    for (const { p, c } of periodes) {
      const eleves = await db.select({ e: schema.eleves }).from(schema.eleves)
        .leftJoin(schema.stages, and(eq(schema.stages.eleveId, schema.eleves.id), eq(schema.stages.periodeId, p.id)))
        .where(and(eq(schema.eleves.classeId, c.id), eq(schema.eleves.archive, false), isNull(schema.stages.id)))
        .orderBy(asc(schema.eleves.nom));
      for (const { e } of eleves.filter((x) => concerneLEleve(p, x.e))) {
        const cle = `sans-stage:${e.id}:${p.id}`;
        if (deja.has(cle) || prepares >= MAX_PAR_PASSAGE) continue;
        const { dest, aLEleve, prevenir } = await famille(e);
        if (!dest.length) continue;
        const dans = ecartJours(jour, p.debut);
        const r = await demanderIA(etab, {
          agent: "administratif", objet: "Mail : élève sans stage", consignes: CONSIGNES,
          demande: aLEleve
            ? `Rédige un mail à [ÉLÈVE] (en le tutoyant, en commençant par « Bonjour [ÉLÈVE], »), élève de ${c.libelle}${c.filiere ? ` (${c.filiere})` : ""}. Sa période de stage (« ${p.libelle} ») commence le ${dateLongue(p.debut)}, dans ${dans} jours, et [ÉLÈVE] n'a pas encore trouvé de lieu de stage. Encourage-le, propose de passer voir le professeur référent cette semaine, et rappelle que les entreprises contactées se notent dans « Mon stage » : ${base}/mon-stage. Signe : ${signer}.`
            : `Rédige un mail à la famille de [ÉLÈVE], en ${c.libelle}${c.filiere ? ` (${c.filiere})` : ""}. Sa période de stage (« ${p.libelle} ») commence le ${dateLongue(p.debut)}, dans ${dans} jours, et [ÉLÈVE] n'a pas encore trouvé de lieu de stage. Explique que le stage est obligatoire pour le diplôme, propose de faire le point avec le professeur référent de la classe cette semaine, et rappelle que les entreprises contactées se notent dans l'espace « Mon enfant » : ${base}/mon-enfant. Signe : ${signer}.`,
          schema: SCHEMA_MAIL, verifier: verifierMail,
          exemple: () => aLEleve ? ({
            sujet: `Ton stage commence le ${dateLongue(p.debut)}`,
            corps: `Bonjour [ÉLÈVE],\n\nTa période de stage commence le ${dateLongue(p.debut)}, dans ${dans} jours, et tu n'as pas encore de lieu de stage.\n\nPasse voir ton professeur référent cette semaine : il t'aidera à cibler des entreprises et à préparer tes appels. Note chaque entreprise contactée dans « Mon stage » : ${base}/mon-stage\n\nCourage, tu peux y arriver !\n\n${signer}`,
          }) : ({
            sujet: `Stage de [ÉLÈVE] : point à faire avant le ${dateLongue(p.debut)}`,
            corps: `Madame, Monsieur,\n\nLa période de stage de [ÉLÈVE] (${c.libelle}) commence le ${dateLongue(p.debut)}, dans ${dans} jours. À ce jour, [ÉLÈVE] n'a pas encore trouvé de lieu de stage.\n\nCe stage est obligatoire pour obtenir le diplôme. Nous vous proposons de faire le point cette semaine avec le professeur référent de la classe : il peut aider [ÉLÈVE] à cibler des entreprises et à préparer ses candidatures.\n\nLes entreprises déjà contactées se notent dans l'espace « Mon enfant » : ${base}/mon-enfant\n\nNous restons à votre disposition.\nBien cordialement,\n\n${signer}`,
          }),
        });
        if (!r.ok) return { prepares, erreur: r.erreur };
        prepares += await enregistrer(etab, {
          eleveId: e.id, cle, priorite: dans <= 7 ? 1 : 2, destinataires: dest, prevenir, simule: r.simule,
          motif: `${e.prenom} ${e.nom} (${c.libelle}) n'a pas de stage ; la période commence dans ${dans} jours.${aLEleve ? " Aucun responsable n'a de compte : le mail s'adresse à l'élève." : ""}`,
          sujet: remettreEleve(r.valeur.sujet, e), corps: remettreEleve(r.valeur.corps, e),
        });
        deja.add(cle);
      }
    }
  }

  // 2. Absences non justifiées pendant un même stage.
  if (R.agents.absencesMail > 0) {
    const lignes = await db.select({ s: schema.stages, e: schema.eleves, c: schema.classes, ent: schema.entreprises, n: sql<number>`count(${schema.absences.id})::int` })
      .from(schema.absences)
      .innerJoin(schema.stages, eq(schema.stages.id, schema.absences.stageId))
      .innerJoin(schema.eleves, eq(schema.eleves.id, schema.absences.eleveId))
      .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(and(...conds, eq(schema.absences.etablissementId, etab.id), isNull(schema.absences.justifieeLe), eq(schema.eleves.archive, false)))
      .groupBy(schema.stages.id, schema.eleves.id, schema.classes.id, schema.entreprises.id)
      .having(sql`count(${schema.absences.id}) >= ${R.agents.absencesMail}`);
    for (const { s, e, c, ent, n } of lignes) {
      const cle = `absences:${s.id}`;
      if (deja.has(cle) || prepares >= MAX_PAR_PASSAGE) continue;
      const { dest, aLEleve, prevenir } = await famille(e);
      if (!dest.length) continue;
      const r = await demanderIA(etab, {
        agent: "administratif", objet: "Mail : absences répétées", consignes: CONSIGNES,
        demande: aLEleve
          ? `Rédige un mail à [ÉLÈVE] (en le tutoyant, en commençant par « Bonjour [ÉLÈVE], »), élève de ${c.libelle}, en stage chez ${ent.nom}. ${n} absences pendant ce stage ne sont pas encore justifiées. Demande-lui d'apporter un justificatif au lycée ou de le déposer dans « Mon stage » (${base}/mon-stage), explique qu'une absence non justifiée peut compromettre la validation du stage, et propose de parler au professeur référent s'il rencontre une difficulté. Signe : ${signer}.`
          : `Rédige un mail à la famille de [ÉLÈVE], en ${c.libelle}, en stage chez ${ent.nom}. ${n} absences pendant ce stage ne sont pas encore justifiées. Demande de les justifier dans l'espace « Mon enfant » (${base}/mon-enfant), explique qu'une absence non justifiée peut compromettre la validation du stage, et propose un échange avec le professeur référent si [ÉLÈVE] rencontre une difficulté dans l'entreprise. Signe : ${signer}.`,
        schema: SCHEMA_MAIL, verifier: verifierMail,
        exemple: () => aLEleve ? ({
          sujet: `Tes absences pendant ton stage`,
          corps: `Bonjour [ÉLÈVE],\n\nPendant ton stage chez ${ent.nom}, ${n} absences ne sont pas encore justifiées.\n\nApporte un justificatif au lycée ou dépose-le dans « Mon stage » : ${base}/mon-stage. Une absence non justifiée peut compromettre la validation de ton stage.\n\nSi tu rencontres une difficulté dans l'entreprise, parles-en à ton professeur référent.\n\n${signer}`,
        }) : ({
          sujet: `Absences de [ÉLÈVE] pendant son stage`,
          corps: `Madame, Monsieur,\n\nPendant son stage chez ${ent.nom}, [ÉLÈVE] a ${n} absences qui ne sont pas encore justifiées.\n\nMerci de les justifier dès que possible dans l'espace « Mon enfant » : ${base}/mon-enfant. Une absence non justifiée peut compromettre la validation du stage.\n\nSi [ÉLÈVE] rencontre une difficulté dans l'entreprise, le professeur référent de la classe est disponible pour en parler avec vous.\n\nBien cordialement,\n\n${signer}`,
        }),
      });
      if (!r.ok) return { prepares, erreur: r.erreur };
      prepares += await enregistrer(etab, {
        eleveId: e.id, cle, priorite: 1, destinataires: dest, prevenir, simule: r.simule,
        motif: `${e.prenom} ${e.nom} (${c.libelle}) : ${n} absences non justifiées pendant son stage chez ${ent.nom}.${aLEleve ? " Aucun responsable n'a de compte : le mail s'adresse à l'élève." : ""}`,
        sujet: remettreEleve(r.valeur.sujet, e), corps: remettreEleve(r.valeur.corps, e),
      });
      deja.add(cle);
    }
  }
  // 3. Élève en difficulté (décision d'Anissa) : réponse « non » à l'appel au tuteur, compte rendu de visite défavorable,
  // souci signalé sur l'entreprise. Le référent et le DDFPT sont prévenus d'abord ; le mail à la famille, préparé par
  // Cap Admin, attend dans « Mails à valider » qu'ils décident de l'envoyer.
  prepares += await difficultes(etab, conds, deja, base, MAX_PAR_PASSAGE - prepares);
  return { prepares };
}

type Situation = { cle: string; e: Eleve; classe: string; entreprise: string; quoi: string };

async function difficultes(etab: Etab, conds: SQL[], deja: Set<string>, base: string, reste: number): Promise<number> {
  if (reste <= 0) return 0;
  const { grille } = await grilleEtQuestions(etab.id);
  const situations: Situation[] = [];
  const visites = await db.select({ v: schema.visites, e: schema.eleves, c: schema.classes, ent: schema.entreprises }).from(schema.visites)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(...conds, eq(schema.eleves.archive, false)));
  for (const { v, e, c, ent } of visites) {
    const non = v.appel?.reponses.filter((r) => r.reponse === "non") ?? [];
    if (non.length) situations.push({ cle: `difficulte:appel:${v.id}`, e, classe: c.libelle, entreprise: ent.nom, quoi: `lors de l'appel au tuteur du ${dateLongue(v.appel!.date)}, réponse « non » à : ${non.map((r) => `« ${r.question} »`).join(", ")}${v.appel!.commentaire ? ` (commentaire : ${v.appel!.commentaire})` : ""}` });
    const cr = v.compteRendu;
    if (cr) {
      const faibles = (cr.evaluations ?? []).filter((x) => grille.find((g) => g.critere === x.critere)?.niveaux[0] === x.niveau);
      if (faibles.length || cr.adequation === "non") {
        situations.push({ cle: `difficulte:cr:${v.id}`, e, classe: c.libelle, entreprise: ent.nom, quoi: `compte rendu de la visite du ${dateLongue(cr.date)} : ${[
          ...faibles.map((x) => `${x.critere} : ${x.niveau}`), ...(cr.adequation === "non" ? ["activités sans rapport avec la formation"] : []),
        ].join(" ; ")}` });
      }
    }
  }
  const soucis = await db.select({ s: schema.soucisEntreprises, e: schema.eleves, c: schema.classes, ent: schema.entreprises }).from(schema.soucisEntreprises)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.soucisEntreprises.eleveId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.soucisEntreprises.entrepriseId))
    .where(and(...conds, eq(schema.soucisEntreprises.etablissementId, etab.id), gte(schema.soucisEntreprises.createdAt, new Date(`${rentreeDe(etab.anneeScolaire)}T00:00:00Z`))));
  for (const { s: x, e, c, ent } of soucis) situations.push({ cle: `difficulte:souci:${x.id}`, e, classe: c.libelle, entreprise: ent.nom, quoi: `souci signalé sur l'entreprise : ${x.description}` });

  const alertees = new Set((await db.select({ cle: schema.journal.entiteId }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), eq(schema.journal.action, "cap_admin_difficulte")))).map((x) => x.cle));
  const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etab.id), eq(schema.users.actif, true)));
  let prepares = 0;
  for (const x of situations) {
    if (alertees.has(x.cle) || prepares >= reste) continue;
    const { dest, aLEleve, prevenir } = await famille(x.e);
    if (dest.length && !deja.has(x.cle)) {
      const quoi = masquer(x.quoi, masquesEleve(x.e));
      const r = await demanderIA(etab, {
        agent: "administratif", objet: "Mail : élève en difficulté en stage", consignes: CONSIGNES,
        demande: `Rédige un mail ${aLEleve ? "à [ÉLÈVE] (en le tutoyant, en commençant par « Bonjour [ÉLÈVE], »)" : "à la famille de [ÉLÈVE]"}, en ${x.classe}, en stage chez ${x.entreprise}. Le lycée a relevé une difficulté (${quoi}). Sans dramatiser ni accuser, propose un rendez-vous avec le professeur référent de la classe pour faire le point et trouver des solutions. Signe : ${etab.nom}.`,
        schema: SCHEMA_MAIL, verifier: verifierMail,
        exemple: () => ({
          sujet: `Stage de [ÉLÈVE] : faisons le point`,
          corps: `${aLEleve ? "Bonjour [ÉLÈVE]," : "Madame, Monsieur,"}\n\n${aLEleve ? "Pendant ton stage" : "Pendant son stage"} chez ${x.entreprise}, le lycée a relevé une difficulté que nous souhaitons regarder ${aLEleve ? "avec toi" : "avec vous"}.\n\nLe professeur référent de la classe propose un rendez-vous pour faire le point et trouver ensemble des solutions. ${aLEleve ? "Réponds" : "Répondez"} simplement à ce message pour convenir d'un moment.\n\nBien cordialement,\n\n${etab.nom}`,
        }),
      });
      if (!r.ok) return prepares;
      prepares += await enregistrer(etab, {
        eleveId: x.e.id, cle: x.cle, priorite: 1, destinataires: dest, prevenir, simule: r.simule,
        motif: `À envoyer seulement si vous le décidez. ${x.e.prenom} ${x.e.nom} (${x.classe}), chez ${x.entreprise} : ${x.quoi}.`,
        sujet: remettreEleve(r.valeur.sujet, x.e), corps: remettreEleve(r.valeur.corps, x.e),
      });
      deja.add(x.cle);
    }
    // Le référent et le DDFPT d'abord (à défaut de DDFPT, la direction).
    const ref = await referentDe(x.e);
    const ddfpt = equipe.filter((u) => u.roles.includes("gestionnaire"));
    const pour = [...equipe.filter((u) => u.id === ref), ...(ddfpt.length ? ddfpt : equipe.filter((u) => u.roles.includes("direction")))];
    for (const u of pour.filter((u, i) => pour.findIndex((y) => y.id === u.id) === i)) {
      await envoyer({ etab }, {
        canal: "mail", destinataire: u.email, eleveId: x.e.id, sujet: `Cap Admin : ${x.e.prenom} ${x.e.nom} en difficulté en stage`,
        corps: `Bonjour ${u.prenom},\n\nCap Admin signale une difficulté pour ${x.e.prenom} ${x.e.nom} (${x.classe}), en stage chez ${x.entreprise} : ${x.quoi}.\n\n${dest.length ? `Un mail à la famille est préparé dans « Mails à valider » : envoyez-le seulement si vous le décidez. ${base}/mails-a-valider` : "Aucun responsable n'a de compte : contactez la famille directement si besoin."}\nFiche de l'élève : ${base}/eleves/${x.e.id}\n\n${etab.nom}`,
      });
    }
    await db.insert(schema.journal).values({ etablissementId: etab.id, action: "cap_admin_difficulte", entite: "eleve", entiteId: x.cle, details: { eleveId: x.e.id, prevenus: pour.length } });
    alertees.add(x.cle);
  }
  return prepares;
}

/** Un mail demandé par une personne de l'équipe, pour la famille d'un élève ou son tuteur de stage. */
export async function preparerMail(ctx: Contexte, e: Eleve, pour: "famille" | "tuteur", consigne: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  let dest: Destinataire[] = [];
  let prevenir: Destinataire[] = [];
  let qui = "la famille de [ÉLÈVE]";
  if (pour === "famille") {
    const f = await famille(e);
    dest = f.dest;
    prevenir = f.prevenir;
    if (f.aLEleve) qui = "[ÉLÈVE] lui-même (en le tutoyant), car aucun responsable n'a de compte";
  }
  else {
    const [st] = await db.select({ s: schema.stages, ent: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
      .where(eq(schema.stages.eleveId, e.id)).orderBy(desc(schema.periodes.debut)).limit(1);
    const email = st?.s.tuteur?.email ?? st?.ent.email;
    if (st && email) dest = [{ email, nom: st.s.tuteur?.nom ?? st.ent.nom }];
    qui = st ? `le tuteur de stage de [ÉLÈVE] chez ${st.ent.nom}` : qui;
  }
  if (!dest.length) return { ok: false, erreur: pour === "famille" ? "Aucun responsable de cet élève n'a de compte avec une adresse mail." : "Le tuteur de cet élève n'a pas d'adresse mail." };
  const masques = masquesEleve(e);
  const demande = masquer(consigne, masques);
  const r = await demanderIA(ctx.etab, {
    agent: "administratif", objet: "Mail demandé par l'équipe", consignes: CONSIGNES,
    demande: `Rédige un mail à ${qui}. Ce que l'équipe veut dire : « ${demande} ». Signe : ${ctx.etab.nom}.`,
    schema: SCHEMA_MAIL, verifier: verifierMail,
    exemple: () => ({
      sujet: `Au sujet du stage de [ÉLÈVE]`,
      corps: `Madame, Monsieur,\n\n${demande.charAt(0).toUpperCase()}${demande.slice(1)}${/[.!?]$/.test(demande) ? "" : "."}\n\nNous restons à votre disposition pour en parler.\nBien cordialement,\n\n${ctx.etab.nom}`,
    }),
  });
  if (!r.ok) return r;
  await enregistrer(ctx.etab, {
    eleveId: e.id, cle: `demande:${crypto.randomUUID()}`, priorite: 2, destinataires: dest, prevenir, simule: r.simule, demandeParId: ctx.user.id,
    motif: `Demandé par ${ctx.user.prenom} ${ctx.user.nom} : « ${consigne.slice(0, 200)} »`,
    sujet: remettreEleve(r.valeur.sujet, e), corps: remettreEleve(r.valeur.corps, e),
  });
  return { ok: true };
}

/* ------------------- Validation ------------------- */

export type MailAValider = typeof schema.mailsAValider.$inferSelect;

/** Valide un mail : la gestion des PFMP (direction, DDFPT) tous ; un professeur, ceux des élèves dont il est le référent. */
export async function peutValiderMail(ctx: Contexte, m: Pick<MailAValider, "eleveId">): Promise<boolean> {
  if (gereToutLEtablissement(ctx)) return true;
  if (!m.eleveId || !a(ctx, "professeur")) return false;
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, m.eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  return !!e && (await referentDe(e)) === ctx.user.id;
}

/** Les mails qui attendent la validation de la personne, les plus urgents d'abord. */
export async function mailsAValiderPour(ctx: Contexte) {
  const rows = await db.select({ m: schema.mailsAValider, e: schema.eleves, c: schema.classes }).from(schema.mailsAValider)
    .leftJoin(schema.eleves, eq(schema.eleves.id, schema.mailsAValider.eleveId))
    .leftJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .where(and(eq(schema.mailsAValider.etablissementId, ctx.etab.id), eq(schema.mailsAValider.statut, "a_valider")))
    .orderBy(asc(schema.mailsAValider.priorite), asc(schema.mailsAValider.createdAt));
  if (gereToutLEtablissement(ctx)) return rows;
  if (!a(ctx, "professeur")) return [];
  return rows.filter((r) => r.e && (r.e.referentId ?? r.c?.referentId) === ctx.user.id);
}

/** Envoie un mail validé (texte éventuellement modifié), avec la mention de l'agent et de la personne qui l'a relu. */
export async function envoyerMailValide(ctx: Contexte, m: MailAValider, texte: { sujet: string; corps: string }, sms = false): Promise<{ sms: number }> {
  const mention = `\n\n—\nMessage préparé avec Cap Admin, l'agent administratif de Cap PFMP, et relu par ${ctx.user.prenom} ${ctx.user.nom}.`;
  for (const d of m.destinataires) {
    await envoyer(ctx, { canal: "mail", destinataire: d.email, sujet: texte.sujet, corps: texte.corps + mention, eleveId: m.eleveId, entrepriseId: m.entrepriseId });
  }
  // Option SMS du lycée (décision d'Anissa) : un SMS court, en plus du mail, à chaque destinataire qui a un numéro.
  let n = 0;
  if (sms && ctx.etab.reglages.agents.sms && m.destinataires.length) {
    const comptes = await db.select({ email: schema.users.email, telephone: schema.users.telephone }).from(schema.users)
      .where(and(eq(schema.users.etablissementId, ctx.etab.id), inArray(schema.users.email, m.destinataires.map((d) => d.email))));
    for (const c of comptes.filter((x) => x.telephone)) {
      await envoyer(ctx, { canal: "sms", destinataire: c.telephone!, corps: `${ctx.etab.nom} : ${texte.sujet}. Le détail vous a été envoyé par mail.`.slice(0, 300), eleveId: m.eleveId });
      n++;
    }
  }
  // Aucun responsable n'a de compte : le professeur référent et le DDFPT sont prévenus (sauf la personne qui envoie).
  const eleve = m.destinataires.map((d) => d.nom).join(", ");
  for (const p of m.prevenir.filter((x) => x.email !== ctx.user.email && !m.destinataires.some((d) => d.email === x.email))) {
    await envoyer(ctx, {
      canal: "mail", destinataire: p.email, sujet: `Pour information : ${texte.sujet}`, eleveId: m.eleveId,
      corps: `Bonjour,\n\nAucun responsable de ${eleve} n'a de compte dans Cap PFMP : ce mail lui a été envoyé directement, après relecture par ${ctx.user.prenom} ${ctx.user.nom}. Pensez à créer les comptes de ses responsables (« Élèves », « Comptes et fiches de connexion »).\n\n— Le mail envoyé —\n${texte.sujet}\n\n${texte.corps}\n\n${ctx.etab.nom}`,
    });
  }
  await db.update(schema.mailsAValider).set({ statut: "envoye", sujet: texte.sujet, corps: texte.corps, traiteParId: ctx.user.id, traiteLe: new Date() })
    .where(and(eq(schema.mailsAValider.id, m.id), eq(schema.mailsAValider.etablissementId, ctx.etab.id)));
  return { sms: n };
}
