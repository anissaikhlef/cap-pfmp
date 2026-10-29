import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { peutDistribuer, tenueDeLaClasse } from "@/lib/tenues";
import { tailleDe } from "@/lib/tenues-def";
import { ZoneSignature } from "@/components/ChoixSignature";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { remettre } from "../../../actions";

export const metadata = { title: "Remise signée" };

/**
 * La remise, le jour de la distribution (décision d'Anissa) : la personne qui distribue coche ce qu'elle remet ; l'élève
 * signe au doigt sur son téléphone ou sa tablette. Un article manquant reste à remettre, avec une nouvelle signature.
 */
export default async function Remise({ params }: { params: Promise<{ classe: string; eleve: string }> }) {
  const ctx = await contexte();
  const { classe, eleve } = await params;
  if (!peutDistribuer(ctx)) redirect("/");
  const t = /^[0-9a-f-]{36}$/.test(classe) ? await tenueDeLaClasse(ctx, classe) : null;
  const l = t?.eleves.find((x) => x.e.id === eleve);
  if (!t || !l) redirect("/tenues");
  const { e, reste } = l;
  return (
    <>
      <Entete titre={`Remise à ${e.prenom} ${e.nom}`} sous={`${t.classe.libelle} · ${t.classe.formation}`}>
        <div className="actions"><Link className="btn" href={`/tenues/${t.classe.id}`}>Retour à la classe</Link></div>
      </Entete>
      {!t.campagne ? <p className="note">La saisie des tailles de cette classe n&apos;est pas encore ouverte.</p>
        : !reste.length ? <p className="msg ok">Tout a été remis à {e.prenom}. La fiche signée est dans ses documents.</p> : (
          <div className="panel pad section">
            <Formulaire action={remettre} bouton="Valider la remise" viderApres={false}>
              <input type="hidden" name="eleveId" value={e.id} />
              <h2>Articles remis aujourd&apos;hui</h2>
              <p className="sub" style={{ margin: 0 }}>Décochez un article qui manque : il restera à remettre, avec une nouvelle signature.</p>
              <div className="choices">
                {reste.map((x) => (
                  <label key={x.id} className="choice">
                    <input type="checkbox" name="article" value={x.id} defaultChecked />
                    <span><b>{x.quantite > 1 ? `${x.quantite} × ` : ""}{x.libelle}</b>{x.mesure && <> · taille {tailleDe(x, e.tailles)}</>}</span>
                  </label>
                ))}
              </div>
              <h2>Signature de {e.prenom}</h2>
              <ZoneSignature consigne={`${e.prenom}, signez dans le cadre avec le doigt : vous reconnaissez avoir reçu les articles cochés.`} />
            </Formulaire>
          </div>
        )}
    </>
  );
}
