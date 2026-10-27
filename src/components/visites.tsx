import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "@/lib/auth";
import { dateCourte, dateLongue } from "@/lib/dates";
import { Pill } from "./ui";
import { ChampRetour } from "./ChampRetour";
import { choisirCreneau, signerOrdreMission } from "@/app/(app)/visites/actions";
import { texteMode } from "@/lib/rendez-vous";
import { LienVisio } from "./LienVisio";
import type { LigneVisite } from "@/lib/visites";

export type OrdreASigner = { visiteId: string; eleve: string; entreprise: string; visiteur: string; date: string | null };

export async function listeOrdresASigner(ctx: Contexte): Promise<OrdreASigner[]> {
  const rows = await db.select({ v: schema.visites, e: schema.eleves, ent: schema.entreprises, u: schema.users })
    .from(schema.visites)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .innerJoin(schema.users, eq(schema.users.id, schema.visites.visiteurId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), eq(schema.visites.ordreMission, "a_signer")));
  return rows.map((r) => ({ visiteId: r.v.id, eleve: `${r.e.prenom} ${r.e.nom}`, entreprise: r.ent.nom, visiteur: `${r.u.prenom} ${r.u.nom}`, date: r.v.date }));
}

export function BlocOrdresASigner({ ordres }: { ordres: OrdreASigner[] }) {
  return (
    <div className="section">
      <h2>Ordres de mission ({ordres.length})</h2>
      <div className="panel rows">
        {ordres.length === 0 && <div className="empty">Aucun ordre de mission en attente.</div>}
        {ordres.map((o) => (
          <div key={o.visiteId} className="row">
            <div className="main"><div className="name">{o.visiteur} · visite de {o.eleve}</div><div className="meta">{o.entreprise} · {o.date ? dateLongue(o.date) : "date à fixer"}</div></div>
            <Link className="btn small" href={`/ordres-mission/${o.visiteId}`} target="_blank">Lire</Link>
            <form action={signerOrdreMission}><ChampRetour /><input type="hidden" name="visiteId" value={o.visiteId} /><button className="btn small primary">Signer</button></form>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pastilles d'avancement d'une visite. */
export function EtatVisite({ l, ctx }: { l: LigneVisite; ctx: Contexte }) {
  const v = l.v;
  const r = ctx.etab.reglages;
  return (
    <span className="actions" style={{ gap: 4 }}>
      {!v?.visiteurId ? <Pill ton="bad">Sans visiteur</Pill>
        : v.heure ? <Pill ton="ok">Le {dateCourte(v.date)} à {v.heure.replace(":", "h")}{v.mode === "distanciel" ? " · à distance" : ""}</Pill>
        : v.propositionEnvoyeeLe ? (v.rdvCommentaire ? <Pill ton="bad">Aucun créneau ne convient</Pill> : <Pill ton="warn">Créneaux proposés</Pill>)
        : <Pill ton="muted">{v.date ? `Prévue vers le ${dateCourte(v.date)}` : "Date à fixer"}</Pill>}
      {v?.visiteurId && r.ordreMission && (v.ordreMission === "signe" ? <Pill ton="ok">Ordre de mission signé</Pill> : v.ordreMission === "a_signer" ? <Pill ton="warn">Ordre de mission à signer</Pill> : null)}
      {v?.visiteurId && r.compteRendu && v.compteRendu && <Pill ton="ok">Compte rendu fait</Pill>}
    </span>
  );
}

/** Pour le tuteur : choisir l'un des créneaux proposés par le professeur. */
export function ChoixCreneauTuteur({ visite }: { visite: typeof schema.visites.$inferSelect | null }) {
  if (!visite?.creneauxProposes?.length) return null;
  if (visite.heure) return <p className="msg ok" style={{ margin: 0 }}>Visite {texteMode(visite.mode)} prévue le {dateLongue(visite.date)} à {visite.heure.replace(":", "h")}{visite.mode === "distanciel" && visite.lienDistance && <> · <LienVisio valeur={visite.lienDistance} /></>}.</p>;
  const auChoix = visite.modesProposes === "les2";
  return (
    <div className="card">
      <b>{auChoix ? "Le professeur propose une visite sur place ou à distance, à votre choix" : `Le professeur propose une visite ${texteMode(visite.mode)}`}</b>
      <form action={choisirCreneau} className="actions">
        <ChampRetour />
        <input type="hidden" name="visiteId" value={visite.id} />
        <select className="inp" name="creneau" aria-label="Créneau" style={{ width: "auto" }}>
          {visite.creneauxProposes.map(([d, h], i) => <option key={i} value={i}>{dateLongue(d)} à {h.replace(":", "h")}</option>)}
        </select>
        {auChoix && (
          <span className="actions" role="radiogroup" aria-label="Forme de la visite">
            <label className="check"><input type="radio" name="mode" value="presentiel" required /> Sur place</label>
            <label className="check"><input type="radio" name="mode" value="distanciel" /> À distance</label>
          </span>
        )}
        <button className="btn small primary">Choisir ce créneau</button>
      </form>
    </div>
  );
}

/** Comptes rendus de visite d'un élève, pour son dossier. */
export async function VisitesDuDossier({ eleveId }: { eleveId: string }) {
  const rows = await db.select({ v: schema.visites, c: schema.classes, ent: schema.entreprises, u: schema.users })
    .from(schema.visites)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .leftJoin(schema.users, eq(schema.users.id, schema.visites.visiteurId))
    .where(eq(schema.stages.eleveId, eleveId)).orderBy(desc(schema.periodes.debut));
  const faits = rows.filter((r) => r.v.compteRendu);
  if (!faits.length) return null;
  return (
    <div className="section">
      <h3>Comptes rendus de visite</h3>
      <div className="panel rows">
        {faits.map(({ v, c, ent, u }) => (
          <Link key={v.id} href={`/visites/${v.id}`} className="row">
            <div className="main"><div className="name">{c.anneeScolaire} · {c.libelle} · {ent.nom}</div>
              <div className="meta">Visite du {dateCourte(v.compteRendu!.date)}{u ? ` par ${u.prenom} ${u.nom}` : ""}</div></div>
            <Pill ton="ok">Compte rendu</Pill>
          </Link>
        ))}
      </div>
    </div>
  );
}
