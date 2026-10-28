import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { PropositionEntreprise, RelectureCv } from "@/db/schema";
import type { Contexte } from "./auth";
import { demanderIA } from "./ia";
import { masquer, sansCoordonnees } from "./anonymisation";
import { partenariats } from "./partenariats";
import { classerLieux, motsCles, relectureCvExemple, type CandidatLieu } from "./regles";
import { demarchesDe, dossierStage, suggestions } from "./stages";

/**
 * Agent 3, au choix du lycée : Cap Partenaires. Il propose à un élève sans stage des lieux de stage (annuaire du lycée,
 * places déclarées à la campagne, annuaire public des entreprises) et relit son CV. L'IA ne reçoit ni le nom de l'élève
 * ni ses coordonnées.
 */
type Eleve = typeof schema.eleves.$inferSelect;

/** L'annuaire public des entreprises (recherche-entreprises.api.gouv.fr), gratuit et sans compte ; « non » le coupe. */
async function annuairePublic(mot: string, ville: string | null): Promise<CandidatLieu[]> {
  if (process.env.CAP_PFMP_ANNUAIRE_PUBLIC === "non" || !mot) return [];
  try {
    const q = new URLSearchParams({ q: [mot, ville].filter(Boolean).join(" "), etat_administratif: "A", per_page: "5" });
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${q}`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: { nom_complet?: string; siege?: { libelle_commune?: string } }[] };
    return (j.results ?? []).filter((x) => x.nom_complet).map((x) => ({
      id: null, nom: x.nom_complet!, domaine: null, ville: x.siege?.libelle_commune ?? null, restantes: null, accueilliAvant: false, fiable: false, source: "public" as const,
    }));
  } catch {
    return [];
  }
}

const SCHEMA_LIEUX = {
  type: "object", additionalProperties: false, required: ["raisons", "conseil"],
  properties: {
    raisons: { type: "array", items: { type: "object", additionalProperties: false, required: ["numero", "raison"], properties: { numero: { type: "integer" }, raison: { type: "string" } } } },
    conseil: { type: "string" },
  },
};
const Lieux = z.object({ raisons: z.array(z.object({ numero: z.number().int(), raison: z.string().trim().min(3).max(400) })), conseil: z.string().trim().min(3).max(800) });

/** Propose des lieux de stage à un élève et enregistre la proposition (la dernière s'affiche). */
export async function proposerLieux(ctx: Contexte, e: Eleve): Promise<{ ok: true; n: number } | { ok: false; erreur: string }> {
  const d = await dossierStage(ctx, e);
  if (!d.periode || !d.classe) return { ok: false, erreur: "Aucune période de stage à venir pour cet élève." };
  if (d.stage) return { ok: false, erreur: "Cet élève a déjà un lieu de stage pour sa période." };
  const [dominante] = e.dominanteId ? await db.select().from(schema.dominantes).where(eq(schema.dominantes.id, e.dominanteId)).limit(1) : [];
  const mots = motsCles(d.classe.filiere, dominante?.libelle);
  const notes = await partenariats(ctx);
  const annuaire: CandidatLieu[] = (await suggestions(ctx, d, e.id)).map((x) => {
    const n = notes.get(x.id);
    return { id: x.id, nom: x.nom, domaine: x.domaine, ville: x.ville, restantes: x.restantes, accueilliAvant: (n?.faits.annees ?? 0) > 0, fiable: !!n?.fiable, source: "annuaire" };
  });
  const publics = annuaire.length >= 5 ? [] : await annuairePublic(mots[0] ?? "", ctx.etab.ville);
  const dejaContactees = (await demarchesDe(e.id)).map((x) => ({ id: x.entrepriseId, nom: x.entrepriseNom }));
  const classes = classerLieux([...annuaire, ...publics], { mots, ville: ctx.etab.ville, dejaContactees });
  if (!classes.length) return { ok: false, erreur: "Cap Partenaires n'a trouvé aucune entreprise avec de la place : parlez-en avec le professeur référent." };

  const liste = classes.map((c, i) => `${i + 1}. ${c.nom}${c.domaine ? ` (${c.domaine})` : ""}${c.ville ? `, ${c.ville}` : ""} : ${c.raisons.join(" ; ")}`).join("\n");
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Lieux de stage pour un élève", effort: "low",
    consignes: "Tu aides un élève de lycée professionnel à trouver son lieu de stage. Pour chaque entreprise de la liste, écris une phrase qui dit à l'élève (en le tutoyant) pourquoi elle peut lui convenir et comment se présenter, d'après les seuls faits donnés. Termine par un conseil court pour sa recherche.",
    demande: `Élève de ${d.classe.libelle}${d.classe.filiere ? `, formation ${d.classe.filiere}` : ""}${dominante ? `, dominante ${dominante.libelle}` : ""}. Période de stage du ${d.periode.debut} au ${d.periode.fin}. Entreprises déjà contactées : ${dejaContactees.length}.\nEntreprises proposées :\n${liste}`,
    schema: SCHEMA_LIEUX, verifier: (x) => Lieux.safeParse(x).data ?? null,
    exemple: () => ({
      raisons: classes.map((c, i) => ({ numero: i + 1, raison: `${c.raisons.join(". ")}.` })),
      conseil: "Appelle ou passe voir chaque entreprise en te présentant avec ton CV : dis ta formation, les dates de ton stage et ce que tu aimerais apprendre. Note chaque démarche dans « Mes démarches ».",
    }),
  });
  if (!r.ok) return r;
  const entreprises: PropositionEntreprise[] = classes.map((c, i) => ({
    nom: c.nom, ville: c.ville, domaine: c.domaine, entrepriseId: c.id, source: c.source,
    raison: r.valeur.raisons.find((x) => x.numero === i + 1)?.raison ?? `${c.raisons.join(". ")}.`,
  }));
  await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "entreprises", contenu: { entreprises, conseil: r.valeur.conseil }, simule: r.simule, parId: ctx.user.id });
  return { ok: true, n: entreprises.length };
}

const SCHEMA_CV = {
  type: "object", additionalProperties: false, required: ["pointsForts", "aAmeliorer", "conseil"],
  properties: { pointsForts: { type: "array", items: { type: "string" } }, aAmeliorer: { type: "array", items: { type: "string" } }, conseil: { type: "string" } },
};
const Cv = z.object({ pointsForts: z.array(z.string().trim().min(2).max(400)).max(8), aAmeliorer: z.array(z.string().trim().min(2).max(400)).max(8), conseil: z.string().trim().min(2).max(800) });

/** Relit le CV d'un élève (le texte, sans les coordonnées ni le nom) et enregistre la relecture. */
export async function relireCv(ctx: Contexte, e: Eleve, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const propre = masquer(sansCoordonnees(texte), [
    { valeur: `${e.prenom} ${e.nom}`, jeton: "[ÉLÈVE]" }, { valeur: `${e.nom} ${e.prenom}`, jeton: "[ÉLÈVE]" },
    { valeur: e.prenom, jeton: "[ÉLÈVE]" }, { valeur: e.nom, jeton: "[ÉLÈVE]" },
  ]);
  const [c] = e.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1) : [];
  const r = await demanderIA(ctx.etab, {
    agent: "entreprises", objet: "Relecture d'un CV", effort: "medium",
    consignes: "Tu relis le CV d'un élève de lycée professionnel qui cherche un stage. Tutoie l'élève, sois encourageant et concret. Donne 2 à 4 points forts, 2 à 5 points à améliorer (rubriques manquantes, formulations, fautes d'orthographe en citant le mot à corriger), et un conseil. Ne réécris pas le CV. Les coordonnées et le nom ont été retirés volontairement ([téléphone], [adresse mail], [ÉLÈVE]) : ne les signale pas comme manquants s'ils sont remplacés par un repère.",
    demande: `CV d'un élève${c ? ` de ${c.libelle}${c.filiere ? ` (${c.filiere})` : ""}` : ""} :\n"""\n${propre}\n"""`,
    schema: SCHEMA_CV, verifier: (x) => Cv.safeParse(x).data ?? null,
    exemple: () => relectureCvExemple(propre),
  });
  if (!r.ok) return r;
  const cv: RelectureCv = r.valeur;
  await db.insert(schema.suggestionsIa).values({ etablissementId: ctx.etab.id, eleveId: e.id, type: "cv", contenu: { cv }, simule: r.simule, parId: ctx.user.id });
  return { ok: true };
}

/** Les dernières propositions de Cap Partenaires pour un élève (lieux de stage, relecture du CV). */
export async function dernieresSuggestions(etabId: string, eleveId: string) {
  const rows = await db.select().from(schema.suggestionsIa)
    .where(and(eq(schema.suggestionsIa.etablissementId, etabId), eq(schema.suggestionsIa.eleveId, eleveId)))
    .orderBy(desc(schema.suggestionsIa.createdAt)).limit(20);
  return { lieux: rows.find((x) => x.type === "entreprises") ?? null, cv: rows.find((x) => x.type === "cv") ?? null };
}
