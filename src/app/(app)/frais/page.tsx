import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { dateCourte } from "@/lib/dates";
import { euros } from "@/lib/regles";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { refuserFrais, validerFrais } from "./actions";

export const metadata = { title: "Frais de déplacement" };

const FILTRES: [string, string][] = [["envoyee", "À valider"], ["validee", "Validées"], ["refusee", "Refusées"], ["toutes", "Toutes"]];

/** Les demandes de remboursement des professeurs, validées par la gestion des PFMP (décision d'Anissa). */
export default async function Frais({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!peutAdministrer(ctx)) redirect("/");
  const sp = await searchParams;
  const statut = FILTRES.some(([k]) => k === sp.statut) ? sp.statut! : "envoyee";
  const toutes = await db.select({ f: schema.fraisDeplacement, u: schema.users, e: schema.eleves, ent: schema.entreprises })
    .from(schema.fraisDeplacement)
    .innerJoin(schema.users, eq(schema.users.id, schema.fraisDeplacement.professeurId))
    .innerJoin(schema.visites, eq(schema.visites.id, schema.fraisDeplacement.visiteId))
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(eq(schema.fraisDeplacement.etablissementId, ctx.etab.id)))
    .orderBy(desc(schema.fraisDeplacement.date));
  const liste = statut === "toutes" ? toutes : toutes.filter((x) => x.f.statut === statut);
  const aValider = toutes.filter((x) => x.f.statut === "envoyee");
  const validees = toutes.filter((x) => x.f.statut === "validee");
  // Récapitulatif par professeur : demandes validées
  const parProf = [...validees.reduce((m, x) => {
    const p = m.get(x.u.id) ?? { nom: `${x.u.prenom} ${x.u.nom}`, n: 0, km: 0, total: 0 };
    p.n++; p.km += x.f.km; p.total += x.f.total;
    return m.set(x.u.id, p);
  }, new Map<string, { nom: string; n: number; km: number; total: number }>()).values()].sort((a, b) => a.nom.localeCompare(b.nom));
  return (
    <>
      <Entete titre="Frais de déplacement" sous="Les professeurs préparent leur demande de remboursement après chaque visite, selon le barème du lycée. Vous la validez, ou la renvoyez avec un motif.">
        <div className="actions">
          <Link className="btn" href="/organisation/frais">Barème du lycée</Link>
          <a className="btn" href="/frais/export">Exporter pour un tableur</a>
        </div>
      </Entete>
      <div className="kpis">
        <Link href="/frais?statut=envoyee" className="kpi warn"><b>{aValider.length}</b><span>à valider · {euros(aValider.reduce((t, x) => t + x.f.total, 0))}</span></Link>
        <Link href="/frais?statut=validee" className="kpi ok"><b>{validees.length}</b><span>validées · {euros(validees.reduce((t, x) => t + x.f.total, 0))}</span></Link>
      </div>
      <div className="chips">
        {FILTRES.map(([k, lib]) => <Link key={k} className="chip" href={`/frais?statut=${k}`} aria-current={statut === k ? "true" : undefined}>{lib}</Link>)}
      </div>
      <div className="panel rows">
        {liste.length === 0 && <div className="empty">Aucune demande.</div>}
        {liste.map(({ f, u, e, ent }) => (
          <div key={f.id} className="row">
            <div className="main">
              <div className="name">{u.prenom} {u.nom} · <Link href={`/visites/${f.visiteId}`}>visite du {dateCourte(f.date)}</Link></div>
              <div className="meta">
                {e.prenom} {e.nom}, {ent.nom} · {f.transport === "vehicule" ? `${f.km.toLocaleString("fr-FR")} km (${f.vehicule}) ${euros(f.montantKm)}` : `billets ${euros(f.billets)}`}
                {f.peage ? ` · péage ${euros(f.peage)}` : ""}{f.repas ? ` · ${f.repas} repas ${euros(f.montantRepas)}` : ""}{f.nuitees ? ` · ${f.nuitees} nuitée(s) ${euros(f.montantNuitees)}` : ""}
                {f.commentaire ? ` · « ${f.commentaire} »` : ""}
              </div>
            </div>
            <b className="num">{euros(f.total)}</b>
            {f.statut === "envoyee" ? (
              <>
                <details>
                  <summary className="btn small">Refuser</summary>
                  <Formulaire action={refuserFrais} className="actions" bouton="Confirmer le refus" boutonClasse="btn small danger">
                    <input type="hidden" name="id" value={f.id} />
                    <label className="f" htmlFor={`rf-${f.id}`}>Motif transmis au professeur<input id={`rf-${f.id}`} name="motif" placeholder="Ex. joindre le ticket de péage" required /></label>
                  </Formulaire>
                </details>
                <form action={validerFrais}><ChampRetour /><input type="hidden" name="id" value={f.id} /><button className="btn small primary">Valider</button></form>
              </>
            ) : <Pill ton={f.statut === "validee" ? "ok" : "bad"}>{f.statut === "validee" ? `Validée le ${dateCourte(f.valideLe!.toISOString().slice(0, 10))}` : `Refusée : ${f.motifRefus}`}</Pill>}
          </div>
        ))}
      </div>
      {parProf.length > 0 && (
        <div className="panel pad section">
          <h2>Récapitulatif par professeur (demandes validées)</h2>
          <table className="recap-frais"><tbody>
            <tr><th>Professeur</th><th className="num">Déplacements</th><th className="num">Kilomètres</th><th className="num">Total</th></tr>
            {parProf.map((p) => <tr key={p.nom}><td>{p.nom}</td><td className="num">{p.n}</td><td className="num">{p.km.toLocaleString("fr-FR")}</td><td className="num">{euros(p.total)}</td></tr>)}
          </tbody></table>
        </div>
      )}
    </>
  );
}
