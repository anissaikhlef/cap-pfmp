import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { dateLongue } from "@/lib/dates";
import { gereLesTenues, peutDistribuer, peutSaisirTailles, tenueDeLaClasse } from "@/lib/tenues";
import { MESURES, mesuresDe, tailleDe } from "@/lib/tenues-def";
import { ChampsTailles } from "@/components/tenue";
import { Entete } from "@/components/ui";

export const metadata = { title: "Tenues de la classe" };

/** Les tailles des élèves d'une classe, ce qu'ils ont reçu, et l'accès à la remise signée. */
export default async function TenuesClasse({ params }: { params: Promise<{ classe: string }> }) {
  const ctx = await contexte();
  const { classe } = await params;
  const t = /^[0-9a-f-]{36}$/.test(classe) ? await tenueDeLaClasse(ctx, classe) : null;
  if (!t) redirect("/tenues");
  const mesures = mesuresDe(t.classe.articles);
  const distribue = peutDistribuer(ctx) && !!t.campagne;
  const fichier = (quoi: string, format: string) => `/tenues/fichier/${quoi}?classe=${t.classe.id}&format=${format}`;
  const saisie = await Promise.all(t.eleves.map((x) => peutSaisirTailles(ctx, x.e)));
  return (
    <>
      <Entete titre={`Tenues et matériel · ${t.classe.libelle}`} sous={`${t.classe.formation} : ${t.classe.articles.map((x) => `${x.quantite > 1 ? `${x.quantite} × ` : ""}${x.libelle}`).join(", ")}.`}>
        <div className="actions">
          <Link className="btn" href="/tenues">Toutes les classes</Link>
          {gereLesTenues(ctx) && <><a className="btn" href={fichier("commande", "excel")}>Commande (Excel)</a><a className="btn" href={fichier("commande", "pdf")} target="_blank" rel="noopener">Commande (PDF)</a></>}
          {peutDistribuer(ctx) && <><a className="btn" href={fichier("remises", "excel")}>Remises (Excel)</a><a className="btn" href={fichier("remises", "pdf")} target="_blank" rel="noopener">Remises (PDF)</a></>}
        </div>
      </Entete>
      <p className={t.campagne ? "sub" : "note"}>{t.campagne ? `Saisie des tailles ouverte jusqu'au ${dateLongue(t.campagne.dateLimite)}.` : "La saisie des tailles n'est pas encore ouverte pour cette classe : le DDFPT l'ouvre dans « Tenues et matériel »."}</p>
      <div className="panel rows" id="eleves">
        {t.eleves.length === 0 && <div className="empty">Aucun élève dans cette classe.</div>}
        {t.eleves.map(({ e, manque, remises, reste }, i) => (
          <div key={e.id} className="row" id={`eleve-${e.id}`} style={{ alignItems: "flex-start" }}>
            <div className="main">
              <div className="name">
                {e.nom} {e.prenom}{" "}
                {!reste.length ? <span className="pill t-ok">tout remis</span> : remises.length ? <span className="pill t-warn">remise partielle</span> : null}
              </div>
              <div className="meta">
                {mesures.length ? mesures.map((m) => `${MESURES[m].libelle} : ${e.tailles[m] ?? "—"}`).join(" · ") : "Aucune taille à indiquer"}
                {e.userId ? "" : " · pas de compte élève"}
              </div>
              {manque.length > 0 && <div className="msg err" style={{ margin: "4px 0" }}>À indiquer : {manque.join(", ")}</div>}
              {remises.map((r) => <div key={r.id} className="sub">Remis le {r.remiseLe.toLocaleDateString("fr-FR")}{r.par ? ` par ${r.par}` : ""} : {r.articles.map((x) => `${x.libelle}${x.taille ? ` (${x.taille})` : ""}`).join(", ")} · signé</div>)}
              {remises.length > 0 && reste.length > 0 && <div className="sub">Reste à remettre : {reste.map((x) => `${x.libelle}${x.mesure ? ` (${tailleDe(x, e.tailles)})` : ""}`).join(", ")}</div>}
              {saisie[i] && mesures.length > 0 && reste.length > 0 && <ChampsTailles eleveId={e.id} mesures={mesures} tailles={e.tailles} />}
            </div>
            {distribue && reste.length > 0 && <Link className="btn small primary" href={`/tenues/${t.classe.id}/remise/${e.id}`}>Remettre</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
