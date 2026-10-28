import type { Contexte } from "@/lib/auth";
import type { schema } from "@/db";
import { AGENTS, aLAgent } from "@/lib/agents";
import { dernieresSuggestions } from "@/lib/agent-entreprises";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "./ChampRetour";
import { faireRelireCv, proposerLieuxDeStage } from "@/app/(app)/eleves/agents-actions";
import { demanderMail } from "@/app/(app)/mails-a-valider/actions";

type Eleve = typeof schema.eleves.$inferSelect;
const le = (d: Date) => dateCourte(d.toISOString().slice(0, 10));

/**
 * Cap Partenaires (agent 3, au choix du lycée) sur la fiche d'un élève et dans « Mon stage » : lieux de stage proposés
 * et relecture du CV. `pourEleve` : le texte s'adresse à l'élève.
 */
export async function BlocCapPartenaires({ ctx, eleve, chercheUnStage, pourEleve }: { ctx: Contexte; eleve: Eleve; chercheUnStage: boolean; pourEleve: boolean }) {
  if (!aLAgent(ctx.etab.reglages, "entreprises")) return null;
  const nom = AGENTS.entreprises.nom;
  const { lieux, cv } = await dernieresSuggestions(ctx.etab.id, eleve.id);
  return (
    <div className="section">
      <h2>{nom}</h2>
      <div className="panel pad agent-ia stack">
        <p className="sub" style={{ margin: 0 }}>{pourEleve ? `${nom}, l'agent de recherche d'entreprises de Cap PFMP, t'aide à trouver ton stage et relit ton CV.` : `${nom}, l'agent de recherche d'entreprises de Cap PFMP : lieux de stage pour cet élève et relecture de son CV.`}</p>
        {chercheUnStage && (
          <form action={proposerLieuxDeStage} className="actions">
            <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
            <button className="btn small primary">{lieux ? "Proposer de nouveaux lieux de stage" : "Proposer des lieux de stage"}</button>
          </form>
        )}
        {lieux?.contenu.entreprises && (
          <div className="stack">
            <b>Lieux de stage proposés le {le(lieux.createdAt)}</b>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lieux.contenu.entreprises.map((x) => (
                <li key={x.nom}><b>{x.nom}</b>{x.ville ? ` · ${x.ville}` : ""}{x.domaine ? ` · ${x.domaine}` : ""}<br /><span className="sub">{x.raison}</span></li>
              ))}
            </ul>
            {lieux.contenu.conseil && <p className="note" style={{ margin: 0 }}>{lieux.contenu.conseil}</p>}
            <p className="sub" style={{ margin: 0 }}>Préparé avec {nom}{lieux.simule ? " (texte d'exemple, agent en démonstration)" : ""}.</p>
          </div>
        )}
        <details>
          <summary className="btn small">{pourEleve ? "Faire relire mon CV" : "Faire relire son CV"}</summary>
          <form action={faireRelireCv} className="stack" style={{ marginTop: 8 }}>
            <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
            <label className="f" htmlFor={`cv-${eleve.id}`}>{pourEleve ? "Copie ici le texte de ton CV" : "Texte du CV"}
              <textarea id={`cv-${eleve.id}`} name="texte" rows={10} maxLength={8000} />
            </label>
            <p className="sub" style={{ margin: 0 }}>Ton nom, ton adresse, ton téléphone et ton mail sont retirés avant la relecture.</p>
            <button className="btn small primary">Relire</button>
          </form>
        </details>
        {cv?.contenu.cv && (
          <div className="stack">
            <b>Relecture du CV du {le(cv.createdAt)}</b>
            <div className="grid2">
              <div><span className="sub">Points forts</span><ul style={{ margin: 0, paddingLeft: 18 }}>{cv.contenu.cv.pointsForts.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><span className="sub">À améliorer</span><ul style={{ margin: 0, paddingLeft: 18 }}>{cv.contenu.cv.aAmeliorer.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            <p className="note" style={{ margin: 0 }}>{cv.contenu.cv.conseil}</p>
            <p className="sub" style={{ margin: 0 }}>Préparé avec {nom}{cv.simule ? " (texte d'exemple, agent en démonstration)" : ""}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cap Admin (agent 1) sur la fiche d'un élève : l'équipe lui demande un mail pour la famille ou le tuteur. */
export function BlocDemanderMail({ eleve }: { eleve: Eleve }) {
  const nom = AGENTS.administratif.nom;
  return (
    <details className="section">
      <summary className="btn small">Préparer un mail avec {nom}</summary>
      <form action={demanderMail} className="panel pad agent-ia stack" style={{ marginTop: 8 }}>
        <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
        <label className="f" htmlFor="mail-pour">Pour
          <select id="mail-pour" name="pour" defaultValue="famille"><option value="famille">La famille</option><option value="tuteur">Le tuteur de stage</option></select>
        </label>
        <label className="f" htmlFor="mail-consigne">Ce que le mail doit dire
          <textarea id="mail-consigne" name="consigne" rows={3} maxLength={1000} placeholder="Ex. Le carnet de bord n'est pas rempli depuis une semaine ; rappeler qu'il sert au livret." />
        </label>
        <p className="sub" style={{ margin: 0 }}>{nom} rédige le mail sans voir le nom de l&apos;élève ; il attend dans « Mails à valider » que vous le relisiez.</p>
        <button className="btn small primary">Préparer le mail</button>
      </form>
    </details>
  );
}
