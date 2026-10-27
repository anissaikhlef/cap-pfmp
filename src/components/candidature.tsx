import type { Contexte } from "@/lib/auth";
import { schema } from "@/db";
import { suitLEleve } from "@/lib/acces";
import { candidaturesDe, candidaturesEnvoyees, LIBELLES_CANDIDATURE } from "@/lib/candidatures";
import { compatibleAvecLaClasse, entreprisesDuLycee, dossierStage } from "@/lib/stages";
import { dateCourte, dateLongue } from "@/lib/dates";
import { Formulaire } from "./Formulaire";
import { Pill } from "./ui";
import { deposerCandidature, envoyerCandidature, relireCandidature } from "@/app/(app)/eleves/candidature-actions";

type Document = typeof schema.documents.$inferSelect;

function EtatCandidature({ d }: { d?: Document }) {
  if (!d) return <Pill ton="muted">Pas encore déposé</Pill>;
  if (d.statut === "valide") return <Pill ton="ok">Relu : c&apos;est bon</Pill>;
  if (d.statut === "refuse") return <Pill ton="warn">À améliorer</Pill>;
  return <Pill ton="info">Déposé, pas encore relu</Pill>;
}

/**
 * CV et lettre de motivation de l'élève. L'élève les dépose et les envoie aux entreprises depuis l'application ;
 * son professeur référent (ou la gestion des PFMP) les relit : relecture conseillée, jamais bloquante.
 */
export async function BlocCandidature({ ctx, eleve }: { ctx: Contexte; eleve: typeof schema.eleves.$inferSelect }) {
  const estEleve = eleve.userId === ctx.user.id;
  const relecteur = !estEleve && (await suitLEleve(ctx, eleve));
  if (!estEleve && !relecteur) return null;
  const docs = (await candidaturesDe([eleve.id])).get(eleve.id) ?? {};
  const envois = await candidaturesEnvoyees(eleve.id);
  const d = estEleve ? await dossierStage(ctx, eleve) : null;
  // Seulement les entreprises où le stage serait permis par la règle de la classe (secteur, dominante)
  const entreprises = d ? (await entreprisesDuLycee(ctx)).filter((x) => !x.ecarteeLe && compatibleAvecLaClasse(x, d)) : [];
  const messageParDefaut = d
    ? `Madame, Monsieur,\n\nÉlève${d.classe ? ` en ${d.classe.libelle}${d.classe.filiere ? ` (${d.classe.filiere})` : ""}` : ""} au ${ctx.etab.nom}, je recherche un stage${d.periode ? ` du ${dateLongue(d.periode.debut)} au ${dateLongue(d.periode.fin)}` : ""}. Vous trouverez ci-joint mon CV et ma lettre de motivation.\nJe reste à votre disposition pour un entretien.\n\nCordialement,\n${eleve.prenom} ${eleve.nom}`
    : "";
  return (
    <div className="panel pad section" id="candidature">
      <h2>{estEleve ? "Mon CV et ma lettre de motivation" : "CV et lettre de motivation"}</h2>
      <p className="sub" style={{ margin: 0 }}>
        {estEleve
          ? "Déposez-les ici : votre professeur référent peut les relire et vous conseiller. Vous pouvez les envoyer aux entreprises quand vous voulez."
          : "Déposés par l'élève. Votre relecture l'aide à s'améliorer, mais ne bloque pas ses envois."}
      </p>
      <div className="grid2">
        {(["cv", "lettre"] as const).map((t) => {
          const doc = docs[t];
          return (
            <div key={t} className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}><b>{LIBELLES_CANDIDATURE[t]}</b><EtatCandidature d={doc} /></div>
              {doc && <a href={`/fichiers/${doc.id}`} target="_blank" rel="noopener" className="sub">{doc.nomFichier} · déposé le {dateCourte(doc.deposeLe.toISOString().slice(0, 10))}</a>}
              {doc?.statut === "refuse" && doc.motifRefus && <p className="note" style={{ margin: 0 }}>{doc.motifRefus}</p>}
              {doc?.statut === "valide" && doc.motifRefus && <p className="sub" style={{ margin: 0 }}>« {doc.motifRefus} »</p>}
              {relecteur && doc && (
                <details>
                  <summary className="btn small">Relire</summary>
                  <Formulaire action={relireCandidature} bouton="Enregistrer la relecture" boutonClasse="btn small primary">
                    <input type="hidden" name="documentId" value={doc.id} />
                    <div className="choices" role="radiogroup" aria-label="Avis" style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      <label className="choice"><input type="radio" name="avis" value="bon" defaultChecked /> C&apos;est bon</label>
                      <label className="choice"><input type="radio" name="avis" value="ameliorer" /> À améliorer</label>
                    </div>
                    <label className="f" htmlFor={`rc-${doc.id}`}>Commentaire pour l&apos;élève<textarea id={`rc-${doc.id}`} name="commentaire" rows={3} maxLength={1000} placeholder="Ex. ajoutez vos qualifications SST et SSIAP, corrigez l'orthographe du premier paragraphe" /></label>
                  </Formulaire>
                </details>
              )}
              <Formulaire action={deposerCandidature} className="actions" bouton={doc ? "Remplacer" : "Déposer"} boutonClasse="btn small">
                <input type="hidden" name="eleveId" value={eleve.id} />
                <input type="hidden" name="type" value={t} />
                <label className="f" htmlFor={`cand-${t}`} style={{ flex: 1, minWidth: 180 }}>
                  <span className="vh">Fichier : {LIBELLES_CANDIDATURE[t]}</span>
                  <input id={`cand-${t}`} name="fichier" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,.heic" required />
                </label>
              </Formulaire>
            </div>
          );
        })}
      </div>
      {estEleve && (
        <details>
          <summary className="btn small primary">Envoyer ma candidature à une entreprise</summary>
          <Formulaire action={envoyerCandidature} bouton="Envoyer la candidature">
            <input type="hidden" name="eleveId" value={eleve.id} />
            <label className="f" htmlFor="ca-ent">Entreprise de l&apos;annuaire du lycée
              <select id="ca-ent" name="entrepriseId" defaultValue="">
                <option value="">— Une autre entreprise (indiquez-la ci-dessous) —</option>
                {entreprises.map((x) => <option key={x.id} value={x.id}>{x.nom}{x.ville ? ` (${x.ville})` : ""}{x.email || x.representantEmail ? "" : " · pas d'adresse e-mail"}</option>)}
              </select>
            </label>
            <div className="grid2">
              <label className="f" htmlFor="ca-nom">Autre entreprise : nom<input id="ca-nom" name="autreNom" maxLength={120} /></label>
              <label className="f" htmlFor="ca-email">Adresse e-mail de l&apos;entreprise<input id="ca-email" name="autreEmail" type="email" placeholder="Si elle n'est pas dans l'annuaire" /></label>
            </div>
            <label className="f" htmlFor="ca-message">Votre message<textarea id="ca-message" name="message" rows={8} defaultValue={messageParDefaut} maxLength={3000} /></label>
            <div className="actions">
              <label className="check"><input type="checkbox" name="joindre_cv" defaultChecked={!!docs.cv} disabled={!docs.cv} /> Joindre mon CV</label>
              <label className="check"><input type="checkbox" name="joindre_lettre" defaultChecked={!!docs.lettre} disabled={!docs.lettre} /> Joindre ma lettre de motivation</label>
            </div>
            {(docs.cv?.statut === "a_verifier" || docs.lettre?.statut === "a_verifier") && <p className="sub" style={{ margin: 0 }}>Conseil : demandez à votre professeur référent de relire vos documents avant de les envoyer.</p>}
          </Formulaire>
        </details>
      )}
      {envois.length > 0 && (
        <div className="section">
          <h3>Candidatures envoyées</h3>
          <div className="panel rows">
            {envois.map((m) => (
              <div key={m.id} className="row">
                <div className="main"><div className="name">{m.destinataire}</div><div className="meta">Envoyée le {dateCourte(m.createdAt.toISOString().slice(0, 10))} · {(m.piecesJointes ?? []).length} pièce(s) jointe(s)</div></div>
                <Pill ton={m.statut === "envoye" ? "ok" : "muted"}>{m.statut === "simule" ? "Envoi simulé" : m.statut === "envoye" ? "Envoyée" : "Erreur"}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
