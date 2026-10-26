import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { repartitionParHeures, visiteursPossibles, visitesAOrganiser } from "@/lib/visites";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Formulaire } from "@/components/Formulaire";
import { Pill } from "@/components/ui";
import { EtatVisite } from "@/components/visites";
import { attribuer, repartirAutomatiquement, validerQuotas } from "./actions";

export const metadata = { title: "Visites" };

const heures = (h: number) => `${String(Math.round(h * 100) / 100).replace(".", ",")} h`;

/** Nombre de visites par professeur, en proportion de ses heures de face à face : proposé, puis validé par la gestion. */
async function RepartitionParHeures({ ctx }: { ctx: Awaited<ReturnType<typeof contexte>> }) {
  const periodes = await repartitionParHeures(ctx);
  return (
    <div className="panel pad section">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Nombre de visites par professeur</h2>
        <Link className="btn small" href="/visites/heures">Heures de face à face</Link>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        Pour chaque période, l&apos;application propose le nombre de visites de chaque professeur, en proportion de ses heures de cours dans la classe.
        Ajustez si besoin, puis validez : chaque professeur est prévenu et choisit lui-même ses lieux de stage dans « Mes visites ».
      </p>
      {periodes.length === 0 && <p className="empty">Aucun stage à visiter pour l&apos;instant.</p>}
      {periodes.map((x) => {
        const totalValide = x.profs.reduce((t, p) => t + (p.valide ?? 0), 0);
        return (
          <div key={x.periode.id} className="card" id={`repartition-${x.periode.id}`}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <b>{x.classe.libelle} · {x.periode.libelle} <span className="sub">du {dateCourte(x.periode.debut)} au {dateCourte(x.periode.fin)}</span></b>
              {x.valideLe ? <Pill ton="ok">Validé le {dateCourte(x.valideLe.toISOString().slice(0, 10))}</Pill> : <Pill ton="warn">À valider</Pill>}
            </div>
            <span className="sub">{x.stages} stage(s) à visiter · {x.sansVisiteur} sans visiteur</span>
            {x.profs.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>Aucune heure de face à face n&apos;est saisie pour {x.classe.libelle}. <Link href="/visites/heures">Saisissez les heures</Link> pour obtenir une proposition.</p>
            ) : (
              <Formulaire action={validerQuotas} bouton={x.valideLe ? "Mettre à jour" : "Valider ces nombres de visites"} boutonClasse={x.valideLe ? "btn small" : "btn small primary"}>
                <input type="hidden" name="periodeId" value={x.periode.id} />
                <div className="tbl">
                  <table>
                    <thead><tr><th>Professeur</th><th>Heures</th><th>Proposé</th><th>Visites confiées</th><th>Choisies</th></tr></thead>
                    <tbody>
                      {x.profs.map((p) => (
                        <tr key={p.prof.id}>
                          <td>{p.prof.prenom} {p.prof.nom}</td>
                          <td className="num">{heures(p.heures)}</td>
                          <td className="num">{p.proposition}</td>
                          <td><input className="inp" type="number" min={0} max={200} name={`q_${p.prof.id}`} defaultValue={p.valide ?? p.proposition} aria-label={`Visites confiées à ${p.prof.prenom} ${p.prof.nom}`} style={{ width: 72 }} /></td>
                          <td className="num">{p.choisies}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><b>Total</b></td>
                        <td className="num"><b>{heures(x.profs.reduce((t, p) => t + p.heures, 0))}</b></td>
                        <td className="num"><b>{x.profs.reduce((t, p) => t + p.proposition, 0)}</b></td>
                        <td className="num"><b>{x.valideLe ? totalValide : "—"}</b></td>
                        <td className="num"><b>{x.profs.reduce((t, p) => t + p.choisies, 0)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {x.valideLe && totalValide !== x.stages && <p className="msg err" style={{ margin: 0 }}>Le total validé ({totalValide}) ne correspond plus aux {x.stages} stages à visiter : ajustez puis mettez à jour.</p>}
              </Formulaire>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function Visites() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/mes-visites");
  const lignes = await visitesAOrganiser(ctx, { gerees: true });
  const pool = await visiteursPossibles(ctx);
  const jour = aujourdhui();
  const actives = lignes.filter((l) => l.p.fin >= jour);
  const charge = pool.map((p) => ({ p, n: lignes.filter((l) => l.v?.visiteurId === p.id).length }));
  const max = Math.max(1, ...charge.map((c) => c.n));
  const sans = actives.filter((l) => !l.v?.visiteurId).length;
  const parHeures = ctx.etab.reglages.repartition === "heures";
  return (
    <>
      <div>
        <h1>Visites de stage</h1>
        <p className="sub">
          Une visite par élève, faite par {ctx.etab.reglages.visiteurs === "pro" ? "les professeurs de l'enseignement professionnel" : "toute l'équipe pédagogique"}.
          {ctx.etab.reglages.ordreMission && " Chaque visite demande un ordre de mission signé par la direction."}
          {parHeures && " Le nombre de visites de chacun suit ses heures de face à face ; les rattrapages s'attribuent directement dans la liste."}
        </p>
      </div>
      {parHeures && <RepartitionParHeures ctx={ctx} />}
      {!parHeures && <div className="panel pad section">
        <h2>Charge des visiteurs</h2>
        {charge.map(({ p, n }) => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 200px) 1fr 28px", gap: 10, alignItems: "center", fontSize: 14 }}>
            <span>{p.prenom} {p.nom} <span className="sub">· {p.discipline ?? (p.enseignementPro ? "pro" : "général")}</span></span>
            <div style={{ height: 10, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${(n / max) * 100}%`, background: "var(--accent)" }} /></div>
            <span className="num">{n}</span>
          </div>
        ))}
        <form action={repartirAutomatiquement} className="actions">
          <ChampRetour />
          <button className="btn primary">Répartir automatiquement</button>
          <span className="sub">{sans} élève(s) sans visiteur. La répartition privilégie le référent, équilibre la charge et regroupe les élèves d&apos;une même entreprise.</span>
        </form>
      </div>}
      <div className="panel rows">
        {lignes.length === 0 && <div className="empty">Aucun stage à visiter pour l&apos;instant.</div>}
        {lignes.map((l) => (
          <div key={l.s.id} className="row">
            <div className="main">
              <div className="name">{l.e.prenom} {l.e.nom} <span className="cls">{l.c.libelle}</span> {l.p.eleveId && <Pill ton="warn">Rattrapage</Pill>}</div>
              <div className="meta">{l.ent.nom}{l.ent.ville ? `, ${l.ent.ville}` : ""} · stage du {dateCourte(l.p.debut)} au {dateCourte(l.p.fin)}</div>
              <div style={{ marginTop: 6 }}><EtatVisite l={l} ctx={ctx} /></div>
            </div>
            <form action={attribuer} className="actions">
              <ChampRetour />
              <input type="hidden" name="stageId" value={l.s.id} />
              <select className="inp" name="visiteurId" defaultValue={l.v?.visiteurId ?? ""} aria-label={`Visiteur de ${l.e.prenom} ${l.e.nom}`} style={{ width: "auto" }}>
                <option value="">— Visiteur —</option>
                {pool.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
              </select>
              <input className="inp" type="date" name="date" defaultValue={l.v?.date ?? ""} aria-label={`Date de visite de ${l.e.prenom} ${l.e.nom}`} style={{ width: "auto" }} />
              <button className="btn small">Enregistrer</button>
            </form>
            {l.v && <Link className="btn small" href={`/visites/${l.v.id}`}>Détails</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
