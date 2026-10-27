import { aujourdhui, dateLongue } from "@/lib/dates";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { texteCreneau, texteMode, visitePourRendezVous } from "@/lib/rendez-vous";
import { Formulaire } from "@/components/Formulaire";
import { LienVisio } from "@/components/LienVisio";
import { aucunCreneau, prendreRendezVous } from "./actions";

export const metadata = { title: "Rendez-vous pour la visite de stage" };

function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="login">
      <div className="panel pad section" style={{ width: "min(560px, 100%)" }}>
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>{titre}</h1>
        {children}
      </div>
    </main>
  );
}

/** Page publique : l'entreprise prend rendez-vous pour la visite de stage avec son lien personnel, sans compte. */
export default async function RendezVous({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "rendezvous");
  const etab = lien ? await etablissementDuLien(lien.etablissementId) : null;
  const x = lien?.stageId && etab ? await visitePourRendezVous(etab.id, lien.stageId) : null;
  if (!lien || !etab || !x) return <Message titre="Lien introuvable"><p className="sub">Ce lien n&apos;est pas valable. Vérifiez qu&apos;il a été copié en entier, ou répondez simplement au message du professeur.</p></Message>;
  const prof = x.visiteur ? `${x.visiteur.prenom} ${x.visiteur.nom}` : "le professeur";
  if (x.v.heure && x.v.date) {
    return (
      <Message titre="Rendez-vous confirmé">
        <p className="sub" style={{ margin: 0 }}>
          Visite de stage de <b>{x.e.prenom} {x.e.nom}</b> avec {prof} : le {dateLongue(x.v.date)} à {x.v.heure.replace(":", "h")}, <b>{texteMode(x.v.mode)}</b>.
        </p>
        {x.v.mode === "distanciel" && x.v.lienDistance && <p className="note" style={{ margin: 0 }}>Pour la visite à distance : <LienVisio valeur={x.v.lienDistance} /></p>}
        <p className="sub" style={{ margin: 0 }}>Une confirmation vous a été envoyée. Pour changer de date, répondez au message du professeur.</p>
      </Message>
    );
  }
  if (lien.utiliseLe || lien.expireLe < new Date()) return <Message titre="Lien expiré"><p className="sub">Ce lien personnel n&apos;est plus valable. Utilisez le lien du dernier message reçu du professeur, ou répondez-lui simplement.</p></Message>;
  const creneaux = (x.v.creneauxProposes ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c[0] >= aujourdhui());
  if (!creneaux.length) return <Message titre="Plus de créneau disponible"><p className="sub">Les créneaux proposés sont passés. Répondez au message du professeur pour en convenir d&apos;un autre.</p></Message>;
  const auChoix = x.v.modesProposes === "les2";
  return (
    <Message titre="Visite de stage : votre rendez-vous">
      <p className="sub" style={{ margin: 0 }}>
        {prof}, professeur de <b>{x.e.prenom} {x.e.nom}</b> ({etab.nom}), propose la visite de stage chez {x.ent.nom}
        {auChoix ? " : sur place ou à distance, à votre choix." : `, ${texteMode(x.v.mode)}.`}
      </p>
      <Formulaire action={prendreRendezVous} bouton="Confirmer le rendez-vous">
        <input type="hidden" name="jeton" value={jeton} />
        <fieldset className="choices" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sub">Choisissez un créneau</legend>
          {creneaux.map(({ c, i }) => (
            <label key={i} className="choice"><input type="radio" name="creneau" value={i} required /> <span>{texteCreneau(c)}</span></label>
          ))}
        </fieldset>
        {auChoix && (
          <fieldset className="choices" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sub">Forme de la visite</legend>
            <label className="choice"><input type="radio" name="mode" value="presentiel" required /> <span><b>Sur place</b>, dans l&apos;entreprise</span></label>
            <label className="choice"><input type="radio" name="mode" value="distanciel" /> <span><b>À distance</b>, en visio ou par téléphone</span></label>
          </fieldset>
        )}
        <label className="f" htmlFor="rdv-com">Un message pour le professeur (facultatif)<textarea id="rdv-com" name="commentaire" rows={2} maxLength={500} placeholder="Ex. demandez le poste de garde à l'accueil" /></label>
      </Formulaire>
      <details>
        <summary className="btn small">Aucun créneau ne me convient</summary>
        <Formulaire action={aucunCreneau} bouton="Envoyer au professeur" boutonClasse="btn small">
          <input type="hidden" name="jeton" value={jeton} />
          <label className="f" htmlFor="rdv-dispo">Vos disponibilités<textarea id="rdv-dispo" name="commentaire" rows={2} maxLength={500} required placeholder="Ex. le jeudi après-midi" /></label>
        </Formulaire>
      </details>
      <p className="sub" style={{ margin: 0 }}>Ce lien vous est réservé ; il est valable jusqu&apos;au {dateLongue(lien.expireLe.toISOString().slice(0, 10))}.</p>
    </Message>
  );
}
