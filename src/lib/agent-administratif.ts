import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
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
 * de compte, le mail s'adresse à l'élève lui-même (s'il a un compte), en le tutoyant.
 */
async function famille(e: Eleve): Promise<{ dest: Destinataire[]; aLEleve: boolean }> {
  const resp = (await responsablesDe(e.id)).map((u) => ({ email: u.email, nom: `${u.prenom} ${u.nom}` }));
  const [u] = e.userId ? await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1) : [];
  const eleve = u ? [{ email: u.email, nom: `${u.prenom} ${u.nom}` }] : [];
  if ((ageAu(e.dateNaissance, aujourdhui()) ?? 0) >= 18) return { dest: [...eleve, ...resp], aLEleve: false };
  return resp.length ? { dest: resp, aLEleve: false } : { dest: eleve, aLEleve: true };
}

async function enregistrer(etab: Etab, m: {
  eleveId?: string | null; entrepriseId?: string | null; cle: string; motif: string; priorite: number;
  destinataires: Destinataire[]; sujet: string; corps: string; simule: boolean; demandeParId?: string | null;
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
      for (const { e } of eleves) {
        const cle = `sans-stage:${e.id}:${p.id}`;
        if (deja.has(cle) || prepares >= MAX_PAR_PASSAGE) continue;
        const { dest, aLEleve } = await famille(e);
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
          eleveId: e.id, cle, priorite: dans <= 7 ? 1 : 2, destinataires: dest, simule: r.simule,
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
      const { dest } = await famille(e);
      if (!dest.length) continue;
      const r = await demanderIA(etab, {
        agent: "administratif", objet: "Mail : absences répétées", consignes: CONSIGNES,
        demande: `Rédige un mail à la famille de [ÉLÈVE], en ${c.libelle}, en stage chez ${ent.nom}. ${n} absences pendant ce stage ne sont pas encore justifiées. Demande de les justifier dans l'espace « Mon enfant » (${base}/mon-enfant), explique qu'une absence non justifiée peut compromettre la validation du stage, et propose un échange avec le professeur référent si [ÉLÈVE] rencontre une difficulté dans l'entreprise. Signe : ${signer}.`,
        schema: SCHEMA_MAIL, verifier: verifierMail,
        exemple: () => ({
          sujet: `Absences de [ÉLÈVE] pendant son stage`,
          corps: `Madame, Monsieur,\n\nPendant son stage chez ${ent.nom}, [ÉLÈVE] a ${n} absences qui ne sont pas encore justifiées.\n\nMerci de les justifier dès que possible dans l'espace « Mon enfant » : ${base}/mon-enfant. Une absence non justifiée peut compromettre la validation du stage.\n\nSi [ÉLÈVE] rencontre une difficulté dans l'entreprise, le professeur référent de la classe est disponible pour en parler avec vous.\n\nBien cordialement,\n\n${signer}`,
        }),
      });
      if (!r.ok) return { prepares, erreur: r.erreur };
      prepares += await enregistrer(etab, {
        eleveId: e.id, cle, priorite: 1, destinataires: dest, simule: r.simule,
        motif: `${e.prenom} ${e.nom} (${c.libelle}) : ${n} absences non justifiées pendant son stage chez ${ent.nom}.`,
        sujet: remettreEleve(r.valeur.sujet, e), corps: remettreEleve(r.valeur.corps, e),
      });
      deja.add(cle);
    }
  }
  return { prepares };
}

/** Un mail demandé par une personne de l'équipe, pour la famille d'un élève ou son tuteur de stage. */
export async function preparerMail(ctx: Contexte, e: Eleve, pour: "famille" | "tuteur", consigne: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  let dest: Destinataire[] = [];
  let qui = "la famille de [ÉLÈVE]";
  if (pour === "famille") {
    const f = await famille(e);
    dest = f.dest;
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
    eleveId: e.id, cle: `demande:${crypto.randomUUID()}`, priorite: 2, destinataires: dest, simule: r.simule, demandeParId: ctx.user.id,
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
export async function envoyerMailValide(ctx: Contexte, m: MailAValider, texte: { sujet: string; corps: string }) {
  const mention = `\n\n—\nMessage préparé avec Cap Admin, l'agent administratif de Cap PFMP, et relu par ${ctx.user.prenom} ${ctx.user.nom}.`;
  for (const d of m.destinataires) {
    await envoyer(ctx, { canal: "mail", destinataire: d.email, sujet: texte.sujet, corps: texte.corps + mention, eleveId: m.eleveId, entrepriseId: m.entrepriseId });
  }
  await db.update(schema.mailsAValider).set({ statut: "envoye", sujet: texte.sujet, corps: texte.corps, traiteParId: ctx.user.id, traiteLe: new Date() })
    .where(and(eq(schema.mailsAValider.id, m.id), eq(schema.mailsAValider.etablissementId, ctx.etab.id)));
}
