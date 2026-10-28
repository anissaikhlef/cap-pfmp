import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { completerReglages } from "@/db/schema";
import { PLAFONDS_PAR_DEFAUT as PLAFONDS_VIDES, TARIFS_PAR_DEFAUT as TARIFS_VIDES } from "./plateforme";
import type { Contexte } from "./auth";
import { demanderIA } from "./ia";
import { envoyer } from "./messages";
import { adresseDuSite } from "./liens";
import { concerneLesPfmp, liensDePage, texteDePage } from "./agents";
import { legifranceBranche, textesLegifrance } from "./legifrance";

/**
 * Agent 2, au choix du lycée : Cap Veille, la veille réglementaire (décision d'Anissa : « une alerte avec un résumé et le
 * lien vers le texte officiel, et des propositions de changements dans Cap PFMP, validées par une personne avant de
 * s'appliquer »). L'administration de Cap PFMP repère le texte officiel ; Cap Veille le résume et propose les changements ;
 * l'administration relit et publie l'alerte ; chaque lycée qui a choisi Cap Veille décide de chaque proposition.
 */
const SCHEMA_ALERTE = {
  type: "object", additionalProperties: false, required: ["resume", "propositions"],
  properties: { resume: { type: "string" }, propositions: { type: "array", items: { type: "string" } } },
};
const Alerte = z.object({ resume: z.string().trim().min(20).max(3000), propositions: z.array(z.string().trim().min(5).max(500)).max(8) });

/** Cap Veille lit un texte officiel et prépare l'alerte (non publiée : l'administration la relit d'abord). */
export async function preparerAlerte(parId: string | null, a: { titre: string; source: string; texte: string }) {
  const r = await demanderIA(null, {
    agent: "veille", objet: "Alerte de veille réglementaire", effort: "medium",
    consignes: "Tu fais la veille réglementaire des périodes de formation en milieu professionnel (PFMP) pour les lycées professionnels. À partir du seul texte officiel fourni, écris un résumé de 5 à 8 lignes pour la direction et le DDFPT d'un lycée : ce qui change, pour qui, à partir de quand. Puis liste les changements concrets à prévoir dans l'organisation du lycée ou dans Cap PFMP (convention, durée des stages, allocation, signatures, relances…). Si le texte ne concerne pas les PFMP, dis-le dans le résumé et ne propose rien. N'invente aucune date ni aucun chiffre.",
    demande: `Titre : ${a.titre}\nSource : ${a.source}\nTexte officiel :\n"""\n${a.texte}\n"""`,
    schema: SCHEMA_ALERTE, verifier: (x) => Alerte.safeParse(x).data ?? null,
    exemple: () => ({
      resume: `${a.texte.replace(/\s+/g, " ").slice(0, 600)}${a.texte.length > 600 ? "…" : ""}`,
      propositions: ["Vérifier si le modèle de convention du lycée doit être mis à jour.", "Informer l'équipe pédagogique lors du prochain conseil."],
    }),
  });
  if (!r.ok) return r;
  const [al] = await db.insert(schema.alertesVeille).values({
    titre: a.titre, source: a.source, resume: r.valeur.resume, propositions: r.valeur.propositions, simule: r.simule, creeParId: parId,
  }).returning();
  return { ok: true as const, alerte: al };
}

/** Publie une alerte relue : elle arrive chez chaque lycée qui a Cap Veille, avec un mail à la direction et à la gestion des PFMP. */
export async function publierAlerte(id: string) {
  const [al] = await db.update(schema.alertesVeille).set({ publieeLe: new Date() })
    .where(and(eq(schema.alertesVeille.id, id), isNull(schema.alertesVeille.publieeLe))).returning();
  if (!al) return 0;
  const base = await adresseDuSite();
  const etabs = (await db.select().from(schema.etablissements).where(isNull(schema.etablissements.entrainementDeId)))
    .filter((e) => completerReglages(e.reglages).agents.veille);
  let n = 0;
  for (const etab of etabs) {
    const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etab.id), eq(schema.users.actif, true),
      sql`(${schema.users.roles} && array['direction','gestionnaire']::text[])`));
    for (const u of equipe) {
      await envoyer({ etab }, {
        canal: "mail", destinataire: u.email, sujet: `Cap Veille : ${al.titre}`,
        corps: `Bonjour ${u.prenom},\n\nCap Veille, l'agent de veille réglementaire de Cap PFMP, signale un texte officiel :\n\n${al.titre}\n${al.source}\n\n${al.resume}\n\nLes changements proposés vous attendent dans Cap PFMP : rien ne s'applique sans votre décision.\n${base}/veille\n\nCap PFMP`,
      });
      n++;
    }
  }
  return n;
}

/** Les alertes publiées, avec ce que le lycée en a fait. */
export async function alertesDuLycee(ctx: Contexte) {
  return db.select({ a: schema.alertesVeille, s: schema.suitesVeille }).from(schema.alertesVeille)
    .leftJoin(schema.suitesVeille, and(eq(schema.suitesVeille.alerteId, schema.alertesVeille.id), eq(schema.suitesVeille.etablissementId, ctx.etab.id)))
    .where(isNotNull(schema.alertesVeille.publieeLe))
    .orderBy(desc(schema.alertesVeille.publieeLe)).limit(50);
}

/** Le nombre d'alertes publiées que le lycée n'a pas encore lues. */
export async function alertesNonLues(ctx: Contexte) {
  return (await alertesDuLycee(ctx)).filter((x) => !x.s?.lueLe).length;
}

/**
 * Les pages lues chaque semaine quand l'administration n'en a pas choisi : aucune. Le site du ministère refuse la lecture
 * automatique du Bulletin officiel (réponse 403) ; on ne le contourne pas : Légifrance et le bulletin du jeudi le remplacent.
 */
export const PAGES_VEILLE_PAR_DEFAUT: string[] = [];
const UNE_SEMAINE_MS = 7 * 24 * 3600 * 1000;
/** Au plus ce nombre de nouveaux textes lus à chaque passage (chacun est une demande à l'IA). */
const MAX_TEXTES = 5;

/** Lit une page officielle ; en cas d'échec, dit pourquoi en mots simples (pour l'administration). */
async function lire(url: string): Promise<{ texte: string } | { raison: string }> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15000), redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CapPFMP-Veille/1.0; veille reglementaire des PFMP)",
        accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "fr-FR,fr;q=0.9",
      },
    });
    if (r.ok) return { texte: await r.text() };
    if (r.status === 404 || r.status === 410) return { raison: `page introuvable (réponse ${r.status}) : l'adresse a changé` };
    if (r.status === 401 || r.status === 403 || r.status === 429) return { raison: `le site refuse la lecture automatique (réponse ${r.status})` };
    return { raison: `le site a répondu par une erreur (réponse ${r.status})` };
  } catch (e) {
    const nom = e instanceof Error ? e.name : "";
    if (nom === "TimeoutError" || nom === "AbortError") return { raison: "le site n'a pas répondu à temps" };
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : e instanceof Error ? e.message : String(e);
    return { raison: `connexion impossible (${cause.slice(0, 120)})` };
  }
}

/**
 * Le passage de Cap Veille sur les sources officielles : une fois par semaine (tâche quotidienne), ou tout de suite depuis
 * l'administration. Les textes nouveaux qui parlent des stages deviennent des alertes à relire, jamais publiées seules ;
 * l'administration de Cap PFMP est prévenue par mail.
 */
export async function veilleDeLaSemaine(opts: { maintenant?: boolean } = {}) {
  const [p] = await db.select().from(schema.plateforme).where(eq(schema.plateforme.id, "cap-pfmp")).limit(1);
  if (!opts.maintenant && p?.veilleLe && Date.now() - p.veilleLe.getTime() < UNE_SEMAINE_MS) return null;
  const pages = p?.veillePages.length ? p.veillePages : PAGES_VEILLE_PAR_DEFAUT;
  const vus = new Set(p?.veilleVus ?? []);
  const dejaAlertes = new Set((await db.select({ s: schema.alertesVeille.source }).from(schema.alertesVeille)).map((x) => x.s));
  let lues = 0, trouves = 0, preparees = 0, liens = 0, surLesStages = 0;
  let erreur: string | null = null;
  const echecs: string[] = [];
  for (const page of pages) {
    const lu = await lire(page);
    if ("raison" in lu) { echecs.push(`${page} : ${lu.raison}`); continue; }
    lues++;
    const tous = liensDePage(lu.texte, page);
    liens += tous.length;
    const stages = tous.filter((l) => concerneLesPfmp(l.titre));
    surLesStages += stages.length;
    const nouveaux = stages.filter((l) => !vus.has(l.url) && !dejaAlertes.has(l.url));
    trouves += nouveaux.length;
    for (const l of nouveaux.slice(0, Math.max(0, MAX_TEXTES - preparees))) {
      const html = await lire(l.url);
      const texte = "texte" in html ? texteDePage(html.texte) : "";
      if (texte.length < 200) continue;
      const r = await preparerAlerte(null, { titre: l.titre.slice(0, 200), source: l.url, texte });
      if (!r.ok) { erreur = r.erreur; break; }
      vus.add(l.url);
      preparees++;
    }
    if (erreur) break;
  }
  // Légifrance (Journal officiel), quand l'accès est branché : les textes publiés depuis le dernier passage.
  if (legifranceBranche() && !erreur) {
    const depuis = (p?.veilleLe ?? new Date(Date.now() - UNE_SEMAINE_MS)).toISOString().slice(0, 10);
    const lf = await textesLegifrance(depuis);
    if ("raison" in lf) echecs.push(`Légifrance : ${lf.raison}`);
    else {
      lues++;
      liens += lf.length;
      const stages = lf.filter((t) => concerneLesPfmp(t.titre) || concerneLesPfmp(t.texte.slice(0, 2000)));
      surLesStages += stages.length;
      const nouveaux = stages.filter((t) => !vus.has(t.url) && !dejaAlertes.has(t.url));
      trouves += nouveaux.length;
      for (const t of nouveaux.slice(0, Math.max(0, MAX_TEXTES - preparees))) {
        const r = await preparerAlerte(null, { titre: t.titre.slice(0, 200), source: t.url, texte: t.texte });
        if (!r.ok) { erreur = r.erreur; break; }
        vus.add(t.url);
        preparees++;
      }
    }
  }
  const veilleVus = [...vus].slice(-1000);
  await db.insert(schema.plateforme).values({ id: "cap-pfmp", tarifs: TARIFS_VIDES, plafonds: PLAFONDS_VIDES, veilleVus, veilleLe: new Date() })
    .onConflictDoUpdate({ target: schema.plateforme.id, set: { veilleVus, veilleLe: new Date() } });
  if (preparees) {
    const admins = await db.select().from(schema.users).where(and(eq(schema.users.actif, true), sql`${schema.users.roles} @> array['admin']::text[]`));
    const base = await adresseDuSite();
    for (const u of admins) {
      if (!u.etablissementId) continue;
      await envoyer({ etab: { id: u.etablissementId } }, {
        canal: "mail", destinataire: u.email, sujet: `Cap Veille : ${preparees} texte(s) officiel(s) à relire`,
        corps: `Bonjour ${u.prenom},\n\nCap Veille a lu les sources officielles et préparé ${preparees} alerte(s) sur les stages. Relisez-les avant de les publier :\n${base}/admin/veille\n\nCap PFMP`,
      });
    }
  }
  return { pages: pages.length, legifrance: legifranceBranche(), lues, liens, surLesStages, trouves, preparees, erreur, echecs };
}
