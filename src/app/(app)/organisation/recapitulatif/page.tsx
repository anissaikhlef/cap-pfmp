import Link from "next/link";
import { contexte } from "@/lib/auth";
import type { CaseRecap } from "@/db/schema";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { modeleRecapitulatif } from "@/lib/recapitulatif";
import { casesManquantes } from "@/lib/xlsx-modele";
import { corrigerStructure, deposerModeleRecap, enregistrerAcademie, retirerModeleRecap } from "./actions";

export const metadata = { title: "Attestation récapitulative" };

const CASES: [CaseRecap, string, string][] = [
  ["titre", "Titre (le diplôme)", "remplacé par la formation de la classe"],
  ["academie", "Académie", ""],
  ["session", "Session", "l'année de l'examen"],
  ["etablissement", "Établissement", ""],
  ["nom", "Nom du candidat", ""],
  ["prenom", "Prénom du candidat", ""],
  ["numero", "N° de candidat", ""],
  ["duree", "Durée du cycle", "« 2 ans », « 3 ans »"],
  ["derogation", "Dérogation", "OUI ou NON"],
  ["visa", "Visa du chef d'établissement", "une croix, seulement si la direction a visé"],
];

/**
 * Le fichier Excel de l'académie pour l'attestation récapitulative des PFMP (décision d'Anissa : chaque lycée dépose
 * le modèle de son académie). Cap PFMP repère les cases d'après leurs intitulés ; le lycée vérifie et corrige.
 */
export default async function ModeleRecapitulatif() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const m = await modeleRecapitulatif(ctx.etab.id);
  const s = m?.structure;
  const manque = s ? casesManquantes(s) : [];
  return (
    <>
      <Entete titre="Attestation récapitulative des PFMP" sous="Pour les classes d'examen : le fichier Excel que votre académie demande, rempli par Cap PFMP avec les PFMP effectuées et attestées de chaque élève, sur tout son cycle. Déposez le fichier de votre académie : Cap PFMP reconnaît ses cases et ne touche ni à sa mise en page, ni à ses formules.">
        <div className="actions">
          <Link className="btn" href="/organisation">Retour à l&apos;organisation</Link>
          <Link className="btn" href="/recapitulatif">Préparer l&apos;attestation d&apos;une classe</Link>
        </div>
      </Entete>

      <div className="grid2">
        <div className="panel pad section" id="fichier">
          <h2>Fichier de l&apos;académie</h2>
          {m ? (
            <p className="sub" style={{ margin: 0 }}>
              <b>{m.nom}</b>, déposé le {m.deposeLe.toLocaleDateString("fr-FR")}. <a href="/organisation/recapitulatif/modele">Télécharger le fichier vide</a>
            </p>
          ) : <p className="note">Aucun fichier déposé : seule la version Cap PFMP (Excel et PDF) est proposée pour l&apos;instant.</p>}
          <Formulaire action={deposerModeleRecap} className="actions" bouton={m ? "Remplacer le fichier" : "Déposer le fichier"} boutonClasse="btn small primary">
            <label className="f" htmlFor="mr-fichier" style={{ flex: 1, minWidth: 200 }}><span className="vh">Fichier Excel de l&apos;académie</span>
              <input id="mr-fichier" name="fichier" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
            </label>
          </Formulaire>
          <p className="sub" style={{ margin: 0 }}>Format Excel .xlsx, tel que l&apos;académie l&apos;envoie (sans macros). Un fichier .xls ancien : ouvrez-le dans Excel et enregistrez-le en .xlsx.</p>
          {m && <Formulaire action={retirerModeleRecap} className="actions" bouton="Retirer le fichier" boutonClasse="btn small danger"><span /></Formulaire>}
        </div>
        <div className="panel pad section" id="academie">
          <h2>Votre académie</h2>
          <p className="sub" style={{ margin: 0 }}>Reportée sur chaque attestation, telle qu&apos;elle figure dans la liste du fichier (ex. VERSAILLES).</p>
          <Formulaire action={enregistrerAcademie} className="actions" bouton="Enregistrer" boutonClasse="btn small" viderApres={false}>
            <label className="f" htmlFor="mr-academie" style={{ flex: 1 }}>Académie<input id="mr-academie" name="academie" defaultValue={ctx.etab.reglages.academie} placeholder="Ex. VERSAILLES" maxLength={60} /></label>
          </Formulaire>
        </div>
      </div>

      {s && (
        <div className="panel pad section" id="cases">
          <h2>Ce que Cap PFMP a reconnu</h2>
          {manque.length
            ? <p className="msg err">Il manque {manque.join(", ")} : indiquez ces cases ci-dessous.</p>
            : <p className="msg ok">Le fichier est prêt : {s.feuillesEleves.length} onglets d&apos;élèves{s.synthese ? `, onglet « ${s.synthese.feuille.trim()} »` : ""}{s.garde ? `, onglet « ${s.garde.feuille.trim()} » (élèves à qui il manque des semaines)` : ""}.</p>}
          <p className="sub">Dans chaque onglet d&apos;élève, Cap PFMP écrit dans ces cases. Une case qui contient une formule de l&apos;académie n&apos;est jamais remplacée : la formule se calcule à l&apos;ouverture du fichier. Corrigez une case si besoin (ex. D6) ; laissez-la vide pour ne rien y écrire.</p>
          <Formulaire action={corrigerStructure} bouton="Enregistrer les cases" boutonClasse="btn small primary" viderApres={false}>
            <div className="grid2">
              {CASES.map(([k, l, aide]) => (
                <label key={k} className="f" htmlFor={`mr-${k}`}>{l}{aide && <span className="sub"> ({aide})</span>}
                  <input id={`mr-${k}`} name={`case_${k}`} defaultValue={s.cases[k] ?? ""} maxLength={8} placeholder="Case, ex. D6" />
                </label>
              ))}
            </div>
            <h3>Tableau des PFMP de chaque élève</h3>
            <div className="actions">
              <label className="f" htmlFor="mr-premiere">Première ligne<input id="mr-premiere" name="lignes_premiere" type="number" min={1} defaultValue={s.lignes?.premiere ?? ""} style={{ width: 90 }} /></label>
              <label className="f" htmlFor="mr-nombre">Nombre de lignes<input id="mr-nombre" name="lignes_nombre" type="number" min={1} defaultValue={s.lignes?.nombre ?? ""} style={{ width: 90 }} /></label>
              <label className="f" htmlFor="mr-debut">Colonne du début<input id="mr-debut" name="lignes_debut" defaultValue={s.lignes?.debut ?? ""} maxLength={3} style={{ width: 70 }} /></label>
              <label className="f" htmlFor="mr-fin">de la fin<input id="mr-fin" name="lignes_fin" defaultValue={s.lignes?.fin ?? ""} maxLength={3} style={{ width: 70 }} /></label>
              <label className="f" htmlFor="mr-entreprise">de l&apos;entreprise<input id="mr-entreprise" name="lignes_entreprise" defaultValue={s.lignes?.entreprise ?? ""} maxLength={3} style={{ width: 70 }} /></label>
              <label className="f" htmlFor="mr-jours">des jours<input id="mr-jours" name="lignes_jours" defaultValue={s.lignes?.jours ?? ""} maxLength={3} style={{ width: 70 }} /></label>
            </div>
            <p className="sub" style={{ margin: 0 }}>Un élève qui a plus de PFMP que de lignes : les dernières sont regroupées sur la dernière ligne, pour que le total reste juste.</p>
          </Formulaire>
        </div>
      )}
    </>
  );
}
