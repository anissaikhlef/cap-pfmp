import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import type { Agent, Reglages } from "@/db/schema";
import { AGENTS, aLAgent, sousLePlafond } from "./agents";
import { reglagesPlateforme, usageDuMois } from "./plateforme";

/**
 * Le moteur des agents IA de Cap PFMP. Les agents portent la marque Cap PFMP (décision d'Anissa) : le fournisseur
 * n'apparaît nulle part dans l'application. Aucun nom d'élève n'est envoyé (src/lib/anonymisation.ts).
 *
 * Sans clé configurée (ANTHROPIC_API_KEY), et toujours dans un lycée d'entraînement, l'agent répond par un texte
 * d'exemple, préparé par l'application, sans appel à l'IA : la démonstration fonctionne sans frais.
 */
const MODELE = process.env.CAP_PFMP_MODELE_IA || "claude-opus-5-5";

type EtabIA = { id: string; entrainementDeId: string | null; reglages: Pick<Reglages, "agents"> };

export type DemandeIA<T> = {
  agent: Agent;
  /** Ce que l'agent fait (journal d'usage, sans aucun texte). */
  objet: string;
  /** Consignes de l'agent : son rôle, le ton, ce qu'il ne doit pas faire. */
  consignes: string;
  /** La demande elle-même, sans aucun nom d'élève. */
  demande: string;
  /** Le schéma JSON de la réponse attendue. */
  schema: Record<string, unknown>;
  /** Vérifie la réponse (null si elle ne convient pas). */
  verifier: (x: unknown) => T | null;
  /** Le texte d'exemple, sans IA. */
  exemple: () => T;
  /** Effort de réflexion : « low » pour les mails courants, « medium » pour une analyse. */
  effort?: "low" | "medium" | "high";
};
export type ReponseIA<T> = { ok: true; valeur: T; simule: boolean } | { ok: false; erreur: string };

export const iaBranchee = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;

/** Pose une question à un agent pour un lycée (null : l'administration de Cap PFMP, pour la veille réglementaire). */
export async function demanderIA<T>(etab: EtabIA | null, d: DemandeIA<T>): Promise<ReponseIA<T>> {
  const nom = AGENTS[d.agent].nom;
  if (etab && !aLAgent(etab.reglages, d.agent)) return { ok: false, erreur: `${nom} ne fait pas partie des agents choisis par votre lycée (« Organisation », « Agents IA »).` };
  // Lycée d'entraînement : rien n'en sort, rien n'est compté.
  if (etab?.entrainementDeId) return { ok: true, valeur: d.exemple(), simule: true };
  const { plafonds } = await reglagesPlateforme();
  const utilisees = (await usageDuMois(etab?.id ?? null))[d.agent];
  if (etab && !sousLePlafond(plafonds, d.agent, utilisees)) {
    return { ok: false, erreur: `${nom} a atteint le nombre de demandes prévu pour ce mois (${plafonds[d.agent]}). Il reprend le 1er du mois prochain.` };
  }
  const noter = (simule: boolean, entree = 0, sortie = 0) => db.insert(schema.usageIa).values({
    etablissementId: etab?.id ?? null, agent: d.agent, objet: d.objet, simule, tokensEntree: entree, tokensSortie: sortie,
  });
  if (!iaBranchee()) {
    await noter(true);
    return { ok: true, valeur: d.exemple(), simule: true };
  }

  try {
    client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 });
    const r = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 8000,
      // Si le modèle décline une demande, l'API la reprend avec le modèle de secours recommandé.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: d.effort ?? "low", format: { type: "json_schema", schema: d.schema } },
      system: `${d.consignes}\n\nTu travailles pour Cap PFMP, la plateforme de suivi des périodes de formation en milieu professionnel (PFMP) des lycées professionnels français. Tu t'appelles ${nom}. Tu écris en français, simplement, avec le vouvoiement (le tutoiement seulement pour un élève). Les noms des personnes sont remplacés par des repères entre crochets, comme [ÉLÈVE] : recopie ces repères tels quels, sans jamais inventer de nom, de date ni de chiffre absent de la demande.`,
      messages: [{ role: "user", content: d.demande }],
    });
    await noter(false, r.usage.input_tokens, r.usage.output_tokens);
    if (r.stop_reason === "refusal") return { ok: false, erreur: `${nom} n'a pas pu traiter cette demande. Reformulez-la ou écrivez le texte vous-même.` };
    if (r.stop_reason === "max_tokens") return { ok: false, erreur: `${nom} n'a pas pu terminer sa réponse. Réessayez avec une demande plus courte.` };
    const texte = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let brut: unknown;
    try { brut = JSON.parse(texte); } catch { brut = null; }
    const valeur = d.verifier(brut);
    if (!valeur) return { ok: false, erreur: `${nom} a donné une réponse incomplète. Réessayez.` };
    return { ok: true, valeur, simule: false };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, erreur: `${nom} est très sollicité en ce moment. Réessayez dans une minute.` };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, erreur: `${nom} n'est pas joignable : la clé d'accès de Cap PFMP est à vérifier.` };
    console.error("Agent IA :", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { ok: false, erreur: `${nom} n'est pas joignable pour le moment. Réessayez plus tard.` };
  }
}
