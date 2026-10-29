import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { ChampRetour } from "@/components/ChampRetour";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { dureeDuCycle, semainesParDefaut, texteDuree } from "@/lib/regles";
import { ajouterDominante, ajouterFormation, ajouterPole, reglerCycle, supprimerDominante, supprimerFormation, supprimerPole } from "../actions";

export const metadata = { title: "Pôles et formations" };

/**
 * Pôles de formation du lycée, leurs formations (voie scolaire) et les spécialités de chaque formation (décision d'Anissa :
 * plusieurs pôles par lycée ; dans une même classe, une spécialité peut partir en PFMP à d'autres dates).
 */
export default async function Formations() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const E = ctx.etab.id;
  const [poles, formations, specialites, classes] = await Promise.all([
    db.select().from(schema.poles).where(eq(schema.poles.etablissementId, E)).orderBy(asc(schema.poles.libelle)),
    db.select().from(schema.formations).where(eq(schema.formations.etablissementId, E)).orderBy(asc(schema.formations.libelle)),
    db.select().from(schema.dominantes).where(eq(schema.dominantes.etablissementId, E)).orderBy(asc(schema.dominantes.libelle)),
    db.select({ id: schema.classes.id, libelle: schema.classes.libelle, formationId: schema.classes.formationId }).from(schema.classes)
      .where(eq(schema.classes.etablissementId, E)).orderBy(asc(schema.classes.libelle)),
  ]);
  const sansFormation = specialites.filter((d) => !d.formationId || !formations.some((f) => f.id === d.formationId));
  const Specialites = ({ liste }: { liste: typeof specialites }) => (
    <>
      {liste.map((d) => (
        <span key={d.id} className="chip">
          {d.libelle}
          <form action={supprimerDominante} style={{ display: "inline" }}><ChampRetour /><input type="hidden" name="id" value={d.id} /><button className="lien-discret" aria-label={`Retirer la spécialité ${d.libelle}`}>×</button></form>
        </span>
      ))}
    </>
  );
  // Attestation récapitulative des PFMP : durée du cycle et semaines attendues (vides : valeurs proposées par Cap PFMP).
  const Cycle = ({ f }: { f: typeof formations[number] }) => {
    const defaut = semainesParDefaut(f.libelle);
    const sem = f.semainesAttendues ?? defaut;
    return (
      <Formulaire action={reglerCycle} className="actions" bouton="Enregistrer le cycle" boutonClasse="btn small" viderApres={false}>
        <input type="hidden" name="id" value={f.id} />
        <label className="f" htmlFor={`cy-${f.id}`}>Durée du cycle
          <select id={`cy-${f.id}`} name="dureeCycle" defaultValue={String(dureeDuCycle(null, f.dureeCycle, f.libelle, ""))}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{texteDuree(n)}</option>)}
          </select>
        </label>
        {(["3", "2", "1"] as const).map((k) => (
          <label key={k} className="f" htmlFor={`se-${f.id}-${k}`}>Semaines attendues en {texteDuree(Number(k))}
            <input id={`se-${f.id}-${k}`} name={`semaines${k}`} type="number" min={0} max={60} defaultValue={sem[k] ?? ""} placeholder={defaut[k] ? String(defaut[k]) : "—"} style={{ width: 80 }} />
          </label>
        ))}
      </Formulaire>
    );
  };
  return (
    <>
      <Entete titre="Pôles et formations" sous="Les pôles de votre lycée, leurs formations en voie scolaire et les spécialités de chaque formation. Dans une même classe, les élèves d'une spécialité peuvent partir en PFMP à d'autres dates : vous les fixez dans la page de la classe. Les formations en apprentissage n'entrent pas dans Cap PFMP.">
        <div className="actions"><Link className="btn" href="/organisation">Retour à l&apos;organisation</Link></div>
      </Entete>
      {poles.length === 0 && <p className="note">Aucun pôle pour l&apos;instant : commencez par ajouter les pôles de votre lycée.</p>}
      {poles.map((p) => {
        const fs = formations.filter((f) => f.poleId === p.id);
        return (
          <div key={p.id} className="panel pad section" id={`pole-${p.id}`}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2>{p.libelle}</h2>
              {fs.length === 0 && <form action={supprimerPole}><ChampRetour /><input type="hidden" name="id" value={p.id} /><button className="btn small danger">Retirer le pôle</button></form>}
            </div>
            <div className="rows panel">
              {fs.length === 0 && <div className="empty">Aucune formation dans ce pôle.</div>}
              {fs.map((f) => {
                const cl = classes.filter((c) => c.formationId === f.id);
                return (
                  <div key={f.id} className="row" style={{ alignItems: "flex-start" }}>
                    <div className="main">
                      <div className="name">{f.libelle}{f.codeRome && <span className="cls">ROME {f.codeRome}</span>}</div>
                      <div className="meta">{cl.length ? `Classes : ${cl.map((c) => c.libelle).join(", ")}` : "Aucune classe pour l'instant"}</div>
                      <div className="actions" style={{ marginTop: 6, gap: 6 }}>
                        <span className="sub">Spécialités :</span>
                        <Specialites liste={specialites.filter((d) => d.formationId === f.id)} />
                        {!specialites.some((d) => d.formationId === f.id) && <span className="sub">aucune</span>}
                      </div>
                      <Formulaire action={ajouterDominante} className="actions" bouton="Ajouter la spécialité" boutonClasse="btn small">
                        <input type="hidden" name="formationId" value={f.id} />
                        <label className="f" htmlFor={`sp-${f.id}`} style={{ flex: 1 }}>Nouvelle spécialité<input id={`sp-${f.id}`} name="libelle" placeholder="Ex. Sûreté" maxLength={80} /></label>
                      </Formulaire>
                      <Cycle f={f} />
                    </div>
                    {cl.length === 0 && <form action={supprimerFormation}><ChampRetour /><input type="hidden" name="id" value={f.id} /><button className="btn small danger">Retirer</button></form>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {sansFormation.length > 0 && (
        <div className="panel pad section">
          <h2>Spécialités sans formation</h2>
          <p className="sub">Rattachez-les en les ajoutant à une formation ci-dessus, puis retirez celles-ci.</p>
          <div className="actions" style={{ gap: 6 }}><Specialites liste={sansFormation} /></div>
        </div>
      )}
      <div className="grid2">
        <div className="panel pad section">
          <h2>Ajouter un pôle</h2>
          <Formulaire action={ajouterPole} bouton="Ajouter le pôle" boutonClasse="btn">
            <label className="f" htmlFor="pole-libelle">Nom du pôle<input id="pole-libelle" name="libelle" placeholder="Ex. Maintenance industrielle" maxLength={80} /></label>
          </Formulaire>
        </div>
        <div className="panel pad section">
          <h2>Ajouter une formation</h2>
          <Formulaire action={ajouterFormation} bouton="Ajouter la formation" boutonClasse="btn">
            <label className="f" htmlFor="f-pole">Pôle
              <select id="f-pole" name="poleId" defaultValue="">
                <option value="" disabled>— Choisir —</option>
                {poles.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
              </select>
            </label>
            <label className="f" htmlFor="f-libelle">Diplôme préparé (voie scolaire)<input id="f-libelle" name="libelle" placeholder="Ex. Bac pro CIEL" maxLength={120} /></label>
            <label className="f" htmlFor="f-rome">Code métier ROME (facultatif, pour La bonne boîte)<input id="f-rome" name="codeRome" placeholder="Ex. K2503" maxLength={5} /></label>
          </Formulaire>
        </div>
      </div>
    </>
  );
}
