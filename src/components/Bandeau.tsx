"use client";
import { useSearchParams } from "next/navigation";

/** Message de confirmation passé dans l'adresse après une action (paramètre « msg »). */
export function Bandeau() {
  const sp = useSearchParams();
  const msg = sp.get("msg");
  if (!msg) return null;
  return <p className={`msg ${sp.get("ton") === "err" ? "err" : "ok"}`} role="status">{msg}</p>;
}
