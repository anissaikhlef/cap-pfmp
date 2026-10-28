import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LivretStage, Reglages } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { aujourdhui, dateLongue } from "./dates";
import { documentsManquants } from "./entreprises-accueil";
import { cadreSignature, enTete, lireRemplissage, partiesDuStage, rangerLePdf } from "./fin-de-stage";
import { competencesDe, INTRO_LIVRET, NIVEAUX_COMPETENCES, niveauxRetenus, paragraphes, TITRE_LIVRET } from "./modeles";
import { grilleEtQuestions, modeleDuLycee } from "./modeles-documents";
import { DocumentPdf } from "./pdf-simple";
import { ouvertureFinDeStage } from "./regles";

type Etab = { id: string; nom: string; ville?: string | null; reglages: Reglages; logoCle?: string | null };
export type EtatLivret = Awaited<ReturnType<typeof etatLivret>>;
export type ActiviteJour = typeof schema.activitesJour.$inferSelect;

/** Le carnet de bord d'un stage : les activités notées par l'élève, jour par jour. */
export async function carnetDeBord(stageId: string): Promise<ActiviteJour[]> {
  return db.select().from(schema.activitesJour).where(eq(schema.activitesJour.stageId, stageId)).orderBy(asc(schema.activitesJour.date));
}

/** L'élève note (ou corrige) les activités d'un jour de son stage : une seule note par jour. */
export async function noterActivites(etabId: string, stageId: string, date: string, texte: string, parId: string) {
  await db.insert(schema.activitesJour).values({ etablissementId: etabId, stageId, date, texte, parId })
    .onConflictDoUpdate({ target: [schema.activitesJour.stageId, schema.activitesJour.date], set: { texte, parId, majLe: sql`now()` } });
}

/** Les grilles du livret : attitudes professionnelles du lycée (la même grille que la visite), compétences du diplôme de la classe. */
export async function grillesDuLivret(etabId: string, filiere: string | null) {
  const { grille } = await grilleEtQuestions(etabId);
  const perso = (await modeleDuLycee(etabId, "livret")).personnalisation;
  return { attitudes: grille, competences: competencesDe(perso, filiere), niveaux: perso.niveauxCompetences?.length ? perso.niveauxCompetences : NIVEAUX_COMPETENCES };
}

/** Où en est le livret en ligne : jour d'ouverture (comme l'attestation), grilles, carnet de bord, livret à remplir ou rempli. */
export async function etatLivret(etab: Etab, cv: ContexteConvention, jour = aujourdhui()) {
  const ouverture = ouvertureFinDeStage(cv.p.debut, cv.p.fin, etab.reglages.relances.attestationAvant);
  const aRemplir = (await documentsManquants(cv.s.id)).includes("livret");
  return {
    ouverture, ouverte: jour >= ouverture, aRemplir, remplie: aRemplir ? null : cv.s.livret,
    ...(await grillesDuLivret(etab.id, cv.c.filiere)), carnet: await carnetDeBord(cv.s.id),
  };
}

/**
 * Enregistre le livret rempli en ligne par le tuteur : un niveau pour chaque attitude et chaque compétence, son bilan,
 * sa signature ; le PDF au modèle du lycée, avec le carnet de bord de l'élève, est rangé dans ses documents.
 */
export async function enregistrerLivret(etab: Etab, cv: ContexteConvention, fd: FormData, v: {
  depuis: LivretStage["depuis"]; parId: string | null; professeur?: string | null;
}): Promise<{ erreur: string } | { ok: true }> {
  const e = await etatLivret(etab, cv);
  if (!e.ouverte) return { erreur: `Le livret se remplit à partir du ${dateLongue(e.ouverture)}.` };
  if (!e.aRemplir) return { erreur: "Le livret de ce stage est déjà rempli ou déposé." };
  const choix = (cle: string, n: number) => Array.from({ length: n }, (_, i) => fd.get(`${cle}_${i}`) as string | null);
  const attitudes = niveauxRetenus(e.attitudes.map((g) => ({ libelle: g.critere, niveaux: g.niveaux })), choix("att", e.attitudes.length));
  if (!attitudes) return { erreur: "Choisissez un niveau pour chaque attitude professionnelle." };
  const competences = niveauxRetenus(e.competences.map((c) => ({ libelle: c, niveaux: e.niveaux })), choix("comp", e.competences.length));
  if (!competences) return { erreur: "Choisissez un niveau pour chaque compétence du diplôme." };
  const r = await lireRemplissage(etab, cv, fd, { ...v, engagement: "Cochez la case pour certifier les évaluations du livret." });
  if ("erreur" in r) return r;
  const livret: Omit<LivretStage, "documentId"> = {
    ...r, attitudes: attitudes.map((x) => ({ critere: x.libelle, niveau: x.niveau })),
    competences: competences.map((x) => ({ competence: x.libelle, niveau: x.niveau })), bilan: String(fd.get("bilan") ?? "").trim().slice(0, 3000) || null,
  };
  const documentId = await rangerLePdf(etab, cv, "livret", await pdfLivret(etab, cv, livret, e.carnet), "valide", v.parId);
  await db.update(schema.stages).set({ livret: { ...livret, documentId } }).where(eq(schema.stages.id, cv.s.id));
  await db.insert(schema.journal).values({
    etablissementId: etab.id, userId: v.parId, action: "livret_rempli_en_ligne", entite: "stage", entiteId: cv.s.id,
    details: { depuis: v.depuis, rempliePar: livret.rempliePar },
  });
  return { ok: true };
}

/** Le livret au modèle Cap PFMP adapté par le lycée : attitudes, compétences du diplôme, bilan, carnet de bord, signature. */
export async function pdfLivret(etab: Etab, cv: ContexteConvention, livret: Omit<LivretStage, "documentId">, carnet: ActiviteJour[]): Promise<Uint8Array> {
  const perso = (await modeleDuLycee(etab.id, "livret")).personnalisation;
  const titre = perso.titre || TITRE_LIVRET;
  const pdf = await DocumentPdf.creer(`${titre} · ${cv.e.prenom} ${cv.e.nom}`);
  await enTete(pdf, etab, titre, paragraphes(perso.introduction || INTRO_LIVRET));
  partiesDuStage(pdf, cv);
  pdf.intertitre("La période de formation");
  pdf.champ("Période", `du ${dateLongue(cv.p.debut)} au ${dateLongue(cv.p.fin)}${cv.p.eleveId ? " (rattrapage)" : ""}`);
  pdf.intertitre("Attitudes professionnelles");
  for (const a of livret.attitudes) pdf.champ(a.critere, a.niveau);
  if (livret.competences.length) {
    pdf.intertitre(`Compétences du diplôme${cv.c.filiere ? ` : ${cv.c.filiere}` : ""}`);
    for (const c of livret.competences) pdf.champ(c.competence, c.niveau);
  }
  if (livret.bilan) {
    pdf.intertitre("Bilan du tuteur");
    pdf.texte(livret.bilan);
  }
  if (carnet.length) {
    pdf.intertitre("Carnet de bord : activités notées par l'élève");
    for (const a of carnet) pdf.champ(dateLongue(a.date), a.texte);
  }
  for (const r of perso.rubriques ?? []) {
    pdf.intertitre(r.titre);
    for (const para of paragraphes(r.texte)) { pdf.texte(para); pdf.espace(4); }
  }
  await cadreSignature(pdf, livret, "Livret");
  return pdf.enregistrer(perso.piedDePage || etab.nom);
}
