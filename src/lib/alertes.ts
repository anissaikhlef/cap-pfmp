import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { envoyer } from "./messages";
import { referentDe } from "./requetes";

type Destinataire = { id: string; email: string; prenom: string };
type Eleve = { id: string; referentId: string | null; classeId: string | null };

/**
 * L'équipe à prévenir pour un élève : la vie scolaire, son professeur référent et la gestion des PFMP (BDE, DDFPT).
 * Comptes actifs du lycée uniquement, sans l'auteur de l'action.
 */
export async function equipeAPrevenir(ctx: Contexte, e: Eleve, qui: { vieScolaire?: boolean; referent?: boolean; gestion?: boolean } = {}) {
  const { vieScolaire = true, referent = true, gestion = true } = qui;
  const refId = referent ? await referentDe(e) : null;
  const tous = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, ctx.etab.id), eq(schema.users.actif, true)));
  return tous.filter((u) => u.id !== ctx.user.id && (
    (vieScolaire && u.roles.includes("vie_scolaire")) ||
    (gestion && u.roles.includes("gestionnaire")) ||
    u.id === refId
  ));
}

/** Les responsables légaux d'un élève qui ont un compte. */
export async function responsablesDe(eleveId: string) {
  const rs = await db.select({ u: schema.users }).from(schema.responsables)
    .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
    .where(and(eq(schema.responsables.eleveId, eleveId), eq(schema.users.actif, true)));
  return rs.map((r) => r.u);
}

/** Envoie le même mail à chaque destinataire (une seule fois par adresse). Renvoie le nombre de mails. */
export async function alerter(ctx: Contexte, dest: Destinataire[], m: { sujet: string; corps: (prenom: string) => string; eleveId?: string; entrepriseId?: string }) {
  const vus = new Set<string>();
  for (const d of dest) {
    if (vus.has(d.email)) continue;
    vus.add(d.email);
    await envoyer(ctx, { canal: "mail", destinataire: d.email, sujet: m.sujet, corps: m.corps(d.prenom), eleveId: m.eleveId, entrepriseId: m.entrepriseId });
  }
  return vus.size;
}
