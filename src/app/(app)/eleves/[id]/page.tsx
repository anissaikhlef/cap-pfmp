import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererEleve } from "@/lib/acces";
import { optionsEleve } from "@/lib/options";
import { elevesSuivis, texteperiode } from "@/lib/requetes";
import { ageAu, aujourdhui } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { Pastille } from "@/components/ui";
import { ChampsEleve } from "../ChampsEleve";
import { ajouterResponsable, archiverEleve, creerCompteEleve, modifierEleve, retirerResponsable } from "../actions";

export default async function FicheEleve({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>{e.prenom} {e.nom}</h1>
          <p className="sub">
            {ligne?.classe.libelle ?? "Sans classe"} · {texteperiode(ligne?.periode ?? null)}
            {age !== null && ` · ${age} ans${age >= 18 ? " (majeur : signe seul)" : ""}`}
          </p>
        </div>
        {ligne?.statut && <Pastille statut={ligne.statut} />}
      </div>

      <div className="panel pad section">
        <h2>Stage</h2>
        {ligne?.entreprise ? (
          <>
            <p><b>{ligne.entreprise.nom}</b> · {ligne.entreprise.ville}</p>
            <ul className="sub" style={{ margin: 0, paddingLeft: 18 }}>
              {ligne.regles.map((r) => <li key={r.code} style={{ color: r.ok ? "var(--ok)" : "var(--bad)" }}>{r.ok ? "✓" : "✕"} {r.libelle}</li>)}
            </ul>
          </>
        ) : (
          <p className="sub">Pas encore de lieu de stage pour cette période. La saisie du stage, des horaires et de la convention arrive à l&apos;étape 2.</p>
        )}
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
