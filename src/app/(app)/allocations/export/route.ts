import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { classesGerees } from "@/lib/acces";
import { LIBELLES_PIECES, piecesAllocation, stagesAllocation, type StageAllocation, type TypePiece } from "@/lib/allocations";
import { versCsv } from "@/lib/csv";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { journaliser } from "@/lib/journal";

/** 2026-10-26 → 26/10/2026, que le tableur reconnaît comme une date. */
const enClair = (iso: string) => iso.split("-").reverse().join("/");

function etatPiece(d: typeof schema.documents.$inferSelect | undefined) {
  if (!d) return "manquant";
  return d.statut === "valide" ? "vérifié" : d.statut === "refuse" ? "refusé" : "à vérifier";
}

function etatAttestation(s: StageAllocation) {
  if (s.attestation?.statut === "valide") return "reçue";
  if (s.attestation?.statut === "a_verifier") return "à vérifier";
  return s.termine ? "attendue" : "à la fin du stage";
}

/**
 * Export pour un tableur (Excel, LibreOffice) : une ligne par élève, stage et semaine,
 * avec les jours effectués (absences déduites) et l'état des pièces du dossier d'allocation.
 */
export async function GET(req: Request) {
  const ctx = await contexte();
  const gerees = await classesGerees(ctx);
  if (!gerees.length) return new Response("Accès refusé", { status: 403 });
  const demande = new URL(req.url).searchParams.get("classe");
  const classes = demande && gerees.includes(demande) ? [demande] : gerees;
  const eleves = await db.select({ e: schema.eleves, classe: schema.classes.libelle }).from(schema.eleves)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, classes), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.classes.libelle), asc(schema.eleves.nom), asc(schema.eleves.prenom));
  const ids = eleves.map((x) => x.e.id);
  const pieces = await piecesAllocation(ids);
  const stages = await stagesAllocation(ctx, ids);
  const lignes: (string | number)[][] = [[
    "Classe", "Nom", "Prénom", "Période", "Entreprise", "Semaine du", "au",
    "Jours prévus", "Jours d'absence", "Jours effectués", "Jours à venir",
    LIBELLES_PIECES.rib, LIBELLES_PIECES.piece_identite, "Attestation de stage",
  ]];
  for (const { e, classe } of eleves) {
    const p = pieces.get(e.id);
    const etatPieces = (["rib", "piece_identite"] as TypePiece[]).map((t) => etatPiece(p?.[t]));
    const st = stages.get(e.id) ?? [];
    if (!st.length) lignes.push([classe, e.nom, e.prenom, "Aucun stage", "", "", "", "", "", "", "", ...etatPieces, ""]);
    for (const s of st) {
      for (const w of s.bilan.semaines) {
        lignes.push([classe, e.nom, e.prenom, s.periode, s.entreprise, enClair(w.lundi), enClair(ajouterJours(w.lundi, 6)), w.prevus, w.absences, w.effectues, w.aVenir, ...etatPieces, etatAttestation(s)]);
      }
    }
  }
  await journaliser(ctx, "allocations_exportees", "etablissement", ctx.etab.id, { eleves: ids.length });
  return new Response(versCsv(lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="allocations-${aujourdhui()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
