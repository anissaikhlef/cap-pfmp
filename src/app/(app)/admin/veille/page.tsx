import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { AGENTS, SOURCES_OFFICIELLES } from "@/lib/agents";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Formulaire } from "@/components/Formulaire";
import { Entete, Pill } from "@/components/ui";
import { corrigerAlerte, enregistrerSourcesVeille, lireSourcesMaintenant, nouvelleAlerte, publier, supprimerAlerte } from "../actions";
import { PAGES_VEILLE_PAR_DEFAUT } from "@/lib/agent-veille";
import { legifranceBranche } from "@/lib/legifrance";
import { eq } from "drizzle-orm";

export const metadata = { title: "Veille réglementaire · administration" };

export default async function AdminVeille() {
  await contexte({ roles: ["admin"] });
  const alertes = await db.select().from(schema.alertesVeille).orderBy(desc(schema.alertesVeille.createdAt)).limit(50);
  const [plat] = await db.select().from(schema.plateforme).where(eq(schema.plateforme.id, "cap-pfmp")).limit(1);
  const pages = plat?.veillePages.length ? plat.veillePages : PAGES_VEILLE_PAR_DEFAUT;
  const nom = AGENTS.veille.nom;
  const brouillons = alertes.filter((a) => !a.publieeLe);
  const publiees = alertes.filter((a) => a.publieeLe);
  return (
    <>
      <Entete titre="Veille réglementaire" sous={`Collez un texte officiel sur les PFMP : ${nom} le résume et propose les changements. Relisez, puis publiez : l'alerte arrive chez chaque lycée qui a choisi ${nom}.`}>
        <div className="actions"><Link className="btn" href="/admin">Retour à l&apos;administration</Link></div>
      </Entete>
      <div className="panel pad section">
        <h2>Lecture des sources chaque semaine</h2>
        <p className="sub">Une fois par semaine, {nom} lit le Journal officiel sur Légifrance{legifranceBranche() ? "" : " (dès que l'accès est branché : voir « À faire » dans Administration)"}, et les pages officielles ci-dessous s&apos;il y en a. Il prépare une alerte pour chaque nouveau texte qui parle des stages ; vous recevez un mail, et rien n&apos;est publié sans vous.{plat?.veilleLe ? ` Dernier passage : ${dateCourte(plat.veilleLe.toISOString().slice(0, 10))}.` : " Pas encore de passage."}</p>
        <p className="note" style={{ margin: 0 }}>Le site du ministère refuse la lecture automatique du Bulletin officiel. Pour ses notes de service, abonnez-vous à la lettre gratuite du ministère qui envoie chaque jeudi le sommaire du Bulletin officiel (page « Kiosque actu » d&apos;education.gouv.fr) : quand un texte parle des stages, collez-le ci-dessous dans « Nouveau texte officiel ».</p>
        <Formulaire action={enregistrerSourcesVeille} bouton="Enregistrer les sources" boutonClasse="btn" viderApres={false}>
          <label className="f" htmlFor="v-pages">Autres pages officielles à lire (facultatif, une adresse par ligne)<textarea id="v-pages" name="pages" rows={3} defaultValue={pages.join("\n")} /></label>
          <label className="f" htmlFor="v-academies">Pages de chaque académie (une par ligne : « VERSAILLES | https://www.ac-versailles.fr/… ») : leurs alertes vont aux lycées de cette académie<textarea id="v-academies" name="academies" rows={3} defaultValue={Object.entries(plat?.veilleAcademies ?? {}).flatMap(([a, urls]) => urls.map((u) => `${a} | ${u}`)).join("\n")} /></label>
        </Formulaire>
        <form action={lireSourcesMaintenant} className="actions" style={{ marginTop: 8 }}><ChampRetour /><button className="btn small">Lire les sources maintenant</button></form>
      </div>
      <div className="panel pad section">
        <h2>Nouveau texte officiel</h2>
        <Formulaire action={nouvelleAlerte} bouton={`Préparer l'alerte avec ${nom}`}>
          <label className="f" htmlFor="v-titre">Titre<input id="v-titre" name="titre" maxLength={200} placeholder="Ex. Note de service sur les PFMP" /></label>
          <label className="f" htmlFor="v-source">Lien vers le texte officiel<input id="v-source" name="source" type="url" placeholder="https://www.education.gouv.fr/bo/…" /></label>
          <label className="f" htmlFor="v-academie">Pour une seule académie (facultatif, ex. VERSAILLES ; vide : tous les lycées)<input id="v-academie" name="academie" maxLength={60} /></label>
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
              <label className="f" htmlFor={`e-${a.id}`}>Échéances proposées aux lycées (une par ligne : « AAAA-MM-JJ | titre | examen » ou « … | toutes »)<textarea id={`e-${a.id}`} name="echeances" defaultValue={a.echeances.map((x) => `${x.date} | ${x.titre} | ${x.concerne}`).join("\n")} rows={3} /></label>
              {a.changements.length > 0 && <div className="stack"><b>Changements applicables en un clic (gardez ceux qui sont justes)</b>{a.changements.map((c, i) => <label key={i} className="check"><input type="checkbox" name={`garder_${i}`} value="oui" defaultChecked /> {c.libelle} ({c.cible} = {c.valeur})</label>)}</div>}
              {a.academie && <p className="sub" style={{ margin: 0 }}>Pour l&apos;académie de {a.academie} seulement.</p>}
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
