"use client";
import { useRef, useState } from "react";

/** Répondre à l'oral : l'élève parle, sa réponse s'écrit dans la case (il peut la corriger avant d'envoyer). */
export function Dictee({ cible }: { cible: string }) {
  const [etat, setEtat] = useState<"pret" | "ecoute" | "lecture" | "erreur">("pret");
  const [message, setMessage] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const commencer = async () => {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(flux);
      morceaux.current = [];
      r.ondataavailable = (e) => morceaux.current.push(e.data);
      r.onstop = async () => {
        flux.getTracks().forEach((t) => t.stop());
        setEtat("lecture");
        const res = await fetch("/api/voix", { method: "POST", body: new Blob(morceaux.current, { type: r.mimeType }) });
        if (!res.ok) { setEtat("erreur"); setMessage(await res.text()); return; }
        const { texte } = (await res.json()) as { texte: string };
        const zone = document.getElementById(cible) as HTMLTextAreaElement | null;
        if (zone) zone.value = `${zone.value ? `${zone.value} ` : ""}${texte}`;
        setEtat("pret");
      };
      rec.current = r;
      r.start();
      setEtat("ecoute");
      setTimeout(() => { if (r.state === "recording") r.stop(); }, 60000);
    } catch {
      setEtat("erreur");
      setMessage("Le micro n'est pas disponible : autorisez-le, ou écrivez votre réponse.");
    }
  };
  return (
    <div className="actions">
      {etat === "ecoute"
        ? <button type="button" className="btn small danger" onClick={() => rec.current?.stop()}>Arrêter et écrire ma réponse</button>
        : <button type="button" className="btn small" onClick={commencer} disabled={etat === "lecture"}>{etat === "lecture" ? "Lecture de la voix…" : "Répondre à l'oral"}</button>}
      {etat === "erreur" && <span className="msg err">{message}</span>}
    </div>
  );
}
