import Link from "next/link";
import { contexte } from "@/lib/auth";
import { liensPour } from "@/lib/navigation";
import { Nav } from "@/components/Nav";
import { seDeconnecter } from "./actions";
import { Suspense } from "react";
import { Bandeau } from "@/components/Bandeau";
import { Aide } from "@/components/Aide";
import { profilDe, VISITES } from "@/lib/aide";
import { entrerEntrainement, quitterEntrainement, remettreAZero } from "./formation/actions";

const PLACES_LIBELLES = [["equipe", "L'équipe (moi)"], ["eleve", "Un élève"], ["parent", "Un parent"], ["entreprise", "Une entreprise"]] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contexte();
  const liens = await liensPour(ctx);
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <Link href="/" className="logo"><i aria-hidden="true" /> Cap PFMP</Link>
            <div className="who">
              <span>{ctx.user.prenom} {ctx.user.nom} · {ctx.etab.nom}</span>
              {!ctx.etab.entrainementDeId && <Link href="/mot-de-passe" style={{ color: "inherit" }}>Mot de passe</Link>}
              {!ctx.etab.entrainementDeId && !ctx.user.totpActif && ctx.user.roles.some((r) => r === "direction" || r === "gestionnaire" || r === "professeur" || r === "vie_scolaire") && (
                <Link href="/double-authentification/activer" style={{ color: "inherit" }}>Sécuriser mon compte</Link>
              )}
              <form action={seDeconnecter}><button>Se déconnecter</button></form>
              <Aide etapes={VISITES[profilDe(ctx.user.roles)]} premiereFois={!ctx.user.visiteGuideeLe} />
            </div>
          </div>
          <Nav liens={liens} />
        </div>
      </header>
      {ctx.etab.entrainementDeId && (
        <div className="bandeau-entrainement" role="note">
          <div className="wrap actions" style={{ justifyContent: "space-between" }}>
            <span><b>Lycée d&apos;entraînement</b> : données fictives, rien n&apos;en sort.</span>
            <span className="actions">
              <span>Me mettre à la place de :</span>
              {PLACES_LIBELLES.map(([place, libelle]) => (
                <form key={place} action={entrerEntrainement}><input type="hidden" name="place" value={place} />
                  <button className="btn small" disabled={ctx.user.email.startsWith(`${place}-`)}>{libelle}</button>
                </form>
              ))}
              <form action={remettreAZero}><input type="hidden" name="__retour" value="/formation" /><button className="btn small">Remettre à zéro</button></form>
              <form action={quitterEntrainement}><button className="btn small primary">Revenir à mon lycée</button></form>
            </span>
          </div>
        </div>
      )}
      <main><div className="wrap"><Suspense fallback={null}><Bandeau /></Suspense>{children}</div></main>
    </>
  );
}
