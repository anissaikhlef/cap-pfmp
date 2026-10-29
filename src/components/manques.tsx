import type { schema } from "@/db";
import type { Contexte } from "@/lib/auth";
import { dateLongue } from "@/lib/dates";
import { manquesDesEleves, peutArreterRappels } from "@/lib/manques";
import { arreterRappels, reactiverRappel } from "@/app/(app)/eleves/manques-actions";
import { ChampRetour } from "./ChampRetour";

/**
 * Jours de stage manquants (Cap Admin, décision d'Anissa) sur la fiche de l'élève : le détail, la période en cours sans
 * lieu de stage, et l'arrêt des rappels par le DDFPT ou le référent, avec la raison.
 */
export async function BlocManques({ ctx, eleve }: { ctx: Contexte; eleve: typeof schema.eleves.$inferSelect }) {
  const b = (await manquesDesEleves(ctx.etab.id, [eleve])).get(eleve.id)!;
  if (!b.total && !b.sansStageEnCours && !b.arrets.length) return null;
  const peut = await peutArreterRappels(ctx, eleve);
  const famille = b.arrets.find((x) => x.cible === "famille");
  const moi = b.arrets.find((x) => x.cible === ctx.user.id);
  return (
    <div className="panel pad section" id="manques">
      <h2>Jours de stage manquants</h2>
      {b.sansStageEnCours && <p className="msg err" style={{ margin: 0 }}>Pas en stage alors que la période « {b.sansStageEnCours.libelle} » a commencé le {dateLongue(b.sansStageEnCours.debut)} : un rappel part tous les {ctx.etab.reglages.relances.sansStageIntervalle} jours.</p>}
      {b.total > 0 ? (
        <>
          <p style={{ margin: 0 }}><b>{b.total} jour(s)</b> de stage à rattraper{b.rattrapes ? ` (après ${b.rattrapes} jour(s) déjà rattrapés)` : ""}.</p>
          <ul className="sub" style={{ margin: 0 }}>{b.detail.map((x) => <li key={x.libelle}>{x.libelle} : {x.jours} jour(s)</li>)}</ul>
          <p className="sub" style={{ margin: 0 }}>Cap Admin prévient l&apos;élève, ses parents, le référent et le DDFPT au début de chaque nouvelle période et à la rentrée, tant que ces jours ne sont pas rattrapés.</p>
        </>
      ) : !b.sansStageEnCours && <p className="sub" style={{ margin: 0 }}>Aucun jour de stage manquant.</p>}
      {b.arrets.map((x) => (
        <div key={x.id} className="actions" style={{ justifyContent: "space-between" }}>
          <span className="sub">Rappel arrêté {x.cible === "famille" ? "pour l'élève et sa famille" : x.cible === ctx.user.id ? "pour vous" : `pour ${x.par || "un membre de l'équipe"}`} le {x.le.toLocaleDateString("fr-FR")}{x.par ? ` par ${x.par}` : ""} : « {x.raison} »</span>
          {peut && (x.cible === "famille" || x.cible === ctx.user.id) && (
            <form action={reactiverRappel}><ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} /><input type="hidden" name="cible" value={x.cible} /><button className="btn small">Réactiver</button></form>
          )}
        </div>
      ))}
      {peut && (!famille || !moi) && (
        <form action={arreterRappels} className="stack">
          <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
          <label className="f" htmlFor={`raison-${eleve.id}`}>Arrêter le rappel : la raison<textarea id={`raison-${eleve.id}`} name="raison" rows={2} maxLength={500} placeholder="Ex. hospitalisation, situation suivie par l'équipe…" required /></label>
          <div className="actions">
            {!famille && <label className="check"><input type="checkbox" name="famille" value="oui" defaultChecked /> pour l&apos;élève et sa famille</label>}
            {!moi && <label className="check"><input type="checkbox" name="moi" value="oui" /> pour moi aussi</label>}
            <button className="btn small">Arrêter le rappel</button>
          </div>
        </form>
      )}
    </div>
  );
}
