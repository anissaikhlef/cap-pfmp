import { notFound } from "next/navigation";
import Link from "next/link";
import { contexte } from "@/lib/auth";
import { peutAdministrer, peutFixerLesDates, peutGererClasse } from "@/lib/acces";
import { dateLongue } from "@/lib/dates";
import { classesAvecPeriodes, formationsDuLycee, professeurs, specialitesDeLaClasse, texteperiode } from "@/lib/requetes";
import { Formulaire } from "@/components/Formulaire";
import { ChampsClasse } from "../ChampsClasse";
import { ajouterPeriode, modifierClasse, modifierPeriode, supprimerPeriode } from "../actions";

export default async function Classe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contexte();
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await peutGererClasse(ctx, id))) notFound();
  const [c] = await classesAvecPeriodes(ctx, [id]);
  if (!c) notFound();
  const profs = await professeurs(ctx);
  const dates = peutFixerLesDates(ctx);
  const formations = await formationsDuLycee(ctx.etab.id);
  const specialites = await specialitesDeLaClasse(ctx.etab.id, c);
  // Une période d'une seule spécialité (ses élèves partent à d'autres dates que le reste de la classe).
  const pour = (p: { dominanteId: string | null }) => (p.dominanteId ? `Spécialité ${specialites.find((d) => d.id === p.dominanteId)?.libelle ?? ""}` : "Toute la classe");
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div><h1>{c.libelle}</h1><p className="sub">{c.filiere ?? "Diplôme non précisé"} · année {c.anneeScolaire}</p></div>
        <Link className="btn" href={`/eleves?classe=${c.id}`}>Voir les élèves</Link>
      </div>
      <div className="panel pad section">
        <h2>Périodes de PFMP</h2>
        {!dates && <p className="sub" style={{ margin: 0 }}>Les dates de PFMP sont fixées par le DDFPT. Elles figurent aussi dans le <Link href="/calendrier">calendrier des PFMP</Link>.</p>}
        <div className="panel rows">
          {c.periodes.length === 0 && <div className="empty">{dates ? "Aucune période. Ajoutez la première ci-dessous." : "Aucune période pour l'instant."}</div>}
          {c.periodes.map((p) => dates ? (
            <div key={p.id} className="row">
              <Formulaire action={modifierPeriode} className="actions" bouton="Enregistrer" boutonClasse="btn small">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="classeId" value={c.id} />
                <label className="f" htmlFor={`pl-${p.id}`}>Nom<input id={`pl-${p.id}`} name="libelle" defaultValue={p.libelle} /></label>
                <label className="f" htmlFor={`pd-${p.id}`}>Début<input id={`pd-${p.id}`} name="debut" type="date" defaultValue={p.debut} /></label>
                <label className="f" htmlFor={`pf-${p.id}`}>Fin<input id={`pf-${p.id}`} name="fin" type="date" defaultValue={p.fin} /></label>
                <span className="sub">{pour(p)} · {texteperiode(p)}</span>
              </Formulaire>
              <form action={supprimerPeriode}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="classeId" value={c.id} />
                <button className="btn small danger" title="Impossible si des stages y sont rattachés">Supprimer</button>
              </form>
            </div>
          ) : (
            <div key={p.id} className="row">
              <div className="main"><div className="name">{p.libelle}</div><div className="meta">{pour(p)} · du {dateLongue(p.debut)} au {dateLongue(p.fin)} · {texteperiode(p)}</div></div>
            </div>
          ))}
        </div>
        {dates && (
          <Formulaire action={ajouterPeriode} className="actions" bouton="Ajouter la période" boutonClasse="btn">
            <input type="hidden" name="classeId" value={c.id} />
            <label className="f" htmlFor="np-l">Nom<input id="np-l" name="libelle" defaultValue={`PFMP ${c.periodes.length + 1}`} /></label>
            <label className="f" htmlFor="np-d">Début<input id="np-d" name="debut" type="date" required /></label>
            <label className="f" htmlFor="np-f">Fin<input id="np-f" name="fin" type="date" required /></label>
            {specialites.length > 0 && (
              <label className="f" htmlFor="np-s">Élèves concernés
                <select id="np-s" name="dominanteId" defaultValue="">
                  <option value="">Toute la classe</option>
                  {specialites.map((d) => <option key={d.id} value={d.id}>Spécialité {d.libelle}</option>)}
                </select>
              </label>
            )}
          </Formulaire>
        )}
        {dates && specialites.length > 0 && (
          <p className="sub" style={{ margin: 0 }}>Les élèves d&apos;une spécialité peuvent partir à d&apos;autres dates que le reste de la classe : ajoutez une période pour cette spécialité seulement. Chaque élève suit les dates de toute la classe et celles de sa spécialité.</p>
        )}
      </div>
      <div className="panel pad section">
        <h2>Paramètres de la classe</h2>
        <Formulaire action={modifierClasse} bouton="Enregistrer la classe">
          <input type="hidden" name="id" value={c.id} />
          <ChampsClasse v={c} profs={profs} formations={formations} referentModifiable={peutAdministrer(ctx)} />
          {!peutAdministrer(ctx) && <input type="hidden" name="referentId" value={c.referentId ?? ""} />}
        </Formulaire>
      </div>
    </>
  );
}
