import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { classesGerees, estGestionnaire } from "@/lib/acces";
import { classesAvecPeriodes } from "@/lib/requetes";
import { heuresDesClasses, professeursActifs } from "@/lib/heures";
import { Formulaire } from "@/components/Formulaire";
import { enregistrerHeures, importerHeures } from "./actions";

export const metadata = { title: "Heures de face à face" };

const nombre = (h: number) => String(h).replace(".", ",");

export default async function Heures() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/");
  const classes = await classesAvecPeriodes(ctx, await classesGerees(ctx));
  const profs = await professeursActifs(ctx);
  const heures = await heuresDesClasses(ctx, classes.map((c) => c.id));
  const val = (p: string, c: string) => heures.find((h) => h.professeurId === p && h.classeId === c)?.heures;
  const totalClasse = (c: string) => heures.filter((h) => h.classeId === c).reduce((t, h) => t + h.heures, 0);
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Heures de face à face</h1>
          <p className="sub">Heures de cours par semaine de chaque professeur dans chaque classe. Elles servent à proposer le nombre de visites de chacun, en proportion de ses heures.</p>
        </div>
        <Link className="btn" href="/visites">Retour aux visites</Link>
      </div>
      {ctx.etab.reglages.repartition !== "heures" && (
        <p className="note">Votre lycée répartit actuellement les visites automatiquement. Pour utiliser ces heures, choisissez « Selon les heures de face à face » dans <Link href="/organisation">Organisation</Link>.</p>
      )}

      <div className="panel pad section">
        <h2>Saisir à la main</h2>
        {classes.length === 0 || profs.length === 0 ? <p className="sub">Il faut au moins une classe et un professeur.</p> : (
          <Formulaire action={enregistrerHeures} bouton="Enregistrer les heures">
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Professeur</th>{classes.map((c) => <th key={c.id} style={{ textAlign: "center" }}>{c.libelle}</th>)}</tr>
                </thead>
                <tbody>
                  {profs.map((p) => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{p.prenom} {p.nom}<div className="sub">{p.discipline ?? (p.enseignementPro ? "enseignement pro" : "enseignement général")}</div></td>
                      {classes.map((c) => (
                        <td key={c.id} style={{ textAlign: "center" }}>
                          <input className="inp" name={`h_${p.id}_${c.id}`} defaultValue={val(p.id, c.id) ? nombre(val(p.id, c.id)!) : ""} inputMode="decimal"
                            aria-label={`Heures de ${p.prenom} ${p.nom} en ${c.libelle}`} style={{ width: 64, textAlign: "center" }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total par semaine</b></td>
                    {classes.map((c) => <td key={c.id} className="num" style={{ textAlign: "center" }}><b>{nombre(Math.round(totalClasse(c.id) * 100) / 100)} h</b></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ margin: 0 }}>Écrivez 6, 6,5 ou 6h30. Laissez vide quand le professeur n&apos;enseigne pas dans la classe.</p>
          </Formulaire>
        )}
      </div>

      <div className="panel pad section">
        <h2>Importer depuis l&apos;emploi du temps</h2>
        <p className="sub" style={{ margin: 0 }}>
          Exportez les services depuis votre logiciel d&apos;emploi du temps (EDT, Pronote…) au format CSV, avec une ligne par professeur et par classe.
          Colonnes reconnues : <b>professeur</b> (« NOM Prénom »), ou <b>nom</b> et <b>prénom</b>, ou <b>e-mail</b> ; <b>classe</b> ; <b>heures</b>.
          Les heures déjà saisies pour ces professeurs et ces classes sont remplacées.
        </p>
        <Formulaire action={importerHeures} className="actions" bouton="Importer" boutonClasse="btn primary">
          <label className="f" htmlFor="h-fichier" style={{ flex: 1, minWidth: 220 }}>Fichier CSV<input id="h-fichier" name="fichier" type="file" accept=".csv,text/csv" required /></label>
        </Formulaire>
      </div>
    </>
  );
}
