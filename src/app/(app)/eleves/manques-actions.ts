"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import { peutArreterRappels } from "@/lib/manques";
import { revenirAvec } from "@/lib/retour";

async function charger(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().safeParse(fd.get("eleveId")).data;
  const [e] = id ? await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, id), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1) : [];
  if (!e || !(await peutArreterRappels(ctx, e))) revenirAvec(fd, "Seuls le DDFPT et le professeur référent de l'élève arrêtent ce rappel.", "err");
  return { ctx, e };
}

/**
 * Arrête les rappels des jours de stage manquants (décision d'Anissa) : la raison est écrite librement ; pour l'élève et sa
 * famille, et, si la personne le coche, pour elle-même. Le rappel reste arrêté jusqu'à ce qu'il soit réactivé.
 */
export async function arreterRappels(fd: FormData) {
  const { ctx, e } = await charger(fd);
  const raison = String(fd.get("raison") ?? "").trim().slice(0, 500);
  if (raison.length < 3) revenirAvec(fd, "Écrivez la raison de l'arrêt du rappel.", "err");
  const cibles = [...(fd.get("famille") === "oui" ? ["famille"] : []), ...(fd.get("moi") === "oui" ? [ctx.user.id] : [])];
  if (!cibles.length) revenirAvec(fd, "Cochez pour qui arrêter le rappel.", "err");
  for (const cible of cibles) {
    await db.insert(schema.arretsRappels).values({ etablissementId: ctx.etab.id, eleveId: e.id, cible, raison, parId: ctx.user.id })
      .onConflictDoUpdate({ target: [schema.arretsRappels.eleveId, schema.arretsRappels.cible], set: { raison, parId: ctx.user.id, le: new Date() } });
  }
  await journaliser(ctx, "rappel_arrete", "eleve", e.id, { cibles: cibles.map((c) => (c === "famille" ? "famille" : "soi")), raison });
  revalidatePath(`/eleves/${e.id}`);
  revenirAvec(fd, `Rappel arrêté ${cibles.length === 2 ? "pour l'élève, sa famille et vous" : cibles[0] === "famille" ? "pour l'élève et sa famille" : "pour vous"}.`);
}

export async function reactiverRappel(fd: FormData) {
  const { ctx, e } = await charger(fd);
  const cible = String(fd.get("cible") ?? "");
  await db.delete(schema.arretsRappels).where(and(eq(schema.arretsRappels.eleveId, e.id), eq(schema.arretsRappels.cible, cible), eq(schema.arretsRappels.etablissementId, ctx.etab.id)));
  await journaliser(ctx, "rappel_reactive", "eleve", e.id, { cible: cible === "famille" ? "famille" : "personne" });
  revalidatePath(`/eleves/${e.id}`);
  revenirAvec(fd, "Rappel réactivé.");
}
