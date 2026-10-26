import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { anneeSuivante, proposition } from "@/lib/passage";
import { Formulaire } from "@/components/Formulaire";
import { passerAnneeSuivante } from "./actions";

export const metadata = { title: "Année suivante" };

export default async function AnneeSuivante() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const classes = await db.select({ c: schema.classes, n: sql<number>`(select count(*)::int from eleves e where e.classe_id = ${schema.classes.id} and not e.archive)` })
    .from(schema.classes).where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(schema.classes.libelle);
  const suivante = anneeSuivante(ctx.etab.anneeScolaire);
  return (
    <>
      <div>
        <h1>Passer à l&apos;année {suivante}</h1>
        <p className="sub">Chaque classe devient la classe supérieure avec ses élèves, ou termine sa formation. Les dossiers des élèves suivent : rien n&apos;est à ressaisir. À faire une fois par an, avant la rentrée.</p>
      </div>
      <Formulaire action={passerAnneeSuivante} bouton={`Ouvrir l'année ${suivante}`}>
        <div className="panel tbl">
          <table>
            <thead><tr><th>Classe {ctx.etab.anneeScolaire}</th><th>Élèves</th><th>Devient</th><th>Nom en {suivante}</th><th>Niveau</th></tr></thead>
            <tbody>
              {classes.map(({ c, n }) => {
                const p = proposition(c.libelle, c.niveau);
                return (
                  <tr key={c.id}>
                    <td><b>{c.libelle}</b></td>
                    <td className="num">{n}</td>
                    <td>
                      <select className="inp" name={`dest_${c.id}`} defaultValue={p.destination} aria-label={`Devenir de ${c.libelle}`} style={{ width: "auto" }}>
                        <option value="suivante">Classe supérieure</option>
                        <option value="fin">Fin de formation</option>
                      </select>
                    </td>
                    <td><input className="inp" name={`libelle_${c.id}`} defaultValue={p.libelle} aria-label={`Nom de la classe suivante de ${c.libelle}`} /></td>
                    <td>
                      <select className="inp" name={`niveau_${c.id}`} defaultValue={p.niveau} aria-label={`Niveau suivant de ${c.libelle}`} style={{ width: "auto" }}>
                        <option value="CAP">CAP</option><option value="2NDE">Seconde</option><option value="1RE">Première</option><option value="TLE">Terminale</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">Les nouveaux élèves de seconde et de première année de CAP s&apos;ajoutent ensuite, à la main ou par import. Les élèves en fin de formation sont archivés : leur dossier reste consultable.</p>
        <label className="check"><input type="checkbox" name="confirmer" /> Je confirme le passage à l&apos;année {suivante}. Cette opération ne peut pas être annulée.</label>
      </Formulaire>
    </>
  );
}
