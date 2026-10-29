import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { elevesDuParent } from "@/lib/acces";
import { traduirePourLaFamille } from "@/lib/traduction";

const Demande = z.object({ eleveId: z.string().uuid(), textes: z.array(z.string().max(1500)).max(150) });

/** Les textes de l'espace « Mon enfant », traduits dans la langue de la famille (seulement pour un parent de l'élève). */
export async function POST(req: Request) {
  const ctx = await contexte({ roles: ["parent"] });
  const d = Demande.safeParse(await req.json().catch(() => null));
  if (!d.success) return new Response("Demande invalide", { status: 400 });
  if (!(await elevesDuParent(ctx)).includes(d.data.eleveId)) return new Response("Accès refusé", { status: 403 });
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, d.data.eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e) return new Response("Accès refusé", { status: 403 });
  const t = await traduirePourLaFamille(ctx.etab, e, d.data.textes);
  return Response.json({ traductions: t?.textes ?? d.data.textes.map(() => null) });
}
