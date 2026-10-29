"use server";
import { revalidatePath } from "next/cache";
import { contexte } from "@/lib/auth";
import { gereToutLEtablissement } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { retardsEquipe } from "@/lib/point";
import { revenirAvec } from "@/lib/retour";
import { db, schema } from "@/db";

/**
 * Les rappels aux professeurs, préparés par Cap Admin (décision d'Anissa : « le DDFPT reçoit une alerte, puis un outil
 * préparé lui permet de faire les rappels aux profs ») : il coche, relit ou modifie chaque message, puis envoie.
 */
export async function envoyerRappelsEquipe(fd: FormData) {
  const ctx = await contexte();
  if (!gereToutLEtablissement(ctx)) revenirAvec(fd, "Seuls le DDFPT et la direction envoient ces rappels.", "err");
  const retards = await retardsEquipe(ctx.etab);
  const choisis = new Set(fd.getAll("prof").map(String));
  let n = 0;
  for (const id of choisis) {
    const siens = retards.filter((r) => r.profs.some((p) => p.id === id));
    const prof = siens[0]?.profs.find((p) => p.id === id);
    const texte = String(fd.get(`message_${id}`) ?? "").trim().slice(0, 5000);
    if (!prof || texte.length < 10) continue;
    await envoyer(ctx, { canal: "mail", destinataire: prof.email, sujet: "Rappel : stages à suivre", corps: texte });
    await db.insert(schema.journal).values(siens.map((r) => ({ etablissementId: ctx.etab.id, userId: ctx.user.id, action: "rappel_equipe", entite: "visite", entiteId: r.cle })));
    n++;
  }
  await journaliser(ctx, "rappels_equipe_envoyes", "etablissement", ctx.etab.id, { professeurs: n });
  revalidatePath("/point-de-la-semaine");
  revenirAvec(fd, n ? `${n} rappel(s) envoyé(s) aux professeurs.` : "Cochez au moins un professeur.", n ? "ok" : "err");
}
