import "server-only";
import {
  PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField,
  StandardFonts, rgb, type PDFField, type PDFFont, type PDFPage, type PDFWidgetAnnotation,
} from "pdf-lib";
import type { ChampPdf } from "@/db/schema";
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
  if (!champs.length) return "Ce PDF n'a pas de champs à remplir. Ajoutez des champs de formulaire avec votre logiciel PDF, ou gardez le modèle Cap PFMP.";
  return champs;
}

/** Garde seulement les caractères que la police du PDF sait écrire (les accents français passent). */
function lisible(police: PDFFont, s: string) {
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

/** Remplit le PDF du lycée et le fige. */
export async function remplirPdf(octets: Uint8Array, r: Remplissage): Promise<Uint8Array> {
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
