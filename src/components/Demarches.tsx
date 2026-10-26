import { aujourdhui, dateCourte, ecartJours } from "@/lib/dates";
import { Formulaire } from "./Formulaire";
import { ajouterDemarche, majDemarche, supprimerDemarche } from "@/app/(app)/eleves/stage-actions";

type Demarche = { id: string; entrepriseNom: string; date: string; reponse: "attente" | "refus" | "entretien" | "accord" };
const REPONSES: [Demarche["reponse"], string][] = [["attente", "Pas de réponse"], ["refus", "Refus"], ["entretien", "Entretien prévu"], ["accord", "Accord"]];

export function Demarches({ eleveId, demarches, entreprises = [] }: { eleveId: string; demarches: Demarche[]; entreprises?: { id: string; nom: string }[] }) {
  const jour = aujourdhui();
  return (
    <div className="section">
      <div className="panel rows">
        {demarches.length === 0 && <div className="empty">Aucune entreprise contactée pour l&apos;instant.</div>}
        {demarches.map((d) => {
          const relancer = d.reponse === "attente" && ecartJours(d.date, jour) >= 7;
          return (
            <div key={d.id} className="row">
              <div className="main">
                <div className="name">{d.entrepriseNom}</div>
                <div className="meta">Contactée le {dateCourte(d.date)}{relancer && <b style={{ color: "var(--warn)" }}> · sans réponse depuis {ecartJours(d.date, jour)} jours : à relancer</b>}</div>
              </div>
              <form action={majDemarche} className="actions">
                <input type="hidden" name="id" value={d.id} />
                <select className="inp" name="reponse" defaultValue={d.reponse} aria-label={`Réponse de ${d.entrepriseNom}`} style={{ width: "auto" }}>
                  {REPONSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn small">Mettre à jour</button>
              </form>
              <form action={supprimerDemarche}><input type="hidden" name="id" value={d.id} /><button className="btn small danger" aria-label={`Supprimer la démarche ${d.entrepriseNom}`}>×</button></form>
            </div>
          );
        })}
      </div>
      <Formulaire action={ajouterDemarche} className="actions" bouton="Ajouter" boutonClasse="btn">
        <input type="hidden" name="eleveId" value={eleveId} />
        <label className="f" htmlFor="d-ent" style={{ flex: 2, minWidth: 180 }}>Entreprise contactée
          <input id="d-ent" name="entrepriseNom" list="d-ents" required placeholder="Nom de l'entreprise" />
          <datalist id="d-ents">{entreprises.map((e) => <option key={e.id} value={e.nom} />)}</datalist>
        </label>
        <label className="f" htmlFor="d-date">Date<input id="d-date" name="date" type="date" defaultValue={jour} max={jour} required /></label>
        <label className="f" htmlFor="d-rep">Réponse
          <select id="d-rep" name="reponse" defaultValue="attente">{REPONSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </Formulaire>
    </div>
  );
}
