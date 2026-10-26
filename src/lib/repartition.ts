/**
 * Répartition automatique des visites (fonction pure, testée).
 * Priorités : 1) même visiteur pour les élèves d'une même entreprise sur une même période,
 * 2) le professeur référent de l'élève s'il fait partie des visiteurs et n'est pas surchargé,
 * 3) sinon le visiteur le moins chargé.
 */
import { ajouterJours, jourSemaine, versJour, depuisJour } from "./dates";

export type AVisiter = { stageId: string; entrepriseId: string; periodeId: string; referentId: string | null; visiteurId: string | null };

export function repartir(liste: AVisiter[], visiteurs: string[], tolerance = 1): Map<string, string> {
  const res = new Map<string, string>();
  if (!visiteurs.length) return res;
  const charge = new Map(visiteurs.map((v) => [v, 0]));
  for (const x of liste) if (x.visiteurId && charge.has(x.visiteurId)) charge.set(x.visiteurId, charge.get(x.visiteurId)! + 1);
  const groupe = (x: AVisiter) => `${x.entrepriseId}|${x.periodeId}`;
  const parGroupe = new Map<string, string>();
  for (const x of liste) if (x.visiteurId) parGroupe.set(groupe(x), x.visiteurId);
  const aFaire = liste.filter((x) => !x.visiteurId).sort((a, b) => groupe(a).localeCompare(groupe(b)));
  for (const x of aFaire) {
    let v = parGroupe.get(groupe(x));
    if (!v || !charge.has(v)) {
      const min = Math.min(...charge.values());
      if (x.referentId && charge.has(x.referentId) && charge.get(x.referentId)! <= min + tolerance) v = x.referentId;
      else v = [...charge.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
    }
    res.set(x.stageId, v);
    charge.set(v, charge.get(v)! + 1);
    parGroupe.set(groupe(x), v);
  }
  return res;
}

/** Date proposée : le milieu de la période, un jour de semaine, jamais dans le passé. */
export function dateProposee(debut: string, fin: string, jour: string): string {
  let d = depuisJour(Math.floor((versJour(debut) + versJour(fin)) / 2));
  if (d < jour) d = ajouterJours(jour, 2);
  while (jourSemaine(d) >= 5) d = ajouterJours(d, 1);
  return d;
}
