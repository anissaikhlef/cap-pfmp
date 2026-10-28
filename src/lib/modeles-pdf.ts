import "server-only";
import {
  PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField,
  StandardFonts, rgb, type PDFField, type PDFFont, type PDFPage, type PDFWidgetAnnotation,
} from "pdf-lib";
import type { ChampPdf, ZonePdf } from "@/db/schema";
import { suggererSource } from "./modeles";

/**
 * Le PDF du lycée, rempli à l'identique : on écrit dans ses champs de formulaire (zones de texte, cases, listes),
 * puis on fige le document. Les signatures dessinées sont placées juste au-dessus du nom du signataire.
 */

function sorte(f: PDFField): ChampPdf["type"] | null {
  if (f instanceof PDFTextField) return "texte";
  if (f instanceof PDFCheckBox) return "case";
  if (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) return "liste";
  if (f instanceof PDFSignature) return "signature";
  return null;
}

/** La page d'un widget (son entrée /P, ou la page dont il fait partie des annotations). */
function pageDuWidget(doc: PDFDocument, w: PDFWidgetAnnotation): PDFPage | undefined {
  const pages = doc.getPages();
  const p = w.P();
  if (p) {
    const trouvee = pages.find((x) => x.ref === p);
    if (trouvee) return trouvee;
  }
  const ref = doc.context.getObjectRef(w.dict);
  return pages.find((x) => x.node.Annots()?.asArray().some((a) => a === ref));
}

async function charger(octets: Uint8Array) {
  const doc = await PDFDocument.load(octets, { ignoreEncryption: true, updateMetadata: false });
  if (doc.isEncrypted) throw new Error("protege");
  return doc;
}

/** Les champs d'un PDF, avec la donnée proposée pour chacun. Message d'erreur si le PDF ne s'y prête pas. */
export async function lireChampsPdf(octets: Uint8Array): Promise<ChampPdf[] | string> {
  let doc: PDFDocument;
  try {
    doc = await charger(octets);
  } catch (e) {
    return e instanceof Error && e.message === "protege"
      ? "Ce PDF est protégé : enregistrez-en une copie sans protection, puis déposez-la."
      : "Ce PDF est illisible. Enregistrez-le de nouveau depuis votre logiciel, puis déposez-le.";
  }
  const champs: ChampPdf[] = [];
  for (const f of doc.getForm().getFields()) {
    const type = sorte(f);
    if (!type) continue;
    const pages = [...new Set(f.acroField.getWidgets().map((w) => doc.getPages().indexOf(pageDuWidget(doc, w)!) + 1).filter((n) => n > 0))].sort((a, b) => a - b);
    const options = f instanceof PDFDropdown || f instanceof PDFOptionList ? f.getOptions() : f instanceof PDFRadioGroup ? f.getOptions() : undefined;
    champs.push({ nom: f.getName(), type, pages, ...(options ? { options } : {}), source: suggererSource(f.getName(), type) });
  }
  // Un PDF sans champs est accepté : le lycée y place lui-même les zones à remplir.
  return champs;
}

/** Garde seulement les caractères que la police du PDF sait écrire (les accents français passent). */
export function lisible(police: PDFFont, s: string) {
  const permis = new Set(police.getCharacterSet());
  return [...s.replace(/[–—]/g, "-").replace(/ | /g, " ")].filter((ch) => ch === "\n" || permis.has(ch.codePointAt(0)!)).join("");
}

export type Remplissage = {
  /** Valeur de chaque champ : texte (zone de texte ou option de liste), ou vrai/faux pour une case. */
  valeurs: Map<string, string | boolean>;
  /** Signatures à placer au-dessus d'un champ : image dessinée, ou mention pour une signature simple. */
  signatures?: { champ: string; image?: Uint8Array; mention?: string }[];
  /** Repérage : chaque champ affiche son propre nom, pour savoir où il se trouve. */
  reperage?: boolean;
};

/** Ce qui s'écrit dans les zones placées par le lycée : textes et croix par donnée, signatures (image ou mention). */
export type ValeursZones = {
  donnees: Map<string, string | boolean>;
  signatures: Map<string, { image?: Uint8Array; mention?: string }>;
};

/** Le nombre de pages d'un PDF et leur taille, pour placer les zones. Message d'erreur s'il ne s'ouvre pas. */
export async function pagesDuPdf(octets: Uint8Array): Promise<{ l: number; h: number }[] | string> {
  try {
    const doc = await charger(octets);
    return doc.getPages().map((p) => ({ l: Math.round(p.getWidth()), h: Math.round(p.getHeight()) }));
  } catch (e) {
    return e instanceof Error && e.message === "protege" ? "Ce PDF est protégé par un mot de passe : déposez une version sans protection." : "Ce fichier PDF ne s'ouvre pas.";
  }
}

/** Écrit un texte dans un rectangle : sur plusieurs lignes, en réduisant la taille s'il le faut. */
function texteDansZone(page: PDFPage, police: PDFFont, texte: string, z: ZonePdf) {
  const brut = lisible(police, texte);
  const lignes = (taille: number) => {
    const res: string[] = [];
    for (const para of brut.split("\n")) {
      let ligne = "";
      for (const mot of para.split(/\s+/).filter(Boolean)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (police.widthOfTextAtSize(essai, taille) <= z.l - 2 || !ligne) ligne = essai;
        else { res.push(ligne); ligne = mot; }
      }
      res.push(ligne);
    }
    return res;
  };
  let taille = Math.min(10, Math.max(5, z.h * 0.75));
  let l = lignes(taille);
  while (taille > 5 && l.length * taille * 1.15 > z.h) { taille -= 0.5; l = lignes(taille); }
  l.forEach((ligne, i) => {
    const y = z.y + z.h - (i + 1) * taille * 1.15 + taille * 0.25;
    if (y >= z.y - taille * 0.3) page.drawText(ligne, { x: z.x + 1, y, size: taille, font: police, color: rgb(0.05, 0.1, 0.35) });
  });
}

/**
 * Écrit dans les zones placées par le lycée sur son PDF (même sans champs) : texte, croix (case vraie) ou signature.
 * En « repérage », chaque zone est encadrée avec l'intitulé de sa donnée.
 */
export async function dessinerZones(doc: PDFDocument, zones: ZonePdf[], v: ValeursZones | null, libelles?: Map<string, string>) {
  if (!zones.length) return;
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  for (const z of zones) {
    const page = pages[z.page - 1];
    if (!page) continue;
    if (!v) {
      page.drawRectangle({ x: z.x, y: z.y, width: z.l, height: z.h, borderColor: rgb(0.75, 0.1, 0.1), borderWidth: 0.8, color: rgb(1, 0.9, 0.9), opacity: 0.4 });
      texteDansZone(page, police, z.source === "fixe" ? z.fixe ?? "" : libelles?.get(z.source) ?? z.source, z);
      continue;
    }
    if (z.source === "fixe") { texteDansZone(page, police, z.fixe ?? "", z); continue; }
    const sig = v.signatures.get(z.source);
    if (sig) {
      const image = sig.image ? await doc.embedPng(sig.image).catch(() => null) : null;
      if (image) {
        const k = Math.min(z.l / image.width, z.h / image.height);
        page.drawImage(image, { x: z.x, y: z.y, width: image.width * k, height: image.height * k });
      } else if (sig.mention) texteDansZone(page, police, sig.mention, z);
      continue;
    }
    const d = v.donnees.get(z.source);
    if (d === true) {
      const taille = Math.min(z.h, z.l) * 0.9;
      const w = gras.widthOfTextAtSize("X", taille);
      page.drawText("X", { x: z.x + (z.l - w) / 2, y: z.y + (z.h - taille * 0.72) / 2, size: taille, font: gras, color: rgb(0.05, 0.1, 0.35) });
    } else if (typeof d === "string" && d) texteDansZone(page, police, d, z);
  }
}

/** Le PDF du lycée rempli dans ses zones seulement (PDF sans champs), ou en repérage (`v` vide). */
export async function remplirZones(octets: Uint8Array, zones: ZonePdf[], v: ValeursZones | null, libelles?: Map<string, string>): Promise<Uint8Array> {
  const doc = await charger(octets);
  await dessinerZones(doc, zones, v, libelles);
  return doc.save();
}

/** Remplit le PDF du lycée et le fige ; puis écrit dans ses zones, s'il en a. */
export async function remplirPdf(octets: Uint8Array, r: Remplissage, zones: ZonePdf[] = [], v: ValeursZones | null = null): Promise<Uint8Array> {
  const doc = await charger(octets);
  const form = doc.getForm();
  try { form.deleteXFA(); } catch { /* pas de formulaire XFA */ }
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const rouge = rgb(0.75, 0.1, 0.1);
  for (const f of form.getFields()) {
    const nom = f.getName();
    if (r.reperage) {
      if (f instanceof PDFTextField) {
        const max = f.getMaxLength();
        f.setText(lisible(police, max ? nom.slice(0, max) : nom));
      } else {
        // Cases et listes : le nom est écrit en rouge à côté.
        for (const w of f.acroField.getWidgets()) {
          const page = pageDuWidget(doc, w);
          const rect = w.getRectangle();
          page?.drawText(lisible(police, nom), { x: rect.x + rect.width + 2, y: rect.y + 1, size: 6, font: police, color: rouge });
        }
      }
      continue;
    }
    const v = r.valeurs.get(nom);
    if (v === undefined) continue;
    try {
      if (f instanceof PDFTextField && typeof v === "string") {
        const max = f.getMaxLength();
        const texte = lisible(police, v);
        f.setText(max ? texte.slice(0, max) : texte);
      } else if (f instanceof PDFCheckBox && typeof v === "boolean") {
        if (v) f.check(); else f.uncheck();
      } else if ((f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) && typeof v === "string" && f.getOptions().includes(v)) {
        f.select(v);
      }
    } catch {
      // Un champ récalcitrant reste vide plutôt que d'empêcher tout le document.
    }
  }
  for (const s of r.signatures ?? []) {
    const f = form.getFieldMaybe(s.champ);
    if (!f) continue;
    const image = s.image ? await doc.embedPng(s.image).catch(() => null) : null;
    // Un champ « signature » du PDF reçoit la signature à l'intérieur ; un champ de nom, juste au-dessus.
    const dedans = f instanceof PDFSignature;
    for (const w of f.acroField.getWidgets()) {
      const page = pageDuWidget(doc, w);
      if (!page) continue;
      const rect = w.getRectangle();
      const y = dedans ? rect.y : rect.y + rect.height + 2;
      if (image) {
        const h = Math.min(dedans ? rect.height : 40, (rect.width / image.width) * image.height);
        page.drawImage(image, { x: rect.x, y, width: (h / image.height) * image.width, height: h });
      } else if (s.mention) {
        page.drawText(lisible(police, s.mention), { x: rect.x + (dedans ? 2 : 0), y: y + 2, size: 7, font: police, color: rgb(0.1, 0.2, 0.45) });
      }
    }
  }
  form.updateFieldAppearances(police);
  try { form.flatten(); } catch { /* le document reste remplissable, mais rempli */ }
  if (zones.length && v) await dessinerZones(doc, zones, v);
  return doc.save();
}

/**
 * Un exemple fictif de convention en « PDF modifiable », pour essayer sans avoir son propre PDF sous la main :
 * des champs aux noms parlants ou génériques, une liste déroulante, une case et des cadres de signature.
 */
export async function pdfExempleConvention(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Convention de stage : exemple de PDF modifiable");
  const page = doc.addPage([595, 842]);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  const ecrire = (texte: string, x: number, y: number, taille = 10, f = police) => page.drawText(texte, { x, y, size: taille, font: f });
  const texte = (nom: string, libelle: string, y: number, largeur = 300) => {
    ecrire(libelle, 50, y + 5);
    form.createTextField(nom).addToPage(page, { x: 230, y, width: largeur, height: 18 });
  };
  ecrire("CONVENTION DE STAGE", 50, 790, 16, gras);
  ecrire("Exemple fictif de PDF modifiable, pour essayer le remplissage par Cap PFMP.", 50, 770, 9);
  ecrire("L'élève", 50, 740, 12, gras);
  texte("NOM et prénom", "Nom et prénom", 715);
  texte("Date de naissance", "Date de naissance", 690, 120);
  ecrire("Classe", 50, 670);
  const classe = form.createDropdown("niveau de classe");
  classe.addOptions(["niveau de classe", "CAP 1ère année", "CAP 2ème année", "2nde bac pro", "1ère bac pro", "Ter bac pro"]);
  classe.select("niveau de classe");
  classe.addToPage(page, { x: 230, y: 665, width: 150, height: 18 });
  texte("Numéro de portable", "Téléphone portable de l'élève", 640, 150);
  ecrire("Élève mineur", 50, 620);
  form.createCheckBox("Élève mineur").addToPage(page, { x: 230, y: 617, width: 12, height: 12 });
  ecrire("L'entreprise", 50, 585, 12, gras);
  texte("Nom de l'entreprise", "Nom de l'entreprise", 560);
  texte("Nom de l'assureur", "Assureur de l'entreprise", 535);
  ecrire("Le lycée", 50, 500, 12, gras);
  texte("Texte_13", "Établissement", 475);
  texte("date début période 1", "Du", 450, 100);
  texte("date fin période 1", "Au", 425, 100);
  ecrire("Signatures", 50, 380, 12, gras);
  for (const [i, [qui, libelle]] of ([["élève", "L'élève"], ["entreprise", "Le représentant de l'entreprise"]] as const).entries()) {
    const x = 50 + i * 270;
    page.drawRectangle({ x, y: 230, width: 250, height: 130, borderWidth: 1, borderColor: rgb(0.6, 0.6, 0.6) });
    ecrire(libelle, x + 8, 345, 10, gras);
    ecrire("Nom prénom :", x + 8, 262, 9);
    form.createTextField(`Nom prénom signature ${qui}`).addToPage(page, { x: x + 75, y: 256, width: 165, height: 16 });
    ecrire("Le :", x + 8, 240, 9);
    form.createTextField(`Date signature ${qui}`).addToPage(page, { x: x + 75, y: 234, width: 90, height: 16 });
  }
  return doc.save();
}

/**
 * Un exemple fictif de document « à plat », sans champs (comme un PDF scanné ou imprimé depuis un traitement de texte),
 * pour essayer de placer les zones : des intitulés suivis de lignes pointillées, des cases et des cadres de signature.
 */
export async function pdfExempleSansChamps(titre: string, lignes: string[], cases: string[], signatures: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${titre} : exemple sans champs`);
  const page = doc.addPage([595, 842]);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const gris = rgb(0.45, 0.45, 0.45);
  page.drawText(lisible(gras, titre.toUpperCase()), { x: 50, y: 790, size: 15, font: gras });
  page.drawText(lisible(police, "Exemple fictif de document sans champs, pour essayer les zones de Cap PFMP."), { x: 50, y: 770, size: 9, font: police, color: gris });
  let y = 735;
  for (const l of lignes) {
    page.drawText(lisible(police, `${l} :`), { x: 50, y, size: 10, font: police });
    page.drawLine({ start: { x: 230, y: y - 2 }, end: { x: 545, y: y - 2 }, thickness: 0.5, color: gris, dashArray: [2, 2] });
    y -= 26;
  }
  y -= 6;
  for (const c of cases) {
    page.drawRectangle({ x: 50, y: y - 2, width: 10, height: 10, borderColor: rgb(0, 0, 0), borderWidth: 0.8 });
    page.drawText(lisible(police, c), { x: 68, y, size: 10, font: police });
    y -= 22;
  }
  y -= 20;
  signatures.forEach((s, i) => {
    const x = 50 + (i % 2) * 260;
    const yy = y - Math.floor(i / 2) * 120;
    page.drawRectangle({ x, y: yy - 90, width: 240, height: 100, borderColor: gris, borderWidth: 0.8 });
    page.drawText(lisible(gras, s), { x: x + 8, y: yy - 4, size: 10, font: gras });
  });
  return doc.save();
}
