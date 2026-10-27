import Link from "next/link";
import { contexte } from "@/lib/auth";
import { peutFixerLesDates } from "@/lib/acces";
import { periodesDuLycee, rattrapagesVisibles } from "@/lib/calendrier";
import { dateLongue } from "@/lib/dates";
import { EtatDeLaPeriode, FrisePFMP, ListePeriodes } from "@/components/calendrier";
import { Entete } from "@/components/ui";

export const metadata = { title: "Calendrier des PFMP" };

/**
 * Calendrier des PFMP : toutes les périodes de toutes les classes, visibles par tous les comptes du lycée ;
 * seuls le DDFPT et la direction en fixent les dates (décision d'Anissa). Les rattrapages, propres à un élève,
 * ne sont montrés qu'à ceux qui les suivent.
 */
export default async function Calendrier() {
  const ctx = await contexte();
  const lignes = await periodesDuLycee(ctx.etab);
  const rattrapages = await rattrapagesVisibles(ctx);
  const dates = peutFixerLesDates(ctx);
  return (
    <>
      <Entete titre="Calendrier des PFMP" sous={`Année ${ctx.etab.anneeScolaire} · toutes les périodes de toutes les classes du lycée`}>
        {dates && <Link className="btn" href="/classes">Modifier les dates</Link>}
      </Entete>
      {!dates && <p className="sub" style={{ margin: 0 }}>Les dates sont fixées par le DDFPT.</p>}
      <FrisePFMP lignes={lignes} anneeScolaire={ctx.etab.anneeScolaire} />
      <div className="section">
        <h2>Toutes les périodes</h2>
        <ListePeriodes lignes={lignes} />
      </div>
      {rattrapages && (
        <div className="section" id="rattrapages">
          <h2>Rattrapages</h2>
          <p className="sub" style={{ margin: 0 }}>Stages d&apos;un élève en dehors des périodes de sa classe : pendant ces dates, il est en entreprise et absent des cours.</p>
          <div className="panel rows">
            {rattrapages.length === 0 && <div className="empty">Aucun rattrapage cette année.</div>}
            {rattrapages.map(({ p, e, c, motif }) => (
              <div key={p.id} className="row">
                <div className="main" style={{ minWidth: 220 }}>
                  <div className="name">{e.prenom} {e.nom} <span className="cls">{c.libelle}</span></div>
                  <div className="meta">{p.libelle} · du {dateLongue(p.debut)} au {dateLongue(p.fin)}{motif ? ` · motif : ${motif}` : ""}</div>
                </div>
                <EtatDeLaPeriode debut={p.debut} fin={p.fin} />
              </div>
            ))}
          </div>
        </div>
      )}
      {dates && ctx.etab.reglages.calendrierPublic && <p className="sub">Ce calendrier est aussi consultable sans compte : <Link href={`/pfmp/${ctx.etab.id}`}>lien public</Link> (réglage dans « Organisation »).</p>}
    </>
  );
}
