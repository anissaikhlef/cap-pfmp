/** Dates manipulées en chaînes ISO « AAAA-MM-JJ », en heure de Paris, pour éviter les décalages de fuseau. */

export function aujourdhui(): string {
  const override = process.env.CAP_PFMP_DATE_DU_JOUR; // utile pour les démonstrations et les tests
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export function versJour(iso: string): number {
  return Math.round(Date.parse(iso + "T12:00:00Z") / 86_400_000);
}

export function depuisJour(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function ajouterJours(iso: string, n: number): string {
  return depuisJour(versJour(iso) + n);
}

export function ecartJours(de: string, a: string): number {
  return versJour(a) - versJour(de);
}

/** 0 = lundi … 6 = dimanche */
export function jourSemaine(iso: string): number {
  return (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, j] = iso.slice(0, 10).split("-").map(Number);
  return `${j} ${MOIS.at(m - 1)}`;
}

export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return `${j} ${MOIS_LONGS.at(m - 1)} ${a}`;
}

export function anneeScolaireDe(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return m >= 8 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}

export function ageAu(dateNaissance: string | null | undefined, iso: string): number | null {
  if (!dateNaissance) return null;
  const [an, mn, jn] = dateNaissance.split("-").map(Number);
  const [a, m, j] = iso.split("-").map(Number);
  let age = a - an;
  if (m < mn || (m === mn && j < jn)) age--;
  return age;
}
