import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { gereLesAcces } from "@/lib/acces";
import { Entete, Pill } from "@/components/ui";
import { GenerateurDeFiches } from "./Fiches";

export const metadata = { title: "Comptes et fiches de connexion" };

type Compte = typeof schema.users.$inferSelect;

function EtatCompte({ u, email }: { u?: Compte; email?: string | null }) {
  if (!u) return <Pill ton={email ? "warn" : "bad"}>{email ? "Pas de compte" : "Pas d'adresse e-mail"}</Pill>;
  if (!u.derniereConnexion) return <Pill ton="info">Jamais connecté</Pill>;
  return <Pill ton="ok">Compte utilisé</Pill>;
}

/** Comptes des élèves et de leurs parents, classe par classe, et fiches de connexion : le DDFPT et la direction seulement. */
export default async function AccesDesFamilles({ searchParams }: { searchParams: Promise<{ classe?: string }> }) {
  const ctx = await contexte();
  if (!gereLesAcces(ctx)) redirect("/eleves");
  const sp = await searchParams;
  const classes = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)))
    .orderBy(asc(schema.classes.libelle));
  const classe = classes.find((c) => c.id === sp.classe) ?? classes[0];
  const eleves = classe ? await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.classeId, classe.id), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.eleves.nom), asc(schema.eleves.prenom)) : [];
  const comptes = await db.select().from(schema.users).where(inArray(schema.users.id, eleves.map((e) => e.userId).filter((x): x is string => !!x).concat("00000000-0000-0000-0000-000000000000")));
  const parents = eleves.length ? await db.select({ u: schema.users, eleveId: schema.responsables.eleveId }).from(schema.responsables)
    .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
    .where(inArray(schema.responsables.eleveId, eleves.map((e) => e.id))) : [];
  return (
    <>
      <Entete titre="Comptes et fiches de connexion" sous="Réservé au DDFPT et à la direction : comptes des élèves et des parents, et fiches de connexion à imprimer, classe par classe." />
      <div className="chips" aria-label="Classes">
        {classes.map((c) => <Link key={c.id} className="chip" href={`/eleves/acces?classe=${c.id}`} aria-current={c.id === classe?.id ? "true" : undefined}>{c.libelle}</Link>)}
      </div>
      {classe && (
        <>
          <div className="panel rows">
            {eleves.length === 0 && <div className="empty">Aucun élève dans cette classe.</div>}
            {eleves.map((e) => {
              const u = comptes.find((x) => x.id === e.userId);
              const ps = parents.filter((p) => p.eleveId === e.id);
              return (
                <div key={e.id} className="row">
                  <div className="main" style={{ minWidth: 220 }}>
                    <div className="name"><Link href={`/eleves/${e.id}`}>{e.nom} {e.prenom}</Link></div>
                    <div className="meta">{u?.email ?? e.email ?? "adresse e-mail à compléter sur la fiche de l'élève"}{ps.length ? ` · parents : ${ps.map((p) => `${p.u.prenom} ${p.u.nom}${p.u.derniereConnexion ? "" : " (jamais connecté)"}`).join(", ")}` : " · aucun parent enregistré"}</div>
                  </div>
                  <EtatCompte u={u} email={e.email} />
                </div>
              );
            })}
          </div>
          <div className="panel pad section">
            <h2>Fiches de connexion · {classe.libelle}</h2>
            <p className="sub" style={{ margin: 0 }}>
              Crée les comptes des élèves qui ont une adresse e-mail, et donne un nouveau mot de passe provisoire aux comptes jamais utilisés.
              Chaque fiche porte l&apos;adresse du site, l&apos;identifiant, le mot de passe provisoire et un QR code à scanner avec le téléphone.
            </p>
            <GenerateurDeFiches classeId={classe.id} lycee={ctx.etab.nom} />
          </div>
        </>
      )}
    </>
  );
}
