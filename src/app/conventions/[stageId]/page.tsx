import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutVoirEleve } from "@/lib/acces";
import { chargerConvention } from "@/lib/convention";
import { SIGNATAIRES, heuresHebdo, fmtHeures } from "@/lib/regles";
import { JOURS, dateLongue } from "@/lib/dates";

export const metadata = { title: "Convention de stage" };

export default async function Convention({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(stageId)) notFound();
  const ctx = await contexte();
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) notFound();
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === cv.s.entrepriseId;
  if (!tuteur && !(await peutVoirEleve(ctx, cv.e))) notFound();
  const [ref] = cv.referentId ? await db.select().from(schema.users).where(eq(schema.users.id, cv.referentId)).limit(1) : [];
  const ligne = (l: string, v: React.ReactNode) => <tr><th style={{ width: "38%" }}>{l}</th><td>{v}</td></tr>;
  return (
    <main className="convention">
      <p className="note noprint">Modèle provisoire de démonstration. Il sera remplacé par le modèle de convention de votre établissement ou de votre académie. Imprimez cette page depuis le menu de votre navigateur.</p>
      <h1>Convention relative à la période de formation en milieu professionnel</h1>
      <p className="sub">{ctx.etab.nom} · année scolaire {cv.c.anneeScolaire}</p>

      <h2>1. Les parties</h2>
      <table><tbody>
        {ligne("Établissement", ctx.etab.nom)}
        {ligne("Professeur référent", ref ? `${ref.prenom} ${ref.nom}` : "—")}
        {ligne("Organisme d'accueil", `${cv.ent.nom} (${cv.ent.secteur === "prive" ? "secteur privé" : "secteur public"})`)}
        {ligne("Adresse", [cv.ent.adresse, cv.ent.ville].filter(Boolean).join(", ") || "—")}
        {ligne("Tuteur", `${cv.ent.tuteurNom ?? "—"}${cv.ent.tuteurFonction ? `, ${cv.ent.tuteurFonction}` : ""}`)}
        {ligne("Élève", `${cv.e.prenom} ${cv.e.nom}${cv.e.dateNaissance ? `, né(e) le ${dateLongue(cv.e.dateNaissance)}` : ""}`)}
        {ligne("Formation", `${cv.c.filiere ?? ""} · ${cv.c.libelle}${cv.dominante ? ` · dominante ${cv.dominante}` : ""}`)}
      </tbody></table>

      <h2>2. Période et horaires</h2>
      <p>Du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)} inclus, soit {fmtHeures(heuresHebdo(cv.s.horaires))} par semaine.</p>
      <table><tbody>
        {JOURS.map((j, i) => ligne(j, cv.s.horaires[i] ? `${cv.s.horaires[i]![0]} – ${cv.s.horaires[i]![1]}` : "Repos"))}
      </tbody></table>

      <h2>3. Engagements</h2>
      <p>L&apos;élève conserve son statut scolaire pendant toute la période. Il n&apos;est pas employé de l&apos;organisme d&apos;accueil.</p>
      <p>L&apos;organisme d&apos;accueil confie à l&apos;élève des activités conformes au référentiel du diplôme, désigne un tuteur et respecte les règles applicables : pas de travail de nuit ({ctx.etab.reglages.regles.nuitDebut} – {ctx.etab.reglages.regles.nuitFin}), {ctx.etab.reglages.regles.dimancheInterdit ? "pas de travail le dimanche, " : ""}{ctx.etab.reglages.regles.joursReposConsecutifs} jours de repos consécutifs par semaine.</p>
      <p>Le professeur référent assure le suivi de l&apos;élève et effectue au moins une visite pendant la période.</p>
      <p>À la fin de la période, l&apos;organisme d&apos;accueil remet une attestation de stage et complète le livret de compétences.</p>

      <h2>4. Signatures</h2>
      <div className="sigs">
        {SIGNATAIRES.filter((s) => cv.requis.includes(s.cle)).map((s) => {
          const sig = cv.s.signatures[s.cle];
          return (
            <div key={s.cle} className="sig">
              <b>{s.libelle}</b>
              <span>{sig ? `Signé le ${dateLongue(sig.le.slice(0, 10))}${sig.mode === "enligne" ? " dans Cap PFMP" : ""}` : "Date et signature :"}</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
