import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { estGestionnaire } from "@/lib/acces";
import { elevesSuivis, classesAvecPeriodes } from "@/lib/requetes";
import { classesGerees } from "@/lib/acces";
import { STATUTS, problemes, type Statut } from "@/lib/regles";
import { Pastille } from "@/components/ui";
import { dateCourte } from "@/lib/dates";

export const metadata = { title: "Élèves" };

const FILTRES: [string, string][] = [
  ["", "Tous"], ["sans_stage", "Sans lieu de stage"], ["convention", "Convention incomplète"],
  ["documents", "Documents à rendre"], ["hors_regles", "Hors règles"], ["rattrapages", "Rattrapages"],
  ["absences", "Absences non justifiées"],
];

export default async function Eleves({ searchParams }: { searchParams: Promise<{ classe?: string; statut?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/");
  const classes = await classesAvecPeriodes(ctx, await classesGerees(ctx));
  const classe = classes.find((c) => c.id === sp.classe)?.id;
  let lignes = await elevesSuivis(ctx, classe);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) lignes = lignes.filter((l) => `${l.eleve.prenom} ${l.eleve.nom}`.toLowerCase().includes(q));
  if (sp.statut === "hors_regles") lignes = lignes.filter((l) => l.stage && !l.conforme);
  else if (sp.statut === "rattrapages") lignes = lignes.filter((l) => l.rattrapages.length > 0);
  else if (sp.statut === "absences") lignes = lignes.filter((l) => l.absencesNonJustifiees > 0);
  else if (sp.statut === "convention") lignes = lignes.filter((l) => l.statut === "convention" || l.statut === "en_stage_sans_convention");
  else if (sp.statut && sp.statut in STATUTS) lignes = lignes.filter((l) => l.statut === (sp.statut as Statut));
  const lien = (o: { classe?: string; statut?: string }) => {
    const u = new URLSearchParams();
    const c = "classe" in o ? o.classe : classe; const s = "statut" in o ? o.statut : sp.statut;
    if (c) u.set("classe", c); if (s) u.set("statut", s); if (q) u.set("q", q);
    return `/eleves${u.size ? "?" + u : ""}`;
  };
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>Élèves</h1><p className="sub">{lignes.length} élève(s) affiché(s)</p></div>
        <div className="actions">
          <Link className="btn" href="/eleves/import">Importer un fichier</Link>
          <Link className="btn primary" href="/eleves/nouveau">Ajouter un élève</Link>
        </div>
      </div>
      <div className="chips">
        <Link className="chip" href={lien({ classe: undefined })} aria-current={!classe ? "true" : undefined}>Toutes les classes</Link>
        {classes.map((c) => <Link key={c.id} className="chip" href={lien({ classe: c.id })} aria-current={classe === c.id ? "true" : undefined}>{c.libelle}</Link>)}
      </div>
      <div className="chips">
        {FILTRES.map(([k, l]) => <Link key={k} className="chip" href={lien({ statut: k || undefined })} aria-current={(sp.statut ?? "") === k ? "true" : undefined}>{l}</Link>)}
      </div>
      <form className="actions" action="/eleves">
        {classe && <input type="hidden" name="classe" value={classe} />}
        {sp.statut && <input type="hidden" name="statut" value={sp.statut} />}
        <label className="f" htmlFor="q" style={{ flex: 1 }}>Rechercher un élève<input id="q" name="q" defaultValue={sp.q} placeholder="Nom ou prénom" /></label>
        <button className="btn">Rechercher</button>
      </form>
      <div className="panel rows">
        {lignes.length === 0 && <div className="empty">Aucun élève ne correspond. <Link href="/eleves/nouveau">Ajouter un élève</Link> ou <Link href="/eleves/import">importer une liste</Link>.</div>}
        {lignes.map((l) => (
          <Link key={l.eleve.id} href={`/eleves/${l.eleve.id}`} className="row">
            <div className="main">
              <div className="name">{l.eleve.nom} {l.eleve.prenom} <span className="cls">{l.classe.libelle}</span></div>
              <div className="meta">
                {l.entreprise ? l.entreprise.nom : "Aucune entreprise"}
                {l.stage && !l.conforme && <span style={{ color: "var(--bad)", fontWeight: 700 }}> · hors règles : {problemes(l.regles)}</span>}
                {l.rattrapages.length > 0 && ` · rattrapage du ${dateCourte(l.rattrapages[0].debut)} au ${dateCourte(l.rattrapages[0].fin)}`}
                {l.absencesNonJustifiees > 0 && <span style={{ color: "var(--bad)", fontWeight: 700 }}> · {l.absencesNonJustifiees} absence(s) non justifiée(s)</span>}
                {l.referent && ` · référent ${l.referent}`}
              </div>
            </div>
            {l.statut ? <Pastille statut={l.statut} /> : <span className="pill t-muted">Pas de période</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
