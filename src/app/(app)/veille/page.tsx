import Link from "next/link";
import { redirect } from "next/navigation";
import { contexte } from "@/lib/auth";
import { AGENTS, aLAgent } from "@/lib/agents";
import { alertesDuLycee } from "@/lib/agent-veille";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { suiteAlerte } from "./actions";

export const metadata = { title: "Veille réglementaire" };

export default async function Veille() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (!aLAgent(ctx.etab.reglages, "veille")) redirect("/organisation/agents");
  const alertes = await alertesDuLycee(ctx);
  const nom = AGENTS.veille.nom;
  return (
    <>
      <Entete titre="Veille réglementaire" sous={`${nom} suit les textes officiels sur les PFMP. Chaque alerte donne un résumé, le lien vers le texte et des propositions : rien ne change dans Cap PFMP ni dans votre organisation sans votre décision.`} />
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
            <div className="actions" style={{ marginTop: 8 }}>
              {!s?.lueLe && <form action={suiteAlerte}><ChampRetour /><input type="hidden" name="alerteId" value={a.id} /><button className="btn small">Marquer comme lue</button></form>}
              <Link className="btn small" href="/organisation">Ouvrir l&apos;organisation</Link>
            </div>
            <p className="sub" style={{ margin: "6px 0 0" }}>Préparé avec {nom}, relu par l&apos;équipe Cap PFMP{a.simule ? " · texte d'exemple (agent en démonstration)" : ""}.</p>
          </div>
        ))}
      </div>
    </>
  );
}
