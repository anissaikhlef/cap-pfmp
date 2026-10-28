import { contexte } from "@/lib/auth";
import { profilDe } from "@/lib/aide";
import { attestationPossible, MISSIONS, missionsReussies, QUIZ, REUSSITE_QUIZ } from "@/lib/formation";
import { actionsDEntrainement, lyceeEntrainement } from "@/lib/entrainement";
import { dateLongue } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { entrerEntrainement, quitterEntrainement, remettreAZero, repondreQuiz } from "./actions";

export const metadata = { title: "Formation" };

/**
 * Formation incluse (décisions d'Anissa) : la visite guidée et l'aide « ? », le lycée d'entraînement, les missions,
 * le quiz et l'attestation de prise en main.
 */
export default async function Formation() {
  const ctx = await contexte();
  if (ctx.etab.entrainementDeId) {
    return (
      <>
        <Entete titre="Formation" sous="Vous êtes dans votre lycée d'entraînement." />
        <form action={quitterEntrainement}><button className="btn primary">Revenir à mon lycée</button></form>
      </>
    );
  }
  const profil = profilDe(ctx.user.roles);
  const missions = MISSIONS[profil] ?? [];
  const quiz = QUIZ[profil] ?? [];
  const equipe = missions.length > 0;
  const lycee = equipe ? await lyceeEntrainement(ctx.user.id) : null;
  const reussies = missionsReussies(profil, await actionsDEntrainement(ctx.user.id));
  const possible = attestationPossible(reussies, ctx.user.quizNote);
  return (
    <>
      <Entete titre="Formation" sous="Pour prendre en main Cap PFMP à votre rythme : la visite guidée, un lycée d'entraînement, des missions, un quiz, puis votre attestation." />
      <div className="panel pad section">
        <h2>1. La visite guidée et l&apos;aide</h2>
        <p className="sub" style={{ margin: 0 }}>Le bouton « ? », en haut de chaque page, explique la page et permet de revoir la visite guidée.</p>
      </div>
      {equipe && (
        <div className="panel pad section" id="entrainement">
          <h2>2. Votre lycée d&apos;entraînement</h2>
          <p className="sub" style={{ margin: 0 }}>
            Un lycée rien qu&apos;à vous, avec vos réglages et vos modèles de documents, des élèves et des entreprises fictifs. Essayez tout : aucun vrai message n&apos;en sort.
            Vous pouvez vous y mettre à la place d&apos;un élève, d&apos;un parent ou d&apos;une entreprise.
          </p>
          <div className="actions">
            <form action={entrerEntrainement}><input type="hidden" name="place" value="equipe" /><button className="btn primary">{lycee ? "Entrer dans mon lycée d'entraînement" : "Créer et ouvrir mon lycée d'entraînement"}</button></form>
            {lycee && <form action={remettreAZero}><ChampRetour /><button className="btn">Remettre à zéro</button></form>}
          </div>
        </div>
      )}
      {equipe && (
        <div className="panel pad section" id="missions">
          <h2>3. Les missions</h2>
          <p className="sub" style={{ margin: 0 }}>À faire dans votre lycée d&apos;entraînement : elles sont cochées toutes seules.</p>
          <div className="panel rows">
            {missions.map((m, i) => (
              <div key={m.titre} className="row">
                <div className="main"><div className="name">{m.titre}</div><div className="meta">{m.comment}</div></div>
                <Pill ton={reussies[i] ? "ok" : "muted"}>{reussies[i] ? "Réussie" : "À faire"}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
      {quiz.length > 0 && (
        <div className="panel pad section" id="quiz">
          <h2>4. Le quiz</h2>
          <p className="sub" style={{ margin: 0 }}>{quiz.length} questions ; {REUSSITE_QUIZ} bonnes réponses pour le réussir.{ctx.user.quizNote !== null ? ` Votre meilleure note : ${ctx.user.quizNote} sur ${quiz.length}${ctx.user.quizLe ? `, le ${dateLongue(ctx.user.quizLe.toISOString().slice(0, 10))}` : ""}.` : ""}</p>
          <Formulaire action={repondreQuiz} bouton="Valider mes réponses">
            {quiz.map((q, i) => (
              <fieldset key={i} className="choices" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend><b>{i + 1}. {q.question}</b></legend>
                {q.choix.map((c, j) => <label key={j} className="choice"><input type="radio" name={`q_${i}`} value={j} required /> <span>{c}</span></label>)}
              </fieldset>
            ))}
          </Formulaire>
        </div>
      )}
      {equipe && (
        <div className="panel pad section" id="attestation">
          <h2>5. Votre attestation de prise en main</h2>
          {possible
            ? <p style={{ margin: 0 }}><a className="btn primary" href="/formation/attestation" target="_blank" rel="noopener">Ouvrir mon attestation (PDF)</a></p>
            : <p className="sub" style={{ margin: 0 }}>Elle est prête dès que toutes les missions et le quiz sont réussis.</p>}
        </div>
      )}
    </>
  );
}
