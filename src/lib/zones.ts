import type { TypeModele, ZonePdf } from "@/db/schema";
import { SOURCES_CONVENTION } from "./modeles";
import { SIGNATAIRES } from "./regles";

/**
 * Zones placées d'un clic sur le PDF du lycée (même un PDF sans champs, décision d'Anissa : « chaque lycée a ses modèles
 * de documents ») : ce que Cap PFMP peut écrire dans chacune, selon le document. Fonctions pures, testées.
 */
export type SorteZone = "texte" | "croix" | "signature";
export type SourceZone = { cle: string; libelle: string; groupe: string; sorte: SorteZone };
/** Une zone qui reçoit un texte fixe, écrit par le lycée. */
export const ZONE_FIXE = "fixe";
export const MAX_ZONES = 300;

const t = (cle: string, libelle: string, groupe: string): SourceZone => ({ cle, libelle, groupe, sorte: "texte" });
const x = (cle: string, libelle: string, groupe: string): SourceZone => ({ cle, libelle, groupe, sorte: "croix" });
const s = (cle: string, libelle: string, groupe: string): SourceZone => ({ cle, libelle, groupe, sorte: "signature" });

const depuisConvention = (c: (typeof SOURCES_CONVENTION)[number]): SourceZone => ({ ...c, sorte: c.sorte === "case" ? "croix" : "texte" });
/** L'élève, la classe, la période, l'entreprise, le tuteur, le référent et le lycée : communs à tous les documents. */
const COMMUNES = SOURCES_CONVENTION.filter((c) => !c.cle.startsWith("horaires.") && !c.cle.startsWith("signature.")).map(depuisConvention);

const REMPLIE: [string, string][] = [["tuteur_eleve_professeur", "le tuteur, avec l'élève et le professeur"], ["tuteur_eleve", "le tuteur, avec l'élève"], ["tuteur", "le tuteur seul"]];
function remplissage(doc: "attestation" | "livret", g: string): SourceZone[] {
  return [
    t(`${doc}.rempliePar`, "Qui l'a rempli (en toutes lettres)", g),
    ...REMPLIE.map(([k, lib]) => x(`${doc}.rempliePar.${k}`, `Case « rempli par ${lib} »`, g)),
    t(`${doc}.professeur`, "Professeur présent : nom", g),
    t(`${doc}.signataire.nom`, "Personne qui signe pour l'entreprise : nom", g),
    t(`${doc}.signataire.fonction`, "Personne qui signe pour l'entreprise : fonction", g),
    t(`${doc}.date`, "Date de la signature", g),
    s(`${doc}.signature`, "Signature de l'entreprise", g),
  ];
}

/** Les grilles du lycée, pour proposer une zone par niveau de chaque critère (croix) ou le niveau retenu (texte). */
export type GrillesZones = {
  attitudes: { critere: string; niveaux: string[] }[];
  /** Compétences de chaque diplôme : la n-ième compétence occupe la même place sur le livret, quel que soit le diplôme. */
  competences: string[][];
  niveauxCompetences: string[];
  questions: string[];
};

function grille(prefixe: string, g: string, lignes: { libelle: string; niveaux: string[] }[]): SourceZone[] {
  return lignes.flatMap((l, i) => [
    t(`${prefixe}.${i}`, `${l.libelle} : niveau retenu`, g),
    ...l.niveaux.map((n, j) => x(`${prefixe}.${i}.${j}`, `${l.libelle} : case « ${n} »`, g)),
  ]);
}

/** Tout ce que Cap PFMP peut écrire dans une zone du PDF du lycée, pour un document. */
export function sourcesZones(type: TypeModele, g: GrillesZones): SourceZone[] {
  if (type === "convention") return [...SOURCES_CONVENTION.map(depuisConvention), ...SIGNATAIRES.map((x) => s(`signature.${x.cle}`, `${x.libelle} : signature`, "Signatures"))];
  if (type === "attestation") {
    const A = "Attestation";
    return [...COMMUNES,
      t("attestation.joursEffectues", "Jours de stage effectués", A), t("attestation.joursAbsence", "Jours d'absence", A),
      t("attestation.activites", "Activités réalisées", A), t("attestation.appreciation", "Appréciation du tuteur", A),
      ...remplissage("attestation", A)];
  }
  if (type === "livret") {
    const L = "Livret";
    const nb = Math.max(0, ...g.competences.map((c) => c.length));
    const competences = Array.from({ length: nb }, (_, i) => ({
      libelle: `Compétence ${i + 1} (${[...new Set(g.competences.map((c) => c[i]).filter(Boolean))].join(" ; ").slice(0, 80)})`, niveaux: g.niveauxCompetences,
    }));
    return [...COMMUNES,
      t("livret.bilan", "Bilan du tuteur", L), t("livret.carnet", "Carnet de bord de l'élève (jour par jour)", L),
      ...remplissage("livret", L),
      ...grille("livret.att", "Attitudes professionnelles", g.attitudes.map((a) => ({ libelle: a.critere, niveaux: a.niveaux }))),
      ...grille("livret.comp", "Compétences du diplôme", competences)];
  }
  const O = "Ordre de mission", V = "Visite", C = "Compte rendu";
  return [...COMMUNES,
    t("om.visiteur", "Professeur qui visite : nom", O), t("om.transport", "Mode de transport (en toutes lettres)", O),
    x("om.transport.vehicule", "Case « véhicule personnel »", O), x("om.transport.commun", "Case « transport en commun »", O),
    t("om.signataire", "Signé avant la visite par : nom", O), t("om.date", "Date de la signature avant la visite", O),
    s("om.signature", "Signature avant la visite (mention de signature en ligne)", O),
    t("appel.date", "Appel de la première semaine : date", "Appel au tuteur"), t("appel.par", "Appel : passé par", "Appel au tuteur"),
    t("appel.commentaire", "Appel : commentaire", "Appel au tuteur"),
    ...g.questions.flatMap((q, i) => [
      t(`appel.q.${i}`, `${q} (oui ou non)`, "Appel au tuteur"),
      x(`appel.q.${i}.oui`, `${q} : case « oui »`, "Appel au tuteur"), x(`appel.q.${i}.non`, `${q} : case « non »`, "Appel au tuteur"),
    ]),
    t("visite.date", "Date de la visite", V), t("visite.heure", "Heure de la visite", V), t("visite.mode", "Sur place ou à distance", V),
    t("cachet.nom", "Personne qui signe pour l'entreprise visitée : nom", V), t("cachet.qualite", "Personne qui signe pour l'entreprise visitée : qualité", V),
    t("cachet.date", "Date de la signature de l'entreprise visitée", V), s("cachet.signature", "Signature de l'entreprise visitée", V),
    t("cr.personne", "Personne rencontrée", C), t("cr.observations", "Commentaires sur le stagiaire", C),
    t("cr.adequation", "Activités en adéquation avec la formation (en toutes lettres)", C),
    x("cr.adequation.oui", "Adéquation : case « oui »", C), x("cr.adequation.en_partie", "Adéquation : case « en partie »", C), x("cr.adequation.non", "Adéquation : case « non »", C),
    t("cr.commentaireEntreprise", "Commentaires sur l'entreprise", C),
    ...grille("cr.att", "Attitudes professionnelles (compte rendu)", g.attitudes.map((a) => ({ libelle: a.critere, niveaux: a.niveaux }))),
  ];
}

/**
 * Les zones envoyées par l'éditeur, vérifiées : une page qui existe, un rectangle dans la page (arrondi au point),
 * une donnée proposée pour ce document, ou un texte fixe. Renvoie un message d'erreur, ou les zones.
 */
export function zonesValables(brut: unknown, sources: SourceZone[], pages: { l: number; h: number }[]): ZonePdf[] | string {
  if (!Array.isArray(brut)) return "Zones illisibles : rechargez la page.";
  if (brut.length > MAX_ZONES) return `Au plus ${MAX_ZONES} zones par document.`;
  const cles = new Set(sources.map((x) => x.cle));
  const res: ZonePdf[] = [];
  for (const z of brut as Record<string, unknown>[]) {
    const page = Number(z?.page);
    const p = pages[page - 1];
    if (!Number.isInteger(page) || !p) return "Une zone est placée sur une page qui n'existe pas.";
    const [zx, zy, l, h] = ["x", "y", "l", "h"].map((k) => Math.round(Number(z[k]) * 10) / 10);
    if (![zx, zy, l, h].every(Number.isFinite) || l < 4 || h < 4 || zx < 0 || zy < 0 || zx + l > p.l + 1 || zy + h > p.h + 1) return `Une zone de la page ${page} dépasse de la page ou est trop petite.`;
    const source = String(z.source ?? "");
    if (source === ZONE_FIXE) {
      const fixe = String(z.fixe ?? "").trim().slice(0, 300);
      if (!fixe) return `Écrivez le texte fixe de la zone de la page ${page}, ou supprimez-la.`;
      res.push({ page, x: zx, y: zy, l, h, source, fixe });
    } else {
      if (!cles.has(source)) return `Choisissez ce que Cap PFMP écrit dans chaque zone (page ${page}).`;
      res.push({ page, x: zx, y: zy, l, h, source });
    }
  }
  return res;
}
