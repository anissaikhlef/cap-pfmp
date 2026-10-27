import { chargerConventionEtab } from "@/lib/convention";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { modelesAutorises } from "@/lib/signature";
import { libelleSignataire, VERBE_SIGNATURE } from "@/lib/regles";
import { dateLongue } from "@/lib/dates";
import { ContenuConvention } from "@/components/ContenuConvention";
import { ChoixSignature } from "@/components/ChoixSignature";
import { ChampsACompleter } from "@/components/ChampsACompleter";
import { modeleDeLaConvention, utiliseLePdf } from "@/lib/modeles-documents";
import { Formulaire } from "@/components/Formulaire";
import { signerParLien } from "./actions";

export const metadata = { title: "Signer la convention" };

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

/** Page publique : signer une convention avec un lien personnel, sans compte. */
export default async function SignerParLien({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "signature");
  const etab = lien ? await etablissementDuLien(lien.etablissementId) : null;
  const cv = lien?.stageId && etab ? await chargerConventionEtab(etab, lien.stageId) : null;
  if (!lien || !etab || !cv || !lien.qualite) return <Message titre="Lien introuvable" texte="Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier, ou demandez un nouveau lien au lycée." />;
  const sig = cv.s.signatures[lien.qualite];
  if (sig) return <Message titre="Merci, la convention est signée" texte={`Votre signature (${libelleSignataire(lien.qualite).toLowerCase()}) a été enregistrée le ${dateLongue(sig.le.slice(0, 10))}. Vous pouvez fermer cette page.`} />;
  if (lien.utiliseLe || lien.expireLe < new Date()) return <Message titre="Lien expiré" texte={`Ce lien personnel n'est plus valable. Demandez-en un nouveau à ${etab.nom}.`} />;
  if (etab.reglages.signature === "papier") return <Message titre="Signature sur papier" texte={`${etab.nom} fait signer les conventions sur papier.`} />;
  const pdfDuLycee = utiliseLePdf(await modeleDeLaConvention(etab, cv));
  const nomPropose = lien.qualite === "tuteur" ? cv.s.tuteur?.nom ?? "" : lien.qualite === "entreprise" ? cv.ent.representantNom ?? "" : lien.qualite === "eleve" ? `${cv.e.prenom} ${cv.e.nom}` : "";
  return (
    <main className="convention">
      <p className="note noprint">
        Lien personnel envoyé à {lien.destinataire}, valable jusqu&apos;au {dateLongue(lien.expireLe.toISOString().slice(0, 10))}.
        Vous signez en tant que <b>{libelleSignataire(lien.qualite).toLowerCase()}</b>. Lisez la convention, puis signez en bas de la page.
      </p>
      {pdfDuLycee ? (
        <div className="panel pad section">
          <h1>Convention de stage</h1>
          <p className="sub" style={{ margin: 0 }}>
            Stage de <b>{cv.e.prenom} {cv.e.nom}</b> ({cv.c.libelle}) chez {cv.ent.nom}, du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)}.
            {" "}{etab.nom} utilise son propre modèle de convention : lisez-la en entier avant de signer.
          </p>
          <div className="actions"><a className="btn primary" href={`/signer/${jeton}/pdf`} target="_blank" rel="noopener">Lire la convention (PDF)</a></div>
        </div>
      ) : <ContenuConvention etab={etab} cv={cv} />}
      <div className="panel pad section noprint" style={{ marginTop: 20 }} id="signer">
        <h2>Votre signature</h2>
        <Formulaire action={signerParLien} bouton={VERBE_SIGNATURE[lien.qualite]}>
          <input type="hidden" name="jeton" value={jeton} />
          <label className="f" htmlFor="sl-nom">Votre prénom et votre nom<input id="sl-nom" name="nom" defaultValue={nomPropose} autoComplete="name" required /></label>
          <ChampsACompleter etab={etab} cv={cv} qualite={lien.qualite} />
          <ChoixSignature modeles={modelesAutorises(etab.reglages)} />
        </Formulaire>
        <p className="sub" style={{ margin: 0 }}>Votre signature est enregistrée avec la date, votre nom et ce lien personnel. Le lycée et les autres signataires en sont informés.</p>
      </div>
    </main>
  );
}
