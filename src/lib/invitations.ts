import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Signataire } from "@/db/schema";
import type { ContexteConvention } from "./convention";
import { envoyer } from "./messages";
import { creerLien, JOURS_LIEN_SIGNATURE } from "./liens";
import { libelleSignataire } from "./regles";
import { dateLongue } from "./dates";

type Expediteur = { etab: { id: string; nom: string }; user?: { id: string } | null };
type Personne = { prenom: string; email: string | null; telephone?: string | null; dejaConnecte: boolean };

/**
 * Les personnes qui peuvent signer en une qualité donnée. Un compte déjà utilisé signe depuis son espace ;
 * sans compte (ou avec un compte jamais ouvert), la personne reçoit un lien personnel par mail, sinon par SMS.
 */
export async function personnesPour(cv: ContexteConvention, q: Signataire): Promise<Personne[]> {
  const compte = (u: typeof schema.users.$inferSelect): Personne => ({ prenom: u.prenom, email: u.email, telephone: u.telephone, dejaConnecte: !!u.derniereConnexion && u.actif });
  const parIds = async (ids: string[]) => ids.length ? db.select().from(schema.users).where(and(inArray(schema.users.id, ids), eq(schema.users.actif, true))) : [];
  const comptesEntreprise = () => db.select().from(schema.users)
    .where(and(eq(schema.users.entrepriseId, cv.s.entrepriseId), eq(schema.users.actif, true)));
  switch (q) {
    case "eleve": {
      const [u] = await parIds(cv.e.userId ? [cv.e.userId] : []);
      if (u) return [compte(u)];
      return cv.e.email ? [{ prenom: cv.e.prenom, email: cv.e.email, dejaConnecte: false }] : [];
    }
    case "parent": {
      const rs = await db.select({ u: schema.users }).from(schema.responsables)
        .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
        .where(and(eq(schema.responsables.eleveId, cv.e.id), eq(schema.users.actif, true)));
      return rs.map((r) => compte(r.u));
    }
    case "entreprise": {
      const comptes = (await comptesEntreprise()).filter((u) => u.roles.includes("entreprise") && u.derniereConnexion);
      if (comptes.length) return comptes.map(compte);
      const email = cv.ent.representantEmail ?? cv.ent.email;
      if (email || cv.ent.telephone) return [{ prenom: cv.ent.representantNom ?? "Madame, Monsieur", email, telephone: email ? null : cv.ent.telephone, dejaConnecte: false }];
      return [];
    }
    case "tuteur": {
      const t = cv.s.tuteur;
      if (!t) return [];
      const [u] = (await comptesEntreprise()).filter((x) => x.roles.includes("entreprise") && x.derniereConnexion && (!t.email || x.email === t.email.toLowerCase()));
      if (u) return [compte(u)];
      if (t.email || t.telephone) return [{ prenom: t.nom, email: t.email, telephone: t.email ? null : t.telephone, dejaConnecte: false }];
      return [];
    }
    case "professeur": {
      const [u] = await parIds(cv.referentId ? [cv.referentId] : []);
      return u ? [{ ...compte(u), dejaConnecte: true }] : [];
    }
    case "direction": {
      const ds = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, cv.e.etablissementId), eq(schema.users.actif, true)));
      return ds.filter((u) => u.roles.includes("direction")).map((u) => ({ ...compte(u), dejaConnecte: true }));
    }
  }
}

/**
 * Invite à signer la convention : mail « connectez-vous » pour un compte, lien personnel sinon.
 * Renvoie le nombre de messages et les qualités sans aucun moyen de contact.
 */
export async function inviterASigner(exp: Expediteur, cv: ContexteConvention, qualites: Signataire[], base: string, rappel = false, precision = "") {
  let messages = 0, liens = 0;
  const sansContact: Signataire[] = [];
  const objet = `la convention de stage de ${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle}), chez ${cv.ent.nom} du ${dateLongue(cv.p.debut)} au ${dateLongue(cv.p.fin)}`;
  for (const q of qualites) {
    const personnes = await personnesPour(cv, q);
    if (!personnes.length) { sansContact.push(q); continue; }
    const qualite = libelleSignataire(q).toLowerCase();
    for (const p of personnes) {
      const sujet = `${rappel ? "Rappel : c" : "C"}onvention de stage de ${cv.e.prenom} ${cv.e.nom} à signer`;
      if (p.dejaConnecte && p.email) {
        await envoyer(exp, {
          canal: "mail", destinataire: p.email, sujet, eleveId: cv.e.id, entrepriseId: cv.ent.id,
          corps: `Bonjour ${p.prenom},\n\n${rappel ? "Nous attendons encore" : "Voici"} ${objet}, à signer en tant que ${qualite}.${precision ? `\n${precision}` : ""}\nConnectez-vous à Cap PFMP pour la lire et la signer : ${base}/connexion\n\n${exp.etab.nom}`,
        });
        messages++;
        continue;
      }
      const destinataire = p.email ?? p.telephone;
      if (!destinataire) continue;
      const { jeton, expireLe } = await creerLien(exp.etab.id, { objet: "signature", destinataire, jours: JOURS_LIEN_SIGNATURE, stageId: cv.s.id, qualite: q, creeParId: exp.user?.id ?? null });
      const url = `${base}/signer/${jeton}`;
      if (p.email) {
        await envoyer(exp, {
          canal: "mail", destinataire: p.email, sujet, eleveId: cv.e.id, entrepriseId: cv.ent.id,
          corps: `Bonjour ${p.prenom},\n\n${rappel ? "Nous attendons encore votre signature sur" : "Voici"} ${objet}, à signer en tant que ${qualite}.${precision ? `\n${precision}` : ""}\nVous pouvez la lire et la signer en ligne, sans créer de compte, avec ce lien personnel, valable jusqu'au ${dateLongue(expireLe.toISOString().slice(0, 10))} :\n${url}\n\nCe lien vous est réservé : ne le transférez pas.\n\n${exp.etab.nom}`,
        });
      } else {
        await envoyer(exp, {
          canal: "sms", destinataire, eleveId: cv.e.id, entrepriseId: cv.ent.id,
          corps: `${exp.etab.nom} : la convention de stage de ${cv.e.prenom} ${cv.e.nom} attend votre signature (${qualite}). Lien personnel valable ${JOURS_LIEN_SIGNATURE} jours : ${url}`,
        });
      }
      messages++; liens++;
    }
  }
  // La première invitation lance les rappels à l'entreprise (tous les N jours, réglés dans « Organisation »).
  if (messages && !cv.s.conventionEnvoyeeLe) {
    await db.update(schema.stages).set({ conventionEnvoyeeLe: new Date() }).where(and(eq(schema.stages.id, cv.s.id), isNull(schema.stages.conventionEnvoyeeLe)));
  }
  return { messages, liens, sansContact };
}

/** Quand il ne manque plus que la signature du dernier signataire (référent ou direction), il est prévenu. */
export async function prevenirDernierSignataire(exp: Expediteur, cv: ContexteConvention, dernier: Signataire, base: string) {
  const manquants = cv.requis.filter((k) => !cv.s.signatures[k]);
  if (manquants.length !== 1 || manquants[0] !== dernier) return 0;
  let n = 0;
  for (const p of await personnesPour(cv, dernier)) {
    if (!p.email) continue;
    await envoyer(exp, {
      canal: "mail", destinataire: p.email, sujet: `Convention de ${cv.e.prenom} ${cv.e.nom} : à vous de signer en dernier`, eleveId: cv.e.id, entrepriseId: cv.ent.id,
      corps: `Bonjour ${p.prenom},\n\nToutes les autres parties ont signé la convention de stage de ${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle}), chez ${cv.ent.nom} du ${dateLongue(cv.p.debut)} au ${dateLongue(cv.p.fin)}.\n${cv.conforme ? "Vérifiez-la et signez-la en dernier" : "Attention : le stage ne respecte pas toutes les règles. Faites corriger les horaires ou le lieu avant de signer"} : ${base}/connexion\n\n${exp.etab.nom}`,
    });
    n++;
  }
  return n;
}
