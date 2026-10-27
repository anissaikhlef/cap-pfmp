import { chargerConventionEtab } from "@/lib/convention";
import { documentsManquants } from "@/lib/entreprises-accueil";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { dateLongue } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { deposerParLien } from "./actions";

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

/** Page publique : l'entreprise dépose l'attestation et le livret signés avec son lien personnel, sans compte. */
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
  return (
    <main className="login">
      <div className="panel pad section" style={{ width: "min(560px, 100%)" }}>
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <h1>Documents de fin de stage</h1>
        <p className="sub" style={{ margin: 0 }}>
          Stage de <b>{cv.e.prenom} {cv.e.nom}</b> ({cv.c.libelle}) chez {cv.ent.nom}, du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)}.
          Déposez les documents complétés et signés (PDF ou photo) : ils sont transmis à {etab.nom}.
        </p>
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
