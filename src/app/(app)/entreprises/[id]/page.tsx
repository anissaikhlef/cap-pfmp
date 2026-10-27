import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire, gereLesAcces, idsElevesGeres, peutAdministrer } from "@/lib/acces";
import { partenariats } from "@/lib/partenariats";
import { CATEGORIES_SOUCI } from "@/lib/constantes-entreprises";
import { ChampRetour } from "@/components/ChampRetour";
import { entrepriseDuLycee } from "@/lib/stages";
import { domaines } from "@/lib/domaines";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { Pill } from "@/components/ui";
import { ChampsEntreprise } from "../ChampsEntreprise";
import { creerCompteTuteur, ecarterEntreprise, leverEcartement, modifierEntreprise, reinitialiserTuteur, signalerSouci } from "../actions";

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
  const part = (await partenariats(ctx)).get(e.id);
  const soucis = await db.select({ s: schema.soucisEntreprises, el: schema.eleves, u: schema.users }).from(schema.soucisEntreprises)
    .leftJoin(schema.eleves, eq(schema.eleves.id, schema.soucisEntreprises.eleveId))
    .leftJoin(schema.users, eq(schema.users.id, schema.soucisEntreprises.auteurId))
    .where(eq(schema.soucisEntreprises.entrepriseId, e.id)).orderBy(desc(schema.soucisEntreprises.createdAt));
  const [ecartePar] = e.ecarteeParId ? await db.select().from(schema.users).where(eq(schema.users.id, e.ecarteeParId)).limit(1) : [];
  const admin = peutAdministrer(ctx);
  const elevesAccueillis = [...new Map(accueils.map(({ el }) => [el.id, el])).values()];
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>{e.nom}</h1><p className="sub">{[e.domaine, e.ville].filter(Boolean).join(" · ")}</p></div>
        <div className="actions">
          {e.ecarteeLe && <Pill ton="bad">Écartée</Pill>}
          {part?.fiable && <Pill ton="ok">Partenaire fiable</Pill>}
          <Pill ton={e.secteur === "prive" ? "info" : "muted"}>{e.secteur === "prive" ? "Privé" : "Public"}</Pill>
        </div>
      </div>
      {e.ecarteeLe && (
        <div className="note">
          <b>Entreprise écartée</b> le {dateCourte(e.ecarteeLe.toISOString().slice(0, 10))}{ecartePar ? ` par ${ecartePar.prenom} ${ecartePar.nom}` : ""} : {e.ecarteeMotif}.
          Elle n&apos;est plus proposée aux élèves et on ne peut plus y enregistrer de stage. Ce motif reste interne au lycée.
          {admin && <form action={leverEcartement} style={{ marginTop: 8 }}><ChampRetour /><input type="hidden" name="entrepriseId" value={e.id} /><button className="btn small">Lever l&apos;écartement</button></form>}
        </div>
      )}
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
      <div className="panel pad section" id="partenariat">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2>Partenariat avec le lycée</h2>
          {part?.note !== null && part?.note !== undefined && <b className="num">{part.note.toLocaleString("fr-FR")} sur 5</b>}
        </div>
        <p className="sub" style={{ margin: 0 }}>Note calculée à partir de faits, visible seulement par l&apos;équipe du lycée :</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{(part?.raisons ?? []).map((r) => <li key={r}>{r}</li>)}</ul>
        {soucis.length > 0 && (
          <div className="panel rows">
            {soucis.map(({ s: x, el, u }) => (
              <div key={x.id} className="row" style={{ alignItems: "flex-start" }}>
                <div className="main">
                  <div className="name">{CATEGORIES_SOUCI.find(([k]) => k === x.categorie)?.[1]}{el ? ` · ${el.prenom} ${el.nom}` : ""}</div>
                  <div className="meta">{x.description}</div>
                  <div className="meta">Signalé le {dateCourte(x.createdAt.toISOString().slice(0, 10))}{u ? ` par ${u.prenom} ${u.nom}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="actions">
          <details>
            <summary className="btn small">Signaler un souci</summary>
            <Formulaire action={signalerSouci} bouton="Enregistrer le souci" boutonClasse="btn small primary">
              <input type="hidden" name="entrepriseId" value={e.id} />
              <div className="grid2">
                <label className="f" htmlFor="so-cat">Sorte de souci
                  <select id="so-cat" name="categorie" defaultValue="" required>
                    <option value="" disabled>— Choisir —</option>
                    {CATEGORIES_SOUCI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                <label className="f" htmlFor="so-eleve">Élève concerné (facultatif)
                  <select id="so-eleve" name="eleveId" defaultValue="">
                    <option value="">—</option>
                    {elevesAccueillis.map((el) => <option key={el.id} value={el.id}>{el.prenom} {el.nom}</option>)}
                  </select>
                </label>
              </div>
              <label className="f" htmlFor="so-desc">Ce qui s&apos;est passé, avec des faits<textarea id="so-desc" name="description" rows={3} maxLength={2000} placeholder="Ex. horaires de nuit imposés à un élève mineur la semaine du 12 octobre" required /></label>
              <p className="sub" style={{ margin: 0 }}>Jamais visible par l&apos;entreprise, les élèves ni les familles. Restez factuel : la personne concernée peut demander à consulter ce qui la concerne (RGPD).</p>
            </Formulaire>
          </details>
          {admin && !e.ecarteeLe && (
            <details>
              <summary className="btn small danger">Écarter cette entreprise</summary>
              <Formulaire action={ecarterEntreprise} bouton="Écarter l'entreprise" boutonClasse="btn small danger">
                <input type="hidden" name="entrepriseId" value={e.id} />
                <label className="f" htmlFor="ec-motif">Motif, interne au lycée<textarea id="ec-motif" name="motif" rows={2} maxLength={500} required /></label>
                <p className="sub" style={{ margin: 0 }}>Elle ne sera plus proposée aux élèves, ni à la campagne de rentrée, et on ne pourra plus y enregistrer de stage.</p>
              </Formulaire>
            </details>
          )}
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
