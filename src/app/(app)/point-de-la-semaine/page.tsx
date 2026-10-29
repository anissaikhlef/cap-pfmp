import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { gereToutLEtablissement } from "@/lib/acces";
import { adresseDuSite } from "@/lib/liens";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { pointDeLaSemaine, rappelPrepare, type Retard } from "@/lib/point";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete } from "@/components/ui";
import { envoyerRappelsEquipe } from "./actions";

export const metadata = { title: "Point de la semaine" };

const TYPES: Record<Retard["type"], string> = { visite: "Visite non prise", compte_rendu: "Compte rendu en retard", ordre_mission: "Ordre de mission" };

/** Le point de la semaine du DDFPT (décision d'Anissa) : la page, dont le lien part par mail chaque lundi. */
export default async function Point() {
  const ctx = await contexte();
  if (!gereToutLEtablissement(ctx)) redirect("/");
  const p = await pointDeLaSemaine(ctx.etab);
  const base = await adresseDuSite();
  const parProf = new Map<string, { prof: Retard["profs"][number]; retards: Retard[] }>();
  for (const r of p.retards) for (const prof of r.profs) {
    const x = parProf.get(prof.id) ?? { prof, retards: [] };
    x.retards.push(r);
    parProf.set(prof.id, x);
  }
  const fiche = (id: string, texte: string) => <Link href={`/eleves/${id}`}>{texte}</Link>;
  return (
    <>
      <Entete titre="Point de la semaine" sous={`Préparé par Cap Admin au ${dateLongue(aujourdhui())} : ce qui est en retard, à suivre ou à décider. Le lien de cette page vous arrive par mail chaque lundi.`} />
      <div className="kpis">
        <a href="#manques" className="kpi bad"><b>{p.manques.length}</b><span>élève(s) avec des jours de stage manquants</span></a>
        <a href="#difficultes" className="kpi warn"><b>{p.difficultes.length}</b><span>élève(s) en difficulté</span></a>
        <a href="#equipe" className="kpi warn"><b>{p.retards.length}</b><span>retard(s) de l&apos;équipe</span></a>
        <Link href="/mails-a-valider" className="kpi"><b>{p.nbMails}</b><span>mail(s) à relire</span></Link>
      </div>

      <div className="panel pad section" id="manques">
        <h2>Jours de stage manquants</h2>
        {!p.manques.length ? <p className="sub" style={{ margin: 0 }}>Aucun.</p> : (
          <ul style={{ margin: 0 }}>
            {p.manques.map(({ e, classe, b }) => (
              <li key={e.id}>{fiche(e.id, `${e.prenom} ${e.nom}`)} ({classe}) : {b.sansStageEnCours ? `pas en stage depuis le ${dateLongue(b.sansStageEnCours.debut)}` : ""}{b.sansStageEnCours && b.total ? " · " : ""}{b.total ? `${b.total} jour(s) à rattraper` : ""}{b.arrets.length ? " · rappel arrêté" : ""}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel pad section" id="difficultes">
        <h2>Élèves en difficulté (30 derniers jours)</h2>
        {!p.difficultes.length ? <p className="sub" style={{ margin: 0 }}>Aucun.</p> : (
          <ul style={{ margin: 0 }}>{p.difficultes.map(({ j, e }) => <li key={j.id}>{fiche(e!.id, `${e!.prenom} ${e!.nom}`)}, signalé le {j.at.toLocaleDateString("fr-FR")} · <Link href="/mails-a-valider">mail à la famille préparé</Link></li>)}</ul>
        )}
      </div>

      <form action={envoyerRappelsEquipe} className="panel pad section" id="equipe">
        <ChampRetour />
        <h2>Retards de l&apos;équipe</h2>
        {!parProf.size ? <p className="sub" style={{ margin: 0 }}>Aucun : visites prises, comptes rendus faits, ordres de mission signés.</p> : (
          <>
            <p className="sub" style={{ margin: 0 }}>Cap Admin a préparé un rappel pour chaque professeur concerné. Cochez, relisez ou modifiez, puis envoyez.</p>
            {[...parProf.values()].map(({ prof, retards }) => (
              <div key={prof.id} className="panel pad section" id={`prof-${prof.id}`}>
                <label className="check"><input type="checkbox" name="prof" value={prof.id} defaultChecked /> <b>{prof.prenom} {prof.nom}</b></label>
                <ul className="sub" style={{ margin: 0 }}>
                  {retards.map((r) => <li key={r.cle}>{TYPES[r.type]} · {r.eleve} ({r.classe}, {r.entreprise}) : {r.quoi}{r.rappeleLe ? ` · rappel envoyé le ${r.rappeleLe.toLocaleDateString("fr-FR")}` : ""}</li>)}
                </ul>
                <label className="f" htmlFor={`m-${prof.id}`}>Message<textarea id={`m-${prof.id}`} name={`message_${prof.id}`} rows={6} defaultValue={rappelPrepare(prof, retards, `${ctx.user.prenom} ${ctx.user.nom}, ${ctx.etab.nom}`, base)} /></label>
              </div>
            ))}
            <div className="actions"><button className="btn primary">Envoyer les rappels</button></div>
          </>
        )}
      </form>

      <div className="grid2">
        <div className="panel pad section" id="conventions">
          <h2>Conventions à faire signer</h2>
          <p className="sub" style={{ margin: 0 }}>Stage dans moins de 7 jours.</p>
          {!p.conventions.length ? <p className="sub" style={{ margin: 0 }}>Aucune.</p> : <ul style={{ margin: 0 }}>{p.conventions.map((x) => <li key={x.eleveId}>{fiche(x.eleveId, x.eleve)} ({x.classe}), départ le {dateLongue(x.debut)}</li>)}</ul>}
        </div>
        <div className="panel pad section" id="attestations">
          <h2>Attestations attendues</h2>
          <p className="sub" style={{ margin: 0 }}>Stages terminés sans attestation validée.</p>
          {!p.sansAttestation.length ? <p className="sub" style={{ margin: 0 }}>Aucune.</p> : <ul style={{ margin: 0 }}>{p.sansAttestation.slice(0, 30).map((x) => <li key={`${x.eleveId}-${x.periode}`}>{fiche(x.eleveId, x.eleve)} ({x.classe}) : {x.periode}, fini le {dateLongue(x.fin)}</li>)}</ul>}
        </div>
      </div>
      {p.tailles.length > 0 && (
        <div className="panel pad section" id="tailles">
          <h2>Tailles de tenue manquantes</h2>
          <ul style={{ margin: 0 }}>{p.tailles.map((t) => <li key={t.classe}><Link href="/tenues">{t.classe}</Link> : {t.manquent} élève(s), date limite le {dateLongue(t.dateLimite)}</li>)}</ul>
        </div>
      )}
    </>
  );
}
