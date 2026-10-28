import { contexteOptionnel, type Contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { chargerConvention } from "@/lib/convention";
import { lireFichier } from "@/lib/stockage";
import { modeleDuLycee, pdfConvention, reponsePdf } from "@/lib/modeles-documents";
import { remplirPdf, remplirZones, type ValeursZones } from "@/lib/modeles-pdf";
import { etatAttestation, pdfAttestation } from "@/lib/attestation";
import { carnetDeBord, grillesDuLivret, pdfLivret } from "@/lib/livret";
import { chargerVisite } from "@/lib/visites";
import { grillesZones, valeursAttestation, valeursLivret, valeursOrdreMission } from "@/lib/valeurs-zones";
import { sourcesZones } from "@/lib/zones";
import type { AttestationStage, LivretStage, TypeModele } from "@/db/schema";

const TYPES: TypeModele[] = ["convention", "ordre_mission", "attestation", "livret"];
const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : null);

/**
 * Aperçus du modèle du lycée, pour le DDFPT et la direction : le PDF d'origine (pour placer les zones), le repérage
 * (chaque champ avec son nom, chaque zone encadrée avec sa donnée), ou le document rempli avec un stage ou une visite,
 * tel qu'il sera produit (même si le lycée n'utilise pas encore son PDF).
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = (await params) as { type: TypeModele };
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse || !peutAdministrer(ctx)) return new Response("Accès réservé", { status: 403 });
  if (!TYPES.includes(type)) return new Response("Introuvable", { status: 404 });
  const q = new URL(req.url).searchParams;
  const m = await modeleDuLycee(ctx.etab.id, type);
  // Sans « pdf=1 », l'attestation et le livret d'exemple suivent le modèle choisi (Cap PFMP adapté ou PDF du lycée).
  if (type === "attestation" && q.has("stage") && !q.has("pdf")) return apercuAttestation(ctx, uuid(q.get("stage")), null);
  if (type === "livret" && q.has("stage") && !q.has("pdf")) return apercuLivret(ctx, uuid(q.get("stage")), null);
  if (!m.pdfCle) return new Response("Aucun PDF déposé", { status: 404 });
  const original = new Uint8Array(await lireFichier(m.pdfCle));
  if (q.has("original")) return reponsePdf(original, m.pdfNom ?? "modele.pdf");
  if (q.has("reperage")) {
    const libelles = new Map(sourcesZones(type, await grillesZones(ctx.etab.id)).map((s) => [s.cle, s.libelle]));
    const champs = m.champs.length ? await remplirPdf(original, { valeurs: new Map(), reperage: true }) : original;
    return reponsePdf(await remplirZones(champs, m.zones, null, libelles), "reperage-des-zones.pdf");
  }
  const remplir = async (v: ValeursZones) => remplirPdf(original, { valeurs: new Map() }, m.zones, v);
  if (type === "convention") {
    const cv = uuid(q.get("stage")) ? await chargerConvention(ctx, q.get("stage")!) : null;
    if (!cv) return new Response("Stage introuvable", { status: 404 });
    const pdf = await pdfConvention(ctx.etab, cv, { mode: "pdf", personnalisation: m.personnalisation, pdfCle: m.pdfCle, pdfNom: m.pdfNom, champs: m.champs, zones: m.zones, logoCle: null });
    return reponsePdf(pdf!, `apercu-convention-${cv.e.nom}.pdf`);
  }
  if (type === "ordre_mission") {
    const l = uuid(q.get("visite")) ? await chargerVisite(ctx, q.get("visite")!) : null;
    const cv = l?.v ? await chargerConvention(ctx, l.s.id) : null;
    if (!l?.v || !cv) return new Response("Visite introuvable", { status: 404 });
    return reponsePdf(await remplir(await valeursOrdreMission(ctx.etab, cv, l.v)), `apercu-ordre-de-mission-${l.e.nom}.pdf`);
  }
  if (type === "attestation") return apercuAttestation(ctx, uuid(q.get("stage")), remplir);
  return apercuLivret(ctx, uuid(q.get("stage")), remplir);
}

type Remplir = ((v: ValeursZones) => Promise<Uint8Array>) | null;
const exemple = (ctx: Contexte, cv: NonNullable<Awaited<ReturnType<typeof chargerConvention>>>) => ({
  rempliePar: "tuteur_eleve_professeur" as const, professeur: `${ctx.user.prenom} ${ctx.user.nom}`,
  signataire: { nom: cv.s.tuteur?.nom ?? cv.ent.tuteurNom ?? "Le tuteur", fonction: cv.s.tuteur?.fonction ?? cv.ent.tuteurFonction ?? null },
  signature: { modele: "simple" as const }, le: new Date().toISOString(), depuis: "lien" as const, parId: null,
});

/** Une attestation d'exemple, avec un stage de l'année et des réponses fictives. */
async function apercuAttestation(ctx: Contexte, stageId: string | null, remplir: Remplir) {
  const cv = stageId ? await chargerConvention(ctx, stageId) : null;
  if (!cv) return new Response("Stage introuvable", { status: 404 });
  const { bilan } = await etatAttestation(ctx.etab, cv);
  const att: Omit<AttestationStage, "documentId"> = {
    ...exemple(ctx, cv), joursEffectues: bilan.effectues, joursAbsence: bilan.absences, joursCalcules: bilan.effectues, absencesCalculees: bilan.absences,
    activites: "Exemple : les activités réalisées par l'élève, décrites par le tuteur.", appreciation: "Exemple : l'appréciation du tuteur.",
  };
  const pdf = remplir ? await remplir(await valeursAttestation(ctx.etab, cv, att)) : await pdfAttestation(ctx.etab, cv, att);
  return reponsePdf(pdf, `apercu-attestation-${cv.e.nom}.pdf`);
}

/** Un livret d'exemple, avec un stage de l'année : le niveau du milieu partout, et son carnet de bord. */
async function apercuLivret(ctx: Contexte, stageId: string | null, remplir: Remplir) {
  const cv = stageId ? await chargerConvention(ctx, stageId) : null;
  if (!cv) return new Response("Stage introuvable", { status: 404 });
  const g = await grillesDuLivret(ctx.etab.id, cv.c.filiere);
  const milieu = (n: string[]) => n[Math.floor(n.length / 2)];
  const livret: Omit<LivretStage, "documentId"> = {
    ...exemple(ctx, cv), bilan: "Exemple : le bilan du tuteur.",
    attitudes: g.attitudes.map((a) => ({ critere: a.critere, niveau: milieu(a.niveaux) })),
    competences: g.competences.map((c) => ({ competence: c, niveau: milieu(g.niveaux) })),
  };
  const carnet = await carnetDeBord(cv.s.id);
  const pdf = remplir ? await remplir(await valeursLivret(ctx.etab, cv, livret, carnet)) : await pdfLivret(ctx.etab, cv, livret, carnet);
  return reponsePdf(pdf, `apercu-livret-${cv.e.nom}.pdf`);
}
