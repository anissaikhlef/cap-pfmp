import { aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import { placeSurLaFrise, semainesDeStage } from "@/lib/regles";
import { Pill } from "./ui";

type Classe = { id: string; libelle: string; filiere: string | null };
type Periode = { id: string; libelle: string; debut: string; fin: string };
export type LigneCalendrier = { classe: Classe; periodes: Periode[] };

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function finDuMois(iso: string) {
  const [an, mois] = iso.split("-").map(Number);
  return new Date(Date.UTC(an, mois, 0)).toISOString().slice(0, 10);
}

/** La frise couvre l'année scolaire, de septembre à juin, élargie aux périodes qui en sortent. */
function etendue(lignes: LigneCalendrier[], anneeScolaire: string) {
  const a0 = Number(anneeScolaire.slice(0, 4));
  let debut = `${a0}-09-01`, fin = `${a0 + 1}-06-30`;
  for (const p of lignes.flatMap((l) => l.periodes)) {
    if (p.debut < debut) debut = `${p.debut.slice(0, 7)}-01`;
    if (p.fin > fin) fin = finDuMois(p.fin);
  }
  return { debut, fin };
}

function moisDeLaFrise(e: { debut: string; fin: string }) {
  const res: { cle: string; libelle: string; gauche: number; largeur: number }[] = [];
  for (let d = e.debut; d <= e.fin; ) {
    const fin = finDuMois(d);
    res.push({ cle: d.slice(0, 7), libelle: MOIS[Number(d.slice(5, 7)) - 1], ...placeSurLaFrise({ debut: d, fin }, e) });
    const [an, mois] = d.split("-").map(Number);
    d = mois === 12 ? `${an + 1}-01-01` : `${an}-${String(mois + 1).padStart(2, "0")}-01`;
  }
  return res;
}

/** Frise de l'année : une ligne par classe, une barre par période de PFMP, et un trait pour aujourd'hui. */
export function FrisePFMP({ lignes, anneeScolaire }: { lignes: LigneCalendrier[]; anneeScolaire: string }) {
  const e = etendue(lignes, anneeScolaire);
  const mois = moisDeLaFrise(e);
  const jour = aujourdhui();
  const auj = jour >= e.debut && jour <= e.fin ? placeSurLaFrise({ debut: jour, fin: jour }, e).gauche : null;
  return (
    <div className="tbl">
      <div className="frise" role="img" aria-label={`Frise des périodes de PFMP, année ${anneeScolaire} ; le détail est dans la liste ci-dessous.`}>
        <div className="frise-ligne frise-mois">
          <span className="frise-classe" />
          <div className="frise-piste">{mois.map((m) => <span key={m.cle} style={{ left: `${m.gauche}%`, width: `${m.largeur}%` }}>{m.libelle}</span>)}</div>
        </div>
        {lignes.map((l) => (
          <div key={l.classe.id} className="frise-ligne">
            <span className="frise-classe">{l.classe.libelle}</span>
            <div className="frise-piste">
              {mois.slice(1).map((m) => <i key={m.cle} className="frise-sep" style={{ left: `${m.gauche}%` }} />)}
              {l.periodes.map((p) => {
                const x = placeSurLaFrise(p, e);
                return <span key={p.id} className="frise-barre" style={{ left: `${x.gauche}%`, width: `${x.largeur}%` }} title={`${l.classe.libelle} · ${p.libelle} : du ${dateCourte(p.debut)} au ${dateCourte(p.fin)}`} />;
              })}
              {auj !== null && <i className="frise-auj" style={{ left: `${auj}%` }} title="Aujourd'hui" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EtatDeLaPeriode({ debut, fin }: { debut: string; fin: string }) {
  const jour = aujourdhui();
  if (jour < debut) return <Pill ton="info">À venir</Pill>;
  if (jour <= fin) return <Pill ton="ok">En cours</Pill>;
  return <Pill ton="muted">Terminée</Pill>;
}

/** Toutes les périodes, dans l'ordre des dates. */
export function ListePeriodes({ lignes }: { lignes: LigneCalendrier[] }) {
  const toutes = lignes.flatMap((l) => l.periodes.map((p) => ({ ...p, classe: l.classe })))
    .sort((x, y) => x.debut.localeCompare(y.debut) || x.classe.libelle.localeCompare(y.classe.libelle));
  return (
    <div className="panel rows">
      {toutes.length === 0 && <div className="empty">Aucune période de PFMP n&apos;est encore fixée.</div>}
      {toutes.map((p) => {
        const n = semainesDeStage(p.debut, p.fin);
        return (
          <div key={p.id} className="row">
            <div className="main" style={{ minWidth: 220 }}>
              <div className="name">{p.classe.libelle} · {p.libelle}</div>
              <div className="meta">du {dateLongue(p.debut)} au {dateLongue(p.fin)} · {n} semaine{n > 1 ? "s" : ""}{p.classe.filiere ? ` · ${p.classe.filiere}` : ""}</div>
            </div>
            <EtatDeLaPeriode debut={p.debut} fin={p.fin} />
          </div>
        );
      })}
    </div>
  );
}
