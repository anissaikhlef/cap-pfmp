import type { schema } from "@/db";
import type { Mesure, Tailles } from "@/db/schema";
import type { Contexte } from "@/lib/auth";
import { dateLongue } from "@/lib/dates";
import { tenueDeLEleve } from "@/lib/tenues";
import { MESURES, tailleDe, type Article } from "@/lib/tenues-def";
import { enregistrerTailles } from "@/app/(app)/tenues/actions";
import { Formulaire } from "./Formulaire";

/** Les listes de tailles d'un élève (haut, bas, pointure…), pour l'élève, sa famille ou l'équipe. */
export function ChampsTailles({ eleveId, mesures, tailles, prefixe = "t" }: { eleveId: string; mesures: Mesure[]; tailles: Tailles; prefixe?: string }) {
  return (
    <Formulaire action={enregistrerTailles} className="actions" bouton="Enregistrer les tailles" boutonClasse="btn small primary" viderApres={false}>
      <input type="hidden" name="eleveId" value={eleveId} />
      {mesures.map((m) => (
        <label key={m} className="f" htmlFor={`${prefixe}-${eleveId}-${m}`}>{MESURES[m].libelle}
          <select id={`${prefixe}-${eleveId}-${m}`} name={m} defaultValue={tailles[m] ?? ""}>
            <option value="">— Choisir —</option>
            {MESURES[m].valeurs.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      ))}
    </Formulaire>
  );
}

const ligne = (x: Article, t: Tailles) => `${x.quantite > 1 ? `${x.quantite} × ` : ""}${x.libelle}${x.mesure ? ` (${tailleDe(x, t)})` : ""}`;

/**
 * « Ma tenue professionnelle » (décisions d'Anissa) : quand le lycée a ouvert la saisie, l'élève ou sa famille indique
 * les tailles avant la date limite ; ensuite, ce qui a été remis (signé le jour de la remise) et ce qui reste à recevoir.
 */
export async function BlocTenue({ ctx, eleve, pourEleve = false }: { ctx: Contexte; eleve: typeof schema.eleves.$inferSelect; pourEleve?: boolean }) {
  const t = await tenueDeLEleve(ctx, eleve);
  if (!t) return null;
  const manque = t.mesures.filter((m) => !eleve.tailles[m]);
  const recu = t.remises.flatMap((r) => r.articles.map((x) => ({ ...x, le: r.remiseLe })));
  return (
    <div className="section" id="tenue">
      <h2>{pourEleve ? "Ma tenue professionnelle" : "Tenue professionnelle"}</h2>
      <p className="sub" style={{ margin: 0 }}>
        Le lycée remet {pourEleve ? "à chaque élève de votre formation" : `à ${eleve.prenom}`} : {t.articles.map((x) => ligne(x, eleve.tailles)).join(", ")}.
        {" "}{pourEleve ? "Vous signerez" : `${eleve.prenom} signera`} le jour de la remise.
      </p>
      {t.mesures.length > 0 && t.reste.length > 0 && (
        <div className="panel pad section">
          {manque.length
            ? <p className="msg err" style={{ margin: 0 }}>Tailles à indiquer avant le {dateLongue(t.campagne.dateLimite)} : {manque.map((m) => MESURES[m].libelle.toLowerCase()).join(", ")}.</p>
            : <p className="msg ok" style={{ margin: 0 }}>Tailles indiquées. Vous pouvez les modifier jusqu&apos;à la remise.</p>}
          <ChampsTailles eleveId={eleve.id} mesures={t.mesures} tailles={eleve.tailles} prefixe="ma" />
        </div>
      )}
      {recu.length > 0 && (
        <p className="sub" style={{ margin: 0 }}>Reçu : {recu.map((x) => `${x.quantite > 1 ? `${x.quantite} × ` : ""}${x.libelle}${x.taille ? ` (${x.taille})` : ""} le ${x.le.toLocaleDateString("fr-FR")}`).join(", ")}.
          {t.reste.length ? ` À recevoir : ${t.reste.map((x) => x.libelle).join(", ")}.` : " Tout a été remis."}</p>
      )}
    </div>
  );
}
