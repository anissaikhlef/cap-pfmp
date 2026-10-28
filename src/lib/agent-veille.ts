import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { completerReglages } from "@/db/schema";
import type { Contexte } from "./auth";
import { demanderIA } from "./ia";
import { envoyer } from "./messages";
import { adresseDuSite } from "./liens";

/**
 * Agent 2, au choix du lycée : Cap Veille, la veille réglementaire (décision d'Anissa : « une alerte avec un résumé et le
 * lien vers le texte officiel, et des propositions de changements dans Cap PFMP, validées par une personne avant de
 * s'appliquer »). L'administration de Cap PFMP repère le texte officiel ; Cap Veille le résume et propose les changements ;
 * l'administration relit et publie l'alerte ; chaque lycée qui a choisi Cap Veille décide de chaque proposition.
 */
const SCHEMA_ALERTE = {
  type: "object", additionalProperties: false, required: ["resume", "propositions"],
  properties: { resume: { type: "string" }, propositions: { type: "array", items: { type: "string" } } },
};
const Alerte = z.object({ resume: z.string().trim().min(20).max(3000), propositions: z.array(z.string().trim().min(5).max(500)).max(8) });

/** Cap Veille lit un texte officiel et prépare l'alerte (non publiée : l'administration la relit d'abord). */
export async function preparerAlerte(ctx: Contexte, a: { titre: string; source: string; texte: string }) {
  const r = await demanderIA(null, {
    agent: "veille", objet: "Alerte de veille réglementaire", effort: "medium",
    consignes: "Tu fais la veille réglementaire des périodes de formation en milieu professionnel (PFMP) pour les lycées professionnels. À partir du seul texte officiel fourni, écris un résumé de 5 à 8 lignes pour la direction et le DDFPT d'un lycée : ce qui change, pour qui, à partir de quand. Puis liste les changements concrets à prévoir dans l'organisation du lycée ou dans Cap PFMP (convention, durée des stages, allocation, signatures, relances…). Si le texte ne concerne pas les PFMP, dis-le dans le résumé et ne propose rien. N'invente aucune date ni aucun chiffre.",
    demande: `Titre : ${a.titre}\nSource : ${a.source}\nTexte officiel :\n"""\n${a.texte}\n"""`,
    schema: SCHEMA_ALERTE, verifier: (x) => Alerte.safeParse(x).data ?? null,
    exemple: () => ({
      resume: `${a.texte.replace(/\s+/g, " ").slice(0, 600)}${a.texte.length > 600 ? "…" : ""}`,
      propositions: ["Vérifier si le modèle de convention du lycée doit être mis à jour.", "Informer l'équipe pédagogique lors du prochain conseil."],
    }),
  });
  if (!r.ok) return r;
  const [al] = await db.insert(schema.alertesVeille).values({
    titre: a.titre, source: a.source, resume: r.valeur.resume, propositions: r.valeur.propositions, simule: r.simule, creeParId: ctx.user.id,
  }).returning();
  return { ok: true as const, alerte: al };
}

/** Publie une alerte relue : elle arrive chez chaque lycée qui a Cap Veille, avec un mail à la direction et à la gestion des PFMP. */
export async function publierAlerte(id: string) {
  const [al] = await db.update(schema.alertesVeille).set({ publieeLe: new Date() })
    .where(and(eq(schema.alertesVeille.id, id), isNull(schema.alertesVeille.publieeLe))).returning();
  if (!al) return 0;
  const base = await adresseDuSite();
  const etabs = (await db.select().from(schema.etablissements).where(isNull(schema.etablissements.entrainementDeId)))
    .filter((e) => completerReglages(e.reglages).agents.veille);
  let n = 0;
  for (const etab of etabs) {
    const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etab.id), eq(schema.users.actif, true),
      sql`(${schema.users.roles} && array['direction','gestionnaire']::text[])`));
    for (const u of equipe) {
      await envoyer({ etab }, {
        canal: "mail", destinataire: u.email, sujet: `Cap Veille : ${al.titre}`,
        corps: `Bonjour ${u.prenom},\n\nCap Veille, l'agent de veille réglementaire de Cap PFMP, signale un texte officiel :\n\n${al.titre}\n${al.source}\n\n${al.resume}\n\nLes changements proposés vous attendent dans Cap PFMP : rien ne s'applique sans votre décision.\n${base}/veille\n\nCap PFMP`,
      });
      n++;
    }
  }
  return n;
}

/** Les alertes publiées, avec ce que le lycée en a fait. */
export async function alertesDuLycee(ctx: Contexte) {
  return db.select({ a: schema.alertesVeille, s: schema.suitesVeille }).from(schema.alertesVeille)
    .leftJoin(schema.suitesVeille, and(eq(schema.suitesVeille.alerteId, schema.alertesVeille.id), eq(schema.suitesVeille.etablissementId, ctx.etab.id)))
    .where(isNotNull(schema.alertesVeille.publieeLe))
    .orderBy(desc(schema.alertesVeille.publieeLe)).limit(50);
}

/** Le nombre d'alertes publiées que le lycée n'a pas encore lues. */
export async function alertesNonLues(ctx: Contexte) {
  return (await alertesDuLycee(ctx)).filter((x) => !x.s?.lueLe).length;
}
