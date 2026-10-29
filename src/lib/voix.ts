import "server-only";

/**
 * Entraînement à l'entretien à l'oral (décision d'Anissa) : la voix de l'élève devient du texte grâce à un service de
 * reconnaissance vocale hébergé en Europe, que le lycée paie s'il prend l'option (« Agents IA »). Le service se branche
 * dans l'hébergement : CAP_PFMP_VOIX_URL (adresse qui reçoit le son et répond { "texte": "…" }) et CAP_PFMP_VOIX_CLE.
 * Sans lui, l'entraînement se fait par écrit.
 */
export const voixBranchee = () => !!process.env.CAP_PFMP_VOIX_URL && !!process.env.CAP_PFMP_VOIX_CLE;

export async function transcrire(son: Blob): Promise<string | null> {
  if (!voixBranchee()) return null;
  try {
    const r = await fetch(process.env.CAP_PFMP_VOIX_URL!, {
      method: "POST", body: son, signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${process.env.CAP_PFMP_VOIX_CLE}`, "content-type": son.type || "audio/webm", "accept-language": "fr-FR" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { texte?: unknown };
    return typeof j.texte === "string" ? j.texte.slice(0, 1200) : null;
  } catch {
    return null;
  }
}
