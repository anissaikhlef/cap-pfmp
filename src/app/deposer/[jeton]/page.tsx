import { chargerConventionEtab } from "@/lib/convention";
import { documentsManquants } from "@/lib/entreprises-accueil";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { dateLongue } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { FormulaireAttestation, FormulaireLivret, ResumeAttestation, ResumeLivret } from "@/components/fin-de-stage";
import { etatAttestation } from "@/lib/attestation";
import { etatLivret } from "@/lib/livret";
import { modelesAutorises } from "@/lib/signature";
import { deposerParLien, remplirAttestationParLien, remplirLivretParLien } from "./actions";

export const metadata = { title: "Documents de fin de stage" };

const LIBELLES = { attestation: "Attestation de stage", livret: "Livret de compétences" } as const;

function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <main className="login">
      <div className="panel pad section">
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>{titre}</h1>
        <p className="sub">{texte}</p>
      </div>
    </main>
  );
}

/**
 * Page publique : avec son lien personnel, sans compte, l'entreprise remplit et signe l'attestation en ligne
 * (ou la dépose signée), et dépose le livret.
 */
export default async function DeposerParLien({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "documents");
  const etab = lien ? await etablissementDuLien(lien.etablissementId) : null;
  const cv = lien?.stageId && etab ? await chargerConventionEtab(etab, lien.stageId) : null;
  if (!lien || !etab || !cv) return <Message titre="Lien introuvable" texte="Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier, ou répondez simplement au mail du lycée avec les documents." />;
  const manquent = await documentsManquants(cv.s.id);
  const recus = 2 - manquent.length;
  if (lien.utiliseLe || !manquent.length) return <Message titre="Merci, les documents sont transmis" texte={`${etab.nom} a bien reçu ${recus > 1 ? "les documents" : "le document"} de fin de stage de ${cv.e.prenom} ${cv.e.nom}.${manquent.length ? ` Il manque encore : ${manquent.map((t) => LIBELLES[t].toLowerCase()).join(" et ")} ; vous recevrez un nouveau lien.` : ""}`} />;
  if (lien.expireLe < new Date()) return <Message titre="Lien expiré" texte={`Ce lien personnel n'est plus valable. Répondez simplement au mail de ${etab.nom} avec les documents.`} />;
  const att = await etatAttestation(etab, cv);
  const liv = await etatLivret(etab, cv);
  const attEnLigne = att.aRemplir && att.ouverte;
  const livEnLigne = liv.aRemplir && liv.ouverte;
  return (
    <main className="login">
      <div className="panel pad section" style={{ width: "min(560px, 100%)" }}>
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>Documents de fin de stage</h1>
        <p className="sub" style={{ margin: 0 }}>
          Stage de <b>{cv.e.prenom} {cv.e.nom}</b> ({cv.c.libelle}) chez {cv.ent.nom}, du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)}.
          Les documents arrivent directement au lycée ({etab.nom}).
        </p>
        {att.remplie && <div className="msg ok" style={{ margin: 0 }}>Attestation de stage signée en ligne : merci.</div>}
        {att.remplie && <ResumeAttestation att={att.remplie} />}
        {liv.remplie && <div className="msg ok" style={{ margin: 0 }}>Livret de compétences signé en ligne : merci.</div>}
        {liv.remplie && <ResumeLivret livret={liv.remplie} />}
        {attEnLigne && (
          <section className="stack" aria-labelledby="titre-attestation">
            <h2 id="titre-attestation">Attestation de stage, en ligne</h2>
            <p className="sub" style={{ margin: 0 }}>Remplissez-la avec {cv.e.prenom} si possible, puis signez : rien à imprimer ni à scanner.</p>
            <FormulaireAttestation action={remplirAttestationParLien} cv={cv} etat={att} cache={{ jeton }} modeles={modelesAutorises(etab.reglages)} rempliePar="tuteur_eleve" />
          </section>
        )}
        {livEnLigne && (
          <section className="stack" aria-labelledby="titre-livret">
            <h2 id="titre-livret">Livret de compétences, en ligne</h2>
            <p className="sub" style={{ margin: 0 }}>Évaluez {cv.e.prenom}, avec lui ou elle si possible, à l&apos;aide de son carnet de bord, puis signez.</p>
            <FormulaireLivret action={remplirLivretParLien} cv={cv} etat={liv} cache={{ jeton }} modeles={modelesAutorises(etab.reglages)} rempliePar="tuteur_eleve" />
          </section>
        )}
        {(attEnLigne || livEnLigne) && <h2>Ou déposer les documents signés</h2>}
        <p className="sub" style={{ margin: 0 }}>Déposez les documents complétés et signés, en PDF ou en photo.</p>
        <Formulaire action={deposerParLien} bouton="Envoyer les documents">
          <input type="hidden" name="jeton" value={jeton} />
          {manquent.map((t) => (
            <label key={t} className="f" htmlFor={`dl-${t}`}>{LIBELLES[t]}
              <input id={`dl-${t}`} name={t} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,.heic" />
            </label>
          ))}
        </Formulaire>
        <p className="sub" style={{ margin: 0 }}>Ce lien vous est réservé et ne sert qu&apos;une fois.</p>
      </div>
    </main>
  );
}
