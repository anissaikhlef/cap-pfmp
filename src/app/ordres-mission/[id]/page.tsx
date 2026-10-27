import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutAdministrer, peutGererEleve, peutSignerOrdreMission } from "@/lib/acces";
import { chargerVisite } from "@/lib/visites";
import { dateLongue } from "@/lib/dates";
import { imageSignature } from "@/lib/stockage";
import { grilleEtQuestions, logoDuLycee, modeleDuLycee } from "@/lib/modeles-documents";
import { INTRO_ORDRE_MISSION, paragraphes, TITRE_ORDRE_MISSION } from "@/lib/modeles";

export const metadata = { title: "Ordre de mission" };

const ADEQUATION = { oui: "Oui", en_partie: "En partie", non: "Non" } as const;

/**
 * Compte rendu de visite et ordre de mission, sur le modèle du lycée (décision d'Anissa) : autorisation signée avant
 * la visite, appel au tuteur la première semaine, visite et signature de l'entreprise, commentaires, attitudes professionnelles.
 */
export default async function OrdreMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  const l = await chargerVisite(ctx, id);
  if (!l?.v?.visiteurId || l.v.ordreMission === "aucun") notFound();
  if (l.v.visiteurId !== ctx.user.id && !a(ctx, "direction") && !peutSignerOrdreMission(ctx) && !(await peutGererEleve(ctx, l.e))) notFound();
  const v = l.v;
  const ids = [v.visiteurId, v.ordreMissionSigneParId, v.appel?.parId].filter((x): x is string => !!x);
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  const nom = (uid: string | null | undefined) => { const u = users.find((x) => x.id === uid); return u ? `${u.prenom} ${u.nom}` : ""; };
  const p = (await modeleDuLycee(ctx.etab.id, "ordre_mission")).personnalisation;
  const logo = await logoDuLycee(ctx.etab);
  const { grille } = await grilleEtQuestions(ctx.etab.id);
  const cr = v.compteRendu;
  const imageCachet = v.cachet ? await imageSignature(v.cachet.image) : null;
  const [photo] = await db.select({ id: schema.documents.id }).from(schema.documents)
    .where(and(eq(schema.documents.stageId, l.s.id), eq(schema.documents.type, "ordre_mission"))).orderBy(desc(schema.documents.deposeLe)).limit(1);
  // La grille notée dans le compte rendu (telle qu'elle était), sinon la grille du lycée, vide.
  const attitudes = cr?.evaluations?.length
    ? cr.evaluations.map((e) => ({ critere: e.critere, niveaux: grille.find((g) => g.critere === e.critere)?.niveaux ?? [e.niveau], choisi: e.niveau }))
    : grille.map((g) => ({ ...g, choisi: null as string | null }));
  const rubriques = (p.rubriques ?? []).filter((x) => x.titre || x.texte);
  const ligne = (k: string, val: React.ReactNode) => <tr><th style={{ width: "38%" }}>{k}</th><td>{val}</td></tr>;
  return (
    <main className="convention">
      <p className="note noprint">
        Imprimez cette page depuis le menu de votre navigateur.
        {peutAdministrer(ctx) && <> Ce modèle s&apos;adapte (logo, textes, questions de l&apos;appel, grille des attitudes) dans <Link href="/organisation/documents/ordre_mission">Modèles de documents</Link>.</>}
      </p>
      {logo && <img src={logo} alt={`Logo : ${ctx.etab.nom}`} className="logo-document" />}
      <h1>{p.titre || TITRE_ORDRE_MISSION}</h1>
      <p className="sub">Suivi de la période de formation en milieu professionnel · {ctx.etab.nom}</p>
      {paragraphes(p.introduction || INTRO_ORDRE_MISSION).map((x, i) => <p key={i}>{x}</p>)}

      <h2>1. Ordre de mission</h2>
      <p>La direction de l&apos;établissement autorise {nom(v.visiteurId)} à effectuer la visite de l&apos;élève ci-dessous. Ce document fait office d&apos;ordre de mission.</p>
      <table><tbody>
        {ligne("Professeur", nom(v.visiteurId))}
        {ligne("Classe", l.c.libelle)}
        {ligne("Élève", `${l.e.prenom} ${l.e.nom}`)}
        {ligne("Dates du stage", `du ${dateLongue(l.p.debut)} au ${dateLongue(l.p.fin)}`)}
        {ligne("Entreprise", l.ent.nom)}
        {ligne("Adresse", [l.ent.adresse, l.ent.ville].filter(Boolean).join(", ") || "—")}
        {ligne("Date de la visite", v.date ? `${dateLongue(v.date)}${v.heure ? ` à ${v.heure.replace(":", "h")}` : ""} · ${v.mode === "presentiel" ? "sur place" : "à distance"}` : "À fixer")}
        {ligne("Mode de transport", v.transport === "vehicule" ? "Véhicule personnel" : v.transport === "commun" ? "Transport en commun" : "—")}
      </tbody></table>
      <div className="sigs">
        <div className="sig">
          <b>Signature avant la visite</b>
          <span>{v.ordreMission === "signe" ? `Signé le ${dateLongue(v.ordreMissionSigneLe!.toISOString().slice(0, 10))}${nom(v.ordreMissionSigneParId) ? ` par ${nom(v.ordreMissionSigneParId)}` : ""}` : "En attente de signature"}</span>
        </div>
      </div>

      <h2>2. Appel au tuteur, première semaine</h2>
      {v.appel ? (
        <>
          <p className="sub">Appel du {dateLongue(v.appel.date)}{nom(v.appel.parId) ? ` par ${nom(v.appel.parId)}` : ""}.</p>
          <table><tbody>{v.appel.reponses.map((x) => ligne(x.question, x.reponse === "oui" ? "Oui" : "Non"))}</tbody></table>
          {v.appel.commentaire && <p style={{ whiteSpace: "pre-wrap" }}>{v.appel.commentaire}</p>}
        </>
      ) : <p className="sub">Pas encore effectué.</p>}

      <h2>3. Visite et signature de l&apos;entreprise</h2>
      <table><tbody>
        {ligne("Personne rencontrée", cr?.personneRencontree ?? "—")}
        {ligne("Signature de l'entreprise", v.cachet ? `${v.cachet.nom}${v.cachet.qualite ? `, ${v.cachet.qualite}` : ""}, le ${dateLongue(v.cachet.le.slice(0, 10))}` : photo ? "Ordre de mission tamponné : photo rangée dans le dossier de l'élève" : "—")}
      </tbody></table>
      {imageCachet && <img src={imageCachet} alt={`Signature de ${v.cachet!.nom}`} className="signature-image" />}

      <h2>4. Commentaires sur le stagiaire</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{cr?.observations || "—"}</p>

      <h2>5. Commentaires sur l&apos;entreprise</h2>
      <table><tbody>
        {ligne("Les activités confiées sont-elles en adéquation avec la formation ?", cr?.adequation ? ADEQUATION[cr.adequation] : "—")}
        {ligne("Accueil et encadrement par l'entreprise", cr?.criteres.accueil ?? "—")}
      </tbody></table>
      {cr?.commentaireEntreprise && <p style={{ whiteSpace: "pre-wrap" }}>{cr.commentaireEntreprise}</p>}

      <h2>6. Évaluation des attitudes professionnelles</h2>
      <div className="grille-attitudes">
        {attitudes.map((g) => (
          <table key={g.critere}>
            <thead><tr><th>{g.critere}</th><th className="croix">Croix</th></tr></thead>
            <tbody>{g.niveaux.map((n) => <tr key={n}><td>{n}</td><td className="croix">{g.choisi === n ? "✕" : ""}</td></tr>)}</tbody>
          </table>
        ))}
      </div>

      {rubriques.map((x, i) => (
        <section key={i}>
          <h2>{7 + i}. {x.titre || "Informations du lycée"}</h2>
          {paragraphes(x.texte).map((y, j) => <p key={j}>{y}</p>)}
        </section>
      ))}
      {p.piedDePage && <p className="sub pied-document">{p.piedDePage}</p>}
    </main>
  );
}
