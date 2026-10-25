import { contexte } from "@/lib/auth";

export const metadata = { title: "Mon stage" };

export default async function MonStage() {
  const ctx = await contexte({ roles: ["eleve"] });
  return (
    <div className="section">
      <h1>Bonjour {ctx.user.prenom}</h1>
      <p className="sub">Votre espace de stage arrive à l&apos;étape 2 : démarches, entreprises suggérées et dépôt de la convention.</p>
    </div>
  );
}
