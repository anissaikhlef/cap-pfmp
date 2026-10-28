import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { AGENTS, SOURCES_OFFICIELLES } from "@/lib/agents";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Formulaire } from "@/components/Formulaire";
import { Entete, Pill } from "@/components/ui";
import { corrigerAlerte, nouvelleAlerte, publier, supprimerAlerte } from "../actions";

export const metadata = { title: "Veille réglementaire · administration" };

export default async function AdminVeille() {
  await contexte({ roles: ["admin"] });
  const alertes = await db.select().from(schema.alertesVeille).orderBy(desc(schema.alertesVeille.createdAt)).limit(50);
  const nom = AGENTS.veille.nom;
  const brouillons = alertes.filter((a) => !a.publieeLe);
  const publiees = alertes.filter((a) => a.publieeLe);
  return (
    <>
      <Entete titre="Veille réglementaire" sous={`Collez un texte officiel sur les PFMP : ${nom} le résume et propose les changements. Relisez, puis publiez : l'alerte arrive chez chaque lycée qui a choisi ${nom}.`}>
        <div className="actions"><Link className="btn" href="/admin">Retour à l&apos;administration</Link></div>
      </Entete>
      <div className="panel pad section">
        <h2>Nouveau texte officiel</h2>
        <Formulaire action={nouvelleAlerte} bouton={`Préparer l'alerte avec ${nom}`}>
          <label className="f" htmlFor="v-titre">Titre<input id="v-titre" name="titre" maxLength={200} placeholder="Ex. Note de service sur les PFMP" /></label>
          <label className="f" htmlFor="v-source">Lien vers le texte officiel<input id="v-source" name="source" type="url" placeholder="https://www.education.gouv.fr/bo/…" /></label>
          <label className="f" htmlFor="v-texte">Texte (la partie qui concerne les PFMP)<textarea id="v-texte" name="texte" rows={10} /></label>
          <p className="sub" style={{ margin: 0 }}>Sources acceptées : {SOURCES_OFFICIELLES.join(", ")}.</p>
        </Formulaire>
      </div>
      <div className="section">
        <h2>À relire avant publication ({brouillons.length})</h2>
        {brouillons.length === 0 && <div className="panel empty">Aucun brouillon.</div>}
        {brouillons.map((a) => (
          <div key={a.id} className="panel pad section agent-ia">
            <form action={corrigerAlerte} className="stack">
              <ChampRetour /><input type="hidden" name="id" value={a.id} />
              <label className="f" htmlFor={`t-${a.id}`}>Titre<input id={`t-${a.id}`} name="titre" defaultValue={a.titre} maxLength={200} /></label>
              <p className="sub" style={{ margin: 0 }}><a href={a.source} target="_blank" rel="noopener noreferrer">{a.source}</a></p>
              <label className="f" htmlFor={`r-${a.id}`}>Résumé<textarea id={`r-${a.id}`} name="resume" defaultValue={a.resume} rows={6} /></label>
              <label className="f" htmlFor={`p-${a.id}`}>Propositions (une par ligne)<textarea id={`p-${a.id}`} name="propositions" defaultValue={a.propositions.join("\n")} rows={4} /></label>
              <p className="sub" style={{ margin: 0 }}>Préparé avec {nom}{a.simule ? " · texte d'exemple (agent en démonstration)" : ""}.</p>
              <div className="actions"><button className="btn small">Enregistrer les corrections</button></div>
            </form>
            <div className="actions" style={{ marginTop: 8 }}>
              <form action={publier}><ChampRetour /><input type="hidden" name="id" value={a.id} /><button className="btn small primary">Publier l&apos;alerte</button></form>
              <form action={supprimerAlerte}><ChampRetour /><input type="hidden" name="id" value={a.id} /><button className="btn small danger">Supprimer</button></form>
            </div>
          </div>
        ))}
      </div>
      <div className="section">
        <h2>Alertes publiées</h2>
        <div className="panel rows">
          {publiees.length === 0 && <div className="empty">Aucune alerte publiée.</div>}
          {publiees.map((a) => (
            <div key={a.id} className="row">
              <div className="main"><div className="name">{a.titre}</div><div className="meta">{a.propositions.length} proposition(s)</div></div>
              <Pill ton="ok">Publiée le {dateCourte(a.publieeLe!.toISOString().slice(0, 10))}</Pill>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
