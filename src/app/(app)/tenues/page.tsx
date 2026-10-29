import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { ajouterJours, aujourdhui, dateLongue } from "@/lib/dates";
import { classesDesTenues, gereLesTenues, peutDistribuer, tenueDeLaClasse } from "@/lib/tenues";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete } from "@/components/ui";
import { ouvrirSaisie } from "./actions";

export const metadata = { title: "Tenues et matériel" };

/**
 * Tenues professionnelles et matériel (décisions d'Anissa) : saisie des tailles par classe avec une date limite,
 * fichier de commande pour le DDFPT, puis remise signée par chaque élève et liste des remises.
 */
export default async function Tenues() {
  const ctx = await contexte();
  const gere = gereLesTenues(ctx);
  const classes = await classesDesTenues(ctx);
  if (!classes.length && !gere) redirect("/");
  const etats = await Promise.all(classes.map((c) => tenueDeLaClasse(ctx, c.id)));
  const fichier = (quoi: string, format: string) => `/tenues/fichier/${quoi}?classe=tout&format=${format}`;
  return (
    <>
      <Entete titre="Tenues et matériel" sous="Les élèves (ou leur famille) indiquent leurs tailles avant la date limite ; vous passez la commande avec le fichier ; le jour de la distribution, chaque élève signe la remise sur votre téléphone ou votre tablette.">
        {gere && <div className="actions"><Link className="btn" href="/organisation/tenues">Articles de chaque formation</Link></div>}
      </Entete>
      {!classes.length ? (
        <p className="panel empty">Aucune classe n&apos;a encore de tenue ni de matériel : choisissez d&apos;abord les articles de chaque formation (<Link href="/organisation/tenues">Articles de chaque formation</Link>).</p>
      ) : (
        <>
          {gere && (
            <form action={ouvrirSaisie} className="panel pad section" id="ouvrir">
              <ChampRetour />
              <h2>Ouvrir la saisie des tailles</h2>
              <p className="sub" style={{ margin: 0 }}>Les élèves et leurs familles reçoivent un message, puis une relance avant la date limite tant que les tailles manquent. Pour une classe déjà ouverte, seule la date limite change.</p>
              <div className="actions" style={{ gap: 6 }}>
                {classes.map((c) => <label key={c.id} className="choice"><input type="checkbox" name="classeId" value={c.id} /> <span>{c.libelle}</span></label>)}
              </div>
              <div className="actions">
                <label className="f" htmlFor="t-date">Date limite<input id="t-date" name="dateLimite" type="date" min={aujourdhui()} defaultValue={ajouterJours(aujourdhui(), 14)} required /></label>
                <button className="btn primary">Ouvrir la saisie</button>
              </div>
            </form>
          )}
          {(gere || peutDistribuer(ctx)) && (
            <div className="panel pad section actions" id="fichiers" style={{ justifyContent: "space-between" }}>
              <div><h2 style={{ margin: 0 }}>Toutes les classes</h2><p className="sub" style={{ margin: 0 }}>La commande : le total par article et par taille, puis le détail élève par élève. Les remises : qui a reçu quoi, et ce qui reste à remettre.</p></div>
              <div className="actions">
                {gere && <><a className="btn small primary" href={fichier("commande", "excel")}>Commande (Excel)</a><a className="btn small" href={fichier("commande", "pdf")} target="_blank" rel="noopener">Commande (PDF)</a></>}
                <a className="btn small" href={fichier("remises", "excel")}>Remises (Excel)</a><a className="btn small" href={fichier("remises", "pdf")} target="_blank" rel="noopener">Remises (PDF)</a>
              </div>
            </div>
          )}
          <div className="panel rows" id="classes">
            {classes.map((c, i) => {
              const t = etats[i];
              const n = t?.eleves.length ?? 0;
              const tailles = t ? t.eleves.filter((x) => !x.manque.length).length : 0;
              const remis = t ? t.eleves.filter((x) => !x.reste.length).length : 0;
              return (
                <div key={c.id} className="row" id={`classe-${c.id}`}>
                  <div className="main">
                    <div className="name">{c.libelle}<span className="cls">{c.formation}</span></div>
                    <div className="meta">
                      {c.articles.map((x) => x.libelle).join(", ")} ·{" "}
                      {t?.campagne ? `saisie ouverte jusqu'au ${dateLongue(t.campagne.dateLimite)} · tailles : ${tailles} sur ${n} · tout remis : ${remis} sur ${n}` : "saisie des tailles pas encore ouverte"}
                    </div>
                  </div>
                  <Link className="btn small" href={`/tenues/${c.id}`}>Voir la classe</Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
