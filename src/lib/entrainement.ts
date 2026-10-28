import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import type { Horaires, Role, Signatures } from "@/db/schema";
import type { Contexte } from "./auth";
import { ajouterJours, aujourdhui } from "./dates";

/**
 * Formation incluse : le lycée d'entraînement de chaque membre de l'équipe (décision d'Anissa : « très bien »). Ses réglages
 * et ses modèles de documents sont ceux de son vrai lycée ; ses élèves, entreprises et stages sont fictifs, avec des dates
 * calculées à partir d'aujourd'hui ; rien n'en sort. On s'y met aussi à la place d'un élève, d'un parent ou d'une entreprise.
 */
export const DOMAINE_ENTRAINEMENT = "entrainement.cap-pfmp.example";
/** Les comptes du lycée d'entraînement : l'équipe (la personne elle-même), et ceux dont elle peut prendre la place. */
export const PLACES = ["equipe", "eleve", "parent", "entreprise"] as const;
export type Place = (typeof PLACES)[number];

const JOURNEE: [string, string][] = [["08:30", "12:00"], ["13:00", "16:30"]];
const STD: Horaires = [JOURNEE, JOURNEE, JOURNEE, JOURNEE, [["08:30", "12:00"]], null, null];
const signe = (...qui: (keyof Signatures)[]): Signatures => Object.fromEntries(qui.map((k) => [k, { le: new Date().toISOString(), par: null, mode: "papier" as const }]));

/** L'adresse du compte d'une place dans le lycée d'entraînement d'une personne. */
export const emailEntrainement = (userId: string, place: Place) => `${place}-${userId.slice(0, 8)}@${DOMAINE_ENTRAINEMENT}`;

/** Le lycée d'entraînement d'une personne, s'il existe. */
export async function lyceeEntrainement(userId: string) {
  const [e] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.entrainementDeId, userId)).limit(1);
  return e ?? null;
}

/** Supprime le lycée d'entraînement d'une personne et ses fichiers (pour le remettre à zéro). */
export async function supprimerLyceeEntrainement(userId: string) {
  const e = await lyceeEntrainement(userId);
  if (!e) return;
  await db.delete(schema.fichiers).where(sql`${schema.fichiers.cle} like ${e.id + "/%"}`);
  await db.delete(schema.users).where(eq(schema.users.etablissementId, e.id));
  await db.delete(schema.etablissements).where(eq(schema.etablissements.id, e.id));
}

/** Crée le lycée d'entraînement d'un membre de l'équipe (ou le renvoie s'il existe déjà). */
export async function creerLyceeEntrainement(reel: Contexte) {
  const deja = await lyceeEntrainement(reel.user.id);
  if (deja) return deja;
  const jour = aujourdhui();
  const [etab] = await db.insert(schema.etablissements).values({
    nom: `Lycée d'entraînement de ${reel.user.prenom}`, ville: "Ville-entraînement", anneeScolaire: reel.etab.anneeScolaire,
    reglages: reel.etab.reglages, entrainementDeId: reel.user.id,
  }).returning();
  const E = etab.id;
  // Aucun mot de passe utilisable : on n'entre dans ces comptes que depuis son propre compte.
  const hash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
  const compte = async (place: Place | string, prenom: string, nom: string, roles: Role[], extra: Partial<typeof schema.users.$inferInsert> = {}) => {
    const [u] = await db.insert(schema.users).values({
      etablissementId: E, email: (PLACES as readonly string[]).includes(place) ? emailEntrainement(reel.user.id, place as Place) : `${place}-${reel.user.id.slice(0, 8)}@${DOMAINE_ENTRAINEMENT}`,
      prenom, nom, roles, passwordHash: hash, doitChangerMotDePasse: false, visiteGuideeLe: new Date(), ...extra,
    }).returning();
    return u;
  };
  const roles = reel.user.roles.filter((r) => r !== "admin" && r !== "eleve" && r !== "parent" && r !== "entreprise");
  const moi = await compte("equipe", reel.user.prenom, reel.user.nom, roles.length ? roles : ["professeur"], {
    discipline: reel.user.discipline, enseignementPro: reel.user.enseignementPro || !roles.includes("professeur"),
  });
  const prof = await compte("prof", "Marc", "EXEMPLE", ["professeur"], { discipline: "Enseignement professionnel", enseignementPro: true });

  // Les modèles de documents du vrai lycée : on s'entraîne avec ses propres documents.
  const modeles = await db.select().from(schema.modelesDocuments).where(eq(schema.modelesDocuments.etablissementId, reel.etab.id));
  if (modeles.length) {
    await db.insert(schema.modelesDocuments).values(modeles.map(({ id: _id, etablissementId: _e, majParId: _m, ...m }) => ({ ...m, etablissementId: E })));
  }

  const ents = await db.insert(schema.entreprises).values([
    { etablissementId: E, nom: "Sécurité Exemple", secteur: "prive" as const, domaine: "Sûreté", ville: "Ville-entraînement", adresse: "1 rue de l'Exemple", tuteurNom: "J. Tuteur", tuteurFonction: "Chef d'équipe", email: `contact@securite.${DOMAINE_ENTRAINEMENT}`, telephone: "06 39 98 90 01", placesParDefaut: 3, representantNom: "A. Gérant", representantFonction: "Gérant" },
    { etablissementId: E, nom: "Magasin Fictif", secteur: "prive" as const, domaine: "Commerce", ville: "Ville-entraînement", adresse: "2 avenue du Test", tuteurNom: "L. Responsable", tuteurFonction: "Responsable de magasin", email: `rh@magasin.${DOMAINE_ENTRAINEMENT}`, telephone: "06 39 98 90 02", placesParDefaut: 2, representantNom: "L. Responsable", representantFonction: "Directrice" },
    { etablissementId: E, nom: "Mairie de Ville-entraînement", secteur: "public" as const, domaine: "Collectivité", ville: "Ville-entraînement", tuteurNom: "C. Agent", tuteurFonction: "Agent de prévention", email: `accueil@mairie.${DOMAINE_ENTRAINEMENT}`, telephone: "06 39 98 90 03", placesParDefaut: 2, representantNom: "Le maire", representantFonction: "Maire" },
  ]).returning();
  const tuteur = await compte("entreprise", "Jean", "TUTEUR", ["entreprise"], { entrepriseId: ents[0].id });
  const tuteurDe = (i: number) => ({ nom: ents[i].tuteurNom!, fonction: ents[i].tuteurFonction, email: i === 0 ? tuteur.email : null, telephone: ents[i].telephone });

  // Trois classes : un stage terminé, un stage en cours, un stage à venir.
  const filiere = (await db.select({ f: schema.classes.filiere }).from(schema.classes).where(and(eq(schema.classes.etablissementId, reel.etab.id), isNotNull(schema.classes.filiere))).limit(1))[0]?.f ?? "Bac Pro (entraînement)";
  const referent = roles.includes("professeur") ? moi.id : prof.id;
  const classe = async (libelle: string, niveau: "2NDE" | "1RE" | "TLE", debut: string, fin: string) => {
    const [c] = await db.insert(schema.classes).values({ etablissementId: E, libelle, niveau, filiere, anneeScolaire: reel.etab.anneeScolaire, regleStructure: "libre", referentId: referent }).returning();
    const [p] = await db.insert(schema.periodes).values({ classeId: c.id, libelle: "PFMP 1", debut, fin }).returning();
    return { c, p };
  };
  const finie = await classe("Tle (entraînement)", "TLE", ajouterJours(jour, -40), ajouterJours(jour, -19));
  const enCours = await classe("1re (entraînement)", "1RE", ajouterJours(jour, -10), ajouterJours(jour, 11));
  const aVenir = await classe("2nde (entraînement)", "2NDE", ajouterJours(jour, 21), ajouterJours(jour, 42));

  const eleves: [string, string, typeof finie, number | null, Signatures][] = [
    ["Léo", "ESSAI", aVenir, 0, {}],
    ["Nina", "EXEMPLE", aVenir, null, {}],
    ["Sam", "DÉMO", aVenir, null, {}],
    ["Inès", "TEST", enCours, 0, signe("eleve", "parent", "entreprise", "tuteur", "professeur", "direction")],
    ["Hugo", "FICTIF", enCours, 1, signe("eleve", "parent", "entreprise", "tuteur", "professeur", "direction")],
    ["Lina", "MODÈLE", finie, 2, signe("eleve", "parent", "entreprise", "tuteur", "professeur", "direction")],
    ["Yacine", "PRATIQUE", finie, 1, signe("eleve", "parent", "entreprise", "tuteur", "professeur", "direction")],
  ];
  const stages: { id: string; nom: string }[] = [];
  for (const [prenom, nom, k, ent, signatures] of eleves) {
    const [e] = await db.insert(schema.eleves).values({ etablissementId: E, classeId: k.c.id, prenom, nom, dateNaissance: k === aVenir ? "2010-03-01" : "2008-05-01" }).returning();
    if (ent !== null) {
      const [s] = await db.insert(schema.stages).values({ eleveId: e.id, periodeId: k.p.id, entrepriseId: ents[ent].id, horaires: STD, signatures, tuteur: tuteurDe(ent) }).returning();
      stages.push({ id: s.id, nom });
    }
    // On peut se mettre à la place de Léo (élève) et de son parent.
    if (prenom === "Léo") {
      const u = await compte("eleve", prenom, nom, ["eleve"]);
      await db.update(schema.eleves).set({ userId: u.id }).where(eq(schema.eleves.id, e.id));
      const parent = await compte("parent", "Claire", nom, ["parent"]);
      await db.insert(schema.responsables).values({ eleveId: e.id, userId: parent.id });
    }
  }
  // Les visites des stages en cours et terminés, confiées à la personne quand elle est professeur.
  const visiteur = roles.includes("professeur") ? moi.id : prof.id;
  const id = (nom: string) => stages.find((s) => s.nom === nom)!.id;
  await db.insert(schema.visites).values([
    { stageId: id("TEST"), visiteurId: visiteur, date: ajouterJours(jour, 3) },
    { stageId: id("FICTIF"), visiteurId: visiteur, date: ajouterJours(jour, -2), heure: "10:00", ordreMission: "signe" as const, transport: "vehicule" as const, ordreMissionSigneLe: new Date() },
  ]);
  // Une absence signalée par l'entreprise, à justifier.
  const [hugo] = await db.select({ id: schema.eleves.id }).from(schema.eleves).where(and(eq(schema.eleves.etablissementId, E), eq(schema.eleves.nom, "FICTIF")));
  await db.insert(schema.absences).values({ etablissementId: E, stageId: id("FICTIF"), eleveId: hugo.id, debut: ajouterJours(jour, -4), fin: ajouterJours(jour, -4), origine: "entreprise", commentaire: "Absent sans prévenir" });
  return etab;
}

/** Le compte d'une place (équipe, élève, parent, entreprise) dans le lycée d'entraînement d'une personne. */
export async function compteDeLaPlace(reelId: string, place: Place) {
  const e = await lyceeEntrainement(reelId);
  if (!e) return null;
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, e.id), eq(schema.users.email, emailEntrainement(reelId, place)))).limit(1);
  return u ?? null;
}

/** Les actions faites dans le lycée d'entraînement (pour les missions de la formation). */
export async function actionsDEntrainement(reelId: string): Promise<Set<string>> {
  const e = await lyceeEntrainement(reelId);
  if (!e) return new Set();
  const rows = await db.selectDistinct({ a: schema.journal.action }).from(schema.journal).where(eq(schema.journal.etablissementId, e.id));
  return new Set(rows.map((r) => r.a));
}

/** Les lycées d'entraînement ne reçoivent aucune relance automatique. */
export const pasDEntrainement = <T extends { entrainementDeId: string | null }>(etabs: T[]) => etabs.filter((e) => !e.entrainementDeId);
