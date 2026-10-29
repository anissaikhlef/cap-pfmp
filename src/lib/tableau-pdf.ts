import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { lisible } from "./modeles-pdf";

/**
 * Une liste en PDF prêt à imprimer (décision d'Anissa : chaque liste en Excel et en PDF) : page A4 à l'italienne, titre,
 * en-tête du tableau répété sur chaque page, lignes alternées, pied de page avec le lycée, la date et le numéro de page.
 */
const L = 842, H = 595, M = 32;
const GRIS = rgb(0.38, 0.4, 0.45), NOIR = rgb(0.08, 0.1, 0.14), FOND = rgb(0.95, 0.96, 0.97), ENTETE = rgb(0.11, 0.2, 0.33);

export type Tableau = { titre: string; sousTitre: string; colonnes: string[]; lignes: (string | number)[][]; largeurs?: number[] };

/** Coupe un texte en au plus `max` lignes qui tiennent dans la largeur (la dernière se termine par « … » si besoin). */
function couper(f: PDFFont, texte: string, taille: number, largeur: number, max: number): string[] {
  const mots = lisible(f, texte).split(/\s+/).filter(Boolean);
  const res: string[] = [];
  let ligne = "";
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (f.widthOfTextAtSize(essai, taille) <= largeur) { ligne = essai; continue; }
    if (ligne) res.push(ligne);
    ligne = mot;
  }
  if (ligne) res.push(ligne);
  // Un mot plus long que la colonne est coupé, et la coupure se voit (« … »).
  const garde = res.slice(0, max).map((l) => {
    if (f.widthOfTextAtSize(l, taille) <= largeur) return l;
    let x = l;
    while (x.length > 1 && f.widthOfTextAtSize(`${x}…`, taille) > largeur) x = x.slice(0, -1);
    return `${x}…`;
  });
  if (res.length > max && garde.length) {
    let d = garde[max - 1];
    while (d.length > 1 && f.widthOfTextAtSize(`${d}…`, taille) > largeur) d = d.slice(0, -1);
    garde[max - 1] = `${d}…`;
  }
  return garde.length ? garde : [""];
}

/** Une liste en PDF, ou plusieurs (chacune à partir d'une nouvelle page). */
export async function tableauPdf(t: Tableau | Tableau[], pied: string): Promise<Uint8Array> {
  const tableaux = Array.isArray(t) ? t : [t];
  const doc = await PDFDocument.create();
  doc.setTitle(tableaux[0].titre);
  doc.setCreator("Cap PFMP");
  doc.setProducer("Cap PFMP");
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const x of tableaux) dessiner(doc, x, police, gras);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const texte = lisible(police, `${pied} · page ${i + 1} sur ${pages.length}`);
    p.drawText(texte, { x: M, y: 16, size: 7.5, font: police, color: GRIS });
  });
  return doc.save();
}

function dessiner(doc: PDFDocument, t: Tableau, police: PDFFont, gras: PDFFont) {
  const taille = 8;
  const interligne = taille * 1.3;
  const utile = L - 2 * M;
  // Largeurs des colonnes : celles données, sinon selon la longueur du contenu (bornée).
  const poids = t.largeurs ?? t.colonnes.map((c, i) => {
    const long = Math.max(c.length, ...t.lignes.slice(0, 200).map((l) => String(l[i] ?? "").length));
    return Math.min(Math.max(long, 6), 40);
  });
  const total = poids.reduce((a, b) => a + b, 0);
  const larg = poids.map((p) => (p / total) * utile);
  const xs = larg.map((_, i) => M + larg.slice(0, i).reduce((a, b) => a + b, 0));

  let page = doc.addPage([L, H]);
  let y = H - M;
  const enTete = () => {
    const cellules = t.colonnes.map((c, i) => couper(gras, c, taille, larg[i] - 6, 2));
    const h = Math.max(...cellules.map((c) => c.length)) * interligne + 6;
    page.drawRectangle({ x: M, y: y - h, width: utile, height: h, color: ENTETE });
    cellules.forEach((c, i) => c.forEach((l, k) => page.drawText(l, { x: xs[i] + 3, y: y - 4 - (k + 1) * interligne + 2, size: taille, font: gras, color: rgb(1, 1, 1) })));
    y -= h;
  };
  page.drawText(lisible(gras, t.titre), { x: M, y: y - 14, size: 14, font: gras, color: NOIR });
  page.drawText(lisible(police, t.sousTitre), { x: M, y: y - 30, size: 9, font: police, color: GRIS });
  y -= 42;
  enTete();
  if (!t.lignes.length) {
    page.drawText(lisible(police, "Aucune ligne pour ce choix."), { x: M + 3, y: y - 16, size: 9, font: police, color: GRIS });
  }
  t.lignes.forEach((ligne, n) => {
    const cellules = t.colonnes.map((_, i) => couper(police, String(ligne[i] ?? ""), taille, larg[i] - 6, 3));
    const h = Math.max(...cellules.map((c) => c.length)) * interligne + 5;
    if (y - h < M + 20) { page = doc.addPage([L, H]); y = H - M; enTete(); }
    if (n % 2) page.drawRectangle({ x: M, y: y - h, width: utile, height: h, color: FOND });
    cellules.forEach((c, i) => c.forEach((l, k) => page.drawText(l, { x: xs[i] + 3, y: y - 3 - (k + 1) * interligne + 2, size: taille, font: police, color: NOIR })));
    y -= h;
  });
}
