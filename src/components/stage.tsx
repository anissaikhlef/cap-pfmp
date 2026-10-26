import type { Horaires } from "@/db/schema";
import { JOURS } from "@/lib/dates";
import { heuresHebdo, fmtHeures, type ResultatRegle } from "@/lib/regles";

export function ChampsHoraires({ h }: { h?: Horaires | null }) {
  return (
    <div className="panel tbl">
      <table>
        <thead><tr><th>Jour</th><th>Début</th><th>Fin</th><th>Repos</th></tr></thead>
        <tbody>
          {JOURS.map((j, i) => {
            const p = h?.[i] ?? null;
            return (
              <tr key={j}>
                <td>{j}</td>
                <td><input className="inp" type="time" name={`debut_${i}`} defaultValue={p?.[0] ?? ""} aria-label={`${j}, début`} /></td>
                <td><input className="inp" type="time" name={`fin_${i}`} defaultValue={p?.[1] ?? ""} aria-label={`${j}, fin`} /></td>
                <td><input type="checkbox" name={`repos_${i}`} defaultChecked={h ? !p : i >= 5} aria-label={`${j}, repos`} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TableHoraires({ h }: { h: Horaires }) {
  return (
    <div className="tbl">
      <table>
        <tbody>
          {JOURS.map((j, i) => (
            <tr key={j}><td>{j}</td><td className="num">{h[i] ? `${h[i]![0]} – ${h[i]![1]}` : <span className="sub">repos</span>}</td></tr>
          ))}
          <tr><td><b>Total</b></td><td className="num"><b>{fmtHeures(heuresHebdo(h))} par semaine</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function ListeRegles({ regles }: { regles: ResultatRegle[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {regles.map((r) => (
        <li key={r.code} style={{ display: "flex", gap: 8 }}>
          <b className="num" style={{ color: r.ok ? "var(--ok)" : "var(--bad)", width: 16 }} aria-hidden="true">{r.ok ? "✓" : "✕"}</b>
          <span><span className="vh">{r.ok ? "Respecté : " : "Non respecté : "}</span>{r.libelle}</span>
        </li>
      ))}
    </ul>
  );
}
