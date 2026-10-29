import "server-only";
import { db, schema } from "@/db";
import { messagePourLaFamille } from "./traduction";

/**
 * Mails et SMS sortants. Aucun prestataire n'est encore branché : chaque message est enregistré
 * avec le statut « simulé » et apparaît dans l'historique. Brancher ici un prestataire hébergé dans l'UE.
 *
 * Un message à un parent d'élève part dans la langue de la famille, avec le français dessous (décision d'Anissa),
 * quand une langue est indiquée sur la fiche de l'élève.
 */
export async function envoyer(ctx: { etab: { id: string }; user?: { id: string } | null }, m: {
  canal: "mail" | "sms"; destinataire: string; sujet?: string; corps: string; eleveId?: string | null; entrepriseId?: string | null;
  piecesJointes?: string[];
}) {
  const traduit = m.eleveId ? await messagePourLaFamille(ctx.etab.id, m.eleveId, m.destinataire, m).catch(() => null) : null;
  await db.insert(schema.messages).values({
    etablissementId: ctx.etab.id, canal: m.canal, destinataire: m.destinataire, sujet: traduit?.sujet ?? m.sujet ?? null, corps: traduit?.corps ?? m.corps,
    statut: "simule", eleveId: m.eleveId ?? null, entrepriseId: m.entrepriseId ?? null, envoyeParId: ctx.user?.id ?? null,
    piecesJointes: m.piecesJointes?.length ? m.piecesJointes : null,
  });
}
