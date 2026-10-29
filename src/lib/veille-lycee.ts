import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { TypeModele } from "@/db/schema";
import type { Contexte } from "./auth";
import { demanderIA } from "./ia";
import { grilleEtQuestions, modeleDuLycee, utiliseLePdf } from "./modeles-documents";
import { modeleRecapitulatif } from "./recapitulatif";
import { lireFichier } from "./stockage";
import { texteDuPdf } from "./texte-pdf";
import { ouvrirClasseur } from "./xlsx-modele";

/**
 * Cap Veille dans chaque lycée (décisions d'Anissa) : comparer un nouveau texte avec tous les documents du lycée dans
 * Cap PFMP, appliquer un changement en un clic (le DDFPT propose, la direction valide), et le calendrier des échéances.
 */
type Alerte = typeof schema.alertesVeille.$inferSelect;

/** Une alerte que ce lycée peut voir : générale, de son académie, ou d'une page qu'il suit. */
export function alerteVisible(ctx: Contexte, a: Alerte): boolean {
  return !!a.publieeLe && (!a.etablissementId || a.etablissementId === ctx.etab.id)
    && (!a.academie || a.academie === ctx.etab.reglages.academie.toUpperCase());
}

const NOMS_DOCUMENTS: Record<TypeModele, string> = { convention: "Convention de stage", ordre_mission: "Ordre de mission", attestation: "Attestation de stage", livret: "Livret de compétences" };

/** Le texte de chaque document du lycée dans Cap PFMP (modèle adapté, ou PDF du lycée lu sur le serveur). */
async function documentsDuLycee(ctx: Contexte): Promise<{ document: string; texte: string }[]> {
  const docs: { document: string; texte: string }[] = [];
  for (const type of Object.keys(NOMS_DOCUMENTS) as TypeModele[]) {
    const m = await modeleDuLycee(ctx.etab.id, type);
    let texte = "";
    if (utiliseLePdf(m)) texte = (await texteDuPdf(new Uint8Array(await lireFichier(m.pdfCle)))) ?? `(PDF du lycée « ${m.pdfNom ?? ""} », sans texte lisible)`;
    else {
      const p = m.personnalisation;
      texte = [p.titre, p.introduction, p.engagements, ...(p.rubriques ?? []).map((r) => `${r.titre} : ${r.texte}`), p.piedDePage, ...(p.competences ?? []).map((c) => `${c.filiere} : ${c.liste.join(", ")}`)]
        .filter(Boolean).join("\n") || "(modèle de Cap PFMP, sans adaptation par le lycée)";
    }
    docs.push({ document: NOMS_DOCUMENTS[type], texte: texte.slice(0, 12000) });
  }
  const { questions, grille } = await grilleEtQuestions(ctx.etab.id);
  docs.push({ document: "Compte rendu de visite", texte: `Questions de l'appel au tuteur : ${questions.join(" ; ")}\nGrille des attitudes : ${grille.map((g) => `${g.critere} (${g.niveaux.join(" / ")})`).join(" ; ")}` });
  const recap = await modeleRecapitulatif(ctx.etab.id);
  if (recap) {
    try {
      const c = ouvrirClasseur(await lireFichier(recap.cle));
      const f = c.feuilles.find((x) => x.nom === recap.structure.feuillesEleves[0]) ?? c.feuilles[0];
      docs.push({ document: "Fichier de l'académie (attestation récapitulative)", texte: [...f.cellules.values()].filter((x) => !x.formule && x.valeur).map((x) => x.valeur).join(" ; ").slice(0, 6000) });
    } catch { /* fichier illisible : pas de comparaison pour lui */ }
  }
  return docs;
}

const Ecarts = z.object({ ecarts: z.array(z.object({ document: z.string().trim().max(120), ecart: z.string().trim().min(5).max(800) })).max(20) });

/** Compare le texte officiel avec tous les documents du lycée : ce qui ne correspond plus, document par document. */
export async function comparerDocuments(ctx: Contexte, a: Alerte): Promise<{ ok: true; n: number } | { ok: false; erreur: string }> {
  const docs = await documentsDuLycee(ctx);
  const r = await demanderIA(ctx.etab, {
    agent: "veille", objet: "Comparaison avec les documents du lycée", effort: "medium",
    consignes: "Tu compares un texte officiel sur les PFMP avec les documents d'un lycée professionnel. Pour chaque document qui ne correspond plus au texte (clause manquante, durée, mention, signature, montant…), écris l'écart en une ou deux phrases, et ce qu'il faudrait modifier. Ne signale que les écarts certains, d'après les seuls textes fournis ; si tout correspond, ne renvoie aucun écart.",
    demande: `Texte officiel : ${a.titre}\nRésumé : ${a.resume}\nPropositions : ${a.propositions.join(" ; ")}\n\nDocuments du lycée :\n${docs.map((d) => `=== ${d.document} ===\n${d.texte}`).join("\n\n")}`,
    schema: { type: "object", additionalProperties: false, required: ["ecarts"], properties: { ecarts: { type: "array", items: { type: "object", additionalProperties: false, required: ["document", "ecart"], properties: { document: { type: "string" }, ecart: { type: "string" } } } } } },
    verifier: (x) => Ecarts.safeParse(x).data ?? null,
    exemple: () => ({ ecarts: [{ document: "Convention de stage", ecart: "Exemple de démonstration : vérifiez que la convention reprend les mentions du texte officiel (durée, horaires, signatures)." }] }),
  });
  if (!r.ok) return r;
  const comparaison = { le: new Date().toISOString(), ecarts: r.valeur.ecarts, simule: r.simule };
  await db.insert(schema.suitesVeille).values({ alerteId: a.id, etablissementId: ctx.etab.id, lueLe: new Date(), comparaison, parId: ctx.user.id })
    .onConflictDoUpdate({ target: [schema.suitesVeille.alerteId, schema.suitesVeille.etablissementId], set: { comparaison } });
  return { ok: true, n: r.valeur.ecarts.length };
}

/** Le calendrier des échéances du lycée, les plus proches d'abord. */
export async function echeancesDuLycee(ctx: Contexte) {
  return db.select().from(schema.echeances).where(eq(schema.echeances.etablissementId, ctx.etab.id)).orderBy(asc(schema.echeances.date));
}

export const peutProposerChangement = (ctx: Contexte) => ctx.user.roles.includes("gestionnaire");
export const peutValiderChangement = (ctx: Contexte) => ctx.user.roles.includes("direction");

export async function suiteDe(ctx: Contexte, alerteId: string) {
  const [s] = await db.select().from(schema.suitesVeille).where(and(eq(schema.suitesVeille.alerteId, alerteId), eq(schema.suitesVeille.etablissementId, ctx.etab.id))).limit(1);
  return s ?? null;
}
