import "server-only";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";

/**
 * Mails et SMS sortants. Aucun prestataire n'est encore branché : chaque message est enregistré
 * avec le statut « simulé » et apparaît dans l'historique. Brancher ici un prestataire hébergé dans l'UE.
 */
export async function envoyer(ctx: Contexte, m: {
  canal: "mail" | "sms"; destinataire: string; sujet?: string; corps: string; eleveId?: string | null; entrepriseId?: string | null;
}) {
  await db.insert(schema.messages).values({
    etablissementId: ctx.etab.id, canal: m.canal, destinataire: m.destinataire, sujet: m.sujet ?? null, corps: m.corps,
    statut: "simule", eleveId: m.eleveId ?? null, entrepriseId: m.entrepriseId ?? null, envoyeParId: ctx.user.id,
  });
}
