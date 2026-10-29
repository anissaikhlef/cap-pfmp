import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CategorieArticle } from "@/db/schema";
import { contexte } from "@/lib/auth";
import { LIBELLES_ROLES } from "@/lib/navigation";
import { equipe, formationsDuLycee } from "@/lib/requetes";
import { CATALOGUE, CATEGORIES, MESURES, NOMS_MESURES } from "@/lib/tenues-def";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { ajouterArticle, enregistrerArticles, enregistrerDistribution } from "./actions";

export const metadata = { title: "Tenues et matériel" };

/**
 * Les articles de chaque formation (décision d'Anissa : une liste préremplie, la plus complète possible ; chaque DDFPT
 * coche ce dont la formation a besoin et ajoute ce qui manque), et les personnes désignées pour la distribution.
 */
export default async function OrganisationTenues() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const [formations, articles, membres] = await Promise.all([
    formationsDuLycee(ctx.etab.id),
    db.select().from(schema.articlesFormation).where(eq(schema.articlesFormation.etablissementId, ctx.etab.id)),
    equipe(ctx),
  ]);
  const choisissables = membres.filter((u) => u.actif && !u.roles.some((r) => ["direction", "gestionnaire", "eleve", "parent", "entreprise"].includes(r)));
  const taille = (m: keyof typeof MESURES | null) => (m ? MESURES[m].libelle.toLowerCase() : "sans taille");
  return (
    <>
      <Entete titre="Tenues et matériel" sous="Pour chaque formation, cochez dans la liste ce que le lycée remet aux élèves, et ajoutez ce qui manque. Les élèves indiquent ensuite les tailles demandées (haut, bas, pointure…).">
        <div className="actions">
          <Link className="btn" href="/organisation">Retour à l&apos;organisation</Link>
          <Link className="btn" href="/tenues">Saisie des tailles, commande et remise</Link>
        </div>
      </Entete>
      {formations.length === 0 && <p className="note">Ajoutez d&apos;abord vos formations dans « <Link href="/organisation/formations">Pôles et formations</Link> ».</p>}
      {formations.map((f) => {
        const ici = articles.filter((x) => x.formationId === f.id);
        const ajoutes = ici.filter((x) => !x.code);
        return (
          <details key={f.id} className="panel pad section" id={`formation-${f.id}`} open={ici.length > 0}>
            <summary><b>{f.libelle}</b> <span className="sub">{f.pole ? `· ${f.pole} ` : ""}· {ici.length ? `${ici.length} article(s) : ${ici.map((x) => x.libelle).join(", ")}` : "aucun article"}</span></summary>
            <Formulaire action={enregistrerArticles} bouton="Enregistrer les articles" boutonClasse="btn small primary" viderApres={false}>
              <input type="hidden" name="formationId" value={f.id} />
              {(Object.keys(CATEGORIES) as CategorieArticle[]).map((cat) => (
                <div key={cat} className="section">
                  <h3>{CATEGORIES[cat]}</h3>
                  <div className="grid2" style={{ gap: 6 }}>
                    {CATALOGUE.filter((x) => x.categorie === cat).map((x) => {
                      const a = ici.find((y) => y.code === x.code);
                      return (
                        <div key={x.code} className="actions" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <label className="check" style={{ flex: 1 }}><input type="checkbox" name={`c_${x.code}`} value="oui" defaultChecked={!!a} /> {x.libelle} <span className="sub">({taille(x.mesure)})</span></label>
                          <input aria-label={`Quantité : ${x.libelle}`} name={`q_${x.code}`} type="number" min={1} max={20} defaultValue={a?.quantite ?? 1} style={{ width: 60 }} />
                        </div>
                      );
                    })}
                    {ajoutes.filter((x) => x.categorie === cat).map((x) => (
                      <div key={x.id} className="actions" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <label className="check" style={{ flex: 1 }}><input type="checkbox" name={`p_${x.id}`} value="oui" defaultChecked /> {x.libelle} <span className="sub">({taille(x.mesure)}, ajouté)</span></label>
                        <input aria-label={`Quantité : ${x.libelle}`} name={`qp_${x.id}`} type="number" min={1} max={20} defaultValue={x.quantite} style={{ width: 60 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="sub" style={{ margin: 0 }}>Le nombre à droite : la quantité remise à chaque élève (ex. 2 polos).</p>
            </Formulaire>
            <h3>Ajouter un article qui manque</h3>
            <Formulaire action={ajouterArticle} className="actions" bouton="Ajouter" boutonClasse="btn small">
              <input type="hidden" name="formationId" value={f.id} />
              <label className="f" htmlFor={`aa-l-${f.id}`} style={{ flex: 1, minWidth: 180 }}>Article<input id={`aa-l-${f.id}`} name="libelle" placeholder="Ex. Gilet pare-lame" maxLength={60} /></label>
              <label className="f" htmlFor={`aa-c-${f.id}`}>Sorte
                <select id={`aa-c-${f.id}`} name="categorie" defaultValue="tenue">{(Object.keys(CATEGORIES) as CategorieArticle[]).map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}</select>
              </label>
              <label className="f" htmlFor={`aa-m-${f.id}`}>Taille à demander
                <select id={`aa-m-${f.id}`} name="mesure" defaultValue=""><option value="">Sans taille (taille unique)</option>{NOMS_MESURES.map((m) => <option key={m} value={m}>{MESURES[m].libelle}</option>)}</select>
              </label>
              <label className="f" htmlFor={`aa-q-${f.id}`}>Quantité<input id={`aa-q-${f.id}`} name="quantite" type="number" min={1} max={20} defaultValue={1} style={{ width: 70 }} /></label>
            </Formulaire>
          </details>
        );
      })}
      <div className="panel pad section" id="distribution">
        <h2>Distribution</h2>
        <p className="sub" style={{ margin: 0 }}>La gestion des PFMP et la direction peuvent toujours distribuer. Désignez les autres personnes (par exemple l&apos;agent comptable ou le magasinier, avec un compte dans l&apos;équipe) : elles font signer les élèves sur leur téléphone ou leur tablette.</p>
        <Formulaire action={enregistrerDistribution} bouton="Enregistrer" boutonClasse="btn small primary" viderApres={false}>
          <div className="grid2" style={{ gap: 6 }}>
            {choisissables.map((u) => (
              <label key={u.id} className="check"><input type="checkbox" name="distributeur" value={u.id} defaultChecked={ctx.etab.reglages.tenues.distributeurs.includes(u.id)} /> {u.prenom} {u.nom} <span className="sub">({u.roles.map((r) => LIBELLES_ROLES[r] ?? r).join(", ")})</span></label>
            ))}
            {choisissables.length === 0 && <p className="sub">Aucun autre membre de l&apos;équipe : créez son compte dans « Équipe ».</p>}
          </div>
          <label className="f" htmlFor="t-relances">Relances aux élèves et aux familles, jours avant la date limite (vide : aucune)
            <input id="t-relances" name="relances" defaultValue={ctx.etab.reglages.relances.tailles.join(", ")} placeholder="Ex. 7, 2" />
          </label>
        </Formulaire>
      </div>
    </>
  );
}
