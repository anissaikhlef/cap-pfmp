import Link from "next/link";
import { contexte } from "@/lib/auth";
import { liensPour } from "@/lib/navigation";
import { Nav } from "@/components/Nav";
import { seDeconnecter } from "./actions";
import { Suspense } from "react";
import { Bandeau } from "@/components/Bandeau";

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
              <Link href="/mot-de-passe" style={{ color: "inherit" }}>Mot de passe</Link>
              {!ctx.user.totpActif && ctx.user.roles.some((r) => r === "direction" || r === "gestionnaire" || r === "professeur" || r === "vie_scolaire") && (
                <Link href="/double-authentification/activer" style={{ color: "inherit" }}>Sécuriser mon compte</Link>
              )}
              <form action={seDeconnecter}><button>Se déconnecter</button></form>
            </div>
          </div>
          <Nav liens={liens} />
        </div>
      </header>
      <main><div className="wrap"><Suspense fallback={null}><Bandeau /></Suspense>{children}</div></main>
    </>
  );
}
