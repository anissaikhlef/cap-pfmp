import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { campagneDe, classesDeLaCampagne } from "@/lib/campagne";
import { dateLongue } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { repondreCampagne } from "./actions";

export const metadata = { title: "Accueillir des stagiaires" };

function Message({ titre, texte, children }: { titre: string; texte: string; children?: React.ReactNode }) {
  return (
    <main className="login">
      <div className="panel pad section">
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>{titre}</h1>
        <p className="sub">{texte}</p>
        {children}
      </div>
    </main>
  );
}

/** Page publique : une entreprise indique, avec son lien personnel, combien d'élèves elle peut accueillir. */
export default async function Repondre({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "campagne");
  const etab = lien ? await etablissementDuLien(lien.etablissementId) : null;
  const c = etab ? await campagneDe(etab) : null;
  const [ent] = lien?.entrepriseId && etab
    ? await db.select().from(schema.entreprises).where(and(eq(schema.entreprises.id, lien.entrepriseId), eq(schema.entreprises.etablissementId, etab.id))).limit(1)
    : [];
  if (!lien || !etab || !c || !ent) return <Message titre="Lien introuvable" texte="Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier, ou répondez simplement au mail du lycée." />;
  const classes = await classesDeLaCampagne(etab);
  const [rep] = await db.select().from(schema.campagneReponses)
    .where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, ent.id))).limit(1);
  if (rep?.reponduLe) {
    const lignes = classes.filter((cl) => rep.placesParClasse?.[cl.id] !== undefined);
    return (
      <Message titre="Merci, votre réponse est enregistrée" texte={`${etab.nom} a bien reçu la réponse de ${ent.nom}${rep.repondant ? ` (${rep.repondant})` : ""}. Pour la modifier, répondez simplement au mail du lycée.`}>
        {lignes.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {lignes.map((cl) => <li key={cl.id}>{cl.libelle} : {rep.placesParClasse![cl.id]} élève(s)</li>)}
          </ul>
        )}
      </Message>
    );
  }
  if (lien.utiliseLe || lien.expireLe < new Date()) return <Message titre="Lien expiré" texte={`Ce lien personnel n'est plus valable. Répondez simplement au mail de ${etab.nom}.`} />;
  return (
    <main className="login">
      <div className="panel pad section" style={{ width: "min(560px, 100%)" }}>
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>Accueillir des élèves de {etab.nom}</h1>
        <p className="sub" style={{ margin: 0 }}>
          Lien personnel envoyé à {lien.destinataire} pour <b>{ent.nom}</b>, valable jusqu&apos;au {dateLongue(lien.expireLe.toISOString().slice(0, 10))}.
          Indiquez combien d&apos;élèves vous pouvez accueillir pour chaque classe ; laissez 0 si vous ne pouvez pas en accueillir.
        </p>
        <Formulaire action={repondreCampagne} bouton="Envoyer ma réponse">
          <input type="hidden" name="jeton" value={jeton} />
          {classes.length === 0 && <p className="note">Le lycée n&apos;a pas encore indiqué ses dates de stage : précisez vos possibilités dans le commentaire.</p>}
          {classes.map((cl) => (
            <label key={cl.id} className="f" htmlFor={`rp-${cl.id}`}>
              <span><b style={{ color: "var(--ink)" }}>{cl.libelle}</b>{cl.filiere ? ` · ${cl.filiere}` : ""}</span>
              <span className="sub">{cl.periodes.map((p) => `${p.libelle} : du ${dateLongue(p.debut)} au ${dateLongue(p.fin)}`).join(" · ")}</span>
              <input id={`rp-${cl.id}`} name={`places_${cl.id}`} type="number" inputMode="numeric" min={0} max={20} placeholder="0" style={{ maxWidth: 120 }} />
            </label>
          ))}
          <label className="f" htmlFor="rp-nom">Votre prénom et votre nom<input id="rp-nom" name="repondant" autoComplete="name" required /></label>
          <label className="f" htmlFor="rp-commentaire">Commentaire (facultatif)<textarea id="rp-commentaire" name="commentaire" rows={3} maxLength={1000} placeholder="Ex. plutôt des élèves de 1re, accueil à partir de 8 h" /></label>
        </Formulaire>
        <p className="sub" style={{ margin: 0 }}>Votre réponse est transmise au lycée avec votre nom. Ce lien ne sert qu&apos;une fois.</p>
      </div>
    </main>
  );
}
