import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { periodesDuLycee } from "@/lib/calendrier";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { ecrireAuxEntreprises } from "./actions";
import { entreprisesDeLaPeriode } from "@/lib/entreprises-accueil";

export const metadata = { title: "Écrire aux entreprises d'accueil" };

/** Le DDFPT écrit en une fois à toutes les entreprises qui accueillent les élèves d'une période (décision d'Anissa). */
export default async function MessageAuxEntreprises({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) redirect("/entreprises");
  const sp = await searchParams;
  const jour = aujourdhui();
  const periodes = (await periodesDuLycee(ctx.etab)).flatMap((l) => l.periodes.map((p) => ({ ...p, classe: l.classe.libelle })))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  // Par défaut : la période en cours, sinon la prochaine
  const periode = periodes.find((p) => p.id === sp.periode) ?? periodes.find((p) => p.fin >= jour) ?? periodes.at(-1);
  const destinataires = periode ? await entreprisesDeLaPeriode(ctx.etab.id, periode.id) : [];
  const modele = periode
    ? `Madame, Monsieur,\n\nVous accueillez des élèves de ${ctx.etab.nom} du ${dateLongue(periode.debut)} au ${dateLongue(periode.fin)}, et nous vous en remercions.\n\n(Votre message)\n\nCordialement,\n${ctx.user.prenom} ${ctx.user.nom}`
    : "";
  return (
    <>
      <Entete titre="Écrire aux entreprises d'accueil" sous="Un message à toutes les entreprises qui accueillent les élèves d'une période. « {entreprise} » est remplacé par le nom de chaque entreprise ; la liste des élèves accueillis est ajoutée à la fin." />
      <div className="chips" aria-label="Périodes">
        {periodes.map((p) => <Link key={p.id} className="chip" href={`/entreprises/message?periode=${p.id}`} aria-current={p.id === periode?.id ? "true" : undefined}>{p.classe} · {p.libelle}</Link>)}
      </div>
      {!periode && <p className="empty">Aucune période de PFMP n&apos;est fixée.</p>}
      {periode && (
        <div className="panel pad section">
          <h2>{periode.classe} · {periode.libelle}, du {dateLongue(periode.debut)} au {dateLongue(periode.fin)}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {destinataires.length === 0 ? "Aucune entreprise n'accueille encore d'élève sur cette période." : `${destinataires.length} entreprise(s) : ${destinataires.map((x) => `${x.ent.nom}${x.email ? "" : " (pas d'adresse e-mail)"}`).join(", ")}.`}
          </p>
          {destinataires.length > 0 && (
            <Formulaire action={ecrireAuxEntreprises} bouton="Envoyer le message">
              <input type="hidden" name="periodeId" value={periode.id} />
              <label className="f" htmlFor="me-sujet">Objet<input id="me-sujet" name="sujet" defaultValue={`Stage des élèves de ${periode.classe}`} required /></label>
              <label className="f" htmlFor="me-message">Message<textarea id="me-message" name="message" rows={10} defaultValue={modele} required /></label>
            </Formulaire>
          )}
        </div>
      )}
    </>
  );
}
