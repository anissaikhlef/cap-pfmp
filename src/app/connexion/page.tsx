import { redirect } from "next/navigation";
import { contexteOptionnel } from "@/lib/auth";
import { Formulaire } from "@/components/Formulaire";
import { seConnecter } from "./actions";

export const metadata = { title: "Connexion" };

export default async function Connexion() {
  if (await contexteOptionnel()) redirect("/");
  return (
    <main className="login">
      <div className="panel pad section">
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <p className="sub">Suivi des stages en lycée professionnel</p>
        <Formulaire action={seConnecter} bouton="Se connecter">
          <label className="f" htmlFor="email">Adresse e-mail
            <input id="email" name="email" type="email" autoComplete="username" required />
          </label>
          <label className="f" htmlFor="motdepasse">Mot de passe
            <input id="motdepasse" name="motdepasse" type="password" autoComplete="current-password" required />
          </label>
        </Formulaire>
        <p className="sub">Mot de passe oublié ? Demandez-en un nouveau à la personne qui gère les stages dans votre lycée.</p>
      </div>
    </main>
  );
}
