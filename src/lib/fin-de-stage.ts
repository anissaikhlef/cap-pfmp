import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Reglages, RemplissageEnLigne } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { dateLongue } from "./dates";
import { REMPLIE_PAR } from "./modeles";
import type { DocumentPdf } from "./pdf-simple";
import { modelesAutorises } from "./signature";
import { enregistrerSignatureDessinee, lireFichier, nomPropre } from "./stockage";
import { ecrireOctets } from "./stockage-brut";

/**
 * Ce qui est commun à l'attestation et au livret remplis en ligne par le tuteur (décision d'Anissa : avec l'élève et le
 * professeur quand c'est possible, sinon avec l'élève, sinon seul) : qui remplit, qui signe et comment, le PDF rangé
 * dans le dossier de l'élève.
 */
type Etab = { id: string; nom: string; reglages: Reglages };

/** Le professeur nommé sur le document : celui qui visite l'élève, à défaut son professeur référent. */
async function professeurDuStage(cv: ContexteConvention) {
  const [v] = await db.select({ id: schema.visites.visiteurId }).from(schema.visites).where(eq(schema.visites.stageId, cv.s.id)).limit(1);
  const id = v?.id ?? cv.referentId;
  const [u] = id ? await db.select({ prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.users).where(eq(schema.users.id, id)).limit(1) : [];
  return u ? `${u.prenom} ${u.nom}` : null;
}

const saisie = z.object({
  rempliePar: z.enum(["tuteur_eleve_professeur", "tuteur_eleve", "tuteur"], { error: "Indiquez qui remplit le document." }),
  signataireNom: z.string().trim().min(2, "Indiquez le nom de la personne qui signe pour l'entreprise.").max(120),
  signataireFonction: z.string().trim().max(120).optional(),
});

/**
 * Lit qui remplit, qui signe, et enregistre la signature : dessinée sur le téléphone du professeur ; dans le compte du tuteur
 * ou avec son lien, simple ou dessinée comme le lycée l'a choisi. Renvoie un message d'erreur, ou le remplissage.
 */
export async function lireRemplissage(etab: Etab, cv: ContexteConvention, fd: FormData, v: {
  depuis: RemplissageEnLigne["depuis"]; parId: string | null; professeur?: string | null; engagement: string;
}): Promise<{ erreur: string } | Omit<RemplissageEnLigne, "documentId">> {
  const p = saisie.safeParse({ rempliePar: fd.get("rempliePar") ?? undefined, signataireNom: fd.get("signataireNom") ?? "", signataireFonction: fd.get("signataireFonction") ?? undefined });
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  if (fd.get("lu") !== "on") return { erreur: v.engagement };
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
  return {
    rempliePar: x.rempliePar,
    professeur: x.rempliePar === "tuteur_eleve_professeur" ? (v.professeur !== undefined ? v.professeur : await professeurDuStage(cv)) : null,
    signataire: { nom: x.signataireNom, fonction: x.signataireFonction || null }, signature: { modele, ...(image ? { image } : {}) },
    le: new Date().toISOString(), depuis: v.depuis, parId: v.parId,
  };
}

/** Range le PDF produit dans les documents de l'élève, pour ce stage. Renvoie l'identifiant du document. */
export async function rangerLePdf(etab: Etab, cv: ContexteConvention, type: "attestation" | "livret", octets: Uint8Array, statut: "valide" | "a_verifier", parId: string | null) {
  const cle = `${etab.id}/${randomUUID()}.pdf`;
  await ecrireOctets(db, cle, Buffer.from(octets));
  const [doc] = await db.insert(schema.documents).values({
    etablissementId: etab.id, eleveId: cv.e.id, stageId: cv.s.id, anneeScolaire: cv.c.anneeScolaire, classeLibelle: cv.c.libelle, type,
    nomFichier: `${type}_${nomPropre(`${cv.e.nom}_${cv.e.prenom}`).toLowerCase()}.pdf`, cleStockage: cle, typeMime: "application/pdf", taille: octets.length,
    statut, deposeParId: parId, valideLe: statut === "valide" ? new Date() : null,
  }).returning({ id: schema.documents.id });
  return doc.id;
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");

/** Le cadre de signature de l'entreprise, en bas du document : qui a signé, qui l'a rempli, la signature. */
export async function cadreSignature(pdf: DocumentPdf, r: Omit<RemplissageEnLigne, "documentId">, document: string) {
  pdf.intertitre("Signature de l'entreprise");
  const image = r.signature.image ? await lireFichier(r.signature.image).catch(() => null) : null;
  await pdf.cadre(70, async () => {
    pdf.texte(`Fait le ${dateLongue(r.le.slice(0, 10))}, par ${r.signataire.nom}${r.signataire.fonction ? `, ${r.signataire.fonction}` : ""}.`, { x: 58 });
    pdf.texte(`${document} rempli${document.startsWith("Attestation") ? "e" : ""} par ${REMPLIE_PAR[r.rempliePar]}${r.professeur ? ` (${r.professeur})` : ""}.`, { x: 58, gris: true });
    if (image) await pdf.image(image, { largeur: 180, hauteur: 70, x: 58 });
    else pdf.texte(`Signé en ligne dans Cap PFMP le ${dateLongue(r.le.slice(0, 10))} à ${heure(r.le)}.`, { x: 58 });
  });
}

/** L'en-tête des documents au modèle Cap PFMP : logo, nom du lycée, titre et introduction. */
export async function enTete(pdf: DocumentPdf, etab: Etab & { ville?: string | null; logoCle?: string | null }, titre: string, introduction: string[]) {
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
  for (const para of introduction) { pdf.texte(para); pdf.espace(4); }
}

/** L'élève, l'entreprise et la période, communs aux documents de fin de stage. */
export function partiesDuStage(pdf: DocumentPdf, cv: ContexteConvention) {
  pdf.intertitre("L'élève");
  pdf.champ("Nom et prénom", `${cv.e.nom} ${cv.e.prenom}`);
  pdf.champ("Date de naissance", dateLongue(cv.e.dateNaissance));
  pdf.champ("Classe", [cv.c.libelle, cv.c.filiere, cv.dominante].filter(Boolean).join(" · "));
  pdf.intertitre("L'entreprise");
  pdf.champ("Entreprise", cv.ent.nom);
  pdf.champ("Adresse", [cv.ent.adresse, cv.ent.ville].filter(Boolean).join(", "));
  pdf.champ("Tuteur", [cv.s.tuteur?.nom ?? cv.ent.tuteurNom, cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction].filter(Boolean).join(", "));
}
