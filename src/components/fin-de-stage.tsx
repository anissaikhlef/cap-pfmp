import type { AttestationStage, LivretStage, RempliePar } from "@/db/schema";
import type { ContexteConvention } from "@/lib/convention";
import type { EtatAttestation } from "@/lib/attestation";
import type { ActiviteJour, EtatLivret } from "@/lib/livret";
import { REMPLIE_PAR } from "@/lib/modeles";
import { dateLongue, JOURS, jourSemaine } from "@/lib/dates";
import { Formulaire, type Etat } from "./Formulaire";
import { ChoixSignature } from "./ChoixSignature";

/*
 * Attestation et livret remplis en ligne par le tuteur (décision d'Anissa : avec l'élève et le professeur quand c'est possible,
 * sinon avec l'élève, sinon seul), et carnet de bord de l'élève. Plusieurs formulaires peuvent se trouver sur une même page
 * (espace du tuteur) : leurs identifiants sont propres au stage.
 */

type Action = (e: Etat, fd: FormData) => Promise<Etat>;
type Commun = {
  action: Action;
  cv: ContexteConvention;
  /** Champs cachés propres à chaque page (visite, stage ou lien personnel). */
  cache: Record<string, string>;
  modeles: ("simple" | "dessinee")[];
  rempliePar: RempliePar;
  consigne?: string;
};

const CHOIX: Record<RempliePar, string> = {
  tuteur_eleve_professeur: "Le tuteur, avec l'élève et le professeur",
  tuteur_eleve: "Le tuteur, avec l'élève",
  tuteur: "Le tuteur seul",
};

function ChoixRemplissage({ rempliePar, document }: { rempliePar: RempliePar; document: string }) {
  return (
    <fieldset className="choices" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sub">Qui remplit {document} ?</legend>
      {(Object.keys(CHOIX) as RempliePar[]).map((k) => (
        <label key={k} className="choice"><input type="radio" name="rempliePar" value={k} defaultChecked={k === rempliePar} required /> <span>{CHOIX[k]}</span></label>
      ))}
    </fieldset>
  );
}

function Signataire({ cv, id }: { cv: ContexteConvention; id: (x: string) => string }) {
  return (
    <div className="grid2">
      <label className="f" htmlFor={id("nom")}>Personne qui signe pour l&apos;entreprise<input id={id("nom")} name="signataireNom" defaultValue={cv.s.tuteur?.nom ?? cv.ent.tuteurNom ?? ""} required maxLength={120} /></label>
      <label className="f" htmlFor={id("fonction")}>Fonction<input id={id("fonction")} name="signataireFonction" defaultValue={cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction ?? ""} maxLength={120} /></label>
    </div>
  );
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * L'attestation de stage remplie en ligne : le tuteur indique qui la remplit avec lui, vérifie les jours comptés par
 * Cap PFMP, décrit les activités de l'élève et signe.
 */
export function FormulaireAttestation({ action, cv, etat, cache, modeles, rempliePar, consigne }: Commun & { etat: EtatAttestation }) {
  const b = etat.bilan;
  const id = (x: string) => `at-${cv.s.id.slice(0, 8)}-${x}`;
  return (
    <Formulaire action={action} bouton="Signer l'attestation">
      {Object.entries(cache).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <ChoixRemplissage rempliePar={rempliePar} document="l'attestation" />
      <p className="sub" style={{ margin: 0 }}>
        Stage du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)} : {pluriel(b.prevus, "jour")} prévu{b.prevus > 1 ? "s" : ""}
        {b.absences ? `, dont ${pluriel(b.absences, "jour")} d'absence signalé${b.absences > 1 ? "s" : ""} au lycée` : ", aucune absence signalée au lycée"}. Corrigez si besoin.
      </p>
      <div className="grid2">
        <label className="f" htmlFor={id("jours")}>Jours de stage effectués<input id={id("jours")} name="joursEffectues" type="number" min={0} max={400} defaultValue={b.effectues} required /></label>
        <label className="f" htmlFor={id("absences")}>Jours d&apos;absence<input id={id("absences")} name="joursAbsence" type="number" min={0} max={400} defaultValue={b.absences} required /></label>
      </div>
      <label className="f" htmlFor={id("activites")}>Activités réalisées par l&apos;élève<textarea id={id("activites")} name="activites" rows={4} required minLength={10} maxLength={3000} placeholder="Les tâches confiées, les postes occupés, le matériel utilisé…" /></label>
      <label className="f" htmlFor={id("appreciation")}>Appréciation (facultatif)<textarea id={id("appreciation")} name="appreciation" rows={2} maxLength={2000} /></label>
      <Signataire cv={cv} id={id} />
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
      {" "}: {pluriel(att.joursEffectues, "jour")} effectué{att.joursEffectues > 1 ? "s" : ""}, {pluriel(att.joursAbsence, "jour")} d&apos;absence.
    </p>
  );
}

/**
 * Le livret de compétences rempli en ligne : le tuteur choisit un niveau pour chaque attitude professionnelle (grille du lycée)
 * et chaque compétence du diplôme, à l'aide du carnet de bord de l'élève, écrit son bilan et signe.
 */
export function FormulaireLivret({ action, cv, etat, cache, modeles, rempliePar, consigne }: Commun & { etat: EtatLivret }) {
  const id = (x: string) => `lv-${cv.s.id.slice(0, 8)}-${x}`;
  return (
    <Formulaire action={action} bouton="Signer le livret">
      {Object.entries(cache).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <ChoixRemplissage rempliePar={rempliePar} document="le livret" />
      {etat.carnet.length > 0 && (
        <details>
          <summary className="btn small">Carnet de bord de l&apos;élève ({pluriel(etat.carnet.length, "jour")} noté{etat.carnet.length > 1 ? "s" : ""})</summary>
          <CarnetDeBord carnet={etat.carnet} />
        </details>
      )}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend><b>Attitudes professionnelles</b></legend>
        <div className="grid2">
          {etat.attitudes.map((g, i) => (
            <label key={i} className="f" htmlFor={id(`att-${i}`)}>{g.critere}
              <select id={id(`att-${i}`)} name={`att_${i}`} defaultValue="" required>
                <option value="" disabled>— Choisir —</option>
                {g.niveaux.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      {etat.competences.length > 0 && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><b>Compétences du diplôme{cv.c.filiere ? ` : ${cv.c.filiere}` : ""}</b></legend>
          <div className="grid2">
            {etat.competences.map((c, i) => (
              <label key={i} className="f" htmlFor={id(`comp-${i}`)}>{c}
                <select id={id(`comp-${i}`)} name={`comp_${i}`} defaultValue="" required>
                  <option value="" disabled>— Choisir —</option>
                  {etat.niveaux.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="f" htmlFor={id("bilan")}>Bilan : points forts, progrès à faire (facultatif)<textarea id={id("bilan")} name="bilan" rows={3} maxLength={3000} /></label>
      <Signataire cv={cv} id={id} />
      {consigne && <p className="sub" style={{ margin: 0 }}>{consigne}</p>}
      <ChoixSignature modeles={modeles} engagement="Je certifie les évaluations de ce livret." />
    </Formulaire>
  );
}

/** Le livret déjà rempli en ligne : quand et par qui. */
export function ResumeLivret({ livret }: { livret: LivretStage }) {
  return (
    <p className="sub" style={{ margin: 0 }}>
      Rempli en ligne le {dateLongue(livret.le.slice(0, 10))} par {REMPLIE_PAR[livret.rempliePar]}{livret.professeur ? ` (${livret.professeur})` : ""}, signé par {livret.signataire.nom}
      {" "}: {pluriel(livret.attitudes.length, "attitude")} et {pluriel(livret.competences.length, "compétence")} évaluée{livret.attitudes.length + livret.competences.length > 1 ? "s" : ""}.
    </p>
  );
}

/** Le carnet de bord : les activités notées par l'élève, du jour le plus récent au plus ancien. */
export function CarnetDeBord({ carnet }: { carnet: ActiviteJour[] }) {
  if (!carnet.length) return <p className="sub" style={{ margin: 0 }}>Aucune activité notée pour l&apos;instant.</p>;
  return (
    <div className="panel rows">
      {[...carnet].reverse().map((a) => (
        <div key={a.id} className="row" style={{ display: "block" }}>
          <div className="name">{JOURS[jourSemaine(a.date)]} {dateLongue(a.date)}</div>
          <p className="sub" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.texte}</p>
        </div>
      ))}
    </div>
  );
}
