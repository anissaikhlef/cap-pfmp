import Link from "next/link";
import { asc, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { completerReglages } from "@/db/schema";
import { contexte } from "@/lib/auth";
import { AGENTS, LIBELLES_FORMULES, LISTE_AGENTS, euros, formuleDe, prixMensuel } from "@/lib/agents";
import { iaBranchee } from "@/lib/ia";
import { reglagesPlateforme, usageDuMois } from "@/lib/plateforme";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { enregistrerTarifs } from "./actions";

export const metadata = { title: "Administration de Cap PFMP" };

/**
 * Administration de Cap PFMP (compte « admin ») : les tarifs de chaque formule, les plafonds d'usage des agents, et la liste
 * des lycées avec leurs agents et leur usage du mois. Aucune donnée d'élève n'y figure.
 */
export default async function Admin() {
  await contexte({ roles: ["admin"] });
  const { tarifs, plafonds } = await reglagesPlateforme();
  const lycees = await db.select().from(schema.etablissements).where(isNull(schema.etablissements.entrainementDeId)).orderBy(asc(schema.etablissements.nom));
  const lignes = await Promise.all(lycees.map(async (l) => ({ l, r: completerReglages(l.reglages), u: await usageDuMois(l.id) })));
  const total = lignes.reduce((s, x) => s + prixMensuel(tarifs, x.r), 0);
  return (
    <>
      <Entete titre="Administration de Cap PFMP" sous="Les montants de l'abonnement selon les agents choisis, les plafonds d'usage, et les lycées.">
        <div className="actions"><Link className="btn" href="/admin/veille">Veille réglementaire</Link></div>
      </Entete>
      {!iaBranchee() && <p className="note">Aucune clé d&apos;IA n&apos;est configurée : les agents répondent avec des textes d&apos;exemple. Ajoutez ANTHROPIC_API_KEY dans les variables de l&apos;hébergement pour les brancher.</p>}
      <Formulaire action={enregistrerTarifs} bouton="Enregistrer les tarifs" viderApres={false}>
        <div className="panel pad section">
          <h2>Montant mensuel de chaque formule (en euros)</h2>
          <p className="sub">Cap Admin (agent 1) est toujours inclus ; le lycée ajoute Cap Veille (agent 2), Cap Partenaires (agent 3), ou les deux. Un changement de formule compte à partir du mois suivant.</p>
          <div className="grid2">
            {(Object.keys(LIBELLES_FORMULES) as (keyof typeof tarifs)[]).map((k) => (
              <label key={k} className="f" htmlFor={`t-${k}`}>{LIBELLES_FORMULES[k]}<input id={`t-${k}`} name={k} type="number" min={0} step={0.01} defaultValue={tarifs[k]} /></label>
            ))}
          </div>
        </div>
        <div className="panel pad section">
          <h2>Plafonds d&apos;usage, par lycée et par mois</h2>
          <p className="sub">Au-delà, l&apos;agent s&apos;arrête jusqu&apos;au mois suivant (0 : sans plafond). Cap Veille travaille pour tous les lycées à la fois : pas de plafond par lycée.</p>
          <div className="grid2">
            <label className="f" htmlFor="plafondAdministratif">{AGENTS.administratif.nom} : demandes par mois<input id="plafondAdministratif" name="plafondAdministratif" type="number" min={0} defaultValue={plafonds.administratif} /></label>
            <label className="f" htmlFor="plafondEntreprises">{AGENTS.entreprises.nom} : demandes par mois<input id="plafondEntreprises" name="plafondEntreprises" type="number" min={0} defaultValue={plafonds.entreprises} /></label>
          </div>
        </div>
      </Formulaire>
      <div className="section">
        <h2>Lycées ({lignes.length}) · {euros(total)} par mois</h2>
        <div className="panel rows">
          {lignes.map(({ l, r, u }) => (
            <div key={l.id} className="row">
              <div className="main">
                <div className="name">{l.nom}{l.ville ? <span className="cls">{l.ville}</span> : null}</div>
                <div className="meta">{LIBELLES_FORMULES[formuleDe(r)]} · {euros(prixMensuel(tarifs, r))} par mois · ce mois-ci : {LISTE_AGENTS.filter((k) => k !== "veille").map((k) => `${AGENTS[k].nom} ${u[k]} demande(s)`).join(", ")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
