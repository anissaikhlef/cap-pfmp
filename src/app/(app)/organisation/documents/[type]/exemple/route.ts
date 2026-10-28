import { contexteOptionnel } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { pdfExempleConvention, pdfExempleSansChamps } from "@/lib/modeles-pdf";
import { reponsePdf } from "@/lib/modeles-documents";

const EXEMPLES = {
  ordre_mission: ["Ordre de mission", ["Professeur", "Élève", "Classe", "Entreprise", "Adresse", "Date de la visite"], ["Véhicule personnel", "Transport en commun"], ["Signature de la direction", "Cachet de l'entreprise"]],
  attestation: ["Attestation de stage", ["Nom et prénom de l'élève", "Classe", "Entreprise", "Du", "Au", "Jours effectués", "Jours d'absence", "Activités"], [], ["Signature et cachet de l'entreprise"]],
  livret: ["Livret de compétences", ["Nom et prénom de l'élève", "Classe", "Entreprise", "Bilan du tuteur"], ["Intérêt porté au travail : satisfaisant", "Intérêt porté au travail : très satisfaisant"], ["Signature du tuteur"]],
} as const;

/** Un exemple fictif de document à télécharger, pour essayer le PDF du lycée (DDFPT et direction). */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.user.doitChangerMotDePasse || !peutAdministrer(ctx)) return new Response("Accès réservé", { status: 403 });
  if (type === "convention") return reponsePdf(await pdfExempleConvention(), "exemple-convention-pdf-modifiable.pdf");
  const e = EXEMPLES[type as keyof typeof EXEMPLES];
  if (!e) return new Response("Introuvable", { status: 404 });
  return reponsePdf(await pdfExempleSansChamps(e[0], [...e[1]], [...e[2]], [...e[3]]), `exemple-${type}-sans-champs.pdf`);
}
