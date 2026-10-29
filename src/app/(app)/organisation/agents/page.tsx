import Link from "next/link";
import { contexte } from "@/lib/auth";
import { AGENTS, LIBELLES_FORMULES, LISTE_AGENTS, aLAgent, euros, formuleDe } from "@/lib/agents";
import { iaBranchee } from "@/lib/ia";
import { reglagesPlateforme, usageDuMois } from "@/lib/plateforme";
import { Formulaire } from "@/components/Formulaire";
import { languesDuLycee } from "@/lib/langues";
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
            <label className="f" htmlFor="sansStageJours">Mail à la famille d&apos;un élève toujours sans stage, à partir de (jours avant la période, 60 pour 2 mois, 0 pour jamais ; si aucun responsable n&apos;a de compte, le mail part à l&apos;élève et son référent et le DDFPT sont prévenus)<input id="sansStageJours" name="sansStageJours" type="number" min={0} max={120} defaultValue={r.agents.sansStageJours} /></label>
            <label className="f" htmlFor="absencesMail">Mail à la famille à partir de (absences non justifiées pendant un stage, 0 pour jamais)<input id="absencesMail" name="absencesMail" type="number" min={0} max={10} defaultValue={r.agents.absencesMail} /></label>
          </div>
          <h3>Jours de stage manquants</h3>
          <p className="sub" style={{ margin: 0 }}>L&apos;élève, ses parents, le référent et le DDFPT sont prévenus : à la fin d&apos;un stage avec des jours manquants, au début de chaque nouvelle période et à la rentrée, tant qu&apos;ils ne sont pas rattrapés. Le DDFPT ou le référent peut arrêter un rappel sur la fiche de l&apos;élève.</p>
          <label className="f" htmlFor="sansStageIntervalle">Élève pas en stage alors que sa période a commencé : un rappel tous les (jours, 0 pour jamais)<input id="sansStageIntervalle" name="sansStageIntervalle" type="number" min={0} max={14} defaultValue={r.relances.sansStageIntervalle} /></label>
          <h3>Alertes au DDFPT</h3>
          <p className="sub" style={{ margin: 0 }}>Le DDFPT reçoit une alerte ; les rappels aux professeurs sont prêts dans le « Point de la semaine », qu&apos;il envoie en un clic.</p>
          <div className="grid2">
            <label className="f" htmlFor="visiteNonPriseAvant">Visite que personne n&apos;a prise, à partir de (jours avant le début du stage)<input id="visiteNonPriseAvant" name="visiteNonPriseAvant" type="number" min={0} max={30} defaultValue={r.relances.visiteNonPriseAvant} /></label>
            <label className="f" htmlFor="compteRenduApres">Compte rendu non fait, à partir de (jours après la visite)<input id="compteRenduApres" name="compteRenduApres" type="number" min={0} max={30} defaultValue={r.relances.compteRenduApres} /></label>
            <label className="f" htmlFor="ordreMissionAvant">Ordre de mission non signé, à partir de (jours avant la visite)<input id="ordreMissionAvant" name="ordreMissionAvant" type="number" min={0} max={30} defaultValue={r.relances.ordreMissionAvant} /></label>
          </div>
          <h3>Langues des familles</h3>
          <p className="sub" style={{ margin: 0 }}>Pour une famille qui ne lit pas le français, les messages aux parents et l&apos;espace « Mon enfant » sont traduits, avec le français dessous. La langue s&apos;indique sur la fiche de l&apos;élève, ou les parents la choisissent. Langues proposées : {languesDuLycee([]).map((l) => l.libelle).join(", ")}.</p>
          <label className="f" htmlFor="langues">Autres langues de vos familles (une par ligne)<textarea id="langues" name="langues" rows={3} defaultValue={r.langues.join("\n")} placeholder={"Ex. Soninké\nTigrigna"} /></label>
          <h3>Démarches sans réponse (Cap Partenaires)</h3>
          <div className="grid2">
            <label className="f" htmlFor="demarcheEleve">Rappel à l&apos;élève pour relancer l&apos;entreprise (jours après le contact, 0 pour jamais)<input id="demarcheEleve" name="demarcheEleve" type="number" min={0} max={30} defaultValue={r.relances.demarcheEleve} /></label>
            <label className="f" htmlFor="demarcheReferent">Puis le référent est prévenu (jours après le rappel, 0 pour jamais)<input id="demarcheReferent" name="demarcheReferent" type="number" min={0} max={30} defaultValue={r.relances.demarcheReferent} /></label>
          </div>
          <h3>Option oral (Cap Partenaires)</h3>
          <label className="check"><input type="checkbox" name="oral" defaultChecked={r.agents.oral} /> Le lycée prend l&apos;option payante de l&apos;entraînement à l&apos;entretien à l&apos;oral (reconnaissance vocale hébergée en Europe). Sans l&apos;option, l&apos;entraînement se fait par écrit.</label>
          <h3>Option SMS</h3>
          <label className="check"><input type="checkbox" name="sms" defaultChecked={r.agents.sms} /> Le lycée prend l&apos;option SMS (payante) : la personne qui valide un mail peut l&apos;envoyer aussi par SMS. Sans l&apos;option, Cap Admin n&apos;envoie que des mails.</label>
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
