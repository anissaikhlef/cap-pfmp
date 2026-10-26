import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutGererEleve } from "@/lib/acces";
import { chargerVisite } from "@/lib/visites";
import { dateLongue } from "@/lib/dates";

export const metadata = { title: "Ordre de mission" };

export default async function OrdreMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await contexte();
  const l = await chargerVisite(ctx, id);
  if (!l?.v?.visiteurId || l.v.ordreMission === "aucun") notFound();
  if (l.v.visiteurId !== ctx.user.id && !a(ctx, "direction") && !(await peutGererEleve(ctx, l.e))) notFound();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, l.v.visiteurId)).limit(1);
  const [signataire] = l.v.ordreMissionSigneParId ? await db.select().from(schema.users).where(eq(schema.users.id, l.v.ordreMissionSigneParId)).limit(1) : [];
  const ligne = (k: string, v: React.ReactNode) => <tr><th style={{ width: "38%" }}>{k}</th><td>{v}</td></tr>;
  return (
    <main className="convention">
      <p className="note noprint">Modèle provisoire. Il sera remplacé par le modèle d&apos;ordre de mission de votre établissement.</p>
      <h1>Ordre de mission</h1>
      <p className="sub">{ctx.etab.nom}</p>
      <table><tbody>
        {ligne("Agent", `${u.prenom} ${u.nom}${u.discipline ? `, ${u.discipline}` : ""}`)}
        {ligne("Objet", `Visite de la période de formation en milieu professionnel de ${l.e.prenom} ${l.e.nom} (${l.c.libelle})`)}
        {ligne("Lieu", `${l.ent.nom}, ${[l.ent.adresse, l.ent.ville].filter(Boolean).join(", ")}`)}
        {ligne("Date", `${dateLongue(l.v.date)}${l.v.heure ? ` à ${l.v.heure.replace(":", "h")}` : ""}`)}
        {ligne("Modalité", l.v.mode === "presentiel" ? "Sur place" : "À distance")}
        {ligne("Moyen de transport", "À préciser")}
      </tbody></table>
      <h2>Signature du chef d&apos;établissement</h2>
      <div className="sigs"><div className="sig">{l.v.ordreMission === "signe" ? `Signé le ${dateLongue(l.v.ordreMissionSigneLe!.toISOString().slice(0, 10))}${signataire ? ` par ${signataire.prenom} ${signataire.nom}` : ""}` : "En attente de signature"}</div></div>
    </main>
  );
}
