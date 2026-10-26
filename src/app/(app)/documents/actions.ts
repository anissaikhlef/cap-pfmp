"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutGererEleve } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { enregistrerFichier } from "@/lib/stockage";
import { envoyer } from "@/lib/messages";
import { blocageDirection, chargerConvention, qualitesSignature } from "@/lib/convention";
import { SIGNATAIRES } from "@/lib/regles";
import type { Etat } from "@/components/Formulaire";
import { revenirAvec } from "@/lib/retour";
import type { Signataire, Signatures, TypeDocument } from "@/db/schema";

function rafraichir(eleveId: string) {
  for (const p of [`/eleves/${eleveId}`, "/documents", "/mon-stage", "/mon-enfant", "/stagiaires", "/a-signer", "/"]) revalidatePath(p);
}

/* -------------------------- Signature en ligne -------------------------- */

export async function signer(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const qualite = z.enum(["eleve", "parent", "professeur", "entreprise", "direction"]).parse(fd.get("qualite")) as Signataire;
  if (fd.get("lu") !== "on") return { erreur: "Cochez la case pour confirmer que vous avez lu la convention." };
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return { erreur: "Convention introuvable." };
  const possibles = await qualitesSignature(ctx, cv);
  if (!possibles.includes(qualite)) return { erreur: "Vous ne pouvez pas signer en cette qualité." };
  if (qualite === "direction") {
    const b = blocageDirection(cv);
    if (b) return { erreur: b };
  }
  // Mise à jour atomique : on ajoute la signature sans écraser celles posées entre-temps.
  await db.update(schema.stages).set({
    signatures: sql`${schema.stages.signatures} || jsonb_build_object(${qualite}::text, jsonb_build_object('le', ${new Date().toISOString()}::text, 'par', ${ctx.user.id}::text, 'mode', 'enligne'))`,
  }).where(eq(schema.stages.id, stageId));
  await journaliser(ctx, "convention_signee", "stage", stageId, { qualite });
  rafraichir(cv.e.id);
  revenirAvec(fd, `Signature enregistrée (${SIGNATAIRES.find((s) => s.cle === qualite)!.libelle.toLowerCase()}).`);
}

/* ------------------------------ Dépôts ------------------------------ */

const TYPES_DEPOT: Record<string, TypeDocument> = { convention: "convention", attestation: "attestation", livret: "livret", autre: "autre" };

/** Qui peut déposer quoi : l'élève et sa famille la convention ; l'entreprise l'attestation et le livret ; le gestionnaire tout. */
async function peutDeposer(ctx: Awaited<ReturnType<typeof contexte>>, cv: NonNullable<Awaited<ReturnType<typeof chargerConvention>>>, type: TypeDocument) {
  if (await peutGererEleve(ctx, cv.e)) return true;
  if (type === "convention") {
    if (ctx.etab.reglages.signature === "enligne") return false;
    if (cv.e.userId === ctx.user.id) return true;
    if (a(ctx, "parent")) {
      const [r] = await db.select().from(schema.responsables).where(and(eq(schema.responsables.eleveId, cv.e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
      return !!r;
    }
  }
  if ((type === "attestation" || type === "livret") && a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId) return true;
  return false;
}

export async function deposer(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const type = TYPES_DEPOT[String(fd.get("type"))];
  if (!type) return { erreur: "Type de document inconnu." };
  const cv = await chargerConvention(ctx, stageId);
  if (!cv || !(await peutDeposer(ctx, cv, type))) return { erreur: "Vous ne pouvez pas déposer ce document." };
  const f = fd.get("fichier");
  if (!(f instanceof File)) return { erreur: "Choisissez un fichier." };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  const gestion = await peutGererEleve(ctx, cv.e);
  // Un nouveau dépôt remplace celui qui attendait encore d'être vérifié.
  await db.delete(schema.documents).where(and(eq(schema.documents.stageId, stageId), eq(schema.documents.type, type), eq(schema.documents.statut, "a_verifier")));
  const [doc] = await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: cv.e.id, stageId, anneeScolaire: cv.c.anneeScolaire, classeLibelle: cv.c.libelle, type,
    nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille, deposeParId: ctx.user.id,
    // Déposé par le gestionnaire lui-même : validé d'office.
    statut: gestion ? "valide" : "a_verifier", valideParId: gestion ? ctx.user.id : null, valideLe: gestion ? new Date() : null,
  }).returning();
  if (gestion) await appliquerValidation(doc, ctx.user.id);
  await journaliser(ctx, "document_depose", "document", doc.id, { type });
  rafraichir(cv.e.id);
  revenirAvec(fd, gestion ? "Document déposé et validé." : "Document déposé. Il sera vérifié par la personne qui gère les stages.");
}

/** Effets d'un document validé : une convention papier validée vaut signature de toutes les parties. */
async function appliquerValidation(doc: typeof schema.documents.$inferSelect, userId: string) {
  if (doc.type !== "convention" || !doc.stageId) return;
  const [s] = await db.select().from(schema.stages).where(eq(schema.stages.id, doc.stageId)).limit(1);
  if (!s) return;
  const le = new Date().toISOString();
  const sigs: Signatures = { ...s.signatures };
  for (const k of SIGNATAIRES.map((x) => x.cle)) sigs[k] ??= { le, par: userId, mode: "papier" };
  await db.update(schema.stages).set({ signatures: sigs }).where(eq(schema.stages.id, s.id));
}

async function documentGere(ctx: Awaited<ReturnType<typeof contexte>>, id: string) {
  const [d] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, id), eq(schema.documents.etablissementId, ctx.etab.id))).limit(1);
  if (!d) return null;
  const [e] = await db.select().from(schema.eleves).where(eq(schema.eleves.id, d.eleveId)).limit(1);
  if (!e || !(await peutGererEleve(ctx, e))) return null;
  return { d, e };
}

export async function valider(fd: FormData) {
  const ctx = await contexte();
  const x = await documentGere(ctx, z.string().uuid().parse(fd.get("id")));
  if (!x || x.d.statut !== "a_verifier") return;
  await db.update(schema.documents).set({ statut: "valide", valideParId: ctx.user.id, valideLe: new Date(), motifRefus: null }).where(eq(schema.documents.id, x.d.id));
  await appliquerValidation(x.d, ctx.user.id);
  await journaliser(ctx, "document_valide", "document", x.d.id);
  rafraichir(x.e.id);
}

export async function refuser(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const x = await documentGere(ctx, z.string().uuid().parse(fd.get("id")));
  if (!x || x.d.statut !== "a_verifier") return { erreur: "Document introuvable." };
  const motif = String(fd.get("motif") ?? "").trim().slice(0, 300);
  if (motif.length < 3) return { erreur: "Indiquez le motif du refus : il sera transmis à la personne qui a déposé le document." };
  await db.update(schema.documents).set({ statut: "refuse", motifRefus: motif, valideParId: ctx.user.id, valideLe: new Date() }).where(eq(schema.documents.id, x.d.id));
  if (x.d.deposeParId) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, x.d.deposeParId)).limit(1);
    if (u) await envoyer(ctx, {
      canal: "mail", destinataire: u.email, sujet: "Document à déposer de nouveau", eleveId: x.e.id,
      corps: `Bonjour ${u.prenom},\n\nLe document « ${x.d.nomFichier} » concernant ${x.e.prenom} ${x.e.nom} n'a pas pu être accepté : ${motif}.\nMerci d'en déposer une nouvelle version sur Cap PFMP.\n\n${ctx.etab.nom}`,
    });
  }
  await journaliser(ctx, "document_refuse", "document", x.d.id, { motif });
  rafraichir(x.e.id);
  revenirAvec(fd, "Document refusé. La personne qui l'a déposé est prévenue.");
}

/* ------------------------------ Relances ------------------------------ */

export async function relancer(fd: FormData) {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const cible = z.enum(["eleve", "parent", "professeur", "entreprise", "direction", "attestation", "livret"]).parse(fd.get("cible"));
  const cv = await chargerConvention(ctx, stageId);
  if (!cv || !(await peutGererEleve(ctx, cv.e))) return;
  const destinataires: { email: string; prenom: string }[] = [];
  const parId = async (id: string | null) => (id ? (await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1))[0] : undefined);
  if (cible === "eleve") { const u = await parId(cv.e.userId); if (u) destinataires.push(u); else if (cv.e.email) destinataires.push({ email: cv.e.email, prenom: cv.e.prenom }); }
  if (cible === "parent") {
    const rs = await db.select({ u: schema.users }).from(schema.responsables).innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId)).where(eq(schema.responsables.eleveId, cv.e.id));
    destinataires.push(...rs.map((r) => r.u));
  }
  if (cible === "professeur") { const u = await parId(cv.referentId); if (u) destinataires.push(u); }
  if (cible === "direction") {
    const ds = await db.select().from(schema.users).where(eq(schema.users.etablissementId, ctx.etab.id));
    destinataires.push(...ds.filter((u) => u.roles.includes("direction") && u.actif));
  }
  if (cible === "entreprise" || cible === "attestation" || cible === "livret") {
    if (cv.ent.email) destinataires.push({ email: cv.ent.email, prenom: cv.ent.tuteurNom ?? "Madame, Monsieur" });
  }
  const objet = cible === "attestation" ? "l'attestation de stage" : cible === "livret" ? "le livret de compétences" : "la convention de stage";
  for (const d of destinataires) {
    await envoyer(ctx, {
      canal: "mail", destinataire: d.email, sujet: `Rappel : ${objet} de ${cv.e.prenom} ${cv.e.nom}`, eleveId: cv.e.id, entrepriseId: cv.ent.id,
      corps: `Bonjour ${d.prenom},\n\nNous attendons encore ${cible === "attestation" || cible === "livret" ? "" : "votre signature sur "}${objet} de ${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle}). Vous pouvez ${cible === "attestation" || cible === "livret" ? "le déposer" : "la signer ou la déposer"} directement sur Cap PFMP.\n\nMerci,\n${ctx.etab.nom}`,
    });
  }
  await journaliser(ctx, "relance", "stage", stageId, { cible, n: destinataires.length });
  rafraichir(cv.e.id);
}
