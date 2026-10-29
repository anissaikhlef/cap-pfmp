/**
 * Le fichier Excel de l'académie pour l'attestation récapitulative des PFMP, pour le lycée de démonstration : le modèle
 * vierge de l'académie de Versailles (session 2026), transmis par Anissa (fichier non confidentiel, sans aucune donnée d'élève).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { ecrireOctets } from "../src/lib/stockage-brut";
import { ouvrirClasseur, reperer } from "../src/lib/xlsx-modele";

export const FICHIER_ACADEMIE = path.join(__dirname, "modeles", "attestation-recapitulative-academie.xlsx");

/** Dépose le fichier de l'académie pour ce lycée, comme le ferait le DDFPT. */
export async function installerModeleAcademie(db: NodePgDatabase<typeof schema>, etablissementId: string) {
  const b = readFileSync(FICHIER_ACADEMIE);
  const cle = `${etablissementId}/${randomUUID()}.xlsx`;
  await ecrireOctets(db, cle, b);
  await db.insert(schema.modelesRecapitulatifs).values({
    etablissementId, cle, nom: "Attestation_de_PFMP_academie_2026.xlsx", structure: reperer(ouvrirClasseur(b)),
  }).onConflictDoNothing();
}
