import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { grilleEtQuestions, modeleDuLycee } from "@/lib/modeles-documents";
import {
  ENGAGEMENTS_CONVENTION, INTRO_ATTESTATION, INTRO_LIVRET, INTRO_ORDRE_MISSION, NIVEAUX_COMPETENCES, SOURCES_CONVENTION, SOURCES_SPECIALES,
  texteGrille, TITRE_ATTESTATION, TITRE_CONVENTION, TITRE_LIVRET, TITRE_ORDRE_MISSION,
} from "@/lib/modeles";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete } from "@/components/ui";
import type { ChampPdf } from "@/db/schema";
import { choisirMode, deposerPdfModele, enregistrerChamps, enregistrerPersonnalisation } from "../actions";

export const metadata = { title: "Modèle de document" };

/** Les documents dont le lycée adapte le modèle ; le PDF du lycée, rempli à l'identique, pour ceux qui ont des champs. */
const DOCUMENTS = {
  convention: { titre: "Modèle de convention", sous: "Le document que signent l'élève, sa famille, l'entreprise et le lycée.", pdf: true, titreDefaut: TITRE_CONVENTION, introDefaut: "" },
  ordre_mission: { titre: "Modèle d'ordre de mission", sous: "Ordre de mission signé avant la visite, puis compte rendu de visite.", pdf: false, titreDefaut: TITRE_ORDRE_MISSION, introDefaut: INTRO_ORDRE_MISSION },
  attestation: { titre: "Modèle d'attestation de stage", sous: "Remplie et signée en ligne par le tuteur, avec l'élève et le professeur quand c'est possible.", pdf: false, titreDefaut: TITRE_ATTESTATION, introDefaut: INTRO_ATTESTATION },
  livret: { titre: "Modèle de livret de compétences", sous: "Attitudes professionnelles et compétences du diplôme, évaluées en ligne par le tuteur à l'aide du carnet de bord de l'élève.", pdf: false, titreDefaut: TITRE_LIVRET, introDefaut: INTRO_LIVRET },
} as const;

const NB_RUBRIQUES = 5;
const SORTES: Record<ChampPdf["type"], string> = { texte: "Zone de texte", case: "Case à cocher", liste: "Liste déroulante", signature: "Signature" };
const GROUPES = [...new Set(SOURCES_CONVENTION.map((s) => s.groupe))];

/** Ce que Cap PFMP peut écrire dans un champ, selon sa sorte. */
function ChoixSource({ c, i }: { c: ChampPdf; i: number }) {
  const sorte = c.type === "case" ? "case" : "texte";
  return (
    <select id={`src-${i}`} name={`src_${i}`} defaultValue={c.source}>
      <option value={SOURCES_SPECIALES.vide}>Laisser vide (rempli à la main)</option>
      {c.type === "case" ? <option value={SOURCES_SPECIALES.coche}>Toujours cochée</option> : c.type !== "signature" && <option value={SOURCES_SPECIALES.fixe}>Texte fixe…</option>}
      {c.type !== "signature" && <option value={SOURCES_SPECIALES.famille}>À compléter par l&apos;élève ou sa famille, en signant</option>}
      {c.type !== "signature" && <option value={SOURCES_SPECIALES.entreprise}>À compléter par l&apos;entreprise, en signant</option>}
      {GROUPES.filter((g) => c.type !== "signature" || g === "Signatures").map((g) => {
        const sources = SOURCES_CONVENTION.filter((s) => s.groupe === g && s.sorte === sorte);
        return sources.length ? <optgroup key={g} label={g}>{sources.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}</optgroup> : null;
      })}
    </select>
  );
}

/** Le modèle d'un document : modèle Cap PFMP adapté, ou PDF du lycée avec ce que Cap PFMP écrit dans chaque champ. */
export default async function ModeleDocument({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type !== "convention" && type !== "ordre_mission" && type !== "attestation" && type !== "livret") notFound();
  const doc = DOCUMENTS[type];
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const m = await modeleDuLycee(ctx.etab.id, type);
  const p = m.personnalisation;
  // Un stage de l'année, pour les aperçus
  const [ex] = await db.select({ id: schema.stages.id }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(desc(schema.periodes.debut)).limit(1);
  // Un ordre de mission déjà demandé, pour l'aperçu
  const [om] = type === "ordre_mission" ? await db.select({ id: schema.visites.id }).from(schema.visites)
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .where(and(eq(schema.eleves.etablissementId, ctx.etab.id), ne(schema.visites.ordreMission, "aucun"))).limit(1) : [];
  const { questions, grille } = await grilleEtQuestions(ctx.etab.id);
  // Livret : une liste de compétences par diplôme (formation des classes de l'année)
  const filieres = type === "livret" ? [...new Set((await db.select({ f: schema.classes.filiere }).from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))).map((x) => x.f).filter((f): f is string => !!f))].sort() : [];
  const rubriques = [...(p.rubriques ?? []), ...Array.from({ length: NB_RUBRIQUES }, () => ({ titre: "", texte: "" }))].slice(0, NB_RUBRIQUES);
  const remplis = m.champs.filter((c) => c.source && c.source !== SOURCES_SPECIALES.famille && c.source !== SOURCES_SPECIALES.entreprise).length;
  const aCompleter = m.champs.filter((c) => c.source === SOURCES_SPECIALES.famille || c.source === SOURCES_SPECIALES.entreprise).length;
  return (
    <>
      <Entete titre={doc.titre} sous={doc.sous}>
        <Link className="btn" href="/organisation/documents">Tous les modèles</Link>
      </Entete>

      {!doc.pdf && <p className="note" style={{ margin: 0 }}>Pour l&apos;instant, ce document suit le modèle Cap PFMP, que vous adaptez ci-dessous.</p>}
      {doc.pdf && <div className="panel pad section" id="mode">
        <h2>Modèle utilisé</h2>
        <form action={choisirMode} className="stack">
          <ChampRetour />
          <input type="hidden" name="type" value={type} />
          <div className="choices" role="radiogroup">
            <label className="choice">
              <input type="radio" name="mode" value="cap_pfmp" defaultChecked={m.mode === "cap_pfmp"} />
              <span><b>Modèle Cap PFMP</b><br /><span className="sub">Rempli et mis en page par Cap PFMP, avec votre logo, vos textes et vos rubriques.</span></span>
            </label>
            <label className="choice">
              <input type="radio" name="mode" value="pdf" defaultChecked={m.mode === "pdf"} />
              <span><b>PDF de votre lycée</b><br /><span className="sub">{m.pdfCle ? `${m.pdfNom}, rempli à l'identique.` : "Déposez-le d'abord ci-dessous."}</span></span>
            </label>
          </div>
          <div className="actions"><button className="btn primary">Enregistrer le choix</button></div>
        </form>
        <p className="sub" style={{ margin: 0 }}>Une convention déjà signée garde le modèle avec lequel elle a été signée.</p>
      </div>}

      <div className="panel pad section" id="cap-pfmp">
        <h2>Modèle Cap PFMP adapté</h2>
        <p className="sub" style={{ margin: 0 }}>{type === "convention"
          ? "Les parties, les dates, les horaires et les signatures sont toujours remplis par Cap PFMP."
          : type === "attestation"
            ? "L'élève, l'entreprise, la période, les jours effectués, les activités, l'appréciation et la signature du tuteur sont toujours remplis en ligne."
            : type === "livret"
              ? "L'élève, l'entreprise, la période, les évaluations, le bilan, le carnet de bord de l'élève et la signature du tuteur sont toujours remplis en ligne."
              : "L'élève, le stage, l'entreprise, l'appel, la visite et les signatures sont toujours remplis par Cap PFMP."} Vous choisissez le titre, les textes, et vous ajoutez vos rubriques. Le logo se dépose dans <Link href="/organisation/documents#logo">Modèles de documents</Link>.</p>
        <Formulaire action={enregistrerPersonnalisation} bouton="Enregistrer le modèle">
          <input type="hidden" name="type" value={type} />
          <label className="f" htmlFor="mp-titre">Titre<input id="mp-titre" name="titre" defaultValue={p.titre ?? ""} placeholder={doc.titreDefaut} maxLength={200} /></label>
          <label className="f" htmlFor="mp-intro">Texte d&apos;introduction{doc.introDefaut ? " (laissé vide : le texte de Cap PFMP)" : " (facultatif)"}<textarea id="mp-intro" name="introduction" rows={3} defaultValue={p.introduction ?? ""} placeholder={doc.introDefaut || undefined} maxLength={2000} /></label>
          {type === "convention" && (
            <>
              <label className="f" htmlFor="mp-engagements">Engagements des parties (laissé vide : le texte de Cap PFMP)<textarea id="mp-engagements" name="engagements" rows={5} defaultValue={p.engagements ?? ""} placeholder={ENGAGEMENTS_CONVENTION} maxLength={4000} /></label>
              <p className="sub" style={{ margin: 0 }}>Les règles de votre lycée (travail de nuit, dimanche, élèves mineurs) sont toujours ajoutées aux engagements. Séparez les paragraphes par une ligne vide.</p>
            </>
          )}
          {type === "ordre_mission" && (
            <>
              <label className="f" htmlFor="mp-questions">Questions de l&apos;appel au tuteur, la première semaine (une par ligne, réponse oui ou non)<textarea id="mp-questions" name="questions" rows={5} defaultValue={questions.join("\n")} maxLength={2000} /></label>
              <label className="f" htmlFor="mp-grille">Grille des attitudes professionnelles (une ligne par critère : « Critère : niveau 1 / niveau 2 / … », du plus faible au plus fort)<textarea id="mp-grille" name="grille" rows={9} defaultValue={texteGrille(grille)} maxLength={8000} /></label>
              <p className="sub" style={{ margin: 0 }}>Un compte rendu déjà rédigé garde la grille avec laquelle il a été rempli.</p>
            </>
          )}
          {type === "livret" && (
            <>
              <p className="sub" style={{ margin: 0 }}>Les attitudes professionnelles suivent la grille de votre lycée, celle de la visite : elle se modifie dans le <Link href="/organisation/documents/ordre_mission">modèle de l&apos;ordre de mission</Link>.</p>
              <label className="f" htmlFor="mp-niveaux">Niveaux d&apos;acquisition des compétences (du plus faible au plus fort, séparés par « / »)<input id="mp-niveaux" name="niveauxCompetences" defaultValue={(p.niveauxCompetences ?? NIVEAUX_COMPETENCES).join(" / ")} maxLength={600} /></label>
              {filieres.length === 0 && <p className="note" style={{ margin: 0 }}>Indiquez la formation de vos classes (ex. « Bac Pro Métiers de la sécurité ») pour saisir les compétences de chaque diplôme.</p>}
              {filieres.map((f, i) => (
                <label key={f} className="f" htmlFor={`mp-comp-${i}`}>Compétences du diplôme : {f} (une par ligne)
                  <input type="hidden" name={`filiere_${i}`} value={f} />
                  <textarea id={`mp-comp-${i}`} name={`competences_${i}`} rows={6} defaultValue={(p.competences?.find((c) => c.filiere === f)?.liste ?? []).join("\n")} maxLength={6000} />
                </label>
              ))}
            </>
          )}
          <b>Rubriques ajoutées</b>
          {rubriques.map((r, i) => (
            <div key={i} className="grid2">
              <label className="f" htmlFor={`mp-rt-${i}`}>Rubrique {i + 1} : titre<input id={`mp-rt-${i}`} name={`rubrique_titre_${i}`} defaultValue={r.titre} maxLength={150} placeholder={i === 0 ? "Ex. Assurances" : undefined} /></label>
              <label className="f" htmlFor={`mp-rx-${i}`}>Texte<textarea id={`mp-rx-${i}`} name={`rubrique_texte_${i}`} rows={2} defaultValue={r.texte} maxLength={4000} /></label>
            </div>
          ))}
          <label className="f" htmlFor="mp-pied">Pied de page (facultatif)<input id="mp-pied" name="piedDePage" defaultValue={p.piedDePage ?? ""} maxLength={500} placeholder="Ex. adresse et téléphone du lycée" /></label>
        </Formulaire>
        {type === "convention" && ex && <Link className="btn small" href={`/conventions/${ex.id}?apercu=cap`} target="_blank">Voir une convention avec ce modèle</Link>}
        {type === "ordre_mission" && om && <Link className="btn small" href={`/ordres-mission/${om.id}`} target="_blank">Voir un ordre de mission avec ce modèle</Link>}
        {type === "attestation" && ex && <a className="btn small" href={`/organisation/documents/attestation/apercu?stage=${ex.id}`} target="_blank" rel="noopener">Voir une attestation avec ce modèle</a>}
        {type === "livret" && ex && <a className="btn small" href={`/organisation/documents/livret/apercu?stage=${ex.id}`} target="_blank" rel="noopener">Voir un livret avec ce modèle</a>}
      </div>

      {doc.pdf && <div className="panel pad section" id="pdf">
        <h2>PDF de votre lycée</h2>
        <p className="sub" style={{ margin: 0 }}>Déposez votre convention au format PDF avec ses champs à remplir (un « PDF modifiable »). Cap PFMP écrit dans chaque champ la donnée que vous choisissez : votre document reste identique.</p>
        <Formulaire action={deposerPdfModele} className="actions" bouton={m.pdfCle ? "Remplacer le PDF" : "Déposer le PDF"} boutonClasse="btn small primary">
          <input type="hidden" name="type" value={type} />
          <label className="f" htmlFor="mp-pdf" style={{ flex: 1, minWidth: 200 }}><span className="vh">Fichier PDF</span><input id="mp-pdf" name="pdf" type="file" accept="application/pdf" required /></label>
        </Formulaire>
        {!m.pdfCle && <p className="sub" style={{ margin: 0 }}>Pas de PDF sous la main ? <a href={`/organisation/documents/${type}/exemple`} target="_blank" rel="noopener">Téléchargez un exemple fictif</a> pour essayer.</p>}
        {m.pdfCle && (
          <>
            <p className="sub" style={{ margin: 0 }}>
              <b>{m.pdfNom}</b> · {m.champs.length} champ(s) : {remplis} rempli(s) par Cap PFMP, {aCompleter} à compléter en signant, {m.champs.length - remplis - aCompleter} laissé(s) vide(s).
              Les noms des champs sont souvent peu parlants (« Texte_13 ») : l&apos;aperçu des noms montre où se trouve chacun.
            </p>
            <div className="actions">
              <a className="btn small" href={`/organisation/documents/${type}/apercu?reperage=1`} target="_blank" rel="noopener">Aperçu des noms de champs</a>
              {ex && <a className="btn small" href={`/organisation/documents/${type}/apercu?stage=${ex.id}`} target="_blank" rel="noopener">Aperçu rempli avec un stage</a>}
            </div>
            <Formulaire action={enregistrerChamps} bouton="Enregistrer les champs" id="champs">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="cle" value={m.pdfCle} />
              <p className="sub" style={{ margin: 0 }}>« À compléter en signant » : la famille ou l&apos;entreprise remplit ce champ au moment de signer en ligne (téléphone, assureur…). Indiquez la question à lui poser. Le nom d&apos;un signataire reçoit sa signature dessinée juste au-dessus.</p>
              <div className="panel rows">
                {m.champs.map((c, i) => (
                  // La ligne est recréée quand ce qui est enregistré change : une liste déroulante ne reprend pas d'elle-même sa nouvelle valeur.
                  <div key={`${i}-${c.nom}-${c.source}-${c.fixe ?? ""}-${c.libelle ?? ""}`} className="row champ-pdf">
                    <div className="main" style={{ minWidth: 170 }}>
                      <div className="name">{c.nom}</div>
                      <div className="meta">{SORTES[c.type]} · page {c.pages.join(", ") || "?"}{c.options?.length ? ` · ${c.options.slice(0, 4).join(", ")}${c.options.length > 4 ? "…" : ""}` : ""}</div>
                    </div>
                    <label className="f" htmlFor={`src-${i}`} style={{ flex: 2, minWidth: 220 }}><span className="vh">Contenu du champ {c.nom}</span><ChoixSource c={c} i={i} /></label>
                    {c.type !== "case" && c.type !== "signature" && (
                      <>
                        <label className="f fixe" htmlFor={`fixe-${i}`} style={{ flex: 1, minWidth: 160 }}><span className="vh">Texte fixe</span><input id={`fixe-${i}`} name={`fixe_${i}`} defaultValue={c.fixe ?? ""} placeholder="Texte fixe" maxLength={300} /></label>
                        <label className="f question" htmlFor={`q-${i}`} style={{ flex: 1, minWidth: 160 }}><span className="vh">Question posée en signant</span><input id={`q-${i}`} name={`q_${i}`} defaultValue={c.libelle ?? c.nom} placeholder="Question posée en signant" maxLength={120} /></label>
                      </>
                    )}
                    {c.type === "case" && <label className="f question" htmlFor={`q-${i}`} style={{ flex: 1, minWidth: 160 }}><span className="vh">Question posée en signant</span><input id={`q-${i}`} name={`q_${i}`} defaultValue={c.libelle ?? c.nom} placeholder="Question posée en signant" maxLength={120} /></label>}
                  </div>
                ))}
              </div>
            </Formulaire>
          </>
        )}
      </div>}
    </>
  );
}
