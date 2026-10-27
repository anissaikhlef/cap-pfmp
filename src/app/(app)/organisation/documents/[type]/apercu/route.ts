import { contexteOptionnel, type Contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { chargerConvention } from "@/lib/convention";
import { lireFichier } from "@/lib/stockage";
import { modeleDuLycee, pdfConvention, reponsePdf } from "@/lib/modeles-documents";
import { remplirPdf } from "@/lib/modeles-pdf";
import { etatAttestation, pdfAttestation } from "@/lib/attestation";

/**
 * Aperçus du PDF du lycée, pour le DDFPT et la direction : chaque champ avec son propre nom (« repérage »),
 * ou rempli avec un stage, tel qu'il sera produit (même si le lycée n'utilise pas encore son PDF).
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse || !peutAdministrer(ctx)) return new Response("Accès réservé", { status: 403 });
  if (type === "attestation") return apercuAttestation(ctx, new URL(req.url).searchParams.get("stage") ?? "");
  if (type !== "convention") return new Response("Introuvable", { status: 404 });
  const m = await modeleDuLycee(ctx.etab.id, type);
  if (!m.pdfCle) return new Response("Aucun PDF déposé", { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.has("reperage")) {
    return reponsePdf(await remplirPdf(new Uint8Array(await lireFichier(m.pdfCle)), { valeurs: new Map(), reperage: true }), "reperage-des-champs.pdf");
  }
  const stageId = url.searchParams.get("stage") ?? "";
  const cv = /^[0-9a-f-]{36}$/.test(stageId) ? await chargerConvention(ctx, stageId) : null;
  if (!cv) return new Response("Stage introuvable", { status: 404 });
  const pdf = await pdfConvention(ctx.etab, cv, { mode: "pdf", personnalisation: m.personnalisation, pdfCle: m.pdfCle, pdfNom: m.pdfNom, champs: m.champs, logoCle: null });
  return reponsePdf(pdf!, `apercu-convention-${cv.e.nom}.pdf`);
}

/** Une attestation d'exemple au modèle du lycée, avec un stage de l'année et des réponses fictives. */
async function apercuAttestation(ctx: Contexte, stageId: string) {
  const cv = /^[0-9a-f-]{36}$/.test(stageId) ? await chargerConvention(ctx, stageId) : null;
  if (!cv) return new Response("Stage introuvable", { status: 404 });
  const { bilan } = await etatAttestation(ctx.etab, cv);
  const pdf = await pdfAttestation(ctx.etab, cv, {
    rempliePar: "tuteur_eleve_professeur", professeur: `${ctx.user.prenom} ${ctx.user.nom}`,
    joursEffectues: bilan.effectues, joursAbsence: bilan.absences, joursCalcules: bilan.effectues, absencesCalculees: bilan.absences,
    activites: "Exemple : les activités réalisées par l'élève, décrites par le tuteur.", appreciation: "Exemple : l'appréciation du tuteur.",
    signataire: { nom: cv.s.tuteur?.nom ?? cv.ent.tuteurNom ?? "Le tuteur", fonction: cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction ?? null },
    signature: { modele: "simple" }, le: new Date().toISOString(), depuis: "lien", parId: null,
  });
  return reponsePdf(pdf, `apercu-attestation-${cv.e.nom}.pdf`);
}
