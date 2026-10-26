import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { voitToutLEtablissement } from "@/lib/acces";
import { absencesRecentes, lieuxDesPeriodes, situationDuJour } from "@/lib/vie-scolaire";
import { rattrapagesAVenir } from "@/lib/requetes";
import { ajouterJours, aujourdhui, dateCourte, dateLongue, ecartJours, jourSemaine, JOURS } from "@/lib/dates";
import { ORIGINES_ABSENCE } from "@/lib/constantes-absences";
import { Pill } from "@/components/ui";
import { EtatPeriode } from "@/components/rattrapages";
import { texteAbsence } from "@/components/absences";

export const metadata = { title: "Vie scolaire" };

export default async function VieScolaire({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const ctx = await contexte();
  if (!voitToutLEtablissement(ctx)) redirect("/");
  const sp = await searchParams;
  const auj = aujourdhui();
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(sp.jour ?? "") ? sp.jour! : auj;
  const lignes = await situationDuJour(ctx, jour);
  const enStage = lignes.filter((l) => l.stage);
  const sansLieu = lignes.filter((l) => !l.stage);
  const rattrapages = await rattrapagesAVenir(ctx, jour);
  const lieux = await lieuxDesPeriodes(rattrapages.map((r) => r.p.id));
  const absences = await absencesRecentes(ctx, jour);
  const nonJustifiees = absences.filter((x) => !x.a.justifieeLe).length;
  const classes = [...new Map(enStage.map((l) => [l.classe.id, l.classe])).values()].sort((x, y) => x.libelle.localeCompare(y.libelle));
  const nomJour = `${JOURS[jourSemaine(jour)].toLowerCase()} ${dateLongue(jour)}`;
  const fiche = (id: string) => `/vie-scolaire/eleves/${id}`;
  return (
    <>
      <div>
        <h1>Vie scolaire</h1>
        <p className="sub">Les élèves en stage, les rattrapages hors des périodes prévues et les absences en entreprise. Vous êtes prévenu(e) par mail à chaque rattrapage et à chaque absence signalée.</p>
      </div>
      <form className="actions" action="/vie-scolaire">
        <Link className="btn small" href={`/vie-scolaire?jour=${ajouterJours(jour, -1)}`} aria-label="Jour précédent">←</Link>
        <label className="f" htmlFor="vs-jour" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Jour<input id="vs-jour" name="jour" type="date" defaultValue={jour} style={{ width: "auto" }} /></label>
        <button className="btn small">Afficher</button>
        <Link className="btn small" href={`/vie-scolaire?jour=${ajouterJours(jour, 1)}`} aria-label="Jour suivant">→</Link>
        {jour !== auj && <Link className="btn small" href="/vie-scolaire">Aujourd&apos;hui</Link>}
      </form>
      <div className="kpis">
        <div className="kpi"><b>{enStage.length}</b><span>en stage le {dateCourte(jour)}</span></div>
        <div className="kpi warn"><b>{enStage.filter((l) => l.rattrapage).length}</b><span>dont en rattrapage</span></div>
        <div className="kpi bad"><b>{enStage.filter((l) => l.absence).length}</b><span>absent(s) en stage ce jour</span></div>
        <div className="kpi bad"><b>{nonJustifiees}</b><span>absence(s) non justifiée(s)</span></div>
      </div>

      <div className="section">
        <h2>Rattrapages en cours et à venir ({rattrapages.length})</h2>
        <p className="sub" style={{ margin: 0 }}>Des élèves en stage en dehors des périodes prévues pour leur classe : ils ne sont pas au lycée pendant ces dates.</p>
        <div className="panel rows">
          {rattrapages.length === 0 && <div className="empty">Aucun rattrapage prévu.</div>}
          {rattrapages.map(({ p, e, c }) => {
            const lieu = lieux.find((l) => l.s.periodeId === p.id)?.ent;
            const nouveau = ecartJours(p.creeLe.toISOString().slice(0, 10), auj) <= 7;
            return (
              <Link key={p.id} href={fiche(e.id)} className="row">
                <div className="main">
                  <div className="name">{e.prenom} {e.nom} <span className="cls">{c.libelle}</span> {nouveau && <Pill ton="info">Nouveau</Pill>}</div>
                  <div className="meta">Du {dateLongue(p.debut)} au {dateLongue(p.fin)} · {lieu ? `${lieu.nom}${lieu.ville ? `, ${lieu.ville}` : ""}` : "lieu de stage à venir"}{p.motif ? ` · ${p.motif}` : ""}</div>
                </div>
                <EtatPeriode p={p} jour={jour} />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>En stage le {nomJour} ({enStage.length})</h2>
        {enStage.length === 0 && <div className="panel"><div className="empty">Aucun élève en stage ce jour-là.</div></div>}
        {classes.map((c) => (
          <div key={c.id} className="section">
            <h3>{c.libelle}</h3>
            <div className="panel rows">
              {enStage.filter((l) => l.classe.id === c.id).map((l) => (
                <Link key={l.eleve.id} href={fiche(l.eleve.id)} className="row">
                  <div className="main">
                    <div className="name">{l.eleve.prenom} {l.eleve.nom} {l.rattrapage && <Pill ton="warn">Rattrapage</Pill>}</div>
                    <div className="meta">
                      {l.entreprise!.nom}{l.entreprise!.ville ? `, ${l.entreprise!.ville}` : ""}
                      {" · "}{l.horairesDuJour ? `${l.horairesDuJour[0]} – ${l.horairesDuJour[1]}` : "repos ce jour"}
                      {l.entreprise!.tuteurNom && ` · tuteur ${l.entreprise!.tuteurNom}`}{l.entreprise!.telephone && ` · ${l.entreprise!.telephone}`}
                    </div>
                  </div>
                  {l.absence && <Pill ton="bad">{l.absence.justifieeLe ? "Absent (justifié)" : "Absent, non justifié"}</Pill>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sansLieu.length > 0 && (
        <div className="section">
          <h2>En période de stage, sans lieu de stage ({sansLieu.length})</h2>
          <p className="sub" style={{ margin: 0 }}>Leur classe est en PFMP mais aucune entreprise n&apos;est enregistrée : ils sont attendus au lycée.</p>
          <div className="panel rows">
            {sansLieu.map((l) => (
              <Link key={l.eleve.id} href={fiche(l.eleve.id)} className="row">
                <div className="main">
                  <div className="name">{l.eleve.prenom} {l.eleve.nom} <span className="cls">{l.classe.libelle}</span></div>
                  <div className="meta">{l.periode.libelle} · du {dateCourte(l.periode.debut)} au {dateCourte(l.periode.fin)}</div>
                </div>
                <Pill ton="warn">Attendu au lycée</Pill>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h2>Absences en stage</h2>
        <p className="sub" style={{ margin: 0 }}>Les absences des 30 derniers jours, et toutes celles qui ne sont pas encore justifiées.</p>
        <div className="panel rows">
          {absences.length === 0 && <div className="empty">Aucune absence signalée.</div>}
          {absences.map(({ a, e, c, ent }) => (
            <Link key={a.id} href={fiche(e.id)} className="row">
              <div className="main">
                <div className="name">{e.prenom} {e.nom} <span className="cls">{c.libelle}</span></div>
                <div className="meta">Absence {texteAbsence(a)} · {ent.nom} · signalée par {ORIGINES_ABSENCE[a.origine]}{a.justifieeLe ? ` · motif : ${a.motif}` : ""}</div>
              </div>
              {a.justifieeLe ? <Pill ton="ok">Justifiée</Pill> : <Pill ton="bad">Non justifiée</Pill>}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
