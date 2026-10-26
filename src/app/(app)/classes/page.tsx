import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { classesGerees, peutAdministrer } from "@/lib/acces";
import { classesAvecPeriodes, periodeDeReference, professeurs, texteperiode } from "@/lib/requetes";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { ChampsClasse } from "./ChampsClasse";
import { creerClasse } from "./actions";

export const metadata = { title: "Classes" };

export default async function Classes() {
  const ctx = await contexte();
  const ids = await classesGerees(ctx);
  if (!ids.length && !peutAdministrer(ctx)) redirect("/");
  const classes = await classesAvecPeriodes(ctx, ids);
  const profs = await professeurs(ctx);
  return (
    <>
      <div>
        <h1>Classes et périodes</h1>
        <p className="sub">Année {ctx.etab.anneeScolaire}. Les dates des PFMP changent chaque année : modifiez-les ici, les statuts et alertes suivent.</p>
      </div>
      <div className="panel rows">
        {classes.length === 0 && <div className="empty">Aucune classe pour l&apos;instant.</div>}
        {classes.map((c) => (
          <Link key={c.id} href={`/classes/${c.id}`} className="row">
            <div className="main">
              <div className="name">{c.libelle} <span className="cls">{c.niveau}</span></div>
              <div className="meta">
                {c.referent ? `Référent : ${c.referent}` : "Pas de référent"} · {texteperiode(periodeDeReference(c.periodes))}
                {c.periodes.length > 0 && ` · ${c.periodes.map((p) => `${dateCourte(p.debut)} → ${dateCourte(p.fin)}`).join(", ")}`}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {peutAdministrer(ctx) && (
        <div className="actions"><Link className="btn" href="/classes/annee-suivante">Préparer l&apos;année suivante</Link></div>
      )}
      {peutAdministrer(ctx) && (
        <div className="panel pad section">
          <h2>Nouvelle classe</h2>
          <Formulaire action={creerClasse} bouton="Créer la classe">
            <ChampsClasse profs={profs} />
          </Formulaire>
        </div>
      )}
    </>
  );
}
