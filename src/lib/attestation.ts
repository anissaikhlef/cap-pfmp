import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { AttestationStage, Reglages } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { aujourdhui, dateLongue } from "./dates";
import { documentsManquants } from "./entreprises-accueil";
import { INTRO_ATTESTATION, paragraphes, REMPLIE_PAR, TITRE_ATTESTATION } from "./modeles";
import { modeleDuLycee } from "./modeles-documents";
import { DocumentPdf } from "./pdf-simple";
import { joursEffectues, ouvertureAttestation, statutAttestation } from "./regles";
import { modelesAutorises } from "./signature";
import { enregistrerSignatureDessinee, lireFichier, nomPropre } from "./stockage";
import { ecrireOctets } from "./stockage-brut";

type Etab = { id: string; nom: string; ville?: string | null; reglages: Reglages; logoCle?: string | null };
export type EtatAttestation = Awaited<ReturnType<typeof etatAttestation>>;

/**
 * Où en est l'attestation de stage en ligne : jour d'ouverture, jours comptés par Cap PFMP (prévus moins absences signalées),
 * attestation à remplir (aucune n'est validée ni en attente de vérification) ou déjà remplie en ligne.
 */
export async function etatAttestation(etab: Etab, cv: ContexteConvention, jour = aujourdhui()) {
  const ouverture = ouvertureAttestation(cv.p.debut, cv.p.fin, etab.reglages.relances.attestationAvant);
  const absences = await db.select({ debut: schema.absences.debut, fin: schema.absences.fin }).from(schema.absences).where(eq(schema.absences.stageId, cv.s.id));
  const bilan = joursEffectues(cv.s.horaires, cv.p.debut, cv.p.fin, absences, cv.p.fin);
  const aRemplir = (await documentsManquants(cv.s.id)).includes("attestation");
  return { ouverture, ouverte: jour >= ouverture, bilan, aRemplir, remplie: aRemplir ? null : cv.s.attestation };
}

/** Le professeur nommé sur l'attestation : celui qui visite l'élève, à défaut son professeur référent. */
async function professeurDuStage(cv: ContexteConvention) {
  const [v] = await db.select({ id: schema.visites.visiteurId }).from(schema.visites).where(eq(schema.visites.stageId, cv.s.id)).limit(1);
  const id = v?.id ?? cv.referentId;
  const [u] = id ? await db.select({ prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.users).where(eq(schema.users.id, id)).limit(1) : [];
  return u ? `${u.prenom} ${u.nom}` : null;
}

const entier = (message: string) => z.coerce.number({ error: message }).int(message).min(0, message).max(400, message);
const saisie = z.object({
  rempliePar: z.enum(["tuteur_eleve_professeur", "tuteur_eleve", "tuteur"], { error: "Indiquez qui remplit l'attestation." }),
  joursEffectues: entier("Jours effectués : un nombre entier."),
  joursAbsence: entier("Jours d'absence : un nombre entier."),
  activites: z.string().trim().min(10, "Décrivez les activités réalisées par l'élève.").max(3000, "Activités : 3000 caractères au plus."),
  appreciation: z.string().trim().max(2000, "Appréciation : 2000 caractères au plus.").optional(),
  signataireNom: z.string().trim().min(2, "Indiquez le nom de la personne qui signe pour l'entreprise.").max(120),
  signataireFonction: z.string().trim().max(120).optional(),
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
  const p = saisie.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Vérifiez l'attestation." };
  if (fd.get("lu") !== "on") return { erreur: "Cochez la case pour certifier exactes les informations de l'attestation." };
  // Sur le téléphone du professeur, le tuteur signe en dessinant ; dans son compte ou avec son lien, comme le lycée l'a choisi.
  const modeles = v.depuis === "professeur" ? ["dessinee" as const] : modelesAutorises(etab.reglages);
  const modele = String(fd.get("modele") ?? modeles[0]);
  if (modele !== "simple" && modele !== "dessinee") return { erreur: "Choisissez une façon de signer." };
  if (!modeles.includes(modele)) return { erreur: "Ce modèle de signature n'est pas utilisé par le lycée." };
  let image: string | undefined;
  if (modele === "dessinee") {
    const r = await enregistrerSignatureDessinee(etab.id, String(fd.get("image") ?? ""));
    if (typeof r === "string") return { erreur: r };
    image = r.cle;
  }
  const x = p.data;
  const avecProfesseur = x.rempliePar === "tuteur_eleve_professeur";
  const att: Omit<AttestationStage, "documentId"> = {
    rempliePar: x.rempliePar, professeur: avecProfesseur ? (v.professeur !== undefined ? v.professeur : await professeurDuStage(cv)) : null,
    joursEffectues: x.joursEffectues, joursAbsence: x.joursAbsence, joursCalcules: e.bilan.effectues, absencesCalculees: e.bilan.absences,
    activites: x.activites, appreciation: x.appreciation || null,
    signataire: { nom: x.signataireNom, fonction: x.signataireFonction || null }, signature: { modele, ...(image ? { image } : {}) },
    le: new Date().toISOString(), depuis: v.depuis, parId: v.parId,
  };
  const statut = statutAttestation({ effectues: att.joursEffectues, absences: att.joursAbsence }, { effectues: att.joursCalcules, absences: att.absencesCalculees });
  const octets = await pdfAttestation(etab, cv, att);
  const cle = `${etab.id}/${randomUUID()}.pdf`;
  await ecrireOctets(db, cle, Buffer.from(octets));
  const [doc] = await db.insert(schema.documents).values({
    etablissementId: etab.id, eleveId: cv.e.id, stageId: cv.s.id, anneeScolaire: cv.c.anneeScolaire, classeLibelle: cv.c.libelle, type: "attestation",
    nomFichier: `attestation_${nomPropre(`${cv.e.nom}_${cv.e.prenom}`).toLowerCase()}.pdf`, cleStockage: cle, typeMime: "application/pdf", taille: octets.length,
    statut, deposeParId: v.parId, valideLe: statut === "valide" ? new Date() : null,
  }).returning({ id: schema.documents.id });
  await db.update(schema.stages).set({ attestation: { ...att, documentId: doc.id } }).where(eq(schema.stages.id, cv.s.id));
  await db.insert(schema.journal).values({
    etablissementId: etab.id, userId: v.parId, action: "attestation_remplie_en_ligne", entite: "stage", entiteId: cv.s.id,
    details: { depuis: v.depuis, rempliePar: att.rempliePar, statut, joursEffectues: att.joursEffectues, joursCalcules: att.joursCalcules },
  });
  return { statut };
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");

/** L'attestation au modèle Cap PFMP adapté par le lycée (titre, texte d'introduction, rubriques, pied de page, logo). */
export async function pdfAttestation(etab: Etab, cv: ContexteConvention, att: Omit<AttestationStage, "documentId">): Promise<Uint8Array> {
  const perso = (await modeleDuLycee(etab.id, "attestation")).personnalisation;
  const titre = perso.titre || TITRE_ATTESTATION;
  const pdf = await DocumentPdf.creer(`${titre} · ${cv.e.prenom} ${cv.e.nom}`);
  if (etab.logoCle) {
    try {
      await pdf.image(await lireFichier(etab.logoCle), { largeur: 140, hauteur: 60, png: etab.logoCle.endsWith(".png") });
      pdf.espace(8);
    } catch {
      // logo illisible : le document se fait sans
    }
  }
  pdf.texte(`${etab.nom}${etab.ville ? `, ${etab.ville}` : ""}`, { gris: true });
  pdf.espace(4);
  pdf.titre(titre);
  for (const para of paragraphes(perso.introduction || INTRO_ATTESTATION)) { pdf.texte(para); pdf.espace(4); }

  pdf.intertitre("L'élève");
  pdf.champ("Nom et prénom", `${cv.e.nom} ${cv.e.prenom}`);
  pdf.champ("Date de naissance", dateLongue(cv.e.dateNaissance));
  pdf.champ("Classe", [cv.c.libelle, cv.c.filiere, cv.dominante].filter(Boolean).join(" · "));
  pdf.intertitre("L'entreprise");
  pdf.champ("Entreprise", cv.ent.nom);
  pdf.champ("Adresse", [cv.ent.adresse, cv.ent.ville].filter(Boolean).join(", "));
  pdf.champ("Tuteur", [cv.s.tuteur?.nom ?? cv.ent.tuteurNom, cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction].filter(Boolean).join(", "));
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
  pdf.intertitre("Signature de l'entreprise");
  const image = att.signature.image ? await lireFichier(att.signature.image).catch(() => null) : null;
  await pdf.cadre(70, async () => {
    pdf.texte(`Fait le ${dateLongue(att.le.slice(0, 10))}, par ${att.signataire.nom}${att.signataire.fonction ? `, ${att.signataire.fonction}` : ""}.`, { x: 58 });
    pdf.texte(`Attestation remplie par ${REMPLIE_PAR[att.rempliePar]}${att.professeur ? ` (${att.professeur})` : ""}.`, { x: 58, gris: true });
    if (image) await pdf.image(image, { largeur: 180, hauteur: 70, x: 58 });
    else pdf.texte(`Signé en ligne dans Cap PFMP le ${dateLongue(att.le.slice(0, 10))} à ${heure(att.le)}.`, { x: 58 });
  });
  return pdf.enregistrer(perso.piedDePage || etab.nom);
}
