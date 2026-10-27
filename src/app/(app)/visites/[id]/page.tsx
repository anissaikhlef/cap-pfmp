import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererEleve, peutVoirEleve } from "@/lib/acces";
import { chargerVisite } from "@/lib/visites";
import { dateProposee } from "@/lib/repartition";
import { ajouterJours, aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import { CRITERES, NIVEAUX, SUITES } from "@/lib/constantes-visites";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { EtatVisite } from "@/components/visites";
import { choisirCreneau, demanderOrdreMission, enregistrerCompteRendu, proposerCreneaux } from "../actions";

export const metadata = { title: "Visite de stage" };

export default async function Visite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  const l = await chargerVisite(ctx, id);
  if (!l?.v) notFound();
  const gestion = await peutGererEleve(ctx, l.e);
  const visiteur = l.v.visiteurId === ctx.user.id;
  if (!gestion && !visiteur && !(await peutVoirEleve(ctx, l.e))) notFound();
  const peutAgir = gestion || visiteur;
  const [u] = l.v.visiteurId ? await db.select().from(schema.users).where(eq(schema.users.id, l.v.visiteurId)).limit(1) : [];
  const jour = aujourdhui();
  const base = l.v.date ?? dateProposee(l.p.debut, l.p.fin, jour);
  const propositions: [string, string][] = l.v.creneauxProposes ?? [[base, "10:00"], [ajouterJours(base, 1), "14:00"], [ajouterJours(base, 2), "09:30"]];
  const r = ctx.etab.reglages;
  const cr = l.v.compteRendu;
  const visitePassee = !!l.v.date && l.v.date <= jour;
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Visite de {l.e.prenom} {l.e.nom}</h1>
          <p className="sub">{l.c.libelle} · {l.ent.nom} · stage du {dateCourte(l.p.debut)} au {dateCourte(l.p.fin)}</p>
        </div>
        <EtatVisite l={l} ctx={ctx} />
      </div>
      <div className="grid2">
        <div className="panel pad section">
          <h2>Lieu et contact</h2>
          <dl className="kv">
            <dt>Entreprise</dt><dd>{l.ent.nom}</dd>
            <dt>Adresse</dt><dd>{[l.ent.adresse, l.ent.ville].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Tuteur</dt><dd>{l.s.tuteur ? `${l.s.tuteur.nom}${l.s.tuteur.fonction ? `, ${l.s.tuteur.fonction}` : ""}` : `${l.ent.tuteurNom ?? "—"}${l.ent.tuteurFonction ? `, ${l.ent.tuteurFonction}` : ""}`}</dd>
            <dt>Mobile</dt><dd className="num" style={{ userSelect: "all" }}>{l.s.tuteur?.telephone ?? l.ent.telephone ?? "—"}</dd>
            <dt>Visiteur</dt><dd>{u ? `${u.prenom} ${u.nom}` : "Pas encore attribué"}</dd>
            <dt>Date</dt><dd>{l.v.date ? `${dateLongue(l.v.date)}${l.v.heure ? ` à ${l.v.heure.replace(":", "h")}` : ""}` : "À fixer"}</dd>
          </dl>
          {gestion && <Link href="/visites" className="sub">Changer le visiteur ou la date dans la liste des visites</Link>}
        </div>

        {peutAgir && l.v.visiteurId && (
          <div className="panel pad section">
            <h2>Proposer un créneau au tuteur</h2>
            <Formulaire action={proposerCreneaux} bouton={l.v.propositionEnvoyeeLe ? "Renvoyer de nouveaux créneaux" : "Envoyer par SMS"}>
              <input type="hidden" name="visiteId" value={l.v.id} />
              <div className="choices" role="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <label className="choice"><input type="radio" name="mode" value="presentiel" defaultChecked={l.v.mode !== "distanciel"} /> Sur place</label>
                <label className="choice"><input type="radio" name="mode" value="distanciel" defaultChecked={l.v.mode === "distanciel"} /> À distance</label>
              </div>
              {propositions.map(([d, h], i) => (
                <div key={i} className="grid2" style={{ gridTemplateColumns: "1fr 120px" }}>
                  <label className="f" htmlFor={`cd-${i}`}>Créneau {i + 1}<input id={`cd-${i}`} name={`date_${i}`} type="date" defaultValue={d} min={jour} /></label>
                  <label className="f" htmlFor={`ch-${i}`}>Heure<input id={`ch-${i}`} name={`heure_${i}`} type="time" defaultValue={h} /></label>
                </div>
              ))}
              <p className="sub" style={{ margin: 0 }}>Le tuteur reçoit un SMS avec vos disponibilités et peut choisir le créneau dans son espace.</p>
            </Formulaire>
            {l.v.creneauxProposes && !l.v.heure && (
              <form action={choisirCreneau} className="actions">
                <ChampRetour />
                <input type="hidden" name="visiteId" value={l.v.id} />
                <select className="inp" name="creneau" aria-label="Créneau retenu par le tuteur" style={{ width: "auto" }}>
                  {l.v.creneauxProposes.map(([d, h], i) => <option key={i} value={i}>{dateCourte(d)} à {h.replace(":", "h")}</option>)}
                </select>
                <button className="btn small">Le tuteur a choisi ce créneau</button>
              </form>
            )}
          </div>
        )}
      </div>

      {r.ordreMission && peutAgir && l.v.visiteurId && (
        <div className="panel pad section">
          <h2>Ordre de mission</h2>
          {l.v.ordreMission === "aucun" && (
            l.v.date ? (
              <form action={demanderOrdreMission} className="actions">
                <ChampRetour /><input type="hidden" name="visiteId" value={l.v.id} />
                <button className="btn primary">Créer l&apos;ordre de mission</button>
                <span className="sub">Il sera transmis à la direction pour signature.</span>
              </form>
            ) : <p className="sub">Fixez d&apos;abord la date de la visite.</p>
          )}
          {l.v.ordreMission === "a_signer" && <p className="sub">Transmis à la direction, en attente de signature.</p>}
          {l.v.ordreMission === "signe" && <p className="sub">Signé le {dateCourte(l.v.ordreMissionSigneLe!.toISOString().slice(0, 10))}.</p>}
          {l.v.ordreMission !== "aucun" && <Link className="btn small" href={`/ordres-mission/${l.v.id}`} target="_blank">Voir l&apos;ordre de mission</Link>}
        </div>
      )}

      {r.compteRendu && (
        <div className="panel pad section">
          <h2>Compte rendu de visite</h2>
          {cr ? (
            <>
              <dl className="kv">
                <dt>Date</dt><dd>{dateLongue(cr.date)} · {cr.mode === "presentiel" ? "sur place" : "à distance"}</dd>
                <dt>Personne rencontrée</dt><dd>{cr.personneRencontree}</dd>
                {CRITERES.map(([k, lib]) => <Fragment key={k}><dt>{lib}</dt><dd>{cr.criteres[k] ?? "Non évalué"}</dd></Fragment>)}
                <dt>Suite à donner</dt><dd>{SUITES.find(([k]) => k === cr.suite)?.[1]}</dd>
              </dl>
              {cr.observations && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{cr.observations}</p>}
              <p className="sub" style={{ margin: 0 }}>Rédigé le {dateCourte(l.v.compteRenduLe!.toISOString().slice(0, 10))}{u ? ` par ${u.prenom} ${u.nom}` : ""} · rangé dans le dossier de l&apos;élève.</p>
            </>
          ) : !peutAgir ? <p className="sub">Pas encore rédigé.</p> : !visitePassee ? (
            <p className="sub">À rédiger après la visite{l.v.date ? ` du ${dateCourte(l.v.date)}` : ""}.</p>
          ) : (
            <Formulaire action={enregistrerCompteRendu} bouton="Enregistrer le compte rendu">
              <input type="hidden" name="visiteId" value={l.v.id} />
              <div className="grid3">
                <label className="f" htmlFor="cr-date">Date de la visite<input id="cr-date" name="date" type="date" defaultValue={l.v.date ?? jour} max={jour} required /></label>
                <label className="f" htmlFor="cr-mode">Modalité<select id="cr-mode" name="mode" defaultValue={l.v.mode}><option value="presentiel">Sur place</option><option value="distanciel">À distance</option></select></label>
                <label className="f" htmlFor="cr-pers">Personne rencontrée<input id="cr-pers" name="personneRencontree" defaultValue={l.s.tuteur?.nom ?? l.ent.tuteurNom ?? ""} required /></label>
              </div>
              <div className="grid2">
                {CRITERES.map(([k, lib]) => (
                  <label key={k} className="f" htmlFor={`cr-${k}`}>{lib}
                    <select id={`cr-${k}`} name={`critere_${k}`} defaultValue="Satisfaisant">{NIVEAUX.map((n) => <option key={n}>{n}</option>)}</select>
                  </label>
                ))}
              </div>
              <label className="f" htmlFor="cr-obs">Observations<textarea id="cr-obs" name="observations" rows={4} placeholder="Activités observées, points forts, axes de progrès" /></label>
              <label className="f" htmlFor="cr-suite">Suite à donner<select id="cr-suite" name="suite" defaultValue="aucune">{SUITES.map(([k, lib]) => <option key={k} value={k}>{lib}</option>)}</select></label>
            </Formulaire>
          )}
        </div>
      )}
      {gestion && <Link href={`/eleves/${l.e.id}`} className="btn" style={{ alignSelf: "flex-start" }}>Fiche de l&apos;élève</Link>}
    </>
  );
}
