import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire, idsElevesReferent } from "@/lib/acces";
import { elevesSuivis, classesAvecPeriodes, texteperiode, periodeDeReference } from "@/lib/requetes";
import { STATUTS, problemes, type Statut } from "@/lib/regles";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { Pastille } from "@/components/ui";
import { ChampRetour } from "@/components/ChampRetour";
import { listeOrdresASigner } from "@/components/visites";
import { visitesAOrganiser } from "@/lib/visites";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { envoyerRelancesDuJour } from "./actions";

export const metadata = { title: "Tableau de bord" };

const COULEURS: Record<Statut, string> = {
  sans_stage: "var(--bad)", convention: "var(--warn)", pret: "var(--ok)", en_stage: "var(--info)",
  en_stage_sans_convention: "var(--bad)", documents: "var(--warn)", termine: "var(--ok)",
};
const ORDRE: Statut[] = ["sans_stage", "convention", "pret", "en_stage", "en_stage_sans_convention", "documents", "termine"];

export default async function Accueil() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx))) {
    if (a(ctx, "vie_scolaire")) redirect("/vie-scolaire");
    if (a(ctx, "eleve")) redirect("/mon-stage");
    if (a(ctx, "parent")) redirect("/mon-enfant");
    if (a(ctx, "entreprise")) redirect("/stagiaires");
    if (a(ctx, "professeur")) redirect((await idsElevesReferent(ctx)).length ? "/mes-eleves" : "/mes-visites");
    return (
      <div className="section">
        <h1>Bonjour {ctx.user.prenom}</h1>
        <p className="sub">Vous n&apos;avez pas encore d&apos;élèves à suivre. Les visites qui vous sont attribuées apparaîtront ici.</p>
      </div>
    );
  }

  const lignes = await elevesSuivis(ctx);
  const classes = await classesAvecPeriodes(ctx, [...new Set(lignes.map((l) => l.classe.id))]);
  const n = (f: (l: (typeof lignes)[number]) => boolean) => lignes.filter(f).length;
  const sans = n((l) => l.statut === "sans_stage");
  const convIncomplete = n((l) => l.statut === "convention" || l.statut === "en_stage_sans_convention");
  const docs = n((l) => l.statut === "documents");
  const horsRegles = n((l) => !!l.stage && !l.conforme);

  const ids = lignes.map((l) => l.eleve.id);
  const [{ aVerifier }] = ids.length ? await db.select({ aVerifier: sql<number>`count(*)::int` }).from(schema.documents)
    .where(and(inArray(schema.documents.eleveId, ids), eq(schema.documents.statut, "a_verifier"))) : [{ aVerifier: 0 }];
  const visites = await visitesAOrganiser(ctx, { gerees: true });
  const sansVisiteur = visites.filter((v) => !v.v?.visiteurId && v.p.fin >= aujourdhui()).length;
  const crAFaire = ctx.etab.reglages.compteRendu ? visites.filter((v) => v.v?.visiteurId && v.v.date && v.v.date < aujourdhui() && !v.v.compteRendu).length : 0;
  const direction = a(ctx, "direction");
  const ordres = direction && ctx.etab.reglages.ordreMission ? (await listeOrdresASigner(ctx)).length : 0;
  const absencesNonJustifiees = lignes.reduce((t, l) => t + l.absencesNonJustifiees, 0);
  const aFaire: [number, string, string][] = ([
    [aVerifier, "document(s) déposé(s) à vérifier", "/documents"],
    [absencesNonJustifiees, "absence(s) en stage non justifiée(s)", "/eleves?statut=absences"],
    [sansVisiteur, "élève(s) en stage ou sur le départ sans visiteur", "/visites"],
    [crAFaire, "compte(s) rendu(s) de visite non rédigé(s)", "/visites"],
    [ordres, "ordre(s) de mission à signer", "/a-signer"],
  ] as [number, string, string][]).filter(([n]) => n > 0);

  const priorites = lignes
    .filter((l) => l.statut === "sans_stage" || l.statut === "en_stage_sans_convention" || (l.stage && !l.conforme) || l.statut === "documents")
    .sort((x, y) => (x.periode?.debut ?? "").localeCompare(y.periode?.debut ?? ""))
    .slice(0, 12);

  return (
    <>
      <div>
        <h1>Tableau de bord</h1>
        <p className="sub">Situation au {dateLongue(aujourdhui())} · {lignes.length} élèves suivis</p>
      </div>
      <div className="kpis">
        <Link href="/eleves?statut=sans_stage" className="kpi bad"><b>{sans}</b><span>sans lieu de stage</span></Link>
        <Link href="/eleves?statut=convention" className="kpi warn"><b>{convIncomplete}</b><span>conventions incomplètes</span></Link>
        <Link href="/eleves?statut=documents" className="kpi warn"><b>{docs}</b><span>attestations ou livrets attendus</span></Link>
        <Link href="/eleves?statut=hors_regles" className="kpi bad"><b>{horsRegles}</b><span>stages hors règles</span></Link>
      </div>

      <div className="panel pad section">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <h2>À faire</h2>
          <form action={envoyerRelancesDuJour}><ChampRetour /><button className="btn small">Envoyer les relances du jour</button></form>
        </div>
        {aFaire.length === 0 ? <p className="sub" style={{ margin: 0 }}>Rien en attente.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {aFaire.map(([n, l, href]) => <li key={l}><Link href={href}><b className="num">{n}</b> {l}</Link></li>)}
          </ul>
        )}
      </div>

      <div className="section">
        <h2>Par classe</h2>
        <div className="panel">
          {classes.length === 0 && <div className="empty">Aucune classe. <Link href="/classes">Créez vos classes et leurs périodes</Link>.</div>}
          {classes.map((c, i) => {
            const liste = lignes.filter((l) => l.classe.id === c.id);
            return (
              <div key={c.id} className="row" style={{ borderTop: i ? undefined : 0, alignItems: "flex-start" }}>
                <div style={{ width: 190 }}>
                  <Link href={`/eleves?classe=${c.id}`} className="name" style={{ color: "inherit" }}>{c.libelle}</Link>
                  <div className="meta">{texteperiode(periodeDeReference(c.periodes))}</div>
                </div>
                <div className="main" style={{ minWidth: 200 }}>
                  <div style={{ display: "flex", height: 12, borderRadius: 4, overflow: "hidden", background: "var(--line)" }} aria-hidden="true">
                    {ORDRE.map((s) => {
                      const k = liste.filter((l) => l.statut === s).length;
                      return k ? <i key={s} style={{ width: `${(k / liste.length) * 100}%`, background: COULEURS[s] }} /> : null;
                    })}
                  </div>
                  <div className="meta" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
                    {ORDRE.map((s) => {
                      const k = liste.filter((l) => l.statut === s).length;
                      return k ? <span key={s}>{STATUTS[s].libelle} <b className="num">{k}</b></span> : null;
                    })}
                    {liste.length === 0 && <span>Aucun élève</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>À traiter en priorité</h2>
        <div className="panel rows">
          {priorites.length === 0 && <div className="empty">Rien d&apos;urgent.</div>}
          {priorites.map((l) => (
            <Link key={l.eleve.id} href={`/eleves/${l.eleve.id}`} className="row">
              <div className="main">
                <div className="name">{l.eleve.prenom} {l.eleve.nom} <span className="cls">{l.classe.libelle}</span></div>
                <div className="meta">
                  {l.statut === "sans_stage" && `Aucun lieu de stage · ${texteperiode(l.periode)}`}
                  {l.statut !== "sans_stage" && l.entreprise?.nom}
                  {l.stage && !l.conforme && <span style={{ color: "var(--bad)", fontWeight: 700 }}> · Hors règles : {problemes(l.regles)}</span>}
                </div>
              </div>
              {l.statut && <Pastille statut={l.statut} />}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
