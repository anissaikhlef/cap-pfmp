import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { a, peutAdministrer, peutVoirEleve } from "@/lib/acces";
import { modeleDeLaConvention, utiliseLePdf } from "@/lib/modeles-documents";
import { chargerConvention } from "@/lib/convention";
import { ContenuConvention } from "@/components/ContenuConvention";

export const metadata = { title: "Convention de stage" };

export default async function Convention({ params, searchParams }: { params: Promise<{ stageId: string }>; searchParams: Promise<{ apercu?: string }> }) {
  const { stageId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(stageId)) notFound();
  const ctx = await contexte();
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) notFound();
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId;
  if (!tuteur && !(await peutVoirEleve(ctx, cv.e))) notFound();
  // Le lycée utilise son propre PDF : la convention s'ouvre remplie dans ce PDF (sauf aperçu du modèle Cap PFMP par le DDFPT).
  const apercu = (await searchParams).apercu === "cap" && peutAdministrer(ctx);
  if (!apercu && utiliseLePdf(await modeleDeLaConvention(ctx.etab, cv))) redirect(`/conventions/${stageId}/pdf`);
  return (
    <main className="convention">
      <p className="note noprint">
        Imprimez cette page depuis le menu de votre navigateur.
        {peutAdministrer(ctx) && <> Ce modèle s&apos;adapte (logo, textes, rubriques) ou se remplace par le PDF de votre lycée dans <Link href="/organisation/documents/convention">Modèles de documents</Link>.</>}
      </p>
      <ContenuConvention etab={ctx.etab} cv={cv} />
    </main>
  );
}
