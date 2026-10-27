import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { lisible } from "./modeles-pdf";

const LARGEUR = 595;
const HAUTEUR = 842;
const MARGE = 50;
const GRIS = rgb(0.38, 0.4, 0.45);
const NOIR = rgb(0.08, 0.1, 0.14);

/**
 * Un document PDF mis en page par Cap PFMP (modèle Cap PFMP d'un document) : titres, paragraphes, lignes
 * « intitulé : valeur », images, cadres et pied de page, avec passage automatique à la page suivante.
 */
export class DocumentPdf {
  private page!: PDFPage;
  private y = 0;

  private constructor(private doc: PDFDocument, private police: PDFFont, private gras: PDFFont) {
    this.nouvellePage();
  }

  static async creer(titre: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(titre);
    doc.setCreator("Cap PFMP");
    doc.setProducer("Cap PFMP");
    return new DocumentPdf(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  }

  private nouvellePage() {
    this.page = this.doc.addPage([LARGEUR, HAUTEUR]);
    this.y = HAUTEUR - MARGE;
  }

  /** Passe à la page suivante s'il ne reste pas la hauteur demandée. */
  private place(h: number) {
    if (this.y - h < MARGE + 24) this.nouvellePage();
  }

  /** Découpe un texte en lignes qui tiennent dans la largeur donnée (les retours à la ligne sont gardés). */
  private lignes(texte: string, f: PDFFont, taille: number, largeur: number): string[] {
    const res: string[] = [];
    for (const para of lisible(f, texte).split("\n")) {
      let ligne = "";
      for (const mot of para.split(/\s+/).filter(Boolean)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (f.widthOfTextAtSize(essai, taille) <= largeur) { ligne = essai; continue; }
        if (ligne) res.push(ligne);
        // Un mot plus long que la ligne (adresse web…) est coupé.
        let reste = mot;
        while (f.widthOfTextAtSize(reste, taille) > largeur) {
          let n = reste.length - 1;
          while (n > 1 && f.widthOfTextAtSize(reste.slice(0, n), taille) > largeur) n--;
          res.push(reste.slice(0, n));
          reste = reste.slice(n);
        }
        ligne = reste;
      }
      res.push(ligne);
    }
    return res;
  }

  espace(h: number) {
    this.y -= h;
  }

  texte(texte: string, o: { taille?: number; gras?: boolean; gris?: boolean; x?: number; largeur?: number } = {}) {
    const taille = o.taille ?? 10;
    const f = o.gras ? this.gras : this.police;
    const x = o.x ?? MARGE;
    const h = taille * 1.4;
    for (const l of this.lignes(texte, f, taille, o.largeur ?? LARGEUR - MARGE - x)) {
      this.place(h);
      this.y -= h;
      if (l) this.page.drawText(l, { x, y: this.y + taille * 0.3, size: taille, font: f, color: o.gris ? GRIS : NOIR });
    }
  }

  titre(t: string) {
    this.texte(t, { taille: 15, gras: true });
    this.espace(6);
  }

  intertitre(t: string) {
    this.espace(10);
    this.place(40);
    this.texte(t, { taille: 11.5, gras: true });
    this.page.drawLine({ start: { x: MARGE, y: this.y - 2 }, end: { x: LARGEUR - MARGE, y: this.y - 2 }, thickness: 0.5, color: GRIS });
    this.espace(6);
  }

  /** Une ligne « intitulé : valeur », l'intitulé en gris à gauche, la valeur à droite (sur plusieurs lignes si besoin). */
  champ(libelle: string, valeur: string) {
    const taille = 10;
    const h = taille * 1.4;
    const col = 170;
    const gauche = this.lignes(libelle, this.police, taille, col - 10);
    const droite = this.lignes(valeur || "—", this.gras, taille, LARGEUR - 2 * MARGE - col);
    const n = Math.max(gauche.length, droite.length);
    for (let i = 0; i < n; i++) {
      this.place(h);
      this.y -= h;
      const yy = this.y + taille * 0.3;
      if (gauche[i]) this.page.drawText(gauche[i], { x: MARGE, y: yy, size: taille, font: this.police, color: GRIS });
      if (droite[i]) this.page.drawText(droite[i], { x: MARGE + col, y: yy, size: taille, font: this.gras, color: NOIR });
    }
  }

  /** Une image (logo, signature dessinée), réduite pour tenir dans le cadre donné. */
  async image(octets: Uint8Array, o: { largeur: number; hauteur: number; x?: number; png?: boolean }) {
    const img = o.png === false ? await this.doc.embedJpg(octets) : await this.doc.embedPng(octets);
    const k = Math.min(o.largeur / img.width, o.hauteur / img.height, 1);
    const w = img.width * k;
    const h = img.height * k;
    this.place(h);
    this.y -= h;
    this.page.drawImage(img, { x: o.x ?? MARGE, y: this.y, width: w, height: h });
  }

  /** Un cadre autour de ce qu'écrit `contenu` (ex. la signature), sans le couper entre deux pages. */
  async cadre(hauteurMin: number, contenu: () => Promise<void> | void) {
    this.place(hauteurMin + 16);
    const haut = this.y - 4;
    const page = this.page;
    this.espace(6);
    await contenu();
    this.espace(8);
    const bas = Math.min(this.y, haut - hauteurMin);
    if (page === this.page) {
      page.drawRectangle({ x: MARGE - 8, y: bas, width: LARGEUR - 2 * MARGE + 16, height: haut - bas, borderWidth: 0.8, borderColor: GRIS });
      this.y = bas;
    }
  }

  /** Pied de page et numéro de page sur chaque page, puis le PDF. */
  async enregistrer(pied?: string): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const t = lisible(this.police, `${pied ? `${pied}  ·  ` : ""}${i + 1}/${pages.length}`);
      const taille = 8;
      const w = this.police.widthOfTextAtSize(t, taille);
      p.drawText(t, { x: Math.max(MARGE, (LARGEUR - w) / 2), y: 26, size: taille, font: this.police, color: GRIS });
    });
    return this.doc.save();
  }
}
