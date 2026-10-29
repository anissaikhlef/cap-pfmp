import "server-only";

/**
 * Le texte d'un PDF (document du lycée, CV déposé), lu sur le serveur de Cap PFMP, sans rien envoyer à l'extérieur.
 * null si le PDF n'a pas de texte (scan, photo) ou ne se lit pas.
 */
export async function texteDuPdf(octets: Uint8Array, maxPages = 20): Promise<string | null> {
  try {
    // Chargé à l'exécution par Node, sans passer par l'assemblage de Next (le module de pdfjs ne s'y prête pas).
    const pdfjs = (await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: octets.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      pages.push(c.items.map((x) => ("str" in x ? x.str : "")).join(" ").replace(/[ \t]+/g, " ").trim());
    }
    await doc.destroy();
    const t = pages.join("\n\n").trim();
    return t.length >= 20 ? t : null;
  } catch {
    return null;
  }
}
