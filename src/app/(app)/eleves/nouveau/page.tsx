import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { optionsEleve } from "@/lib/options";
import { Formulaire } from "@/components/Formulaire";
import { ChampsEleve } from "../ChampsEleve";
import { creerEleve } from "../actions";

export const metadata = { title: "Ajouter un élève" };

export default async function NouvelEleve() {
  const ctx = await contexte();
  const o = await optionsEleve(ctx);
  if (!o.classes.length) redirect("/classes");
  return (
    <>
      <h1>Ajouter un élève</h1>
      <div className="panel pad">
        <Formulaire action={creerEleve} bouton="Créer la fiche">
          <ChampsEleve {...o} />
        </Formulaire>
      </div>
    </>
  );
}
