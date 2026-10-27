import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire, peutAdministrer } from "@/lib/acces";
import { entreprisesDuLycee, historiqueAccueil } from "@/lib/stages";
import { partenariats } from "@/lib/partenariats";
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
  const notes = await partenariats(ctx);
  const q = (sp.q ?? "").trim().toLowerCase();
  const garde = (e: (typeof toutes)[number]) =>
    sp.f === "fiables" ? !!notes.get(e.id)?.fiable && !e.ecarteeLe
    : sp.f === "ecartees" ? !!e.ecarteeLe
    : !sp.f || e.secteur === sp.f || e.domaine === sp.f;
  // Les entreprises écartées viennent en dernier.
  const liste = toutes.filter((e) => garde(e) && (!q || `${e.nom} ${e.ville ?? ""} ${e.tuteurNom ?? ""}`.toLowerCase().includes(q)))
    .sort((x, y) => Number(!!x.ecarteeLe) - Number(!!y.ecarteeLe));
  const filtres: [string, string][] = [["", "Toutes"], ["fiables", "Partenaires fiables"], ["prive", "Privé"], ["public", "Public"], ...doms.map((d) => [d, d] as [string, string]), ["ecartees", "Écartées"]];
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>Entreprises partenaires</h1><p className="sub">Annuaire partagé par toute l&apos;équipe : qui accueille, dans quel domaine, avec quel tuteur.</p></div>
        <div className="actions">
          {peutAdministrer(ctx) && <Link className="btn" href="/entreprises/message">Écrire aux entreprises d&apos;accueil</Link>}
          {gestion && <Link className="btn primary" href="/entreprises/nouvelle">Ajouter une entreprise</Link>}
        </div>
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
        {liste.map((e) => {
          const n = notes.get(e.id);
          return (
            <Link key={e.id} href={`/entreprises/${e.id}`} className="row">
              <div className="main" style={{ minWidth: 220 }}>
                <div className="name">{e.nom}</div>
                <div className="meta">{[e.domaine, e.ville, e.tuteurNom && `tuteur ${e.tuteurNom}`].filter(Boolean).join(" · ")} · {e.placesParDefaut} place(s) par période · {hist.get(e.id) ?? 0} élève(s) déjà accueilli(s){n?.note !== null && n?.note !== undefined ? ` · partenariat ${n.note.toLocaleString("fr-FR")} sur 5` : ""}</div>
              </div>
              <div className="chips">
                {e.ecarteeLe ? <Pill ton="bad">Écartée</Pill> : n?.fiable && <Pill ton="ok">Partenaire fiable</Pill>}
                <Pill ton={e.secteur === "prive" ? "info" : "muted"}>{e.secteur === "prive" ? "Privé" : "Public"}</Pill>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
