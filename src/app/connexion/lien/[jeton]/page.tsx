import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { lienParJeton } from "@/lib/liens";
import { Formulaire } from "@/components/Formulaire";
import { utiliserLienConnexion } from "./actions";

export const metadata = { title: "Connexion" };

/**
 * Page du lien de connexion. La connexion ne se fait qu'au clic sur le bouton : les logiciels de messagerie
 * qui ouvrent les liens pour les vérifier ne consomment pas le lien à la place de la personne.
 */
export default async function LienConnexion({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "connexion");
  const [u] = lien?.userId ? await db.select().from(schema.users).where(eq(schema.users.id, lien.userId)).limit(1) : [];
  const valable = !!lien && !!u && !lien.utiliseLe && lien.expireLe > new Date();
  return (
    <main className="login">
      <div className="panel pad section">
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        {valable ? (
          <>
            <h1>Bonjour {u.prenom}</h1>
            <p className="sub">Vous vous connectez à Cap PFMP avec le lien reçu par e-mail, sans mot de passe.</p>
            <Formulaire action={utiliserLienConnexion} bouton="Me connecter">
              <input type="hidden" name="jeton" value={jeton} />
            </Formulaire>
          </>
        ) : (
          <>
            <h1>{lien ? "Lien expiré" : "Lien introuvable"}</h1>
            <p className="sub">{lien ? "Ce lien a déjà servi ou n'est plus valable." : "Ce lien n'est pas valable."} Vous pouvez en demander un nouveau sur la page de connexion.</p>
            <Link className="btn" href="/connexion">Page de connexion</Link>
          </>
        )}
      </div>
    </main>
  );
}
