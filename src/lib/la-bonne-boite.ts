import "server-only";
import type { CandidatLieu } from "./regles";

/**
 * « La bonne boîte » de France Travail (décision d'Anissa : « oui ») : les entreprises qui recrutent souvent dans un métier
 * (code ROME de la classe), autour du lycée. Il faut un accès à l'API, obtenu par Anissa sur francetravail.io : ses deux
 * codes vont dans les réglages de l'hébergement (FRANCE_TRAVAIL_ID, FRANCE_TRAVAIL_SECRET), jamais dans le code.
 *
 * À vérifier au branchement, avec la documentation reçue à l'inscription : l'adresse de l'API, le nom de l'accès (scope) et
 * les noms des paramètres. Ils se changent sans toucher au code (FRANCE_TRAVAIL_LBB_URL, FRANCE_TRAVAIL_SCOPE).
 * En cas d'erreur, Cap Partenaires continue avec l'annuaire du lycée et l'annuaire public.
 */
export const laBonneBoiteBranchee = () => !!(process.env.FRANCE_TRAVAIL_ID && process.env.FRANCE_TRAVAIL_SECRET);

const JETON_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
let jeton: { valeur: string; expire: number } | null = null;

async function jetonDAcces(): Promise<string | null> {
  if (jeton && jeton.expire > Date.now() + 30_000) return jeton.valeur;
  const r = await fetch(JETON_URL, {
    method: "POST", signal: AbortSignal.timeout(5000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: process.env.FRANCE_TRAVAIL_ID!, client_secret: process.env.FRANCE_TRAVAIL_SECRET!,
      scope: process.env.FRANCE_TRAVAIL_SCOPE || "api_labonneboitev2",
    }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  jeton = { valeur: j.access_token, expire: Date.now() + (j.expires_in ?? 600) * 1000 };
  return jeton.valeur;
}

/** La commune du lycée (code INSEE et position), d'après le nom de sa ville (geo.api.gouv.fr, gratuit et sans compte). */
async function commune(ville: string): Promise<{ code: string; lat: number; lon: number } | null> {
  const q = new URLSearchParams({ nom: ville, fields: "code,centre", boost: "population", limit: "1" });
  const r = await fetch(`https://geo.api.gouv.fr/communes?${q}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  const [c] = (await r.json()) as { code: string; centre?: { coordinates: [number, number] } }[];
  return c?.centre ? { code: c.code, lon: c.centre.coordinates[0], lat: c.centre.coordinates[1] } : null;
}

type Resultat = { company_name?: string; raison_sociale?: string; name?: string; city?: string; ville?: string; naf_label?: string; naf_text?: string };

/** Les entreprises de La bonne boîte pour un métier, à 30 km du lycée ; liste vide si l'accès n'est pas branché ou en cas d'erreur. */
export async function laBonneBoite(codeRome: string | null, ville: string | null): Promise<CandidatLieu[]> {
  if (!laBonneBoiteBranchee() || !codeRome || !ville) return [];
  try {
    const [acces, c] = await Promise.all([jetonDAcces(), commune(ville)]);
    if (!acces || !c) return [];
    const q = new URLSearchParams({ rome: codeRome, citycode: c.code, latitude: String(c.lat), longitude: String(c.lon), distance: "30", page_size: "5" });
    const base = process.env.FRANCE_TRAVAIL_LBB_URL || "https://api.francetravail.io/partenaire/labonneboite/v2/recherche";
    const r = await fetch(`${base}?${q}`, { signal: AbortSignal.timeout(5000), headers: { authorization: `Bearer ${acces}`, accept: "application/json" } });
    if (!r.ok) return [];
    const j = (await r.json()) as { items?: Resultat[]; companies?: Resultat[]; results?: Resultat[] };
    return (j.items ?? j.companies ?? j.results ?? []).map((x) => ({
      id: null, nom: x.company_name ?? x.raison_sociale ?? x.name ?? "", domaine: x.naf_label ?? x.naf_text ?? null, ville: x.city ?? x.ville ?? null,
      restantes: null, accueilliAvant: false, fiable: false, source: "bonne_boite" as const,
    })).filter((x) => x.nom).slice(0, 5);
  } catch {
    return [];
  }
}
