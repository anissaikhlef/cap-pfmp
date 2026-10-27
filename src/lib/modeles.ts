import type { ChampPdf } from "@/db/schema";
import { SIGNATAIRES } from "./regles";

/**
 * Modèles de documents propres à chaque lycée (décision d'Anissa : « les documents peuvent être modifiés en fonction
 * des lycées »). Ici, les fonctions pures : ce que l'on peut écrire dans un champ du PDF du lycée, la donnée proposée
 * d'après le nom du champ, et l'option à choisir dans une liste déroulante.
 */

/** Textes du modèle Cap PFMP de la convention, que le lycée peut remplacer. */
export const TITRE_CONVENTION = "Convention relative à la période de formation en milieu professionnel";
export const ENGAGEMENTS_CONVENTION = [
  "L'élève conserve son statut scolaire pendant toute la période. Il n'est pas employé de l'organisme d'accueil.",
  "Le professeur référent assure le suivi de l'élève et effectue au moins une visite pendant la période.",
  "À la fin de la période, l'organisme d'accueil remet une attestation de stage et complète le livret de compétences.",
].join("\n\n");

/** Un texte saisi, découpé en paragraphes (lignes vides entre eux). */
export function paragraphes(texte: string | undefined): string[] {
  return (texte ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
}

export type SorteSource = "texte" | "case";
export type SourceDonnee = { cle: string; libelle: string; groupe: string; sorte: SorteSource };

/** Ce qui n'est pas une donnée : laisser vide, texte fixe, ou complété en signant par la famille ou l'entreprise. */
export const SOURCES_SPECIALES = {
  vide: "",
  fixe: "fixe",
  coche: "coche",
  famille: "famille",
  entreprise: "entreprise",
} as const;

export const JOURS_HORAIRES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

const t = (cle: string, libelle: string, groupe: string): SourceDonnee => ({ cle, libelle, groupe, sorte: "texte" });
const c = (cle: string, libelle: string, groupe: string): SourceDonnee => ({ cle, libelle, groupe, sorte: "case" });

/** Les données de Cap PFMP que l'on peut écrire dans la convention du lycée. */
export const SOURCES_CONVENTION: SourceDonnee[] = [
  t("eleve.nomPrenom", "Nom et prénom de l'élève", "Élève"),
  t("eleve.nom", "Nom de l'élève", "Élève"),
  t("eleve.prenom", "Prénom de l'élève", "Élève"),
  t("eleve.dateNaissance", "Date de naissance", "Élève"),
  t("eleve.email", "Adresse e-mail de l'élève", "Élève"),
  c("eleve.mineur", "Élève mineur au début du stage", "Élève"),
  c("eleve.majeur", "Élève majeur au début du stage", "Élève"),
  t("classe.libelle", "Classe", "Classe et période"),
  t("classe.filiere", "Diplôme préparé", "Classe et période"),
  t("classe.classeEtFiliere", "Classe et diplôme", "Classe et période"),
  t("eleve.dominante", "Dominante", "Classe et période"),
  t("periode.libelle", "Nom de la période (PFMP 1…)", "Classe et période"),
  t("periode.debut", "Premier jour du stage", "Classe et période"),
  t("periode.fin", "Dernier jour du stage", "Classe et période"),
  t("periode.jours", "Nombre de jours de stage prévus", "Classe et période"),
  t("periode.semaines", "Nombre de semaines", "Classe et période"),
  t("periode.heuresHebdo", "Heures de travail par semaine", "Classe et période"),
  t("entreprise.nom", "Nom de l'entreprise", "Entreprise"),
  t("entreprise.adresse", "Adresse de l'entreprise", "Entreprise"),
  t("entreprise.domaine", "Domaine d'activité", "Entreprise"),
  t("entreprise.telephone", "Téléphone de l'entreprise", "Entreprise"),
  t("entreprise.email", "Adresse e-mail de l'entreprise", "Entreprise"),
  t("entreprise.representant", "Représentant : nom", "Entreprise"),
  t("entreprise.representantFonction", "Représentant : fonction", "Entreprise"),
  c("entreprise.prive", "Entreprise du secteur privé", "Entreprise"),
  c("entreprise.public", "Organisme du secteur public", "Entreprise"),
  t("tuteur.nom", "Nom du tuteur", "Tuteur"),
  t("tuteur.fonction", "Fonction du tuteur", "Tuteur"),
  t("tuteur.telephone", "Téléphone du tuteur", "Tuteur"),
  t("tuteur.email", "Adresse e-mail du tuteur", "Tuteur"),
  t("referent.nom", "Professeur référent : nom", "Professeur référent"),
  t("referent.telephone", "Professeur référent : téléphone", "Professeur référent"),
  t("referent.email", "Professeur référent : adresse e-mail", "Professeur référent"),
  t("etablissement.nom", "Nom du lycée", "Lycée"),
  t("aujourdhui", "Date du jour", "Lycée"),
  ...JOURS_HORAIRES.flatMap((j) => {
    const J = j[0].toUpperCase() + j.slice(1);
    return [t(`horaires.${j}`, `${J} : horaires de la journée`, "Horaires"), t(`horaires.${j}.matin`, `${J} : matin`, "Horaires"), t(`horaires.${j}.apresMidi`, `${J} : après-midi`, "Horaires")];
  }),
  ...SIGNATAIRES.flatMap((s) => [
    t(`signature.${s.cle}.nom`, `${s.libelle} : nom du signataire (sa signature se place juste au-dessus)`, "Signatures"),
    t(`signature.${s.cle}.date`, `${s.libelle} : date de la signature`, "Signatures"),
  ]),
];

/** Minuscules, sans accents ni ponctuation : « Date de début (période 1) » → « date de debut periode 1 ». */
export function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Mots équivalents dans les noms de classes : « 1ère » et « 1re », « Ter » et « Tle »… */
const SYNONYMES: Record<string, string> = { "1ere": "1re", premiere: "1re", "1er": "1re", seconde: "2nde", "2de": "2nde", "2nd": "2nde", terminale: "tle", term: "tle", ter: "tle", "2eme": "2e" };
const NIVEAUX = new Set(["cap", "2nde", "1re", "tle", "2e", "bts"]);
const MOTS_VIDES = new Set(["de", "la", "le", "les", "du", "des", "d", "l", "et", "en", "m", "me", "mme"]);

function mots(s: string): string[] {
  return normaliser(s).split(" ").filter((m) => m && !MOTS_VIDES.has(m)).map((m) => SYNONYMES[m] ?? m);
}

/**
 * L'option d'une liste déroulante qui correspond à une valeur : la plus proche par les mots en commun
 * (« 2nde MS » → « 2nde bac pro », « Paul MARTIN » → « M. Martin »). Aucune si rien ne correspond ou en cas d'égalité.
 */
export function choisirOption(valeur: string, options: string[]): string | null {
  if (!valeur.trim()) return null;
  const exacte = options.find((o) => normaliser(o) === normaliser(valeur));
  if (exacte) return exacte;
  const v = new Set(mots(valeur));
  // Une option qui cite un autre niveau que la valeur est écartée : « CAP 1ère année » ne convient pas à « 1re MS ».
  const autreNiveau = (o: string) => mots(o).some((m) => NIVEAUX.has(m) && !v.has(m));
  const scores = options.map((o) => ({ o, n: autreNiveau(o) ? 0 : [...new Set(mots(o))].filter((m) => v.has(m)).length }));
  const max = Math.max(0, ...scores.map((x) => x.n));
  const meilleures = scores.filter((x) => x.n === max);
  return max > 0 && meilleures.length === 1 ? meilleures[0].o : null;
}

/** Les sources possibles pour un champ, selon sa sorte : une case ne reçoit qu'une donnée « case ». */
export function sourcesPossibles(type: ChampPdf["type"]): SourceDonnee[] {
  return SOURCES_CONVENTION.filter((s) => (type === "case" ? s.sorte === "case" : s.sorte === "texte"));
}

/** Une source enregistrée est-elle valable pour ce champ ? */
export function sourceValable(source: string, type: ChampPdf["type"]): boolean {
  if (source === SOURCES_SPECIALES.vide || source === SOURCES_SPECIALES.famille || source === SOURCES_SPECIALES.entreprise) return true;
  if (source === SOURCES_SPECIALES.fixe) return type !== "case";
  if (source === SOURCES_SPECIALES.coche) return type === "case";
  return sourcesPossibles(type).some((s) => s.cle === source);
}

/**
 * La donnée proposée d'après le nom d'un champ, pour que le DDFPT n'ait plus qu'à vérifier. Les coordonnées de l'élève
 * que Cap PFMP ne connaît pas (téléphone, adresse) sont complétées par la famille en signant, celles de l'entreprise
 * (assureur, numéro de contrat, SIRET) par l'entreprise. Rien de proposé pour un nom générique (« Texte_13 »).
 */
export function suggererSource(nom: string, type: ChampPdf["type"]): string {
  const n = ` ${normaliser(nom)} `;
  // Mots entiers seulement : « fin » ne doit pas reconnaître « financière ».
  const a = (...m: string[]) => m.some((x) => n.includes(` ${x} `));
  if (type === "case") return a("mineur") ? "eleve.mineur" : a("majeur") ? "eleve.majeur" : "";
  if (type === "signature") return "";
  // Cadre de signature : « Nom signature élève », « Date signature tuteur »… La signature dessinée se place au-dessus du nom.
  if (a("signature", "signe", "signataire", "visa")) {
    const qui = a("tuteur", "maitre") ? "tuteur" : a("parent", "responsable", "legal", "representant legal") ? "parent"
      : a("eleve", "stagiaire", "candidat") ? "eleve" : a("professeur", "referent", "enseignant") ? "professeur"
      : a("chef", "direction", "directeur", "directrice", "proviseur", "etablissement") ? "direction" : a("entreprise", "organisme", "employeur", "representant") ? "entreprise" : null;
    if (qui) return `signature.${qui}.${a("date", "le") ? "date" : "nom"}`;
  }
  const tel = a("tel", "telephone", "portable", "mobile");
  const mail = a("mail", "courriel", "e mail", "email");
  const jour = JOURS_HORAIRES.find((j) => a(j));
  if (jour) return a("apres midi", "apresmidi") ? `horaires.${jour}.apresMidi` : a("matin") ? `horaires.${jour}.matin` : `horaires.${jour}`;
  if (a("assureur", "assurance", "contrat", "siret", "siren", "immatriculation", "naf", "ape")) return SOURCES_SPECIALES.entreprise;
  if (a("tuteur", "maitre")) return tel ? "tuteur.telephone" : mail ? "tuteur.email" : a("fonction", "qualite") ? "tuteur.fonction" : "tuteur.nom";
  if (a("referent", "professeur", "enseignant")) return tel ? "referent.telephone" : mail ? "referent.email" : "referent.nom";
  if (a("representant")) return a("fonction", "qualite") ? "entreprise.representantFonction" : "entreprise.representant";
  if (a("entreprise", "organisme", "employeur", "societe")) {
    return a("adresse", "siege") ? "entreprise.adresse" : tel ? "entreprise.telephone" : mail ? "entreprise.email" : a("domaine", "activite", "activites") ? "entreprise.domaine" : "entreprise.nom";
  }
  if (a("naissance")) return "eleve.dateNaissance";
  // Deuxième période sur la même convention : laissée vide, chaque période a sa convention dans Cap PFMP.
  if (a("periode 2", "2eme periode", "deuxieme periode")) return "";
  if (a("debut")) return "periode.debut";
  if (a("fin")) return "periode.fin";
  if (a("jours")) return "periode.jours";
  if (a("semaine", "semaines")) return "periode.semaines";
  if (a("heures")) return "periode.heuresHebdo";
  if (a("classe", "niveau")) return type === "liste" ? "classe.libelle" : a("filiere", "diplome") ? "classe.classeEtFiliere" : "classe.libelle";
  if (a("filiere", "diplome", "formation")) return type === "liste" ? "classe.libelle" : "classe.filiere";
  if (a("dominante", "option")) return "eleve.dominante";
  if (a("prenom") && a("nom")) return "eleve.nomPrenom";
  if (a("prenom")) return "eleve.prenom";
  if (a("nom", "stagiaire", "eleve", "candidat")) return "eleve.nomPrenom";
  if (mail) return "eleve.email";
  if (tel || a("adresse", "domicile", "famille")) return SOURCES_SPECIALES.famille;
  if (a("lycee", "etablissement")) return "etablissement.nom";
  return "";
}

/** Libellé lisible d'une source, pour l'affichage. */
export function libelleSource(source: string, fixe?: string): string {
  if (source === SOURCES_SPECIALES.vide) return "Laissé vide";
  if (source === SOURCES_SPECIALES.fixe) return `Texte fixe : ${fixe ?? ""}`;
  if (source === SOURCES_SPECIALES.coche) return "Toujours cochée";
  if (source === SOURCES_SPECIALES.famille) return "Complété par l'élève ou sa famille en signant";
  if (source === SOURCES_SPECIALES.entreprise) return "Complété par l'entreprise en signant";
  return SOURCES_CONVENTION.find((s) => s.cle === source)?.libelle ?? source;
}

/** Qui complète les champs « à compléter » en signant : la famille (élève, parent) ou l'entreprise (représentant, tuteur). */
export function completeParQualite(qualite: string): "famille" | "entreprise" | null {
  if (qualite === "eleve" || qualite === "parent") return "famille";
  if (qualite === "entreprise" || qualite === "tuteur") return "entreprise";
  return null;
}

/* ------------------------------------------------------------------ */
/* Ordre de mission et compte rendu de visite                           */
/* ------------------------------------------------------------------ */

/** Textes du modèle Cap PFMP de l'ordre de mission, que le lycée peut remplacer. */
export const TITRE_ORDRE_MISSION = "Compte rendu de visite et ordre de mission";
export const INTRO_ORDRE_MISSION = "Cet ordre de mission est signé avant la visite en entreprise. Après la visite, il est complété avec la signature ou le cachet de l'entreprise visitée.";

/** Questions de l'appel au tuteur la première semaine, tant que le lycée n'a pas les siennes. */
export const QUESTIONS_APPEL = [
  "L'élève est-il présent et ponctuel ?",
  "Son insertion est-elle bonne ?",
  "A-t-il fourni son livret de stage au tuteur ?",
  "Les tâches prévues dans le livret pourront-elles être réalisées ?",
];

/** Grille d'évaluation des attitudes professionnelles, tant que le lycée n'a pas la sienne (niveaux du plus faible au plus fort). */
export const GRILLE_ATTITUDES: { critere: string; niveaux: string[] }[] = [
  { critere: "Intérêt porté au travail", niveaux: ["Exécute sans intérêt", "Montre peu d'intérêt", "Montre un intérêt moyen", "Se passionne", "S'intéresse et se perfectionne"] },
  { critere: "Compréhension", niveaux: ["Comprend difficilement", "Comprend lentement", "Comprend moyennement", "Comprend bien", "Comprend remarquablement"] },
  { critere: "Esprit d'initiative", niveaux: ["Attend tout des autres", "Esprit d'initiative limité", "Esprit d'initiative moyen", "Esprit d'initiative supérieur", "Très porté à agir, à proposer"] },
  { critere: "Sens de l'organisation", niveaux: ["Mal organisé", "Peu d'ordre, de méthode", "Moyennement organisé", "Organisation supérieure", "Très organisé"] },
  { critere: "Niveau d'activité", niveaux: ["Aucune activité", "Activité faible, irrégulière", "Activité moyenne", "Bonne activité", "Très actif, rayonnant"] },
  { critere: "Habileté", niveaux: ["Maladroit", "Habileté inférieure à la moyenne", "Habileté moyenne", "Habileté supérieure", "Très habile"] },
  { critere: "Qualité du travail", niveaux: ["Sans qualité", "Niveau de qualité insuffisant", "Niveau de qualité passable", "Bon niveau de qualité", "Excellente qualité"] },
  { critere: "Sociabilité", niveaux: ["Indiscipliné", "Ne s'intègre pas", "S'intègre difficilement", "Accepte les règles du groupe", "Excellente intégration"] },
];

/** Niveaux d'un critère saisi sans niveaux. */
export const NIVEAUX_PAR_DEFAUT = ["Insuffisant", "À améliorer", "Satisfaisant", "Très satisfaisant"];

/**
 * La grille saisie par le lycée, une ligne par critère : « Critère : niveau 1 / niveau 2 / … » (du plus faible au plus fort).
 * Un critère sans niveaux reçoit les niveaux par défaut. Au plus 20 critères de 8 niveaux.
 */
export function lireGrille(texte: string): { critere: string; niveaux: string[] }[] {
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l) => {
    const i = l.indexOf(":");
    const critere = (i < 0 ? l : l.slice(0, i)).trim().slice(0, 120);
    const niveaux = i < 0 ? [] : l.slice(i + 1).split("/").map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 8);
    return { critere, niveaux: niveaux.length >= 2 ? niveaux : NIVEAUX_PAR_DEFAUT };
  }).filter((g) => g.critere);
}

/** La grille, pour la saisie : une ligne par critère. */
export function texteGrille(grille: { critere: string; niveaux: string[] }[]): string {
  return grille.map((g) => `${g.critere} : ${g.niveaux.join(" / ")}`).join("\n");
}

/** Les questions saisies par le lycée, une par ligne (au plus 10). */
export function lireQuestions(texte: string): string[] {
  return texte.split("\n").map((l) => l.trim().slice(0, 200)).filter(Boolean).slice(0, 10);
}
