import Link from "next/link";
import { contexte } from "@/lib/auth";
import { NB_LIGNES, NB_TRANCHES, NB_ZONES } from "@/lib/frais";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { enregistrerBareme } from "./actions";

export const metadata = { title: "Barème des frais de déplacement" };

/** Nombre affiché à la française : 0.636 → « 0,636 ». */
const fr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/**
 * Le barème des frais de visite : chaque lycée recopie sa propre méthode de calcul, comme dans son annexe de
 * remboursement (décision d'Anissa : « chaque lycée applique son calcul »).
 */
export default async function BaremeFrais() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const b = ctx.etab.reglages.frais;
  const lignes = [...b.kilometrique, ...Array.from({ length: NB_LIGNES }, () => null)].slice(0, Math.max(NB_LIGNES, b.kilometrique.length)).slice(0, NB_LIGNES);
  const zones = [...b.nuitees, ...Array.from({ length: NB_ZONES }, () => null)].slice(0, NB_ZONES);
  return (
    <>
      <Entete titre="Barème des frais de déplacement" sous="Recopiez la méthode de calcul de votre lycée, comme dans votre annexe de remboursement. Les professeurs préparent leur demande après chaque visite ; la gestion des PFMP la valide.">
        <Link className="btn" href="/organisation">Organisation du lycée</Link>
      </Entete>
      <Formulaire action={enregistrerBareme} bouton="Enregistrer le barème">
        <div className="panel pad section">
          <h2>Barème kilométrique</h2>
          <p className="sub" style={{ margin: 0 }}>
            Une ligne par véhicule (ex. « Voiture 5 CV », « Moto 3 à 5 CV »). Chaque tranche va jusqu&apos;à un nombre de kilomètres parcourus dans l&apos;année ;
            le montant vaut kilomètres × taux + montant fixe (ex. « jusqu&apos;à 5000 km : km × 0,636 », puis « jusqu&apos;à 20000 km : km × 0,357 + 1395 € »).
            Laissez « jusqu&apos;à » vide pour la dernière tranche. Un barème plafonné (ex. à 7 CV) : arrêtez les lignes à cette puissance.
          </p>
          <div className="panel rows">
            {lignes.map((l, i) => (
              <div key={i} className="row bareme-ligne">
                <label className="f" htmlFor={`v-${i}`} style={{ minWidth: 170, flex: 1 }}>Véhicule {i + 1}<input id={`v-${i}`} name={`v_${i}`} defaultValue={l?.vehicule ?? ""} maxLength={80} placeholder={i === 0 ? "Ex. Voiture 5 CV" : undefined} /></label>
                {Array.from({ length: NB_TRANCHES }, (_, k) => {
                  const t = l?.tranches[k];
                  return (
                    <fieldset key={k} className="tranche">
                      <legend>Tranche {k + 1}</legend>
                      <label className="f" htmlFor={`j-${i}-${k}`}>jusqu&apos;à (km)<input id={`j-${i}-${k}`} name={`j_${i}_${k}`} inputMode="decimal" defaultValue={fr(t?.jusqua)} /></label>
                      <label className="f" htmlFor={`t-${i}-${k}`}>km ×<input id={`t-${i}-${k}`} name={`t_${i}_${k}`} inputMode="decimal" defaultValue={fr(t?.taux)} /></label>
                      <label className="f" htmlFor={`f-${i}-${k}`}>+ € fixe<input id={`f-${i}-${k}`} name={`f_${i}_${k}`} inputMode="decimal" defaultValue={t?.fixe ? fr(t.fixe) : ""} /></label>
                    </fieldset>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="panel pad section">
          <h2>Repas et nuitées</h2>
          <label className="f" htmlFor="repas" style={{ maxWidth: 220 }}>Montant d&apos;un repas (€)<input id="repas" name="repas" inputMode="decimal" defaultValue={b.repas ? fr(b.repas) : ""} placeholder="Ex. 20,20" /></label>
          <p className="sub" style={{ margin: 0 }}>Montant d&apos;une nuitée selon le lieu (ex. « Paris et petite couronne », « Autres départements »).</p>
          {zones.map((z, k) => (
            <div key={k} className="grid2" style={{ gridTemplateColumns: "1fr 160px" }}>
              <label className="f" htmlFor={`nz-${k}`}>Lieu {k + 1}<input id={`nz-${k}`} name={`nz_${k}`} defaultValue={z?.zone ?? ""} maxLength={80} /></label>
              <label className="f" htmlFor={`nm-${k}`}>Montant (€)<input id={`nm-${k}`} name={`nm_${k}`} inputMode="decimal" defaultValue={z ? fr(z.montant) : ""} /></label>
            </div>
          ))}
        </div>
        <div className="panel pad section">
          <h2>Consignes</h2>
          <label className="f" htmlFor="consignes">Ce qui ne se calcule pas, montré au professeur avec sa demande (trajet retenu, billet de train hors de la région, justificatifs…)<textarea id="consignes" name="consignes" rows={4} defaultValue={b.consignes} maxLength={3000} /></label>
        </div>
      </Formulaire>
    </>
  );
}
