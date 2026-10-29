import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { modeleRecapitulatif } from "@/lib/recapitulatif";
import { lireFichier } from "@/lib/stockage";

/** Le fichier de l'académie tel que le lycée l'a déposé, vide. */
export async function GET() {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return new Response("Accès refusé", { status: 403 });
  const m = await modeleRecapitulatif(ctx.etab.id);
  if (!m) return new Response("Aucun fichier déposé", { status: 404 });
  return new Response(new Uint8Array(await lireFichier(m.cle)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${m.nom}"`, "Cache-Control": "private, no-store",
    },
  });
}
