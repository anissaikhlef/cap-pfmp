import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { aujourdhui, ecartJours } from "./dates";
import { campagneDe } from "./campagne";
import { notePartenariat, type FaitsPartenariat } from "./regles";

/** Délai laissé à l'entreprise pour rendre l'attestation et le livret avant qu'ils ne comptent dans sa note. */
const DELAI_DOCUMENTS_JOURS = 14;

/**
 * Faits et note de partenariat de chaque entreprise du lycée (décision d'Anissa : « classer et identifier les entreprises
 * qui jouent le jeu »). Tout vient de ce que l'application sait déjà : stages, campagne, signatures, documents,
 * comptes rendus de visite et soucis signalés. Visible seulement par l'équipe du lycée.
 */
export async function partenariats(ctx: Contexte) {
  const jour = aujourdhui();
  const ents = await db.select({ id: schema.entreprises.id }).from(schema.entreprises).where(eq(schema.entreprises.etablissementId, ctx.etab.id));
  const faits = new Map<string, FaitsPartenariat>(ents.map((e) => [e.id, {
    annees: 0, campagneRepondue: null, conventionsATemps: 0, conventionsTotal: 0, documentsRendus: 0, documentsAttendus: 0, avisVisites: [], soucis: 0,
  }]));
  const stages = await db.select({ s: schema.stages, p: schema.periodes, annee: schema.classes.anneeScolaire }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(eq(schema.classes.etablissementId, ctx.etab.id));
  const ids = stages.map((x) => x.s.id);
  const docs = ids.length ? await db.select({ stageId: schema.documents.stageId, type: schema.documents.type }).from(schema.documents)
    .where(and(inArray(schema.documents.stageId, ids), inArray(schema.documents.type, ["attestation", "livret"]), sql`${schema.documents.statut} in ('valide', 'a_verifier')`)) : [];
  const visites = ids.length ? await db.select({ stageId: schema.visites.stageId, cr: schema.visites.compteRendu }).from(schema.visites).where(inArray(schema.visites.stageId, ids)) : [];
  const annees = new Map<string, Set<string>>();
  for (const { s, p, annee } of stages) {
    const f = faits.get(s.entrepriseId);
    if (!f) continue;
    if (p.debut <= jour) annees.set(s.entrepriseId, (annees.get(s.entrepriseId) ?? new Set()).add(annee));
    // Convention : signée par l'entreprise avant le premier jour du stage
    if (p.debut <= jour) {
      f.conventionsTotal++;
      const sig = s.signatures.entreprise;
      if (sig && sig.le.slice(0, 10) <= p.debut) f.conventionsATemps++;
    }
    // Attestation et livret : l'entreprise a deux semaines après la fin du stage ; avant, seuls les documents déjà rendus comptent.
    if (p.fin < jour) {
      const rendus = new Set(docs.filter((d) => d.stageId === s.id).map((d) => d.type)).size;
      f.documentsAttendus += ecartJours(p.fin, jour) > DELAI_DOCUMENTS_JOURS ? 2 : rendus;
      f.documentsRendus += rendus;
    }
    // Avis sur l'accueil, à chaque visite du stage (les comptes rendus rédigés avant ce critère n'en ont pas)
    for (const v of visites.filter((x) => x.stageId === s.id)) if (v.cr?.criteres?.accueil) f.avisVisites.push(v.cr.criteres.accueil);
  }
  for (const [id, a] of annees) faits.get(id)!.annees = a.size;
  const c = await campagneDe(ctx.etab);
  if (c) {
    const reps = await db.select().from(schema.campagneReponses).where(eq(schema.campagneReponses.campagneId, c.id));
    for (const r of reps) { const f = faits.get(r.entrepriseId); if (f) f.campagneRepondue = !!r.reponduLe; }
  }
  const soucis = await db.select({ id: schema.soucisEntreprises.entrepriseId, n: sql<number>`count(*)::int` }).from(schema.soucisEntreprises)
    .where(eq(schema.soucisEntreprises.etablissementId, ctx.etab.id)).groupBy(schema.soucisEntreprises.entrepriseId);
  for (const x of soucis) { const f = faits.get(x.id); if (f) f.soucis = x.n; }
  return new Map([...faits].map(([id, f]) => [id, { faits: f, ...notePartenariat(f) }]));
}
