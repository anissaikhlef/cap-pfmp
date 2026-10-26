import { contexte } from "@/lib/auth";
import { entrepriseDuLycee, stagiairesEntreprise } from "@/lib/stages";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { TableHoraires } from "@/components/stage";
import { Pill } from "@/components/ui";
import { BlocConvention, BlocFinDeStage } from "@/components/convention";

export const metadata = { title: "Mes stagiaires" };

export default async function Stagiaires() {
  const ctx = await contexte({ roles: ["entreprise"] });
  const ent = ctx.user.entrepriseId ? await entrepriseDuLycee(ctx, ctx.user.entrepriseId) : null;
  const liste = await stagiairesEntreprise(ctx);
  const jour = aujourdhui();
  return (
    <>
      <div><h1>{ent?.nom ?? "Mes stagiaires"}</h1><p className="sub">Bonjour {ctx.user.prenom}. Vos stagiaires pour l&apos;année {ctx.etab.anneeScolaire}.</p></div>
      {liste.length === 0 && <p className="empty">Aucun stagiaire pour l&apos;instant.</p>}
      {liste.map(({ s, e, p, c }) => {
        const ton = jour < p.debut ? "info" : jour <= p.fin ? "ok" : "muted";
        const etat = jour < p.debut ? `Arrive le ${dateCourte(p.debut)}` : jour <= p.fin ? "En stage" : "Stage terminé";
        return (
          <div key={s.id} className="panel pad section" id={`stage-${s.id}`}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2>{e.prenom} {e.nom} <span className="cls">{c.libelle}</span></h2>
              <Pill ton={ton}>{etat}</Pill>
            </div>
            <p className="sub" style={{ margin: 0 }}>Du {dateCourte(p.debut)} au {dateCourte(p.fin)}</p>
            <details><summary className="btn small">Horaires</summary><TableHoraires h={s.horaires} /></details>
            <BlocConvention ctx={ctx} stageId={s.id} />
            <BlocFinDeStage ctx={ctx} stageId={s.id} />
          </div>
        );
      })}
    </>
  );
}
