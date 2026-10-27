"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { preparerFiches } from "./actions";

/**
 * Création des comptes d'une classe et fiches de connexion à imprimer. Les mots de passe provisoires
 * ne s'affichent qu'ici, une seule fois : ils ne sont enregistrés nulle part en clair.
 */
export function GenerateurDeFiches({ classeId, lycee }: { classeId: string; lycee: string }) {
  const [etat, agir, enCours] = useActionState(preparerFiches, null);
  function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => agir(fd));
  }
  return (
    <>
      <form onSubmit={envoyer} className="stack noprint">
        <input type="hidden" name="classeId" value={classeId} />
        <div className="actions">
          <label className="check"><input type="checkbox" name="eleves" defaultChecked /> Élèves</label>
          <label className="check"><input type="checkbox" name="parents" defaultChecked /> Parents</label>
          <label className="check"><input type="checkbox" name="renouveler" defaultChecked /> Nouveau mot de passe pour les comptes jamais utilisés</label>
        </div>
        <div className="actions"><button className="btn primary" disabled={enCours}>{enCours ? "Préparation…" : "Créer les comptes et préparer les fiches"}</button></div>
        {etat?.erreur && <p className="msg err" role="alert">{etat.erreur}</p>}
        {etat?.ok && <p className="msg ok" role="status">{etat.ok}</p>}
      </form>
      {etat?.fiches && etat.fiches.length > 0 && (
        <div className="section">
          <div className="actions noprint">
            <button type="button" className="btn primary" onClick={() => window.print()}>Imprimer les fiches</button>
            <span className="sub">Les mots de passe ne s&apos;affichent qu&apos;une fois : imprimez les fiches maintenant.</span>
          </div>
          <div className="fiches">
            {etat.fiches.map((f) => (
              <article key={f.id} className="fiche">
                <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
                <p className="sub" style={{ margin: 0 }}>{lycee} · fiche de connexion personnelle, à conserver</p>
                <h3 style={{ margin: 0 }}>{f.nom}</h3>
                <p className="sub" style={{ margin: 0 }}>{f.role}</p>
                <div className="fiche-corps">
                  <dl>
                    <dt>Site</dt><dd>{etat.adresse}</dd>
                    <dt>Identifiant</dt><dd>{f.identifiant}</dd>
                    <dt>Mot de passe provisoire</dt><dd className="num fiche-mdp">{f.motDePasse}</dd>
                  </dl>
                  <div className="fiche-qr" role="img" aria-label="QR code vers la page de connexion" dangerouslySetInnerHTML={{ __html: f.qr }} />
                </div>
                <p className="sub" style={{ margin: 0 }}>À la première connexion, choisissez votre propre mot de passe. Vous pouvez aussi vous connecter sans mot de passe : « Me connecter sans mot de passe » sur la page de connexion.</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
