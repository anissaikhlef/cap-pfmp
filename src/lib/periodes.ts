/** Période « de référence » d'une classe ou d'un élève (fonctions pures, testées). */
import { aujourdhui, ecartJours } from "./dates";

type PeriodeMin = { debut: string; fin: string; eleveId?: string | null };

/** Un rattrapage est une période propre à un seul élève, hors des périodes de sa classe. */
export function estRattrapage(p: PeriodeMin | null | undefined): boolean {
  return !!p?.eleveId;
}

/** La période « en cours » d'une classe : celle qui se déroule, sinon la prochaine, sinon la dernière passée. */
export function periodeDeReference<T extends PeriodeMin>(periodes: T[], jour = aujourdhui()): T | null {
  if (!periodes.length) return null;
  const tri = [...periodes].sort((x, y) => x.debut.localeCompare(y.debut));
  const enCours = tri.find((p) => p.debut <= jour && jour <= p.fin);
  if (enCours) return enCours;
  // Une période terminée depuis moins de 30 jours reste la référence (documents à récupérer).
  const recente = [...tri].reverse().find((p) => p.fin < jour && ecartJours(p.fin, jour) <= 30);
  if (recente) return recente;
  return tri.find((p) => p.debut > jour) ?? tri.at(-1) ?? null;
}

/**
 * La période de référence d'un élève, parmi celles de sa classe et ses rattrapages.
 * Un rattrapage en cours passe avant tout ; un rattrapage à venir passe avant une période de classe déjà terminée.
 */
export function periodeDeReferenceEleve<T extends PeriodeMin>(periodes: T[], jour = aujourdhui()): T | null {
  const tri = [...periodes].sort((x, y) => x.debut.localeCompare(y.debut));
  const enCours = tri.filter((p) => p.debut <= jour && jour <= p.fin);
  if (enCours.length) return enCours.find(estRattrapage) ?? enCours[0];
  if (tri.some((p) => estRattrapage(p) && p.debut > jour)) return tri.find((p) => p.debut > jour) ?? null;
  return periodeDeReference(tri, jour);
}

/**
 * Une période concerne un élève quand elle est celle de toute sa classe, celle de sa spécialité (décision d'Anissa : dans
 * une même classe, une spécialité peut partir à d'autres dates), ou son propre rattrapage.
 */
export function concerneLEleve(p: { eleveId?: string | null; dominanteId?: string | null }, e: { id: string; dominanteId: string | null }): boolean {
  if (p.eleveId) return p.eleveId === e.id;
  return !p.dominanteId || p.dominanteId === e.dominanteId;
}

/**
 * Le rang de chaque période de classe dans l'année, pour le groupe qu'elle concerne (toute la classe, ou une spécialité avec
 * les périodes de toute la classe) : 0 pour la première ; `nombre` périodes en tout pour ce groupe.
 */
export function rangsDesPeriodes<T extends { id: string; debut: string; eleveId?: string | null; dominanteId?: string | null }>(periodes: T[]): Map<string, { rang: number; nombre: number }> {
  const deClasse = periodes.filter((p) => !p.eleveId).sort((x, y) => x.debut.localeCompare(y.debut));
  const res = new Map<string, { rang: number; nombre: number }>();
  for (const p of deClasse) {
    const groupe = deClasse.filter((q) => !q.dominanteId || !p.dominanteId || q.dominanteId === p.dominanteId);
    res.set(p.id, { rang: groupe.indexOf(p), nombre: groupe.length });
  }
  return res;
}
