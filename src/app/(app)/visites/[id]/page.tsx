import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { estReferentDe, peutGererEleve, peutVoirEleve } from "@/lib/acces";
import { grilleEtQuestions } from "@/lib/modeles-documents";
import { imageSignature } from "@/lib/stockage";
import { chargerVisite } from "@/lib/visites";
import { dateProposee } from "@/lib/repartition";
import { ajouterJours, aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import { CRITERES, NIVEAUX, SUITES } from "@/lib/constantes-visites";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { EtatVisite } from "@/components/visites";
import { Pill } from "@/components/ui";
import { euros } from "@/lib/regles";
import { texteMode } from "@/lib/rendez-vous";
import { LienVisio } from "@/components/LienVisio";
import { demanderRemboursement } from "../../frais/actions";
import { ZoneSignature } from "@/components/ChoixSignature";
import { choisirCreneau, demanderOrdreMission, deposerPhotoOrdreMission, enregistrerAppel, enregistrerCompteRendu, proposerCreneaux, signerCachet } from "../actions";

const ADEQUATION = { oui: "Oui", en_partie: "En partie", non: "Non" } as const;

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
  // L'appel de la première semaine : le visiteur, le professeur référent ou la gestion des PFMP.
  const peutAppeler = peutAgir || (await estReferentDe(ctx, l.e));
  const { questions, grille } = await grilleEtQuestions(ctx.etab.id);
  const [auteurAppel] = l.v.appel?.parId ? await db.select().from(schema.users).where(eq(schema.users.id, l.v.appel.parId)).limit(1) : [];
  const imageCachet = l.v.cachet ? await imageSignature(l.v.cachet.image) : null;
  const [photo] = await db.select({ id: schema.documents.id }).from(schema.documents)
    .where(and(eq(schema.documents.stageId, l.s.id), eq(schema.documents.type, "ordre_mission"))).orderBy(desc(schema.documents.deposeLe)).limit(1);
  // Frais de déplacement du visiteur pour cette visite, et le dernier véhicule qu'il a déclaré
  const [frais] = visiteur ? await db.select().from(schema.fraisDeplacement).where(eq(schema.fraisDeplacement.visiteId, l.v.id)).limit(1) : [];
  const [dernier] = visiteur && !frais ? await db.select({ vehicule: schema.fraisDeplacement.vehicule }).from(schema.fraisDeplacement)
    .where(and(eq(schema.fraisDeplacement.professeurId, ctx.user.id), isNotNull(schema.fraisDeplacement.vehicule))).orderBy(desc(schema.fraisDeplacement.createdAt)).limit(1) : [];
  const dernierVehicule = dernier?.vehicule ?? null;
  const qui = r.signatairesOrdreMission.length > 1 ? "la direction ou la gestion des PFMP" : r.signatairesOrdreMission[0] === "direction" ? "la direction" : "la gestion des PFMP";
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
          <div className="panel pad section" id="rendez-vous">
            <h2>Rendez-vous avec l&apos;entreprise</h2>
            {l.v.heure && l.v.date ? (
              <p className="msg ok" style={{ margin: 0 }}>Rendez-vous le {dateLongue(l.v.date)} à {l.v.heure.replace(":", "h")}, {texteMode(l.v.mode)}{l.v.mode === "distanciel" && l.v.lienDistance && <> · <LienVisio valeur={l.v.lienDistance} /></>}.</p>
            ) : l.v.propositionEnvoyeeLe && <p className="sub" style={{ margin: 0 }}>Créneaux envoyés le {dateCourte(l.v.propositionEnvoyeeLe.toISOString().slice(0, 10))} : en attente du choix de l&apos;entreprise.</p>}
            {l.v.rdvCommentaire && <p className="note" style={{ margin: 0 }}>Message de l&apos;entreprise : « {l.v.rdvCommentaire} »</p>}
            <Formulaire action={proposerCreneaux} bouton={l.v.propositionEnvoyeeLe ? "Renvoyer de nouveaux créneaux" : "Envoyer à l'entreprise"}>
              <input type="hidden" name="visiteId" value={l.v.id} />
              <fieldset className="choices" style={{ flexDirection: "row", flexWrap: "wrap", border: 0, padding: 0, margin: 0 }}>
                <legend className="sub">Forme de la visite</legend>
                <label className="choice"><input type="radio" name="mode" value="presentiel" defaultChecked={l.v.modesProposes === "presentiel"} /> Sur place</label>
                <label className="choice"><input type="radio" name="mode" value="distanciel" defaultChecked={l.v.modesProposes === "distanciel"} /> À distance</label>
                <label className="choice"><input type="radio" name="mode" value="les2" defaultChecked={!l.v.modesProposes || l.v.modesProposes === "les2"} /> Au choix de l&apos;entreprise</label>
              </fieldset>
              {propositions.map(([d, h], i) => (
                <div key={i} className="grid2" style={{ gridTemplateColumns: "1fr 120px" }}>
                  <label className="f" htmlFor={`cd-${i}`}>Créneau {i + 1}<input id={`cd-${i}`} name={`date_${i}`} type="date" defaultValue={d} min={jour} /></label>
                  <label className="f" htmlFor={`ch-${i}`}>Heure<input id={`ch-${i}`} name={`heure_${i}`} type="time" defaultValue={h} /></label>
                </div>
              ))}
              <label className="f" htmlFor="cd-lien">Pour une visite à distance : lien de visio ou numéro de téléphone (facultatif)<input id="cd-lien" name="lienDistance" defaultValue={l.v.lienDistance ?? ""} maxLength={300} /></label>
              <p className="sub" style={{ margin: 0 }}>L&apos;entreprise reçoit un lien par SMS et par mail : elle choisit en ligne son créneau, et la forme de la visite si vous la lui laissez, sans créer de compte. Le tuteur qui a un compte peut aussi choisir dans son espace.</p>
            </Formulaire>
            {l.v.creneauxProposes && !l.v.heure && (
              <form action={choisirCreneau} className="actions">
                <ChampRetour />
                <span className="sub" style={{ flexBasis: "100%" }}>Le tuteur vous a répondu par téléphone ou par SMS ? Enregistrez sa réponse :</span>
                <input type="hidden" name="visiteId" value={l.v.id} />
                <select className="inp" name="creneau" aria-label="Créneau retenu par le tuteur" style={{ width: "auto" }}>
                  {l.v.creneauxProposes.map(([d, h], i) => <option key={i} value={i}>{dateCourte(d)} à {h.replace(":", "h")}</option>)}
                </select>
                {l.v.modesProposes === "les2" && (
                  <select className="inp" name="mode" aria-label="Forme retenue par le tuteur" style={{ width: "auto" }}>
                    <option value="presentiel">sur place</option><option value="distanciel">à distance</option>
                  </select>
                )}
                <button className="btn small">Le tuteur a choisi ce créneau</button>
              </form>
            )}
          </div>
        )}
      </div>

      {peutAppeler && (
        <div className="panel pad section" id="appel">
          <h2>Appel au tuteur, première semaine</h2>
          {l.v.appel ? (
            <>
              <p className="sub" style={{ margin: 0 }}>Appel du {dateLongue(l.v.appel.date)}{auteurAppel ? ` par ${auteurAppel.prenom} ${auteurAppel.nom}` : ""}.</p>
              <dl className="kv">{l.v.appel.reponses.map((x) => <Fragment key={x.question}><dt>{x.question}</dt><dd>{x.reponse === "oui" ? "Oui" : "Non"}</dd></Fragment>)}</dl>
              {l.v.appel.commentaire && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{l.v.appel.commentaire}</p>}
            </>
          ) : <p className="sub" style={{ margin: 0 }}>{l.p.debut > jour ? `À faire pendant la première semaine de stage, à partir du ${dateLongue(l.p.debut)}.` : "Téléphonez au tuteur pour vérifier que tout se passe bien, puis notez ses réponses."}</p>}
          <details open={!l.v.appel && l.p.debut <= jour}>
            <summary className="btn small">{l.v.appel ? "Modifier l'appel" : "Noter l'appel"}</summary>
            <Formulaire action={enregistrerAppel} bouton="Enregistrer l'appel">
              <input type="hidden" name="visiteId" value={l.v.id} />
              <label className="f" htmlFor="ap-date" style={{ maxWidth: 220 }}>Date de l&apos;appel<input id="ap-date" name="date" type="date" defaultValue={l.v.appel?.date ?? jour} max={jour} required /></label>
              {questions.map((q, i) => {
                const avant = l.v!.appel?.reponses.find((x) => x.question === q)?.reponse;
                return (
                  <fieldset key={q} className="question-appel">
                    <legend>{q}</legend>
                    <label className="check"><input type="radio" name={`q_${i}`} value="oui" defaultChecked={avant === "oui"} required /> Oui</label>
                    <label className="check"><input type="radio" name={`q_${i}`} value="non" defaultChecked={avant === "non"} /> Non</label>
                  </fieldset>
                );
              })}
              <label className="f" htmlFor="ap-com">Commentaire (facultatif)<textarea id="ap-com" name="commentaire" rows={2} defaultValue={l.v.appel?.commentaire ?? ""} maxLength={1000} /></label>
            </Formulaire>
          </details>
        </div>
      )}

      {r.ordreMission && peutAgir && l.v.visiteurId && (
        <div className="panel pad section" id="ordre-mission">
          <h2>Ordre de mission</h2>
          {l.v.ordreMission === "aucun" && (
            l.v.date ? (
              <form action={demanderOrdreMission} className="stack">
                <ChampRetour /><input type="hidden" name="visiteId" value={l.v.id} />
                <div className="choices" role="radiogroup" aria-label="Mode de transport" style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <label className="choice"><input type="radio" name="transport" value="vehicule" required /> Véhicule personnel</label>
                  <label className="choice"><input type="radio" name="transport" value="commun" /> Transport en commun</label>
                </div>
                <div className="actions">
                  <button className="btn primary">Créer l&apos;ordre de mission</button>
                  <span className="sub">Il sera signé avant la visite par {qui}.</span>
                </div>
              </form>
            ) : <p className="sub">Fixez d&apos;abord la date de la visite.</p>
          )}
          {l.v.ordreMission === "a_signer" && <p className="sub">Transmis pour signature à {qui}.</p>}
          {l.v.ordreMission === "signe" && <p className="sub">Signé le {dateLongue(l.v.ordreMissionSigneLe!.toISOString().slice(0, 10))}.</p>}
          {l.v.transport && <p className="sub" style={{ margin: 0 }}>Mode de transport : {l.v.transport === "vehicule" ? "véhicule personnel" : "transport en commun"}.</p>}
          {l.v.ordreMission !== "aucun" && <Link className="btn small" href={`/ordres-mission/${l.v.id}`} target="_blank">Voir l&apos;ordre de mission</Link>}
        </div>
      )}

      {peutAgir && l.v.visiteurId && visitePassee && (
        <div className="panel pad section" id="cachet">
          <h2>Pendant la visite : signature de l&apos;entreprise</h2>
          {l.v.cachet ? (
            <>
              <p className="sub" style={{ margin: 0 }}>Signé par {l.v.cachet.nom}{l.v.cachet.qualite ? `, ${l.v.cachet.qualite}` : ""}, le {dateLongue(l.v.cachet.le.slice(0, 10))}.</p>
              {imageCachet && <img src={imageCachet} alt={`Signature de ${l.v.cachet.nom}`} className="signature-image" />}
            </>
          ) : (
            <>
              <p className="sub" style={{ margin: 0 }}>Faites signer le tuteur ou le représentant de l&apos;entreprise sur ce téléphone, ou prenez en photo l&apos;ordre de mission tamponné.</p>
              <Formulaire action={signerCachet} bouton="Enregistrer la signature">
                <input type="hidden" name="visiteId" value={l.v.id} />
                <div className="grid2">
                  <label className="f" htmlFor="ca-nom">Nom de la personne qui signe<input id="ca-nom" name="nom" defaultValue={l.s.tuteur?.nom ?? l.ent.tuteurNom ?? ""} required maxLength={120} /></label>
                  <label className="f" htmlFor="ca-qualite">Qualité<input id="ca-qualite" name="qualite" defaultValue={l.s.tuteur?.fonction ?? l.ent.tuteurFonction ?? ""} maxLength={120} placeholder="Ex. chef de poste" /></label>
                </div>
                <ZoneSignature consigne="La personne qui représente l'entreprise signe dans le cadre, avec le doigt." />
              </Formulaire>
            </>
          )}
          {photo ? <a className="btn small" href={`/fichiers/${photo.id}`} target="_blank" rel="noopener">Ouvrir la photo de l&apos;ordre de mission tamponné</a> : (
            <details>
              <summary className="btn small">Prendre en photo l&apos;ordre de mission tamponné</summary>
              <Formulaire action={deposerPhotoOrdreMission} className="actions" bouton="Enregistrer la photo" boutonClasse="btn small primary">
                <input type="hidden" name="visiteId" value={l.v.id} />
                <label className="f" htmlFor="ca-photo" style={{ flex: 1, minWidth: 200 }}><span className="vh">Photo</span><input id="ca-photo" name="photo" type="file" accept="image/*,application/pdf" capture="environment" required /></label>
              </Formulaire>
            </details>
          )}
        </div>
      )}

      {r.compteRendu && (
        <div className="panel pad section" id="compte-rendu">
          <h2>Compte rendu de visite</h2>
          {cr ? (
            <>
              <dl className="kv">
                <dt>Date</dt><dd>{dateLongue(cr.date)} · {cr.mode === "presentiel" ? "sur place" : "à distance"}</dd>
                <dt>Personne rencontrée</dt><dd>{cr.personneRencontree}</dd>
                {cr.evaluations
                  ? cr.evaluations.map((x) => <Fragment key={x.critere}><dt>{x.critere}</dt><dd>{x.niveau}</dd></Fragment>)
                  : CRITERES.filter(([k]) => k !== "accueil").map(([k, lib]) => <Fragment key={k}><dt>{lib}</dt><dd>{cr.criteres[k] ?? "Non évalué"}</dd></Fragment>)}
                {cr.adequation && <><dt>Activités en adéquation avec la formation</dt><dd>{ADEQUATION[cr.adequation]}</dd></>}
                <dt>Accueil et encadrement par l&apos;entreprise</dt><dd>{cr.criteres.accueil ?? "Non évalué"}</dd>
                <dt>Suite à donner</dt><dd>{SUITES.find(([k]) => k === cr.suite)?.[1]}</dd>
              </dl>
              {cr.observations && <><b>Commentaires sur le stagiaire</b><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{cr.observations}</p></>}
              {cr.commentaireEntreprise && <><b>Commentaires sur l&apos;entreprise</b><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{cr.commentaireEntreprise}</p></>}
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
              <b>Attitudes professionnelles</b>
              <div className="grid2">
                {grille.map((g, i) => (
                  <label key={g.critere} className="f" htmlFor={`cr-att-${i}`}>{g.critere}
                    <select id={`cr-att-${i}`} name={`att_${i}`} defaultValue="" required>
                      <option value="" disabled>— Choisir —</option>
                      {g.niveaux.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <label className="f" htmlFor="cr-obs">Commentaires sur le stagiaire<textarea id="cr-obs" name="observations" rows={4} placeholder="Activités observées, points forts, axes de progrès" /></label>
              <b>L&apos;entreprise</b>
              <div className="grid2">
                <label className="f" htmlFor="cr-adequation">Les activités confiées sont-elles en adéquation avec la formation ?
                  <select id="cr-adequation" name="adequation" defaultValue="" required><option value="" disabled>— Choisir —</option>{Object.entries(ADEQUATION).map(([k, lib]) => <option key={k} value={k}>{lib}</option>)}</select>
                </label>
                <label className="f" htmlFor="cr-accueil">Accueil et encadrement par l&apos;entreprise
                  <select id="cr-accueil" name="accueil" defaultValue="" required><option value="" disabled>— Choisir —</option>{NIVEAUX.map((n) => <option key={n}>{n}</option>)}</select>
                </label>
              </div>
              <label className="f" htmlFor="cr-ent">Commentaires sur l&apos;entreprise (facultatif)<textarea id="cr-ent" name="commentaireEntreprise" rows={2} maxLength={2000} /></label>
              <label className="f" htmlFor="cr-suite">Suite à donner<select id="cr-suite" name="suite" defaultValue="aucune">{SUITES.map(([k, lib]) => <option key={k} value={k}>{lib}</option>)}</select></label>
            </Formulaire>
          )}
        </div>
      )}
      {visiteur && visitePassee && (
        <div className="panel pad section" id="frais">
          <h2>Frais de déplacement</h2>
          {frais && (
            <>
              <table className="recap-frais"><tbody>
                {frais.transport === "vehicule"
                  ? <tr><td>{frais.km.toLocaleString("fr-FR")} km aller et retour · {frais.vehicule}</td><td className="num">{euros(frais.montantKm)}</td></tr>
                  : <tr><td>Billets de transport</td><td className="num">{euros(frais.billets)}</td></tr>}
                {frais.peage > 0 && <tr><td>Péage</td><td className="num">{euros(frais.peage)}</td></tr>}
                {frais.repas > 0 && <tr><td>{frais.repas} repas</td><td className="num">{euros(frais.montantRepas)}</td></tr>}
                {frais.nuitees > 0 && <tr><td>{frais.nuitees} nuitée(s) · {frais.zoneNuitee}</td><td className="num">{euros(frais.montantNuitees)}</td></tr>}
                <tr><th>Total</th><th className="num">{euros(frais.total)}</th></tr>
              </tbody></table>
              <p style={{ margin: 0 }}>
                {frais.statut === "validee" ? <Pill ton="ok">Validée le {dateCourte(frais.valideLe!.toISOString().slice(0, 10))}</Pill>
                  : frais.statut === "refusee" ? <Pill ton="bad">À reprendre : {frais.motifRefus}</Pill>
                  : <Pill ton="warn">Envoyée, en attente de validation</Pill>}
              </p>
            </>
          )}
          {frais?.statut !== "validee" && (r.ordreMission && l.v.ordreMission !== "signe" ? <p className="sub" style={{ margin: 0 }}>Votre demande de remboursement sera possible une fois l&apos;ordre de mission signé.</p> : (
            <details open={!frais || frais.statut === "refusee"}>
              <summary className="btn small">{frais ? "Modifier la demande" : "Demander le remboursement"}</summary>
              {r.frais.consignes && <p className="note" style={{ whiteSpace: "pre-wrap" }}>{r.frais.consignes}</p>}
              <Formulaire action={demanderRemboursement} className="stack form-frais" bouton={frais ? "Renvoyer la demande" : "Envoyer la demande"}>
                <input type="hidden" name="visiteId" value={l.v.id} />
                <div className="choices" role="radiogroup" aria-label="Mode de transport" style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <label className="choice"><input type="radio" name="transport" value="vehicule" defaultChecked={(frais?.transport ?? l.v.transport ?? "vehicule") === "vehicule"} /> Véhicule personnel</label>
                  <label className="choice"><input type="radio" name="transport" value="commun" defaultChecked={(frais?.transport ?? l.v.transport) === "commun"} /> Transport en commun</label>
                </div>
                {!r.frais.kilometrique.length && <p className="sub si-vehicule" style={{ margin: 0 }}>Votre lycée n&apos;a pas encore saisi son barème kilométrique : prévenez la gestion des PFMP.</p>}
                <div className="grid3 si-vehicule">
                  <label className="f" htmlFor="fr-vehicule">Véhicule<select id="fr-vehicule" name="vehicule" defaultValue={frais?.vehicule ?? dernierVehicule ?? ""}><option value="">— Choisir —</option>{r.frais.kilometrique.map((x) => <option key={x.vehicule}>{x.vehicule}</option>)}</select></label>
                  <label className="f" htmlFor="fr-km">Kilomètres, aller et retour<input id="fr-km" name="km" inputMode="decimal" defaultValue={frais?.km ? String(frais.km).replace(".", ",") : ""} /></label>
                  <label className="f" htmlFor="fr-peage">Péage (€)<input id="fr-peage" name="peage" inputMode="decimal" defaultValue={frais?.peage ? String(frais.peage / 100).replace(".", ",") : ""} /></label>
                </div>
                <label className="f si-commun" htmlFor="fr-billets" style={{ maxWidth: 260 }}>Billets de transport (€)<input id="fr-billets" name="billets" inputMode="decimal" defaultValue={frais?.billets ? String(frais.billets / 100).replace(".", ",") : ""} /></label>
                <div className="grid3">
                  <label className="f" htmlFor="fr-repas">Repas{r.frais.repas ? ` (${euros(Math.round(r.frais.repas * 100))} chacun)` : ""}<input id="fr-repas" name="repas" type="number" min={0} max={10} defaultValue={frais?.repas ?? 0} /></label>
                  <label className="f" htmlFor="fr-nuitees">Nuitées<input id="fr-nuitees" name="nuitees" type="number" min={0} max={10} defaultValue={frais?.nuitees ?? 0} /></label>
                  <label className="f" htmlFor="fr-zone">Lieu de la nuitée<select id="fr-zone" name="zoneNuitee" defaultValue={frais?.zoneNuitee ?? ""}><option value="">—</option>{r.frais.nuitees.map((x) => <option key={x.zone} value={x.zone}>{x.zone} ({euros(Math.round(x.montant * 100))})</option>)}</select></label>
                </div>
                <label className="f" htmlFor="fr-com">Commentaire (facultatif)<textarea id="fr-com" name="commentaire" rows={2} maxLength={1000} defaultValue={frais?.commentaire ?? ""} /></label>
              </Formulaire>
            </details>
          ))}
        </div>
      )}

      {gestion && <Link href={`/eleves/${l.e.id}`} className="btn" style={{ alignSelf: "flex-start" }}>Fiche de l&apos;élève</Link>}
    </>
  );
}
