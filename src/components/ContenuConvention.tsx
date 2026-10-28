import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Reglages } from "@/db/schema";
import type { ContexteConvention } from "@/lib/convention";
import { SIGNATAIRES, heuresHebdo, fmtHeures, texteJour } from "@/lib/regles";
import { imageSignature } from "@/lib/stockage";
import { JOURS, dateLongue } from "@/lib/dates";
import { ENGAGEMENTS_CONVENTION, paragraphes, TITRE_CONVENTION } from "@/lib/modeles";
import { logoDuLycee, modeleDeLaConvention } from "@/lib/modeles-documents";

/**
 * Le texte de la convention, pré-rempli, avec les signatures recueillies (les signatures dessinées en image).
 * Utilisé par la convention à imprimer et par la page de signature à lien personnel.
 */
export async function ContenuConvention({ etab, cv }: { etab: { id: string; nom: string; reglages: Reglages; logoCle?: string | null }; cv: ContexteConvention }) {
  const [ref] = cv.referentId ? await db.select().from(schema.users).where(eq(schema.users.id, cv.referentId)).limit(1) : [];
  // Le modèle Cap PFMP tel que le lycée l'a adapté (figé à la première signature).
  const modele = await modeleDeLaConvention(etab, cv);
  const p = modele.personnalisation;
  const logo = await logoDuLycee({ logoCle: modele.logoCle });
  const rubriques = (p.rubriques ?? []).filter((x) => x.titre || x.texte);
  const engagements = paragraphes(p.engagements || ENGAGEMENTS_CONVENTION);
  const images = Object.fromEntries(await Promise.all(SIGNATAIRES.map(async (s) => [s.cle, await imageSignature(cv.s.signatures[s.cle]?.image)] as const)));
  const ligne = (l: string, v: React.ReactNode) => <tr><th style={{ width: "38%" }}>{l}</th><td>{v}</td></tr>;
  const r = etab.reglages.regles;
  const t = cv.s.tuteur;
  return (
    <>
      {logo && <img src={logo} alt={`Logo : ${etab.nom}`} className="logo-document" />}
      <h1>{p.titre || TITRE_CONVENTION}</h1>
      <p className="sub">{etab.nom} · année scolaire {cv.c.anneeScolaire}</p>
      {paragraphes(p.introduction).map((x, i) => <p key={i}>{x}</p>)}

      <h2>1. Les parties</h2>
      <table><tbody>
        {ligne("Établissement", etab.nom)}
        {ligne("Professeur référent", ref ? `${ref.prenom} ${ref.nom}` : "—")}
        {ligne("Organisme d'accueil", `${cv.ent.nom} (${cv.ent.secteur === "prive" ? "secteur privé" : "secteur public"})`)}
        {ligne("Adresse", [cv.ent.adresse, cv.ent.ville].filter(Boolean).join(", ") || "—")}
        {ligne("Représentant de l'organisme", cv.ent.representantNom ? `${cv.ent.representantNom}${cv.ent.representantFonction ? `, ${cv.ent.representantFonction}` : ""}` : "—")}
        {ligne("Tuteur de stage", t ? `${t.nom}${t.fonction ? `, ${t.fonction}` : ""}${t.telephone ? ` · ${t.telephone}` : ""}` : "Non désigné")}
        {ligne("Élève", `${cv.e.prenom} ${cv.e.nom}${cv.e.dateNaissance ? `, né(e) le ${dateLongue(cv.e.dateNaissance)}` : ""}`)}
        {ligne("Formation", `${cv.c.filiere ?? ""} · ${cv.c.libelle}${cv.dominante ? ` · spécialité ${cv.dominante}` : ""}`)}
      </tbody></table>

      <h2>2. Période et horaires</h2>
      <p>Du {dateLongue(cv.p.debut)} au {dateLongue(cv.p.fin)} inclus, soit {fmtHeures(heuresHebdo(cv.s.horaires))} par semaine.</p>
      <table><tbody>
        {JOURS.map((j, i) => ligne(j, texteJour(cv.s.horaires, i) ?? "Repos"))}
      </tbody></table>

      <h2>3. Engagements</h2>
      {engagements.slice(0, 1).map((x, i) => <p key={i}>{x}</p>)}
      <p>L&apos;organisme d&apos;accueil confie à l&apos;élève des activités conformes au référentiel du diplôme, désigne un tuteur et respecte les règles applicables : pas de travail de nuit ({r.nuitDebut} – {r.nuitFin}), {r.dimancheInterdit ? "pas de travail le dimanche, " : ""}{r.joursReposConsecutifs} jours de repos consécutifs par semaine.</p>
      {r.reglesMineurs && <p>Pour un élève mineur : 8 heures de travail par jour au maximum, une pause d&apos;au moins 30 minutes au-delà de 4 h 30 de travail, aucun travail de nuit (dès 20 h avant 16 ans, dès 22 h de 16 à 18 ans), 14 heures (moins de 16 ans) ou 12 heures (16 à 18 ans) de repos entre deux journées, et deux jours de repos consécutifs dont le dimanche.</p>}
      {engagements.slice(1).map((x, i) => <p key={i}>{x}</p>)}
      {rubriques.map((x, i) => (
        <section key={i}>
          <h2>{4 + i}. {x.titre || "Clauses particulières"}</h2>
          {paragraphes(x.texte).map((y, j) => <p key={j}>{y}</p>)}
        </section>
      ))}

      <h2>{4 + rubriques.length}. Signatures</h2>
      <div className="sigs">
        {SIGNATAIRES.filter((s) => cv.requis.includes(s.cle)).map((s) => {
          const sig = cv.s.signatures[s.cle];
          const image = images[s.cle];
          return (
            <div key={s.cle} className="sig">
              <b>{s.libelle}</b>
              {sig?.nom && <span>{sig.nom}</span>}
              {image && <img src={image} alt={`Signature : ${s.libelle.toLowerCase()}`} style={{ maxWidth: "100%", height: 60, objectFit: "contain", alignSelf: "flex-start", background: "#fff", borderRadius: 4, padding: 2 }} />}
              <span>{sig ? `Signé le ${dateLongue(sig.le.slice(0, 10))}${sig.mode === "enligne" ? " dans Cap PFMP" : ""}` : "Date et signature :"}</span>
            </div>
          );
        })}
      </div>
      {p.piedDePage && <p className="sub pied-document">{p.piedDePage}</p>}
    </>
  );
}
