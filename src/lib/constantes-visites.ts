export const NIVEAUX = ["Très satisfaisant", "Satisfaisant", "À améliorer", "Insuffisant"] as const;
export const CRITERES: [string, string][] = [
  ["assiduite", "Assiduité et ponctualité"],
  ["tenue", "Tenue et présentation"],
  ["comportement", "Comportement et intégration dans l'équipe"],
  ["activites", "Activités conformes au référentiel"],
  ["accueil", "Accueil et encadrement par l'entreprise"],
];
export const SUITES: [string, string][] = [
  ["aucune", "Aucune"], ["point_eleve", "Point avec l'élève au retour"], ["famille", "Contact avec la famille"], ["alerte", "Alerter le référent et la direction"],
];
