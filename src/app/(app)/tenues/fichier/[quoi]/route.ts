import { contexte } from "@/lib/auth";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { journaliser } from "@/lib/journal";
import { nomDeFichier } from "@/lib/listes-def";
import { tableauPdf } from "@/lib/tableau-pdf";
import { classesDesTenues, fichierCommande, fichierRemises, gereLesTenues, peutDistribuer } from "@/lib/tenues";
import { classeurXlsx } from "@/lib/xlsx";

/**
 * Les fichiers des tenues (décision d'Anissa) : la commande pour le DDFPT (total par article et par taille, puis le
 * détail par élève), et après la distribution, la liste des remises signées. En Excel (.xlsx) ou en PDF.
 */
export async function GET(req: Request, { params }: { params: Promise<{ quoi: string }> }) {
  const ctx = await contexte();
  const { quoi } = await params;
  const permis = quoi === "commande" ? gereLesTenues(ctx) : quoi === "remises" ? peutDistribuer(ctx) : false;
  if (!permis) return new Response("Accès refusé", { status: 403 });
  const q = new URL(req.url).searchParams;
  const toutes = await classesDesTenues(ctx);
  const classes = q.get("classe") === "tout" ? toutes : toutes.filter((c) => c.id === q.get("classe"));
  if (!classes.length) return new Response("Aucune classe", { status: 404 });
  const tableaux = quoi === "commande" ? await fichierCommande(ctx, classes) : [await fichierRemises(ctx, classes)];
  const nom = nomDeFichier(quoi === "commande" ? "commande tenues" : "remises tenues", classes.length === 1 ? classes[0].libelle : "toutes les classes", ctx.etab.anneeScolaire);
  await journaliser(ctx, "tenues_exportees", "etablissement", ctx.etab.id, { quoi, classes: classes.length, format: q.get("format") });
  if (q.get("format") === "pdf") {
    return new Response(Buffer.from(await tableauPdf(tableaux, `${ctx.etab.nom} · Cap PFMP · ${dateLongue(aujourdhui())}`)), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nom}.pdf"`, "Cache-Control": "private, no-store" },
    });
  }
  return new Response(Buffer.from(classeurXlsx(tableaux.map((t, i) => ({ ...t, onglet: quoi === "commande" ? ["Commande", "Détail par élève"][i] : "Remises" })))), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nom}.xlsx"`, "Cache-Control": "private, no-store" },
  });
}
