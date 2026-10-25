/**
 * Données de démonstration : un lycée fictif, son équipe, ses classes, ses élèves et ses entreprises.
 * Toutes les personnes et entreprises sont inventées. Ne jamais exécuter sur une base de production.
 *
 *   npm run db:seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { REGLAGES_PAR_DEFAUT, type Horaires, type Signatures, type Role } from "../src/db/schema";

const NOM_LYCEE = "Lycée professionnel de démonstration";
export const MOT_DE_PASSE_DEMO = "Demo-pfmp-2026";
const DOMAINE = "demo.cap-pfmp.example";

const STD: Horaires = [["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "15:00"], ["08:00", "12:00"], null, null];
const NUIT: Horaires = [["14:00", "22:30"], ["14:00", "22:30"], ["14:00", "22:30"], ["14:00", "22:30"], null, null, null];
const WEEKEND: Horaires = [null, null, ["09:00", "16:00"], ["09:00", "16:00"], ["09:00", "16:00"], ["10:00", "17:00"], ["10:00", "16:00"]];

const sig = (...qui: (keyof Signatures)[]): Signatures =>
  Object.fromEntries(qui.map((k) => [k, { le: "2026-10-01T10:00:00.000Z", par: null, mode: "papier" as const }]));
const TOUS = sig("eleve", "parent", "professeur", "entreprise", "direction");

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.AUTORISER_SEED !== "oui") {
    throw new Error("Refus : données de démonstration en production. Définissez AUTORISER_SEED=oui pour forcer.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/cap_pfmp" });
  const db = drizzle(pool, { schema });

  // Repartir de zéro pour le lycée de démonstration uniquement
  const anciens = await db.select().from(schema.etablissements).where(eq(schema.etablissements.nom, NOM_LYCEE));
  for (const a of anciens) {
    await db.delete(schema.users).where(eq(schema.users.etablissementId, a.id));
    await db.delete(schema.etablissements).where(eq(schema.etablissements.id, a.id));
  }

  const [etab] = await db.insert(schema.etablissements).values({
    nom: NOM_LYCEE, ville: "Ville-démo", anneeScolaire: "2026-2027", reglages: REGLAGES_PAR_DEFAUT,
  }).returning();
  const E = etab.id;
  const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);

  async function compte(prenom: string, nom: string, local: string, roles: Role[], extra: Partial<typeof schema.users.$inferInsert> = {}) {
    const [u] = await db.insert(schema.users).values({
      etablissementId: E, email: `${local}@${DOMAINE}`, prenom, nom, roles, passwordHash: hash, doitChangerMotDePasse: false, ...extra,
    }).returning();
    return u;
  }

  const direction = await compte("Claire", "DUVAL", "direction", ["direction"]);
  const martin = await compte("Paul", "MARTIN", "p.martin", ["professeur"], { discipline: "Métiers de la sécurité", enseignementPro: true, telephone: "06 39 98 10 01" });
  const benali = await compte("Samia", "BENALI", "s.benali", ["professeur"], { discipline: "Métiers de la sécurité", enseignementPro: true });
  const diallo = await compte("Awa", "DIALLO", "a.diallo", ["professeur"], { discipline: "Métiers de la sécurité", enseignementPro: true });
  const leroy = await compte("Hugo", "LEROY", "h.leroy", ["professeur"], { discipline: "Prévention santé environnement", enseignementPro: true });
  await compte("Marie", "GARNIER", "m.garnier", ["professeur"], { discipline: "Lettres-histoire", enseignementPro: false });
  await compte("Karim", "HADDOU", "k.haddou", ["professeur"], { discipline: "Mathématiques", enseignementPro: false });

  const doms = await db.insert(schema.dominantes).values(
    ["Sûreté / gardiennage", "Sécurité incendie", "Sécurité publique"].map((libelle) => ({ etablissementId: E, libelle })),
  ).returning();
  const dom = (l: string) => doms.find((d) => d.libelle === l)!.id;

  async function classe(libelle: string, niveau: "CAP" | "2NDE" | "1RE" | "TLE", referentId: string, debut: string, fin: string) {
    const [c] = await db.insert(schema.classes).values({
      etablissementId: E, libelle, niveau, anneeScolaire: "2026-2027", referentId,
      filiere: niveau === "CAP" ? "CAP Agent de sécurité" : "Bac Pro Métiers de la sécurité",
      regleStructure: niveau === "CAP" || niveau === "2NDE" ? "prive" : "dominante",
    }).returning();
    const [p] = await db.insert(schema.periodes).values({ classeId: c.id, libelle: "PFMP 1", debut, fin }).returning();
    return { c, p };
  }
  const cap = await classe("CAP AS", "CAP", leroy.id, "2027-01-11", "2027-02-05");
  const sec = await classe("2nde MS", "2NDE", martin.id, "2026-11-16", "2026-12-11");
  const pre = await classe("1re MS", "1RE", benali.id, "2026-10-05", "2026-10-23");
  const ter = await classe("Tle MS", "TLE", diallo.id, "2026-10-19", "2026-11-13");

  const ents = await db.insert(schema.entreprises).values([
    { nom: "Atlas Sûreté", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Issy-les-Moulineaux", tuteurNom: "K. Ferhat", tuteurFonction: "Chef de poste", email: `stages@atlas-surete.${DOMAINE}`, telephone: "06 39 98 00 01", placesParDefaut: 3 },
    { nom: "Garde Ouest Services", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Boulogne-Billancourt", tuteurNom: "S. Roux", tuteurFonction: "Chef d'équipe", email: `contact@garde-ouest.${DOMAINE}`, telephone: "06 39 98 00 02", placesParDefaut: 2 },
    { nom: "Héliance Sécurité incendie", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Montrouge", tuteurNom: "P. Okafor", tuteurFonction: "SSIAP 3", email: `rh@heliance.${DOMAINE}`, telephone: "06 39 98 00 03", placesParDefaut: 2 },
    { nom: "Centre commercial Les Arcades – PC sécurité", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Le Kremlin-Bicêtre", tuteurNom: "L. Brun", tuteurFonction: "Responsable sécurité", email: `securite@arcades.${DOMAINE}`, telephone: "06 39 98 00 04", placesParDefaut: 2 },
    { nom: "Hôpital Saint-Lucien – service sécurité incendie", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Clamart", tuteurNom: "M. Dupré", tuteurFonction: "SSIAP 2", email: `securite@st-lucien.${DOMAINE}`, telephone: "06 39 98 00 05", placesParDefaut: 1 },
    { nom: "Évent'Sûr", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Paris 15e", tuteurNom: "A. Lemaire", tuteurFonction: "Gérant", email: `bonjour@eventsur.${DOMAINE}`, telephone: "06 39 98 00 06", placesParDefaut: 2 },
    { nom: "Police municipale de Ville-démo", secteur: "public" as const, domaine: "Sécurité publique", ville: "Ville-démo", tuteurNom: "N. Simon", tuteurFonction: "Brigadier-chef", email: `police@ville-demo.${DOMAINE}`, telephone: "06 39 98 00 07", placesParDefaut: 2 },
    { nom: "Centre de secours de Ville-démo", secteur: "public" as const, domaine: "Sécurité incendie", ville: "Ville-démo", tuteurNom: "R. Morin", tuteurFonction: "Adjudant", email: `secours@ville-demo.${DOMAINE}`, telephone: "06 39 98 00 08", placesParDefaut: 1 },
  ].map((x) => ({ ...x, etablissementId: E }))).returning();
  const ent = (n: string) => ents.find((x) => x.nom.startsWith(n))!.id;

  await compte("Karim", "FERHAT", "k.ferhat", ["entreprise"], { entrepriseId: ent("Atlas") });

  type L = { prenom: string; nom: string; k: typeof cap; naissance?: string; dom?: string; stage?: [string, Horaires, Signatures] };
  const eleves: L[] = [
    { prenom: "Inès", nom: "HADDAD", k: sec, naissance: "2010-03-14" },
    { prenom: "Lucas", nom: "MOREAU", k: sec, naissance: "2010-07-02", stage: ["Atlas", STD, sig("eleve", "parent", "professeur")] },
    { prenom: "Aya", nom: "BENKHELIFA", k: sec, naissance: "2010-01-20", stage: ["Police", STD, sig("eleve", "parent")] },
    { prenom: "Noah", nom: "PETIT", k: sec, naissance: "2010-11-05", stage: ["Garde Ouest", NUIT, sig("eleve", "parent", "professeur", "entreprise")] },
    { prenom: "Sarah", nom: "KONÉ", k: pre, naissance: "2009-04-12", dom: "Sécurité incendie", stage: ["Hôpital", STD, TOUS] },
    { prenom: "Mehdi", nom: "RAHMANI", k: pre, naissance: "2009-09-30", dom: "Sécurité publique", stage: ["Police", STD, TOUS] },
    { prenom: "Clara", nom: "NGUYEN", k: pre, naissance: "2009-02-17", dom: "Sûreté / gardiennage", stage: ["Atlas", STD, TOUS] },
    { prenom: "Yanis", nom: "BOUZID", k: pre, naissance: "2009-06-08", dom: "Sécurité incendie", stage: ["Centre commercial", STD, TOUS] },
    { prenom: "Emma", nom: "LAURENT", k: ter, naissance: "2008-05-21", dom: "Sûreté / gardiennage", stage: ["Évent", WEEKEND, TOUS] },
    { prenom: "Adam", nom: "CISSÉ", k: ter, naissance: "2008-08-11", dom: "Sécurité publique", stage: ["Police", STD, TOUS] },
    { prenom: "Léa", nom: "FONTAINE", k: ter, naissance: "2008-12-03", dom: "Sécurité incendie", stage: ["Héliance", STD, sig("eleve", "parent", "professeur", "entreprise")] },
    { prenom: "Rayan", nom: "MANSOURI", k: ter, naissance: "2007-09-15", dom: "Sûreté / gardiennage", stage: ["Garde Ouest", STD, sig("eleve", "professeur", "entreprise", "direction")] },
    { prenom: "Kenza", nom: "AMRANI", k: cap, naissance: "2010-10-01" },
    { prenom: "Tom", nom: "GIRARD", k: cap, naissance: "2010-02-26" },
    { prenom: "Moussa", nom: "TRAORÉ", k: cap, naissance: "2010-06-19", stage: ["Atlas", STD, sig("eleve")] },
    { prenom: "Jade", nom: "MOREL", k: cap, naissance: "2010-08-29" },
  ];

  for (const l of eleves) {
    const [e] = await db.insert(schema.eleves).values({
      etablissementId: E, classeId: l.k.c.id, prenom: l.prenom, nom: l.nom, dateNaissance: l.naissance ?? null,
      dominanteId: l.dom ? dom(l.dom) : null,
    }).returning();
    if (l.stage) {
      await db.insert(schema.stages).values({ eleveId: e.id, periodeId: l.k.p.id, entrepriseId: ent(l.stage[0]), horaires: l.stage[1], signatures: l.stage[2] });
    }
    if (l.prenom === "Inès") {
      const u = await compte("Inès", "HADDAD", "ines.haddad", ["eleve"]);
      await db.update(schema.eleves).set({ userId: u.id }).where(eq(schema.eleves.id, e.id));
      await db.insert(schema.demarches).values([
        { eleveId: e.id, entrepriseNom: "Garde Ouest Services", entrepriseId: ent("Garde Ouest"), date: "2026-10-11", reponse: "refus" },
        { eleveId: e.id, entrepriseNom: "Atlas Sûreté", entrepriseId: ent("Atlas"), date: "2026-10-16", reponse: "attente" },
      ]);
    }
    if (l.prenom === "Moussa") {
      const u = await compte("Fatou", "TRAORÉ", "f.traore", ["parent"], { telephone: "06 39 98 20 15" });
      await db.insert(schema.responsables).values({ eleveId: e.id, userId: u.id });
    }
  }

  console.log(`Lycée de démonstration créé. Mot de passe de tous les comptes : ${MOT_DE_PASSE_DEMO}`);
  console.log(`Comptes : direction@${DOMAINE}, p.martin@${DOMAINE} (référent 2nde), ines.haddad@${DOMAINE} (élève), f.traore@${DOMAINE} (parent), k.ferhat@${DOMAINE} (entreprise)`);
  void direction;
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
