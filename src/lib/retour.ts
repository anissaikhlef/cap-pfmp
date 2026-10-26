import "server-only";
import { redirect } from "next/navigation";

/** Revient sur la page d'origine du formulaire en affichant un message dans le bandeau. */
export function revenirAvec(fd: FormData | string, message: string, ton: "ok" | "err" = "ok"): never {
  const brut = typeof fd === "string" ? fd : String(fd.get("__retour") ?? "/");
  // Uniquement un chemin interne : jamais d'adresse externe (« //site » ou « http… »).
  const chemin = /^\/(?!\/)[\w\-/%.?=&]*$/.test(brut) ? brut : "/";
  const [base, query = ""] = chemin.split("?");
  const p = new URLSearchParams(query);
  p.delete("msg"); p.delete("ton");
  p.set("msg", message.slice(0, 300));
  if (ton === "err") p.set("ton", "err");
  redirect(`${base}?${p}`);
}
