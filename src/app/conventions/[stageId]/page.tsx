import { notFound } from "next/navigation";
import { contexte } from "@/lib/auth";
import { a, peutVoirEleve } from "@/lib/acces";
import { chargerConvention } from "@/lib/convention";
import { ContenuConvention } from "@/components/ContenuConvention";

export const metadata = { title: "Convention de stage" };

export default async function Convention({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(stageId)) notFound();
  const ctx = await contexte();
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) notFound();
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId;
  if (!tuteur && !(await peutVoirEleve(ctx, cv.e))) notFound();
  return (
    <main className="convention">
      <p className="note noprint">Modèle provisoire de démonstration. Il sera remplacé par le modèle de convention de votre établissement ou de votre académie. Imprimez cette page depuis le menu de votre navigateur.</p>
      <ContenuConvention etab={ctx.etab} cv={cv} />
    </main>
  );
}
