"use client";
import { usePathname, useSearchParams } from "next/navigation";

/** Champ caché indiquant la page d'origine, pour y revenir après l'action. */
export function ChampRetour() {
  const chemin = usePathname();
  const sp = new URLSearchParams(useSearchParams());
  sp.delete("msg"); sp.delete("ton");
  return <input type="hidden" name="__retour" value={chemin + (sp.size ? `?${sp}` : "")} />;
}
