import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { elevesDuParent } from "@/lib/acces";
import { dossierStage } from "@/lib/stages";
import { ResumeStage, statutDossier } from "@/components/ResumeStage";

export const metadata = { title: "Mon enfant" };

export default async function MonEnfant() {
  const ctx = await contexte({ roles: ["parent"] });
  const ids = await elevesDuParent(ctx);
  const enfants = ids.length ? await db.select().from(schema.eleves).where(and(inArray(schema.eleves.id, ids), eq(schema.eleves.archive, false))) : [];
  if (!enfants.length) return <p className="empty">Aucun élève n&apos;est rattaché à votre compte. Contactez le lycée.</p>;
  const blocs = [];
  for (const e of enfants) {
    const d = await dossierStage(ctx, e);
    const docs = d.stage ? (await db.select({ type: schema.documents.type }).from(schema.documents)
      .where(and(eq(schema.documents.stageId, d.stage.id), eq(schema.documents.statut, "valide")))).map((x) => x.type) : [];
    blocs.push({ e, d, statut: statutDossier(d, docs) });
  }
  return (
    <>
      <div><h1>Bonjour {ctx.user.prenom}</h1><p className="sub">Le suivi du stage de votre enfant.</p></div>
      {blocs.map(({ e, d, statut }) => (
        <div key={e.id} className="section" id={`eleve-${e.id}`}>
          <h2>{e.prenom} {e.nom}</h2>
          <ResumeStage d={d} statut={statut} />
          {!d.stage && d.periode && <p className="note">{e.prenom} n&apos;a pas encore de lieu de stage. Vous pouvez l&apos;aider en sollicitant votre entourage professionnel.</p>}
        </div>
      ))}
    </>
  );
}
