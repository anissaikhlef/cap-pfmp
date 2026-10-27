/** Lecture d'un CSV simple (séparateur ; ou , détecté), avec guillemets. */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const premiere = t.split("\n", 1)[0] ?? "";
  const sep = (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = "", guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guillemets) {
      if (ch === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (ch === '"') guillemets = false;
      else champ += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) { ligne.push(champ.trim()); champ = ""; }
    else if (ch === "\n") { ligne.push(champ.trim()); lignes.push(ligne); ligne = []; champ = ""; }
    else champ += ch;
  }
  if (champ || ligne.length) { ligne.push(champ.trim()); lignes.push(ligne); }
  return lignes.filter((l) => l.some((c) => c !== ""));
}

export function normaliserEntete(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
}

/** Accepte 2009-03-14 ou 14/03/2009. */
export function lireDate(s: string): string | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Heures hebdomadaires : « 6 », « 6,5 », « 6.5 », « 6h », « 6h30 », « 6 h 30 », « 06:30 ». Entre 0 et 40, sinon null. */
export function lireHeures(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?:[.,](\d+))?h?$/);
  let h: number | null = null;
  if (m) h = Number(`${m[1]}.${m[2] ?? "0"}`);
  else if ((m = t.match(/^(\d{1,2})[h:](\d{2})$/))) h = Number(m[1]) + Number(m[2]) / 60;
  if (h === null || !Number.isFinite(h) || h < 0 || h > 40) return null;
  return Math.round(h * 100) / 100;
}

/**
 * Écrit un fichier CSV lisible par Excel en français : séparateur « ; », guillemets si besoin,
 * marque d'ordre des octets en tête pour que les accents s'affichent correctement.
 */
export function versCsv(lignes: (string | number | null | undefined)[][]): string {
  const cellule = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Une cellule qui commence par = + - @ serait lue comme une formule par le tableur : on la neutralise.
    const sur = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[;"\n\r]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
  };
  return "﻿" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

/** Comparaison de noms sans accents, sans casse, sans ponctuation. */
export function cleNom(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
