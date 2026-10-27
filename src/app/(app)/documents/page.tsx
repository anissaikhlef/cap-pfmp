import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { estGestionnaire, idsElevesGeres } from "@/lib/acces";
import { elevesSuivis, classesAvecPeriodes } from "@/lib/requetes";
import { classesGerees } from "@/lib/acces";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { HORS_DOSSIER, LIBELLES_DOC } from "@/components/convention";
import { refuser, valider } from "./actions";

export const metadata = { title: "Documents" };

export default async function Documents({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/");
  const sp = await searchParams;
  const ids = await idsElevesGeres(ctx);
  const attente = ids.length ? await db.select({ d: schema.documents, e: schema.eleves, u: schema.users }).from(schema.documents)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.documents.eleveId))
    .leftJoin(schema.users, eq(schema.users.id, schema.documents.deposeParId))
    // Le CV et la lettre se relisent sur la fiche de l'élève, pas dans cette boîte.
    .where(and(inArray(schema.documents.eleveId, ids), eq(schema.documents.statut, "a_verifier"), notInArray(schema.documents.type, ["cv", "lettre"])))
    .orderBy(desc(schema.documents.deposeLe)) : [];
  const classes = await classesAvecPeriodes(ctx, await classesGerees(ctx));
  const classe = classes.find((c) => c.id === sp.classe)?.id;
  const lignes = await elevesSuivis(ctx, classe);
  const comptes = ids.length ? await db.select({ eleveId: schema.documents.eleveId, annee: schema.documents.anneeScolaire }).from(schema.documents)
    .where(and(inArray(schema.documents.eleveId, ids), eq(schema.documents.statut, "valide"), notInArray(schema.documents.type, HORS_DOSSIER))) : [];
  return (
    <>
      <div><h1>Documents de stage</h1><p className="sub">Les élèves et leurs familles déposent la convention signée, les entreprises l&apos;attestation et le livret. Chaque document est rangé dans le dossier de l&apos;élève, à la bonne année.</p></div>
      <div className="section">
        <h2>À vérifier ({attente.length})</h2>
        <div className="panel rows">
          {attente.length === 0 && <div className="empty">Aucun document en attente.</div>}
          {attente.map(({ d, e, u }) => (
            <div key={d.id} className="row">
              <div className="main">
                <div className="name">{LIBELLES_DOC[d.type]} · <Link href={`/eleves/${e.id}`}>{e.prenom} {e.nom}</Link> <span className="cls">{d.classeLibelle}</span></div>
                <div className="meta">{d.nomFichier} · {Math.round(d.taille / 1024)} Ko · déposé {u ? `par ${u.prenom} ${u.nom} ` : d.type === "attestation" || d.type === "livret" ? "par l'entreprise, avec son lien personnel, " : ""}le {dateCourte(d.deposeLe.toISOString().slice(0, 10))}</div>
              </div>
              <a className="btn small" href={`/fichiers/${d.id}`} target="_blank" rel="noopener">Ouvrir</a>
              <details>
                <summary className="btn small">Refuser</summary>
                <Formulaire action={refuser} className="actions" bouton="Confirmer le refus" boutonClasse="btn small danger">
                  <input type="hidden" name="id" value={d.id} />
                  <label className="f" htmlFor={`m-${d.id}`}>Motif transmis au déposant<input id={`m-${d.id}`} name="motif" placeholder="Ex. signature de l'entreprise manquante" required /></label>
                </Formulaire>
              </details>
              <form action={valider}><input type="hidden" name="id" value={d.id} /><button className="btn small primary">Valider</button></form>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <h2>Dossiers par élève</h2>
        <div className="chips">
          <Link className="chip" href="/documents" aria-current={!classe ? "true" : undefined}>Toutes les classes</Link>
          {classes.map((c) => <Link key={c.id} className="chip" href={`/documents?classe=${c.id}`} aria-current={classe === c.id ? "true" : undefined}>{c.libelle}</Link>)}
        </div>
        <div className="panel rows">
          {lignes.map((l) => {
            const n = comptes.filter((x) => x.eleveId === l.eleve.id);
            const annees = new Set(n.map((x) => x.annee)).size;
            const attendus = l.statut === "termine" || l.statut === "documents" ? 3 : l.stage ? 1 : 0;
            const recus = (l.stage && Object.keys(l.stage.signatures).length && l.regles.find((r) => r.code === "convention")?.ok ? 1 : 0) + l.documentsValides.filter((t) => t === "attestation" || t === "livret").length;
            return (
              <Link key={l.eleve.id} href={`/eleves/${l.eleve.id}#dossier`} className="row">
                <div className="main"><div className="name">{l.eleve.nom} {l.eleve.prenom} <span className="cls">{l.classe.libelle}</span></div>
                  <div className="meta">{n.length} document(s) validé(s) · {annees} année(s) de formation</div></div>
                {attendus ? <span className={`pill ${recus >= attendus ? "t-ok" : "t-warn"}`}>{ctx.etab.anneeScolaire} : {Math.min(recus, attendus)}/{attendus}</span> : <span className="pill t-muted">Rien à déposer</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
