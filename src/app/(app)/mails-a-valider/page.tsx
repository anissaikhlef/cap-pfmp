import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { classesGerees, gereToutLEtablissement } from "@/lib/acces";
import { mailsAValiderPour } from "@/lib/agent-administratif";
import { AGENTS } from "@/lib/agents";
import { dateCourte } from "@/lib/dates";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { ecarterMail, preparerMailsDuJour, validerMail } from "./actions";

export const metadata = { title: "Mails à valider" };

const PRIORITES: Record<number, [string, "bad" | "warn" | "muted"]> = { 1: ["Urgent", "bad"], 2: ["À faire", "warn"], 3: ["Quand vous pouvez", "muted"] };

export default async function MailsAValider() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire", "professeur"] });
  // Option SMS du lycée (décision d'Anissa) : sinon, que des mails.
  const sms = ctx.etab.reglages.agents.sms;
  const mails = await mailsAValiderPour(ctx);
  const gestion = gereToutLEtablissement(ctx);
  const peutPreparer = gestion || (await classesGerees(ctx)).length > 0;
  const traites = gestion
    ? await db.select().from(schema.mailsAValider)
      .where(and(eq(schema.mailsAValider.etablissementId, ctx.etab.id), ne(schema.mailsAValider.statut, "a_valider")))
      .orderBy(desc(schema.mailsAValider.traiteLe)).limit(10)
    : [];
  const agent = AGENTS.administratif;
  return (
    <>
      <Entete titre="Mails à valider" sous={<>{agent.nom}, l&apos;agent administratif de Cap PFMP, prépare les mails aux familles et aux entreprises. Rien ne part sans vous : relisez, modifiez si besoin, puis envoyez. Les mails d&apos;un élève sont validés par le professeur référent de sa classe ; la gestion des PFMP peut tous les valider.</>}>
        {peutPreparer && (
          <form action={preparerMailsDuJour} className="actions"><ChampRetour /><button className="btn">Préparer les mails du jour</button></form>
        )}
      </Entete>
      <div className="section">
        <h2>À relire ({mails.length})</h2>
        <div className="panel rows">
          {mails.length === 0 && <div className="empty">Aucun mail n&apos;attend votre validation. {agent.nom} passe chaque matin.</div>}
          {mails.map(({ m, e, c }) => {
            const [prio, ton] = PRIORITES[m.priorite] ?? PRIORITES[2];
            return (
              <div key={m.id} className="row mail-agent" style={{ alignItems: "flex-start", flexDirection: "column" }}>
                <div className="main" style={{ width: "100%" }}>
                  <div className="name"><Pill ton={ton}>{prio}</Pill> {m.sujet}</div>
                  <div className="meta">
                    {e ? <Link href={`/eleves/${e.id}`}>{e.prenom} {e.nom}</Link> : null}{c ? ` · ${c.libelle}` : ""} · à {m.destinataires.length ? m.destinataires.map((d) => `${d.nom} (${d.email})`).join(", ") : "adresse à indiquer"}
                  </div>
                  <div className="meta">Pourquoi : {m.motif}</div>
                  {m.prevenir.length > 0 && <div className="meta">À l&apos;envoi, seront aussi prévenus : {m.prevenir.map((d) => d.nom).join(", ")}</div>}
                  <pre className="corps-mail">{m.corps}</pre>
                  <p className="sub" style={{ margin: 0 }}>Préparé par {agent.nom} le {dateCourte(m.createdAt.toISOString().slice(0, 10))}{m.simule ? " · texte d'exemple (agent en démonstration)" : ""}.</p>
                </div>
                <div className="actions">
                  <form action={validerMail} className="actions"><ChampRetour /><input type="hidden" name="id" value={m.id} />{!m.destinataires.length && <label className="f">Adresse mail de l&apos;entreprise<input name="a" type="email" required /></label>}{sms && <label className="check"><input type="checkbox" name="sms" value="oui" /> aussi par SMS</label>}<button className="btn small primary">Envoyer</button></form>
                  <details>
                    <summary className="btn small">Modifier</summary>
                    <form action={validerMail} className="stack" style={{ minWidth: "min(560px, 80vw)" }}>
                      <ChampRetour /><input type="hidden" name="id" value={m.id} />
                      {!m.destinataires.length && <label className="f" htmlFor={`a-${m.id}`}>Adresse mail de l&apos;entreprise<input id={`a-${m.id}`} name="a" type="email" required /></label>}
                      <label className="f" htmlFor={`sujet-${m.id}`}>Sujet<input id={`sujet-${m.id}`} name="sujet" defaultValue={m.sujet} maxLength={200} /></label>
                      <label className="f" htmlFor={`corps-${m.id}`}>Texte<textarea id={`corps-${m.id}`} name="corps" defaultValue={m.corps} rows={12} maxLength={5000} /></label>
                      {sms && <label className="check"><input type="checkbox" name="sms" value="oui" /> aussi par SMS</label>}
                      <button className="btn small primary">Enregistrer et envoyer</button>
                    </form>
                  </details>
                  <form action={ecarterMail}><ChampRetour /><input type="hidden" name="id" value={m.id} /><button className="btn small danger">Ne pas envoyer</button></form>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {gestion && traites.length > 0 && (
        <div className="section">
          <h2>Derniers mails traités</h2>
          <div className="panel rows">
            {traites.map((m) => (
              <div key={m.id} className="row">
                <div className="main"><div className="name">{m.sujet}</div><div className="meta">{m.destinataires.map((d) => d.nom).join(", ")}{m.traiteLe ? ` · ${dateCourte(m.traiteLe.toISOString().slice(0, 10))}` : ""}</div></div>
                <Pill ton={m.statut === "envoye" ? "ok" : "muted"}>{m.statut === "envoye" ? "Envoyé" : "Pas envoyé"}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
