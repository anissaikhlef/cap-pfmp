import { contexteOptionnel } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { pdfExempleConvention } from "@/lib/modeles-pdf";
import { reponsePdf } from "@/lib/modeles-documents";

/** Un exemple fictif de convention en PDF modifiable, pour essayer le remplissage (DDFPT et direction). */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse || !peutAdministrer(ctx)) return new Response("Accès réservé", { status: 403 });
  if (type !== "convention") return new Response("Introuvable", { status: 404 });
  return reponsePdf(await pdfExempleConvention(), "exemple-convention-pdf-modifiable.pdf");
}
