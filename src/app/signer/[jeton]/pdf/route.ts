import { chargerConventionEtab } from "@/lib/convention";
import { etablissementDuLien, lienParJeton } from "@/lib/liens";
import { pdfConvention, reponsePdf } from "@/lib/modeles-documents";

/**
 * La convention remplie dans le PDF du lycée, pour la personne qui a reçu un lien personnel pour la signer :
 * le jeton (secret, limité dans le temps) remplace la session, même après la signature, jusqu'à son expiration.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const lien = await lienParJeton(jeton, "signature");
  if (!lien?.stageId || lien.expireLe < new Date()) return new Response("Lien introuvable ou expiré", { status: 404 });
  const etab = await etablissementDuLien(lien.etablissementId);
  const cv = etab ? await chargerConventionEtab(etab, lien.stageId) : null;
  const pdf = etab && cv ? await pdfConvention(etab, cv) : null;
  if (!pdf) return new Response("Introuvable", { status: 404 });
  return reponsePdf(pdf, "convention.pdf");
}
