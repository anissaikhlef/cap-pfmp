"use client";
import { useActionState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type Etat = { erreur?: string; ok?: string; secret?: string } | null;

/** Formulaire relié à une action serveur, qui affiche l'erreur ou la confirmation renvoyée. */
export function Formulaire({
  action, children, className = "stack", bouton, boutonClasse = "btn primary", id,
}: {
  action: (etat: Etat, fd: FormData) => Promise<Etat>;
  children: ReactNode;
  className?: string;
  bouton?: string;
  boutonClasse?: string;
  id?: string;
}) {
  const [etat, agir, enCours] = useActionState(action, null);
  const chemin = usePathname();
  const sp = new URLSearchParams(useSearchParams());
  sp.delete("msg"); sp.delete("ton");
  const retour = chemin + (sp.size ? `?${sp}` : "");
  return (
    <form action={agir} className={className} id={id}>
      <input type="hidden" name="__retour" value={retour} />
      {children}
      {etat?.erreur && <p className="msg err" role="alert">{etat.erreur}</p>}
      {etat?.ok && <p className="msg ok" role="status">{etat.ok}</p>}
      {etat?.secret && (
        <div className="section">
          <p className="note">Mot de passe provisoire, affiché une seule fois. Transmettez-le à la personne : elle devra le changer à sa première connexion.</p>
          <div className="secret">{etat.secret}</div>
        </div>
      )}
      {bouton && (
        <div className="actions">
          <button className={boutonClasse} disabled={enCours}>{enCours ? "Enregistrement…" : bouton}</button>
        </div>
      )}
    </form>
  );
}
