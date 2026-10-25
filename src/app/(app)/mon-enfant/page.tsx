import { contexte } from "@/lib/auth";

export const metadata = { title: "Mon enfant" };

export default async function MonEnfant() {
  const ctx = await contexte({ roles: ["parent"] });
  return (
    <div className="section">
      <h1>Bonjour {ctx.user.prenom}</h1>
      <p className="sub">Le suivi du stage de votre enfant arrive à l&apos;étape 3 : convention, signatures et documents.</p>
    </div>
  );
}
