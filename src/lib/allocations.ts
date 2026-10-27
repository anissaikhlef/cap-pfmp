import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, peutGererEleve } from "./acces";
import { ageAu, aujourdhui } from "./dates";
import { joursEffectues, type BilanJours, type PieceAllocation } from "./regles";

export { dossierAllocationComplet as dossierComplet, piecesAVerifier, piecesManquantes } from "./regles";

export const LIBELLES_PIECES: Record<PieceAllocation, string> = { rib: "RIB", piece_identite: "Pièce d'identité" };
export type TypePiece = PieceAllocation;
type Document = typeof schema.documents.$inferSelect;
export type Pieces = Partial<Record<TypePiece, Document>>;

/**
 * Pièces de l'allocation de chaque élève (RIB, pièce d'identité), gardées pour toute la scolarité :
 * la plus récente de chaque type, quelle que soit l'année.
 */
export async function piecesAllocation(eleveIds: string[]) {
  const res = new Map<string, Pieces>();
  if (!eleveIds.length) return res;
  const docs = await db.select().from(schema.documents)
    .where(and(inArray(schema.documents.eleveId, eleveIds), inArray(schema.documents.type, ["rib", "piece_identite"])))
    .orderBy(desc(schema.documents.deposeLe));
  for (const d of docs) {
    const x = res.get(d.eleveId) ?? {};
    const t = d.type as TypePiece;
    if (!x[t]) x[t] = d;
    res.set(d.eleveId, x);
  }
  return res;
}

export type StageAllocation = {
  stageId: string; periode: string; debut: string; fin: string; entreprise: string; classe: string;
  bilan: BilanJours; attestation: Document | null; termine: boolean;
};

/** Stages de l'année des élèves donnés, avec les jours effectués (absences déduites) et l'attestation. */
export async function stagesAllocation(ctx: Contexte, eleveIds: string[]): Promise<Map<string, StageAllocation[]>> {
  const res = new Map<string, StageAllocation[]>();
  if (!eleveIds.length) return res;
  const jour = aujourdhui();
  const rows = await db.select({ s: schema.stages, p: schema.periodes, c: schema.classes, ent: schema.entreprises }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(inArray(schema.stages.eleveId, eleveIds), eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(asc(schema.periodes.debut));
  if (!rows.length) return res;
  const ids = rows.map((r) => r.s.id);
  const absences = await db.select().from(schema.absences).where(inArray(schema.absences.stageId, ids));
  const attestations = await db.select().from(schema.documents)
    .where(and(inArray(schema.documents.stageId, ids), eq(schema.documents.type, "attestation"))).orderBy(desc(schema.documents.deposeLe));
  for (const r of rows) {
    const liste = res.get(r.s.eleveId) ?? [];
    const att = attestations.filter((d) => d.stageId === r.s.id);
    liste.push({
      stageId: r.s.id, periode: r.p.libelle, debut: r.p.debut, fin: r.p.fin, entreprise: r.ent.nom, classe: r.c.libelle,
      bilan: joursEffectues(r.s.horaires, r.p.debut, r.p.fin, absences.filter((x) => x.stageId === r.s.id), jour),
      attestation: att.find((d) => d.statut === "valide") ?? att[0] ?? null,
      termine: r.p.fin < jour,
    });
    res.set(r.s.eleveId, liste);
  }
  return res;
}

/**
 * Qui dépose les pièces de l'allocation : la famille (le responsable légal, ou l'élève majeur lui-même),
 * ou la gestion des PFMP. Les familles ne voient que leur propre dépôt.
 */
export async function droitsPieces(ctx: Contexte, e: typeof schema.eleves.$inferSelect): Promise<"famille" | "gestion" | null> {
  if (e.etablissementId !== ctx.etab.id) return null;
  if (await peutGererEleve(ctx, e)) return "gestion";
  if (a(ctx, "parent")) {
    const [r] = await db.select().from(schema.responsables)
      .where(and(eq(schema.responsables.eleveId, e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
    if (r) return "famille";
  }
  if (e.userId === ctx.user.id && (ageAu(e.dateNaissance, aujourdhui()) ?? 0) >= 18) return "famille";
  return null;
}
