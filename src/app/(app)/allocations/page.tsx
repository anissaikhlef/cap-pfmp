import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { classesGerees, estGestionnaire } from "@/lib/acces";
import { classesAvecPeriodes } from "@/lib/requetes";
import { dossierComplet, piecesAllocation, piecesAVerifier, piecesManquantes, stagesAllocation } from "@/lib/allocations";
import { EtatPiece } from "@/components/allocation";
import { Pill } from "@/components/ui";

export const metadata = { title: "Allocations" };

const FILTRES = [
  ["", "Tous les élèves"],
  ["manquantes", "Pièces manquantes"],
  ["a_verifier", "Pièces à vérifier"],
  ["attestations", "Attestations attendues"],
  ["complets", "Dossiers complets"],
] as const;
type Filtre = (typeof FILTRES)[number][0];

/** Suivi des dossiers d'allocation de stage, classe par classe : pièces, attestations, jours effectués. */
export default async function Allocations({ searchParams }: { searchParams: Promise<{ classe?: string; filtre?: string }> }) {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) redirect("/");
  const sp = await searchParams;
  const gerees = await classesGerees(ctx);
  const classes = await classesAvecPeriodes(ctx, gerees);
  const classe = classes.find((c) => c.id === sp.classe)?.id;
  const filtre: Filtre = FILTRES.find(([k]) => k === sp.filtre)?.[0] ?? "";
  const eleves = await db.select({ e: schema.eleves, classe: schema.classes.libelle }).from(schema.eleves)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), inArray(schema.eleves.classeId, classe ? [classe] : gerees), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.classes.libelle), asc(schema.eleves.nom), asc(schema.eleves.prenom));
  const ids = eleves.map((x) => x.e.id);
  const pieces = await piecesAllocation(ids);
  const stages = await stagesAllocation(ctx, ids);
  const lignes = eleves.map(({ e, classe }) => {
    const p = pieces.get(e.id);
    const st = stages.get(e.id) ?? [];
    const termines = st.filter((s) => s.termine);
    return {
      e, classe, p, st,
      manquantes: piecesManquantes(p).length > 0,
      aVerifier: piecesAVerifier(p) || st.some((s) => s.attestation?.statut === "a_verifier"),
      attestationsAttendues: termines.filter((s) => s.attestation?.statut !== "valide").length,
      termines: termines.length,
      jours: st.reduce((t, s) => t + s.bilan.effectues, 0),
      complet: dossierComplet(p, st),
    };
  });
  const garde: Record<Filtre, (l: (typeof lignes)[number]) => boolean> = {
    "": () => true,
    manquantes: (l) => l.manquantes,
    a_verifier: (l) => l.aVerifier,
    attestations: (l) => l.attestationsAttendues > 0,
    complets: (l) => l.complet,
  };
  const affichees = lignes.filter(garde[filtre]);
  const lien = (k: Partial<{ classe: string; filtre: string }>) => {
    const q = new URLSearchParams();
    const c = "classe" in k ? k.classe : classe;
    const f = "filtre" in k ? k.filtre : filtre;
    if (c) q.set("classe", c);
    if (f) q.set("filtre", f);
    return `/allocations${q.size ? `?${q}` : ""}`;
  };
  const exporter = `/allocations/export${classe ? `?classe=${classe}` : ""}`;

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Allocations de stage</h1>
          <p className="sub">RIB et pièce d&apos;identité déposés par les familles, attestations de stage et jours effectués par semaine (absences déduites). Le montant n&apos;est pas calculé ici.</p>
        </div>
        <a className="btn" href={exporter} download>Exporter pour un tableur</a>
      </div>
      <div className="kpis">
        <Link href={lien({ filtre: "complets" })} className="kpi ok"><b>{lignes.filter((l) => l.complet).length}</b><span>dossiers complets sur {lignes.length}</span></Link>
        <Link href={lien({ filtre: "manquantes" })} className="kpi bad"><b>{lignes.filter((l) => l.manquantes).length}</b><span>élèves sans RIB ou pièce d&apos;identité</span></Link>
        <Link href={lien({ filtre: "a_verifier" })} className="kpi warn"><b>{lignes.filter((l) => l.aVerifier).length}</b><span>élèves avec une pièce à vérifier</span></Link>
        <Link href={lien({ filtre: "attestations" })} className="kpi warn"><b>{lignes.filter((l) => l.attestationsAttendues > 0).length}</b><span>attestations de stage attendues</span></Link>
      </div>
      <div className="section">
        <div className="chips" aria-label="Classes">
          <Link className="chip" href={lien({ classe: "" })} aria-current={!classe ? "true" : undefined}>Toutes les classes</Link>
          {classes.map((c) => <Link key={c.id} className="chip" href={lien({ classe: c.id })} aria-current={classe === c.id ? "true" : undefined}>{c.libelle}</Link>)}
        </div>
        <div className="chips" aria-label="Filtres">
          {FILTRES.map(([k, libelle]) => <Link key={k || "tous"} className="chip" href={lien({ filtre: k })} aria-current={filtre === k ? "true" : undefined}>{libelle}</Link>)}
        </div>
        <div className="panel rows">
          {affichees.length === 0 && <div className="empty">Aucun élève.</div>}
          {affichees.map((l) => (
            <Link key={l.e.id} href={`/eleves/${l.e.id}#allocation-${l.e.id}`} className="row">
              <div className="main" style={{ minWidth: 220 }}>
                <div className="name">{l.e.nom} {l.e.prenom} <span className="cls">{l.classe}</span></div>
                <div className="meta">
                  {l.st.length === 0
                    ? "Aucun stage cette année"
                    : `${l.jours} jour${l.jours > 1 ? "s" : ""} effectué${l.jours > 1 ? "s" : ""} cette année · ${l.termines ? `attestations reçues : ${l.termines - l.attestationsAttendues}/${l.termines}` : "aucun stage terminé"}`}
                </div>
              </div>
              <div className="chips">
                <EtatPiece type="rib" d={l.p?.rib} gestion />
                <EtatPiece type="piece_identite" d={l.p?.piece_identite} gestion />
                {l.complet && <Pill ton="ok">Dossier complet</Pill>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
