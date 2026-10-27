import type { Reglages, Signataire } from "@/db/schema";
import type { ContexteConvention } from "@/lib/convention";
import { completeParQualite } from "@/lib/modeles";
import { modeleDeLaConvention } from "@/lib/modeles-documents";

/**
 * Les champs de la convention du lycée que la famille (élève, parent) ou l'entreprise (représentant, tuteur)
 * complète en signant : téléphone, adresse, assureur… Lus par enregistrerSignature() (« cp_<n° du champ> »).
 */
export async function ChampsACompleter({ etab, cv, qualite }: { etab: { id: string; nom: string; reglages: Reglages; logoCle?: string | null }; cv: ContexteConvention; qualite: Signataire }) {
  const role = completeParQualite(qualite);
  if (!role) return null;
  const m = await modeleDeLaConvention(etab, cv);
  if (m.mode !== "pdf") return null;
  const champs = m.champs.map((c, i) => ({ c, i })).filter(({ c }) => c.source === role);
  if (!champs.length) return null;
  const v = cv.s.complements?.convention ?? {};
  return (
    <fieldset className="stack completer">
      <legend><b>À compléter sur la convention</b></legend>
      {champs.map(({ c, i }) => {
        const id = `cp-${qualite}-${i}`;
        const libelle = c.libelle || c.nom;
        if (c.type === "case") return <label key={i} className="check" htmlFor={id}><input id={id} type="checkbox" name={`cp_${i}`} value="oui" defaultChecked={v[c.nom] === "oui"} /> {libelle}</label>;
        if (c.type === "liste") {
          return (
            <label key={i} className="f" htmlFor={id}>{libelle}
              <select id={id} name={`cp_${i}`} defaultValue={v[c.nom] ?? ""}><option value="">—</option>{(c.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            </label>
          );
        }
        return <label key={i} className="f" htmlFor={id}>{libelle}<input id={id} name={`cp_${i}`} defaultValue={v[c.nom] ?? ""} maxLength={300} /></label>;
      })}
    </fieldset>
  );
}
