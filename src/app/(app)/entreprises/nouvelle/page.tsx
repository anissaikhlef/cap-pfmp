import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { domaines } from "@/lib/domaines";
import { Formulaire } from "@/components/Formulaire";
import { ChampsEntreprise } from "../ChampsEntreprise";
import { creerEntreprise } from "../actions";

export const metadata = { title: "Ajouter une entreprise" };

export default async function NouvelleEntreprise() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/entreprises");
  return (
    <>
      <h1>Ajouter une entreprise</h1>
      <div className="panel pad"><Formulaire action={creerEntreprise} bouton="Créer la fiche"><ChampsEntreprise domaines={await domaines(ctx)} /></Formulaire></div>
    </>
  );
}
