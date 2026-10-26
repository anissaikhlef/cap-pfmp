export const MOTIFS_ABSENCE = [
  "Maladie",
  "Rendez-vous médical",
  "Événement familial",
  "Convocation officielle (examen, administration, justice)",
  "Problème de transport",
  "Autre",
] as const;

export const ORIGINES_ABSENCE: Record<"entreprise" | "famille" | "lycee", string> = {
  entreprise: "le tuteur",
  famille: "la famille",
  lycee: "le lycée",
};
