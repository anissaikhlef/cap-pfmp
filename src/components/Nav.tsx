"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ liens }: { liens: { href: string; libelle: string }[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {liens.map((l) => {
        const actif = l.href === "/" ? path === "/" : path === l.href || path.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} aria-current={actif ? "page" : undefined}>{l.libelle}</Link>
        );
      })}
    </nav>
  );
}
