import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { visiteursPossibles, visitesAOrganiser } from "@/lib/visites";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { EtatVisite } from "@/components/visites";
import { attribuer, repartirAutomatiquement } from "./actions";

export const metadata = { title: "Visites" };

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
  return (
    <>
      <div>
        <h1>Visites de stage</h1>
        <p className="sub">
          Une visite par élève, faite par {ctx.etab.reglages.visiteurs === "pro" ? "les professeurs de l'enseignement professionnel" : "toute l'équipe pédagogique"}.
          {ctx.etab.reglages.ordreMission && " Chaque visite demande un ordre de mission signé par la direction."}
        </p>
      </div>
      <div className="panel pad section">
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
      </div>
      <div className="panel rows">
        {lignes.length === 0 && <div className="empty">Aucun stage à visiter pour l&apos;instant.</div>}
        {lignes.map((l) => (
          <div key={l.s.id} className="row">
            <div className="main">
              <div className="name">{l.e.prenom} {l.e.nom} <span className="cls">{l.c.libelle}</span></div>
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
