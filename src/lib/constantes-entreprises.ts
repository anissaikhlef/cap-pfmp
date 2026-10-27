import type { CategorieSouci } from "@/db/schema";

/** Les sortes de soucis qu'un professeur ou la gestion peut signaler avec une entreprise. */
export const CATEGORIES_SOUCI: [CategorieSouci, string][] = [
  ["horaires", "Horaires ou temps de travail non respectés"],
  ["securite", "Sécurité de l'élève"],
  ["comportement", "Comportement envers l'élève"],
  ["taches", "Tâches sans rapport avec la formation"],
  ["documents", "Documents jamais rendus"],
  ["autre", "Autre"],
];
