import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire } from "@/lib/acces";
import { entreprisesDuLycee, historiqueAccueil } from "@/lib/stages";
import { domaines } from "@/lib/domaines";
import { Pill } from "@/components/ui";

export const metadata = { title: "Entreprises" };

export default async function Entreprises({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const ctx = await contexte();
  const gestion = await estGestionnaire(ctx);
  if (!gestion && !a(ctx, "professeur", "direction")) redirect("/");
  const sp = await searchParams;
  const toutes = await entreprisesDuLycee(ctx);
  const hist = await historiqueAccueil(ctx);
  const doms = await domaines(ctx);
  const q = (sp.q ?? "").trim().toLowerCase();
  const liste = toutes.filter((e) =>
    (!sp.f || e.secteur === sp.f || e.domaine === sp.f) &&
    (!q || `${e.nom} ${e.ville ?? ""} ${e.tuteurNom ?? ""}`.toLowerCase().includes(q)));
  const filtres: [string, string][] = [["", "Toutes"], ["prive", "Privé"], ["public", "Public"], ...doms.map((d) => [d, d] as [string, string])];
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>Entreprises partenaires</h1><p className="sub">Annuaire partagé par toute l&apos;équipe : qui accueille, dans quel domaine, avec quel tuteur.</p></div>
        {gestion && <Link className="btn primary" href="/entreprises/nouvelle">Ajouter une entreprise</Link>}
      </div>
      <div className="chips">
        {filtres.map(([k, l]) => <Link key={k} className="chip" href={k ? `/entreprises?f=${encodeURIComponent(k)}` : "/entreprises"} aria-current={(sp.f ?? "") === k ? "true" : undefined}>{l}</Link>)}
      </div>
      <form className="actions" action="/entreprises">
        {sp.f && <input type="hidden" name="f" value={sp.f} />}
        <label className="f" htmlFor="q" style={{ flex: 1 }}>Rechercher<input id="q" name="q" defaultValue={sp.q} placeholder="Nom, ville ou tuteur" /></label>
        <button className="btn">Rechercher</button>
      </form>
      <div className="panel rows">
        {liste.length === 0 && <div className="empty">Aucune entreprise.</div>}
        {liste.map((e) => (
          <Link key={e.id} href={`/entreprises/${e.id}`} className="row">
            <div className="main">
              <div className="name">{e.nom}</div>
              <div className="meta">{[e.domaine, e.ville, e.tuteurNom && `tuteur ${e.tuteurNom}`].filter(Boolean).join(" · ")} · {e.placesParDefaut} place(s) par période · {hist.get(e.id) ?? 0} élève(s) déjà accueilli(s)</div>
            </div>
            <Pill ton={e.secteur === "prive" ? "info" : "muted"}>{e.secteur === "prive" ? "Privé" : "Public"}</Pill>
          </Link>
        ))}
      </div>
    </>
  );
}
