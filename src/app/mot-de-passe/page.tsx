import { contexte, MOT_DE_PASSE_MIN } from "@/lib/auth";
import { Formulaire } from "@/components/Formulaire";
import { changerMotDePasse } from "./actions";

export const metadata = { title: "Mot de passe" };

export default async function MotDePasse() {
  const ctx = await contexte({ ignorerChangementMdp: true });
  return (
    <main className="login">
      <div className="panel pad section">
        <h1>Choisissez votre mot de passe</h1>
        <p className="sub">
          {ctx.user.doitChangerMotDePasse
            ? "Votre compte a été créé avec un mot de passe provisoire. Remplacez-le pour continuer."
            : "Modifiez votre mot de passe. Vous devrez ensuite vous reconnecter."}
        </p>
        <Formulaire action={changerMotDePasse} bouton="Enregistrer le mot de passe">
          <label className="f" htmlFor="actuel">Mot de passe actuel
            <input id="actuel" name="actuel" type="password" autoComplete="current-password" required />
          </label>
          <label className="f" htmlFor="nouveau">Nouveau mot de passe ({MOT_DE_PASSE_MIN} caractères minimum, avec lettres et chiffres)
            <input id="nouveau" name="nouveau" type="password" autoComplete="new-password" minLength={MOT_DE_PASSE_MIN} required />
          </label>
          <label className="f" htmlFor="confirmation">Confirmez le nouveau mot de passe
            <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
          </label>
        </Formulaire>
      </div>
    </main>
  );
}
