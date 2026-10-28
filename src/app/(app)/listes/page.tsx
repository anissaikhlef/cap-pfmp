import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { LISTES, NOMS_LISTES } from "@/lib/listes-def";
import { anneesDesListes, classesDesListes, peutExporter, quiExporte } from "@/lib/listes";
import { Entete } from "@/components/ui";

export const metadata = { title: "Listes" };

/** Les listes à exporter en Excel ou en PDF : le DDFPT et la direction toutes, le professeur celles de ses classes sauf les RIB. */
export default async function Listes({ searchParams }: { searchParams: Promise<{ annee?: string; classe?: string }> }) {
  const ctx = await contexte();
  const qui = quiExporte(ctx);
  if (!qui.gestion && !qui.professeur) redirect("/");
  const sp = await searchParams;
  const annees = await anneesDesListes(ctx);
  const annee = annees.includes(sp.annee ?? "") ? sp.annee! : ctx.etab.anneeScolaire;
  const classes = await classesDesListes(ctx, annee);
  const classe = classes.some((c) => c.id === sp.classe) ? sp.classe! : "tout";
  const lien = (liste: string, format: "excel" | "pdf") => `/listes/${liste}?${new URLSearchParams({ annee, classe, format })}`;
  return (
    <>
      <Entete titre="Listes" sous={qui.gestion
        ? "Toutes les listes du lycée, pour une classe ou pour toutes, en tableau Excel (à trier, à compléter) ou en PDF prêt à imprimer."
        : "Les listes de vos classes (celles dont vous êtes référent ou où vous avez des heures de cours), en tableau Excel ou en PDF prêt à imprimer."} />
      <form className="panel pad section actions" method="get">
        <label className="f" htmlFor="l-annee">Année scolaire
          <select id="l-annee" name="annee" defaultValue={annee}>{annees.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </label>
        <label className="f" htmlFor="l-classe">Classe
          <select id="l-classe" name="classe" defaultValue={classe}>
            <option value="tout">{qui.gestion ? "Toutes les classes" : "Toutes mes classes"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
        </label>
        <button className="btn">Afficher</button>
      </form>
      {classes.length === 0 ? <p className="panel empty">Aucune classe pour cette année.</p> : (
        <div className="panel rows">
          {NOMS_LISTES.filter((l) => peutExporter(ctx, l)).map((l) => (
            <div key={l} className="row" id={`liste-${l}`}>
              <div className="main">
                <div className="name">{LISTES[l].titre}</div>
                <div className="meta">{LISTES[l].description}</div>
              </div>
              <div className="actions">
                <a className="btn small" href={lien(l, "excel")}>Tableau Excel</a>
                <a className="btn small" href={lien(l, "pdf")} target="_blank" rel="noopener">PDF</a>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="sub">Les listes contiennent des données personnelles d&apos;élèves : gardez-les dans un espace protégé et supprimez-les quand elles ne servent plus.</p>
    </>
  );
}
