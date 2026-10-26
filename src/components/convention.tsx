import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "@/lib/auth";
import { peutGererEleve, a } from "@/lib/acces";
import { blocageDirection, chargerConvention, qualitesSignature } from "@/lib/convention";
import { SIGNATAIRES, VERBE_SIGNATURE } from "@/lib/regles";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { Formulaire } from "./Formulaire";
import { Pill } from "./ui";
import { deposer, relancer, signer } from "@/app/(app)/documents/actions";
import type { TypeDocument } from "@/db/schema";

const LIBELLES_DOC: Record<TypeDocument, string> = {
  convention: "Convention signée", attestation: "Attestation de stage", livret: "Livret de compétences",
  ordre_mission: "Ordre de mission", compte_rendu: "Compte rendu de visite", autre: "Autre document",
};
export { LIBELLES_DOC };

export async function documentsDuStage(stageId: string) {
  return db.select().from(schema.documents).where(eq(schema.documents.stageId, stageId)).orderBy(desc(schema.documents.deposeLe));
}

function EtatDoc({ d }: { d?: typeof schema.documents.$inferSelect }) {
  if (!d) return <Pill ton="muted">Non reçu</Pill>;
  if (d.statut === "valide") return <Pill ton="ok">Reçu et validé</Pill>;
  if (d.statut === "a_verifier") return <Pill ton="warn">Déposé, en vérification</Pill>;
  return <Pill ton="bad">Refusé : {d.motifRefus}</Pill>;
}

function Depot({ stageId, type, libelle }: { stageId: string; type: string; libelle: string }) {
  return (
    <Formulaire action={deposer} className="actions" bouton={libelle} boutonClasse="btn small primary">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="type" value={type} />
      <label className="f" htmlFor={`f-${type}-${stageId}`} style={{ flex: 1, minWidth: 200 }}>
        <span className="vh">Fichier</span>
        <input id={`f-${type}-${stageId}`} name="fichier" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,.heic" required />
      </label>
    </Formulaire>
  );
}

/** Bloc « convention » : signatures, signature en ligne, dépôt du scan, relances. Adapté au rôle de la personne connectée. */
export async function BlocConvention({ ctx, stageId }: { ctx: Contexte; stageId: string }) {
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return null;
  const qualites = await qualitesSignature(ctx, cv);
  const gestion = await peutGererEleve(ctx, cv.e);
  const docs = await documentsDuStage(stageId);
  const convDoc = docs.find((d) => d.type === "convention");
  const mode = ctx.etab.reglages.signature;
  const estFamille = cv.e.userId === ctx.user.id || a(ctx, "parent");
  const peutDeposer = gestion || (mode !== "enligne" && estFamille);
  const complete = cv.requis.every((k) => cv.s.signatures[k]);
  const blocDir = blocageDirection(cv);
  return (
    <div className="panel pad section">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Convention de stage</h2>
        {complete ? <Pill ton="ok">Signée par tous</Pill> : <Pill ton="warn">En cours de signature</Pill>}
      </div>
      <div className="grid3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {SIGNATAIRES.filter((s) => cv.requis.includes(s.cle)).map((s) => {
          const sig = cv.s.signatures[s.cle];
          return (
            <div key={s.cle} className="card" style={sig ? { borderColor: "color-mix(in srgb, var(--ok) 45%, var(--line))" } : undefined}>
              <b>{s.libelle}</b>
              <span className="sub">{sig ? `Signé le ${dateCourte(sig.le.slice(0, 10))}${sig.mode === "papier" ? " (papier)" : ""}` : "En attente"}</span>
              {!sig && gestion && !qualites.includes(s.cle) && (
                <form action={relancer}><input type="hidden" name="stageId" value={stageId} /><input type="hidden" name="cible" value={s.cle} /><button className="btn small">Relancer</button></form>
              )}
            </div>
          );
        })}
      </div>
      {qualites.length > 0 && (
        <div className="section">
          {qualites.map((q) => {
            const bloque = q === "direction" ? blocDir : null;
            return (
              <Formulaire key={q} action={signer} className="card" bouton={VERBE_SIGNATURE[q]} boutonClasse={bloque ? "btn" : "btn primary"}>
                <input type="hidden" name="stageId" value={stageId} />
                <input type="hidden" name="qualite" value={q} />
                {bloque ? <p className="sub" style={{ margin: 0 }}>{bloque}</p> : (
                  <label className="check"><input type="checkbox" name="lu" /> J&apos;ai lu la convention et j&apos;accepte ses conditions.</label>
                )}
              </Formulaire>
            );
          })}
          <p className="sub" style={{ margin: 0 }}>Signature simple enregistrée dans l&apos;application, avec la date et votre compte. La signature électronique certifiée sera branchée dans une version ultérieure.</p>
        </div>
      )}
      <div className="actions">
        <Link className="btn small" href={`/conventions/${stageId}`} target="_blank">Voir la convention à imprimer</Link>
        {convDoc && <a className="btn small" href={`/fichiers/${convDoc.id}`} target="_blank" rel="noopener">Ouvrir le scan déposé</a>}
        {convDoc && <EtatDoc d={convDoc} />}
      </div>
      {!complete && peutDeposer && mode !== "enligne" && (
        <div className="section">
          <p className="sub" style={{ margin: 0 }}>Convention signée sur papier par toutes les parties ? Prenez-la en photo ou déposez le PDF.</p>
          <Depot stageId={stageId} type="convention" libelle="Déposer la convention signée" />
        </div>
      )}
    </div>
  );
}

/** Bloc « fin de stage » : attestation et livret, déposés par l'entreprise ou le gestionnaire. */
export async function BlocFinDeStage({ ctx, stageId }: { ctx: Contexte; stageId: string }) {
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return null;
  const gestion = await peutGererEleve(ctx, cv.e);
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId;
  const docs = await documentsDuStage(stageId);
  const termine = aujourdhui() > cv.p.fin;
  const peutDeposer = gestion || tuteur;
  return (
    <div className="panel pad section">
      <h2>Fin de stage</h2>
      {!termine && <p className="sub" style={{ margin: 0 }}>À déposer après le {dateCourte(cv.p.fin)}, dernier jour du stage.</p>}
      <div className="grid2">
        {(["attestation", "livret"] as const).map((t) => {
          const d = docs.find((x) => x.type === t);
          return (
            <div key={t} className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}><b>{LIBELLES_DOC[t]}</b><EtatDoc d={d} /></div>
              {d && <a href={`/fichiers/${d.id}`} target="_blank" rel="noopener" className="sub">{d.nomFichier}</a>}
              {peutDeposer && d?.statut !== "valide" && <Depot stageId={stageId} type={t} libelle={d ? "Remplacer le fichier" : "Déposer le document signé"} />}
              {gestion && termine && !d && (
                <form action={relancer}><input type="hidden" name="stageId" value={stageId} /><input type="hidden" name="cible" value={t} /><button className="btn small">Relancer l&apos;entreprise</button></form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dossier de l'élève : tous ses documents, rangés par année scolaire, de la première à la dernière année. */
export async function DossierEleve({ eleveId }: { eleveId: string }) {
  const docs = await db.select({ d: schema.documents, ent: schema.entreprises.nom }).from(schema.documents)
    .leftJoin(schema.stages, eq(schema.stages.id, schema.documents.stageId))
    .leftJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(eq(schema.documents.eleveId, eleveId)).orderBy(desc(schema.documents.anneeScolaire), desc(schema.documents.deposeLe));
  const annees = [...new Set(docs.map((x) => x.d.anneeScolaire))];
  if (!annees.length) return <p className="sub">Aucun document pour l&apos;instant.</p>;
  return (
    <div className="section">
      {annees.map((an) => {
        const liste = docs.filter((x) => x.d.anneeScolaire === an);
        return (
          <div key={an} className="section">
            <h3>{an} · {liste[0].d.classeLibelle}</h3>
            <div className="panel rows">
              {liste.map(({ d, ent }) => (
                <div key={d.id} className="row">
                  <div className="main">
                    <div className="name">{LIBELLES_DOC[d.type]}</div>
                    <div className="meta">{ent ? `${ent} · ` : ""}{d.nomFichier} · déposé le {dateCourte(d.deposeLe.toISOString().slice(0, 10))}</div>
                  </div>
                  <EtatDoc d={d} />
                  <a className="btn small" href={`/fichiers/${d.id}`} target="_blank" rel="noopener">Ouvrir</a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export async function stageDeReference(eleveId: string, periodeId: string | undefined) {
  if (!periodeId) return null;
  const [s] = await db.select().from(schema.stages).where(and(eq(schema.stages.eleveId, eleveId), eq(schema.stages.periodeId, periodeId))).limit(1);
  return s ?? null;
}
