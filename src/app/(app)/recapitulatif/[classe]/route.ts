import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import { nomDeFichier } from "@/lib/listes-def";
import { classeurRecapitulatif, fichierAcademie, pdfRecapitulatif, recapitulatif } from "@/lib/recapitulatif";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * L'attestation récapitulative d'une classe d'examen : le fichier de l'académie rempli (format=academie), ou la version
 * Cap PFMP en Excel (format=excel) ou en PDF (format=pdf).
 */
export async function GET(req: Request, { params }: { params: Promise<{ classe: string }> }) {
  const ctx = await contexte();
  const { classe } = await params;
  const r = /^[0-9a-f-]{36}$/.test(classe) ? await recapitulatif(ctx, classe) : null;
  if (!r) return new Response("Accès refusé : l'attestation récapitulative se prépare pour une classe d'examen, par la direction, le DDFPT ou le professeur référent de la classe.", { status: 403 });
  const format = new URL(req.url).searchParams.get("format");
  const nom = nomDeFichier("Attestation recapitulative PFMP", r.classe.libelle, `session ${r.session}`);
  await journaliser(ctx, "recapitulatif_exporte", "classe", r.classe.id, { format, eleves: r.candidats.length });
  const entetes = (type: string, fichier: string, enLigne = false) => ({
    "Content-Type": type, "Content-Disposition": `${enLigne ? "inline" : "attachment"}; filename="${fichier}"`, "Cache-Control": "private, no-store",
  });
  if (format === "academie") {
    const f = await fichierAcademie(ctx, r);
    if (typeof f === "string") return new Response(f, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return new Response(new Uint8Array(f), { headers: entetes(XLSX, `${nomDeFichier("Attestation PFMP academie", r.classe.libelle, `session ${r.session}`)}.xlsx`) });
  }
  if (format === "pdf") return new Response(Buffer.from(await pdfRecapitulatif(r, ctx)), { headers: entetes("application/pdf", `${nom}.pdf`, true) });
  return new Response(Buffer.from(classeurRecapitulatif(r, ctx)), { headers: entetes(XLSX, `${nom}.xlsx`) });
}
