"use client";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type Etat = { erreur?: string; ok?: string; secret?: string } | null;

/**
 * Formulaire relié à une action serveur, qui affiche l'erreur ou la confirmation renvoyée.
 * Après une erreur, les champs restent remplis pour être corrigés ; ils ne sont vidés qu'après une réussite.
 */
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
  const ref = useRef<HTMLFormElement>(null);
  const chemin = usePathname();
  const sp = new URLSearchParams(useSearchParams());
  sp.delete("msg"); sp.delete("ton");
  const retour = chemin + (sp.size ? `?${sp}` : "");
  useEffect(() => { if (etat?.ok && !etat.erreur) ref.current?.reset(); }, [etat]);
  // Envoi sans la remise à zéro automatique de React, qui effacerait aussi les champs après une erreur.
  function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => agir(fd));
  }
  return (
    <form ref={ref} action={agir} onSubmit={envoyer} className={className} id={id}>
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
