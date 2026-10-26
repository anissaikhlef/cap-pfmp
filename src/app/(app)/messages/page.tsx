import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, estGestionnaire } from "@/lib/acces";
import { Pill } from "@/components/ui";

export const metadata = { title: "Messages envoyés" };

export default async function Messages() {
  const ctx = await contexte();
  if (!(await estGestionnaire(ctx)) && !a(ctx, "direction")) redirect("/");
  const liste = await db.select({ m: schema.messages, u: schema.users }).from(schema.messages)
    .leftJoin(schema.users, eq(schema.users.id, schema.messages.envoyeParId))
    .where(eq(schema.messages.etablissementId, ctx.etab.id)).orderBy(desc(schema.messages.createdAt)).limit(200);
  const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
  return (
    <>
      <div><h1>Messages envoyés</h1><p className="sub">Mails et SMS partis de l&apos;application. Tant qu&apos;aucun prestataire n&apos;est branché, ils sont seulement enregistrés ici (« simulé »).</p></div>
      <div className="panel rows">
        {liste.length === 0 && <div className="empty">Aucun message pour l&apos;instant.</div>}
        {liste.map(({ m, u }) => (
          <details key={m.id} className="row" style={{ display: "block" }}>
            <summary style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Pill ton={m.canal === "sms" ? "info" : "muted"}>{m.canal === "sms" ? "SMS" : "Mail"}</Pill>
              <span className="main" style={{ flex: 1, minWidth: 0 }}><b>{m.sujet ?? m.corps.slice(0, 70) + "…"}</b><br /><span className="meta">À {m.destinataire} · {fmt.format(m.createdAt)}{u ? ` · par ${u.prenom} ${u.nom}` : ""}</span></span>
              <Pill ton={m.statut === "envoye" ? "ok" : m.statut === "erreur" ? "bad" : "warn"}>{m.statut === "simule" ? "Simulé" : m.statut === "envoye" ? "Envoyé" : "Erreur"}</Pill>
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "10px 0 0" }}>{m.corps}</pre>
          </details>
        ))}
      </div>
    </>
  );
}
