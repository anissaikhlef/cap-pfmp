import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { StructureRecap } from "@/db/schema";

/**
 * Le fichier Excel de l'académie (attestation récapitulative PFMP), déposé par chaque lycée (décision d'Anissa : « je ne
 * connais pas le modèle des autres académies, donc chaque lycée doit avoir l'option pour déposer le sien »).
 * Ce module lit le classeur, repère ses cases d'après leurs intitulés, et le remplit en ne touchant qu'aux valeurs :
 * mise en page, formules, listes déroulantes et onglets restent ceux de l'académie. Sans bibliothèque (zlib de Node).
 */

/* ------------------- Archive ZIP ------------------- */

export function lireZip(b: Buffer): Map<string, Buffer> {
  const res = new Map<string, Buffer>();
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("Ce fichier n'est pas un fichier Excel (.xlsx).");
  const n = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("Fichier Excel abîmé.");
    const methode = b.readUInt16LE(p + 10), taille = b.readUInt32LE(p + 20);
    const ln = b.readUInt16LE(p + 28), lx = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const nom = b.subarray(p + 46, p + 46 + ln).toString("utf8");
    const debut = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const brut = b.subarray(debut, debut + taille);
    if (methode === 0) res.set(nom, Buffer.from(brut));
    else if (methode === 8) res.set(nom, inflateRawSync(brut));
    else throw new Error("Fichier Excel compressé d'une façon inconnue.");
    p += 46 + ln + lx + lc;
  }
  return res;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function ecrireZip(fichiers: Map<string, Buffer>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let decalage = 0;
  for (const [nom, d] of fichiers) {
    const n = Buffer.from(nom, "utf8"), z = deflateRawSync(d), crc = crc32(d);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(8, 8);
    l.writeUInt16LE(0, 10); l.writeUInt16LE(0x21, 12); l.writeUInt32LE(crc, 14); l.writeUInt32LE(z.length, 18); l.writeUInt32LE(d.length, 22);
    l.writeUInt16LE(n.length, 26); l.writeUInt16LE(0, 28);
    parts.push(l, n, z);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20); c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(decalage, 42);
    central.push(c, n);
    decalage += 30 + n.length + z.length;
  }
  const tc = central.reduce((s, x) => s + x.length, 0);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(fichiers.size, 8); e.writeUInt16LE(fichiers.size, 10); e.writeUInt32LE(tc, 12); e.writeUInt32LE(decalage, 16);
  return Buffer.concat([...parts, ...central, e]);
}

/* ------------------- Classeur, feuilles et cellules ------------------- */

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const echappe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const textes = (x: string) => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** « AB12 » → colonne 27 (à partir de 0), ligne 12. */
export function position(ref: string): { col: number; ligne: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Case invalide : ${ref}`);
  return { col: [...m[1]].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1, ligne: Number(m[2]) };
}
export function colonne(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const ref = (col: number, ligne: number) => `${colonne(col)}${ligne}`;

export type Cellule = { valeur: string; formule: boolean };
export type Feuille = { nom: string; chemin: string; cellules: Map<string, Cellule>; fusions: { de: { col: number; ligne: number }; a: { col: number; ligne: number } }[] };

export type Classeur = { fichiers: Map<string, Buffer>; feuilles: Feuille[] };

export function ouvrirClasseur(b: Buffer): Classeur {
  const fichiers = lireZip(b);
  const lire = (n: string) => fichiers.get(n)?.toString("utf8") ?? "";
  const wb = lire("xl/workbook.xml");
  if (!wb) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx).");
  const rels = new Map([...lire("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/\bId="([^"]+)"/)?.[1] ?? "", m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? ""]));
  const partages = [...lire("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textes(m[1]));
  const feuilles: Feuille[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nom = decode(m[0].match(/\bname="([^"]*)"/)?.[1] ?? "");
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1] ?? "";
    const cible = (rels.get(rid) ?? "").replace(/^\/?xl\//, "");
    const chemin = `xl/${cible}`;
    const xml = lire(chemin);
    const cellules = new Map<string, Cellule>();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = c[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!r) continue;
      const corps = c[2] ?? "";
      const t = c[1].match(/\bt="([^"]+)"/)?.[1];
      const v = corps.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const valeur = t === "s" && v !== undefined ? partages[Number(v)] ?? "" : t === "inlineStr" ? textes(corps) : v !== undefined ? decode(v) : "";
      cellules.set(r, { valeur, formule: /<f[\s>/]/.test(corps) });
    }
    const fusions = [...xml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map((x) => ({ de: position(x[1]), a: position(x[2]) }));
    feuilles.push({ nom, chemin, cellules, fusions });
  }
  return { fichiers, feuilles };
}

/* ------------------- Repérage des cases d'après leurs intitulés ------------------- */

export const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();

export type { LignesRecap, StructureRecap } from "@/db/schema";

function fusionDe(f: Feuille, r: string) {
  const p = position(r);
  return f.fusions.find((m) => p.col >= m.de.col && p.col <= m.a.col && p.ligne >= m.de.ligne && p.ligne <= m.a.ligne) ?? { de: p, a: p };
}
const aDroite = (f: Feuille, r: string) => { const m = fusionDe(f, r); return ref(m.a.col + 1, m.de.ligne); };
const dessous = (f: Feuille, r: string, decal = 0) => { const m = fusionDe(f, r); return ref(m.de.col + decal, m.a.ligne + 1); };
function chercher(f: Feuille, test: (t: string) => boolean): string | null {
  const trouves = [...f.cellules].filter(([, c]) => !c.formule && c.valeur && test(normal(c.valeur))).map(([r]) => r);
  trouves.sort((x, y) => position(x).ligne - position(y).ligne || position(x).col - position(y).col);
  return trouves[0] ?? null;
}
/** Dans la ligne d'un intitulé, la colonne d'un autre intitulé. */
function dansLaLigne(f: Feuille, ligne: number, test: (t: string) => boolean): string | null {
  const trouves = [...f.cellules].filter(([r, c]) => position(r).ligne === ligne && !c.formule && c.valeur && test(normal(c.valeur))).map(([r]) => r);
  trouves.sort((x, y) => position(x).col - position(y).col);
  return trouves[0] ? colonne(position(trouves[0]).col) : null;
}

/** Repère les cases du modèle de l'académie. Les cases non trouvées restent vides : le lycée les indique à la main. */
export function reperer(c: Classeur): StructureRecap {
  const eleves = c.feuilles.filter((f) => /^el[e]ve\s*\d+$/.test(normal(f.nom))).sort((x, y) => Number(normal(x.nom).match(/\d+/)![0]) - Number(normal(y.nom).match(/\d+/)![0]));
  const s: StructureRecap = { feuillesEleves: eleves.map((f) => f.nom), cases: {}, lignes: null, synthese: null, garde: null };
  const f = eleves[0];
  if (f) {
    const titre = chercher(f, (t) => /baccalaureat|certificat d aptitude|^cap\b|brevet|mention complementaire/.test(t));
    if (titre && position(titre).ligne <= 3) s.cases.titre = titre;
    const lab = (test: (t: string) => boolean) => chercher(f, test);
    const academie = lab((t) => /^academie\b/.test(t));
    if (academie) s.cases.academie = aDroite(f, academie);
    const session = lab((t) => /^session\b/.test(t));
    if (session) s.cases.session = aDroite(f, session);
    const etab = lab((t) => /^etablissement\b/.test(t));
    if (etab) s.cases.etablissement = dessous(f, etab);
    const nomPrenom = lab((t) => /nom et prenom/.test(t));
    if (nomPrenom) { s.cases.nom = dessous(f, nomPrenom); s.cases.prenom = dessous(f, nomPrenom, 1); }
    const numero = lab((t) => /^(n°|no|numero)\s*(de\s*)?candidat/.test(t));
    if (numero) s.cases.numero = dessous(f, numero);
    const duree = lab((t) => /duree du cycle/.test(t));
    if (duree) s.cases.duree = dessous(f, duree);
    const derog = lab((t) => /^derogation$/.test(t));
    if (derog) s.cases.derogation = dessous(f, derog);
    const visa = lab((t) => /^visa/.test(t));
    if (visa) s.cases.visa = aDroite(f, visa);
    const debut = lab((t) => /^date (de )?debut/.test(t));
    if (debut) {
      const h = position(debut).ligne;
      const finC = dansLaLigne(f, h, (t) => /^date (de )?fin/.test(t));
      const ent = dansLaLigne(f, h, (t) => /entreprise/.test(t));
      const jours = dansLaLigne(f, h, (t) => /(duree|jours)/.test(t) && !/total/.test(t));
      const total = dansLaLigne(f, h, (t) => /total/.test(t));
      const bloc = total ? f.fusions.find((m) => m.de.col === position(`${total}1`).col && m.de.ligne === h + 1) : undefined;
      if (finC && ent && jours) s.lignes = { premiere: h + 1, nombre: bloc ? bloc.a.ligne - bloc.de.ligne + 1 : 5, debut: colonne(position(debut).col), fin: finC, entreprise: ent, jours };
    }
  }
  const syn = c.feuilles.find((x) => /synth/.test(normal(x.nom)));
  if (syn) {
    const num = chercher(syn, (t) => /num.*candidat|n° candidat/.test(t));
    if (num) {
      const h = position(num).ligne;
      const nom = dansLaLigne(syn, h, (t) => /^nom/.test(t));
      const prenom = dansLaLigne(syn, h, (t) => /^prenom/.test(t));
      if (nom && prenom) s.synthese = { feuille: syn.nom, premiere: h + 1, numero: colonne(position(num).col), nom, prenom };
    }
  }
  const garde = c.feuilles.find((x) => /garde/.test(normal(x.nom)));
  if (garde) {
    const num = chercher(garde, (t) => /(n°|numero|no)\s*candidat/.test(t));
    if (num) {
      const h = position(num).ligne;
      const g = (test: (t: string) => boolean) => dansLaLigne(garde, h, test) ?? undefined;
      const nom = g((t) => /^nom/.test(t)), prenom = g((t) => /^prenom/.test(t)), semaines = g((t) => /semaine/.test(t));
      const etabG = chercher(garde, (t) => /etablissement/.test(t));
      if (nom && prenom && semaines) {
        s.garde = {
          feuille: garde.nom, premiere: h + 1, numero: colonne(position(num).col), nom, prenom, semaines,
          duree: g((t) => /(bac|duree|ans)/.test(t)), derogation: g((t) => /derogation/.test(t)), observations: g((t) => /observation/.test(t)),
          etablissement: etabG && position(etabG).ligne < h ? aDroite(garde, etabG) : undefined,
        };
      }
    }
  }
  return s;
}

/** Ce qu'il manque au repérage pour remplir le fichier (vide : tout est trouvé). */
export function casesManquantes(s: StructureRecap): string[] {
  const m: string[] = [];
  if (!s.feuillesEleves.length) m.push("les onglets des élèves (« ELEVE 1 », « ELEVE 2 »…)");
  if (!s.lignes) m.push("le tableau des PFMP (dates de début et de fin, entreprise, jours)");
  if (!s.synthese && (!s.cases.nom || !s.cases.numero)) m.push("le nom et le numéro de chaque candidat");
  return m;
}

/* ------------------- Remplissage ------------------- */

export type Valeur = string | number | null;

/** Écrit une valeur dans une case, en gardant son style ; une case qui contient une formule n'est jamais remplacée. */
export function ecrireCase(xml: string, r: string, v: Valeur): string {
  const { ligne } = position(r);
  const cellule = (style: string) => {
    if (v === null || v === "") return `<c r="${r}"${style}/>`;
    if (typeof v === "number") return `<c r="${r}"${style}><v>${v}</v></c>`;
    return `<c r="${r}"${style} t="inlineStr"><is><t xml:space="preserve">${echappe(v)}</t></is></c>`;
  };
  const existe = new RegExp(`<c\\b(?=[^>]*\\br="${r}")([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = xml.match(existe);
  if (m) {
    if (/<f[\s>/]/.test(m[2] ?? "")) return xml;
    const style = m[1].match(/\ss="\d+"/)?.[0] ?? "";
    return xml.replace(existe, cellule(style));
  }
  // La case n'existe pas : on l'ajoute dans sa ligne, à sa place.
  const ligneRe = new RegExp(`<row\\b(?=[^>]*\\br="${ligne}")([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const l = xml.match(ligneRe);
  if (!l) {
    const nouvelle = `<row r="${ligne}">${cellule("")}</row>`;
    const suivante = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)].find((x) => Number(x[1]) > ligne);
    if (suivante) return xml.slice(0, suivante.index) + nouvelle + xml.slice(suivante.index);
    return xml.includes("<sheetData/>") ? xml.replace("<sheetData/>", `<sheetData>${nouvelle}</sheetData>`) : xml.replace("</sheetData>", `${nouvelle}</sheetData>`);
  }
  const contenu = l[3] ?? "";
  const col = position(r).col;
  const apres = [...contenu.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)].find((x) => position(`${x[1]}1`).col > col);
  const nouveau = apres ? contenu.slice(0, apres.index) + cellule("") + contenu.slice(apres.index) : contenu + cellule("");
  return xml.replace(ligneRe, `<row${l[1]}>${nouveau}</row>`);
}

/** Les formules se recalculent à l'ouverture : on retire leurs anciens résultats et la chaîne de calcul. */
function recalculer(fichiers: Map<string, Buffer>) {
  for (const [n, b] of fichiers) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) continue;
    fichiers.set(n, Buffer.from(b.toString("utf8").replace(/(<f(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v>/g, "$1"), "utf8"));
  }
  let wb = fichiers.get("xl/workbook.xml")!.toString("utf8");
  wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, a, s) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"${s}>`)
    : wb.replace("</workbook>", `<calcPr fullCalcOnLoad="1"/></workbook>`);
  fichiers.set("xl/workbook.xml", Buffer.from(wb, "utf8"));
  if (fichiers.has("xl/calcChain.xml")) {
    fichiers.delete("xl/calcChain.xml");
    const ct = fichiers.get("[Content_Types].xml")!.toString("utf8").replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "");
    fichiers.set("[Content_Types].xml", Buffer.from(ct, "utf8"));
    const rels = fichiers.get("xl/_rels/workbook.xml.rels")!.toString("utf8").replace(/<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/, "");
    fichiers.set("xl/_rels/workbook.xml.rels", Buffer.from(rels, "utf8"));
  }
}

export type PfmpRecap = { debut: number; fin: number; entreprise: string; jours: number };
export type CandidatRecap = {
  numero: string; nom: string; prenom: string; duree: string; derogation: boolean; visa: boolean; pfmp: PfmpRecap[];
  /** Semaines effectuées et attendues : sur la page de garde quand elles manquent. */
  semaines: number; attendues: number | null;
};
export type DonneesRecap = { titre: string; academie: string; session: string; etablissement: string; candidats: CandidatRecap[] };

/** Remplit le modèle de l'académie pour une classe. */
export function remplirRecapitulatif(modele: Buffer, s: StructureRecap, d: DonneesRecap): Buffer {
  const c = ouvrirClasseur(modele);
  if (d.candidats.length > s.feuillesEleves.length) throw new Error(`Le modèle de l'académie prévoit ${s.feuillesEleves.length} élèves au plus ; la classe en compte ${d.candidats.length}.`);
  const xml = new Map<string, string>();
  const feuille = (nom: string) => { const f = c.feuilles.find((x) => x.nom === nom)!; if (!xml.has(f.chemin)) xml.set(f.chemin, c.fichiers.get(f.chemin)!.toString("utf8")); return f.chemin; };
  const ecrire = (nomFeuille: string, r: string | undefined, v: Valeur) => { if (!r) return; const ch = feuille(nomFeuille); xml.set(ch, ecrireCase(xml.get(ch)!, r, v)); };
  if (s.synthese) d.candidats.forEach((x, i) => {
    const l = s.synthese!.premiere + i;
    ecrire(s.synthese!.feuille, `${s.synthese!.numero}${l}`, x.numero || null);
    ecrire(s.synthese!.feuille, `${s.synthese!.nom}${l}`, x.nom);
    ecrire(s.synthese!.feuille, `${s.synthese!.prenom}${l}`, x.prenom);
  });
  s.feuillesEleves.forEach((nom, i) => {
    ecrire(nom, s.cases.titre, d.titre.toUpperCase());
    ecrire(nom, s.cases.academie, d.academie || null);
    ecrire(nom, s.cases.session, Number(d.session) || d.session);
    ecrire(nom, s.cases.etablissement, d.etablissement);
    const x = d.candidats[i];
    if (!x) return;
    ecrire(nom, s.cases.nom, x.nom);
    ecrire(nom, s.cases.prenom, x.prenom);
    ecrire(nom, s.cases.numero, x.numero || null);
    ecrire(nom, s.cases.duree, x.duree);
    ecrire(nom, s.cases.derogation, x.derogation ? "OUI" : "NON");
    ecrire(nom, s.cases.visa, x.visa ? "X" : null);
    if (s.lignes) x.pfmp.forEach((p, k) => {
      const l = s.lignes!.premiere + k;
      ecrire(nom, `${s.lignes!.debut}${l}`, p.debut);
      ecrire(nom, `${s.lignes!.fin}${l}`, p.fin);
      ecrire(nom, `${s.lignes!.entreprise}${l}`, p.entreprise);
      ecrire(nom, `${s.lignes!.jours}${l}`, p.jours);
    });
  });
  if (s.garde) {
    const g = s.garde;
    ecrire(g.feuille, g.etablissement, d.etablissement);
    d.candidats.filter((x) => x.attendues !== null && x.semaines < x.attendues).forEach((x, k) => {
      const l = g.premiere + k;
      ecrire(g.feuille, `${g.numero}${l}`, x.numero || null);
      ecrire(g.feuille, `${g.nom}${l}`, x.nom);
      ecrire(g.feuille, `${g.prenom}${l}`, x.prenom);
      ecrire(g.feuille, `${g.semaines}${l}`, Math.round(x.semaines * 10) / 10);
      if (g.duree) ecrire(g.feuille, `${g.duree}${l}`, x.duree);
      if (g.derogation) ecrire(g.feuille, `${g.derogation}${l}`, x.derogation ? "OUI" : "NON");
      if (g.observations) ecrire(g.feuille, `${g.observations}${l}`, `${Math.round((x.attendues! - x.semaines) * 10) / 10} semaine(s) manquante(s) sur ${x.attendues}`);
    });
  }
  for (const [ch, x] of xml) c.fichiers.set(ch, Buffer.from(x, "utf8"));
  recalculer(c.fichiers);
  return ecrireZip(c.fichiers);
}

/** « 26/10/2026 » ou « 2026-10-26 » → numéro de jour d'Excel. */
export function jourExcel(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}
