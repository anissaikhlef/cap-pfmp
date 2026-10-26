import { timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";
import { relancesDuJour } from "@/lib/relances";

/**
 * Tâche quotidienne (à appeler chaque matin par un planificateur) :
 *   curl -H "Authorization: Bearer $TACHES_JETON" https://…/api/taches/quotidiennes
 */
export async function GET(req: Request) {
  // TACHES_JETON, ou CRON_SECRET que Vercel transmet automatiquement à ses tâches planifiées
  const attendu = process.env.TACHES_JETON || process.env.CRON_SECRET;
  const recu = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!attendu || attendu.length < 24 || recu.length !== attendu.length || !timingSafeEqual(Buffer.from(recu), Buffer.from(attendu))) {
    return new Response("Non autorisé", { status: 401 });
  }
  const etabs = await db.select().from(schema.etablissements);
  let total = 0;
  for (const e of etabs) total += await relancesDuJour(e);
  return Response.json({ relances: total });
}
