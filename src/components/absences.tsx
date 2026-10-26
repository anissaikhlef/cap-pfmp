import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "@/lib/auth";
import { chargerConvention, type ContexteConvention } from "@/lib/convention";
import { absencesDuStage, droitsAbsences, type Absence } from "@/lib/absences";
import { peutGererEleve } from "@/lib/acces";
import { aujourdhui, dateCourte, ajouterJours } from "@/lib/dates";
import { joursDAbsence, joursEffectues } from "@/lib/regles";
import { MOTIFS_ABSENCE, ORIGINES_ABSENCE } from "@/lib/constantes-absences";
import { Formulaire } from "./Formulaire";
import { ChampRetour } from "./ChampRetour";
import { Pill } from "./ui";
import { justifierAbsence, retirerAbsence, signalerAbsence } from "@/app/(app)/eleves/absence-actions";

export function texteAbsence(x: { debut: string; fin: string }) {
  return x.debut === x.fin ? `le ${dateCourte(x.debut)}` : `du ${dateCourte(x.debut)} au ${dateCourte(x.fin)}`;
}

function ChampsJustification({ id }: { id: string }) {
  return (
    <div className="grid3">
      <label className="f" htmlFor={`am-${id}`}>Motif
        <select id={`am-${id}`} name="motif" defaultValue="">
          <option value="">— Choisir —</option>
          {MOTIFS_ABSENCE.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="f" htmlFor={`aj-${id}`}>Précision (facultatif)<input id={`aj-${id}`} name="justification" maxLength={500} /></label>
      <label className="f" htmlFor={`af-${id}`}>Justificatif (facultatif)<input id={`af-${id}`} name="fichier" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,.heic" /></label>
    </div>
  );
}

type Presence = { cv: ContexteConvention; droits: Awaited<ReturnType<typeof droitsAbsences>>; liste: Absence[]; gestion: boolean };

async function chargerPresence(ctx: Contexte, stageId: string): Promise<Presence | null> {
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return null;
  return { cv, droits: await droitsAbsences(ctx, cv), liste: await absencesDuStage(stageId), gestion: await peutGererEleve(ctx, cv.e) };
}

/** Un stage se montre dès qu'il a commencé ou qu'il a des absences ; avant, seulement à la famille qui peut prévenir d'une absence. */
function aMontrer(x: Presence, jour: string) {
  return jour >= x.cv.p.debut || x.liste.length > 0 || (x.droits.signaler === "famille" && jour <= x.cv.p.fin);
}

function PastillePresence({ listes, commence }: { listes: Absence[][]; commence: boolean }) {
  const toutes = listes.flat();
  if (toutes.some((x) => !x.justifieeLe)) return <Pill ton="bad">Absence non justifiée</Pill>;
  if (toutes.length) return <Pill ton="ok">Absences justifiées</Pill>;
  return commence ? <Pill ton="ok">Aucune absence</Pill> : null;
}

/** Jours effectués d'un stage, ses absences, et les formulaires permis à la personne connectée. */
function ContenuPresence({ ctx, x, jour }: { ctx: Contexte; x: Presence; jour: string }) {
  const { cv, droits, liste, gestion } = x;
  const stageId = cv.s.id;
  const commence = jour >= cv.p.debut;
  const bilan = joursEffectues(cv.s.horaires, cv.p.debut, cv.p.fin, liste, jour);
  const maxSignalement = droits.signaler === "entreprise" ? (jour < cv.p.fin ? jour : cv.p.fin) : cv.p.fin;
  return (
    <>
      {commence && (
        <>
          <p style={{ margin: 0 }}>
            <b className="num">{bilan.effectues}</b> jour{bilan.effectues > 1 ? "s" : ""} effectué{bilan.effectues > 1 ? "s" : ""} sur {bilan.prevus} prévu{bilan.prevus > 1 ? "s" : ""}
            {bilan.absences > 0 && <> · <b className="num">{bilan.absences}</b> jour{bilan.absences > 1 ? "s" : ""} d&apos;absence</>}
            {bilan.aVenir > 0 && <span className="sub"> · {bilan.aVenir} à venir</span>}
          </p>
          <details>
            <summary className="btn small">Détail par semaine</summary>
            <div className="tbl">
              <table>
                <thead><tr><th>Semaine</th><th>Prévus</th><th>Absences</th><th>Effectués</th></tr></thead>
                <tbody>
                  {bilan.semaines.map((s) => (
                    <tr key={s.lundi}><td>du {dateCourte(s.lundi)} au {dateCourte(ajouterJours(s.lundi, 6))}</td><td className="num">{s.prevus}</td><td className="num">{s.absences}</td><td className="num">{s.effectues}{s.aVenir ? <span className="sub"> (+{s.aVenir} à venir)</span> : null}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ margin: "6px 0 0" }}>Un jour compte dès que l&apos;élève a des horaires ce jour-là. Ce décompte servira au dossier d&apos;allocation.</p>
          </details>
        </>
      )}
      {liste.length > 0 && (
        <div className="panel rows">
          {liste.map((a) => {
            const n = joursDAbsence(cv.s.horaires, a);
            const peutRetirer = a.signaleParId === ctx.user.id || gestion;
            return (
              <div key={a.id} className="row" style={{ alignItems: "flex-start" }}>
                <div className="main">
                  <div className="name">Absence {texteAbsence(a)} <span className="sub">· {n} jour{n > 1 ? "s" : ""} de stage</span></div>
                  <div className="meta">
                    Signalée par {ORIGINES_ABSENCE[a.origine]}{a.commentaire ? ` · « ${a.commentaire} »` : ""}
                    {a.justifieeLe && ` · Motif : ${a.motif}${a.justification ? ` (${a.justification})` : ""}`}
                  </div>
                  {a.documentId && droits.signaler !== "entreprise" && <a className="sub" href={`/fichiers/${a.documentId}`} target="_blank" rel="noopener">Voir le justificatif</a>}
                  {!a.justifieeLe && droits.justifier && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="btn small primary">Justifier cette absence</summary>
                      <Formulaire action={justifierAbsence} bouton="Enregistrer la justification" boutonClasse="btn small primary">
                        <input type="hidden" name="absenceId" value={a.id} />
                        <ChampsJustification id={a.id} />
                      </Formulaire>
                    </details>
                  )}
                </div>
                {a.justifieeLe ? <Pill ton="ok">Justifiée</Pill> : <Pill ton="bad">Non justifiée</Pill>}
                {peutRetirer && (
                  <form action={retirerAbsence}><ChampRetour /><input type="hidden" name="absenceId" value={a.id} /><button className="btn small danger" title="Absence signalée par erreur">Retirer</button></form>
                )}
              </div>
            );
          })}
        </div>
      )}
      {droits.signaler && (droits.signaler !== "entreprise" || commence) && (
        <details>
          <summary className="btn small">Signaler une absence</summary>
          <Formulaire action={signalerAbsence} bouton="Signaler l'absence">
            <input type="hidden" name="stageId" value={stageId} />
            <div className="grid3">
              <label className="f" htmlFor={`ad-${stageId}`}>Absent(e) le<input id={`ad-${stageId}`} name="debut" type="date" min={cv.p.debut} max={maxSignalement} required /></label>
              <label className="f" htmlFor={`afin-${stageId}`}>Jusqu&apos;au (inclus, facultatif)<input id={`afin-${stageId}`} name="fin" type="date" min={cv.p.debut} max={cv.p.fin} /></label>
              <label className="f" htmlFor={`ac-${stageId}`}>Commentaire (facultatif)<input id={`ac-${stageId}`} name="commentaire" maxLength={500} placeholder={droits.signaler === "entreprise" ? "Ex. ne s'est pas présenté, sans nouvelles" : ""} /></label>
            </div>
            {droits.justifier && (
              <>
                <p className="sub" style={{ margin: 0 }}>Vous pouvez justifier l&apos;absence tout de suite en indiquant le motif.</p>
                <ChampsJustification id={`n-${stageId}`} />
              </>
            )}
            <p className="sub" style={{ margin: 0 }}>
              {droits.signaler === "famille"
                ? "La vie scolaire, le professeur référent et la gestion des stages sont prévenus."
                : "La vie scolaire, le professeur référent, la gestion des stages et la famille sont prévenus."}
            </p>
          </Formulaire>
        </details>
      )}
    </>
  );
}

/** Présence sur un seul stage : pour le tuteur, qui ne voit que le stage chez lui. */
export async function BlocAbsences({ ctx, stageId }: { ctx: Contexte; stageId: string }) {
  const x = await chargerPresence(ctx, stageId);
  const jour = aujourdhui();
  if (!x || !aMontrer(x, jour)) return null;
  return (
    <div className="panel pad section" id={`presence-${stageId}`}>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Présence en stage</h2>
        <PastillePresence listes={[x.liste]} commence={jour >= x.cv.p.debut} />
      </div>
      <ContenuPresence ctx={ctx} x={x} jour={jour} />
    </div>
  );
}

/**
 * Présence d'un élève sur tous ses stages de l'année (période de la classe et rattrapages) :
 * une absence d'une période précédente reste visible et peut toujours être justifiée.
 */
export async function BlocPresenceEleve({ ctx, eleve }: { ctx: Contexte; eleve: { id: string } }) {
  const stages = await db.select({ id: schema.stages.id }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.stages.eleveId, eleve.id), eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(asc(schema.periodes.debut));
  const jour = aujourdhui();
  const presences = (await Promise.all(stages.map((s) => chargerPresence(ctx, s.id)))).filter((x): x is Presence => !!x && aMontrer(x, jour));
  if (!presences.length) return null;
  return (
    <div className="panel pad section" id={`presence-${eleve.id}`}>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Présence en stage</h2>
        <PastillePresence listes={presences.map((x) => x.liste)} commence={presences.some((x) => jour >= x.cv.p.debut)} />
      </div>
      {presences.map((x) => (
        <div key={x.cv.s.id} className="section">
          {presences.length > 1 && <h3>{x.cv.p.libelle} · {x.cv.ent.nom} <span className="sub">du {dateCourte(x.cv.p.debut)} au {dateCourte(x.cv.p.fin)}</span></h3>}
          <ContenuPresence ctx={ctx} x={x} jour={jour} />
        </div>
      ))}
    </div>
  );
}
