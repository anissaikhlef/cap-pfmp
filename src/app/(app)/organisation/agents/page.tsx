import Link from "next/link";
import { contexte } from "@/lib/auth";
import { AGENTS, LIBELLES_FORMULES, LISTE_AGENTS, aLAgent, euros, formuleDe } from "@/lib/agents";
import { iaBranchee } from "@/lib/ia";
import { reglagesPlateforme, usageDuMois } from "@/lib/plateforme";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { enregistrerAgents } from "../actions";

export const metadata = { title: "Agents IA" };

export default async function Agents() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const r = ctx.etab.reglages;
  const { tarifs, plafonds } = await reglagesPlateforme();
  const usage = await usageDuMois(ctx.etab.id);
  const prix = (k: keyof typeof tarifs) => (tarifs[k] ? `${euros(tarifs[k])} par mois` : "montant à venir");
  return (
    <>
      <Entete titre="Agents IA" sous="Cap PFMP travaille avec trois agents. Cap Admin, l'agent administratif, est inclus pour tous les lycées ; Cap Veille et Cap Partenaires sont au choix. Le montant de l'abonnement dépend des agents choisis.">
        <div className="actions"><Link className="btn" href="/organisation">Retour à l&apos;organisation</Link></div>
      </Entete>
      <Formulaire action={enregistrerAgents} bouton="Enregistrer les agents" viderApres={false}>
        <div className="panel pad section">
          <h2>Vos agents</h2>
          {LISTE_AGENTS.map((k) => {
            const ag = AGENTS[k];
            return (
              <div key={k} className="agent-ia" style={{ paddingLeft: 12 }}>
                {ag.obligatoire
                  ? <p style={{ margin: "4px 0" }}><span className="marque">Agent {ag.numero} · {ag.nom}</span> · {ag.role} · <b>inclus</b></p>
                  : <label className="check"><input type="checkbox" name={k} defaultChecked={aLAgent(r, k)} /> <span className="marque">Agent {ag.numero} · {ag.nom}</span> · {ag.role}</label>}
                <p className="sub" style={{ marginTop: 0 }}>{ag.detail}</p>
                {aLAgent(r, k) && plafonds[k] > 0 && <p className="sub" style={{ marginTop: -6 }}>Ce mois-ci : {usage[k]} demande(s) sur {plafonds[k]} prévues.</p>}
              </div>
            );
          })}
          <p className="note">Formule actuelle : <b>{LIBELLES_FORMULES[formuleDe(r)]}</b>, {prix(formuleDe(r))}. Un changement d&apos;agents compte pour la facture à partir du mois suivant.</p>
          <details>
            <summary className="sub">Voir les montants de chaque formule</summary>
            <ul className="sub">
              {(Object.keys(LIBELLES_FORMULES) as (keyof typeof tarifs)[]).map((k) => <li key={k}>{LIBELLES_FORMULES[k]} : {prix(k)}</li>)}
            </ul>
          </details>
        </div>
        <div className="panel pad section">
          <h2>Ce que Cap Admin prépare</h2>
          <p className="sub">Chaque matin, Cap Admin rédige les mails utiles ; ils attendent dans « Mails à valider » qu&apos;une personne les relise. Les rappels automatiques (« Organisation ») partent, eux, sans validation.</p>
          <div className="grid2">
            <label className="f" htmlFor="sansStageJours">Mail à la famille d&apos;un élève toujours sans stage, à partir de (jours avant la période, 0 pour jamais)<input id="sansStageJours" name="sansStageJours" type="number" min={0} max={60} defaultValue={r.agents.sansStageJours} /></label>
            <label className="f" htmlFor="absencesMail">Mail à la famille à partir de (absences non justifiées pendant un stage, 0 pour jamais)<input id="absencesMail" name="absencesMail" type="number" min={0} max={10} defaultValue={r.agents.absencesMail} /></label>
          </div>
        </div>
        <div className="panel pad section">
          <h2>Données des élèves</h2>
          <ul className="sub" style={{ margin: 0 }}>
            <li>Les agents ne voient aucun nom d&apos;élève : Cap PFMP le remet au moment où vous relisez.</li>
            <li>Pour relire un CV, l&apos;agent reçoit le texte sans les coordonnées (adresse, téléphone, mail).</li>
            <li>Un texte préparé par un agent porte la mention « préparé avec » le nom de l&apos;agent.</li>
            {!iaBranchee() && <li>En démonstration, les agents répondent avec des textes d&apos;exemple.</li>}
          </ul>
        </div>
      </Formulaire>
    </>
  );
}
