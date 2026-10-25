"use client";
import { useActionState } from "react";
import { importerEleves, type RapportImport } from "../actions";

export function Import() {
  const [r, agir, enCours] = useActionState<RapportImport, FormData>(importerEleves, null);
  return (
    <form action={agir} className="stack">
      <label className="f" htmlFor="fichier">Fichier CSV<input id="fichier" name="fichier" type="file" accept=".csv,text/csv" required /></label>
      <div className="actions"><button className="btn primary" disabled={enCours}>{enCours ? "Import en cours…" : "Importer"}</button></div>
      {r?.erreur && <p className="msg err" role="alert">{r.erreur}</p>}
      {r?.ok && <p className="msg ok" role="status">{r.ok}</p>}
      {r?.lignes && r.lignes.length > 0 && (
        <div className="panel tbl">
          <table>
            <thead><tr><th>Ligne</th><th>Élève</th><th>Résultat</th></tr></thead>
            <tbody>{r.lignes.map((l) => (
              <tr key={l.n}><td className="num">{l.n}</td><td>{l.nom}</td><td style={{ color: l.ok ? "var(--ok)" : "var(--warn)" }}>{l.resultat}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </form>
  );
}
