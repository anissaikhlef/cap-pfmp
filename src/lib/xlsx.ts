/**
 * Un vrai fichier Excel (.xlsx) pour une liste (décision d'Anissa : « oui pour les fichiers .xlsx »), sans bibliothèque :
 * un classeur d'une feuille, titre et sous-titre en haut, en-tête en gras figé et filtrable, dates reconnues par Excel
 * (jj/mm/aaaa), largeurs de colonnes adaptées. Le fichier est une archive ZIP (sans compression) de quelques fichiers XML.
 */
export type FeuilleXlsx = { titre: string; sousTitre: string; colonnes: string[]; lignes: (string | number)[][] };

const enc = new TextEncoder();
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // Les caractères de contrôle sont interdits dans le XML d'Excel.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Lettre(s) de la colonne : 0 → A, 25 → Z, 26 → AA. */
export function lettre(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** « 26/10/2026 » → numéro de jour d'Excel (jours depuis le 30/12/1899), ou null si ce n'est pas une date. */
export function dateExcel(v: string): number | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(t) ? null : Math.round((t - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** Styles : 0 normal · 1 en-tête (gras, fond) · 2 date · 3 titre (gras, grand) · 4 sous-titre (gris). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5B6779"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1C3354"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function feuille(f: FeuilleXlsx): string {
  const nbCol = Math.max(f.colonnes.length, 1);
  const cellule = (c: string, v: string | number, style = 0) => {
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${c}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`;
    const s = String(v ?? "");
    const d = style === 0 ? dateExcel(s) : null;
    if (d !== null) return `<c r="${c}" s="2"><v>${d}</v></c>`;
    if (!s) return "";
    return `<c r="${c}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(s)}</t></is></c>`;
  };
  const rangee = (n: number, cellules: string) => `<row r="${n}">${cellules}</row>`;
  const lignes = [
    rangee(1, cellule("A1", f.titre, 3)),
    rangee(2, cellule("A2", f.sousTitre, 4)),
    rangee(4, f.colonnes.map((c, i) => cellule(`${lettre(i)}4`, c, 1)).join("")),
    ...f.lignes.map((l, k) => rangee(5 + k, l.map((v, i) => cellule(`${lettre(i)}${5 + k}`, v)).join(""))),
  ];
  // Largeur de chaque colonne d'après son contenu (entre 8 et 45 caractères).
  const largeurs = f.colonnes.map((c, i) => Math.min(45, Math.max(8, c.length + 2, ...f.lignes.slice(0, 500).map((l) => String(l[i] ?? "").length + 2))));
  const derniere = `${lettre(nbCol - 1)}${Math.max(4, 4 + f.lignes.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${lignes.join("")}</sheetData>
${f.colonnes.length ? `<autoFilter ref="A4:${derniere}"/>` : ""}
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

/** Nom d'onglet accepté par Excel : 31 caractères au plus, sans : \ / ? * [ ]. */
export const nomDOnglet = (t: string) => t.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Liste";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Archive ZIP sans compression (« stored »), suffisante et lisible par Excel, LibreOffice et Numbers. */
function zip(fichiers: [string, string][]): Uint8Array {
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;
  for (const [nom, contenu] of fichiers) {
    const n = enc.encode(nom), d = enc.encode(contenu), crc = crc32(d);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, t]) => (t === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    morceaux.push(new Uint8Array(local.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, decalage, 4]]
      .forEach(([o, v, t]) => (t === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    central.push(new Uint8Array(c.buffer), n);
    decalage += 30 + n.length + d.length;
  }
  const tailleCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, fichiers.length, 2], [10, fichiers.length, 2], [12, tailleCentral, 4], [16, decalage, 4], [20, 0, 2]]
    .forEach(([o, v, t]) => (t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true)));
  const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
  const res = new Uint8Array(tout.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of tout) { res.set(x, o); o += x.length; }
  return res;
}

/** Le fichier .xlsx d'une liste. */
export function classeurXlsx(f: FeuilleXlsx): Uint8Array {
  const entete = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  return zip([
    ["[Content_Types].xml", `${entete}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `${entete}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(f.titre)}</dc:title><dc:creator>Cap PFMP</dc:creator></cp:coreProperties>`],
    ["xl/workbook.xml", `${entete}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(nomDOnglet(f.titre))}" sheetId="1" r:id="rId1"/></sheets>${f.colonnes.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(nomDOnglet(f.titre)).replace(/'/g, "''")}'!$A$4:$${lettre(f.colonnes.length - 1)}$${4 + f.lignes.length}</definedName></definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", feuille(f)],
  ]);
}
