import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { campagneEnCours, messageParDefaut, reponsesCampagne } from "@/lib/campagne";
import { entreprisesDuLycee } from "@/lib/stages";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { Pill } from "@/components/ui";
import { lancerCampagne, relancerCampagne, saisirReponse } from "./actions";

export const metadata = { title: "Campagne de rentrée" };

export default async function Campagne() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/");
  const c = await campagneEnCours(ctx);
  const modele = await messageParDefaut(ctx);
  const ents = await entreprisesDuLycee(ctx);
  const classes = modele.classes;
  const effectifs = classes.length ? await db.select({ classeId: schema.eleves.classeId, n: sql<number>`count(*)::int` }).from(schema.eleves)
    .where(and(inArray(schema.eleves.classeId, classes.map((x) => x.id)), eq(schema.eleves.archive, false))).groupBy(schema.eleves.classeId) : [];
  const reponses = c ? await reponsesCampagne(c.id) : [];
  const total = (id: string) => reponses.reduce((t, r) => t + (r.r.placesParClasse?.[id] ?? 0), 0);
  const sansReponse = reponses.filter((r) => !r.r.reponduLe).length;

  const formulaire = (
    <Formulaire action={lancerCampagne} bouton={c ? "Envoyer une nouvelle campagne" : "Envoyer la campagne"}>
      <div className="section">
        <h3>Destinataires</h3>
        <div className="panel rows" style={{ maxHeight: 340, overflowY: "auto" }}>
          {ents.map((e) => (
            <label key={e.id} className="row" htmlFor={`cb-${e.id}`} style={{ cursor: "pointer" }}>
              <input type="checkbox" id={`cb-${e.id}`} name="entreprises" value={e.id} defaultChecked style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
              <div className="main"><div className="name">{e.nom}</div><div className="meta">{e.email ?? "pas d'adresse e-mail"} · {e.domaine ?? "domaine non précisé"}</div></div>
              <Pill ton={e.secteur === "prive" ? "info" : "muted"}>{e.secteur === "prive" ? "Privé" : "Public"}</Pill>
            </label>
          ))}
        </div>
      </div>
      <label className="f" htmlFor="sujet">Objet<input id="sujet" name="sujet" defaultValue={modele.sujet} required /></label>
      <label className="f" htmlFor="message">Message (« {"{entreprise}"} » est remplacé par le nom de chaque entreprise)
        <textarea id="message" name="message" rows={18} defaultValue={modele.message} required />
      </label>
    </Formulaire>
  );

  return (
    <>
      <div><h1>Campagne de rentrée</h1><p className="sub">En début d&apos;année, envoyez vos dates de PFMP aux entreprises partenaires et demandez combien d&apos;élèves elles peuvent accueillir.</p></div>
      {c && (
        <div className="section">
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <h2>Réponses à la campagne du {dateCourte(c.envoyeeLe!.toISOString().slice(0, 10))}</h2>
            <form action={relancerCampagne}><ChampRetour /><button className="btn" disabled={!sansReponse}>Relancer les {sansReponse} entreprise(s) sans réponse</button></form>
          </div>
          <p className="sub">Saisissez les places annoncées par chaque entreprise : l&apos;annuaire et les suggestions faites aux élèves se mettent à jour.</p>
          <div className="panel tbl">
            <table>
              <thead><tr><th>Entreprise</th><th>Statut</th>{classes.map((cl) => <th key={cl.id}>{cl.libelle}</th>)}<th></th></tr></thead>
              <tbody>
                {reponses.map(({ r, e }) => (
                  <tr key={e.id}>
                    <td><b>{e.nom}</b><div className="sub">{e.email ?? "pas d'e-mail"}</div></td>
                    <td>{r.reponduLe ? <Pill ton="ok">Réponse reçue</Pill> : <Pill ton="warn">{r.relanceLe ? "Relancée" : "En attente"}</Pill>}</td>
                    {classes.map((cl) => (
                      <td key={cl.id}><input form={`f-${e.id}`} className="inp num" type="number" min={0} max={20} name={`places_${cl.id}`} defaultValue={r.placesParClasse?.[cl.id] ?? ""} aria-label={`Places ${cl.libelle} chez ${e.nom}`} style={{ width: 64 }} /></td>
                    ))}
                    <td><form id={`f-${e.id}`} action={saisirReponse}><ChampRetour /><input type="hidden" name="entrepriseId" value={e.id} /><button className="btn small">Enregistrer</button></form></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={2}><b>Places / élèves</b></td>
                  {classes.map((cl) => {
                    const besoin = effectifs.find((x) => x.classeId === cl.id)?.n ?? 0;
                    return <td key={cl.id} className="num" style={{ color: total(cl.id) >= besoin ? "var(--ok)" : "var(--bad)", fontWeight: 700 }}>{total(cl.id)} / {besoin}</td>;
                  })}<td></td></tr>
              </tfoot>
            </table>
          </div>
          <details className="panel pad"><summary className="btn small">Nouvelle campagne</summary>{formulaire}</details>
        </div>
      )}
      {!c && <div className="panel pad">{formulaire}</div>}
    </>
  );
}
