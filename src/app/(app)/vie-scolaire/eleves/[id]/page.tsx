import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, voitToutLEtablissement } from "@/lib/acces";
import { lieuxDesPeriodes } from "@/lib/vie-scolaire";
import { ageAu, aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import { joursDAbsence } from "@/lib/regles";
import { ORIGINES_ABSENCE } from "@/lib/constantes-absences";
import { responsablesDe } from "@/lib/alertes";
import { Pill } from "@/components/ui";
import { TableHoraires } from "@/components/stage";
import { EtatPeriode } from "@/components/rattrapages";
import { texteAbsence } from "@/components/absences";
import { NotesEleve } from "@/components/notes";

export const metadata = { title: "Élève · vie scolaire" };

/** Fiche « vie scolaire » d'un élève : ses périodes de stage (rattrapages compris), ses absences et les notes de suivi. */
export default async function FicheVieScolaire({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  if (!voitToutLEtablissement(ctx)) redirect("/");
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e) notFound();
  const [classe] = e.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1) : [];
  const periodes = classe
    ? await db.select().from(schema.periodes)
      .where(and(eq(schema.periodes.classeId, classe.id), or(isNull(schema.periodes.eleveId), eq(schema.periodes.eleveId, e.id))))
      .orderBy(asc(schema.periodes.debut))
    : [];
  const lieux = (await lieuxDesPeriodes(periodes.map((p) => p.id))).filter((l) => l.s.eleveId === e.id);
  const absences = await db.select().from(schema.absences).where(eq(schema.absences.eleveId, e.id)).orderBy(desc(schema.absences.debut));
  const parents = await responsablesDe(e.id);
  const age = ageAu(e.dateNaissance, aujourdhui());
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>{e.prenom} {e.nom}</h1>
          <p className="sub">{classe?.libelle ?? "Sans classe"}{age !== null ? ` · ${age} ans` : ""}{e.archive ? " · élève archivé" : ""}</p>
        </div>
        <div className="actions">
          <Link className="btn small" href="/vie-scolaire">Retour à la vie scolaire</Link>
          {a(ctx, "direction", "gestionnaire") && <Link className="btn small" href={`/eleves/${e.id}`}>Fiche complète</Link>}
        </div>
      </div>

      <div className="section">
        <h2>Périodes de stage</h2>
        <div className="panel rows">
          {periodes.length === 0 && <div className="empty">Aucune période de stage cette année.</div>}
          {periodes.map((p) => {
            const lieu = lieux.find((l) => l.s.periodeId === p.id);
            return (
              <div key={p.id} className="row" style={{ alignItems: "flex-start" }}>
                <div className="main">
                  <div className="name">{p.libelle} {p.eleveId && <Pill ton="warn">Rattrapage</Pill>}</div>
                  <div className="meta">Du {dateLongue(p.debut)} au {dateLongue(p.fin)}{p.motif ? ` · motif : ${p.motif}` : ""}</div>
                  <div className="meta">
                    {lieu
                      ? `${lieu.ent.nom}${lieu.ent.ville ? `, ${lieu.ent.ville}` : ""}${lieu.s.tuteur ? ` · tuteur ${lieu.s.tuteur.nom}${lieu.s.tuteur.telephone ? `, ${lieu.s.tuteur.telephone}` : ""}` : lieu.ent.telephone ? ` · ${lieu.ent.telephone}` : ""}`
                      : "Aucun lieu de stage enregistré : l'élève est attendu au lycée."}
                  </div>
                  {lieu && <details style={{ marginTop: 6 }}><summary className="btn small">Horaires</summary><TableHoraires h={lieu.s.horaires} /></details>}
                </div>
                <EtatPeriode p={p} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>Absences en stage</h2>
        <div className="panel rows">
          {absences.length === 0 && <div className="empty">Aucune absence signalée.</div>}
          {absences.map((x) => {
            const lieu = lieux.find((l) => l.s.id === x.stageId);
            const n = lieu ? joursDAbsence(lieu.s.horaires, x) : null;
            return (
              <div key={x.id} className="row">
                <div className="main">
                  <div className="name">Absence {texteAbsence(x)}{n !== null ? ` · ${n} jour${n > 1 ? "s" : ""} de stage` : ""}</div>
                  <div className="meta">
                    Signalée par {ORIGINES_ABSENCE[x.origine]} le {dateCourte(x.createdAt.toISOString().slice(0, 10))}{x.commentaire ? ` · « ${x.commentaire} »` : ""}
                    {x.justifieeLe && ` · motif : ${x.motif}${x.justification ? ` (${x.justification})` : ""}`}
                  </div>
                  {x.documentId && <a className="sub" href={`/fichiers/${x.documentId}`} target="_blank" rel="noopener">Voir le justificatif</a>}
                </div>
                {x.justifieeLe ? <Pill ton="ok">Justifiée</Pill> : <Pill ton="bad">Non justifiée</Pill>}
              </div>
            );
          })}
        </div>
      </div>

      {parents.length > 0 && (
        <div className="panel pad section">
          <h2>Responsables légaux</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parents.map((u) => <li key={u.id}>{u.prenom} {u.nom}{u.telephone ? ` · ${u.telephone}` : ""} · {u.email}</li>)}
          </ul>
        </div>
      )}

      <NotesEleve ctx={ctx} eleve={e} />
    </>
  );
}
