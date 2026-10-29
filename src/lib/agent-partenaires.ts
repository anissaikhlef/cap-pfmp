import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { EchangeEntretien, FicheEntretien, GuideLettre, RelectureCv } from "@/db/schema";
import type { Contexte } from "./auth";
import { a, estReferentDe, gereToutLEtablissement } from "./acces";
import { proposerLieux } from "./agent-entreprises";
import { masquer, sansCoordonnees, type Masque } from "./anonymisation";
import { aujourdhui } from "./dates";
import { demanderIA } from "./ia";
import { laBonneBoite } from "./la-bonne-boite";
import { motsCles, relectureCvExemple } from "./regles";
import { dossierStage } from "./stages";

/**
 * Cap Partenaires, après l'audit des agents (décisions d'Anissa) : propositions pour toute une classe (relues par le
 * référent), lettre de motivation (relue, et l'élève guidé sans qu'on écrive à sa place), préparation de l'appel et de
 * l'entretien (fiche, entraînement), nouvelles entreprises pour le lycée. L'IA ne reçoit ni nom d'élève ni coordonnées.
 */
type Eleve = typeof schema.eleves.$inferSelect;
const masquesEleve = (e: Eleve): Masque[] => [
  { valeur: `${e.prenom} ${e.nom}`, jeton: "[ÉLÈVE]" }, { valeur: `${e.nom} ${e.prenom}`, jeton: "[ÉLÈVE]" },
  { valeur: e.prenom, jeton: "[ÉLÈVE]" }, { valeur: e.nom, jeton: "[ÉLÈVE]" },
];
const propre = (e: Eleve, t: string) => masquer(sansCoordonnees(t), masquesEleve(e));
const classeDe = async (e: Eleve) => (e.classeId ? (await db.select().from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1))[0] : undefined);
const formationDe = (c: { libelle: string; filiere: string | null } | undefined) => (c ? `${c.libelle}${c.filiere ? ` (${c.filiere})` : ""}` : "lycée professionnel");

/* ------------------- Lettre de motivation ------------------- */

const SCHEMA_RELECTURE = {
  type: "object", additionalProperties: false, required: ["pointsForts", "aAmeliorer", "conseil"],
  properties: { pointsForts: { type: "array", items: { type: "string" } }, aAmeliorer: { type: "array", items: { type: "string" } }, conseil: { type: "string" } },
};
const Relecture = z.object({ pointsForts: z.array(z.string().trim().min(2).max(400)).max(8), aAmeliorer: z.array(z.string().trim().min(2).max(400)).max(8), conseil: z.string().trim().min(2).max(800) });

/** Relit la lettre de motivation de l'élève (le texte, sans son nom ni ses coordonnées), sans la réécrire. */
export async function relireLettre(ctx: Contexte, e: Eleve, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const t = propre(e, texte);
  const c = await classeDe(e);
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Relecture d'une lettre de motivation", effort: "medium",
    consignes: "Tu relis la lettre de motivation d'un élève de lycée professionnel qui cherche un stage. Tutoie l'élève, sois encourageant et concret. Donne 2 à 4 points forts, 2 à 5 points à améliorer (ce qui manque : pourquoi cette entreprise, ce qu'il sait faire, ce qu'il veut apprendre ; formulations ; fautes, en citant le mot à corriger), et un conseil. Ne réécris jamais la lettre ni une phrase à sa place. Les repères entre crochets ([ÉLÈVE], [téléphone]…) remplacent volontairement le nom et les coordonnées.",
    demande: `Lettre d'un élève de ${formationDe(c)} :\n"""\n${t}\n"""`,
    schema: SCHEMA_RELECTURE, verifier: (x) => Relecture.safeParse(x).data ?? null,
    exemple: () => relectureLettreExemple(t),
  });
  if (!r.ok) return r;
  const lettre: RelectureCv = r.valeur;
  await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "lettre", contenu: { cv: lettre }, simule: r.simule, parId: ctx.user.id });
  return { ok: true };
}

/** Relecture d'exemple (démonstration), d'après ce que contient la lettre. */
export function relectureLettreExemple(t: string): RelectureCv {
  const bas = t.toLowerCase();
  const fort = [/(madame|monsieur)/.test(bas) && "Ta lettre commence par une formule de politesse.", /stage|pfmp/.test(bas) && "Tu dis clairement que tu cherches un stage.", t.length > 400 && "Ta lettre est assez développée."].filter(Boolean) as string[];
  const ameliorer = [!/(parce que|car|pourquoi|attir|intéress)/.test(bas) && "Explique pourquoi cette entreprise t'intéresse.", !/(sais|capable|compétence|déjà|expérience)/.test(bas) && "Dis ce que tu sais déjà faire (cours, expériences, qualités).", !/(apprendre|découvrir|progresser)/.test(bas) && "Dis ce que tu aimerais apprendre pendant ce stage.", !/(date|du .* au|semaines?)/.test(bas) && "Indique les dates de ton stage."].filter(Boolean) as string[];
  return { pointsForts: fort.length ? fort : ["Tu as commencé ta lettre : c'est le plus dur !"], aAmeliorer: ameliorer.length ? ameliorer : ["Relis-la à voix haute pour vérifier les fautes."], conseil: "Garde une lettre courte (une page), et adapte-la à chaque entreprise." };
}

const Guide = z.object({ plan: z.array(z.string().trim().min(3).max(400)).max(8), conseils: z.array(z.string().trim().min(3).max(400)).max(6), questions: z.array(z.string().trim().min(3).max(300)).max(6) });

/**
 * Guide l'élève pour écrire sa lettre (décision d'Anissa : « relire, et guider l'élève par des questions, sans écrire à
 * sa place ») : à partir de ses réponses, l'ordre des idées, des conseils et des questions pour aller plus loin.
 */
export async function guiderLettre(ctx: Contexte, e: Eleve, rep: { entreprise: string; pourquoi: string; savoirFaire: string; apprendre: string }) {
  const c = await classeDe(e);
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Guide pour la lettre de motivation", effort: "low",
    consignes: "Tu aides un élève de lycée professionnel à écrire lui-même sa lettre de motivation pour un stage. Tutoie-le. À partir de ses réponses, donne l'ordre des idées de sa lettre (un paragraphe par idée, ce qu'il doit y dire avec ses mots), des conseils, et 2 à 4 questions pour l'aider à préciser ce qui est encore vague. N'écris jamais de phrase de la lettre à sa place.",
    demande: `Élève de ${formationDe(c)}.\nEntreprise visée : ${propre(e, rep.entreprise)}\nPourquoi elle : ${propre(e, rep.pourquoi)}\nCe qu'il sait faire : ${propre(e, rep.savoirFaire)}\nCe qu'il veut apprendre : ${propre(e, rep.apprendre)}`,
    schema: { type: "object", additionalProperties: false, required: ["plan", "conseils", "questions"], properties: { plan: { type: "array", items: { type: "string" } }, conseils: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } } } },
    verifier: (x) => Guide.safeParse(x).data ?? null,
    exemple: (): GuideLettre => ({
      plan: ["Présente-toi : ta classe, ta formation, et les dates de ton stage.", `Dis pourquoi ${rep.entreprise.trim() || "cette entreprise"} t'intéresse, avec ce que tu as écrit.`, "Explique ce que tu sais déjà faire, avec un exemple.", "Dis ce que tu aimerais apprendre chez eux.", "Termine en proposant de les rencontrer, et par une formule de politesse."],
      conseils: ["Écris avec tes mots : le tuteur veut te connaître, toi.", "Une page suffit."],
      questions: [!rep.pourquoi.trim() ? "Qu'est-ce qui t'attire dans cette entreprise ?" : "As-tu un exemple précis de ce qui t'attire chez eux ?", "Quelle qualité montrerais-tu le premier jour ?"],
    }),
  });
  if (!r.ok) return r;
  const guide: GuideLettre = r.valeur;
  await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "lettre_guide", contenu: { guide }, simule: r.simule, parId: ctx.user.id });
  return { ok: true as const };
}

/* ------------------- Préparer l'appel et l'entretien ------------------- */

const Fiche = z.object({ telephone: z.array(z.string().trim().min(3).max(400)).min(1).max(8), questions: z.array(z.object({ question: z.string().trim().min(3).max(300), piste: z.string().trim().min(3).max(400) })).min(1).max(8) });

/** La fiche pour appeler une entreprise et préparer l'entretien : ce qu'il faut dire, les questions possibles et des pistes. */
export async function ficheEntretien(ctx: Contexte, e: Eleve, entreprise: string) {
  const c = await classeDe(e);
  const ent = propre(e, entreprise).slice(0, 120);
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Fiche pour l'appel et l'entretien", effort: "low",
    consignes: "Tu prépares un élève de lycée professionnel à appeler une entreprise pour un stage, puis à l'entretien. Tutoie-le. Donne les étapes de l'appel (ce qu'il dit, dans l'ordre), puis 4 à 6 questions que le tuteur peut poser, chacune avec une piste de réponse (une idée, pas une phrase à réciter).",
    demande: `Élève de ${formationDe(c)}, qui cherche un stage. Entreprise : ${ent}.`,
    schema: { type: "object", additionalProperties: false, required: ["telephone", "questions"], properties: { telephone: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "piste"], properties: { question: { type: "string" }, piste: { type: "string" } } } } } },
    verifier: (x) => Fiche.safeParse(x).data ?? null,
    exemple: () => ({
      telephone: ["Bonjour, présente-toi : ton prénom, ta classe et ton lycée.", "Demande à parler à la personne qui s'occupe des stagiaires.", "Dis que tu cherches un stage, avec les dates.", "Propose d'envoyer ton CV ou de passer le déposer.", "Remercie, et note le nom de la personne et la date de rappel."],
      questions: [
        { question: "Pourquoi avoir choisi notre entreprise ?", piste: "Ce que tu sais d'elle, et ce qui t'attire dans son métier." },
        { question: "Que savez-vous déjà faire ?", piste: "Un exemple tiré de tes cours ou d'une expérience." },
        { question: "Quelles sont vos qualités ?", piste: "Deux qualités, chacune avec un exemple." },
        { question: "Qu'aimeriez-vous apprendre ?", piste: "Une tâche précise du métier." },
      ],
    }),
  });
  if (!r.ok) return r;
  const fiche: FicheEntretien = { entreprise: ent, ...r.valeur };
  await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "entretien_fiche", contenu: { fiche }, simule: r.simule, parId: ctx.user.id });
  return { ok: true as const };
}

/** Le nombre de réponses de l'élève avant le bilan de l'entraînement. */
export const TOURS_ENTRETIEN = 4;
const QUESTIONS_EXEMPLE = ["Bonjour, présentez-vous en quelques mots.", "Pourquoi voulez-vous faire votre stage chez nous ?", "Que savez-vous déjà faire dans votre métier ?", "Comment réagiriez-vous si vous ne compreniez pas une consigne ?"];
const Tour = z.object({ reponse: z.string().trim().min(3).max(1200) });

/**
 * L'entraînement à l'entretien, par écrit (ou à l'oral, avec l'option du lycée) : Cap Partenaires joue le tuteur, pose une
 * question, l'élève répond ; après quelques réponses, il donne ses conseils.
 */
export async function tourEntretien(ctx: Contexte, e: Eleve, reponse: string | null, oral = false): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [enCours] = await db.select().from(schema.suggestionsIa)
    .where(and(eq(schema.suggestionsIa.eleveId, e.id), eq(schema.suggestionsIa.type, "entretien"), eq(schema.suggestionsIa.etablissementId, ctx.etab.id)))
    .orderBy(desc(schema.suggestionsIa.createdAt)).limit(1);
  const nouvelle = reponse === null || !enCours || !!enCours.contenu.bilan;
  const echanges: EchangeEntretien[] = nouvelle ? [] : [...(enCours.contenu.echanges ?? [])];
  if (reponse !== null && !nouvelle) echanges.push({ role: "eleve", texte: propre(e, reponse).slice(0, 1200) });
  const fiche = (await db.select().from(schema.suggestionsIa).where(and(eq(schema.suggestionsIa.eleveId, e.id), eq(schema.suggestionsIa.type, "entretien_fiche"))).orderBy(desc(schema.suggestionsIa.createdAt)).limit(1))[0]?.contenu.fiche;
  const reponses = echanges.filter((x) => x.role === "eleve").length;
  const fin = reponses >= TOURS_ENTRETIEN;
  const c = await classeDe(e);
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Entraînement à l'entretien", effort: "low",
    consignes: fin
      ? "Tu as fait passer un entretien d'entraînement à un élève de lycée professionnel qui cherche un stage. Tutoie-le. Dans « reponse », fais le bilan : ce qui était bien, ce qu'il peut améliorer (avec un exemple de ses réponses), et un conseil pour le vrai entretien. Sois encourageant."
      : "Tu joues le rôle d'un tuteur d'entreprise qui reçoit un élève de lycée professionnel pour un stage. Vouvoie-le, comme en vrai. Dans « reponse », réagis en une phrase à sa dernière réponse s'il y en a une, puis pose UNE seule question d'entretien, simple et réaliste.",
    demande: `Élève de ${formationDe(c)}${fiche ? `, entreprise : ${fiche.entreprise}` : ""}.\nÉchanges :\n${echanges.map((x) => `${x.role === "tuteur" ? "Tuteur" : "Élève"} : ${x.texte}`).join("\n") || "(début de l'entretien)"}`,
    schema: { type: "object", additionalProperties: false, required: ["reponse"], properties: { reponse: { type: "string" } } },
    verifier: (x) => Tour.safeParse(x).data ?? null,
    exemple: () => ({ reponse: fin ? "Bravo, tu es allé au bout ! Tes réponses sont claires. Pour le vrai entretien, donne un exemple précis à chaque fois, et pose toi aussi une question à la fin." : QUESTIONS_EXEMPLE[reponses] }),
  });
  if (!r.ok) return r;
  const contenu = fin ? { echanges, bilan: r.valeur.reponse, oral } : { echanges: [...echanges, { role: "tuteur" as const, texte: r.valeur.reponse }], oral };
  if (nouvelle) await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "entretien", contenu, simule: r.simule, parId: ctx.user.id });
  else await db.update(schema.suggestionsIa).set({ contenu, simule: r.simule }).where(eq(schema.suggestionsIa.id, enCours.id));
  return { ok: true };
}

/* ------------------- Propositions pour toute une classe ------------------- */

/** Lance la recherche pour une classe : le DDFPT (et la direction) ou le référent de la classe. */
export async function peutLancerPourLaClasse(ctx: Contexte, classeId: string) {
  if (gereToutLEtablissement(ctx)) return true;
  if (!a(ctx, "professeur")) return false;
  const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes).where(and(eq(schema.classes.id, classeId), eq(schema.classes.etablissementId, ctx.etab.id))).limit(1);
  return c?.ref === ctx.user.id;
}

/**
 * Des lieux de stage pour chaque élève sans stage d'une classe (décision d'Anissa) : le référent relit chaque proposition
 * avant que l'élève la voie.
 */
export async function proposerPourLaClasse(ctx: Contexte, classeId: string): Promise<{ eleves: number; erreur?: string }> {
  const eleves = await db.select().from(schema.eleves).where(and(eq(schema.eleves.classeId, classeId), eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.eleves.archive, false)));
  let n = 0;
  for (const e of eleves) {
    const d = await dossierStage(ctx, e);
    if (!d.periode || d.stage || d.periode.fin < aujourdhui()) continue;
    const r = await proposerLieux(ctx, e, { aRelire: true });
    if (!r.ok) { if (n === 0 && /plafond|joignable|choisis/.test(r.erreur)) return { eleves: n, erreur: r.erreur }; continue; }
    n++;
  }
  return { eleves: n };
}

/** Les propositions qui attendent la relecture du référent, pour ses classes (toutes pour la gestion). */
export async function propositionsARelire(ctx: Contexte) {
  const rows = await db.select({ s: schema.suggestionsIa, e: schema.eleves, c: schema.classes }).from(schema.suggestionsIa)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.suggestionsIa.eleveId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .where(and(eq(schema.suggestionsIa.etablissementId, ctx.etab.id), eq(schema.suggestionsIa.type, "entreprises"), eq(schema.suggestionsIa.aRelire, true), isNull(schema.suggestionsIa.relueLe)))
    .orderBy(desc(schema.suggestionsIa.createdAt));
  if (gereToutLEtablissement(ctx)) return rows;
  const res = [];
  for (const r of rows) if (await estReferentDe(ctx, r.e)) res.push(r);
  return res;
}

/* ------------------- Nouvelles entreprises pour le lycée ------------------- */

export type Prospect = { nom: string; ville: string | null; source: "public" | "bonne_boite" };

/** Les entreprises proches des communes des élèves (jamais leur adresse), qui ne sont pas encore dans l'annuaire du lycée. */
export async function prospects(ctx: Contexte, formationId: string): Promise<{ formation: string; communes: string[]; liste: Prospect[] }> {
  const [f] = await db.select().from(schema.formations).where(and(eq(schema.formations.id, formationId), eq(schema.formations.etablissementId, ctx.etab.id))).limit(1);
  if (!f) return { formation: "", communes: [], liste: [] };
  const classes = (await db.select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.formationId, f.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))).map((c) => c.id);
  const eleves = classes.length ? await db.select({ commune: schema.eleves.commune }).from(schema.eleves).where(and(inArray(schema.eleves.classeId, classes), eq(schema.eleves.archive, false))) : [];
  const communes = [...new Set(eleves.map((e) => e.commune?.trim()).filter((x): x is string => !!x))].slice(0, 8);
  const villes = communes.length ? communes : ctx.etab.ville ? [ctx.etab.ville] : [];
  const connues = new Set((await db.select({ nom: schema.entreprises.nom }).from(schema.entreprises).where(eq(schema.entreprises.etablissementId, ctx.etab.id))).map((x) => normalNom(x.nom)));
  const mot = motsCles(f.libelle)[0] ?? "";
  const vus = new Set<string>();
  const liste: Prospect[] = [];
  for (const ville of villes) {
    const trouves = [...(await laBonneBoite(f.codeRome, ville)), ...(await annuaire(mot, ville))];
    for (const x of trouves) {
      const k = normalNom(x.nom);
      if (connues.has(k) || vus.has(k)) continue;
      vus.add(k);
      liste.push({ nom: x.nom, ville: x.ville, source: x.source === "bonne_boite" ? "bonne_boite" : "public" });
    }
  }
  return { formation: f.libelle, communes: villes, liste: liste.slice(0, 15) };
}

const normalNom = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function annuaire(mot: string, ville: string): Promise<{ nom: string; ville: string | null; source: "public" }[]> {
  // Parcours de test seulement : des entreprises fictives, sans appel à l'annuaire public.
  if (process.env.CAP_PFMP_ANNUAIRE_FICTIF === "oui") return [`${mot} Services`, `Groupe ${mot} Prévention`].map((nom) => ({ nom: `${nom.charAt(0).toUpperCase()}${nom.slice(1)} (fictive)`, ville, source: "public" as const }));
  if (process.env.CAP_PFMP_ANNUAIRE_PUBLIC === "non" || !mot) return [];
  try {
    const q = new URLSearchParams({ q: `${mot} ${ville}`, etat_administratif: "A", per_page: "10" });
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${q}`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: { nom_complet?: string; siege?: { libelle_commune?: string } }[] };
    return (j.results ?? []).filter((x) => x.nom_complet).map((x) => ({ nom: x.nom_complet!, ville: x.siege?.libelle_commune ?? null, source: "public" as const }));
  } catch {
    return [];
  }
}

const Mail = z.object({ sujet: z.string().trim().min(3).max(200), corps: z.string().trim().min(20).max(5000) });

/**
 * Le mail de prise de contact avec une nouvelle entreprise, préparé par Cap Partenaires : il attend dans « Mails à
 * valider » que le DDFPT le relise, indique l'adresse de l'entreprise et l'envoie.
 */
export async function preparerProspection(ctx: Contexte, p: Prospect, formation: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Mail de prise de contact avec une entreprise", effort: "low",
    consignes: "Tu écris pour un lycée professionnel un premier mail, court et chaleureux, à une entreprise qui n'a encore jamais accueilli ses élèves en stage : présenter la formation, la durée des stages (périodes de quelques semaines), l'accompagnement du lycée (convention, professeur référent, visite), et proposer un échange. Commence par « Madame, Monsieur, ». Réponds avec le sujet et le corps du mail.",
    demande: `Lycée : ${ctx.etab.nom}${ctx.etab.ville ? `, ${ctx.etab.ville}` : ""}. Formation : ${formation}. Entreprise : ${p.nom}${p.ville ? `, ${p.ville}` : ""}. Signe : ${ctx.etab.nom}.`,
    schema: { type: "object", additionalProperties: false, required: ["sujet", "corps"], properties: { sujet: { type: "string" }, corps: { type: "string" } } },
    verifier: (x) => Mail.safeParse(x).data ?? null,
    exemple: () => ({
      sujet: `Accueillir un élève en stage : ${formation}`,
      corps: `Madame, Monsieur,\n\nLe ${ctx.etab.nom} forme des élèves en ${formation}. Au cours de leur formation, ils effectuent des périodes de stage en entreprise de quelques semaines, encadrées par une convention et suivies par un professeur référent, qui vient vous rencontrer pendant le stage.\n\n${p.nom} pourrait-elle accueillir l'un de nos élèves ? Nous serions heureux d'en parler avec vous, par téléphone ou lors d'une visite.\n\nBien cordialement,\n\n${ctx.etab.nom}`,
    }),
  });
  if (!r.ok) return r;
  await db.insert(schema.mailsAValider).values({
    etablissementId: ctx.etab.id, agent: "entreprises", cle: `prospect:${normalNom(p.nom)}`, priorite: 3, destinataires: [],
    motif: `Nouvelle entreprise pour ${formation} : « ${p.nom} »${p.ville ? ` (${p.ville})` : ""}, trouvée par Cap Partenaires (${p.source === "bonne_boite" ? "La bonne boîte" : "annuaire public des entreprises"}). Indiquez son adresse mail avant d'envoyer.`,
    sujet: r.valeur.sujet, corps: r.valeur.corps, simule: r.simule, demandeParId: ctx.user.id,
  }).onConflictDoNothing();
  return { ok: true };
}

export { relectureCvExemple };
