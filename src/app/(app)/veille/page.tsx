import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { AGENTS, aLAgent } from "@/lib/agents";
import { alertesDuLycee } from "@/lib/agent-veille";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { comparer, decisionChangement, enregistrerEcheance, enregistrerVeilleDuLycee, suiteAlerte } from "./actions";
import { echeancesDuLycee, peutProposerChangement, peutValiderChangement } from "@/lib/veille-lycee";
import { CIBLES, valeurActuelle, valeurDe, type Cible } from "@/lib/veille-def";
import { aujourdhui, dateLongue } from "@/lib/dates";

function ChampsEcheance({ e }: { e?: { titre: string; date: string; concerne: string } }) {
  return (
    <>
      <label className="f" style={{ flex: 1, minWidth: 200 }}>Échéance<input name="titre" defaultValue={e?.titre} maxLength={200} placeholder="Ex. Envoi des attestations à l'académie" required /></label>
      <label className="f">Date<input name="date" type="date" defaultValue={e?.date} min={aujourdhui()} required /></label>
      <label className="f">Pour
        <select name="concerne" defaultValue={e?.concerne ?? "toutes"}><option value="toutes">toutes les classes</option><option value="examen">les classes d&apos;examen</option></select>
      </label>
    </>
  );
}

export const metadata = { title: "Veille réglementaire" };

export default async function Veille() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!aLAgent(ctx.etab.reglages, "veille")) redirect("/organisation/agents");
  const alertes = await alertesDuLycee(ctx);
  const echeances = await echeancesDuLycee(ctx);
  const nom = AGENTS.veille.nom;
  const proposer = peutProposerChangement(ctx), valider = peutValiderChangement(ctx);
  return (
    <>
      <Entete titre="Veille réglementaire" sous={`${nom} suit les textes officiels sur les PFMP. Chaque alerte donne un résumé, le lien vers le texte et des propositions : rien ne change dans Cap PFMP ni dans votre organisation sans votre décision.`} />
      <div className="panel pad section" id="echeances">
        <h2>Calendrier des échéances</h2>
        <p className="sub" style={{ margin: 0 }}>{nom} propose les dates trouvées dans les textes officiels ; vous les retenez, les corrigez ou en ajoutez. Rappels au DDFPT, à la direction et aux professeurs référents des classes concernées, {ctx.etab.reglages.relances.echeances.join(" et ")} jours avant.</p>
        <div className="rows panel">
          {echeances.length === 0 && <div className="empty">Aucune échéance pour l&apos;instant.</div>}
          {echeances.map((e) => (
            <div key={e.id} className="row" id={`echeance-${e.id}`} style={{ alignItems: "flex-start", flexDirection: "column" }}>
              <div className="main"><div className="name">{e.titre} · {dateLongue(e.date)} {e.statut === "proposee" ? <Pill ton="warn">Proposée par {nom}</Pill> : e.date < aujourdhui() ? <Pill ton="muted">Passée</Pill> : null}</div>
                <div className="meta">Pour {e.concerne === "examen" ? "les classes d'examen" : "toutes les classes"}</div></div>
              <form action={enregistrerEcheance} className="actions">
                <ChampRetour /><input type="hidden" name="id" value={e.id} />
                <ChampsEcheance e={e} />
                <button className="btn small primary" name="quoi" value="retenir">{e.statut === "proposee" ? "Retenir" : "Corriger"}</button>
                <button className="btn small danger" name="quoi" value="retirer" formNoValidate>Retirer</button>
              </form>
            </div>
          ))}
        </div>
        <form action={enregistrerEcheance} className="actions">
          <ChampRetour /><ChampsEcheance />
          <button className="btn small">Ajouter l&apos;échéance</button>
        </form>
        <form action={enregistrerVeilleDuLycee} className="stack">
          <ChampRetour />
          <div className="grid2">
            <label className="f" htmlFor="v-rappels">Rappels des échéances (jours avant la date)<input id="v-rappels" name="rappels" defaultValue={ctx.etab.reglages.relances.echeances.join(", ")} placeholder="Ex. 15, 3" /></label>
            <label className="f" htmlFor="v-pages">Pages du site de votre académie à lire chaque semaine (une adresse par ligne ; alertes directes, sans relecture par l&apos;équipe Cap PFMP)<textarea id="v-pages" name="pages" rows={2} defaultValue={ctx.etab.reglages.veillePages.join("\n")} placeholder="https://www.ac-…fr/…" /></label>
          </div>
          <div className="actions"><button className="btn small">Enregistrer</button></div>
        </form>
      </div>
      <div className="stack">
        {alertes.length === 0 && <div className="panel empty">Aucune alerte pour le moment.</div>}
        {alertes.map(({ a, s }) => (
          <div key={a.id} className="panel pad section agent-ia">
            <h2 style={{ marginBottom: 2 }}>{a.titre} {!s?.lueLe && <Pill ton="warn">Nouvelle</Pill>}</h2>
            <p className="sub" style={{ margin: 0 }}>Publiée le {a.publieeLe ? dateCourte(a.publieeLe.toISOString().slice(0, 10)) : ""} · <a href={a.source} target="_blank" rel="noopener noreferrer">Lire le texte officiel</a></p>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.resume}</p>
            {a.propositions.length > 0 && (
              <>
                <b>Ce qu&apos;il faudrait faire</b>
                <div className="rows panel">
                  {a.propositions.map((p, i) => {
                    const d = s?.decisions[String(i)];
                    return (
                      <div key={i} className="row">
                        <div className="main">{p}</div>
                        {d ? <Pill ton={d === "fait" ? "ok" : "muted"}>{d === "fait" ? "Fait" : "Pas pour nous"}</Pill> : (
                          <div className="actions">
                            <form action={suiteAlerte}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><input type="hidden" name="proposition" value={i} /><input type="hidden" name="decision" value="fait" /><button className="btn small">C&apos;est fait</button></form>
                            <form action={suiteAlerte}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><input type="hidden" name="proposition" value={i} /><input type="hidden" name="decision" value="pas_pour_nous" /><button className="btn small">Pas pour nous</button></form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {a.changements.length > 0 && (
              <>
                <b>À appliquer en un clic dans Cap PFMP</b>
                <p className="sub" style={{ margin: 0 }}>Le DDFPT propose, la direction valide : le réglage change alors aussitôt.</p>
                <div className="rows panel">
                  {a.changements.map((c, i) => {
                    const ap = s?.applications[String(i)];
                    const cible = c.cible as Cible;
                    return (
                      <div key={i} className="row" id={`changement-${a.id}-${i}`}>
                        <div className="main">
                          <div className="name">{c.libelle}</div>
                          <div className="meta">{CIBLES[cible]?.libelle} : aujourd&apos;hui {valeurActuelle(ctx.etab.reglages, cible)}, proposé {String(valeurDe({ cible, valeur: c.valeur }))}</div>
                        </div>
                        {ap?.valideLe ? <Pill ton="ok">Appliqué</Pill> : ap?.refuseLe ? <Pill ton="muted">Refusé</Pill> : ap ? (
                          valider ? (
                            <div className="actions">
                              <form action={decisionChangement}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><input type="hidden" name="n" value={i} /><input type="hidden" name="quoi" value="valider" /><button className="btn small primary">Valider et appliquer</button></form>
                              <form action={decisionChangement}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><input type="hidden" name="n" value={i} /><input type="hidden" name="quoi" value="refuser" /><button className="btn small">Refuser</button></form>
                            </div>
                          ) : <Pill ton="warn">Proposé, en attente de la direction</Pill>
                        ) : proposer ? (
                          <form action={decisionChangement}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><input type="hidden" name="n" value={i} /><input type="hidden" name="quoi" value="proposer" /><button className="btn small">Proposer d&apos;appliquer</button></form>
                        ) : <span className="sub">Le DDFPT peut proposer de l&apos;appliquer.</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {s?.comparaison && (
              <div className="section" id={`comparaison-${a.id}`}>
                <b>Comparaison avec vos documents</b> <span className="sub">({new Date(s.comparaison.le).toLocaleDateString("fr-FR")}{s.comparaison.simule ? ", exemple de démonstration" : ""})</span>
                {s.comparaison.ecarts.length ? <ul style={{ margin: 0 }}>{s.comparaison.ecarts.map((x, i) => <li key={i}><b>{x.document}</b> : {x.ecart}</li>)}</ul> : <p className="sub" style={{ margin: 0 }}>Aucun écart trouvé.</p>}
              </div>
            )}
            <div className="actions" style={{ marginTop: 8 }}>
              <form action={comparer}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><button className="btn small">{s?.comparaison ? "Comparer de nouveau" : "Comparer avec nos documents"}</button></form>
              {!s?.lueLe && <form action={suiteAlerte}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><button className="btn small">Marquer comme lue</button></form>}
              <Link className="btn small" href="/organisation">Ouvrir l&apos;organisation</Link>
            </div>
            <p className="sub" style={{ margin: "6px 0 0" }}>Préparé avec {nom}{a.etablissementId ? ", d'après une page suivie par votre lycée (non relu par l'équipe Cap PFMP)" : `, relu par l'équipe Cap PFMP${a.academie ? ` · académie de ${a.academie}` : ""}`}{a.simule ? " · texte d'exemple (agent en démonstration)" : ""}.</p>
          </div>
        ))}
      </div>
    </>
  );
}
