/**
 * Moteur de règles PFMP (cahier des charges, section 5).
 * Fonctions pures, sans accès à la base : faciles à tester et réutilisées partout.
 */
import type { Horaires, Reglages, Signataire, Signatures } from "@/db/schema";
import { ecartJours } from "./dates";

export type ResultatRegle = { code: string; ok: boolean; libelle: string };

export const SIGNATAIRES: { cle: Signataire; libelle: string }[] = [
  { cle: "eleve", libelle: "Élève" },
  { cle: "parent", libelle: "Responsable légal" },
  { cle: "professeur", libelle: "Professeur référent" },
  { cle: "entreprise", libelle: "Entreprise" },
  { cle: "direction", libelle: "Direction" },
];

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Durée d'une plage en minutes. Une plage qui finit après minuit (ex. 20:00–02:00) est comptée sur deux jours. */
function duree([debut, fin]: [string, string]): number {
  const d = minutes(debut), f = minutes(fin);
  return f > d ? f - d : f + 1440 - d;
}

export function heuresHebdo(h: Horaires): number {
  return h.reduce((t, p) => t + (p ? duree(p) : 0), 0) / 60;
}

/** Vrai si la plage touche la nuit [nuitDebut, nuitFin[ (ex. 22:00 → 06:00). */
export function toucheLaNuit([debut, fin]: [string, string], nuitDebut: string, nuitFin: string): boolean {
  const d = minutes(debut);
  let f = minutes(fin);
  if (f <= d) f += 1440; // passe minuit
  const nd = minutes(nuitDebut), nf = minutes(nuitFin);
  // Intervalles de nuit sur deux jours consécutifs, exprimés en minutes depuis le début du jour de la plage
  const nuits: [number, number][] = nd > nf
    ? [[-1440 + nd, nf], [nd, 1440 + nf], [1440 + nd, 2880 + nf]]
    : [[nd, nf], [1440 + nd, 1440 + nf]];
  return nuits.some(([a, b]) => d < b && f > a);
}

/** Plus longue suite de jours sans horaire, la semaine étant considérée comme cyclique (dimanche → lundi). */
export function plusLongRepos(h: Horaires): number {
  if (h.every((p) => !p)) return 7;
  let best = 0;
  for (let i = 0; i < 7; i++) {
    let n = 0;
    while (n < 7 && !h[(i + n) % 7]) n++;
    best = Math.max(best, n);
  }
  return best;
}

export function signaturesCompletes(s: Signatures, requis: Signataire[] = SIGNATAIRES.map((x) => x.cle)): boolean {
  return requis.every((k) => !!s[k]);
}

export type ContexteStage = {
  horaires: Horaires;
  regleStructure: "prive" | "dominante" | "libre";
  secteurEntreprise: "prive" | "public";
  domaineEntreprise: string | null;
  dominanteEleve: string | null;
  signatures: Signatures;
  /** Signataires attendus : sans le responsable légal pour un élève majeur. */
  signatairesRequis?: Signataire[];
};

export function verifierStage(c: ContexteStage, r: Reglages["regles"]): ResultatRegle[] {
  const total = heuresHebdo(c.horaires);
  const plages = c.horaires.filter((p): p is [string, string] => !!p);
  const res: ResultatRegle[] = [
    {
      code: "duree",
      ok: total >= r.heuresMin && total <= r.heuresMax,
      libelle: `Durée hebdomadaire : ${fmtHeures(total)} (entre ${r.heuresMin} h et ${r.heuresMax} h)`,
    },
    {
      code: "nuit",
      ok: !plages.some((p) => toucheLaNuit(p, r.nuitDebut, r.nuitFin)),
      libelle: `Aucun horaire de nuit (${r.nuitDebut.replace(":", " h ")} – ${r.nuitFin.replace(":", " h ")})`.replace(/ h 00/g, " h"),
    },
  ];
  if (r.dimancheInterdit) res.push({ code: "dimanche", ok: !c.horaires[6], libelle: "Pas de stage le dimanche" });
  if (r.joursReposConsecutifs > 0) {
    res.push({
      code: "repos",
      ok: plusLongRepos(c.horaires) >= r.joursReposConsecutifs,
      libelle: `${r.joursReposConsecutifs} jours de repos consécutifs`,
    });
  }
  if (c.regleStructure === "prive") {
    res.push({ code: "structure", ok: c.secteurEntreprise === "prive", libelle: "Structure du secteur privé" });
  } else if (c.regleStructure === "dominante") {
    const ok = !!c.dominanteEleve && !!c.domaineEntreprise && norm(c.dominanteEleve) === norm(c.domaineEntreprise);
    res.push({
      code: "dominante",
      ok,
      libelle: c.dominanteEleve ? `Stage dans la dominante de l'élève : ${c.dominanteEleve}` : "Stage dans la dominante (dominante de l'élève non renseignée)",
    });
  }
  res.push({
    code: "convention",
    ok: signaturesCompletes(c.signatures, c.signatairesRequis),
    libelle: "Convention signée par toutes les parties",
  });
  return res;
}

/** Conforme = toutes les règles respectées, hors convention (qui suit son propre circuit). */
export function stageConforme(res: ResultatRegle[]): boolean {
  return res.filter((x) => x.code !== "convention").every((x) => x.ok);
}

function norm(s: string) {
  return s.trim().toLocaleLowerCase("fr");
}

export function fmtHeures(h: number): string {
  const entier = Math.floor(h);
  const min = Math.round((h - entier) * 60);
  return min ? `${entier} h ${String(min).padStart(2, "0")}` : `${entier} h`;
}

/* ------------------------------------------------------------------ */
/* Statut d'un élève sur une période                                    */
/* ------------------------------------------------------------------ */

export type Statut = "sans_stage" | "convention" | "pret" | "en_stage" | "en_stage_sans_convention" | "documents" | "termine";

export const STATUTS: Record<Statut, { libelle: string; ton: "bad" | "warn" | "ok" | "info" }> = {
  sans_stage: { libelle: "Sans lieu de stage", ton: "bad" },
  convention: { libelle: "Convention en cours", ton: "warn" },
  pret: { libelle: "Prêt à partir", ton: "ok" },
  en_stage: { libelle: "En stage", ton: "info" },
  en_stage_sans_convention: { libelle: "En stage sans convention complète", ton: "bad" },
  documents: { libelle: "Documents à rendre", ton: "warn" },
  termine: { libelle: "Terminé", ton: "ok" },
};

export function statutEleve(p: {
  aujourdhui: string;
  debut: string;
  fin: string;
  aUnStage: boolean;
  conventionComplete: boolean;
  attestationValidee: boolean;
  livretValide: boolean;
}): Statut {
  if (!p.aUnStage) return "sans_stage";
  if (ecartJours(p.aujourdhui, p.debut) > 0) return p.conventionComplete ? "pret" : "convention";
  if (ecartJours(p.fin, p.aujourdhui) <= 0) return p.conventionComplete ? "en_stage" : "en_stage_sans_convention";
  return p.attestationValidee && p.livretValide ? "termine" : "documents";
}
