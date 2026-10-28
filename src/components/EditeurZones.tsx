"use client";
import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import type { ZonePdf } from "@/db/schema";
import type { SourceZone } from "@/lib/zones";
import { Formulaire, type Etat } from "./Formulaire";

/** Une page du PDF, dessinée à l'écran : sa taille en points PDF et l'échelle d'affichage. */
type Page = { l: number; h: number; echelle: number };
type Brouillon = { page: number; x0: number; y0: number; x1: number; y1: number };

const SORTES = { texte: "texte", croix: "croix", signature: "signature" } as const;

/**
 * Éditeur des zones du PDF du lycée (même un PDF sans champs) : on trace une zone à la souris ou au doigt sur la page,
 * puis on choisit ce que Cap PFMP y écrit (une donnée, une croix, une signature, ou un texte fixe).
 */
export function EditeurZones({ type, cle, url, zones: initiales, sources, action }: {
  type: string; cle: string; url: string; zones: ZonePdf[]; sources: SourceZone[]; action: (e: Etat, fd: FormData) => Promise<Etat>;
}) {
  const [zones, setZones] = useState<ZonePdf[]>(initiales);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [erreur, setErreur] = useState("");
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const canvas = useRef<(HTMLCanvasElement | null)[]>([]);
  const boite = useRef<HTMLDivElement>(null);
  const libelles = new Map(sources.map((s) => [s.cle, s]));
  const groupes = [...new Set(sources.map((s) => s.groupe))];

  // Les pages du PDF, dessinées avec pdf.js dans le navigateur.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
        const largeur = Math.min(760, boite.current?.clientWidth ?? 760);
        const liste: Page[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const vue = page.getViewport({ scale: 1 });
          liste.push({ l: vue.width, h: vue.height, echelle: largeur / vue.width });
        }
        if (annule) return;
        setPages(liste);
        // Le dessin attend que les cadres des pages soient affichés.
        requestAnimationFrame(async () => {
          for (let n = 1; n <= doc.numPages; n++) {
            const c = canvas.current[n - 1];
            if (!c) continue;
            const page = await doc.getPage(n);
            const vue = page.getViewport({ scale: liste[n - 1].echelle * (window.devicePixelRatio || 1) });
            c.width = vue.width;
            c.height = vue.height;
            await page.render({ canvasContext: c.getContext("2d")!, viewport: vue }).promise;
          }
        });
      } catch {
        if (!annule) setErreur("Le PDF ne s'affiche pas dans ce navigateur. Essayez avec un navigateur à jour.");
      }
    })();
    return () => { annule = true; };
  }, [url]);

  const point = (e: PE<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function debut(page: number, e: PE<HTMLDivElement>) {
    if ((e.target as HTMLElement).dataset.zone) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setBrouillon({ page, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function bouge(e: PE<HTMLDivElement>) {
    if (!brouillon) return;
    const p = point(e);
    setBrouillon({ ...brouillon, x1: p.x, y1: p.y });
  }
  function fin() {
    if (!brouillon) return;
    const pg = pages[brouillon.page - 1];
    const k = pg.echelle;
    const gauche = Math.min(brouillon.x0, brouillon.x1), haut = Math.min(brouillon.y0, brouillon.y1);
    const l = Math.abs(brouillon.x1 - brouillon.x0), h = Math.abs(brouillon.y1 - brouillon.y0);
    setBrouillon(null);
    if (l < 6 || h < 6) return;
    // Les points PDF partent du bas de la page.
    const z: ZonePdf = {
      page: brouillon.page, x: Math.max(0, gauche / k), y: Math.max(0, pg.h - (haut + h) / k),
      l: Math.min(l / k, pg.l), h: Math.min(h / k, pg.h), source: "",
    };
    setZones((zs) => [...zs, z]);
    setChoisie(zones.length);
  }
  const change = (i: number, v: Partial<ZonePdf>) => setZones((zs) => zs.map((z, j) => (j === i ? { ...z, ...v } : z)));
  const supprime = (i: number) => { setZones((zs) => zs.filter((_, j) => j !== i)); setChoisie(null); };
  const nom = (z: ZonePdf) => (z.source === "fixe" ? `Texte fixe : ${z.fixe ?? ""}` : libelles.get(z.source)?.libelle ?? "À choisir");

  return (
    <div className="stack editeur-zones" ref={boite}>
      <p className="sub" style={{ margin: 0 }}>
        Tracez une zone sur la page, à la souris ou au doigt, à l&apos;endroit où Cap PFMP doit écrire, puis choisissez ce qu&apos;il y écrit.
        Pour une case à cocher, tracez la zone sur la case et choisissez une « case » : Cap PFMP y met une croix quand c&apos;est le cas.
      </p>
      {erreur && <p className="msg err">{erreur}</p>}
      {!erreur && !pages.length && <p className="sub">Chargement du PDF…</p>}
      {pages.map((pg, n) => (
        <div key={n} className="page-pdf" style={{ position: "relative", width: pg.l * pg.echelle, height: pg.h * pg.echelle, maxWidth: "100%" }}>
          <canvas ref={(c) => { canvas.current[n] = c; }} style={{ width: pg.l * pg.echelle, height: pg.h * pg.echelle, display: "block" }} aria-label={`Page ${n + 1} du PDF`} />
          <div id={`zones-page-${n + 1}`} className="zones-page" onPointerDown={(e) => debut(n + 1, e)} onPointerMove={bouge} onPointerUp={fin}
            style={{ position: "absolute", inset: 0, cursor: "crosshair", touchAction: "none" }}>
            {zones.map((z, i) => z.page === n + 1 && (
              <button key={i} type="button" data-zone={i} title={nom(z)} onClick={() => setChoisie(i)} className={`zone-pdf${i === choisie ? " choisie" : ""}${z.source ? "" : " vide"}`}
                style={{ position: "absolute", left: z.x * pg.echelle, top: (pg.h - z.y - z.h) * pg.echelle, width: z.l * pg.echelle, height: z.h * pg.echelle }}>
                <span data-zone={i}>{i + 1}</span>
              </button>
            ))}
            {brouillon?.page === n + 1 && (
              <div className="zone-pdf brouillon" style={{ position: "absolute", left: Math.min(brouillon.x0, brouillon.x1), top: Math.min(brouillon.y0, brouillon.y1), width: Math.abs(brouillon.x1 - brouillon.x0), height: Math.abs(brouillon.y1 - brouillon.y0) }} />
            )}
          </div>
          <span className="sub">Page {n + 1}</span>
        </div>
      ))}
      <Formulaire action={action} bouton="Enregistrer les zones" id="zones" viderApres={false}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="cle" value={cle} />
        <input type="hidden" name="zones" value={JSON.stringify(zones)} />
        <b>{zones.length} zone(s)</b>
        {!zones.length && <p className="sub" style={{ margin: 0 }}>Aucune zone pour l&apos;instant : tracez-en une sur la page.</p>}
        <div className="panel rows">
          {zones.map((z, i) => (
            <div key={i} className={`row zone-ligne${i === choisie ? " choisie" : ""}`} onFocus={() => setChoisie(i)}>
              <span className="num">{i + 1}</span>
              <span className="sub" style={{ minWidth: 60 }}>page {z.page}</span>
              <label className="f" htmlFor={`zone-src-${i}`} style={{ flex: 2, minWidth: 220 }}><span className="vh">Contenu de la zone {i + 1}</span>
                <select id={`zone-src-${i}`} value={z.source} onChange={(e) => change(i, { source: e.target.value })}>
                  <option value="">— Que doit écrire Cap PFMP ? —</option>
                  <option value="fixe">Texte fixe…</option>
                  {groupes.map((g) => (
                    <optgroup key={g} label={g}>
                      {sources.filter((s) => s.groupe === g).map((s) => <option key={s.cle} value={s.cle}>{s.libelle}{s.sorte !== "texte" ? ` (${SORTES[s.sorte]})` : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              {z.source === "fixe" && <label className="f" htmlFor={`zone-fixe-${i}`} style={{ flex: 1, minWidth: 160 }}><span className="vh">Texte fixe de la zone {i + 1}</span><input id={`zone-fixe-${i}`} value={z.fixe ?? ""} onChange={(e) => change(i, { fixe: e.target.value })} placeholder="Texte fixe" maxLength={300} /></label>}
              <button type="button" className="btn small" onClick={() => supprime(i)}>Supprimer</button>
            </div>
          ))}
        </div>
      </Formulaire>
    </div>
  );
}
