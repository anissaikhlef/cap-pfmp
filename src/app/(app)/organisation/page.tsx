import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { adresseDuSite } from "@/lib/liens";
import { ajouterDominante, enregistrerOrganisation, supprimerDominante } from "./actions";

export const metadata = { title: "Organisation" };

function Choix({ nom, valeur, options }: { nom: string; valeur: string; options: [string, string, string?][] }) {
  return (
    <div className="choices" role="radiogroup">
      {options.map(([v, l, aide]) => (
        <label key={v} className="choice">
          <input type="radio" name={nom} value={v} defaultChecked={valeur === v} />
          <span><b>{l}</b>{aide && <><br /><span className="sub">{aide}</span></>}</span>
        </label>
      ))}
    </div>
  );
}

export default async function Organisation() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const r = ctx.etab.reglages;
  const dominantes = await db.select().from(schema.dominantes).where(eq(schema.dominantes.etablissementId, ctx.etab.id)).orderBy(asc(schema.dominantes.libelle));
  const on = (b: boolean) => (b ? "oui" : "non");
  const base = await adresseDuSite();
  return (
    <>
      <Entete titre="Organisation du lycée" sous="Chaque lycée s'organise à sa façon. Ces réglages adaptent les rôles, les validations et les étapes de toute l'application.">
        <Link className="btn" href="/organisation/documents">Modèles de documents</Link>
      </Entete>
      <Formulaire action={enregistrerOrganisation} bouton="Enregistrer l'organisation">
        <div className="panel pad section">
          <h2>Établissement</h2>
          <div className="grid2">
            <label className="f" htmlFor="nom">Nom du lycée<input id="nom" name="nom" defaultValue={ctx.etab.nom} required /></label>
            <label className="f" htmlFor="anneeScolaire">Année scolaire en cours<input id="anneeScolaire" name="anneeScolaire" defaultValue={ctx.etab.anneeScolaire} pattern="\d{4}-\d{4}" required /></label>
          </div>
        </div>
        <div className="panel pad section">
          <h2>Qui organise et suit les PFMP ?</h2>
          <p className="sub">Cette personne valide les documents déposés, relance les familles et les entreprises, et voit le tableau de bord de ses classes.</p>
          <Choix nom="gestion" valeur={r.gestion} options={[
            ["referent", "Le professeur référent de chaque classe", "Chaque référent gère sa classe. La direction voit tout."],
            ["bde", "Le bureau des entreprises", "Les comptes « Gestion des PFMP » gèrent toutes les classes."],
            ["ddfpt", "Le DDFPT", "Les comptes « Gestion des PFMP » gèrent toutes les classes."],
          ]} />
        </div>
        <div className="panel pad section">
          <h2>Qui fait les visites de stage ?</h2>
          <Choix nom="visiteurs" valeur={r.visiteurs} options={[
            ["pro", "Les professeurs de l'enseignement professionnel"],
            ["equipe", "Toute l'équipe pédagogique", "Professeurs d'enseignement général compris."],
          ]} />
        </div>
        <div className="panel pad section">
          <h2>Comment les visites sont-elles réparties ?</h2>
          <Choix nom="repartition" valeur={r.repartition} options={[
            ["heures", "Selon les heures de face à face", "Le nombre de visites de chaque professeur est proposé en proportion de ses heures dans la classe. La gestion le valide, puis chaque professeur choisit lui-même ses lieux de stage."],
            ["auto", "Automatiquement", "L'application attribue chaque visite : elle privilégie le référent, équilibre la charge et regroupe les élèves d'une même entreprise."],
          ]} />
        </div>
        <div className="panel pad section">
          <h2>Comment la convention est-elle signée ?</h2>
          <Choix nom="signature" valeur={r.signature} options={[
            ["papier", "Sur papier, puis déposée", "L'élève ou sa famille dépose le scan signé par tous."],
            ["enligne", "En ligne", "Chaque partie signe dans l'application (prestataire de signature à brancher)."],
            ["les2", "Les deux possibles"],
          ]} />
          <b>Signature en ligne</b>
          <Choix nom="signatureModele" valeur={r.signatureModele} options={[
            ["simple", "Signature simple", "La personne coche « J'ai lu la convention » puis clique sur « Je signe »."],
            ["dessinee", "Signature dessinée", "La personne dessine sa signature au doigt sur l'écran ; elle apparaît sur la convention."],
            ["les2", "Les deux, au choix de chaque signataire"],
          ]} />
          <b>Qui signe en dernier, après avoir vérifié la convention ?</b>
          <Choix nom="dernierSignataire" valeur={r.dernierSignataire} options={[
            ["professeur", "Le professeur référent", "La direction peut signer à tout moment."],
            ["direction", "La direction", "Le professeur référent peut signer à tout moment."],
          ]} />
          <p className="sub" style={{ margin: 0 }}>Celui qui signe en dernier ne peut le faire que lorsque toutes les autres parties ont signé et que le stage respecte les règles.</p>
        </div>
        <div className="panel pad section">
          <h2>Visites</h2>
          <div className="grid2">
            <div className="section"><b>Ordre de mission avant chaque visite</b>
              <Choix nom="ordreMission" valeur={on(r.ordreMission)} options={[["oui", "Oui, signé par la direction"], ["non", "Non"]]} /></div>
            <div className="section"><b>Compte rendu après chaque visite</b>
              <Choix nom="compteRendu" valeur={on(r.compteRendu)} options={[["oui", "Oui, rangé dans le dossier"], ["non", "Non"]]} /></div>
          </div>
        </div>
        <div className="panel pad section">
          <h2>Calendrier des PFMP</h2>
          <p className="sub">Toutes les périodes de toutes les classes, visibles par tous les comptes du lycée ; seuls le DDFPT et la direction en fixent les dates.</p>
          <Choix nom="calendrierPublic" valeur={on(r.calendrierPublic)} options={[
            ["non", "Réservé aux comptes du lycée"],
            ["oui", "Aussi consultable sans compte, avec un lien public", "Pour le site du lycée ou les mails aux entreprises. Aucun nom d'élève n'y figure."],
          ]} />
          {r.calendrierPublic && <p className="sub" style={{ margin: 0 }}>Lien public : <a href={`/pfmp/${ctx.etab.id}`}>{`${base}/pfmp/${ctx.etab.id}`}</a></p>}
        </div>
        <div className="panel pad section">
          <h2>Règles de stage</h2>
          <p className="sub">Vérifiées automatiquement pour chaque stage. La règle de structure (privé ou dominante) se règle par classe.</p>
          <div className="grid3">
            <label className="f" htmlFor="heuresMin">Heures par semaine, minimum<input id="heuresMin" name="heuresMin" type="number" min={0} max={48} step={0.5} defaultValue={r.regles.heuresMin} /></label>
            <label className="f" htmlFor="heuresMax">Heures par semaine, maximum<input id="heuresMax" name="heuresMax" type="number" min={1} max={48} step={0.5} defaultValue={r.regles.heuresMax} /></label>
            <label className="f" htmlFor="joursReposConsecutifs">Jours de repos consécutifs<input id="joursReposConsecutifs" name="joursReposConsecutifs" type="number" min={0} max={3} defaultValue={r.regles.joursReposConsecutifs} /></label>
            <label className="f" htmlFor="nuitDebut">Nuit interdite à partir de<input id="nuitDebut" name="nuitDebut" type="time" defaultValue={r.regles.nuitDebut} /></label>
            <label className="f" htmlFor="nuitFin">jusqu&apos;à<input id="nuitFin" name="nuitFin" type="time" defaultValue={r.regles.nuitFin} /></label>
            <label className="f" htmlFor="dimancheInterdit">Stage le dimanche
              <select id="dimancheInterdit" name="dimancheInterdit" defaultValue={on(r.regles.dimancheInterdit)}><option value="oui">Interdit</option><option value="non">Autorisé</option></select>
            </label>
            <label className="f" htmlFor="reglesMineurs" style={{ gridColumn: "1 / -1" }}>Élèves mineurs (code du travail)
              <select id="reglesMineurs" name="reglesMineurs" defaultValue={on(r.regles.reglesMineurs)}>
                <option value="oui">Contrôler : 8 h par jour, pause après 4 h 30, pas de nuit, repos entre deux journées, dimanche</option>
                <option value="non">Ne pas contrôler</option>
              </select>
            </label>
          </div>
        </div>
        <div className="panel pad section">
          <h2>Relances automatiques</h2>
          <p className="sub">Envoyées chaque matin par mail, avec un lien personnel pour ceux qui n&apos;ont pas de compte. Jamais le samedi ni le dimanche : une relance prévue ce jour-là part le lundi.</p>
          <b>Élèves</b>
          <div className="grid2">
            <label className="f" htmlFor="eleveQuotidien">Rappel chaque jour de ce qui reste à faire (trouver son stage, relancer les entreprises, signer sa convention)
              <select id="eleveQuotidien" name="eleveQuotidien" defaultValue={on(r.relances.eleveQuotidien)}><option value="oui">Oui</option><option value="non">Non</option></select>
            </label>
            <label className="f" htmlFor="eleveRechercheJours">La recherche de stage y figure à partir de (jours avant le début de la période)<input id="eleveRechercheJours" name="eleveRechercheJours" type="number" min={0} max={180} defaultValue={r.relances.eleveRechercheJours} /></label>
          </div>
          <b>Entreprises</b>
          <div className="grid2">
            <label className="f" htmlFor="entrepriseIntervalle">Sans réponse (places, signature, attestation et livret) : un rappel tous les (jours, 0 pour jamais)<input id="entrepriseIntervalle" name="entrepriseIntervalle" type="number" min={0} max={30} defaultValue={r.relances.entrepriseIntervalle} /></label>
            <label className="f" htmlFor="entrepriseMax">Au plus (rappels par demande ; ensuite, le lycée est prévenu pour appeler l&apos;entreprise)<input id="entrepriseMax" name="entrepriseMax" type="number" min={1} max={20} defaultValue={r.relances.entrepriseMax} /></label>
            <label className="f" htmlFor="accueilAvant">Mail d&apos;accueil au tuteur (élève, dates, horaires, professeur à contacter) : jours avant le début du stage, 0 pour aucun<input id="accueilAvant" name="accueilAvant" type="number" min={0} max={30} defaultValue={r.relances.accueilAvant} /></label>
            <label className="f" htmlFor="remerciementApres">Remerciements, avec le lien pour l&apos;attestation et le livret : jours après la fin du stage, 0 pour aucun<input id="remerciementApres" name="remerciementApres" type="number" min={0} max={30} defaultValue={r.relances.remerciementApres} /></label>
          </div>
          <b>Conventions et familles</b>
          <p className="sub" style={{ margin: 0 }}>Indiquez les jours séparés par des virgules ; laissez vide pour ne pas relancer.</p>
          <div className="grid2">
            <label className="f" htmlFor="relanceConvention">Convention pas encore signée : jours avant le départ<input id="relanceConvention" name="relanceConvention" defaultValue={r.relances.convention.join(", ")} placeholder="Ex. 7, 3" /></label>
            <label className="f" htmlFor="relanceAbsences">Absence pas encore justifiée : jours après son signalement<input id="relanceAbsences" name="relanceAbsences" defaultValue={r.relances.absences.join(", ")} placeholder="Ex. 2, 7" /></label>
            <label className="f" htmlFor="relancePiecesMax">RIB ou pièce d&apos;identité manquant : relance chaque semaine, au plus (fois par an, 0 pour jamais)<input id="relancePiecesMax" name="relancePiecesMax" type="number" min={0} max={10} defaultValue={r.relances.piecesMax} /></label>
          </div>
        </div>
      </Formulaire>

      <div className="panel pad section">
        <h2>Dominantes</h2>
        <p className="sub">Utilisées pour vérifier qu&apos;un stage de 1re ou de terminale se déroule dans la dominante de l&apos;élève.</p>
        <div className="rows panel">
          {dominantes.length === 0 && <div className="empty">Aucune dominante.</div>}
          {dominantes.map((d) => (
            <div key={d.id} className="row">
              <div className="main">{d.libelle}</div>
              <form action={supprimerDominante}><input type="hidden" name="id" value={d.id} /><button className="btn small danger">Retirer</button></form>
            </div>
          ))}
        </div>
        <Formulaire action={ajouterDominante} className="actions" bouton="Ajouter" boutonClasse="btn">
          <label className="f" htmlFor="libelle" style={{ flex: 1 }}>Nouvelle dominante<input id="libelle" name="libelle" placeholder="Ex. Sécurité incendie" /></label>
        </Formulaire>
      </div>
    </>
  );
}
