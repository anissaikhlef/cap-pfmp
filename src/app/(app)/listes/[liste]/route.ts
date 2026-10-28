import { contexte } from "@/lib/auth";
import { versCsv } from "@/lib/csv";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { journaliser } from "@/lib/journal";
import { NOMS_LISTES, nomDeFichier, type Liste } from "@/lib/listes-def";
import { anneesDesListes, classesDesListes, construireListe, peutExporter } from "@/lib/listes";
import { tableauPdf } from "@/lib/tableau-pdf";

/**
 * Une liste exportée (décision d'Anissa) : en tableau pour Excel (format=excel) ou en PDF prêt à imprimer (format=pdf),
 * pour une classe ou pour toutes les classes que la personne peut voir, sur une année scolaire.
 */
export async function GET(req: Request, { params }: { params: Promise<{ liste: string }> }) {
  const ctx = await contexte();
  const { liste: brut } = await params;
  const liste = brut as Liste;
  if (!NOMS_LISTES.includes(liste) || !peutExporter(ctx, liste)) return new Response("Accès refusé", { status: 403 });
  const q = new URL(req.url).searchParams;
  const annees = await anneesDesListes(ctx);
  const annee = annees.includes(q.get("annee") ?? "") ? q.get("annee")! : ctx.etab.anneeScolaire;
  const permises = await classesDesListes(ctx, annee);
  const demande = q.get("classe");
  const classes = demande && demande !== "tout" ? permises.filter((c) => c.id === demande) : permises;
  if (!classes.length) return new Response("Aucune classe : vous ne pouvez exporter que les listes de vos classes.", { status: 403 });
  const t = await construireListe(ctx, liste, classes, annee);
  const fichier = nomDeFichier(t.titre, classes.length === 1 ? classes[0].libelle : "", annee);
  await journaliser(ctx, "liste_exportee", "etablissement", ctx.etab.id, { liste, annee, classes: classes.length, format: q.get("format") });
  if (q.get("format") === "pdf") {
    const pdf = await tableauPdf(t, `${ctx.etab.nom} · Cap PFMP · ${dateLongue(aujourdhui())}`);
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fichier}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }
  return new Response(versCsv([[t.titre], [t.sousTitre], [], t.colonnes, ...t.lignes]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fichier}.csv"`, "Cache-Control": "private, no-store" },
  });
}
