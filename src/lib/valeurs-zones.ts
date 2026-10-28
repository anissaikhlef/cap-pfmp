import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttestationStage, LivretStage, Reglages } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { donneesConvention, grilleEtQuestions, modeleDuLycee } from "./modeles-documents";
import type { ValeursZones } from "./modeles-pdf";
import { NIVEAUX_COMPETENCES, REMPLIE_PAR } from "./modeles";
import { lireFichier } from "./stockage";
import type { GrillesZones } from "./zones";
import { SIGNATAIRES } from "./regles";

/**
 * Ce que Cap PFMP écrit dans les zones placées par le lycée sur son PDF, pour chaque document : les données communes
 * (élève, classe, période, entreprise, tuteur, référent, lycée), puis celles du document, ses croix et ses signatures.
 */
type Etab = { id: string; nom: string; reglages: Reglages; logoCle?: string | null };
type Visite = typeof schema.visites.$inferSelect;
type Activite = typeof schema.activitesJour.$inferSelect;

const jjmmaaaa = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const mention = (le: string) => ({ mention: `Signé en ligne dans Cap PFMP le ${jjmmaaaa(le)}` });

async function signatureImage(cle: string | undefined, le: string) {
  const image = cle ? await lireFichier(cle).catch(() => null) : null;
  return image ? { image: new Uint8Array(image) } : mention(le);
}

/** Les grilles du lycée, pour proposer les zones : attitudes, compétences de chaque diplôme, questions de l'appel. */
export async function grillesZones(etabId: string): Promise<GrillesZones> {
  const { grille, questions } = await grilleEtQuestions(etabId);
  const p = (await modeleDuLycee(etabId, "livret")).personnalisation;
  return {
    attitudes: grille, questions, competences: (p.competences ?? []).map((c) => c.liste),
    niveauxCompetences: p.niveauxCompetences?.length ? p.niveauxCompetences : NIVEAUX_COMPETENCES,
  };
}

/** Le niveau retenu pour chaque ligne d'une grille : en toutes lettres, et une croix dans la case de ce niveau. */
function grilleNotee(d: Map<string, string | boolean>, prefixe: string, notes: { libelle: string; niveau: string }[], niveaux: (libelle: string, i: number) => string[]) {
  notes.forEach((n, i) => {
    d.set(`${prefixe}.${i}`, n.niveau);
    niveaux(n.libelle, i).forEach((niv, j) => d.set(`${prefixe}.${i}.${j}`, niv === n.niveau));
  });
}

export async function valeursConvention(etab: Etab, cv: ContexteConvention): Promise<ValeursZones> {
  const donnees = await donneesConvention(etab, cv);
  const signatures: ValeursZones["signatures"] = new Map();
  for (const { cle } of SIGNATAIRES) {
    const sig = cv.s.signatures[cle];
    if (sig?.mode === "enligne") signatures.set(`signature.${cle}`, await signatureImage(sig.image, sig.le));
  }
  return { donnees, signatures };
}

function remplissage(d: Map<string, string | boolean>, doc: "attestation" | "livret", r: Omit<AttestationStage | LivretStage, "documentId">) {
  d.set(`${doc}.rempliePar`, REMPLIE_PAR[r.rempliePar]);
  for (const k of Object.keys(REMPLIE_PAR)) d.set(`${doc}.rempliePar.${k}`, k === r.rempliePar);
  d.set(`${doc}.professeur`, r.professeur ?? "");
  d.set(`${doc}.signataire.nom`, r.signataire.nom);
  d.set(`${doc}.signataire.fonction`, r.signataire.fonction ?? "");
  d.set(`${doc}.date`, jjmmaaaa(r.le));
}

export async function valeursAttestation(etab: Etab, cv: ContexteConvention, att: Omit<AttestationStage, "documentId">): Promise<ValeursZones> {
  const donnees = await donneesConvention(etab, cv);
  donnees.set("attestation.joursEffectues", String(att.joursEffectues));
  donnees.set("attestation.joursAbsence", String(att.joursAbsence));
  donnees.set("attestation.activites", att.activites);
  donnees.set("attestation.appreciation", att.appreciation ?? "");
  remplissage(donnees, "attestation", att);
  return { donnees, signatures: new Map([["attestation.signature", await signatureImage(att.signature.image, att.le)]]) };
}

export async function valeursLivret(etab: Etab, cv: ContexteConvention, livret: Omit<LivretStage, "documentId">, carnet: Activite[]): Promise<ValeursZones> {
  const donnees = await donneesConvention(etab, cv);
  const g = await grillesZones(etab.id);
  donnees.set("livret.bilan", livret.bilan ?? "");
  donnees.set("livret.carnet", carnet.map((a) => `${jjmmaaaa(a.date)} : ${a.texte}`).join("\n"));
  remplissage(donnees, "livret", livret);
  grilleNotee(donnees, "livret.att", livret.attitudes.map((a) => ({ libelle: a.critere, niveau: a.niveau })), (c) => g.attitudes.find((x) => x.critere === c)?.niveaux ?? []);
  grilleNotee(donnees, "livret.comp", livret.competences.map((c) => ({ libelle: c.competence, niveau: c.niveau })), () => g.niveauxCompetences);
  return { donnees, signatures: new Map([["livret.signature", await signatureImage(livret.signature.image, livret.le)]]) };
}

const ADEQUATION = { oui: "Oui", en_partie: "En partie", non: "Non" } as const;

export async function valeursOrdreMission(etab: Etab, cv: ContexteConvention, v: Visite): Promise<ValeursZones> {
  const donnees = await donneesConvention(etab, cv);
  const ids = [v.visiteurId, v.ordreMissionSigneParId, v.appel?.parId].filter((x): x is string => !!x);
  const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const nom = (id: string | null | undefined) => { const u = users.find((x) => x.id === id); return u ? `${u.prenom} ${u.nom}` : ""; };
  const { grille, questions } = await grilleEtQuestions(etab.id);
  const set = (k: string, val: string | boolean) => donnees.set(k, val);
  set("om.visiteur", nom(v.visiteurId));
  set("om.transport", v.transport === "vehicule" ? "Véhicule personnel" : v.transport === "commun" ? "Transport en commun" : "");
  set("om.transport.vehicule", v.transport === "vehicule");
  set("om.transport.commun", v.transport === "commun");
  const signe = v.ordreMission === "signe" && v.ordreMissionSigneLe;
  set("om.signataire", signe ? nom(v.ordreMissionSigneParId) : "");
  set("om.date", signe ? jjmmaaaa(v.ordreMissionSigneLe!.toISOString()) : "");
  set("visite.date", jjmmaaaa(v.date));
  set("visite.heure", v.heure ? v.heure.replace(":", "h") : "");
  set("visite.mode", v.date ? (v.mode === "presentiel" ? "Sur place" : "À distance") : "");
  if (v.appel) {
    set("appel.date", jjmmaaaa(v.appel.date));
    set("appel.par", nom(v.appel.parId));
    set("appel.commentaire", v.appel.commentaire ?? "");
    // Les réponses suivent les questions posées ce jour-là, retrouvées par leur texte.
    questions.forEach((q, i) => {
      const r = v.appel!.reponses.find((x) => x.question === q)?.reponse;
      if (!r) return;
      set(`appel.q.${i}`, r === "oui" ? "Oui" : "Non");
      set(`appel.q.${i}.oui`, r === "oui");
      set(`appel.q.${i}.non`, r === "non");
    });
  }
  const signatures: ValeursZones["signatures"] = new Map();
  if (signe) signatures.set("om.signature", mention(v.ordreMissionSigneLe!.toISOString()));
  if (v.cachet) {
    set("cachet.nom", v.cachet.nom);
    set("cachet.qualite", v.cachet.qualite);
    set("cachet.date", jjmmaaaa(v.cachet.le));
    signatures.set("cachet.signature", await signatureImage(v.cachet.image, v.cachet.le));
  }
  const cr = v.compteRendu;
  if (cr) {
    set("cr.personne", cr.personneRencontree);
    set("cr.observations", cr.observations);
    set("cr.commentaireEntreprise", cr.commentaireEntreprise ?? "");
    if (cr.adequation) {
      set("cr.adequation", ADEQUATION[cr.adequation]);
      for (const k of Object.keys(ADEQUATION)) set(`cr.adequation.${k}`, k === cr.adequation);
    }
    // La grille du lycée, dans son ordre : chaque attitude retrouvée par son nom dans le compte rendu.
    grille.forEach((g, i) => {
      const e = cr.evaluations?.find((x) => x.critere === g.critere);
      if (!e) return;
      set(`cr.att.${i}`, e.niveau);
      g.niveaux.forEach((n, j) => set(`cr.att.${i}.${j}`, n === e.niveau));
    });
  }
  return { donnees, signatures };
}
