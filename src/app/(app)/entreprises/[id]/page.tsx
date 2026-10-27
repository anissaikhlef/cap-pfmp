import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire, gereLesAcces, idsElevesGeres } from "@/lib/acces";
import { entrepriseDuLycee } from "@/lib/stages";
import { domaines } from "@/lib/domaines";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { Pill } from "@/components/ui";
import { ChampsEntreprise } from "../ChampsEntreprise";
import { creerCompteTuteur, modifierEntreprise, reinitialiserTuteur } from "../actions";

export default async function FicheEntreprise({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  const gestion = await estGestionnaire(ctx);
  const acces = gereLesAcces(ctx);
  if (!gestion && !a(ctx, "professeur", "direction")) redirect("/");
  const e = await entrepriseDuLycee(ctx, id);
  if (!e) notFound();
  const geres = new Set(await idsElevesGeres(ctx));
  const accueils = await db.select({ el: schema.eleves, p: schema.periodes, c: schema.classes }).from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(eq(schema.stages.entrepriseId, id)).orderBy(desc(schema.periodes.debut));
  const tuteurs = await db.select().from(schema.users)
    .where(and(eq(schema.users.entrepriseId, id), eq(schema.users.etablissementId, ctx.etab.id))).orderBy(asc(schema.users.nom));
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>{e.nom}</h1><p className="sub">{[e.domaine, e.ville].filter(Boolean).join(" · ")}</p></div>
        <Pill ton={e.secteur === "prive" ? "info" : "muted"}>{e.secteur === "prive" ? "Privé" : "Public"}</Pill>
      </div>
      <div className="grid2">
        <div className="panel pad section">
          <h2>Contact</h2>
          <dl className="kv">
            <dt>Tuteur</dt><dd>{e.tuteurNom ?? "—"}{e.tuteurFonction ? `, ${e.tuteurFonction}` : ""}</dd>
            <dt>E-mail</dt><dd style={{ userSelect: "all" }}>{e.email ?? "—"}</dd>
            <dt>Mobile</dt><dd className="num" style={{ userSelect: "all" }}>{e.telephone ?? "—"}</dd>
            <dt>Adresse</dt><dd>{[e.adresse, e.ville].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Places</dt><dd>{e.placesParDefaut} élève(s) par période</dd>
          </dl>
          {gestion && e.notesInternes && <p className="note">{e.notesInternes}</p>}
        </div>
        <div className="panel pad section">
          <h2>Élèves accueillis ({accueils.length})</h2>
          <div className="panel rows">
            {accueils.length === 0 && <div className="empty">Aucun élève pour l&apos;instant.</div>}
            {accueils.map(({ el, p, c }) => {
              const contenu = <><div className="main"><div className="name">{el.prenom} {el.nom} <span className="cls">{c.libelle}</span></div><div className="meta">{c.anneeScolaire} · {dateCourte(p.debut)} → {dateCourte(p.fin)}</div></div></>;
              return geres.has(el.id)
                ? <Link key={el.id + p.id} href={`/eleves/${el.id}`} className="row">{contenu}</Link>
                : <div key={el.id + p.id} className="row">{contenu}</div>;
            })}
          </div>
        </div>
      </div>
      {gestion && (
        <>
          <div className="panel pad section">
            <h2>Accès du tuteur</h2>
            <p className="sub">Le tuteur se connecte pour signer la convention, déposer l&apos;attestation et le livret, et choisir un créneau de visite. Il ne voit que ses stagiaires.</p>
            {tuteurs.map((t) => (
              <div key={t.id} className="actions">
                <span className="sub">Compte : {t.prenom} {t.nom} · {t.email}</span>
                {acces && (
                  <details><summary className="btn small">Mot de passe oublié</summary>
                    <Formulaire action={reinitialiserTuteur} bouton="Générer un mot de passe provisoire" boutonClasse="btn small"><input type="hidden" name="userId" value={t.id} /></Formulaire>
                  </details>
                )}
              </div>
            ))}
            {acces ? (
              <details>
                <summary className="btn small">Créer un accès tuteur</summary>
                <Formulaire action={creerCompteTuteur} bouton="Créer l'accès" boutonClasse="btn">
                  <input type="hidden" name="entrepriseId" value={e.id} />
                  <div className="grid3">
                    <label className="f" htmlFor="t-prenom">Prénom<input id="t-prenom" name="prenom" required /></label>
                    <label className="f" htmlFor="t-nom">Nom<input id="t-nom" name="nom" defaultValue={e.tuteurNom?.split(" ").at(-1) ?? ""} required /></label>
                    <label className="f" htmlFor="t-email">E-mail<input id="t-email" name="email" type="email" defaultValue={e.email ?? ""} required /></label>
                  </div>
                </Formulaire>
              </details>
            ) : <p className="sub" style={{ margin: 0 }}>Les comptes et les mots de passe sont créés par le DDFPT.</p>}
          </div>
          <div className="panel pad section">
            <h2>Modifier la fiche</h2>
            <Formulaire action={modifierEntreprise} bouton="Enregistrer">
              <input type="hidden" name="id" value={e.id} />
              <ChampsEntreprise v={e} domaines={await domaines(ctx)} />
            </Formulaire>
          </div>
        </>
      )}
    </>
  );
}
