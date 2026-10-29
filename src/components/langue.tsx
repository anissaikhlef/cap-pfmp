import type { schema } from "@/db";
import { languesDuLycee } from "@/lib/langues";
import { choisirLangue } from "@/app/(app)/eleves/langue-actions";
import { ChampRetour } from "./ChampRetour";

/** Le choix de la langue de la famille (décision d'Anissa), sur la fiche de l'élève ou dans « Mon enfant ». */
export function ChoixLangue({ eleve, ajoutees, pourParent = false }: { eleve: typeof schema.eleves.$inferSelect; ajoutees: string[]; pourParent?: boolean }) {
  return (
    <form action={choisirLangue} className="actions" id={`langue-${eleve.id}`} data-sans-traduction="">
      <ChampRetour /><input type="hidden" name="eleveId" value={eleve.id} />
      <label className="f" htmlFor={`l-${eleve.id}`}>{pourParent ? "Langue de la famille / Language / اللغة" : "Langue de la famille (messages aux parents et espace « Mon enfant » traduits, avec le français dessous)"}
        <select id={`l-${eleve.id}`} name="langue" defaultValue={eleve.langueFamille ?? ""}>
          <option value="">Français</option>
          {languesDuLycee(ajoutees).map((l) => <option key={l.code} value={l.code}>{l.nom === l.libelle ? l.libelle : `${l.nom} (${l.libelle})`}</option>)}
        </select>
      </label>
      <button className="btn small">Enregistrer</button>
    </form>
  );
}
