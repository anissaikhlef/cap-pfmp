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
import { chargerConvention, qualitesSignature } from "@/lib/convention";
import { enregistrerSignature } from "@/lib/signature";
import { inviterASigner } from "@/lib/invitations";
import { adresseDuSite } from "@/lib/liens";
import { SIGNATAIRES, libelleSignataire } from "@/lib/regles";
import type { Etat } from "@/components/Formulaire";
import { revenirAvec } from "@/lib/retour";
import type { Signataire, Signatures, TypeDocument } from "@/db/schema";

function rafraichir(eleveId: string) {
  for (const p of [`/eleves/${eleveId}`, "/documents", "/mon-stage", "/mon-enfant", "/stagiaires", "/a-signer", "/"]) revalidatePath(p);
}

/* -------------------------- Signature en ligne -------------------------- */

const QUALITES = ["eleve", "parent", "entreprise", "tuteur", "professeur", "direction"] as const;

export async function signer(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const qualite = z.enum(QUALITES).parse(fd.get("qualite")) as Signataire;
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return { erreur: "Convention introuvable." };
  const possibles = await qualitesSignature(ctx, cv);
  if (!possibles.includes(qualite)) return { erreur: "Vous ne pouvez pas signer en cette qualité." };
  const erreur = await enregistrerSignature(ctx.etab, cv, qualite, fd, { par: ctx.user.id, userId: ctx.user.id }, await adresseDuSite());
  if (erreur) return { erreur };
  await journaliser(ctx, "convention_signee", "stage", stageId, { qualite, modele: String(fd.get("modele") ?? "simple") });
  rafraichir(cv.e.id);
  revenirAvec(fd, `Signature enregistrée (${libelleSignataire(qualite).toLowerCase()}).`);
}

/** Envoie la convention à tous ceux qui n'ont pas encore signé : invitation dans leur espace, ou lien personnel. */
export async function envoyerPourSignature(fd: FormData) {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const cv = await chargerConvention(ctx, stageId);
  if (!cv || !(await peutGererEleve(ctx, cv.e))) return;
  if (ctx.etab.reglages.signature === "papier") revenirAvec(fd, "Votre lycée signe les conventions sur papier.", "err");
  // Le dernier signataire est prévenu quand tous les autres ont signé ; la direction signe depuis « À signer ».
  const attendus = cv.requis.filter((k) => !cv.s.signatures[k] && k !== ctx.etab.reglages.dernierSignataire && k !== "direction");
  const r = await inviterASigner(ctx, cv, attendus, await adresseDuSite());
  await journaliser(ctx, "convention_envoyee", "stage", stageId, r);
  rafraichir(cv.e.id);
  const manque = r.sansContact.length ? ` Aucune adresse ni aucun numéro pour : ${r.sansContact.map((k) => libelleSignataire(k).toLowerCase()).join(", ")}.` : "";
  revenirAvec(fd, r.messages
    ? `Convention envoyée : ${r.messages} message(s), dont ${r.liens} lien(s) personnel(s) pour signer sans compte.${manque}`
    : `Aucun message envoyé.${manque}`, r.messages ? "ok" : "err");
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
  const cible = z.enum([...QUALITES, "attestation", "livret"]).parse(fd.get("cible"));
  const cv = await chargerConvention(ctx, stageId);
  if (!cv || !(await peutGererEleve(ctx, cv.e))) return;
  if (cible !== "attestation" && cible !== "livret") {
    // Signataire de la convention : invitation dans son espace, ou lien personnel s'il n'a pas de compte.
    const r = await inviterASigner(ctx, cv, [cible], await adresseDuSite(), true);
    await journaliser(ctx, "relance", "stage", stageId, { cible, n: r.messages });
    rafraichir(cv.e.id);
    revenirAvec(fd, r.messages ? `Relance envoyée (${libelleSignataire(cible).toLowerCase()}).` : `Aucune adresse ni aucun numéro pour : ${libelleSignataire(cible).toLowerCase()}.`, r.messages ? "ok" : "err");
  }
  const objet = cible === "attestation" ? "l'attestation de stage" : "le livret de compétences";
  const email = cv.ent.email;
  if (email) {
    await envoyer(ctx, {
      canal: "mail", destinataire: email, sujet: `Rappel : ${objet} de ${cv.e.prenom} ${cv.e.nom}`, eleveId: cv.e.id, entrepriseId: cv.ent.id,
      corps: `Bonjour ${cv.s.tuteur?.nom ?? cv.ent.tuteurNom ?? "Madame, Monsieur"},\n\nNous attendons encore ${objet} de ${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle}). Vous pouvez le déposer directement sur Cap PFMP.\n\nMerci,\n${ctx.etab.nom}`,
    });
  }
  await journaliser(ctx, "relance", "stage", stageId, { cible, n: email ? 1 : 0 });
  rafraichir(cv.e.id);
  revenirAvec(fd, email ? "Relance envoyée à l'entreprise." : "L'entreprise n'a pas d'adresse e-mail : complétez sa fiche.", email ? "ok" : "err");
}
