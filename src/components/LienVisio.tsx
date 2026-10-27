/** Pour une visite à distance : le lien de visio, ou le numéro de téléphone, cliquable (adresse web ou appel). */
export function LienVisio({ valeur }: { valeur: string }) {
  if (/^https?:\/\/\S+$/.test(valeur)) return <a href={valeur} target="_blank" rel="noopener noreferrer">{valeur}</a>;
  if (/^\+?[\d\s.()-]{8,}$/.test(valeur)) return <a href={`tel:${valeur.replace(/[^\d+]/g, "")}`}>{valeur}</a>;
  return <>{valeur}</>;
}
