import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { dossierStage, suggestions, demarchesDe, entreprisesDuLycee } from "@/lib/stages";
import { ResumeStage, statutDossier } from "@/components/ResumeStage";
import { Demarches } from "@/components/Demarches";
import { BlocConvention, BlocFinDeStage, DossierEleve } from "@/components/convention";
import { BlocPresenceEleve } from "@/components/absences";
import { BlocCandidature } from "@/components/candidature";
import { BlocAllocation } from "@/components/allocation";
import { contacterSuggestion } from "../eleves/stage-actions";

export const metadata = { title: "Mon stage" };

export default async function MonStage() {
  const ctx = await contexte({ roles: ["eleve"] });
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.userId, ctx.user.id), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!e) return <p className="empty">Votre compte n&apos;est rattaché à aucune fiche élève. Signalez-le à votre professeur référent.</p>;
  const d = await dossierStage(ctx, e);
  const docs = d.stage ? (await db.select({ type: schema.documents.type }).from(schema.documents)
    .where(and(eq(schema.documents.stageId, d.stage.id), eq(schema.documents.statut, "valide")))).map((x) => x.type) : [];
  const statut = statutDossier(d, docs);
  const dem = await demarchesDe(e.id);
  const sugg = !d.stage ? (await suggestions(ctx, d, e.id)).filter((s) => !dem.some((x) => x.entrepriseId === s.id)) : [];
  const ents = await entreprisesDuLycee(ctx);
  return (
    <>
      <div><h1>Bonjour {e.prenom}</h1><p className="sub">Votre stage, étape par étape.</p></div>
      <ResumeStage d={d} statut={statut} />
      {d.stage && <BlocConvention ctx={ctx} stageId={d.stage.id} />}
      {d.stage && <BlocFinDeStage ctx={ctx} stageId={d.stage.id} />}
      <BlocPresenceEleve ctx={ctx} eleve={e} />
      {!d.stage && d.periode && (
        <>
          <BlocCandidature ctx={ctx} eleve={e} />
          <div className="section">
            <h2>Mes démarches</h2>
            <p className="sub">Notez chaque entreprise contactée. Sans réponse au bout de 7 jours, relancez-la par téléphone ou en vous déplaçant.</p>
            <Demarches eleveId={e.id} demarches={dem} entreprises={ents.filter((x) => !x.ecarteeLe).map((x) => ({ id: x.id, nom: x.nom }))} />
          </div>
          <div className="section">
            <h2>Entreprises qui peuvent vous accueillir</h2>
            <p className="sub">Partenaires du lycée compatibles avec les règles de votre classe et qui ont encore de la place.</p>
            <div className="grid2">
              {sugg.length === 0 && <p className="empty">Aucune suggestion pour le moment. Parlez-en à votre professeur référent.</p>}
              {sugg.map((s) => (
                <div key={s.id} className="card">
                  <h3>{s.nom}</h3>
                  <p className="sub" style={{ margin: 0 }}>{[s.domaine, s.ville].filter(Boolean).join(" · ")} · {s.restantes} place(s)</p>
                  {s.telephone && <p className="sub" style={{ margin: 0 }}>Contact : {s.tuteurNom ?? "accueil"} · <span className="num" style={{ userSelect: "all" }}>{s.telephone}</span></p>}
                  <form action={contacterSuggestion}><input type="hidden" name="eleveId" value={e.id} /><input type="hidden" name="entrepriseId" value={s.id} /><button className="btn small">Je l&apos;ai contactée</button></form>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {(d.stage || !d.periode) && <BlocCandidature ctx={ctx} eleve={e} />}
      <BlocAllocation ctx={ctx} eleve={e} />
      <div className="section"><h2>Mes documents</h2><DossierEleve eleveId={e.id} /></div>
    </>
  );
}
