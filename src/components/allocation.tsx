import type { Contexte } from "@/lib/auth";
import { schema } from "@/db";
import { dossierComplet, droitsPieces, LIBELLES_PIECES, piecesAllocation, stagesAllocation, type StageAllocation, type TypePiece } from "@/lib/allocations";
import { ajouterJours, dateCourte } from "@/lib/dates";
import { Formulaire } from "./Formulaire";
import { Pill } from "./ui";
import { deposerPieceAllocation } from "@/app/(app)/eleves/allocation-actions";
import { refuser, valider } from "@/app/(app)/documents/actions";

type Document = typeof schema.documents.$inferSelect;
const TYPES: TypePiece[] = ["rib", "piece_identite"];
/** Accord au féminin pour « la pièce d'identité ». */
const fem = (t: TypePiece) => (t === "piece_identite" ? "e" : "");
const jours = (n: number) => `${n} jour${n > 1 ? "s" : ""}`;

export function EtatPiece({ type, d, gestion }: { type: TypePiece; d?: Document; gestion: boolean }) {
  if (!d) return <Pill ton="warn">{gestion ? `${LIBELLES_PIECES[type]} manquant${fem(type)}` : "À déposer"}</Pill>;
  if (d.statut === "valide") return <Pill ton="ok">{gestion ? `${LIBELLES_PIECES[type]} vérifié${fem(type)}` : `Vérifié${fem(type)}`}</Pill>;
  if (d.statut === "refuse") return <Pill ton="bad">{gestion ? `${LIBELLES_PIECES[type]} refusé${fem(type)}` : "Refusé : à déposer de nouveau"}</Pill>;
  return <Pill ton="info">{gestion ? `${LIBELLES_PIECES[type]} à vérifier` : "Déposé, en cours de vérification"}</Pill>;
}

function EtatAttestation({ s, gestion }: { s: StageAllocation; gestion: boolean }) {
  if (s.attestation?.statut === "valide") return <Pill ton="ok">Attestation reçue</Pill>;
  if (s.attestation?.statut === "a_verifier") return <Pill ton="info">{gestion ? "Attestation à vérifier" : "Attestation en cours de vérification"}</Pill>;
  if (!s.termine) return <Pill ton="muted">Attestation à la fin du stage</Pill>;
  return <Pill ton="warn">Attestation attendue</Pill>;
}

/** Jours effectués semaine par semaine (absences déduites) : c'est ce décompte qui sert au calcul de l'allocation. */
export function TableSemaines({ s }: { s: StageAllocation }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr><th>Semaine</th><th>Jours prévus</th><th>Absences</th><th>Jours effectués</th></tr></thead>
        <tbody>
          {s.bilan.semaines.map((w) => (
            <tr key={w.lundi}>
              <td>du {dateCourte(w.lundi)} au {dateCourte(ajouterJours(w.lundi, 6))}</td>
              <td className="num">{w.prevus}</td><td className="num">{w.absences}</td>
              <td className="num">{w.effectues}{w.aVenir ? <span className="sub"> (+{w.aVenir} à venir)</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormDepot({ eleveId, type, bouton }: { eleveId: string; type: TypePiece; bouton: string }) {
  const id = `alloc-${type}-${eleveId}`;
  return (
    <Formulaire action={deposerPieceAllocation} className="actions" bouton={bouton} boutonClasse="btn small">
      <input type="hidden" name="eleveId" value={eleveId} />
      <input type="hidden" name="type" value={type} />
      <label className="f" htmlFor={id} style={{ flex: 1, minWidth: 180 }}>
        <span className="vh">Fichier : {LIBELLES_PIECES[type]}</span>
        <input id={id} name="fichier" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,.heic" required />
      </label>
    </Formulaire>
  );
}

/**
 * Dossier d'allocation de l'élève : RIB, pièce d'identité, attestations et jours effectués par semaine.
 * La famille (responsable légal, ou l'élève majeur) dépose les pièces ; la gestion des PFMP les vérifie.
 * La gestion peut aussi enregistrer une pièce reçue sur papier : rien ne l'indique à la famille,
 * pour que le dépôt par la famille reste la règle.
 */
export async function BlocAllocation({ ctx, eleve }: { ctx: Contexte; eleve: typeof schema.eleves.$inferSelect }) {
  const qui = await droitsPieces(ctx, eleve);
  if (!qui) return null;
  const gestion = qui === "gestion";
  const pieces = (await piecesAllocation([eleve.id])).get(eleve.id) ?? {};
  const stages = (await stagesAllocation(ctx, [eleve.id])).get(eleve.id) ?? [];
  const complet = dossierComplet(pieces, stages);
  return (
    <div className="panel pad section" id={`allocation-${eleve.id}`}>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <h2>Allocation de stage</h2>
        {complet ? <Pill ton="ok">Dossier complet</Pill> : gestion && <Pill ton="warn">Dossier incomplet</Pill>}
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {gestion
          ? "Pièces conservées pour toute la scolarité. Les jours effectués sont comptés semaine par semaine, absences déduites ; le montant n'est pas calculé ici."
          : "Pour le versement de l'allocation de stage, déposez le RIB et une pièce d'identité. Ils sont conservés pour toute la scolarité : inutile de les déposer de nouveau chaque année."}
      </p>
      <div className="grid2">
        {TYPES.map((t) => {
          const d = pieces[t];
          return (
            <div key={t} className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}><b>{LIBELLES_PIECES[t]}</b><EtatPiece type={t} d={d} gestion={gestion} /></div>
              {d && <a href={`/fichiers/${d.id}`} target="_blank" rel="noopener" className="sub">{d.nomFichier} · déposé le {dateCourte(d.deposeLe.toISOString().slice(0, 10))}</a>}
              {d?.statut === "refuse" && d.motifRefus && <p className="note" style={{ margin: 0 }}>{d.motifRefus}</p>}
              {gestion && d?.statut === "a_verifier" && (
                <div className="actions">
                  <form action={valider}><input type="hidden" name="id" value={d.id} /><button className="btn small primary">Valider</button></form>
                  <details>
                    <summary className="btn small">Refuser</summary>
                    <Formulaire action={refuser} className="actions" bouton="Confirmer le refus" boutonClasse="btn small danger">
                      <input type="hidden" name="id" value={d.id} />
                      <label className="f" htmlFor={`am-${d.id}`}>Motif transmis à la famille<input id={`am-${d.id}`} name="motif" placeholder="Ex. RIB illisible, pièce d'identité expirée" required /></label>
                    </Formulaire>
                  </details>
                </div>
              )}
              {gestion ? (
                <details>
                  <summary className="btn small">Enregistrer une pièce reçue</summary>
                  <FormDepot eleveId={eleve.id} type={t} bouton="Enregistrer" />
                </details>
              ) : (
                <FormDepot eleveId={eleve.id} type={t} bouton={d ? "Remplacer" : "Déposer"} />
              )}
            </div>
          );
        })}
      </div>
      {stages.length > 0 && (
        <div className="section">
          <h3>Jours effectués et attestations · {ctx.etab.anneeScolaire}</h3>
          {stages.map((s) => (
            <div key={s.stageId} className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <b>{s.periode} · {s.entreprise} <span className="sub">du {dateCourte(s.debut)} au {dateCourte(s.fin)}</span></b>
                <EtatAttestation s={s} gestion={gestion} />
              </div>
              <p style={{ margin: 0 }}>
                <b className="num">{s.bilan.effectues}</b> {s.bilan.effectues > 1 ? "jours effectués" : "jour effectué"} sur {s.bilan.prevus} prévu{s.bilan.prevus > 1 ? "s" : ""}
                {s.bilan.absences > 0 && ` · ${jours(s.bilan.absences)} d'absence`}
                {s.bilan.aVenir > 0 && <span className="sub"> · {s.bilan.aVenir} à venir</span>}
              </p>
              <details>
                <summary className="btn small">Détail par semaine</summary>
                <TableSemaines s={s} />
              </details>
            </div>
          ))}
          {!gestion && <p className="sub" style={{ margin: 0 }}>À la fin de chaque stage, l&apos;entreprise remplit l&apos;attestation de stage : elle complète le dossier d&apos;allocation.</p>}
        </div>
      )}
    </div>
  );
}
