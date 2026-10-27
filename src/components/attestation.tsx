import type { AttestationStage, RempliePar } from "@/db/schema";
import type { ContexteConvention } from "@/lib/convention";
import type { EtatAttestation } from "@/lib/attestation";
import { REMPLIE_PAR } from "@/lib/modeles";
import { dateLongue } from "@/lib/dates";
import { Formulaire, type Etat } from "./Formulaire";
import { ChoixSignature } from "./ChoixSignature";

const CHOIX: Record<RempliePar, string> = {
  tuteur_eleve_professeur: "Le tuteur, avec l'élève et le professeur",
  tuteur_eleve: "Le tuteur, avec l'élève",
  tuteur: "Le tuteur seul",
};

/**
 * L'attestation de stage remplie en ligne : le tuteur indique qui la remplit avec lui (l'élève, le professeur, quand c'est
 * possible), vérifie les jours comptés par Cap PFMP, décrit les activités de l'élève et signe.
 */
export function FormulaireAttestation({ action, cv, etat, cache, modeles, rempliePar, consigne }: {
  action: (e: Etat, fd: FormData) => Promise<Etat>;
  cv: ContexteConvention;
  etat: EtatAttestation;
  /** Champs cachés propres à chaque page (visite, stage ou lien personnel). */
  cache: Record<string, string>;
  modeles: ("simple" | "dessinee")[];
  rempliePar: RempliePar;
  consigne?: string;
}) {
  const b = etat.bilan;
  // Plusieurs attestations peuvent se trouver sur une même page (espace du tuteur) : des identifiants propres au stage.
  const id = (x: string) => `at-${cv.s.id.slice(0, 8)}-${x}`;
  return (
    <Formulaire action={action} bouton="Signer l'attestation">
      {Object.entries(cache).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset className="choices" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sub">Qui remplit l&apos;attestation ?</legend>
        {(Object.keys(CHOIX) as RempliePar[]).map((k) => (
          <label key={k} className="choice"><input type="radio" name="rempliePar" value={k} defaultChecked={k === rempliePar} required /> <span>{CHOIX[k]}</span></label>
        ))}
      </fieldset>
      <p className="sub" style={{ margin: 0 }}>
        Stage du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)} : {b.prevus} jour{b.prevus > 1 ? "s" : ""} prévu{b.prevus > 1 ? "s" : ""}
        {b.absences ? `, dont ${b.absences} jour${b.absences > 1 ? "s" : ""} d'absence signalé${b.absences > 1 ? "s" : ""} au lycée` : ", aucune absence signalée au lycée"}. Corrigez si besoin.
      </p>
      <div className="grid2">
        <label className="f" htmlFor={id("jours")}>Jours de stage effectués<input id={id("jours")} name="joursEffectues" type="number" min={0} max={400} defaultValue={b.effectues} required /></label>
        <label className="f" htmlFor={id("absences")}>Jours d&apos;absence<input id={id("absences")} name="joursAbsence" type="number" min={0} max={400} defaultValue={b.absences} required /></label>
      </div>
      <label className="f" htmlFor={id("activites")}>Activités réalisées par l&apos;élève<textarea id={id("activites")} name="activites" rows={4} required minLength={10} maxLength={3000} placeholder="Les tâches confiées, les postes occupés, le matériel utilisé…" /></label>
      <label className="f" htmlFor={id("appreciation")}>Appréciation (facultatif)<textarea id={id("appreciation")} name="appreciation" rows={2} maxLength={2000} /></label>
      <div className="grid2">
        <label className="f" htmlFor={id("nom")}>Personne qui signe pour l&apos;entreprise<input id={id("nom")} name="signataireNom" defaultValue={cv.s.tuteur?.nom ?? cv.ent.tuteurNom ?? ""} required maxLength={120} /></label>
        <label className="f" htmlFor={id("fonction")}>Fonction<input id={id("fonction")} name="signataireFonction" defaultValue={cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction ?? ""} maxLength={120} /></label>
      </div>
      {consigne && <p className="sub" style={{ margin: 0 }}>{consigne}</p>}
      <ChoixSignature modeles={modeles} engagement="Je certifie exactes les informations de cette attestation." />
    </Formulaire>
  );
}

/** L'attestation déjà remplie en ligne : quand, par qui, et les jours déclarés. */
export function ResumeAttestation({ att }: { att: AttestationStage }) {
  return (
    <p className="sub" style={{ margin: 0 }}>
      Remplie en ligne le {dateLongue(att.le.slice(0, 10))} par {REMPLIE_PAR[att.rempliePar]}{att.professeur ? ` (${att.professeur})` : ""}, signée par {att.signataire.nom}
      {" "}: {att.joursEffectues} jour{att.joursEffectues > 1 ? "s" : ""} effectué{att.joursEffectues > 1 ? "s" : ""}, {att.joursAbsence} jour{att.joursAbsence > 1 ? "s" : ""} d&apos;absence.
    </p>
  );
}
