import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererEleve } from "@/lib/acces";
import { optionsEleve } from "@/lib/options";
import { elevesSuivis, texteperiode } from "@/lib/requetes";
import { ageAu, aujourdhui, dateCourte } from "@/lib/dates";
import { dossierStage, entreprisesDuLycee, demarchesDe } from "@/lib/stages";
import { ChampsHoraires, ListeRegles, TableHoraires } from "@/components/stage";
import { Demarches } from "@/components/Demarches";
import { enregistrerStage, supprimerStage } from "../stage-actions";
import { Formulaire } from "@/components/Formulaire";
import { Pastille } from "@/components/ui";
import { ChampsEleve } from "../ChampsEleve";
import { ajouterResponsable, archiverEleve, creerCompteEleve, modifierEleve, retirerResponsable } from "../actions";

export default async function FicheEleve({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periode?: string; msg?: string }> }) {
  const { id } = await params;
  const { periode: periodeId, msg } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  const [e] = await db.select().from(schema.eleves).where(eq(schema.eleves.id, id)).limit(1);
  if (!e || !(await peutGererEleve(ctx, e))) notFound();

  const ligne = e.classeId ? (await elevesSuivis(ctx, e.classeId)).find((l) => l.eleve.id === id) : undefined;
  const o = await optionsEleve(ctx);
  const resp = await db.select({ u: schema.users }).from(schema.responsables)
    .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
    .where(eq(schema.responsables.eleveId, id));
  const [compte] = e.userId ? await db.select().from(schema.users).where(eq(schema.users.id, e.userId)).limit(1) : [];
  const age = ageAu(e.dateNaissance, aujourdhui());
  const d = await dossierStage(ctx, e, periodeId);
  const entreprises = await entreprisesDuLycee(ctx);
  const dem = await demarchesDe(e.id);
  const statut = d.periode && d.periode.id !== ligne?.periode?.id ? null : ligne?.statut;

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>{e.prenom} {e.nom}</h1>
          <p className="sub">
            {ligne?.classe.libelle ?? "Sans classe"} · {texteperiode(d.periode)}
            {age !== null && ` · ${age} ans${age >= 18 ? " (majeur : signe seul)" : ""}`}
          </p>
        </div>
        {statut && <Pastille statut={statut} />}
      </div>

      {msg && <p className="msg ok" role="status">{msg.slice(0, 300)}</p>}
      {d.periodes.length > 1 && (
        <div className="chips" aria-label="Périodes">
          {d.periodes.map((p) => <a key={p.id} className="chip" href={`/eleves/${e.id}?periode=${p.id}`} aria-current={p.id === d.periode?.id ? "true" : undefined}>{p.libelle} · {dateCourte(p.debut)}</a>)}
        </div>
      )}

      <div className="panel pad section">
        <h2>Lieu de stage{d.periode ? ` · ${d.periode.libelle}, du ${dateCourte(d.periode.debut)} au ${dateCourte(d.periode.fin)}` : ""}</h2>
        {!d.periode && <p className="sub">Aucune période n&apos;est définie pour la classe. <a href={`/classes/${d.classe?.id ?? ""}`}>Ajoutez les dates de PFMP</a>.</p>}
        {d.stage && d.entreprise && (
          <div className="grid2">
            <div className="section">
              <p style={{ margin: 0 }}><a href={`/entreprises/${d.entreprise.id}`}><b>{d.entreprise.nom}</b></a> · {d.entreprise.secteur === "prive" ? "privé" : "public"}{d.entreprise.domaine ? ` · ${d.entreprise.domaine}` : ""}</p>
              <p className="sub" style={{ margin: 0 }}>Tuteur : {d.entreprise.tuteurNom ?? "—"} · {d.entreprise.telephone ?? "pas de mobile"}</p>
              <ListeRegles regles={d.regles} />
            </div>
            <TableHoraires h={d.stage.horaires} />
          </div>
        )}
        {d.periode && (
          <details open={!d.stage}>
            <summary className="btn small">{d.stage ? "Modifier le lieu ou les horaires" : "Enregistrer le lieu de stage"}</summary>
            <Formulaire action={enregistrerStage} bouton="Enregistrer le stage">
              <input type="hidden" name="eleveId" value={e.id} />
              <input type="hidden" name="periodeId" value={d.periode.id} />
              <label className="f" htmlFor="s-ent">Entreprise
                <select id="s-ent" name="entrepriseId" defaultValue={d.entreprise?.id ?? ""} required>
                  <option value="" disabled>— Choisir dans l&apos;annuaire —</option>
                  {entreprises.map((x) => <option key={x.id} value={x.id}>{x.nom}{x.ville ? ` (${x.ville})` : ""}</option>)}
                </select>
              </label>
              <p className="sub" style={{ margin: 0 }}>L&apos;entreprise n&apos;est pas dans la liste ? <a href="/entreprises/nouvelle">Ajoutez-la à l&apos;annuaire</a>.</p>
              <ChampsHoraires h={d.stage?.horaires} />
              {d.stage && Object.keys(d.stage.signatures).length > 0 && <p className="note">Changer d&apos;entreprise ou d&apos;horaires efface les signatures déjà recueillies.</p>}
            </Formulaire>
            {d.stage && (
              <form action={supprimerStage} className="actions" style={{ marginTop: 10 }}>
                <input type="hidden" name="eleveId" value={e.id} /><input type="hidden" name="stageId" value={d.stage.id} />
                <button className="btn small danger">Retirer ce lieu de stage</button>
              </form>
            )}
          </details>
        )}
      </div>

      <div className="panel pad section">
        <h2>Démarches de l&apos;élève</h2>
        <Demarches eleveId={e.id} demarches={dem} entreprises={entreprises} />
      </div>

      <div className="grid2">
        <div className="panel pad section">
          <h2>Compte de l&apos;élève</h2>
          {compte ? (
            <p className="sub">Compte actif : {compte.email}{compte.doitChangerMotDePasse ? " · pas encore connecté" : ""}</p>
          ) : (
            <Formulaire action={creerCompteEleve} bouton="Créer le compte" boutonClasse="btn">
              <input type="hidden" name="eleveId" value={e.id} />
              <p className="sub">L&apos;élève pourra suivre ses démarches et déposer sa convention signée.</p>
              <label className="f" htmlFor="ce-email">Adresse e-mail de l&apos;élève<input id="ce-email" name="email" type="email" defaultValue={e.email ?? ""} required /></label>
            </Formulaire>
          )}
        </div>
        <div className="panel pad section">
          <h2>Responsables légaux</h2>
          {age !== null && age >= 18 && <p className="note">Élève majeur : les responsables légaux n&apos;ont pas d&apos;accès par défaut.</p>}
          <div className="panel rows">
            {resp.length === 0 && <div className="empty">Aucun responsable enregistré.</div>}
            {resp.map(({ u }) => (
              <div key={u.id} className="row">
                <div className="main"><div className="name">{u.prenom} {u.nom}</div><div className="meta">{u.email}{u.telephone ? ` · ${u.telephone}` : ""}</div></div>
                <form action={retirerResponsable}>
                  <input type="hidden" name="eleveId" value={e.id} /><input type="hidden" name="userId" value={u.id} />
                  <button className="btn small danger">Retirer</button>
                </form>
              </div>
            ))}
          </div>
          <details>
            <summary className="btn small">Ajouter un responsable</summary>
            <Formulaire action={ajouterResponsable} bouton="Créer son accès" boutonClasse="btn">
              <input type="hidden" name="eleveId" value={e.id} />
              <div className="grid2">
                <label className="f" htmlFor="r-prenom">Prénom<input id="r-prenom" name="prenom" required /></label>
                <label className="f" htmlFor="r-nom">Nom<input id="r-nom" name="nom" required /></label>
                <label className="f" htmlFor="r-email">Adresse e-mail<input id="r-email" name="email" type="email" required /></label>
                <label className="f" htmlFor="r-tel">Mobile<input id="r-tel" name="telephone" /></label>
              </div>
            </Formulaire>
          </details>
        </div>
      </div>

      <div className="panel pad section">
        <h2>Informations</h2>
        <Formulaire action={modifierEleve} bouton="Enregistrer la fiche">
          <input type="hidden" name="id" value={e.id} />
          <ChampsEleve v={e} {...o} />
        </Formulaire>
      </div>
      <form action={archiverEleve} className="actions">
        <input type="hidden" name="id" value={e.id} />
        <button className="btn danger">{e.archive ? "Remettre dans la liste" : "Archiver l'élève (départ, abandon)"}</button>
      </form>
    </>
  );
}
