import Link from "next/link";
import { contexte } from "@/lib/auth";
import { visitesAOrganiser } from "@/lib/visites";
import { dateCourte } from "@/lib/dates";
import { EtatVisite } from "@/components/visites";

export const metadata = { title: "Mes visites" };

export default async function MesVisites() {
  const ctx = await contexte({ roles: ["professeur", "direction", "gestionnaire"] });
  const lignes = await visitesAOrganiser(ctx, { visiteurId: ctx.user.id });
  return (
    <>
      <div><h1>Mes visites</h1><p className="sub">{lignes.length} visite(s) qui vous sont attribuées cette année.</p></div>
      <div className="panel rows">
        {lignes.length === 0 && <div className="empty">Aucune visite ne vous est attribuée pour l&apos;instant.</div>}
        {lignes.map((l) => (
          <Link key={l.s.id} href={`/visites/${l.v!.id}`} className="row">
            <div className="main">
              <div className="name">{l.e.prenom} {l.e.nom} <span className="cls">{l.c.libelle}</span></div>
              <div className="meta">{l.ent.nom}{l.ent.ville ? `, ${l.ent.ville}` : ""} · stage du {dateCourte(l.p.debut)} au {dateCourte(l.p.fin)}</div>
            </div>
            <EtatVisite l={l} ctx={ctx} />
          </Link>
        ))}
      </div>
    </>
  );
}
