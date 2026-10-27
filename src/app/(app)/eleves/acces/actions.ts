"use server";
import { and, asc, eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte, hacherMotDePasse, motDePasseProvisoire } from "@/lib/auth";
import { gereLesAcces } from "@/lib/acces";
import { adresseDuSite } from "@/lib/liens";
import { journaliser } from "@/lib/journal";

export type Fiche = { id: string; nom: string; role: string; identifiant: string; motDePasse: string; qr: string };
export type EtatFiches = { erreur?: string; ok?: string; fiches?: Fiche[]; adresse?: string } | null;

/**
 * Comptes d'une classe en une fois, et une fiche de connexion par personne (adresse du site, identifiant,
 * mot de passe provisoire, QR code). Seulement le DDFPT et la direction (décision d'Anissa).
 * Les mots de passe ne sont jamais enregistrés en clair : les fiches ne s'affichent qu'une fois, pour être imprimées.
 */
export async function preparerFiches(_: EtatFiches, fd: FormData): Promise<EtatFiches> {
  const ctx = await contexte();
  if (!gereLesAcces(ctx)) return { erreur: "Seul le DDFPT crée les comptes et donne les mots de passe." };
  const classeId = z.string().uuid().safeParse(fd.get("classeId"));
  if (!classeId.success) return { erreur: "Choisissez une classe." };
  const [classe] = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.id, classeId.data), eq(schema.classes.etablissementId, ctx.etab.id))).limit(1);
  if (!classe) return { erreur: "Classe introuvable." };
  const pourEleves = fd.get("eleves") === "on", pourParents = fd.get("parents") === "on", renouveler = fd.get("renouveler") === "on";
  if (!pourEleves && !pourParents) return { erreur: "Cochez les élèves, les parents, ou les deux." };

  const base = await adresseDuSite();
  const qr = (email: string) => QRCode.toString(`${base}/connexion?email=${encodeURIComponent(email)}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const eleves = await db.select().from(schema.eleves)
    .where(and(eq(schema.eleves.classeId, classe.id), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.eleves.nom), asc(schema.eleves.prenom));
  const fiches: Fiche[] = [];
  const sansAdresse: string[] = [];
  let crees = 0, renouveles = 0, dejaUtilises = 0;
  const nouveauMotDePasse = async (userId: string) => {
    const secret = motDePasseProvisoire();
    await db.update(schema.users).set({ passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true }).where(eq(schema.users.id, userId));
    renouveles++;
    return secret;
  };

  if (pourEleves) {
    for (const e of eleves) {
      const nom = `${e.prenom} ${e.nom}`;
      if (!e.userId) {
        const email = e.email?.trim().toLowerCase();
        const [existe] = email ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1) : [];
        if (!email || existe) { sansAdresse.push(nom); continue; }
        const secret = motDePasseProvisoire();
        const [u] = await db.insert(schema.users).values({
          etablissementId: ctx.etab.id, email, prenom: e.prenom, nom: e.nom, roles: ["eleve"],
          passwordHash: await hacherMotDePasse(secret), doitChangerMotDePasse: true,
        }).returning({ id: schema.users.id });
        await db.update(schema.eleves).set({ userId: u.id }).where(eq(schema.eleves.id, e.id));
        crees++;
        fiches.push({ id: u.id, nom, role: `Élève · ${classe.libelle}`, identifiant: email, motDePasse: secret, qr: await qr(email) });
        continue;
      }
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, e.userId)).limit(1);
      if (!u) continue;
      if (u.derniereConnexion || !renouveler) { dejaUtilises++; continue; }
      fiches.push({ id: u.id, nom, role: `Élève · ${classe.libelle}`, identifiant: u.email, motDePasse: await nouveauMotDePasse(u.id), qr: await qr(u.email) });
    }
  }

  if (pourParents && eleves.length) {
    const rs = await db.select({ u: schema.users, eleveId: schema.responsables.eleveId }).from(schema.responsables)
      .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
      .where(and(inArray(schema.responsables.eleveId, eleves.map((e) => e.id)), eq(schema.users.actif, true)));
    // Un parent de plusieurs élèves de la classe reçoit une seule fiche.
    const parParent = new Map<string, { u: typeof schema.users.$inferSelect; enfants: string[] }>();
    for (const r of rs) {
      const e = eleves.find((x) => x.id === r.eleveId)!;
      const x = parParent.get(r.u.id) ?? { u: r.u, enfants: [] };
      x.enfants.push(`${e.prenom} ${e.nom}`);
      parParent.set(r.u.id, x);
    }
    for (const { u, enfants } of parParent.values()) {
      if (u.derniereConnexion || !renouveler) { dejaUtilises++; continue; }
      fiches.push({ id: u.id, nom: `${u.prenom} ${u.nom}`, role: `Responsable de ${enfants.join(" et ")}`, identifiant: u.email, motDePasse: await nouveauMotDePasse(u.id), qr: await qr(u.email) });
    }
  }

  await journaliser(ctx, "fiches_connexion", "classe", classe.id, { crees, renouveles, dejaUtilises, sansAdresse: sansAdresse.length });
  const resume = [
    `${fiches.length} fiche(s) prête(s) : ${crees} compte(s) d'élève créé(s), ${renouveles} nouveau(x) mot(s) de passe pour des comptes jamais utilisés.`,
    dejaUtilises ? `${dejaUtilises} compte(s) déjà utilisé(s) : pas de fiche, leur mot de passe ne change pas.` : "",
    sansAdresse.length ? `Sans adresse e-mail (ou adresse déjà utilisée), à compléter sur la fiche de l'élève : ${sansAdresse.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  return { ok: resume, fiches, adresse: base };
}
