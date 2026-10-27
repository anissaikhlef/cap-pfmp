import { redirect } from "next/navigation";
import { contexteOptionnel } from "@/lib/auth";
import { Formulaire } from "@/components/Formulaire";
import { demanderLienConnexion, seConnecter } from "./actions";

export const metadata = { title: "Connexion" };

export default async function Connexion({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (await contexteOptionnel()) redirect("/");
  // Adresse préremplie : le QR code des fiches de connexion y mène.
  const { email } = await searchParams;
  const adresse = typeof email === "string" && email.length <= 200 ? email : "";
  return (
    <main className="login">
      <div className="panel pad section">
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <p className="sub">Suivi des stages en lycée professionnel</p>
        <Formulaire action={seConnecter} bouton="Se connecter">
          <label className="f" htmlFor="email">Adresse e-mail
            <input id="email" name="email" type="email" autoComplete="username" defaultValue={adresse} required />
          </label>
          <label className="f" htmlFor="motdepasse">Mot de passe
            <input id="motdepasse" name="motdepasse" type="password" autoComplete="current-password" required />
          </label>
        </Formulaire>
        <details>
          <summary className="btn small">Me connecter sans mot de passe</summary>
          <p className="sub">Élèves, parents et entreprises : recevez un lien de connexion par e-mail, valable quelques minutes.</p>
          <Formulaire action={demanderLienConnexion} bouton="Recevoir le lien" boutonClasse="btn">
            <label className="f" htmlFor="lien-email">Adresse e-mail<input id="lien-email" name="email" type="email" autoComplete="email" defaultValue={adresse} required /></label>
          </Formulaire>
        </details>
        <p className="sub">Mot de passe oublié ? Demandez-en un nouveau à la personne qui gère les stages dans votre lycée.</p>
      </div>
    </main>
  );
}
