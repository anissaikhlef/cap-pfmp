import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import type { Periode } from "@/lib/requetes";
import { Formulaire } from "./Formulaire";
import { ChampRetour } from "./ChampRetour";
import { Pill } from "./ui";
import { annulerRattrapage, modifierRattrapage, programmerRattrapage } from "@/app/(app)/eleves/rattrapage-actions";

/** Pastille d'une période dans le temps : à venir, en cours, terminée. */
export function EtatPeriode({ p, jour = aujourdhui() }: { p: { debut: string; fin: string }; jour?: string }) {
  if (jour < p.debut) return <Pill ton="info">À venir</Pill>;
  if (jour <= p.fin) return <Pill ton="warn">En cours</Pill>;
  return <Pill ton="muted">Terminé</Pill>;
}

/**
 * Rattrapages d'un élève : périodes de stage propres à lui, hors des périodes de sa classe.
 * La gestion des PFMP et le professeur référent peuvent les programmer ; la vie scolaire est prévenue.
 */
export async function BlocRattrapages({ eleveId, periodes, peutGerer }: { eleveId: string; periodes: Periode[]; peutGerer: boolean }) {
  const rattrapages = periodes.filter((p) => p.eleveId === eleveId);
  const deLaClasse = periodes.filter((p) => !p.eleveId);
  const lieux = rattrapages.length
    ? await db.select({ periodeId: schema.stages.periodeId, ent: schema.entreprises }).from(schema.stages)
      .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
      .where(inArray(schema.stages.periodeId, rattrapages.map((r) => r.id)))
    : [];
  if (!rattrapages.length && !peutGerer) return null;
  return (
    <div className="panel pad section" id="rattrapages">
      <h2>Rattrapages</h2>
      <p className="sub" style={{ margin: 0 }}>Une période de stage propre à l&apos;élève, en dehors des périodes de sa classe. Elle se déroule comme un stage normal : convention, règles, visite, attestation. La vie scolaire est prévenue automatiquement.</p>
      {rattrapages.length > 0 && (
        <div className="panel rows">
          {rattrapages.map((r) => {
            const lieu = lieux.find((l) => l.periodeId === r.id)?.ent;
            return (
              <div key={r.id} className="row" style={{ alignItems: "flex-start" }}>
                <div className="main">
                  <div className="name"><a href={`/eleves/${eleveId}?periode=${r.id}`}>{r.libelle}</a> · du {dateLongue(r.debut)} au {dateLongue(r.fin)}</div>
                  <div className="meta">{r.motif ? `Motif : ${r.motif} · ` : ""}{lieu ? `Lieu : ${lieu.nom}${lieu.ville ? `, ${lieu.ville}` : ""}` : "Lieu de stage à enregistrer"}</div>
                  {peutGerer && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="btn small">Modifier</summary>
                      <Formulaire action={modifierRattrapage} bouton="Enregistrer le rattrapage" boutonClasse="btn small primary">
                        <input type="hidden" name="eleveId" value={eleveId} />
                        <input type="hidden" name="id" value={r.id} />
                        <div className="grid3">
                          <label className="f" htmlFor={`rd-${r.id}`}>Début<input id={`rd-${r.id}`} name="debut" type="date" defaultValue={r.debut} required /></label>
                          <label className="f" htmlFor={`rf-${r.id}`}>Fin<input id={`rf-${r.id}`} name="fin" type="date" defaultValue={r.fin} required /></label>
                          <label className="f" htmlFor={`rm-${r.id}`}>Motif<input id={`rm-${r.id}`} name="motif" defaultValue={r.motif ?? ""} required /></label>
                        </div>
                      </Formulaire>
                      {!lieu && (
                        <form action={annulerRattrapage} className="actions" style={{ marginTop: 8 }}>
                          <ChampRetour />
                          <input type="hidden" name="eleveId" value={eleveId} /><input type="hidden" name="id" value={r.id} />
                          <button className="btn small danger">Annuler ce rattrapage</button>
                        </form>
                      )}
                    </details>
                  )}
                </div>
                <EtatPeriode p={r} />
              </div>
            );
          })}
        </div>
      )}
      {peutGerer && (
        <details>
          <summary className="btn small">Programmer un rattrapage</summary>
          <Formulaire action={programmerRattrapage} bouton="Programmer le rattrapage">
            <input type="hidden" name="eleveId" value={eleveId} />
            <div className="grid2">
              <label className="f" htmlFor="ra-periode">Période rattrapée
                <select id="ra-periode" name="rattrapeId" defaultValue="">
                  <option value="">— Aucune en particulier —</option>
                  {deLaClasse.map((p) => <option key={p.id} value={p.id}>{p.libelle} (du {dateCourte(p.debut)} au {dateCourte(p.fin)})</option>)}
                </select>
              </label>
              <label className="f" htmlFor="ra-motif">Motif<input id="ra-motif" name="motif" placeholder="Ex. absence pour maladie pendant la PFMP 1" required /></label>
              <label className="f" htmlFor="ra-debut">Début du rattrapage<input id="ra-debut" name="debut" type="date" required /></label>
              <label className="f" htmlFor="ra-fin">Fin du rattrapage<input id="ra-fin" name="fin" type="date" required /></label>
            </div>
          </Formulaire>
        </details>
      )}
    </div>
  );
}
