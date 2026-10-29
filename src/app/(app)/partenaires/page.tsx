import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, gereToutLEtablissement } from "@/lib/acces";
import { AGENTS, aLAgent } from "@/lib/agents";
import { propositionsARelire, prospects } from "@/lib/agent-partenaires";
import { formationsDuLycee } from "@/lib/requetes";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete } from "@/components/ui";
import { lancerPourLaClasse, prospecter, relireProposition } from "../eleves/agents-actions";

export const metadata = { title: "Cap Partenaires" };

/**
 * Cap Partenaires pour l'équipe (décisions d'Anissa) : des lieux de stage pour toute une classe, relus par le référent
 * avant que les élèves les voient ; et, pour le DDFPT, de nouvelles entreprises autour des communes des élèves.
 */
export default async function Partenaires({ searchParams }: { searchParams: Promise<{ formation?: string }> }) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  if (!aLAgent(ctx.etab.reglages, "entreprises")) redirect("/");
  const gestion = gereToutLEtablissement(ctx);
  const classes = (await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire))).orderBy(asc(schema.classes.libelle)))
    .filter((c) => gestion || (a(ctx, "professeur") && c.referentId === ctx.user.id));
  const aRelire = await propositionsARelire(ctx);
  const formations = gestion ? await formationsDuLycee(ctx.etab.id) : [];
  const sp = await searchParams;
  const formation = formations.find((f) => f.id === sp.formation);
  const p = formation ? await prospects(ctx, formation.id) : null;
  const nom = AGENTS.entreprises.nom;
  return (
    <>
      <Entete titre={nom} sous={`${nom} propose des lieux de stage à toute une classe (le référent relit avant que les élèves les voient) et cherche de nouvelles entreprises pour le lycée, autour des communes où habitent les élèves.`} />
      {classes.length > 0 && (
        <form action={lancerPourLaClasse} className="panel pad section actions" id="classe">
          <ChampRetour />
          <label className="f" htmlFor="p-classe">Lieux de stage pour toute une classe
            <select id="p-classe" name="classeId">{classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}</select>
          </label>
          <button className="btn primary">Proposer pour les élèves sans stage</button>
        </form>
      )}

      <div className="panel pad section" id="a-relire">
        <h2>Propositions à relire ({aRelire.length})</h2>
        <p className="sub" style={{ margin: 0 }}>Décochez les entreprises qui ne conviennent pas, puis montrez la proposition à l&apos;élève (dans « Mon stage »), ou écartez-la.</p>
        {aRelire.length === 0 && <p className="sub">Aucune proposition en attente.</p>}
        {aRelire.map(({ s, e, c }) => (
          <form key={s.id} action={relireProposition} className="panel pad section" id={`proposition-${s.id}`}>
            <ChampRetour /><input type="hidden" name="id" value={s.id} />
            <b>{e.prenom} {e.nom} · {c.libelle}</b>
            {(s.contenu.entreprises ?? []).map((x, i) => (
              <label key={x.nom} className="check"><input type="checkbox" name={`garder_${i}`} value="oui" defaultChecked /> <span><b>{x.nom}</b>{x.ville ? ` · ${x.ville}` : ""} <span className="sub">{x.raison}</span></span></label>
            ))}
            <div className="actions">
              <button className="btn small primary" name="quoi" value="montrer">Montrer à l&apos;élève</button>
              <button className="btn small danger" name="quoi" value="ecarter">Écarter</button>
            </div>
          </form>
        ))}
      </div>

      {gestion && (
        <div className="panel pad section" id="prospection">
          <h2>Nouvelles entreprises pour le lycée</h2>
          <p className="sub" style={{ margin: 0 }}>Autour des communes où habitent les élèves de la formation (la commune seulement, jamais l&apos;adresse), des entreprises qui ne sont pas encore dans votre annuaire. Pour chacune, {nom} prépare un mail de prise de contact, que vous relisez dans « Mails à valider ».</p>
          <form method="get" className="actions">
            <label className="f" htmlFor="p-formation">Formation
              <select id="p-formation" name="formation" defaultValue={formation?.id ?? ""}>
                <option value="" disabled>— Choisir —</option>
                {formations.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
              </select>
            </label>
            <button className="btn">Chercher</button>
          </form>
          {p && (
            <form action={prospecter} className="stack">
              <ChampRetour /><input type="hidden" name="formationId" value={formation!.id} />
              <p className="sub" style={{ margin: 0 }}>Communes : {p.communes.join(", ") || "aucune (indiquez la commune des élèves sur leur fiche)"}.</p>
              {p.liste.length === 0 ? <p className="sub">Aucune nouvelle entreprise trouvée.</p> : p.liste.map((x, i) => (
                <label key={x.nom} className="check"><input type="checkbox" name={`prospect_${i}`} value="oui" /> {x.nom}{x.ville ? ` · ${x.ville}` : ""} <span className="sub">({x.source === "bonne_boite" ? "La bonne boîte" : "annuaire public"})</span></label>
              ))}
              {p.liste.length > 0 && <div className="actions"><button className="btn primary">Préparer les mails de prise de contact</button></div>}
            </form>
          )}
        </div>
      )}
    </>
  );
}
