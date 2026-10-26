import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { idsElevesReferent } from "@/lib/acces";
import { dossierStage } from "@/lib/stages";
import { statutDossier } from "@/components/ResumeStage";
import { Pastille } from "@/components/ui";

export const metadata = { title: "Mes élèves" };

export default async function MesEleves() {
  const ctx = await contexte({ roles: ["professeur"] });
  const ids = await idsElevesReferent(ctx);
  const eleves = ids.length ? await db.select().from(schema.eleves).where(inArray(schema.eleves.id, ids)).orderBy(schema.eleves.nom) : [];
  const lignes = [];
  for (const e of eleves) {
    const d = await dossierStage(ctx, e);
    lignes.push({ e, d, statut: statutDossier(d, []) });
  }
  return (
    <>
      <div><h1>Mes élèves</h1><p className="sub">Les élèves dont vous êtes le professeur référent. La gestion des stages est assurée par {ctx.etab.reglages.gestion === "bde" ? "le bureau des entreprises" : "le DDFPT"}.</p></div>
      <div className="panel rows">
        {lignes.length === 0 && <div className="empty">Aucun élève.</div>}
        {lignes.map(({ e, d, statut }) => (
          <Link key={e.id} href={`/eleves/${e.id}`} className="row">
            <div className="main"><div className="name">{e.nom} {e.prenom} <span className="cls">{d.classe?.libelle}</span></div><div className="meta">{d.entreprise?.nom ?? "Aucune entreprise"}</div></div>
            {statut && <Pastille statut={statut} />}
          </Link>
        ))}
      </div>
    </>
  );
}
