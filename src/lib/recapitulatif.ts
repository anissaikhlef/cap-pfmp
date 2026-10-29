import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { a, gereToutLEtablissement } from "./acces";
import { aujourdhui, dateLongue } from "./dates";
import { lisible } from "./modeles-pdf";
import {
  anneeDExamen, dureeDuCycle, joursEffectues, regrouperPfmp, semainesAttendues, semainesDeJours, sessionDExamen, texteDuree, titreDuDiplome,
} from "./regles";
import { lireFichier } from "./stockage";
import { casesManquantes, jourExcel, remplirRecapitulatif } from "./xlsx-modele";
import { classeurXlsx } from "./xlsx";

/**
 * Attestation récapitulative des PFMP, pour les classes d'examen (décisions d'Anissa) : le fichier Excel de l'académie,
 * déposé par le lycée et rempli par Cap PFMP, et la même attestation au format Cap PFMP (Excel et PDF).
 * Ne comptent que les PFMP déjà effectuées et attestées (attestation de stage validée), sur tout le cycle de l'élève.
 * La préparent la direction, le DDFPT et le professeur référent de la classe ; seule la direction vise.
 */

/** Peut préparer l'attestation récapitulative d'une classe d'examen : la direction, la gestion des PFMP, le référent de la classe. */
export async function classesDuRecapitulatif(ctx: Contexte) {
  const rows = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(asc(schema.classes.libelle));
  return rows.filter((c) => anneeDExamen(c) && (gereToutLEtablissement(ctx) || (a(ctx, "professeur") && c.referentId === ctx.user.id)));
}

/** Seule la direction vise l'attestation (« en apposant une croix, l'attestation est reconnue être visée par le chef d'établissement »). */
export const peutViser = (ctx: Contexte) => a(ctx, "direction");

export type PfmpAttestee = { stageId: string; classe: string; periode: string; debut: string; fin: string; entreprise: string; adresse: string; jours: number; declares: boolean };
export type PfmpEnAttente = { classe: string; periode: string; debut: string; fin: string; entreprise: string; raison: string };
export type CandidatRecap = {
  id: string; nom: string; prenom: string; numero: string; derogation: boolean;
  /** Durée du cycle en années, et si elle est propre à l'élève. */
  duree: number; dureePropre: boolean;
  attendues: number | null;
  pfmp: PfmpAttestee[];
  /** Terminées mais pas encore attestées : elles ne comptent pas. */
  nonAttestees: PfmpEnAttente[];
  /** En cours ou à venir : elles ne comptent pas encore. */
  aVenir: PfmpEnAttente[];
  jours: number; semaines: number;
  visa: { le: Date; par: string } | null;
};
export type Recapitulatif = {
  classe: typeof schema.classes.$inferSelect; formation: string; titre: string; session: string; academie: string; etablissement: string;
  candidats: CandidatRecap[];
};

/** Les élèves de la classe, par ordre alphabétique (comme le demande le fichier de l'académie), avec leurs PFMP de tout le cycle. */
export async function recapitulatif(ctx: Contexte, classeId: string): Promise<Recapitulatif | null> {
  const classe = (await classesDuRecapitulatif(ctx)).find((c) => c.id === classeId);
  if (!classe) return null;
  const [formation] = classe.formationId ? await db.select().from(schema.formations)
    .where(and(eq(schema.formations.id, classe.formationId), eq(schema.formations.etablissementId, ctx.etab.id))).limit(1) : [];
  const libelle = formation?.libelle ?? classe.filiere ?? classe.libelle;
  const eleves = await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.eleves.classeId, classe.id), eq(schema.eleves.archive, false)));
  eleves.sort((x, y) => x.nom.localeCompare(y.nom, "fr") || x.prenom.localeCompare(y.prenom, "fr"));
  const ids = eleves.map((e) => e.id);
  const stages = ids.length ? await db.select({ s: schema.stages, p: schema.periodes, c: schema.classes, ent: schema.entreprises }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(inArray(schema.stages.eleveId, ids), eq(schema.classes.etablissementId, ctx.etab.id)))
    .orderBy(asc(schema.periodes.debut)) : [];
  const stageIds = stages.map((x) => x.s.id);
  const [absences, attestations] = stageIds.length ? await Promise.all([
    db.select().from(schema.absences).where(inArray(schema.absences.stageId, stageIds)),
    db.select().from(schema.documents).where(and(inArray(schema.documents.stageId, stageIds), eq(schema.documents.type, "attestation"), eq(schema.documents.etablissementId, ctx.etab.id)))
      .orderBy(desc(schema.documents.deposeLe)),
  ]) : [[], []];
  const viseurs = new Map((await db.select({ id: schema.users.id, prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.users)
    .where(inArray(schema.users.id, [...new Set(eleves.map((e) => e.visaRecapParId).filter((x): x is string => !!x)), "00000000-0000-0000-0000-000000000000"])))
    .map((u) => [u.id, `${u.prenom} ${u.nom}`]));
  const jour = aujourdhui();
  const candidats = eleves.map((e): CandidatRecap => {
    const duree = dureeDuCycle(e.dureeCycle, formation?.dureeCycle, libelle, classe.niveau);
    const r: CandidatRecap = {
      id: e.id, nom: e.nom, prenom: e.prenom, numero: e.numeroCandidat ?? "", derogation: e.derogation, duree, dureePropre: e.dureeCycle !== null,
      attendues: semainesAttendues(formation?.semainesAttendues, libelle, duree), pfmp: [], nonAttestees: [], aVenir: [], jours: 0, semaines: 0,
      visa: e.visaRecapLe ? { le: e.visaRecapLe, par: viseurs.get(e.visaRecapParId ?? "") ?? "la direction" } : null,
    };
    for (const { s, p, c, ent } of stages.filter((x) => x.s.eleveId === e.id)) {
      const base = { classe: c.libelle, periode: p.libelle, debut: p.debut, fin: p.fin, entreprise: ent.nom };
      if (p.fin >= jour) { r.aVenir.push({ ...base, raison: p.debut > jour ? "à venir" : "en cours" }); continue; }
      const docs = attestations.filter((d) => d.stageId === s.id);
      const valide = docs.find((d) => d.statut === "valide");
      if (!valide) {
        r.nonAttestees.push({ ...base, raison: !docs.length ? "attestation de stage attendue" : docs[0].statut === "refuse" ? "attestation refusée" : "attestation à vérifier" });
        continue;
      }
      // Jours : ceux que l'entreprise a déclarés dans l'attestation en ligne, sinon les jours prévus moins les absences.
      const declares = !!s.attestation && s.attestation.documentId === valide.id;
      const jours = declares ? s.attestation!.joursEffectues : joursEffectues(s.horaires, p.debut, p.fin, absences.filter((x) => x.stageId === s.id), p.fin).effectues;
      r.pfmp.push({ ...base, stageId: s.id, adresse: [ent.adresse, ent.ville].filter(Boolean).join(", "), jours, declares });
    }
    r.jours = r.pfmp.reduce((t, x) => t + x.jours, 0);
    r.semaines = semainesDeJours(r.jours);
    return r;
  });
  return {
    classe, formation: libelle, titre: titreDuDiplome(libelle), session: sessionDExamen(ctx.etab.anneeScolaire),
    academie: ctx.etab.reglages.academie ?? "", etablissement: [ctx.etab.nom, ctx.etab.ville].filter(Boolean).join(" – "), candidats,
  };
}

/** Ce qui manque encore, élève par élève, avant d'envoyer l'attestation à l'académie. */
export function pointsAVerifier(c: CandidatRecap): string[] {
  const p: string[] = [];
  if (!c.numero) p.push("numéro de candidat à indiquer");
  for (const x of c.nonAttestees) p.push(`${x.periode} (${x.classe}, ${x.entreprise}) : ${x.raison}, elle ne compte pas`);
  if (c.attendues !== null && c.semaines < c.attendues) p.push(`${Math.round((c.attendues - c.semaines) * 10) / 10} semaine(s) manquante(s) sur ${c.attendues}${c.derogation ? " (dérogation demandée)" : ""}`);
  return p;
}

export const modeleRecapitulatif = async (etabId: string) =>
  (await db.select().from(schema.modelesRecapitulatifs).where(eq(schema.modelesRecapitulatifs.etablissementId, etabId)).limit(1))[0] ?? null;

const lignesDe = (c: CandidatRecap) => c.pfmp.map((x) => ({ debut: x.debut, fin: x.fin, entreprise: [x.entreprise, x.adresse].filter(Boolean).join("\n"), jours: x.jours }));

/** Le fichier de l'académie, rempli : ou un message si le lycée ne l'a pas déposé, ou s'il ne convient pas. */
export async function fichierAcademie(ctx: Contexte, r: Recapitulatif): Promise<Buffer | string> {
  const m = await modeleRecapitulatif(ctx.etab.id);
  if (!m) return "Le fichier de l'académie n'est pas encore déposé (Organisation, « Attestation récapitulative »).";
  const manque = casesManquantes(m.structure);
  if (manque.length) return `Le fichier de l'académie n'est pas prêt : indiquez ${manque.join(", ")} (Organisation, « Attestation récapitulative »).`;
  const nb = m.structure.lignes?.nombre ?? 5;
  try {
    return remplirRecapitulatif(await lireFichier(m.cle), m.structure, {
      titre: r.titre, academie: r.academie, session: r.session, etablissement: r.etablissement,
      candidats: r.candidats.map((c) => ({
        numero: c.numero, nom: c.nom, prenom: c.prenom, duree: texteDuree(c.duree), derogation: c.derogation, visa: !!c.visa,
        semaines: c.semaines, attendues: c.attendues,
        pfmp: regrouperPfmp(lignesDe(c), nb).map((x) => ({ debut: jourExcel(x.debut), fin: jourExcel(x.fin), entreprise: x.entreprise, jours: x.jours })),
      })),
    });
  } catch (e) {
    return e instanceof Error ? e.message : "Le fichier de l'académie n'a pas pu être rempli.";
  }
}

const enClair = (iso: string) => iso.split("-").reverse().join("/");
const observations = (c: CandidatRecap) => pointsAVerifier(c).join(" ; ");

/** La même attestation au format Cap PFMP, en Excel : un onglet par candidat et par classe, un onglet du détail des PFMP. */
export function classeurRecapitulatif(r: Recapitulatif, ctx: Contexte): Uint8Array {
  const sous = `${ctx.etab.nom} · ${r.classe.libelle} · ${r.titre} · session ${r.session}${r.academie ? ` · académie de ${r.academie}` : ""} · éditée le ${dateLongue(aujourdhui())}`;
  return classeurXlsx([
    {
      onglet: "Synthèse", titre: "Attestation récapitulative des PFMP", sousTitre: sous,
      colonnes: ["N° candidat", "Nom", "Prénom", "Durée du cycle", "Dérogation", "Jours attestés", "Semaines", "Semaines attendues", "Visa du chef d'établissement", "Observations"],
      lignes: r.candidats.map((c) => [c.numero, c.nom, c.prenom, texteDuree(c.duree), c.derogation ? "OUI" : "NON", c.jours, c.semaines, c.attendues ?? "", c.visa ? `visé le ${enClair(c.visa.le.toISOString().slice(0, 10))}` : "", observations(c)]),
    },
    {
      onglet: "PFMP attestées", titre: "PFMP effectuées et attestées", sousTitre: sous,
      colonnes: ["N° candidat", "Nom", "Prénom", "Classe", "Période", "Début", "Fin", "Entreprise", "Adresse", "Jours de présence", "Jours déclarés par l'entreprise"],
      lignes: r.candidats.flatMap((c) => c.pfmp.map((x) => [c.numero, c.nom, c.prenom, x.classe, x.periode, enClair(x.debut), enClair(x.fin), x.entreprise, x.adresse, x.jours, x.declares ? "oui" : "non (calculés)"])),
    },
  ]);
}

/* ------------------- PDF ------------------- */

const L = 595, H = 842, M = 40;
const NOIR = rgb(0.08, 0.1, 0.14), GRIS = rgb(0.38, 0.4, 0.45), FOND = rgb(0.95, 0.96, 0.97), ENTETE = rgb(0.11, 0.2, 0.33), ROUGE = rgb(0.62, 0.12, 0.12);

function couper(f: PDFFont, texte: string, taille: number, largeur: number): string[] {
  const res: string[] = [];
  for (const para of lisible(f, texte).split("\n")) {
    let ligne = "";
    for (const mot of para.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (f.widthOfTextAtSize(essai, taille) <= largeur || !ligne) ligne = essai;
      else { res.push(ligne); ligne = mot; }
    }
    res.push(ligne);
  }
  return res;
}

type Polices = { police: PDFFont; gras: PDFFont };
/** Un tableau simple : en-tête foncé, lignes alternées ; renvoie la hauteur où il s'arrête. */
function tableau(page: PDFPage, { police, gras }: Polices, y: number, colonnes: { titre: string; l: number }[], lignes: string[][], taille = 8.5): number {
  const xs = colonnes.map((_, i) => M + colonnes.slice(0, i).reduce((t, c) => t + c.l, 0));
  const largeur = colonnes.reduce((t, c) => t + c.l, 0);
  const inter = taille * 1.3;
  const ligne = (cellules: string[], f: PDFFont, couleur: ReturnType<typeof rgb>, fond?: ReturnType<typeof rgb>) => {
    const morceaux = cellules.map((c, i) => couper(f, c, taille, colonnes[i].l - 6));
    const h = Math.max(...morceaux.map((m) => m.length)) * inter + 6;
    if (fond) page.drawRectangle({ x: M, y: y - h, width: largeur, height: h, color: fond });
    morceaux.forEach((m, i) => m.forEach((t, k) => page.drawText(t, { x: xs[i] + 3, y: y - 3 - (k + 1) * inter + 2, size: taille, font: f, color: couleur })));
    y -= h;
  };
  ligne(colonnes.map((c) => c.titre), gras, rgb(1, 1, 1), ENTETE);
  lignes.forEach((l, n) => ligne(l, police, NOIR, n % 2 ? FOND : undefined));
  return y;
}

/** L'attestation récapitulative en PDF : une page de synthèse, puis une page par candidat. */
export async function pdfRecapitulatif(r: Recapitulatif, ctx: Contexte): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Attestation récapitulative des PFMP – ${r.classe.libelle}`);
  doc.setCreator("Cap PFMP");
  doc.setProducer("Cap PFMP");
  const p: Polices = { police: await doc.embedFont(StandardFonts.Helvetica), gras: await doc.embedFont(StandardFonts.HelveticaBold) };
  const texte = (page: PDFPage, t: string, x: number, y: number, taille = 10, f = p.police, couleur = NOIR) => page.drawText(lisible(f, t), { x, y, size: taille, font: f, color: couleur });
  const enTete = (page: PDFPage) => {
    texte(page, `Académie : ${r.academie || "à indiquer"}`, M, H - M - 10, 9, p.police, GRIS);
    const s = `Session ${r.session}`;
    texte(page, s, L - M - p.police.widthOfTextAtSize(s, 9), H - M - 10, 9, p.police, GRIS);
    let y = H - M - 34;
    for (const l of couper(p.gras, r.titre.toUpperCase(), 13, L - 2 * M)) { texte(page, l, M, y, 13, p.gras); y -= 17; }
    texte(page, "ATTESTATION RÉCAPITULATIVE DES PFMP", M, y - 2, 11, p.gras, ENTETE);
    return y - 22;
  };

  // Synthèse de la classe
  let page = doc.addPage([L, H]);
  let y = enTete(page);
  texte(page, `${r.etablissement} · classe ${r.classe.libelle} · ${r.candidats.length} candidat(s)`, M, y, 9.5); y -= 18;
  y = tableau(page, p, y, [{ titre: "N° candidat", l: 70 }, { titre: "Nom", l: 95 }, { titre: "Prénom", l: 80 }, { titre: "Cycle", l: 40 }, { titre: "Semaines", l: 50 }, { titre: "Attendues", l: 50 }, { titre: "Visa", l: 30 }, { titre: "Observations", l: 100 }],
    r.candidats.map((c) => [c.numero || "—", c.nom, c.prenom, texteDuree(c.duree), String(c.semaines), c.attendues === null ? "—" : String(c.attendues), c.visa ? "X" : "", c.attendues !== null && c.semaines < c.attendues ? `manque ${Math.round((c.attendues - c.semaines) * 10) / 10} sem.${c.derogation ? ", dérogation" : ""}` : ""]), 8);
  texte(page, "Ne comptent que les PFMP déjà effectuées et attestées (attestation de stage validée). 1 semaine = 5 jours de présence.", M, Math.max(y - 16, M + 20), 8, p.police, GRIS);

  for (const c of r.candidats) {
    page = doc.addPage([L, H]);
    y = enTete(page);
    texte(page, "Établissement", M, y, 8, p.police, GRIS); texte(page, "Nom et prénom du candidat", 320, y, 8, p.police, GRIS); y -= 13;
    texte(page, r.etablissement, M, y, 10.5, p.gras); texte(page, `${c.nom} ${c.prenom}`, 320, y, 10.5, p.gras); y -= 22;
    const infos: [string, string][] = [["N° candidat", c.numero || "à indiquer"], ["Durée du cycle", texteDuree(c.duree)], ["Dérogation", c.derogation ? "OUI" : "NON"], ["Classe", r.classe.libelle]];
    infos.forEach(([k, v], i) => { texte(page, k, M + i * 128, y, 8, p.police, GRIS); texte(page, v, M + i * 128, y - 13, 10.5, p.gras, v === "à indiquer" ? ROUGE : NOIR); });
    y -= 36;
    const lignes = c.pfmp.map((x) => [enClair(x.debut), enClair(x.fin), [x.entreprise, x.adresse].filter(Boolean).join("\n"), `${x.jours}${x.declares ? "" : " *"}`]);
    y = tableau(page, p, y, [{ titre: "Début de la PFMP", l: 80 }, { titre: "Fin de la PFMP", l: 80 }, { titre: "Entreprise d'accueil, nom et adresse", l: 245 }, { titre: "Jours de présence", l: 110 }],
      lignes.length ? lignes : [["", "", "Aucune PFMP effectuée et attestée pour l'instant.", ""]]);
    y -= 14;
    texte(page, `Total sur le cycle : ${c.jours} jour(s), soit ${c.semaines} semaine(s)${c.attendues !== null ? ` sur ${c.attendues} attendue(s)` : ""}.`, M, y, 10.5, p.gras); y -= 16;
    if (c.pfmp.some((x) => !x.declares)) { texte(page, "* jours prévus au stage, absences déduites (attestation déposée sur papier).", M, y, 8, p.police, GRIS); y -= 13; }
    for (const x of pointsAVerifier(c)) { for (const l of couper(p.police, `À vérifier : ${x}`, 8.5, L - 2 * M)) { texte(page, l, M, y, 8.5, p.police, ROUGE); y -= 12; } }
    y -= 14;
    page.drawRectangle({ x: M, y: y - 44, width: L - 2 * M, height: 44, borderColor: GRIS, borderWidth: 0.6 });
    texte(page, "Visa du chef d'établissement", M + 8, y - 16, 9, p.gras);
    texte(page, c.visa ? `X  Visée le ${dateLongue(c.visa.le.toISOString().slice(0, 10))} par ${c.visa.par}` : "En attente du visa de la direction.", M + 8, y - 32, 9.5, c.visa ? p.police : p.police, c.visa ? NOIR : GRIS);
  }
  const pages = doc.getPages();
  pages.forEach((pg, i) => texte(pg, `${ctx.etab.nom} · Cap PFMP · ${dateLongue(aujourdhui())} · page ${i + 1} sur ${pages.length}`, M, 18, 7.5, p.police, GRIS));
  return doc.save();
}
