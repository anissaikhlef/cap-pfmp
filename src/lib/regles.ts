/**
 * Moteur de règles PFMP (cahier des charges, section 5).
 * Fonctions pures, sans accès à la base : faciles à tester et réutilisées partout.
 */
import type { Horaires, Plage, Reglages, Signataire, Signatures } from "@/db/schema";
import { ajouterJours, ecartJours, jourSemaine } from "./dates";

export type ResultatRegle = { code: string; ok: boolean; libelle: string };

/** Formulation courte du problème quand une règle n'est pas respectée. */
export const PROBLEMES: Record<string, string> = {
  duree: "durée hebdomadaire hors limites",
  nuit: "horaires de nuit",
  dimanche: "stage le dimanche",
  repos: "repos consécutifs insuffisants",
  structure: "structure non privée",
  dominante: "hors de la dominante",
  mineur_jour: "plus de 8 h par jour pour un mineur",
  mineur_pause: "pause manquante pour un mineur",
  mineur_nuit: "travail de nuit d'un mineur",
  mineur_repos: "repos entre deux journées insuffisant pour un mineur",
  mineur_dimanche: "pas de repos le dimanche pour un mineur",
  convention: "convention incomplète",
};

export function problemes(res: ResultatRegle[], avecConvention = false): string {
  return res.filter((r) => !r.ok && (avecConvention || r.code !== "convention")).map((r) => PROBLEMES[r.code] ?? r.libelle).join(", ");
}

/* ------------------------------------------------------------------ */
/* Signataires de la convention                                          */
/* ------------------------------------------------------------------ */

export const VERBE_SIGNATURE: Record<Signataire, string> = {
  eleve: "Je signe en tant qu'élève",
  parent: "Je signe en tant que responsable légal",
  entreprise: "Je signe pour l'entreprise",
  tuteur: "Je signe en tant que tuteur de stage",
  professeur: "Je signe en tant que professeur référent",
  direction: "Je signe pour la direction",
};

export const SIGNATAIRES: { cle: Signataire; libelle: string }[] = [
  { cle: "eleve", libelle: "Élève" },
  { cle: "parent", libelle: "Responsable légal" },
  { cle: "entreprise", libelle: "Représentant de l'entreprise" },
  { cle: "tuteur", libelle: "Tuteur de stage" },
  { cle: "professeur", libelle: "Professeur référent" },
  { cle: "direction", libelle: "Direction" },
];

export const libelleSignataire = (k: Signataire) => SIGNATAIRES.find((s) => s.cle === k)!.libelle;

/** Signataires attendus : le responsable légal seulement pour un élève mineur, le tuteur seulement s'il est désigné. */
export function signatairesAttendus(age: number | null, tuteurDesigne: boolean): Signataire[] {
  return SIGNATAIRES.map((s) => s.cle).filter((k) => (k !== "parent" || age === null || age < 18) && (k !== "tuteur" || tuteurDesigne));
}

export function signaturesCompletes(s: Signatures, requis: Signataire[] = SIGNATAIRES.map((x) => x.cle)): boolean {
  return requis.every((k) => !!s[k]);
}

/**
 * Celui qui signe en dernier (professeur référent ou direction, selon le lycée) vérifie la convention :
 * il ne signe qu'après tous les autres, et seulement un stage conforme. Les autres signent à tout moment.
 * Renvoie la raison du refus, ou null.
 */
export function blocageSignature(qualite: Signataire, requis: Signataire[], signatures: Signatures, dernier: Signataire, conforme: boolean): string | null {
  if (qualite !== dernier || !requis.includes(dernier)) return null;
  const manquants = requis.filter((k) => k !== dernier && !signatures[k]);
  if (manquants.length) return `En attente de : ${manquants.map((k) => libelleSignataire(k).toLowerCase()).join(", ")}.`;
  if (!conforme) return "Le stage ne respecte pas toutes les règles : corrigez-le avant la dernière signature.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Horaires : une ou deux plages par jour                                */
/* ------------------------------------------------------------------ */

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Début et fin d'une plage en minutes depuis le début du jour ; une plage qui passe minuit finit après 1 440. */
function bornes([debut, fin]: Plage): [number, number] {
  const d = minutes(debut);
  let f = minutes(fin);
  if (f <= d) f += 1440;
  return [d, f];
}

/** Durée d'une plage en minutes. Une plage qui finit après minuit (ex. 20:00–02:00) est comptée sur deux jours. */
function duree(p: Plage): number {
  const [d, f] = bornes(p);
  return f - d;
}

/** Les plages d'un jour (lundi = 0), dans l'ordre ; aucune un jour de repos. Accepte aussi l'ancien format à une seule plage. */
export function plagesDuJour(h: Horaires, i: number): Plage[] {
  const j = h[i] as unknown;
  if (!Array.isArray(j) || j.length === 0) return [];
  const liste = typeof j[0] === "string" ? [j as Plage] : (j as Plage[]);
  return [...liste].sort((x, y) => minutes(x[0]) - minutes(y[0]));
}

export function jourTravaille(h: Horaires, i: number): boolean {
  return plagesDuJour(h, i).length > 0;
}

export function heuresJour(h: Horaires, i: number): number {
  return plagesDuJour(h, i).reduce((t, p) => t + duree(p), 0) / 60;
}

export function heuresHebdo(h: Horaires): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t += heuresJour(h, i);
  return t;
}

/** Toutes les plages de la semaine. */
export function toutesLesPlages(h: Horaires): Plage[] {
  return [0, 1, 2, 3, 4, 5, 6].flatMap((i) => plagesDuJour(h, i));
}

/** Texte d'une journée : « 08:30 – 12:00 · 13:00 – 16:30 », ou null un jour de repos. */
export function texteJour(h: Horaires, i: number): string | null {
  const p = plagesDuJour(h, i);
  return p.length ? p.map(([d, f]) => `${d} – ${f}`).join(" · ") : null;
}

/** Vrai si la plage touche la nuit [nuitDebut, nuitFin[ (ex. 22:00 → 06:00). */
export function toucheLaNuit([debut, fin]: Plage, nuitDebut: string, nuitFin: string): boolean {
  const [d, f] = bornes([debut, fin]);
  const nd = minutes(nuitDebut), nf = minutes(nuitFin);
  // Intervalles de nuit sur deux jours consécutifs, exprimés en minutes depuis le début du jour de la plage
  const nuits: [number, number][] = nd > nf
    ? [[-1440 + nd, nf], [nd, 1440 + nf], [1440 + nd, 2880 + nf]]
    : [[nd, nf], [1440 + nd, 1440 + nf]];
  return nuits.some(([a, b]) => d < b && f > a);
}

/** Plus longue suite de jours sans horaire, la semaine étant considérée comme cyclique (dimanche → lundi). */
export function plusLongRepos(h: Horaires): number {
  if ([0, 1, 2, 3, 4, 5, 6].every((i) => !jourTravaille(h, i))) return 7;
  let best = 0;
  for (let i = 0; i < 7; i++) {
    let n = 0;
    while (n < 7 && !jourTravaille(h, (i + n) % 7)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Élèves mineurs (code du travail, article 10 de la convention)          */
/* ------------------------------------------------------------------ */

export const MINEURS = {
  heuresParJour: 8,
  travailSansPauseMinutes: 270, // 4 h 30
  pauseMinutes: 30,
  nuitMoins16: ["20:00", "06:00"] as const,
  nuit16a18: ["22:00", "06:00"] as const,
  reposQuotidienMoins16: 14,
  reposQuotidien16a18: 12,
};

/**
 * Pause d'un mineur sur une journée : aucune période de travail ininterrompue de plus de 4 h 30 et,
 * au-delà de 4 h 30 de travail dans la journée, une pause d'au moins 30 minutes consécutives.
 */
export function pauseConforme(plages: Plage[]): boolean {
  const b = plages.map(bornes).sort((x, y) => x[0] - y[0]);
  if (b.some(([d, f]) => f - d > MINEURS.travailSansPauseMinutes)) return false;
  const total = b.reduce((t, [d, f]) => t + f - d, 0);
  if (total <= MINEURS.travailSansPauseMinutes) return true;
  return b.some(([d], k) => k > 0 && d - b[k - 1][1] >= MINEURS.pauseMinutes);
}

/** Plus court repos entre deux journées de travail consécutives (en minutes), ou null s'il n'y a jamais deux jours de suite. */
export function reposQuotidienMinimal(h: Horaires): number | null {
  let min: number | null = null;
  for (let i = 0; i < 7; i++) {
    const j = (i + 1) % 7;
    if (!jourTravaille(h, i) || !jourTravaille(h, j)) continue;
    const fin = Math.max(...plagesDuJour(h, i).map((p) => bornes(p)[1]));
    const debut = Math.min(...plagesDuJour(h, j).map((p) => bornes(p)[0]));
    const repos = 1440 - fin + debut;
    min = min === null ? repos : Math.min(min, repos);
  }
  return min;
}

/** Repos hebdomadaire d'un mineur : deux jours consécutifs, dont le dimanche. */
export function reposHebdoMineur(h: Horaires): boolean {
  return !jourTravaille(h, 6) && (!jourTravaille(h, 5) || !jourTravaille(h, 0));
}

function reglesMineurs(h: Horaires, age: number): ResultatRegle[] {
  const moins16 = age < 16;
  const travailles = [0, 1, 2, 3, 4, 5, 6].filter((i) => jourTravaille(h, i));
  const [nd, nf] = moins16 ? MINEURS.nuitMoins16 : MINEURS.nuit16a18;
  const repos = moins16 ? MINEURS.reposQuotidienMoins16 : MINEURS.reposQuotidien16a18;
  const rq = reposQuotidienMinimal(h);
  const qui = moins16 ? "Élève de moins de 16 ans" : "Élève mineur";
  return [
    { code: "mineur_jour", ok: travailles.every((i) => heuresJour(h, i) <= MINEURS.heuresParJour), libelle: `${qui} : ${MINEURS.heuresParJour} h de travail par jour au maximum` },
    { code: "mineur_pause", ok: travailles.every((i) => pauseConforme(plagesDuJour(h, i))), libelle: `${qui} : jamais plus de 4 h 30 sans pause, et une pause d'au moins 30 min au-delà` },
    { code: "mineur_nuit", ok: !toutesLesPlages(h).some((p) => toucheLaNuit(p, nd, nf)), libelle: `${qui} : aucun travail entre ${nd.slice(0, 2)} h et ${nf.slice(1, 2)} h` },
    { code: "mineur_repos", ok: rq === null || rq >= repos * 60, libelle: `${qui} : ${repos} h de repos entre deux journées de travail` },
    { code: "mineur_dimanche", ok: reposHebdoMineur(h), libelle: `${qui} : 2 jours de repos consécutifs, dont le dimanche` },
  ];
}

/* ------------------------------------------------------------------ */
/* Contrôle d'un stage                                                   */
/* ------------------------------------------------------------------ */

export type ContexteStage = {
  horaires: Horaires;
  regleStructure: "prive" | "dominante" | "libre";
  secteurEntreprise: "prive" | "public";
  domaineEntreprise: string | null;
  dominanteEleve: string | null;
  signatures: Signatures;
  /** Signataires attendus : sans le responsable légal pour un élève majeur, avec le tuteur s'il est désigné. */
  signatairesRequis?: Signataire[];
  /** Âge de l'élève au premier jour du stage (règles des mineurs). */
  ageAuDebut?: number | null;
};

export function verifierStage(c: ContexteStage, r: Reglages["regles"]): ResultatRegle[] {
  const total = heuresHebdo(c.horaires);
  const plages = toutesLesPlages(c.horaires);
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
  if (r.dimancheInterdit) res.push({ code: "dimanche", ok: !jourTravaille(c.horaires, 6), libelle: "Pas de stage le dimanche" });
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
  if (r.reglesMineurs !== false && c.ageAuDebut != null && c.ageAuDebut < 18) res.push(...reglesMineurs(c.horaires, c.ageAuDebut));
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

/* ------------------------------------------------------------------ */
/* Jours effectués (absences déduites)                                  */
/* ------------------------------------------------------------------ */

/** Jours de stage prévus : chaque jour de la période où l'élève a des horaires. */
export function joursPrevus(h: Horaires, debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) if (jourTravaille(h, jourSemaine(d))) jours.push(d);
  return jours;
}

export type Semaine = { lundi: string; prevus: number; absences: number; effectues: number; aVenir: number };
export type BilanJours = { semaines: Semaine[]; prevus: number; absences: number; effectues: number; aVenir: number };

/**
 * Jours effectués, semaine par semaine : les jours prévus, moins les jours d'absence.
 * Un jour prévu après `jusquAu` (en général aujourd'hui) n'est pas encore effectué : il est « à venir ».
 */
export function joursEffectues(h: Horaires, debut: string, fin: string, absences: { debut: string; fin: string }[], jusquAu: string): BilanJours {
  const semaines = new Map<string, Semaine>();
  for (const d of joursPrevus(h, debut, fin)) {
    const lundi = ajouterJours(d, -jourSemaine(d));
    const s = semaines.get(lundi) ?? { lundi, prevus: 0, absences: 0, effectues: 0, aVenir: 0 };
    s.prevus++;
    if (absences.some((a) => a.debut <= d && d <= a.fin)) s.absences++;
    else if (d <= jusquAu) s.effectues++;
    else s.aVenir++;
    semaines.set(lundi, s);
  }
  const liste = [...semaines.values()].sort((x, y) => x.lundi.localeCompare(y.lundi));
  const somme = (k: "prevus" | "absences" | "effectues" | "aVenir") => liste.reduce((t, s) => t + s[k], 0);
  return { semaines: liste, prevus: somme("prevus"), absences: somme("absences"), effectues: somme("effectues"), aVenir: somme("aVenir") };
}

/** Jours d'absence comptés pour une absence : les jours prévus du stage compris entre ses deux dates. */
export function joursDAbsence(h: Horaires, absence: { debut: string; fin: string }): number {
  return joursPrevus(h, absence.debut, absence.fin).length;
}

/* ------------------------------------------------------------------ */
/* Allocation de stage                                                  */
/* ------------------------------------------------------------------ */

export type PieceAllocation = "rib" | "piece_identite";
export const PIECES_ALLOCATION: PieceAllocation[] = ["rib", "piece_identite"];
type EtatDepot = { statut: "a_verifier" | "valide" | "refuse" };
export type PiecesAllocation = Partial<Record<PieceAllocation, EtatDepot>>;

/** Pièces à demander à la famille : jamais déposées, ou refusées. Une pièce en cours de vérification n'est pas redemandée. */
export function piecesManquantes(p: PiecesAllocation | undefined): PieceAllocation[] {
  return PIECES_ALLOCATION.filter((t) => !p?.[t] || p[t]!.statut === "refuse");
}

/** Vrai si une pièce déposée attend la vérification de la gestion des PFMP. */
export function piecesAVerifier(p: PiecesAllocation | undefined): boolean {
  return PIECES_ALLOCATION.some((t) => p?.[t]?.statut === "a_verifier");
}

/**
 * Dossier d'allocation complet : RIB et pièce d'identité vérifiés, et attestation validée pour chaque stage terminé.
 * Sans aucun stage dans l'année, il n'y a pas d'allocation : le dossier n'est pas « complet ».
 */
export function dossierAllocationComplet(p: PiecesAllocation | undefined, stages: { termine: boolean; attestation: EtatDepot | null }[]): boolean {
  return PIECES_ALLOCATION.every((t) => p?.[t]?.statut === "valide")
    && stages.length > 0 && stages.filter((s) => s.termine).every((s) => s.attestation?.statut === "valide");
}

/* ------------------------------------------------------------------ */
/* Relances automatiques                                                */
/* ------------------------------------------------------------------ */

/**
 * Jours de relance saisis dans « Organisation » : « 7, 3 », « 7 et 3 », « 7 3 ». Vide : aucune relance.
 * Renvoie null si la saisie n'est pas une liste de nombres de jours entre 1 et 60 (5 au plus).
 */
export function lireJours(texte: string): number[] | null {
  const t = texte.trim();
  if (!t) return [];
  const morceaux = t.split(/\s*(?:,|;|\bet\b|\s)\s*/).filter(Boolean);
  if (!morceaux.every((m) => /^\d{1,2}$/.test(m))) return null;
  const jours = [...new Set(morceaux.map(Number))];
  return jours.every((j) => j >= 1 && j <= 60) && jours.length <= 5 ? jours : null;
}

/** Une relance par semaine, au plus `max` fois : `dejaEnvoyees` sont les jours des relances précédentes. */
export function relanceHebdomadaireDue(dejaEnvoyees: string[], jour: string, max: number): boolean {
  return dejaEnvoyees.length < max && dejaEnvoyees.every((d) => ecartJours(d, jour) >= 7);
}
