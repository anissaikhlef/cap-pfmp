import "server-only";
import path from "node:path";
import { typeReel } from "./stockage";
import { texteDuPdf } from "./texte-pdf";

/**
 * Le texte d'un document déposé par l'élève (CV, lettre), lu sur le serveur de Cap PFMP, sans rien envoyer à l'extérieur
 * (décision d'Anissa, « la meilleure solution pour respecter le RGPD ») : le texte d'un PDF, ou la lecture d'une photo ou
 * d'un scan (reconnaissance de caractères, en français). Ensuite seulement, le nom et les coordonnées sont retirés.
 */
async function texteDeLImage(octets: Buffer): Promise<string | null> {
  try {
    // Chargé à l'exécution par Node, avec les données du français fournies avec l'application (aucun téléchargement).
    const T = (await import(/* webpackIgnore: true */ "tesseract.js")) as typeof import("tesseract.js");
    const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "fra", "4.0.0");
    const w = await T.createWorker("fra", 1, { langPath, cacheMethod: "none", gzip: true });
    try {
      const r = await w.recognize(octets);
      const t = r.data.text.replace(/[ \t]+/g, " ").trim();
      return t.length >= 40 ? t : null;
    } finally {
      await w.terminate();
    }
  } catch (e) {
    console.error("Lecture d'image :", e instanceof Error ? e.message : e);
    return null;
  }
}

export const TAILLE_MAX_DOCUMENT = 8 * 1024 * 1024;

/** Le texte d'un fichier déposé (PDF, JPG, PNG), ou un message simple si ce n'est pas possible. */
export async function texteDuDocument(f: File): Promise<{ texte: string } | { erreur: string }> {
  if (f.size === 0) return { erreur: "Choisissez un fichier." };
  if (f.size > TAILLE_MAX_DOCUMENT) return { erreur: "Fichier trop lourd : 8 Mo au plus." };
  const b = Buffer.from(await f.arrayBuffer());
  const t = typeReel(b);
  if (!t || t.ext === "heic") return { erreur: "Déposez un PDF ou une photo (JPG ou PNG)." };
  const texte = t.ext === "pdf" ? (await texteDuPdf(new Uint8Array(b))) ?? null : await texteDeLImage(b);
  if (t.ext === "pdf" && !texte) {
    // Un PDF scanné, sans texte : pas de lecture d'image pour un PDF ; on demande une photo nette ou le texte.
    return { erreur: "Ce PDF ne contient pas de texte (document scanné). Déposez une photo nette du document, ou collez son texte." };
  }
  if (!texte) return { erreur: "Le document est illisible. Déposez une photo plus nette (bien éclairée, à plat), ou collez son texte." };
  return { texte: texte.slice(0, 8000) };
}
