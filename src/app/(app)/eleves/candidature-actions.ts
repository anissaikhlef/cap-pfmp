"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { suitLEleve } from "@/lib/acces";
import { candidaturesDe, LIBELLES_CANDIDATURE, type TypeCandidature } from "@/lib/candidatures";
import { entrepriseDuLycee, dossierStage } from "@/lib/stages";
import { enregistrerFichier } from "@/lib/stockage";
import { envoyer } from "@/lib/messages";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { aujourdhui, dateLongue } from "@/lib/dates";
import type { Etat } from "@/components/Formulaire";

type Ctx = Awaited<ReturnType<typeof contexte>>;
/** Nombre maximal de candidatures envoyées par un élève en une journée. */
const ENVOIS_PAR_JOUR = 20;

function rafraichir(eleveId: string) {
  for (const p of ["/mon-stage", `/eleves/${eleveId}`, "/eleves", "/mes-eleves", "/"]) revalidatePath(p);
}

async function eleveDuLycee(ctx: Ctx, eleveId: string) {
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  return e ?? null;
}

/** L'élève dépose son CV ou sa lettre (son référent ou la gestion peuvent aussi le faire pour lui). */
export async function deposerCandidature(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const e = await eleveDuLycee(ctx, z.string().uuid().parse(fd.get("eleveId")));
  const type = z.enum(["cv", "lettre"]).parse(fd.get("type")) as TypeCandidature;
  if (!e || (e.userId !== ctx.user.id && !(await suitLEleve(ctx, e)))) return { erreur: "Vous ne pouvez pas déposer ce document." };
  const f = fd.get("fichier");
  if (!(f instanceof File)) return { erreur: "Choisissez un fichier." };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  const [c] = e.classeId ? await db.select().from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1) : [];
  // Une nouvelle version remplace celle qui n'avait pas encore été relue.
  await db.delete(schema.documents).where(and(eq(schema.documents.eleveId, e.id), eq(schema.documents.type, type), eq(schema.documents.statut, "a_verifier")));
  await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: e.id, stageId: null, anneeScolaire: c?.anneeScolaire ?? ctx.etab.anneeScolaire, classeLibelle: c?.libelle ?? "",
    type, nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille, deposeParId: ctx.user.id, statut: "a_verifier",
  });
  await journaliser(ctx, "candidature_deposee", "eleve", e.id, { type });
  rafraichir(e.id);
  const [fem, pronom] = type === "lettre" ? ["e", "la"] : ["", "le"];
  revenirAvec(fd, e.userId === ctx.user.id
    ? `${LIBELLES_CANDIDATURE[type]} déposé${fem}. Votre professeur référent peut ${pronom} relire ; vous pouvez déjà l'envoyer.`
    : `${LIBELLES_CANDIDATURE[type]} déposé${fem} pour ${e.prenom}.`);
}

/** Le référent (ou la gestion) relit : « c'est bon » ou « à améliorer », avec un commentaire. L'élève est prévenu. */
export async function relireCandidature(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("documentId"));
  const avis = z.enum(["bon", "ameliorer"]).safeParse(fd.get("avis"));
  if (!avis.success) return { erreur: "Choisissez votre avis." };
  const commentaire = String(fd.get("commentaire") ?? "").trim().slice(0, 1000);
  if (avis.data === "ameliorer" && commentaire.length < 3) return { erreur: "Indiquez ce qui est à améliorer : l'élève recevra votre commentaire." };
  const [d] = await db.select().from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.etablissementId, ctx.etab.id), inArray(schema.documents.type, ["cv", "lettre"]))).limit(1);
  const e = d ? await eleveDuLycee(ctx, d.eleveId) : null;
  if (!d || !e || !(await suitLEleve(ctx, e))) return { erreur: "Document introuvable." };
  await db.update(schema.documents).set({
    statut: avis.data === "bon" ? "valide" : "refuse", motifRefus: commentaire || null, valideParId: ctx.user.id, valideLe: new Date(),
  }).where(eq(schema.documents.id, id));
  const libelle = LIBELLES_CANDIDATURE[d.type as TypeCandidature];
  const [compte] = e.userId ? await db.select().from(schema.users).where(eq(schema.users.id, e.userId)).limit(1) : [];
  const email = compte?.email ?? e.email;
  if (email) {
    await envoyer(ctx, {
      canal: "mail", destinataire: email, sujet: `Relecture de votre ${libelle.toLowerCase()}`, eleveId: e.id,
      corps: `Bonjour ${e.prenom},\n\n${ctx.user.prenom} ${ctx.user.nom} a relu votre ${libelle.toLowerCase()} : ${avis.data === "bon" ? "c'est bon." : "il y a des points à améliorer."}${commentaire ? `\n\n« ${commentaire} »` : ""}\n\nRetrouvez-${d.type === "lettre" ? "la" : "le"} dans Cap PFMP, rubrique « Mon stage ».\n\n${ctx.etab.nom}`,
    });
  }
  await journaliser(ctx, "candidature_relue", "eleve", e.id, { type: d.type, avis: avis.data });
  rafraichir(e.id);
  revenirAvec(fd, `Relecture enregistrée.${email ? " L'élève est prévenu par mail." : ""}`);
}

const Envoi = z.object({
  entrepriseId: z.union([z.string().uuid(), z.literal("")]).optional(),
  autreNom: z.string().trim().max(120).optional(),
  autreEmail: z.union([z.string().trim().toLowerCase().email("Adresse e-mail de l'entreprise invalide"), z.literal("")]).optional(),
  message: z.string().trim().min(20, "Écrivez quelques lignes à l'entreprise.").max(3000),
});

/**
 * L'élève envoie son CV et sa lettre à une entreprise, depuis l'application. La relecture est conseillée, pas obligatoire.
 * L'envoi est ajouté à ses démarches (relance au bout de 7 jours sans réponse).
 */
export async function envoyerCandidature(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["eleve"] });
  const e = await eleveDuLycee(ctx, z.string().uuid().parse(fd.get("eleveId")));
  if (!e || e.userId !== ctx.user.id) return { erreur: "Action non autorisée." };
  const p = Envoi.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  let entreprise: { id: string | null; nom: string; email: string } | null = null;
  if (p.data.entrepriseId) {
    const ent = await entrepriseDuLycee(ctx, p.data.entrepriseId);
    if (!ent || ent.ecarteeLe) return { erreur: "Cette entreprise n'est plus proposée par le lycée. Choisissez-en une autre." };
    const email = p.data.autreEmail || ent.representantEmail || ent.email;
    if (!email) return { erreur: `${ent.nom} n'a pas d'adresse e-mail dans l'annuaire : indiquez-la ci-dessous.` };
    entreprise = { id: ent.id, nom: ent.nom, email };
  } else {
    if (!p.data.autreNom || p.data.autreNom.length < 2) return { erreur: "Choisissez l'entreprise dans la liste, ou indiquez son nom." };
    if (!p.data.autreEmail) return { erreur: "Indiquez l'adresse e-mail de l'entreprise." };
    entreprise = { id: null, nom: p.data.autreNom, email: p.data.autreEmail };
  }
  const docs = (await candidaturesDe([e.id])).get(e.id) ?? {};
  const joints = (["cv", "lettre"] as const).filter((t) => fd.get(`joindre_${t}`) === "on" && docs[t]);
  if (!joints.length) return { erreur: "Joignez au moins votre CV ou votre lettre de motivation (déposez-les d'abord)." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.messages)
    .where(and(eq(schema.messages.eleveId, e.id), like(schema.messages.sujet, "Candidature de stage%"), gte(schema.messages.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= ENVOIS_PAR_JOUR) return { erreur: `Vous avez déjà envoyé ${ENVOIS_PAR_JOUR} candidatures aujourd'hui. Réessayez demain.` };
  const d = await dossierStage(ctx, e);
  const periode = d.periode ? `Période de stage : du ${dateLongue(d.periode.debut)} au ${dateLongue(d.periode.fin)}.\n` : "";
  await envoyer(ctx, {
    canal: "mail", destinataire: entreprise.email, sujet: `Candidature de stage : ${e.prenom} ${e.nom}${d.classe ? `, ${d.classe.libelle}` : ""}`,
    eleveId: e.id, entrepriseId: entreprise.id, piecesJointes: joints.map((t) => docs[t]!.id),
    corps: `${p.data.message}\n\n—\n${e.prenom} ${e.nom}, élève ${d.classe ? `en ${d.classe.libelle}${d.classe.filiere ? ` (${d.classe.filiere})` : ""} ` : ""}au ${ctx.etab.nom}\n${periode}Pièces jointes : ${joints.map((t) => `${LIBELLES_CANDIDATURE[t]} (${docs[t]!.nomFichier})`).join(", ")}\nPour répondre : ${ctx.user.email}`,
  });
  await db.insert(schema.demarches).values({ eleveId: e.id, entrepriseNom: entreprise.nom, entrepriseId: entreprise.id, date: aujourdhui(), reponse: "attente" });
  await journaliser(ctx, "candidature_envoyee", "eleve", e.id, { entreprise: entreprise.nom, joints });
  rafraichir(e.id);
  revenirAvec(fd, `Candidature envoyée à ${entreprise.nom}. Elle est ajoutée à vos démarches : sans réponse dans 7 jours, relancez l'entreprise.`);
}
