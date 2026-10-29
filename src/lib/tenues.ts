import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, schema } from "@/db";
import type { ArticleRemis, Tailles } from "@/db/schema";
import type { Contexte } from "./auth";
import { a, gereToutLEtablissement } from "./acces";
import { responsablesDe } from "./alertes";
import { aujourdhui, dateLongue } from "./dates";
import { adresseDuSite } from "./liens";
import { envoyer } from "./messages";
import { lisible } from "./modeles-pdf";
import { ecrireOctets } from "./stockage-brut";
import { enregistrerSignatureDessinee, lireFichier } from "./stockage";
import type { Tableau } from "./tableau-pdf";
import { MESURES, mesuresDe, resteARemettre, tailleDe, taillesManquantes, totauxCommande, type Article } from "./tenues-def";

/**
 * Tenues professionnelles et matériel (décisions d'Anissa) : le DDFPT choisit les articles de chaque formation, ouvre la
 * saisie des tailles d'une classe avec une date limite, passe la commande ; l'élève signe la remise le jour même, sur
 * l'appareil de la personne qui distribue (désignée par le DDFPT). La tenue et le matériel sont donnés à l'élève.
 */

/** Choisit les articles, ouvre la saisie des tailles, exporte la commande : la gestion des PFMP et la direction. */
export const gereLesTenues = (ctx: Contexte) => gereToutLEtablissement(ctx);
/** Distribue (fait signer les élèves) : la gestion des PFMP, la direction et les personnes que le DDFPT désigne. */
export const peutDistribuer = (ctx: Contexte) => gereLesTenues(ctx) || ctx.etab.reglages.tenues.distributeurs.includes(ctx.user.id);

export async function articlesDesFormations(etabId: string, formationIds: string[]): Promise<Map<string, Article[]>> {
  const res = new Map<string, Article[]>();
  if (!formationIds.length) return res;
  const rows = await db.select().from(schema.articlesFormation)
    .where(and(eq(schema.articlesFormation.etablissementId, etabId), inArray(schema.articlesFormation.formationId, formationIds)));
  const rang = (c: string) => ["tenue", "protection", "materiel"].indexOf(c);
  rows.sort((x, y) => rang(x.categorie) - rang(y.categorie) || x.libelle.localeCompare(y.libelle, "fr"));
  for (const r of rows) res.set(r.formationId, [...(res.get(r.formationId) ?? []), { id: r.id, libelle: r.libelle, categorie: r.categorie, mesure: r.mesure, quantite: r.quantite }]);
  return res;
}

/**
 * Les classes de l'année dont la formation a des articles : toutes pour la gestion et les personnes qui distribuent ;
 * pour un professeur, les classes dont il est le référent (il saisit les tailles d'un élève qui n'a pas de compte).
 */
export async function classesDesTenues(ctx: Contexte) {
  const rows = await db.select({ c: schema.classes, f: schema.formations }).from(schema.classes)
    .innerJoin(schema.formations, eq(schema.formations.id, schema.classes.formationId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(asc(schema.classes.libelle));
  const articles = await articlesDesFormations(ctx.etab.id, [...new Set(rows.map((r) => r.f.id))]);
  const voitTout = peutDistribuer(ctx);
  return rows.filter((r) => articles.get(r.f.id)?.length && (voitTout || (a(ctx, "professeur") && r.c.referentId === ctx.user.id)))
    .map((r) => ({ ...r.c, formation: r.f.libelle, articles: articles.get(r.f.id)! }));
}

export type EleveTenue = {
  e: typeof schema.eleves.$inferSelect; manque: string[]; remises: (typeof schema.remisesTenues.$inferSelect & { par: string })[]; reste: Article[];
};

/** La tenue d'une classe : ses articles, la saisie des tailles, et pour chaque élève ses tailles et ce qu'il a reçu. */
export async function tenueDeLaClasse(ctx: Contexte, classeId: string) {
  const c = (await classesDesTenues(ctx)).find((x) => x.id === classeId);
  if (!c) return null;
  const [campagne] = await db.select().from(schema.campagnesTenues).where(eq(schema.campagnesTenues.classeId, c.id)).limit(1);
  const eleves = await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.eleves.classeId, c.id), eq(schema.eleves.archive, false)));
  eleves.sort((x, y) => x.nom.localeCompare(y.nom, "fr") || x.prenom.localeCompare(y.prenom, "fr"));
  const remises = campagne && eleves.length ? await db.select({ r: schema.remisesTenues, prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.remisesTenues)
    .leftJoin(schema.users, eq(schema.users.id, schema.remisesTenues.remiseParId))
    .where(and(eq(schema.remisesTenues.campagneId, campagne.id), inArray(schema.remisesTenues.eleveId, eleves.map((e) => e.id))))
    .orderBy(asc(schema.remisesTenues.remiseLe)) : [];
  const lignes: EleveTenue[] = eleves.map((e) => {
    const r = remises.filter((x) => x.r.eleveId === e.id).map((x) => ({ ...x.r, par: x.prenom ? `${x.prenom} ${x.nom}` : "" }));
    return { e, manque: taillesManquantes(c.articles, e.tailles).map((m) => MESURES[m].libelle.toLowerCase()), remises: r, reste: resteARemettre(c.articles, r) };
  });
  return { classe: c, campagne: campagne ?? null, eleves: lignes };
}

/** Peut indiquer les tailles de cet élève : lui-même, ses responsables, la gestion, le référent de sa classe. */
export async function peutSaisirTailles(ctx: Contexte, e: typeof schema.eleves.$inferSelect): Promise<boolean> {
  if (e.etablissementId !== ctx.etab.id) return false;
  if (e.userId === ctx.user.id || gereLesTenues(ctx)) return true;
  if (a(ctx, "parent")) {
    const [r] = await db.select().from(schema.responsables).where(and(eq(schema.responsables.eleveId, e.id), eq(schema.responsables.userId, ctx.user.id))).limit(1);
    if (r) return true;
  }
  if (a(ctx, "professeur") && e.classeId) {
    const [c] = await db.select({ ref: schema.classes.referentId }).from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1);
    return c?.ref === ctx.user.id || e.referentId === ctx.user.id;
  }
  return false;
}

/** Pour l'élève et sa famille : la saisie ouverte de sa classe, les articles, et ce qu'il a déjà reçu. */
export async function tenueDeLEleve(ctx: Contexte, e: typeof schema.eleves.$inferSelect) {
  if (!e.classeId) return null;
  const [c] = await db.select().from(schema.classes).where(and(eq(schema.classes.id, e.classeId), eq(schema.classes.etablissementId, ctx.etab.id))).limit(1);
  if (!c?.formationId || c.anneeScolaire !== ctx.etab.anneeScolaire) return null;
  const [campagne] = await db.select().from(schema.campagnesTenues).where(eq(schema.campagnesTenues.classeId, c.id)).limit(1);
  if (!campagne) return null;
  const articles = (await articlesDesFormations(ctx.etab.id, [c.formationId])).get(c.formationId) ?? [];
  if (!articles.length) return null;
  const remises = await db.select().from(schema.remisesTenues).where(and(eq(schema.remisesTenues.campagneId, campagne.id), eq(schema.remisesTenues.eleveId, e.id)))
    .orderBy(asc(schema.remisesTenues.remiseLe));
  return { campagne, articles, mesures: mesuresDe(articles), remises, reste: resteARemettre(articles, remises) };
}

/** Les destinataires d'un message sur la tenue : l'élève (s'il a un compte) et ses responsables légaux. */
async function familleEtEleve(e: typeof schema.eleves.$inferSelect) {
  const dest: { email: string; prenom: string; eleve: boolean }[] = [];
  if (e.userId) {
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1);
    if (u) dest.push({ email: u.email, prenom: u.prenom, eleve: true });
  }
  for (const u of await responsablesDe(e.id)) if (!dest.some((d) => d.email === u.email)) dest.push({ email: u.email, prenom: u.prenom, eleve: false });
  return dest;
}

/** Le message à l'élève et à sa famille : à l'ouverture de la saisie, puis aux relances avant la date limite. */
export async function prevenirPourLesTailles(ctx: { etab: { id: string; nom: string }; user: { id: string } | null }, e: typeof schema.eleves.$inferSelect, dateLimite: string, relance: boolean, base?: string) {
  const adresse = base ?? (await adresseDuSite());
  let n = 0;
  for (const d of await familleEtEleve(e)) {
    await envoyer(ctx, {
      canal: "mail", destinataire: d.email, eleveId: e.id,
      sujet: `${relance ? "Rappel : " : ""}tenue professionnelle de ${e.prenom} ${e.nom} : tailles à indiquer`,
      corps: `Bonjour ${d.prenom},\n\nLe lycée prépare la tenue professionnelle et le matériel ${d.eleve ? "que vous recevrez pour votre formation" : `que ${e.prenom} recevra pour sa formation`}. Merci d'indiquer ${d.eleve ? "vos" : "ses"} tailles (haut, bas, pointure…) avant le ${dateLongue(dateLimite)}, dans Cap PFMP, rubrique ${d.eleve ? `« Mon stage » : ${adresse}/mon-stage` : `« Mon enfant » : ${adresse}/mon-enfant`}\n\nLa tenue et le matériel sont remis au lycée ; ${d.eleve ? "vous signerez" : `${e.prenom} signera`} le jour de la remise.\n\n${ctx.etab.nom}`,
    });
    n++;
  }
  return n;
}

/* ------------------- Fichiers : commande et remises ------------------- */

type ClasseTenue = Awaited<ReturnType<typeof classesDesTenues>>[number];

/** Le fichier de commande : le total par article et par taille, puis le détail élève par élève. */
export async function fichierCommande(ctx: Contexte, classes: ClasseTenue[]): Promise<Tableau[]> {
  const eleves = classes.length ? await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, classes.map((c) => c.id)), eq(schema.eleves.archive, false))) : [];
  const parClasse = classes.map((c) => ({ c, eleves: eleves.filter((e) => e.classeId === c.id).sort((x, y) => x.nom.localeCompare(y.nom, "fr") || x.prenom.localeCompare(y.prenom, "fr")) }));
  const sous = `${ctx.etab.nom} · ${classes.map((c) => c.libelle).join(", ")} · ${eleves.length} élève(s) · éditée le ${dateLongue(aujourdhui())}`;
  const manquent = eleves.filter((e) => taillesManquantes(classes.find((c) => c.id === e.classeId)!.articles, e.tailles).length).length;
  return [
    {
      titre: "Commande de tenues et de matériel", sousTitre: `${sous}${manquent ? ` · tailles à indiquer pour ${manquent} élève(s)` : ""}`,
      colonnes: ["Formation", "Article", "Taille", "Quantité"], largeurs: [16, 14, 8, 6],
      lignes: totauxCommande(parClasse.flatMap(({ c, eleves }) => eleves.map((e) => ({ formation: c.formation, articles: c.articles, tailles: e.tailles }))))
        .map((l) => [l.formation, l.article, l.taille, l.quantite]),
    },
    {
      titre: "Détail par élève", sousTitre: sous,
      colonnes: ["Classe", "Nom", "Prénom", "Article", "Taille", "Quantité"],
      lignes: parClasse.flatMap(({ c, eleves }) => eleves.flatMap((e) => c.articles.map((x) => [c.libelle, e.nom, e.prenom, x.libelle, tailleDe(x, e.tailles) ?? "taille unique", x.quantite]))),
    },
  ];
}

const jourClair = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/** Après la remise : qui a reçu quoi, quand et de qui ; ce qui reste à remettre. */
export async function fichierRemises(ctx: Contexte, classes: ClasseTenue[]): Promise<Tableau> {
  const lignes: (string | number)[][] = [];
  for (const c of classes) {
    const t = await tenueDeLaClasse(ctx, c.id);
    if (!t) continue;
    for (const { e, remises, reste } of t.eleves) {
      for (const r of remises) for (const x of r.articles) lignes.push([c.libelle, e.nom, e.prenom, x.libelle, x.taille ?? "taille unique", x.quantite, jourClair(r.remiseLe), r.par, "remis, signé"]);
      for (const x of reste) lignes.push([c.libelle, e.nom, e.prenom, x.libelle, tailleDe(x, e.tailles) ?? "taille unique", x.quantite, "", "", "à remettre"]);
    }
  }
  return {
    titre: "Remise des tenues et du matériel", sousTitre: `${ctx.etab.nom} · ${classes.map((c) => c.libelle).join(", ")} · éditée le ${dateLongue(aujourdhui())}`,
    colonnes: ["Classe", "Nom", "Prénom", "Article", "Taille", "Quantité", "Remis le", "Remis par", "État"], lignes,
  };
}

/* ------------------- Remise signée ------------------- */

/**
 * Enregistre une remise : les articles cochés, signés par l'élève sur l'appareil de la personne qui distribue. La fiche
 * PDF (articles, tailles, date, signature) est rangée dans les documents de l'élève.
 */
export async function enregistrerRemise(ctx: Contexte, eleveId: string, articleIds: string[], image: string): Promise<{ erreur: string } | { ok: string }> {
  if (!peutDistribuer(ctx)) return { erreur: "Seules les personnes désignées par le DDFPT font la distribution." };
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e?.classeId) return { erreur: "Élève introuvable." };
  const t = await tenueDeLaClasse(ctx, e.classeId);
  if (!t?.campagne) return { erreur: "La saisie des tailles de cette classe n'est pas ouverte." };
  const l = t.eleves.find((x) => x.e.id === e.id)!;
  const choisis = l.reste.filter((x) => articleIds.includes(x.id));
  if (!choisis.length) return { erreur: "Cochez les articles remis à l'élève." };
  const sig = await enregistrerSignatureDessinee(ctx.etab.id, image);
  if (typeof sig === "string") return { erreur: "L'élève doit signer dans le cadre pour confirmer la remise." };
  const articles: ArticleRemis[] = choisis.map((x) => ({ articleId: x.id, libelle: x.libelle, taille: x.mesure ? e.tailles[x.mesure] ?? null : null, quantite: x.quantite }));
  const quand = new Date();
  const pdf = await pdfRemise(ctx, e, t.classe.libelle, articles, sig.cle, quand, l.reste.length - choisis.length);
  const cle = `${ctx.etab.id}/${randomUUID()}.pdf`;
  await ecrireOctets(db, cle, Buffer.from(pdf));
  const [doc] = await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: e.id, anneeScolaire: ctx.etab.anneeScolaire, classeLibelle: t.classe.libelle, type: "remise_tenue",
    nomFichier: `remise_tenue_${e.nom.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`, cleStockage: cle, typeMime: "application/pdf", taille: pdf.length,
    statut: "valide", deposeParId: ctx.user.id, valideParId: ctx.user.id, valideLe: quand,
  }).returning();
  await db.insert(schema.remisesTenues).values({ etablissementId: ctx.etab.id, eleveId: e.id, campagneId: t.campagne.id, articles, signatureCle: sig.cle, remiseLe: quand, remiseParId: ctx.user.id, documentId: doc.id });
  const reste = l.reste.length - choisis.length;
  return { ok: `Remise signée par ${e.prenom} ${e.nom} : ${choisis.length} article(s)${reste ? ` ; ${reste} reste(nt) à remettre` : ""}. La fiche est rangée dans ses documents.` };
}

async function pdfRemise(ctx: Contexte, e: typeof schema.eleves.$inferSelect, classe: string, articles: ArticleRemis[], signature: string, quand: Date, reste: number) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Remise de la tenue et du matériel – ${e.prenom} ${e.nom}`);
  doc.setCreator("Cap PFMP");
  doc.setProducer("Cap PFMP");
  const police = await doc.embedFont(StandardFonts.Helvetica), gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const M = 50, GRIS = rgb(0.38, 0.4, 0.45), NOIR = rgb(0.08, 0.1, 0.14);
  const t = (s: string, x: number, y: number, taille = 10.5, f = police, c = NOIR) => page.drawText(lisible(f, s), { x, y, size: taille, font: f, color: c });
  let y = 792;
  t(ctx.etab.nom, M, y, 9, police, GRIS); y -= 30;
  t("Remise de la tenue professionnelle et du matériel", M, y, 15, gras); y -= 30;
  t(`Élève : ${e.prenom} ${e.nom}`, M, y, 11, gras); t(`Classe : ${classe}`, 330, y, 11, gras); y -= 28;
  page.drawRectangle({ x: M, y: y - 4, width: 495, height: 20, color: rgb(0.11, 0.2, 0.33) });
  t("Article", M + 6, y + 2, 9.5, gras, rgb(1, 1, 1)); t("Taille", 360, y + 2, 9.5, gras, rgb(1, 1, 1)); t("Quantité", 460, y + 2, 9.5, gras, rgb(1, 1, 1));
  y -= 22;
  for (const x of articles) { t(x.libelle, M + 6, y); t(x.taille ?? "taille unique", 360, y); t(String(x.quantite), 460, y); y -= 18; }
  y -= 14;
  if (reste) { t(`${reste} article(s) restent à remettre : ils feront l'objet d'une autre remise signée.`, M, y, 9, police, GRIS); y -= 18; }
  t(`Je reconnais avoir reçu les articles ci-dessus le ${dateLongue(quand.toISOString().slice(0, 10))}.`, M, y, 10.5); y -= 16;
  t("Ils me sont donnés pour ma formation.", M, y, 10.5); y -= 30;
  t("Signature de l'élève", M, y, 9.5, gras); y -= 8;
  const img = await doc.embedPng(await lireFichier(signature));
  const h = 80, l = Math.min(260, (img.width / img.height) * h);
  page.drawImage(img, { x: M, y: y - h, width: l, height: h });
  y -= h + 24;
  t(`Remis par ${ctx.user.prenom} ${ctx.user.nom}, le ${dateLongue(quand.toISOString().slice(0, 10))}, avec Cap PFMP.`, M, y, 9, police, GRIS);
  return doc.save();
}
