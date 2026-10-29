import type { Contexte } from "@/lib/auth";
import type { schema } from "@/db";
import { AGENTS, aLAgent } from "@/lib/agents";
import { dernieresSuggestions } from "@/lib/agent-entreprises";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "./ChampRetour";
import { faireRelireCv, faireRelireLettre, guiderMaLettre, preparerEntretien, proposerLieuxDeStage, sEntrainer } from "@/app/(app)/eleves/agents-actions";
import { voixBranchee } from "@/lib/voix";
import { Dictee } from "./Dictee";
import { demanderMail } from "@/app/(app)/mails-a-valider/actions";

type Eleve = typeof schema.eleves.$inferSelect;
const le = (d: Date) => dateCourte(d.toISOString().slice(0, 10));

/**
 * Cap Partenaires (agent 3, au choix du lycée) sur la fiche d'un élève et dans « Mon stage » : lieux de stage proposés,
 * relecture du CV et de la lettre (collés ou déposés), guide pour écrire la lettre, préparation de l'appel et de
 * l'entretien, entraînement. `pourEleve` : le texte s'adresse à l'élève, qui ne voit que les propositions relues.
 */
export async function BlocCapPartenaires({ ctx, eleve, chercheUnStage, pourEleve }: { ctx: Contexte; eleve: Eleve; chercheUnStage: boolean; pourEleve: boolean }) {
  if (!aLAgent(ctx.etab.reglages, "entreprises")) return null;
  const nom = AGENTS.entreprises.nom;
  const sg = await dernieresSuggestions(ctx.etab.id, eleve.id);
  const lieux = pourEleve ? sg.lieuxRelus : sg.lieux;
  const aRelire = !pourEleve && sg.lieux?.aRelire && !sg.lieux.relueLe;
  const ton = (eleveTexte: string, equipe: string) => (pourEleve ? eleveTexte : equipe);
  const oral = ctx.etab.reglages.agents.oral && voixBranchee();
  const entretien = sg.entretien?.contenu;
  const derniere = entretien?.echanges?.at(-1);
  // Les textes reviennent de l'IA avec le repère [ÉLÈVE] à la place du prénom : il est remis à l'affichage.
  const nomme = (t: string) => t.split("[ÉLÈVE]").join(eleve.prenom);
  return (
    <div className="section" id="cap-partenaires">
      <h2>{nom}</h2>
      <div className="panel pad agent-ia stack">
        <p className="sub" style={{ margin: 0 }}>{ton(`${nom}, l'agent de recherche d'entreprises de Cap PFMP, t'aide à trouver ton stage : lieux de stage, CV, lettre de motivation, appel et entretien.`, `${nom}, l'agent de recherche d'entreprises de Cap PFMP : lieux de stage pour cet élève, relecture de son CV et de sa lettre, préparation de l'entretien.`)}</p>
        {chercheUnStage && (
          <form action={proposerLieuxDeStage} className="actions">
            <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
            <button className="btn small primary">{lieux ? "Proposer de nouveaux lieux de stage" : "Proposer des lieux de stage"}</button>
          </form>
        )}
        {lieux?.contenu.entreprises && (
          <div className="stack">
            <b>Lieux de stage proposés le {le(lieux.createdAt)}</b>
            {aRelire && <p className="msg err" style={{ margin: 0 }}>Proposition lancée pour la classe : le référent la relit avant que l&apos;élève la voie (« Cap Partenaires », « Propositions à relire »).</p>}
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lieux.contenu.entreprises.map((x) => (
                <li key={x.nom}><b>{x.nom}</b>{x.ville ? ` · ${x.ville}` : ""}{x.domaine ? ` · ${x.domaine}` : ""}<br /><span className="sub">{x.raison}</span></li>
              ))}
            </ul>
            {lieux.contenu.conseil && <p className="note" style={{ margin: 0 }}>{lieux.contenu.conseil}</p>}
            <p className="sub" style={{ margin: 0 }}>Préparé avec {nom}{lieux.relueLe ? ", relu par le référent" : ""}{lieux.simule ? " (texte d'exemple, agent en démonstration)" : ""}.</p>
          </div>
        )}

        <Depot eleveId={eleve.id} action={faireRelireCv} titre={ton("Faire relire mon CV", "Faire relire son CV")} quoi="cv" pourEleve={pourEleve} />
        {sg.cv?.contenu.cv && <Relecture titre={`Relecture du CV du ${le(sg.cv.createdAt)}`} r={sg.cv.contenu.cv} nom={nom} simule={sg.cv.simule} />}

        <details>
          <summary className="btn small">{ton("Préparer ma lettre de motivation", "Préparer sa lettre de motivation")}</summary>
          <form action={guiderMaLettre} className="stack" style={{ marginTop: 8 }}>
            <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
            <p className="sub" style={{ margin: 0 }}>{ton("Réponds à ces questions avec tes mots : ", "")}{nom} propose l&apos;ordre des idées et des conseils, sans écrire la lettre à {ton("ta", "sa")} place.</p>
            <label className="f">À quelle entreprise {ton("écris-tu", "écrit-il")} ?<input name="entreprise" maxLength={200} /></label>
            <label className="f">Pourquoi cette entreprise ?<textarea name="pourquoi" rows={2} maxLength={1000} /></label>
            <label className="f">Ce que {ton("tu sais", "l'élève sait")} déjà faire<textarea name="savoirFaire" rows={2} maxLength={1000} /></label>
            <label className="f">Ce que {ton("tu veux", "l'élève veut")} apprendre pendant le stage<textarea name="apprendre" rows={2} maxLength={1000} /></label>
            <button className="btn small primary">Me guider</button>
          </form>
        </details>
        {sg.guide?.contenu.guide && (
          <div className="stack" id="guide-lettre">
            <b>Guide pour la lettre ({le(sg.guide.createdAt)})</b>
            <ol style={{ margin: 0, paddingLeft: 18 }}>{sg.guide.contenu.guide.plan.map((x) => <li key={x}>{nomme(x)}</li>)}</ol>
            {sg.guide.contenu.guide.conseils.length > 0 && <ul className="sub" style={{ margin: 0 }}>{sg.guide.contenu.guide.conseils.map((x) => <li key={x}>{x}</li>)}</ul>}
            {sg.guide.contenu.guide.questions.length > 0 && <p className="note" style={{ margin: 0 }}>Pour aller plus loin : {sg.guide.contenu.guide.questions.join(" · ")}</p>}
          </div>
        )}
        <Depot eleveId={eleve.id} action={faireRelireLettre} titre={ton("Faire relire ma lettre", "Faire relire sa lettre")} quoi="lettre" pourEleve={pourEleve} />
        {sg.lettre?.contenu.cv && <Relecture titre={`Relecture de la lettre du ${le(sg.lettre.createdAt)}`} r={sg.lettre.contenu.cv} nom={nom} simule={sg.lettre.simule} />}

        <details>
          <summary className="btn small">{ton("Préparer mon appel et mon entretien", "Préparer son appel et son entretien")}</summary>
          <form action={preparerEntretien} className="actions" style={{ marginTop: 8 }}>
            <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
            <label className="f" style={{ flex: 1 }}>Entreprise à appeler<input name="entreprise" maxLength={200} placeholder="Ex. Atlas Sûreté" /></label>
            <button className="btn small primary">Préparer la fiche</button>
          </form>
        </details>
        {sg.fiche?.contenu.fiche && (
          <div className="stack" id="fiche-entretien">
            <b>Appel et entretien : {sg.fiche.contenu.fiche.entreprise}</b>
            <span className="sub">Au téléphone</span>
            <ol style={{ margin: 0, paddingLeft: 18 }}>{sg.fiche.contenu.fiche.telephone.map((x) => <li key={x}>{nomme(x)}</li>)}</ol>
            <span className="sub">Questions possibles en entretien</span>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{sg.fiche.contenu.fiche.questions.map((q) => <li key={q.question}><b>{q.question}</b><br /><span className="sub">{q.piste}</span></li>)}</ul>
          </div>
        )}
        <div className="stack" id="entrainement">
          <b>S&apos;entraîner à l&apos;entretien</b>
          <p className="sub" style={{ margin: 0 }}>{nom} joue le tuteur : il pose des questions, {ton("tu réponds", "l'élève répond")}, puis il donne ses conseils. {oral ? "Par écrit ou à l'oral, au choix." : "Par écrit."}</p>
          {entretien?.echanges?.map((x, i) => <p key={i} className={x.role === "tuteur" ? "note" : "sub"} style={{ margin: 0 }}><b>{x.role === "tuteur" ? "Tuteur" : ton("Toi", "Élève")} :</b> {nomme(x.texte)}</p>)}
          {entretien?.bilan && <p className="msg ok" style={{ margin: 0 }}><b>Bilan :</b> {nomme(entretien.bilan)}</p>}
          {derniere?.role === "tuteur" && !entretien?.bilan ? (
            <form action={sEntrainer} className="stack">
              <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
              <label className="f" htmlFor={`rep-${eleve.id}`}>{ton("Ta réponse", "Réponse")}<textarea id={`rep-${eleve.id}`} name="reponse" rows={3} maxLength={1200} /></label>
              {oral && <Dictee cible={`rep-${eleve.id}`} />}
              <div className="actions"><button className="btn small primary">Répondre</button></div>
            </form>
          ) : (
            <form action={sEntrainer}><ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} /><input type="hidden" name="quoi" value="commencer" /><button className="btn small">{entretien ? "Recommencer l'entraînement" : "Commencer l'entraînement"}</button></form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Coller le texte, ou déposer le document (PDF ou photo), lu sur le serveur de Cap PFMP. */
function Depot({ eleveId, action, titre, quoi, pourEleve }: { eleveId: string; action: (fd: FormData) => Promise<void>; titre: string; quoi: "cv" | "lettre"; pourEleve: boolean }) {
  return (
    <details>
      <summary className="btn small">{titre}</summary>
      <form action={action} className="stack" style={{ marginTop: 8 }}>
        <ChampRetour /><input type="hidden" name="eleveId" value={eleveId} />
        <label className="f" htmlFor={`${quoi}-f-${eleveId}`}>{pourEleve ? `Dépose ${quoi === "cv" ? "ton CV" : "ta lettre"} (PDF ou photo)` : "Document (PDF ou photo)"}<input id={`${quoi}-f-${eleveId}`} name="fichier" type="file" accept="application/pdf,image/jpeg,image/png" /></label>
        <label className="f" htmlFor={`${quoi}-${eleveId}`}>{pourEleve ? "ou copie ici le texte" : "ou le texte"}<textarea id={`${quoi}-${eleveId}`} name="texte" rows={8} maxLength={8000} /></label>
        <p className="sub" style={{ margin: 0 }}>Le document est lu sur le serveur de Cap PFMP ; le nom, l&apos;adresse, le téléphone et le mail sont retirés avant la relecture.</p>
        <button className="btn small primary">Relire</button>
      </form>
    </details>
  );
}

function Relecture({ titre, r, nom, simule }: { titre: string; r: { pointsForts: string[]; aAmeliorer: string[]; conseil: string }; nom: string; simule: boolean }) {
  return (
    <div className="stack">
      <b>{titre}</b>
      <div className="grid2">
        <div><span className="sub">Points forts</span><ul style={{ margin: 0, paddingLeft: 18 }}>{r.pointsForts.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><span className="sub">À améliorer</span><ul style={{ margin: 0, paddingLeft: 18 }}>{r.aAmeliorer.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      <p className="note" style={{ margin: 0 }}>{r.conseil}</p>
      <p className="sub" style={{ margin: 0 }}>Préparé avec {nom}{simule ? " (texte d'exemple, agent en démonstration)" : ""}.</p>
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
