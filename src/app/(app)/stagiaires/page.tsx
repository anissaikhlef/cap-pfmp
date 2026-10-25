import { contexte } from "@/lib/auth";

export const metadata = { title: "Mes stagiaires" };

export default async function Stagiaires() {
  const ctx = await contexte({ roles: ["entreprise"] });
  return (
    <div className="section">
      <h1>Bonjour {ctx.user.prenom}</h1>
      <p className="sub">La liste de vos stagiaires et le dépôt des attestations arrivent à l&apos;étape 3.</p>
    </div>
  );
}
