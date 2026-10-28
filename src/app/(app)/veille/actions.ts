"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { aLAgent } from "@/lib/agents";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";

/** Lue, ou une décision sur une proposition : « c'est fait » ou « pas pour nous ». Rien ne change tout seul dans Cap PFMP. */
export async function suiteAlerte(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!aLAgent(ctx.etab.reglages, "veille")) revenirAvec(fd, "Votre lycée n'a pas choisi Cap Veille.", "err");
  const P = z.object({ alerteId: z.string().uuid(), proposition: z.coerce.number().int().min(0).max(20).optional(), decision: z.enum(["fait", "pas_pour_nous"]).optional() })
    .safeParse({ alerteId: fd.get("alerteId"), proposition: fd.get("proposition") ?? undefined, decision: fd.get("decision") ?? undefined });
  if (!P.success) revenirAvec(fd, "Demande invalide.", "err");
  const [al] = await db.select().from(schema.alertesVeille).where(and(eq(schema.alertesVeille.id, P.data.alerteId), isNotNull(schema.alertesVeille.publieeLe))).limit(1);
  if (!al) revenirAvec(fd, "Alerte introuvable.", "err");
  const [s] = await db.select().from(schema.suitesVeille).where(and(eq(schema.suitesVeille.alerteId, al.id), eq(schema.suitesVeille.etablissementId, ctx.etab.id))).limit(1);
  const decisions = { ...(s?.decisions ?? {}) };
  if (P.data.proposition !== undefined && P.data.decision && P.data.proposition < al.propositions.length) decisions[String(P.data.proposition)] = P.data.decision;
  await db.insert(schema.suitesVeille).values({ alerteId: al.id, etablissementId: ctx.etab.id, lueLe: new Date(), decisions, parId: ctx.user.id })
    .onConflictDoUpdate({ target: [schema.suitesVeille.alerteId, schema.suitesVeille.etablissementId], set: { lueLe: s?.lueLe ?? new Date(), decisions, parId: ctx.user.id } });
  await journaliser(ctx, "veille_suite", "alerte_veille", al.id, { proposition: P.data.proposition, decision: P.data.decision });
  revalidatePath("/", "layout");
  revenirAvec(fd, P.data.decision ? (P.data.decision === "fait" ? "Proposition notée comme faite." : "Proposition écartée pour votre lycée.") : "Alerte marquée comme lue.");
}
