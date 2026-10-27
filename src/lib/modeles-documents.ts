import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ChampPdf, ModeleFige, Reglages, TypeModele } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { ageAu, aujourdhui } from "./dates";
import { lireFichier } from "./stockage";
import { choisirOption, JOURS_HORAIRES, SOURCES_SPECIALES } from "./modeles";
import { remplirPdf } from "./modeles-pdf";
import { fmtHeures, heuresHebdo, joursPrevus, plagesDuJour, SIGNATAIRES } from "./regles";

type Etab = { id: string; nom: string; reglages: Reglages; logoCle?: string | null };
export type Modele = typeof schema.modelesDocuments.$inferSelect;

/** Le modèle choisi par le lycée pour un document ; par défaut, le modèle Cap PFMP sans adaptation. */
export async function modeleDuLycee(etabId: string, type: TypeModele): Promise<Modele> {
  const [m] = await db.select().from(schema.modelesDocuments)
    .where(and(eq(schema.modelesDocuments.etablissementId, etabId), eq(schema.modelesDocuments.type, type))).limit(1);
  return m ?? { id: "", etablissementId: etabId, type, mode: "cap_pfmp", personnalisation: {}, pdfCle: null, pdfNom: null, champs: [], majLe: new Date(0), majParId: null };
}

/** Le PDF du lycée est-il utilisé pour ce document ? */
export function utiliseLePdf<M extends { mode: string; pdfCle: string | null }>(m: M): m is M & { pdfCle: string } {
  return m.mode === "pdf" && !!m.pdfCle;
}

/**
 * Le modèle d'une convention : celui figé à la première signature, sinon celui du lycée aujourd'hui.
 * Une convention signée ne change donc plus quand le lycée modifie son modèle.
 */
export async function modeleDeLaConvention(etab: Etab, cv: ContexteConvention): Promise<ModeleFige> {
  const fige = cv.s.modeles?.convention;
  if (fige) return fige;
  const m = await modeleDuLycee(etab.id, "convention");
  return { mode: m.mode, personnalisation: m.personnalisation, pdfCle: m.pdfCle, pdfNom: m.pdfNom, champs: m.champs, logoCle: etab.logoCle ?? null };
}

/** Fige le modèle de la convention à la première signature (sans effet s'il l'est déjà). */
export async function figerModeleConvention(etab: Etab, stageId: string) {
  const m = await modeleDuLycee(etab.id, "convention");
  const fige: ModeleFige = { mode: m.mode, personnalisation: m.personnalisation, pdfCle: m.pdfCle, pdfNom: m.pdfNom, champs: m.champs, logoCle: etab.logoCle ?? null };
  await db.update(schema.stages).set({ modeles: sql`${schema.stages.modeles} || jsonb_build_object('convention', ${JSON.stringify(fige)}::jsonb)` })
    .where(and(eq(schema.stages.id, stageId), sql`not (${schema.stages.modeles} ? 'convention')`));
}

/** Le logo du lycée, prêt à afficher (« data:image/… »), ou null. */
export async function logoDuLycee(etab: { logoCle?: string | null }): Promise<string | null> {
  if (!etab.logoCle) return null;
  try {
    const b = await lireFichier(etab.logoCle);
    return `data:${etab.logoCle.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
}

const jjmmaaaa = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const nombre = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** Toutes les données de la convention que l'on peut écrire dans le PDF du lycée, par clé (voir SOURCES_CONVENTION). */
export async function donneesConvention(etab: Etab, cv: ContexteConvention): Promise<Map<string, string | boolean>> {
  const ids = [cv.referentId, ...Object.values(cv.s.signatures).map((s) => s?.par)].filter((x): x is string => !!x);
  const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const ref = users.find((u) => u.id === cv.referentId);
  const age = ageAu(cv.e.dateNaissance, cv.p.debut);
  const t = cv.s.tuteur;
  const jours = joursPrevus(cv.s.horaires, cv.p.debut, cv.p.fin).length;
  const d = new Map<string, string | boolean>([
    ["eleve.nomPrenom", `${cv.e.nom} ${cv.e.prenom}`], ["eleve.nom", cv.e.nom], ["eleve.prenom", cv.e.prenom],
    ["eleve.dateNaissance", jjmmaaaa(cv.e.dateNaissance)], ["eleve.email", cv.e.email ?? ""],
    ["eleve.mineur", age !== null && age < 18], ["eleve.majeur", age !== null && age >= 18],
    ["classe.libelle", cv.c.libelle], ["classe.filiere", cv.c.filiere ?? ""],
    ["classe.classeEtFiliere", [cv.c.libelle, cv.c.filiere].filter(Boolean).join(" · ")], ["eleve.dominante", cv.dominante ?? ""],
    ["periode.libelle", cv.p.libelle], ["periode.debut", jjmmaaaa(cv.p.debut)], ["periode.fin", jjmmaaaa(cv.p.fin)],
    ["periode.jours", String(jours)], ["periode.semaines", nombre(Math.round((jours / 5) * 10) / 10)],
    ["periode.heuresHebdo", fmtHeures(heuresHebdo(cv.s.horaires))],
    ["entreprise.nom", cv.ent.nom], ["entreprise.adresse", [cv.ent.adresse, cv.ent.ville].filter(Boolean).join(", ")],
    ["entreprise.domaine", cv.ent.domaine ?? ""], ["entreprise.telephone", cv.ent.telephone ?? ""], ["entreprise.email", cv.ent.email ?? ""],
    ["entreprise.representant", cv.ent.representantNom ?? ""], ["entreprise.representantFonction", cv.ent.representantFonction ?? ""],
    ["entreprise.prive", cv.ent.secteur === "prive"], ["entreprise.public", cv.ent.secteur === "public"],
    ["tuteur.nom", t?.nom ?? ""], ["tuteur.fonction", t?.fonction ?? ""], ["tuteur.telephone", t?.telephone ?? ""], ["tuteur.email", t?.email ?? ""],
    ["referent.nom", ref ? `${ref.prenom} ${ref.nom}` : ""], ["referent.telephone", ref?.telephone ?? ""], ["referent.email", ref?.email ?? ""],
    ["etablissement.nom", etab.nom], ["aujourdhui", jjmmaaaa(aujourdhui())],
  ]);
  JOURS_HORAIRES.forEach((j, i) => {
    const plages = plagesDuJour(cv.s.horaires, i);
    const texte = (p: typeof plages) => p.map(([a, b]) => `${a} - ${b}`).join(" / ");
    d.set(`horaires.${j}`, texte(plages));
    d.set(`horaires.${j}.matin`, texte(plages.filter(([a]) => a < "12:00")));
    d.set(`horaires.${j}.apresMidi`, texte(plages.filter(([a]) => a >= "12:00")));
  });
  // Nom du signataire : celui qu'il a indiqué (lien personnel), sinon son compte, sinon la personne attendue.
  const attendu: Record<string, string> = {
    eleve: `${cv.e.prenom} ${cv.e.nom}`, entreprise: cv.ent.representantNom ?? "", tuteur: t?.nom ?? "", professeur: ref ? `${ref.prenom} ${ref.nom}` : "",
  };
  for (const { cle } of SIGNATAIRES) {
    const sig = cv.s.signatures[cle];
    const u = sig?.par ? users.find((x) => x.id === sig.par) : undefined;
    d.set(`signature.${cle}.nom`, sig ? sig.nom ?? (u ? `${u.prenom} ${u.nom}` : attendu[cle] ?? "") : "");
    d.set(`signature.${cle}.date`, sig ? jjmmaaaa(sig.le) : "");
  }
  return d;
}

/** Ce qui s'écrit dans un champ : donnée, texte fixe, complément de la famille ou de l'entreprise, ou rien. */
export function valeurDuChamp(champ: ChampPdf, donnees: Map<string, string | boolean>, complements: Record<string, string>): string | boolean | undefined {
  const s = champ.source;
  if (s === SOURCES_SPECIALES.vide) return undefined;
  if (s === SOURCES_SPECIALES.fixe) return champ.fixe ?? "";
  if (s === SOURCES_SPECIALES.coche) return true;
  if (s === SOURCES_SPECIALES.famille || s === SOURCES_SPECIALES.entreprise) {
    const v = complements[champ.nom];
    return champ.type === "case" ? v === "oui" : v === undefined ? undefined : champ.type === "liste" ? choisirOption(v, champ.options ?? []) ?? undefined : v;
  }
  const v = donnees.get(s);
  if (champ.type === "case") return typeof v === "boolean" ? v : undefined;
  if (typeof v !== "string") return undefined;
  if (champ.type === "liste") return choisirOption(v, champ.options ?? []) ?? undefined;
  return v;
}

/** La convention remplie dans le PDF du lycée, ou null si elle suit le modèle Cap PFMP. */
export async function pdfConvention(etab: Etab, cv: ContexteConvention, modele?: ModeleFige): Promise<Uint8Array | null> {
  const m = modele ?? (await modeleDeLaConvention(etab, cv));
  if (!utiliseLePdf(m)) return null;
  const donnees = await donneesConvention(etab, cv);
  const complements = cv.s.complements?.convention ?? {};
  const valeurs = new Map<string, string | boolean>();
  const signatures: { champ: string; image?: Uint8Array; mention?: string }[] = [];
  for (const champ of m.champs) {
    const v = valeurDuChamp(champ, donnees, complements);
    if (v !== undefined) valeurs.set(champ.nom, v);
    // La signature se place juste au-dessus du nom du signataire.
    const sig = champ.source.match(/^signature\.(\w+)\.nom$/);
    const s = sig ? cv.s.signatures[sig[1] as keyof typeof cv.s.signatures] : undefined;
    if (s && s.mode === "enligne") {
      const image = s.image ? await lireFichier(s.image).catch(() => null) : null;
      signatures.push(image ? { champ: champ.nom, image: new Uint8Array(image) } : { champ: champ.nom, mention: `Signé en ligne dans Cap PFMP le ${jjmmaaaa(s.le)}` });
    }
  }
  return remplirPdf(new Uint8Array(await lireFichier(m.pdfCle)), { valeurs, signatures });
}

/** Réponse HTTP pour un PDF généré : affiché dans le navigateur, jamais mis en cache. */
export function reponsePdf(octets: Uint8Array, nom: string) {
  return new Response(new Uint8Array(octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nom.replace(/[^\w.\- ]+/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
