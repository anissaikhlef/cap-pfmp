import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { ecrireOctets, lireOctets } from "./stockage-brut";

/**
 * Stockage des fichiers déposés : contrôle du type réel et de la taille, puis écriture (voir stockage-brut.ts).
 */
export const TAILLE_MAX = 10 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/heic", ext: "heic", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && ["heic", "heix", "mif1", "msf1", "hevc"].includes(b.subarray(8, 12).toString("latin1")) },
];

/** Le type réel est déterminé par le contenu du fichier, jamais par son nom ni par ce que déclare le navigateur. */
export function typeReel(b: Buffer) {
  return SIGNATURES.find((s) => s.test(b)) ?? null;
}

export function nomPropre(nom: string) {
  const base = nom.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 80);
  return base || "document";
}

export type FichierEnregistre = { cle: string; mime: string; taille: number; nom: string };

export async function enregistrerFichier(etabId: string, f: File): Promise<FichierEnregistre | string> {
  if (!f || f.size === 0) return "Choisissez un fichier.";
  if (f.size > TAILLE_MAX) return "Fichier trop lourd : 10 Mo maximum.";
  const b = Buffer.from(await f.arrayBuffer());
  const t = typeReel(b);
  if (!t) return "Format non accepté. Déposez un PDF ou une photo (JPG, PNG, HEIC).";
  if (!/^[0-9a-f-]{36}$/.test(etabId)) return "Établissement invalide.";
  const cle = `${etabId}/${randomUUID()}.${t.ext}`;
  await ecrireOctets(db, cle, b);
  const nom = nomPropre(f.name.replace(/\.[^.]+$/, "")) + "." + t.ext;
  return { cle, mime: t.mime, taille: b.length, nom };
}

export async function lireFichier(cle: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|heic)$/.test(cle)) throw new Error("Clé invalide");
  return lireOctets(db, cle);
}
