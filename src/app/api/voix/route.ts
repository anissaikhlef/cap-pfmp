import { contexte } from "@/lib/auth";
import { transcrire, voixBranchee } from "@/lib/voix";

/** La voix de l'élève en texte, pour l'entraînement à l'entretien à l'oral (option du lycée). Le son n'est pas gardé. */
export async function POST(req: Request) {
  const ctx = await contexte({ roles: ["eleve", "professeur", "gestionnaire", "direction"] });
  if (!ctx.etab.reglages.agents.oral || !voixBranchee()) return new Response("L'oral n'est pas disponible : entraînez-vous par écrit.", { status: 403 });
  const son = await req.blob();
  if (!son.size || son.size > 3 * 1024 * 1024) return new Response("Enregistrement trop long : une minute au plus.", { status: 400 });
  const texte = await transcrire(son);
  if (!texte) return new Response("La voix n'a pas pu être reconnue : réessayez, ou écrivez votre réponse.", { status: 502 });
  return Response.json({ texte });
}
