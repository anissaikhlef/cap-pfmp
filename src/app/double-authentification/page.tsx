import { redirect } from "next/navigation";
import { contexteOptionnel } from "@/lib/auth";
import { Formulaire } from "@/components/Formulaire";
import { verifierCode } from "./actions";

export const metadata = { title: "Double authentification" };

export default async function DoubleAuthentification() {
  const ctx = await contexteOptionnel({ nonVerifiee: true });
  if (!ctx) redirect("/connexion");
  return (
    <main className="login">
      <div className="panel pad section">
        <h1>Code de vérification</h1>
        <p className="sub">Ouvrez votre application d&apos;authentification et saisissez le code à 6 chiffres affiché pour Cap PFMP.</p>
        <Formulaire action={verifierCode} bouton="Valider">
          <label className="f" htmlFor="code">Code<input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus /></label>
        </Formulaire>
        <p className="sub">Téléphone perdu ? Demandez à la direction de réinitialiser votre accès.</p>
      </div>
    </main>
  );
}
