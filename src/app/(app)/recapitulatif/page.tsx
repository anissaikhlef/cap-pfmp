import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { classesDuRecapitulatif, modeleRecapitulatif, peutViser, pointsAVerifier, recapitulatif } from "@/lib/recapitulatif";
import { texteDuree } from "@/lib/regles";
import { casesManquantes } from "@/lib/xlsx-modele";
import { ChampRetour } from "@/components/ChampRetour";
import { Formulaire } from "@/components/Formulaire";
import { Entete } from "@/components/ui";
import { enregistrerCandidat, retirerVisa, viserClasse } from "./actions";

export const metadata = { title: "Attestation récapitulative" };

const enClair = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Attestation récapitulative des PFMP d'une classe d'examen (décisions d'Anissa) : la direction, le DDFPT et le professeur
 * référent de la classe la préparent ; seule la direction la vise. Ne comptent que les PFMP effectuées et attestées.
 */
export default async function Recapitulatif({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const ctx = await contexte();
  const classes = await classesDuRecapitulatif(ctx);
  const admin = peutAdministrer(ctx);
  if (!classes.length && !admin) redirect("/");
  const sp = await searchParams;
  const choisie = classes.find((c) => c.id === sp.classe) ?? classes[0];
  const r = choisie ? await recapitulatif(ctx, choisie.id) : null;
  const m = await modeleRecapitulatif(ctx.etab.id);
  const pret = !!m && !casesManquantes(m.structure).length;
  const trop = m && r && r.candidats.length > m.structure.feuillesEleves.length;
  const viser = peutViser(ctx);
  const lien = (format: string) => `/recapitulatif/${r?.classe.id}?format=${format}`;
  const aVerifier = r ? r.candidats.filter((c) => pointsAVerifier(c).length) : [];
  const vises = r ? r.candidats.filter((c) => c.visa).length : 0;
  return (
    <>
      <Entete titre="Attestation récapitulative des PFMP" sous="Pour chaque classe d'examen (terminale, 2e année de CAP) : les PFMP de tout le cycle de chaque élève, déjà effectuées et attestées, avec le total en jours et en semaines. Cap PFMP remplit le fichier Excel de l'académie et propose la même attestation en Excel et en PDF.">
        {admin && <div className="actions"><Link className="btn" href="/organisation/recapitulatif">Réglages du fichier de l&apos;académie</Link></div>}
      </Entete>
      {!r ? <p className="panel empty">Aucune classe d&apos;examen cette année (terminale, ou CAP marqué « 2e année » dans la page de la classe).</p> : (
        <>
          <form className="panel pad section actions" method="get">
            <label className="f" htmlFor="r-classe">Classe
              <select id="r-classe" name="classe" defaultValue={r.classe.id}>{classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}</select>
            </label>
            <button className="btn">Afficher</button>
          </form>

          <div className="panel pad section" id="fichiers">
            <h2>{r.classe.libelle} · {r.titre} · session {r.session}</h2>
            <p className="sub" style={{ margin: 0 }}>
              {r.academie ? `Académie de ${r.academie}` : "Académie à indiquer (Organisation, « Attestation récapitulative »)"} · {r.candidats.length} élève(s) ·{" "}
              {aVerifier.length ? `${aVerifier.length} à vérifier` : "tout est complet"} · visa de la direction : {vises} sur {r.candidats.length}
            </p>
            <div className="actions">
              {pret && !trop && <a className="btn primary" href={lien("academie")}>Fichier de l&apos;académie (Excel)</a>}
              <a className="btn" href={lien("excel")}>Version Cap PFMP (Excel)</a>
              <a className="btn" href={lien("pdf")} target="_blank" rel="noopener">Version Cap PFMP (PDF)</a>
            </div>
            {!m && <p className="note">Le fichier de l&apos;académie n&apos;est pas encore déposé{admin ? <> : <Link href="/organisation/recapitulatif">déposez-le</Link> pour qu&apos;il soit rempli automatiquement</> : " : la direction ou le DDFPT le dépose dans l'organisation du lycée"}.</p>}
            {m && !pret && <p className="note">Le fichier de l&apos;académie est déposé, mais certaines cases restent à indiquer{admin ? <> : <Link href="/organisation/recapitulatif">vérifiez-les</Link></> : ""}.</p>}
            {trop && <p className="msg err">Le fichier de l&apos;académie prévoit {m!.structure.feuillesEleves.length} élèves au plus ; la classe en compte {r.candidats.length}.</p>}
            {viser ? (
              <form action={viserClasse} className="actions">
                <ChampRetour /><input type="hidden" name="classeId" value={r.classe.id} />
                <button className="btn">Viser les attestations de la classe</button>
                <span className="sub">La croix du visa du chef d&apos;établissement figure alors dans les fichiers.</span>
              </form>
            ) : <p className="sub" style={{ margin: 0 }}>Le visa du chef d&apos;établissement est apposé par la direction, dans cette même page.</p>}
          </div>

          <div className="panel rows" id="candidats">
            {r.candidats.length === 0 && <div className="empty">Aucun élève dans cette classe.</div>}
            {r.candidats.map((c) => {
              const points = pointsAVerifier(c);
              return (
                <div key={c.id} className="row" id={`candidat-${c.id}`} style={{ alignItems: "flex-start" }}>
                  <div className="main">
                    <div className="name">
                      {c.nom} {c.prenom}
                      <span className="cls">{c.semaines} semaine(s){c.attendues !== null ? ` sur ${c.attendues}` : ""}</span>
                      {" "}{c.visa ? <span className="pill t-ok">visée</span> : <span className="pill t-muted">visa en attente</span>}
                    </div>
                    <div className="meta">
                      N° candidat : {c.numero || "à indiquer"} · cycle de {texteDuree(c.duree)} · dérogation : {c.derogation ? "oui" : "non"} · {c.jours} jour(s) attesté(s)
                    </div>
                    {c.pfmp.length > 0 && (
                      <ul className="sub" style={{ margin: "4px 0" }}>
                        {c.pfmp.map((x) => (
                          <li key={x.stageId}>{x.periode} ({x.classe}) du {enClair(x.debut)} au {enClair(x.fin)} · {x.entreprise} · {x.jours} jour(s) {x.declares ? "déclarés par l'entreprise" : "(absences déduites)"}</li>
                        ))}
                      </ul>
                    )}
                    {c.aVenir.map((x) => <div key={`${x.periode}-${x.debut}`} className="sub">{x.periode} ({x.entreprise}) : {x.raison}, comptera une fois terminée et attestée.</div>)}
                    {points.map((p) => <div key={p} className="msg err" style={{ margin: "4px 0" }}>{p}</div>)}
                    <Formulaire action={enregistrerCandidat} className="actions" bouton="Enregistrer" boutonClasse="btn small" viderApres={false}>
                      <input type="hidden" name="eleveId" value={c.id} />
                      <label className="f" htmlFor={`n-${c.id}`}>N° candidat<input id={`n-${c.id}`} name="numero" defaultValue={c.numero} maxLength={20} style={{ width: 140 }} /></label>
                      <label className="f" htmlFor={`d-${c.id}`}>Durée du cycle
                        <select id={`d-${c.id}`} name="dureeCycle" defaultValue={c.dureePropre ? String(c.duree) : ""}>
                          <option value="">Celle de la formation</option>
                          {[1, 2, 3].map((n) => <option key={n} value={n}>{texteDuree(n)}</option>)}
                        </select>
                      </label>
                      <label className="choice" htmlFor={`g-${c.id}`}><input id={`g-${c.id}`} type="checkbox" name="derogation" value="oui" defaultChecked={c.derogation} /> <span>Demande de dérogation déposée</span></label>
                    </Formulaire>
                  </div>
                  {viser && c.visa && (
                    <form action={retirerVisa}><ChampRetour /><input type="hidden" name="eleveId" value={c.id} /><button className="btn small">Retirer le visa</button></form>
                  )}
                </div>
              );
            })}
          </div>
          <p className="sub">Ne comptent que les PFMP terminées dont l&apos;attestation de stage est validée. Jours : ceux que l&apos;entreprise a déclarés dans l&apos;attestation en ligne, sinon les jours prévus moins les absences. 1 semaine = 5 jours.</p>
        </>
      )}
    </>
  );
}
