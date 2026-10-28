import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { AttestationStage, Reglages } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { aujourdhui, dateLongue } from "./dates";
import { documentsManquants } from "./entreprises-accueil";
import { cadreSignature, enTete, lireRemplissage, partiesDuStage, rangerLePdf } from "./fin-de-stage";
import { INTRO_ATTESTATION, paragraphes, TITRE_ATTESTATION } from "./modeles";
import { modeleDuLycee, utiliseLePdf } from "./modeles-documents";
import { remplirPdf } from "./modeles-pdf";
import { lireFichier } from "./stockage";
import { valeursAttestation } from "./valeurs-zones";
import { DocumentPdf } from "./pdf-simple";
import { joursEffectues, ouvertureFinDeStage, statutAttestation } from "./regles";

type Etab = { id: string; nom: string; ville?: string | null; reglages: Reglages; logoCle?: string | null };
export type EtatAttestation = Awaited<ReturnType<typeof etatAttestation>>;

/**
 * Où en est l'attestation de stage en ligne : jour d'ouverture, jours comptés par Cap PFMP (prévus moins absences signalées),
 * attestation à remplir (aucune n'est validée ni en attente de vérification) ou déjà remplie en ligne.
 */
export async function etatAttestation(etab: Etab, cv: ContexteConvention, jour = aujourdhui()) {
  const ouverture = ouvertureFinDeStage(cv.p.debut, cv.p.fin, etab.reglages.relances.attestationAvant);
  const absences = await db.select({ debut: schema.absences.debut, fin: schema.absences.fin }).from(schema.absences).where(eq(schema.absences.stageId, cv.s.id));
  const bilan = joursEffectues(cv.s.horaires, cv.p.debut, cv.p.fin, absences, cv.p.fin);
  const aRemplir = (await documentsManquants(cv.s.id)).includes("attestation");
  return { ouverture, ouverte: jour >= ouverture, bilan, aRemplir, remplie: aRemplir ? null : cv.s.attestation };
}

const entier = (message: string) => z.coerce.number({ error: message }).int(message).min(0, message).max(400, message);
const saisie = z.object({
  joursEffectues: entier("Jours effectués : un nombre entier."),
  joursAbsence: entier("Jours d'absence : un nombre entier."),
  activites: z.string().trim().min(10, "Décrivez les activités réalisées par l'élève.").max(3000, "Activités : 3000 caractères au plus."),
  appreciation: z.string().trim().max(2000, "Appréciation : 2000 caractères au plus.").optional(),
});

/**
 * Enregistre l'attestation remplie en ligne par le tuteur (sur le téléphone du professeur, dans son compte ou avec son lien) :
 * sa signature, puis le PDF au modèle du lycée, rangé dans les documents de l'élève. Le document est validé d'office quand
 * les jours déclarés sont ceux de Cap PFMP ; sinon, la gestion des PFMP vérifie l'écart.
 */
export async function enregistrerAttestation(etab: Etab, cv: ContexteConvention, fd: FormData, v: {
  depuis: AttestationStage["depuis"]; parId: string | null; professeur?: string | null;
}): Promise<{ erreur: string } | { statut: "valide" | "a_verifier" }> {
  const e = await etatAttestation(etab, cv);
  if (!e.ouverte) return { erreur: `L'attestation se remplit à partir du ${dateLongue(e.ouverture)}.` };
  if (!e.aRemplir) return { erreur: "L'attestation de ce stage est déjà remplie ou déposée." };
  const p = saisie.safeParse({
    joursEffectues: fd.get("joursEffectues"), joursAbsence: fd.get("joursAbsence"),
    activites: fd.get("activites") ?? "", appreciation: fd.get("appreciation") ?? undefined,
  });
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Vérifiez l'attestation." };
  const r = await lireRemplissage(etab, cv, fd, { ...v, engagement: "Cochez la case pour certifier exactes les informations de l'attestation." });
  if ("erreur" in r) return r;
  const x = p.data;
  const att: Omit<AttestationStage, "documentId"> = {
    ...r, joursEffectues: x.joursEffectues, joursAbsence: x.joursAbsence, joursCalcules: e.bilan.effectues, absencesCalculees: e.bilan.absences,
    activites: x.activites, appreciation: x.appreciation || null,
  };
  const statut = statutAttestation({ effectues: att.joursEffectues, absences: att.joursAbsence }, { effectues: att.joursCalcules, absences: att.absencesCalculees });
  const documentId = await rangerLePdf(etab, cv, "attestation", await pdfAttestation(etab, cv, att), statut, v.parId);
  await db.update(schema.stages).set({ attestation: { ...att, documentId } }).where(eq(schema.stages.id, cv.s.id));
  await db.insert(schema.journal).values({
    etablissementId: etab.id, userId: v.parId, action: "attestation_remplie_en_ligne", entite: "stage", entiteId: cv.s.id,
    details: { depuis: v.depuis, rempliePar: att.rempliePar, statut, joursEffectues: att.joursEffectues, joursCalcules: att.joursCalcules },
  });
  return { statut };
}

/**
 * L'attestation au modèle du lycée : son propre PDF, rempli dans les zones qu'il y a placées, ou le modèle Cap PFMP adapté
 * (titre, texte d'introduction, rubriques, pied de page, logo).
 */
export async function pdfAttestation(etab: Etab, cv: ContexteConvention, att: Omit<AttestationStage, "documentId">): Promise<Uint8Array> {
  const m = await modeleDuLycee(etab.id, "attestation");
  if (utiliseLePdf(m)) return remplirPdf(new Uint8Array(await lireFichier(m.pdfCle)), { valeurs: new Map() }, m.zones, await valeursAttestation(etab, cv, att));
  const perso = m.personnalisation;
  const titre = perso.titre || TITRE_ATTESTATION;
  const pdf = await DocumentPdf.creer(`${titre} · ${cv.e.prenom} ${cv.e.nom}`);
  await enTete(pdf, etab, titre, paragraphes(perso.introduction || INTRO_ATTESTATION));
  partiesDuStage(pdf, cv);
  pdf.intertitre("La période de formation");
  pdf.champ("Période", `du ${dateLongue(cv.p.debut)} au ${dateLongue(cv.p.fin)}${cv.p.eleveId ? " (rattrapage)" : ""}`);
  pdf.champ("Jours de stage effectués", String(att.joursEffectues));
  pdf.champ("Jours d'absence", String(att.joursAbsence));
  pdf.intertitre("Activités réalisées");
  pdf.texte(att.activites);
  if (att.appreciation) {
    pdf.intertitre("Appréciation du tuteur");
    pdf.texte(att.appreciation);
  }
  for (const r of perso.rubriques ?? []) {
    pdf.intertitre(r.titre);
    for (const para of paragraphes(r.texte)) { pdf.texte(para); pdf.espace(4); }
  }
  await cadreSignature(pdf, att, "Attestation");
  return pdf.enregistrer(perso.piedDePage || etab.nom);
}
