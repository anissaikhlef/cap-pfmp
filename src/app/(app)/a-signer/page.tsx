import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { blocage, chargerConvention } from "@/lib/convention";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { ChoixSignature } from "@/components/ChoixSignature";
import { modelesAutorises } from "@/lib/signature";
import { signer } from "../documents/actions";
import { listeOrdresASigner, BlocOrdresASigner } from "@/components/visites";

export const metadata = { title: "À signer" };

export default async function ASigner() {
  const ctx = await contexte({ roles: ["direction"] });
  const stages = await db.select({ id: schema.stages.id, sig: schema.stages.signatures, c: schema.classes })
    .from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
  const enAttente = [];
  for (const s of stages.filter((x) => !x.sig.direction)) {
    const cv = await chargerConvention(ctx, s.id);
    if (cv) enAttente.push({ cv, blocage: blocage(ctx.etab, cv, "direction") });
  }
  enAttente.sort((x, y) => Number(!!x.blocage) - Number(!!y.blocage) || x.cv.p.debut.localeCompare(y.cv.p.debut));
  const ordres = await listeOrdresASigner(ctx);
  // La signature simple permet de signer d'un clic depuis la liste ; sinon, la direction dessine sa signature.
  const simple = modelesAutorises(ctx.etab.reglages).includes("simple");
  return (
    <>
      <div><h1>À signer</h1><p className="sub">{ctx.etab.reglages.dernierSignataire === "direction"
        ? "La direction signe en dernier : une convention n'est signable que lorsque toutes les autres parties l'ont signée et que le stage respecte les règles."
        : "Le professeur référent signe en dernier, après vérification : la direction peut signer à tout moment."}</p></div>
      {ctx.etab.reglages.ordreMission && <BlocOrdresASigner ordres={ordres} />}
      <div className="section">
        <h2>Conventions ({enAttente.filter((x) => !x.blocage).length} prête(s) à signer)</h2>
        {ctx.etab.reglages.signature === "papier" && <p className="note">Votre lycée signe les conventions sur papier : elles sont validées à leur dépôt dans la boîte « Documents ».</p>}
        <div className="panel rows">
          {enAttente.length === 0 && <div className="empty">Aucune convention en attente.</div>}
          {enAttente.map(({ cv, blocage }) => (
            <div key={cv.s.id} className="row">
              <div className="main">
                <div className="name"><Link href={`/eleves/${cv.e.id}`}>{cv.e.prenom} {cv.e.nom}</Link> <span className="cls">{cv.c.libelle}</span></div>
                <div className="meta">{cv.ent.nom} · du {dateCourte(cv.p.debut)} au {dateCourte(cv.p.fin)} · {blocage ?? "prête à signer"}</div>
              </div>
              <Link className="btn small" href={`/conventions/${cv.s.id}`} target="_blank">Lire</Link>
              {!blocage && ctx.etab.reglages.signature !== "papier" && (
                simple ? (
                  <Formulaire action={signer} className="actions" bouton="Signer" boutonClasse="btn small primary">
                    <input type="hidden" name="stageId" value={cv.s.id} /><input type="hidden" name="qualite" value="direction" />
                    <input type="hidden" name="modele" value="simple" /><input type="hidden" name="lu" value="on" />
                  </Formulaire>
                ) : (
                  <details>
                    <summary className="btn small primary">Signer</summary>
                    <Formulaire action={signer} bouton="Je signe pour la direction" boutonClasse="btn small primary">
                      <input type="hidden" name="stageId" value={cv.s.id} /><input type="hidden" name="qualite" value="direction" />
                      <ChoixSignature modeles={modelesAutorises(ctx.etab.reglages)} />
                    </Formulaire>
                  </details>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
