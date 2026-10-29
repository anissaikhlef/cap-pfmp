import type { Horaires, Tuteur } from "@/db/schema";
import { JOURS } from "@/lib/dates";
import { heuresHebdo, heuresProposees, fmtHeures, plagesDuJour, texteJour, type ResultatRegle } from "@/lib/regles";
import type { Reglages } from "@/db/schema";

/**
 * Horaires de la semaine : matin et après-midi pour chaque jour (une seule plage suffit), ou repos. Selon le réglage du
 * lycée, chaque heure se choisit dans une liste de demi-heures, ou se tape à la minute près. Une heure déjà saisie qui
 * n'est pas une demi-heure (ex. 8 h 15) reste proposée telle quelle.
 */
export function ChampsHoraires({ h, saisie }: { h?: Horaires | null; saisie: Reglages["horaires"] }) {
  const liste = heuresProposees(saisie.debut, saisie.fin);
  const heure = (name: string, valeur: string | undefined, label: string) => saisie.saisie === "libre" ? (
    <input className="inp" type="time" name={name} defaultValue={valeur ?? ""} aria-label={label} style={{ minWidth: 92 }} />
  ) : (
    <select className="inp" name={name} defaultValue={valeur ?? ""} aria-label={label} style={{ minWidth: 92 }}>
      <option value="">—</option>
      {valeur && !liste.includes(valeur) && <option value={valeur}>{valeur.replace(":", " h ")}</option>}
      {liste.map((x) => <option key={x} value={x}>{x.replace(":", " h ")}</option>)}
    </select>
  );
  return (
    <div className="panel tbl">
      <table>
        <thead><tr><th>Jour</th><th>Matin (ou journée)</th><th>Après-midi</th><th>Repos</th></tr></thead>
        <tbody>
          {JOURS.map((j, i) => {
            const [p1, p2] = h ? plagesDuJour(h, i) : [];
            return (
              <tr key={j}>
                <td>{j}</td>
                <td><div className="actions" style={{ flexWrap: "nowrap", gap: 4 }}>{heure(`debut_${i}`, p1?.[0], `${j}, début du matin`)}{heure(`fin_${i}`, p1?.[1], `${j}, fin du matin`)}</div></td>
                <td><div className="actions" style={{ flexWrap: "nowrap", gap: 4 }}>{heure(`debut2_${i}`, p2?.[0], `${j}, début de l'après-midi`)}{heure(`fin2_${i}`, p2?.[1], `${j}, fin de l'après-midi`)}</div></td>
                <td><input type="checkbox" name={`repos_${i}`} defaultChecked={h ? !p1 : i >= 5} aria-label={`${j}, repos`} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} /></td>
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
            <tr key={j}><td>{j}</td><td className="num">{texteJour(h, i) ?? <span className="sub">repos</span>}</td></tr>
          ))}
          <tr><td><b>Total</b></td><td className="num"><b>{fmtHeures(heuresHebdo(h))} par semaine</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Tuteur de stage désigné pour ce stage (par défaut, celui de la fiche entreprise). */
export function ChampsTuteur({ t, parDefaut }: { t?: Tuteur | null; parDefaut?: { nom: string | null; fonction: string | null; telephone: string | null } | null }) {
  const v = t ?? (parDefaut?.nom ? { nom: parDefaut.nom, fonction: parDefaut.fonction, email: null, telephone: parDefaut.telephone } : null);
  return (
    <fieldset className="section" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sub" style={{ marginBottom: 6 }}>Tuteur de stage (il signe la convention s&apos;il est désigné)</legend>
      <label className="check"><input type="checkbox" name="tuteurDesigne" defaultChecked={t !== null} /> Un tuteur est désigné pour ce stage</label>
      <div className="grid2">
        <label className="f" htmlFor="t-nom">Nom du tuteur<input id="t-nom" name="tuteurNom" defaultValue={v?.nom ?? ""} placeholder="Repris de la fiche entreprise si vide" /></label>
        <label className="f" htmlFor="t-fonction">Fonction<input id="t-fonction" name="tuteurFonction" defaultValue={v?.fonction ?? ""} /></label>
        <label className="f" htmlFor="t-email">E-mail du tuteur<input id="t-email" name="tuteurEmail" type="email" defaultValue={v?.email ?? ""} /></label>
        <label className="f" htmlFor="t-tel">Mobile du tuteur<input id="t-tel" name="tuteurTelephone" defaultValue={v?.telephone ?? ""} /></label>
      </div>
    </fieldset>
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
