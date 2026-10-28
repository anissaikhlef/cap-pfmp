/**
 * Les listes exportables (décision d'Anissa : « une liste avec tous les élèves de la classe avec les RIB, une liste avec les
 * lieux de stage, durée et date par année… », en Excel et en PDF). Le DDFPT et la direction exportent tout ; le professeur,
 * les listes de ses propres classes, sauf celle des RIB. Fonctions pures.
 */
export const LISTES = {
  rib: { titre: "RIB et pièces d'identité", description: "Chaque élève, avec l'état de son RIB et de sa pièce d'identité (allocation de stage).", gestionSeulement: true },
  lieux: { titre: "Lieux de stage", description: "Élève, spécialité, entreprise, adresse, tuteur, dates et durée de chaque stage de l'année.", gestionSeulement: false },
  "sans-stage": { titre: "Élèves sans stage", description: "Les élèves sans lieu de stage pour leur prochaine période, et les entreprises déjà contactées.", gestionSeulement: false },
  conventions: { titre: "Conventions", description: "Pour chaque stage, qui a signé la convention et qui doit encore signer.", gestionSeulement: false },
  "fin-de-stage": { titre: "Attestations et livrets", description: "Pour chaque stage, l'attestation et le livret de compétences reçus ou attendus.", gestionSeulement: false },
  absences: { titre: "Absences en stage", description: "Les absences signalées pendant les stages, justifiées ou non.", gestionSeulement: false },
  visites: { titre: "Visites de stage", description: "Professeur, élève, entreprise, date, sur place ou à distance, ordre de mission et compte rendu.", gestionSeulement: false },
  entreprises: { titre: "Entreprises partenaires", description: "Contact, tuteur, places et élèves accueillis dans l'année.", gestionSeulement: false },
  bilan: { titre: "Bilan de l'année par classe", description: "Élèves, stages trouvés, conventions complètes, jours effectués, attestations reçues.", gestionSeulement: false },
} as const;
export type Liste = keyof typeof LISTES;
export const NOMS_LISTES = Object.keys(LISTES) as Liste[];

/** La personne peut-elle exporter cette liste : la gestion des PFMP (DDFPT, direction) toutes, le professeur toutes sauf les RIB. */
export function listePermise(liste: Liste, qui: { gestion: boolean; professeur: boolean }): boolean {
  if (qui.gestion) return true;
  return qui.professeur && !LISTES[liste].gestionSeulement;
}

/** Durée d'un stage : nombre de semaines (entamées) entre deux dates « AAAA-MM-JJ ». */
export function semainesEntre(debut: string, fin: string): number {
  const jours = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.max(1, Math.ceil(jours / 7));
}

/** Nom de fichier sans accents ni espaces : « lieux-de-stage-tle-ms-2026-2027 ». */
export function nomDeFichier(...parties: string[]): string {
  return parties.join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
