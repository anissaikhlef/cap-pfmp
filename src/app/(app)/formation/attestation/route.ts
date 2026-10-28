import { contexteOptionnel } from "@/lib/auth";
import { profilDe } from "@/lib/aide";
import { attestationPossible, MISSIONS, missionsReussies, QUIZ } from "@/lib/formation";
import { actionsDEntrainement } from "@/lib/entrainement";
import { LIBELLES_ROLES } from "@/lib/navigation";
import { dateLongue, aujourdhui } from "@/lib/dates";
import { DocumentPdf } from "@/lib/pdf-simple";
import { reponsePdf } from "@/lib/modeles-documents";

/** L'attestation de prise en main de Cap PFMP : toutes les missions réussies dans le lycée d'entraînement et le quiz réussi. */
export async function GET() {
  const ctx = await contexteOptionnel();
  if (!ctx || ctx.etab.entrainementDeId) return new Response("Introuvable", { status: 404 });
  const profil = profilDe(ctx.user.roles);
  const missions = MISSIONS[profil] ?? [];
  const reussies = missionsReussies(profil, await actionsDEntrainement(ctx.user.id));
  if (!attestationPossible(reussies, ctx.user.quizNote)) return new Response("Missions ou quiz pas encore réussis", { status: 404 });
  const pdf = await DocumentPdf.creer("Attestation de prise en main de Cap PFMP");
  pdf.texte(ctx.etab.nom, { gris: true });
  pdf.espace(10);
  pdf.titre("Attestation de prise en main de Cap PFMP");
  pdf.texte(`Cap PFMP atteste que ${ctx.user.prenom} ${ctx.user.nom} (${ctx.user.roles.filter((r) => r !== "admin").map((r) => LIBELLES_ROLES[r]).join(", ")}, ${ctx.etab.nom}) a suivi la formation incluse à Cap PFMP et a réussi :`);
  pdf.intertitre("Les missions, dans son lycée d'entraînement");
  for (const m of missions) pdf.champ("Réussie", m.titre);
  pdf.intertitre("Le quiz de prise en main");
  pdf.champ("Note", `${ctx.user.quizNote} sur ${(QUIZ[profil] ?? []).length}${ctx.user.quizLe ? `, le ${dateLongue(ctx.user.quizLe.toISOString().slice(0, 10))}` : ""}`);
  pdf.espace(16);
  pdf.texte(`Fait le ${dateLongue(aujourdhui())}.`);
  return reponsePdf(await pdf.enregistrer("Cap PFMP · formation incluse"), `attestation-prise-en-main-${ctx.user.nom}.pdf`);
}
