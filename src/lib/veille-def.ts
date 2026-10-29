import type { Reglages } from "@/db/schema";

/**
 * Cap Veille (décisions d'Anissa) : les changements qu'un texte officiel peut appliquer en un clic dans Cap PFMP, une fois
 * proposés par le DDFPT et validés par la direction ; et les échéances officielles. Seules ces cases peuvent changer :
 * tout le reste se décide et se fait à la main. Fonctions pures, testées.
 */
export const CIBLES = {
  "regles.heuresMin": { libelle: "Durée hebdomadaire minimale du stage (heures)", type: "nombre", min: 0, max: 48 },
  "regles.heuresMax": { libelle: "Durée hebdomadaire maximale du stage (heures)", type: "nombre", min: 1, max: 48 },
  "regles.nuitDebut": { libelle: "Début du travail de nuit (HH:MM)", type: "heure" },
  "regles.nuitFin": { libelle: "Fin du travail de nuit (HH:MM)", type: "heure" },
  "regles.joursReposConsecutifs": { libelle: "Jours de repos consécutifs par semaine", type: "nombre", min: 0, max: 3 },
  "regles.dimancheInterdit": { libelle: "Stage interdit le dimanche", type: "oui_non" },
  "regles.reglesMineurs": { libelle: "Règles du code du travail pour les élèves mineurs", type: "oui_non" },
} as const;
export type Cible = keyof typeof CIBLES;
export const NOMS_CIBLES = Object.keys(CIBLES) as Cible[];

export type Changement = { libelle: string; cible: Cible; valeur: string };

/** La valeur d'un changement, lue et vérifiée (null : refusée). */
export function valeurDe(c: Pick<Changement, "cible" | "valeur">): number | boolean | string | null {
  const d = CIBLES[c.cible];
  if (!d) return null;
  const v = String(c.valeur).trim().toLowerCase();
  if (d.type === "nombre") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= d.min && n <= d.max ? n : null;
  }
  if (d.type === "heure") return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
  if (["oui", "vrai", "true"].includes(v)) return true;
  if (["non", "faux", "false"].includes(v)) return false;
  return null;
}

/** Les réglages du lycée après le changement (null : changement refusé, ou incohérent avec les autres réglages). */
export function appliquerChangement(r: Reglages, c: Pick<Changement, "cible" | "valeur">): Reglages | null {
  const v = valeurDe(c);
  if (v === null) return null;
  const cle = c.cible.split(".")[1] as keyof Reglages["regles"];
  const regles = { ...r.regles, [cle]: v } as Reglages["regles"];
  if (regles.heuresMin > regles.heuresMax) return null;
  return { ...r, regles };
}

/** La valeur actuelle, en clair, pour comparer avant d'appliquer. */
export function valeurActuelle(r: Reglages, cible: Cible): string {
  const v = r.regles[cible.split(".")[1] as keyof Reglages["regles"]];
  return typeof v === "boolean" ? (v ? "oui" : "non") : String(v);
}

export type Echeance = { titre: string; date: string; concerne: "toutes" | "examen" };
/** Une échéance proposée par Cap Veille : une date valide, à venir. */
export const echeanceValide = (e: Echeance, jour: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !Number.isNaN(Date.parse(e.date)) && e.date >= jour && e.titre.trim().length >= 3;

/** Pages de l'académie, saisies une par ligne : « VERSAILLES | https://… ». Une ligne invalide est ignorée. */
export function lirePagesAcademies(texte: string): Record<string, string[]> {
  const res: Record<string, string[]> = {};
  for (const ligne of texte.split("\n")) {
    const m = ligne.match(/^\s*([^|]+?)\s*\|\s*(https?:\/\/\S+)\s*$/);
    if (!m) continue;
    const a = m[1].toUpperCase();
    res[a] = [...new Set([...(res[a] ?? []), m[2]])];
  }
  return res;
}
