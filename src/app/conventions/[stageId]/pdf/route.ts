import { contexteOptionnel } from "@/lib/auth";
import { a, peutVoirEleve } from "@/lib/acces";
import { chargerConvention } from "@/lib/convention";
import { pdfConvention, reponsePdf } from "@/lib/modeles-documents";

/** La convention remplie dans le PDF du lycée, pour ceux qui peuvent voir la convention. */
export async function GET(_req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse) return new Response("Connexion requise", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(stageId)) return new Response("Introuvable", { status: 404 });
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return new Response("Introuvable", { status: 404 });
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId;
  if (!tuteur && !(await peutVoirEleve(ctx, cv.e))) return new Response("Introuvable", { status: 404 });
  const pdf = await pdfConvention(ctx.etab, cv);
  if (!pdf) return Response.redirect(new URL(`/conventions/${stageId}`, _req.url), 303);
  return reponsePdf(pdf, `convention-${cv.e.nom}-${cv.e.prenom}.pdf`);
}
