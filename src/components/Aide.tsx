"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { aideDe, type Etape } from "@/lib/aide";
import { terminerVisiteGuidee } from "@/app/(app)/actions";

/**
 * Formation incluse : le bouton « ? » de l'en-tête (l'aide de la page, et la visite guidée à revoir), et la visite guidée,
 * ouverte d'elle-même à la première connexion.
 */
export function Aide({ etapes, premiereFois }: { etapes: Etape[]; premiereFois: boolean }) {
  const chemin = usePathname();
  const [aide, setAide] = useState(false);
  const [visite, setVisite] = useState<number | null>(null);
  useEffect(() => { if (premiereFois) setVisite(0); }, [premiereFois]);
  const page = aideDe(chemin);
  const fermerVisite = () => { setVisite(null); if (premiereFois) void terminerVisiteGuidee(); };
  const e = visite !== null ? etapes[visite] : null;
  return (
    <>
      <button type="button" className="aide-bouton" aria-label="Aide de cette page" title="Aide" onClick={() => setAide(true)}>?</button>
      {aide && (
        <div className="dialogue-fond" role="presentation" onClick={() => setAide(false)}>
          <div className="dialogue panel pad stack" role="dialog" aria-modal="true" aria-labelledby="aide-titre" onClick={(x) => x.stopPropagation()}>
            <h2 id="aide-titre">{page?.titre ?? "Aide"}</h2>
            {page ? <ul>{page.points.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="sub">Cette page n&apos;a pas encore d&apos;aide.</p>}
            <div className="actions">
              <button type="button" className="btn" onClick={() => { setAide(false); setVisite(0); }}>Revoir la visite guidée</button>
              <Link className="btn" href="/formation" onClick={() => setAide(false)}>Formation</Link>
              <button type="button" className="btn primary" onClick={() => setAide(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {e && (
        <div className="dialogue-fond" role="presentation">
          <div className="dialogue panel pad stack" role="dialog" aria-modal="true" aria-labelledby="visite-titre">
            <p className="sub" style={{ margin: 0 }}>Visite guidée · {visite! + 1} sur {etapes.length}</p>
            <h2 id="visite-titre">{e.titre}</h2>
            <p style={{ margin: 0 }}>{e.texte}</p>
            {e.lien && e.lien !== chemin && <Link href={e.lien} className="sub">Ouvrir cette page</Link>}
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn" onClick={fermerVisite}>Passer la visite</button>
              <span className="actions">
                {visite! > 0 && <button type="button" className="btn" onClick={() => setVisite(visite! - 1)}>Précédent</button>}
                {visite! < etapes.length - 1
                  ? <button type="button" className="btn primary" onClick={() => setVisite(visite! + 1)}>Suivant</button>
                  : <button type="button" className="btn primary" onClick={fermerVisite}>Terminer</button>}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
