"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { droitsPieces, LIBELLES_PIECES, type TypePiece } from "@/lib/allocations";
import { enregistrerFichier } from "@/lib/stockage";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import type { Etat } from "@/components/Formulaire";

/**
 * Dépôt du RIB ou de la pièce d'identité de l'élève, pour l'allocation de stage.
 * Par la famille : à vérifier par la gestion des PFMP. Par la gestion elle-même (pièce reçue sur papier) : vérifié d'office.
 */
export async function deposerPieceAllocation(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const eleveId = z.string().uuid().parse(fd.get("eleveId"));
  const type = z.enum(["rib", "piece_identite"]).parse(fd.get("type")) as TypePiece;
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  const qui = e ? await droitsPieces(ctx, e) : null;
  if (!e || !qui) return { erreur: "Vous ne pouvez pas déposer ce document." };
  const f = fd.get("fichier");
  if (!(f instanceof File)) return { erreur: "Choisissez un fichier." };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  const [c] = e.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1) : [];
  const gestion = qui === "gestion";
  // Un nouveau dépôt remplace celui qui attendait encore d'être vérifié.
  await db.delete(schema.documents).where(and(eq(schema.documents.eleveId, e.id), eq(schema.documents.type, type), eq(schema.documents.statut, "a_verifier")));
  await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: e.id, stageId: null, anneeScolaire: c?.anneeScolaire ?? ctx.etab.anneeScolaire, classeLibelle: c?.libelle ?? "",
    type, nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille, deposeParId: ctx.user.id,
    statut: gestion ? "valide" : "a_verifier", valideParId: gestion ? ctx.user.id : null, valideLe: gestion ? new Date() : null,
  });
  await journaliser(ctx, "piece_allocation_deposee", "eleve", e.id, { type, par: qui });
  for (const p of ["/mon-enfant", "/mon-stage", `/eleves/${e.id}`, "/documents", "/allocations", "/"]) revalidatePath(p);
  // Accord au féminin pour « la pièce d'identité »
  const [fem, pronom] = type === "piece_identite" ? ["e", "la"] : ["", "le"];
  revenirAvec(fd, gestion ? `${LIBELLES_PIECES[type]} enregistré${fem} et vérifié${fem}.` : `${LIBELLES_PIECES[type]} déposé${fem}. Le lycée va ${pronom} vérifier.`);
}
