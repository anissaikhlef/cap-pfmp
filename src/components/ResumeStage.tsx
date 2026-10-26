import type { dossierStage } from "@/lib/stages";
import { statutEleve, signaturesCompletes, type Statut } from "@/lib/regles";
import { aujourdhui, dateCourte, dateLongue } from "@/lib/dates";
import { texteperiode } from "@/lib/requetes";
import { Pastille } from "./ui";
import { ListeRegles, TableHoraires } from "./stage";

type Dossier = Awaited<ReturnType<typeof dossierStage>>;

export function statutDossier(d: Dossier, docsValides: string[] = []): Statut | null {
  if (!d.periode) return null;
  return statutEleve({
    aujourdhui: aujourdhui(), debut: d.periode.debut, fin: d.periode.fin, aUnStage: !!d.stage,
    conventionComplete: !!d.stage && signaturesCompletes(d.stage.signatures, d.requis),
    attestationValidee: docsValides.includes("attestation"), livretValide: docsValides.includes("livret"),
  });
}

const ETAPES = ["Recherche", "Convention", "En stage", "Documents"];
const INDEX: Record<Statut, number> = { sans_stage: 0, convention: 1, pret: 1, en_stage: 2, en_stage_sans_convention: 2, documents: 3, termine: 4 };

export function Progression({ statut }: { statut: Statut | null }) {
  const i = statut ? INDEX[statut] : 0;
  return (
    <div className="steps" aria-label="Avancement">
      {ETAPES.map((l, k) => <div key={l} className={k < i ? "done" : k === i ? "on" : ""}><i />{l}</div>)}
    </div>
  );
}

export function ResumeStage({ d, statut }: { d: Dossier; statut: Statut | null }) {
  return (
    <div className="section">
      <div className="panel pad section">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <span className="sub">{d.classe?.libelle} · {texteperiode(d.periode)}</span>
          {statut && <Pastille statut={statut} />}
        </div>
        <Progression statut={statut} />
        {d.periode && <p className="sub" style={{ margin: 0 }}>Stage du {dateLongue(d.periode.debut)} au {dateLongue(d.periode.fin)}.</p>}
      </div>
      {d.stage && d.entreprise && (
        <div className="grid2">
          <div className="panel pad section">
            <h2>{d.entreprise.nom}</h2>
            <dl className="kv">
              <dt>Adresse</dt><dd>{[d.entreprise.adresse, d.entreprise.ville].filter(Boolean).join(", ") || "—"}</dd>
              <dt>Tuteur</dt><dd>{d.entreprise.tuteurNom ?? "—"}{d.entreprise.tuteurFonction ? `, ${d.entreprise.tuteurFonction}` : ""}</dd>
              <dt>Premier jour</dt><dd>{d.periode ? dateCourte(d.periode.debut) : "—"}</dd>
            </dl>
            <h3>Règles du stage</h3>
            <ListeRegles regles={d.regles} />
          </div>
          <div className="panel pad section"><h2>Horaires</h2><TableHoraires h={d.stage.horaires} /></div>
        </div>
      )}
    </div>
  );
}
