"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";

/** Cadre où l'on dessine sa signature au doigt (téléphone, tablette) ou à la souris. */
function PaveSignature({ onChange }: { onChange: (image: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const trace = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const g = c.getContext("2d")!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111827";
  }, []);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const debut = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const g = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    trace.current = true;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 0.1, y + 0.1);
    g.stroke();
  };
  const suite = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!trace.current) return;
    const g = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    g.lineTo(x, y);
    g.stroke();
  };
  const fin = () => {
    if (!trace.current) return;
    trace.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const effacer = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange("");
  };
  return (
    <div className="section" style={{ gap: 6 }}>
      <span className="sub">Dessinez votre signature dans le cadre, avec le doigt ou la souris.</span>
      <canvas
        ref={ref}
        aria-label="Cadre de signature"
        onPointerDown={debut} onPointerMove={suite} onPointerUp={fin} onPointerLeave={fin} onPointerCancel={fin}
        style={{ width: "100%", maxWidth: 520, height: 150, touchAction: "none", background: "#fff", border: "1px dashed var(--muted)", borderRadius: 8, cursor: "crosshair" }}
      />
      <div><button type="button" className="btn small" onClick={effacer}>Effacer</button></div>
    </div>
  );
}

/**
 * Champs de signature : modèle (simple ou dessiné, selon ce que le lycée autorise), cadre de dessin,
 * et case « J'ai lu la convention ». Envoie modele, image et lu.
 */
export function ChoixSignature({ modeles }: { modeles: ("simple" | "dessinee")[] }) {
  const [modele, setModele] = useState(modeles[0]);
  const [image, setImage] = useState("");
  return (
    <>
      {modeles.length > 1 ? (
        <div className="choices" role="radiogroup" aria-label="Façon de signer" style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <label className="choice"><input type="radio" name="modele" value="simple" checked={modele === "simple"} onChange={() => setModele("simple")} /> Signature simple</label>
          <label className="choice"><input type="radio" name="modele" value="dessinee" checked={modele === "dessinee"} onChange={() => setModele("dessinee")} /> Signature dessinée</label>
        </div>
      ) : <input type="hidden" name="modele" value={modele} />}
      {modele === "dessinee" && <PaveSignature onChange={setImage} />}
      <input type="hidden" name="image" value={modele === "dessinee" ? image : ""} />
      <label className="check"><input type="checkbox" name="lu" /> J&apos;ai lu la convention et j&apos;accepte ses conditions.</label>
    </>
  );
}
