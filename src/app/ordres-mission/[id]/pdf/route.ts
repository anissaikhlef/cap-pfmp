import { contexteOptionnel } from "@/lib/auth";
import { a, peutGererEleve, peutSignerOrdreMission } from "@/lib/acces";
import { chargerVisite } from "@/lib/visites";
import { chargerConvention } from "@/lib/convention";
import { modeleDuLycee, reponsePdf, utiliseLePdf } from "@/lib/modeles-documents";
import { remplirPdf } from "@/lib/modeles-pdf";
import { lireFichier } from "@/lib/stockage";
import { valeursOrdreMission } from "@/lib/valeurs-zones";

/**
 * L'ordre de mission et compte rendu dans le PDF du lycée, rempli dans les zones qu'il y a placées. Une fois signé,
 * il garde le modèle du jour de la signature. Accès : comme la page imprimable.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const l = await chargerVisite(ctx, id);
  if (!l?.v?.visiteurId || l.v.ordreMission === "aucun") return new Response("Introuvable", { status: 404 });
  if (l.v.visiteurId !== ctx.user.id && !a(ctx, "direction") && !peutSignerOrdreMission(ctx) && !(await peutGererEleve(ctx, l.e))) return new Response("Introuvable", { status: 404 });
  const m = l.s.modeles?.ordre_mission ?? (await modeleDuLycee(ctx.etab.id, "ordre_mission"));
  const cv = await chargerConvention(ctx, l.s.id);
  if (!utiliseLePdf(m) || !cv) return new Response("Ce lycée n'utilise pas son propre PDF pour l'ordre de mission.", { status: 404 });
  const pdf = await remplirPdf(new Uint8Array(await lireFichier(m.pdfCle)), { valeurs: new Map() }, m.zones ?? [], await valeursOrdreMission(ctx.etab, cv, l.v));
  return reponsePdf(pdf, `ordre-de-mission-${l.e.nom}.pdf`);
}
