import Link from "next/link";
import { contexte } from "@/lib/auth";
import { a } from "@/lib/acces";
import { visitesAOrganiser } from "@/lib/visites";
import { quotasDuProfesseur } from "@/lib/heures";
import { aujourdhui, dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { EtatVisite } from "@/components/visites";
import { Pill } from "@/components/ui";
import { prendreVisite, rendreVisite } from "../visites/actions";

export const metadata = { title: "Mes visites" };

/** Visites confiées selon les heures de face à face : le professeur choisit ses lieux de stage. */
async function VisitesAChoisir({ ctx }: { ctx: Awaited<ReturnType<typeof contexte>> }) {
  const quotas = await quotasDuProfesseur(ctx, ctx.user.id);
  if (!quotas.length) return null;
  const lignes = await visitesAOrganiser(ctx, { periodeIds: quotas.map((q) => q.p.id) });
  return (
    <div className="section">
      <h2>Visites à choisir</h2>
      <p className="sub" style={{ margin: 0 }}>La gestion des stages vous a confié un nombre de visites, en proportion de vos heures de cours dans chaque classe. Choisissez vos lieux de stage : les élèves d&apos;une même entreprise se suivent dans la liste.</p>
      {quotas.map(({ q, p, c }) => {
        const deLaPeriode = lignes.filter((l) => l.p.id === p.id);
        const miennes = deLaPeriode.filter((l) => l.v?.visiteurId === ctx.user.id);
        const libres = deLaPeriode.filter((l) => !l.v?.visiteurId);
        const complet = miennes.length >= q.nombre;
        return (
          <div key={p.id} className="panel pad section">
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h3>{c.libelle} · {p.libelle} <span className="sub">du {dateCourte(p.debut)} au {dateCourte(p.fin)}</span></h3>
              <Pill ton={complet ? "ok" : "warn"}>{miennes.length} choisie{miennes.length > 1 ? "s" : ""} sur {q.nombre}</Pill>
            </div>
            {!complet && <p style={{ margin: 0 }}>Il vous reste <b>{q.nombre - miennes.length}</b> lieu{q.nombre - miennes.length > 1 ? "x" : ""} de stage à choisir.</p>}
            {miennes.length > 0 && (
              <div className="panel rows">
                {miennes.map((l) => (
                  <div key={l.s.id} className="row">
                    <div className="main">
                      <div className="name">{l.e.prenom} {l.e.nom}</div>
                      <div className="meta">{l.ent.nom}{l.ent.ville ? `, ${l.ent.ville}` : ""}</div>
                    </div>
                    <Pill ton="ok">Ma visite</Pill>
                    {!l.v?.compteRendu && l.v?.ordreMission !== "signe" && (
                      <form action={rendreVisite}><ChampRetour /><input type="hidden" name="visiteId" value={l.v!.id} /><button className="btn small">Rendre</button></form>
                    )}
                  </div>
                ))}
              </div>
            )}
            {libres.length > 0 ? (
              <div className="panel rows">
                {libres.map((l) => (
                  <div key={l.s.id} className="row">
                    <div className="main">
                      <div className="name">{l.e.prenom} {l.e.nom}</div>
                      <div className="meta">{l.ent.nom}{l.ent.ville ? `, ${l.ent.ville}` : ""}{l.ent.adresse ? ` · ${l.ent.adresse}` : ""}</div>
                    </div>
                    <form action={prendreVisite}>
                      <ChampRetour /><input type="hidden" name="stageId" value={l.s.id} />
                      <button className="btn small primary" disabled={complet} aria-label={`Je prends la visite de ${l.e.prenom} ${l.e.nom}`}>Je prends cette visite</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : <p className="sub" style={{ margin: 0 }}>Tous les lieux de stage de cette période ont déjà un visiteur.</p>}
          </div>
        );
      })}
    </div>
  );
}

export default async function MesVisites() {
  const ctx = await contexte({ roles: ["professeur", "direction", "gestionnaire"] });
  const lignes = await visitesAOrganiser(ctx, { visiteurId: ctx.user.id });
  // Stages en cours dont l'appel au tuteur de la première semaine n'est pas encore noté
  const jour = aujourdhui();
  const appels = lignes.filter((l) => l.v && !l.v.appel && l.p.debut <= jour && jour <= l.p.fin);
  return (
    <>
      <div><h1>Mes visites</h1><p className="sub">{lignes.length} visite(s) qui vous sont attribuées cette année.</p></div>
      {appels.length > 0 && (
        <div className="section">
          <h2>Appels au tuteur à passer ({appels.length})</h2>
          <p className="sub" style={{ margin: 0 }}>Pendant la première semaine de stage, téléphonez au tuteur pour vérifier que tout se passe bien, puis notez ses réponses : elles figurent sur l&apos;ordre de mission.</p>
          <div className="panel rows">
            {appels.map((l) => (
              <Link key={l.s.id} href={`/visites/${l.v!.id}#appel`} className="row">
                <div className="main">
                  <div className="name">{l.e.prenom} {l.e.nom} <span className="cls">{l.c.libelle}</span></div>
                  <div className="meta">{l.ent.nom} · tuteur {l.s.tuteur?.nom ?? l.ent.tuteurNom ?? "—"} · stage depuis le {dateCourte(l.p.debut)}</div>
                </div>
                <span className="num">{l.s.tuteur?.telephone ?? l.ent.telephone ?? ""}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {ctx.etab.reglages.repartition === "heures" && a(ctx, "professeur") && <VisitesAChoisir ctx={ctx} />}
      <div className="section">
        {ctx.etab.reglages.repartition === "heures" && <h2>Mes visites</h2>}
        <div className="panel rows">
          {lignes.length === 0 && <div className="empty">Aucune visite ne vous est attribuée pour l&apos;instant.</div>}
          {lignes.map((l) => (
            <Link key={l.s.id} href={`/visites/${l.v!.id}`} className="row">
              <div className="main">
                <div className="name">{l.e.prenom} {l.e.nom} <span className="cls">{l.c.libelle}</span> {l.p.eleveId && <Pill ton="warn">Rattrapage</Pill>}</div>
                <div className="meta">{l.ent.nom}{l.ent.ville ? `, ${l.ent.ville}` : ""} · stage du {dateCourte(l.p.debut)} au {dateCourte(l.p.fin)}</div>
              </div>
              <EtatVisite l={l} ctx={ctx} />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
