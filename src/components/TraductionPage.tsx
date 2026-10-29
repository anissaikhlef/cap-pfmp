"use client";
import { useEffect } from "react";

/**
 * L'espace « Mon enfant » dans la langue de la famille (décision d'Anissa), avec le français dessous : chaque titre,
 * paragraphe ou ligne reçoit sa traduction au-dessus du texte français (attribut data-traduction, affiché en CSS), sans
 * toucher au contenu géré par la page. Les nouveaux textes (après une action) sont traduits à leur tour.
 */
const SELECTEUR = "h1, h2, h3, p, li, label, .meta, .name, .sub, .msg, .note, summary";

export function TraductionPage({ eleveId, langue, droiteAGauche }: { eleveId: string; langue: string; droiteAGauche: boolean }) {
  useEffect(() => {
    const zone = document.getElementById(`eleve-${eleveId}`);
    if (!zone) return;
    const memoire = new Map<string, string>();
    let enCours = false;
    const texteDe = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    // Un élément dont un descendant sera lui-même traduit n'est pas traduit en entier (pas de doublon).
    const cibles = () => [...zone.querySelectorAll(SELECTEUR)].filter((el) => !el.querySelector(SELECTEUR) && texteDe(el).length > 1 && !el.closest("textarea, select, pre"));
    const appliquer = () => {
      for (const el of cibles()) {
        const t = memoire.get(texteDe(el));
        if (t && el.getAttribute("data-traduction") !== t) {
          el.setAttribute("data-traduction", t);
          if (droiteAGauche) el.setAttribute("data-traduction-rtl", "");
        }
      }
    };
    const traduire = async () => {
      if (enCours) return;
      const textes = [...new Set(cibles().map(texteDe))].filter((t) => !memoire.has(t)).slice(0, 150);
      if (!textes.length) return appliquer();
      enCours = true;
      try {
        const r = await fetch("/api/traduire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eleveId, textes }) });
        if (r.ok) {
          const j = (await r.json()) as { traductions: (string | null)[] };
          textes.forEach((t, i) => memoire.set(t, j.traductions[i] ?? ""));
        }
      } finally {
        enCours = false;
      }
      appliquer();
    };
    void traduire();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const obs = new MutationObserver(() => { clearTimeout(minuterie); minuterie = setTimeout(() => void traduire(), 400); });
    obs.observe(zone, { childList: true, subtree: true, characterData: true });
    return () => { obs.disconnect(); clearTimeout(minuterie); };
  }, [eleveId, langue, droiteAGauche]);
  return <p className="note" lang="fr">Affichage en {langue}, avec le français dessous.</p>;
}
