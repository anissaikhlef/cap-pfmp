import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexteOptionnel } from "@/lib/auth";
import { peutVoirDocument } from "@/lib/acces";
import { lireFichier } from "@/lib/stockage";
import { journaliser } from "@/lib/journal";

/** Téléchargement d'un document déposé, après vérification des droits. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse) return new Response("Connexion requise", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const [d] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1);
  if (!d || !(await peutVoirDocument(ctx, d))) return new Response("Introuvable", { status: 404 });
  const contenu = await lireFichier(d.cleStockage);
  await journaliser(ctx, "document_consulte", "document", d.id);
  return new Response(new Uint8Array(contenu), {
    headers: {
      "Content-Type": d.typeMime,
      "Content-Disposition": `inline; filename="${d.nomFichier.replace(/"/g, "")}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
