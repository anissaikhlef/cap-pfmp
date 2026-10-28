import "server-only";

/**
 * Légifrance, par son accès officiel pour les logiciels (décision d'Anissa : option 3, « Légifrance automatiquement et le
 * bulletin du jeudi »). Anissa s'inscrit sur piste.gouv.fr, souscrit à l'API Légifrance et met ses deux codes dans les
 * réglages de l'hébergement (LEGIFRANCE_ID, LEGIFRANCE_SECRET), jamais dans le code.
 *
 * À vérifier au branchement, avec la documentation de PISTE : l'adresse de l'API et la forme de la recherche. L'adresse se
 * change sans toucher au code (LEGIFRANCE_URL). En cas d'erreur, Cap Veille continue avec les autres sources.
 */
export const legifranceBranche = () => !!(process.env.LEGIFRANCE_ID && process.env.LEGIFRANCE_SECRET);

/** Les recherches faites chaque semaine dans le Journal officiel. */
export const RECHERCHES_LEGIFRANCE = ["période de formation en milieu professionnel", "lycéens de la voie professionnelle", "baccalauréat professionnel"];

let jeton: { valeur: string; expire: number } | null = null;

async function jetonDAcces(): Promise<string | null> {
  if (jeton && jeton.expire > Date.now() + 30_000) return jeton.valeur;
  const r = await fetch("https://oauth.piste.gouv.fr/api/oauth/token", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.LEGIFRANCE_ID!, client_secret: process.env.LEGIFRANCE_SECRET!, scope: "openid" }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  jeton = { valeur: j.access_token, expire: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return jeton.valeur;
}

type Resultat = { id?: string; title?: string; titles?: { id?: string; cid?: string; title?: string }[]; text?: string; sections?: { title?: string; extracts?: { values?: string[] }[] }[] };

/** Les textes du Journal officiel publiés depuis une date, qui répondent aux recherches ; liste vide si non branché ou en erreur. */
export async function textesLegifrance(depuis: string): Promise<{ url: string; titre: string; texte: string }[] | { raison: string }> {
  if (!legifranceBranche()) return [];
  try {
    const acces = await jetonDAcces();
    if (!acces) return { raison: "Légifrance refuse les codes d'accès (à vérifier sur piste.gouv.fr)" };
    const base = process.env.LEGIFRANCE_URL || "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";
    const vus = new Map<string, { url: string; titre: string; texte: string }>();
    for (const valeur of RECHERCHES_LEGIFRANCE) {
      const r = await fetch(`${base}/search`, {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${acces}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          fond: "JORF",
          recherche: {
            champs: [{ typeChamp: "ALL", operateur: "ET", criteres: [{ typeRecherche: "EXACTE", valeur, operateur: "ET" }] }],
            filtres: [{ facette: "DATE_PUBLICATION", dates: { start: depuis, end: new Date().toISOString().slice(0, 10) } }],
            pageNumber: 1, pageSize: 10, sort: "PUBLICATION_DATE_DESC", typePagination: "DEFAUT", operateur: "ET",
          },
        }),
      });
      if (!r.ok) return { raison: `Légifrance a répondu par une erreur (réponse ${r.status})` };
      const j = (await r.json()) as { results?: Resultat[] };
      for (const x of j.results ?? []) {
        const t = x.titles?.[0];
        const id = t?.cid ?? t?.id ?? x.id;
        const titre = (t?.title ?? x.title ?? "").replace(/<[^>]+>/g, "").trim();
        if (!id || !titre || vus.has(id)) continue;
        const extraits = (x.sections ?? []).flatMap((s) => [s.title ?? "", ...(s.extracts ?? []).flatMap((e) => e.values ?? [])]).join("\n").replace(/<[^>]+>/g, "");
        vus.set(id, { url: `https://www.legifrance.gouv.fr/jorf/id/${id}`, titre, texte: [titre, x.text ?? "", extraits].filter(Boolean).join("\n\n").slice(0, 30000) });
      }
    }
    return [...vus.values()];
  } catch (e) {
    return { raison: `Légifrance n'a pas répondu (${e instanceof Error ? e.message.slice(0, 80) : "erreur"})` };
  }
}
