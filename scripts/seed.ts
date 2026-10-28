/**
 * Données de démonstration : un lycée fictif, son équipe, ses classes, ses élèves et ses entreprises.
 * Toutes les personnes et entreprises sont inventées. Ne jamais exécuter sur une base de production.
 *
 *   npm run db:seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { and, asc, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import * as schema from "../src/db/schema";
import { ecrireOctets } from "../src/lib/stockage-brut";
import { REGLAGES_PAR_DEFAUT, type Horaires, type Signatures, type Role } from "../src/db/schema";
import { VERSION_DONNEES_DEMO } from "./version-demo";
import { QUESTIONS_APPEL } from "../src/lib/modeles";

const NOM_LYCEE = "Lycée professionnel de démonstration";
export const MOT_DE_PASSE_DEMO = "Demo-pfmp-2026";
const DOMAINE = "demo.cap-pfmp.example";

// Horaires : une ou deux plages par jour (matin, après-midi), null = repos
const JOURNEE: [string, string][] = [["08:30", "12:00"], ["13:00", "16:30"]];
const STD: Horaires = [JOURNEE, JOURNEE, JOURNEE, JOURNEE, [["08:30", "12:00"]], null, null];
const NUIT: Horaires = [[["14:00", "22:30"]], [["14:00", "22:30"]], [["14:00", "22:30"]], [["14:00", "22:30"]], null, null, null];
const WEEKEND: Horaires = [null, null, [["09:00", "12:30"], ["13:30", "17:00"]], [["09:00", "12:30"], ["13:30", "17:00"]], [["09:00", "12:30"], ["13:30", "17:00"]], [["10:00", "13:00"], ["14:00", "17:00"]], [["10:00", "13:00"], ["14:00", "16:00"]]];

/** Petit PDF valide d'une page, pour illustrer les documents déposés. */
function fauxPdf(texte: string): Buffer {
  const t = texte.replace(/[()\\]/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const flux = `BT /F1 16 Tf 60 760 Td (${t}) Tj 0 -24 Td /F1 11 Tf (Document fictif de demonstration - Cap PFMP) Tj ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const pos: number[] = [];
  objets.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` + pos.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const sig = (...qui: (keyof Signatures)[]): Signatures =>
  Object.fromEntries(qui.map((k) => [k, { le: "2026-10-01T10:00:00.000Z", par: null, mode: "papier" as const }]));
const TOUS = sig("eleve", "parent", "entreprise", "tuteur", "professeur", "direction");
// Conventions de l'an dernier, signées avant leur stage de novembre 2025
const TOUS_2025: Signatures = Object.fromEntries(Object.entries(TOUS).map(([k, v]) => [k, { ...v, le: "2025-11-03T10:00:00.000Z" }]));

/**
 * Barème des frais de visite du lycée fictif, sur le modèle du barème kilométrique fiscal (par tranches de kilomètres
 * parcourus dans l'année, plafonné à 7 CV) : un exemple que chaque lycée remplace par sa propre méthode.
 */
const voiture = (vehicule: string, t1: number, t2: number, f2: number, t3: number) =>
  ({ vehicule, tranches: [{ jusqua: 5000, taux: t1, fixe: 0 }, { jusqua: 20000, taux: t2, fixe: f2 }, { jusqua: null, taux: t3, fixe: 0 }] });
const deuxRoues = (vehicule: string, t1: number, t2: number, f2: number, t3: number) =>
  ({ vehicule, tranches: [{ jusqua: 3000, taux: t1, fixe: 0 }, { jusqua: 6000, taux: t2, fixe: f2 }, { jusqua: null, taux: t3, fixe: 0 }] });
const FRAIS_EXEMPLE = {
  kilometrique: [
    voiture("Voiture 3 CV", 0.529, 0.316, 1065, 0.37), voiture("Voiture 4 CV", 0.606, 0.34, 1330, 0.407), voiture("Voiture 5 CV", 0.636, 0.357, 1395, 0.427),
    voiture("Voiture 6 CV", 0.665, 0.374, 1457, 0.447), voiture("Voiture 7 CV et plus", 0.697, 0.394, 1515, 0.47),
    deuxRoues("Deux-roues de moins de 50 cm³", 0.315, 0.079, 711, 0.198), deuxRoues("Moto 1 à 2 CV", 0.395, 0.099, 891, 0.248),
    deuxRoues("Moto 3 à 5 CV", 0.468, 0.082, 1158, 0.275), deuxRoues("Moto de plus de 5 CV", 0.606, 0.079, 1583, 0.343),
  ],
  repas: 20.2,
  nuitees: [{ zone: "Paris et petite couronne", montant: 72.5 }, { zone: "Autres départements", montant: 53.8 }],
  consignes: "Exemple du lycée de démonstration : le trajet retenu est celui entre le lycée et le lieu de stage, aller et retour. Péage sur justificatif. Hors de la région : remboursement sur la base d'un billet de train en 2nde classe.",
};

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.AUTORISER_SEED !== "oui") {
    throw new Error("Refus : données de démonstration en production. Définissez AUTORISER_SEED=oui pour forcer.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/cap_pfmp" });
  const db = drizzle(pool, { schema });

  // Repartir de zéro pour le lycée de démonstration uniquement
  const anciens = await db.select().from(schema.etablissements).where(eq(schema.etablissements.nom, NOM_LYCEE));
  for (const a of anciens) {
    await db.delete(schema.fichiers).where(sql`${schema.fichiers.cle} like ${a.id + "/%"}`);
    await db.delete(schema.users).where(eq(schema.users.etablissementId, a.id));
    await db.delete(schema.etablissements).where(eq(schema.etablissements.id, a.id));
  }

  // Le lycée pilote répartit les visites selon les heures de face à face ; signature simple ou dessinée ; le référent signe en dernier.
  const [etab] = await db.insert(schema.etablissements).values({
    nom: NOM_LYCEE, ville: "Ville-démo", anneeScolaire: "2026-2027", reglages: {
      ...REGLAGES_PAR_DEFAUT, repartition: "heures", signatureModele: "les2", dernierSignataire: "professeur", frais: FRAIS_EXEMPLE,
      // Les trois agents IA, pour la démonstration.
      agents: { ...REGLAGES_PAR_DEFAUT.agents, veille: true, entreprises: true },
    },
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
  const garnier = await compte("Marie", "GARNIER", "m.garnier", ["professeur"], { discipline: "Lettres-histoire", enseignementPro: false });
  const haddou = await compte("Karim", "HADDOU", "k.haddou", ["professeur"], { discipline: "Mathématiques", enseignementPro: false });
  await compte("Nadia", "BERRADA", "vie.scolaire", ["vie_scolaire"]);
  // Le DDFPT (compte « Gestion des PFMP ») : seul, avec la direction, il crée les comptes et fixe les dates de PFMP.
  await compte("Julien", "ROUSSEL", "ddfpt", ["gestionnaire"]);
  // L'administration de Cap PFMP : tarifs des formules, plafonds des agents, veille réglementaire.
  await compte("Équipe", "CAP PFMP", "admin", ["admin"]);
  // Tarifs d'exemple (fictifs), à remplacer par ceux d'Anissa dans « Administration ».
  const plateforme = { tarifs: { seul: 49, veille: 69, entreprises: 79, complet: 99 }, plafonds: { administratif: 400, veille: 0, entreprises: 300 } };
  await db.insert(schema.plateforme).values({ id: "cap-pfmp", ...plateforme }).onConflictDoUpdate({ target: schema.plateforme.id, set: plateforme });
  // Une alerte de veille d'exemple, clairement fictive.
  await db.delete(schema.alertesVeille).where(sql`${schema.alertesVeille.titre} like 'Exemple d''alerte%'`);
  await db.insert(schema.alertesVeille).values({
    titre: "Exemple d'alerte de veille (démonstration)", source: "https://www.education.gouv.fr/bulletin-officiel",
    resume: "Ceci est un exemple d'alerte de démonstration : aucun texte réel n'est résumé ici. Une vraie alerte de Cap Veille résume un texte officiel sur les PFMP (ce qui change, pour qui, à partir de quand), avec le lien vers ce texte.",
    propositions: ["Exemple : vérifier le modèle de convention du lycée.", "Exemple : informer l'équipe pédagogique au prochain conseil."],
    simule: true, publieeLe: new Date(),
  });

  // Pôles et formations en voie scolaire (décision d'Anissa ; les formations en apprentissage n'entrent pas dans Cap PFMP).
  const POLES: [string, [string, string | null][]][] = [
    ["Sécurité", [["CAP Agent de sécurité", "K2503"], ["Bac Pro Métiers de la sécurité", "K2503"]]],
    ["Automobile", [["CAP Maintenance des véhicules, option véhicules légers", "I1604"]]],
    ["Maintenance industrielle", [["2de pro Métiers du pilotage et de la maintenance d'installations automatisées", "I1304"], ["Bac Pro Maintenance des systèmes de production connectés", "I1304"]]],
    ["Informatique, réseaux et électronique", [["2de pro Métiers des transitions numérique et énergétique", "I1401"], ["Bac Pro Cybersécurité, informatique et réseaux, électronique (CIEL)", "I1401"]]],
  ];
  const formations: (typeof schema.formations.$inferSelect)[] = [];
  for (const [libelle, liste] of POLES) {
    const [pole] = await db.insert(schema.poles).values({ etablissementId: E, libelle }).returning();
    formations.push(...await db.insert(schema.formations).values(liste.map(([l, codeRome]) => ({ etablissementId: E, poleId: pole.id, libelle: l, codeRome }))).returning());
  }
  const formation = (l: string) => formations.find((f) => f.libelle === l)!.id;
  // Les spécialités du bac pro Métiers de la sécurité, à partir de la 1re.
  const doms = await db.insert(schema.dominantes).values(
    ["Sûreté / gardiennage", "Sécurité incendie", "Sécurité publique"].map((libelle) => ({ etablissementId: E, libelle, formationId: formation("Bac Pro Métiers de la sécurité") })),
  ).returning();
  const dom = (l: string) => doms.find((d) => d.libelle === l)!.id;

  async function classe(libelle: string, niveau: "CAP" | "2NDE" | "1RE" | "TLE", referentId: string, debut: string, fin: string) {
    const [c] = await db.insert(schema.classes).values({
      etablissementId: E, libelle, niveau, anneeScolaire: "2026-2027", referentId, codeRome: "K2503",
      filiere: niveau === "CAP" ? "CAP Agent de sécurité" : "Bac Pro Métiers de la sécurité",
      formationId: formation(niveau === "CAP" ? "CAP Agent de sécurité" : "Bac Pro Métiers de la sécurité"),
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
    { nom: "Atlas Sûreté", representantNom: "C. Vasseur", representantFonction: "Directrice d'agence", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Issy-les-Moulineaux", tuteurNom: "K. Ferhat", tuteurFonction: "Chef de poste", email: `stages@atlas-surete.${DOMAINE}`, telephone: "06 39 98 00 01", placesParDefaut: 3 },
    { nom: "Garde Ouest Services", representantNom: "J. Pereira", representantFonction: "Gérant", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Boulogne-Billancourt", tuteurNom: "S. Roux", tuteurFonction: "Chef d'équipe", email: `contact@garde-ouest.${DOMAINE}`, telephone: "06 39 98 00 02", placesParDefaut: 2 },
    { nom: "Héliance Sécurité incendie", representantNom: "M. Lambert", representantFonction: "Responsable des ressources humaines", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Montrouge", tuteurNom: "P. Okafor", tuteurFonction: "SSIAP 3", email: `rh@heliance.${DOMAINE}`, telephone: "06 39 98 00 03", placesParDefaut: 2 },
    { nom: "Centre commercial Les Arcades – PC sécurité", representantNom: "F. Girard", representantFonction: "Directeur du centre", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Le Kremlin-Bicêtre", tuteurNom: "L. Brun", tuteurFonction: "Responsable sécurité", email: `securite@arcades.${DOMAINE}`, telephone: "06 39 98 00 04", placesParDefaut: 2 },
    { nom: "Hôpital Saint-Lucien – service sécurité incendie", representantNom: "E. Marchand", representantFonction: "Directrice des ressources humaines", secteur: "prive" as const, domaine: "Sécurité incendie", ville: "Clamart", tuteurNom: "M. Dupré", tuteurFonction: "SSIAP 2", email: `securite@st-lucien.${DOMAINE}`, telephone: "06 39 98 00 05", placesParDefaut: 1 },
    { nom: "Évent'Sûr", representantNom: "A. Lemaire", representantFonction: "Gérant", secteur: "prive" as const, domaine: "Sûreté / gardiennage", ville: "Paris 15e", tuteurNom: "A. Lemaire", tuteurFonction: "Gérant", email: `bonjour@eventsur.${DOMAINE}`, telephone: "06 39 98 00 06", placesParDefaut: 2 },
    { nom: "Police municipale de Ville-démo", representantNom: "D. Roche", representantFonction: "Chef de service", secteur: "public" as const, domaine: "Sécurité publique", ville: "Ville-démo", tuteurNom: "N. Simon", tuteurFonction: "Brigadier-chef", email: `police@ville-demo.${DOMAINE}`, telephone: "06 39 98 00 07", placesParDefaut: 2 },
    { nom: "Centre de secours de Ville-démo", representantNom: "B. Fabre", representantFonction: "Capitaine", secteur: "public" as const, domaine: "Sécurité incendie", ville: "Ville-démo", tuteurNom: "R. Morin", tuteurFonction: "Adjudant", email: `secours@ville-demo.${DOMAINE}`, telephone: "06 39 98 00 08", placesParDefaut: 1 },
  ].map((x) => ({ ...x, etablissementId: E }))).returning();
  const ent = (n: string) => ents.find((x) => x.nom.startsWith(n))!.id;

  const tuteurAtlas = await compte("Karim", "FERHAT", "k.ferhat", ["entreprise"], { entrepriseId: ent("Atlas") });
  // Le tuteur désigné pour un stage : celui de la fiche entreprise (avec l'adresse de son compte pour Atlas)
  const tuteurDe = (n: string) => {
    const x = ents.find((y) => y.nom.startsWith(n))!;
    return { nom: x.tuteurNom!, fonction: x.tuteurFonction, email: n === "Atlas" ? tuteurAtlas.email : null, telephone: x.telephone };
  };

  // Heures de face à face par semaine : servent à proposer le nombre de visites de chaque professeur
  const services: [typeof martin, typeof cap, number][] = [
    [martin, sec, 8], [benali, sec, 4], [garnier, sec, 3], [haddou, sec, 2],
    [benali, pre, 8], [diallo, pre, 4], [garnier, pre, 3], [haddou, pre, 2],
    [diallo, ter, 8], [martin, ter, 4], [garnier, ter, 3], [haddou, ter, 2], [leroy, ter, 2],
    [leroy, cap, 6], [benali, cap, 4], [garnier, cap, 3],
  ];
  await db.insert(schema.heuresClasses).values(services.map(([u, k, heures]) => ({ etablissementId: E, professeurId: u.id, classeId: k.c.id, heures })));

  type L = { prenom: string; nom: string; k: typeof cap; naissance?: string; dom?: string; email?: string; stage?: [string, Horaires, Signatures] };
  const eleves: L[] = [
    { prenom: "Inès", nom: "HADDAD", k: sec, naissance: "2010-03-14" },
    { prenom: "Lucas", nom: "MOREAU", k: sec, naissance: "2010-07-02", stage: ["Atlas", STD, sig("eleve", "parent", "entreprise", "tuteur", "direction")] },
    { prenom: "Aya", nom: "BENKHELIFA", k: sec, naissance: "2010-01-20", stage: ["Police", STD, sig("eleve", "parent")] },
    { prenom: "Noah", nom: "PETIT", k: sec, naissance: "2010-11-05", stage: ["Garde Ouest", NUIT, sig("eleve", "parent", "entreprise", "tuteur", "direction")] },
    { prenom: "Sarah", nom: "KONÉ", k: pre, naissance: "2009-04-12", dom: "Sécurité incendie", stage: ["Hôpital", STD, TOUS] },
    { prenom: "Mehdi", nom: "RAHMANI", k: pre, naissance: "2009-09-30", dom: "Sécurité publique", stage: ["Police", STD, TOUS] },
    { prenom: "Clara", nom: "NGUYEN", k: pre, naissance: "2009-02-17", dom: "Sûreté / gardiennage", stage: ["Atlas", STD, TOUS] },
    { prenom: "Yanis", nom: "BOUZID", k: pre, naissance: "2009-06-08", dom: "Sécurité incendie", stage: ["Centre commercial", STD, TOUS] },
    { prenom: "Emma", nom: "LAURENT", k: ter, naissance: "2008-05-21", dom: "Sûreté / gardiennage", stage: ["Évent", WEEKEND, TOUS] },
    { prenom: "Adam", nom: "CISSÉ", k: ter, naissance: "2008-08-11", dom: "Sécurité publique", stage: ["Police", STD, TOUS] },
    { prenom: "Léa", nom: "FONTAINE", k: ter, naissance: "2008-12-03", dom: "Sécurité incendie", stage: ["Héliance", STD, sig("eleve", "parent", "entreprise", "tuteur")] },
    { prenom: "Rayan", nom: "MANSOURI", k: ter, naissance: "2007-09-15", dom: "Sûreté / gardiennage", stage: ["Garde Ouest", STD, sig("eleve", "entreprise", "tuteur", "direction")] },
    { prenom: "Kenza", nom: "AMRANI", k: cap, email: `kenza.amrani@${DOMAINE}`, naissance: "2010-10-01" },
    { prenom: "Tom", nom: "GIRARD", k: cap, email: `tom.girard@${DOMAINE}`, naissance: "2010-02-26" },
    { prenom: "Moussa", nom: "TRAORÉ", k: cap, email: `moussa.traore@${DOMAINE}`, naissance: "2010-06-19", stage: ["Atlas", STD, sig("eleve")] },
    { prenom: "Jade", nom: "MOREL", k: cap, email: `jade.morel@${DOMAINE}`, naissance: "2010-08-29" },
  ];

  for (const l of eleves) {
    const [e] = await db.insert(schema.eleves).values({
      etablissementId: E, classeId: l.k.c.id, prenom: l.prenom, nom: l.nom, dateNaissance: l.naissance ?? null, email: l.email ?? null,
      dominanteId: l.dom ? dom(l.dom) : null,
    }).returning();
    if (l.stage) {
      await db.insert(schema.stages).values({ eleveId: e.id, periodeId: l.k.p.id, entrepriseId: ent(l.stage[0]), horaires: l.stage[1], signatures: l.stage[2], tuteur: tuteurDe(l.stage[0]) });
    }
    if (l.prenom === "Inès") {
      const u = await compte("Inès", "HADDAD", "ines.haddad", ["eleve"]);
      await db.update(schema.eleves).set({ userId: u.id }).where(eq(schema.eleves.id, e.id));
      await db.insert(schema.demarches).values([
        { eleveId: e.id, entrepriseNom: "Garde Ouest Services", entrepriseId: ent("Garde Ouest"), date: "2026-10-11", reponse: "refus" },
        { eleveId: e.id, entrepriseNom: "Atlas Sûreté", entrepriseId: ent("Atlas"), date: "2026-10-16", reponse: "attente" },
      ]);
      // Son CV, déposé et pas encore relu par son référent
      const cle = `${E}/${randomUUID()}.pdf`;
      const b = fauxPdf("CV - Ines HADDAD");
      await ecrireOctets(db, cle, b);
      await db.insert(schema.documents).values({
        etablissementId: E, eleveId: e.id, anneeScolaire: "2026-2027", classeLibelle: l.k.c.libelle, type: "cv",
        nomFichier: "cv_ines_haddad.pdf", cleStockage: cle, typeMime: "application/pdf", taille: b.length, deposeParId: u.id, statut: "a_verifier",
      });
    }
    if (l.prenom === "Emma") {
      // Élève de terminale en stage : elle note chaque jour ses activités dans son carnet de bord (pas le 22, jour d'absence).
      const u = await compte("Emma", "LAURENT", "emma.laurent", ["eleve"]);
      await db.update(schema.eleves).set({ userId: u.id }).where(eq(schema.eleves.id, e.id));
      const [st] = await db.select().from(schema.stages).where(eq(schema.stages.eleveId, e.id)).limit(1);
      await db.insert(schema.activitesJour).values([
        ["2026-10-21", "Accueil par mon tuteur, visite du site et présentation des consignes de sécurité. Remise de la tenue."],
        ["2026-10-23", "Contrôle des accès à l'entrée du salon avec un agent confirmé : vérification des badges."],
        ["2026-10-24", "Rondes de surveillance dans les allées du salon. Main courante remplie avec mon tuteur."],
        ["2026-10-25", "Gestion des flux à la sortie du public, puis fermeture du site et ronde de fin de journée."],
      ].map(([date, texte]) => ({ etablissementId: E, stageId: st.id, date, texte, parId: u.id })));
    }
    if (l.prenom === "Moussa") {
      const u = await compte("Fatou", "TRAORÉ", "f.traore", ["parent"], { telephone: "06 39 98 20 15" });
      await db.insert(schema.responsables).values({ eleveId: e.id, userId: u.id });
    }
    if (l.prenom === "Mehdi") {
      const u = await compte("Leïla", "RAHMANI", "l.rahmani", ["parent"], { telephone: "06 39 98 20 16" });
      await db.insert(schema.responsables).values({ eleveId: e.id, userId: u.id });
    }
  }

  // La convention de Moussa a été envoyée le 20 octobre ; l'entreprise ne l'a pas encore signée : elle est relancée tous les 3 jours.
  {
    const [moussa] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, "TRAORÉ"), eq(schema.eleves.etablissementId, E))).limit(1);
    await db.update(schema.stages).set({ conventionEnvoyeeLe: new Date("2026-10-20T09:00:00+02:00") }).where(eq(schema.stages.eleveId, moussa.id));
  }

  // Absences en stage, signalées par le tuteur et pas encore justifiées
  async function absence(nom: string, debut: string, fin: string, commentaire: string, signaleeLe: string) {
    const [el] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, nom), eq(schema.eleves.etablissementId, E))).limit(1);
    const [st] = await db.select().from(schema.stages).where(eq(schema.stages.eleveId, el.id)).limit(1);
    await db.insert(schema.absences).values({ etablissementId: E, stageId: st.id, eleveId: el.id, debut, fin, origine: "entreprise", commentaire, createdAt: new Date(`${signaleeLe}T09:00:00+02:00`) });
  }
  await absence("RAHMANI", "2026-10-12", "2026-10-16", "Malade toute la semaine, la famille a prévenu par téléphone", "2026-10-19");
  await absence("LAURENT", "2026-10-22", "2026-10-22", "Ne s'est pas présentée, sans nouvelles", "2026-10-22");

  // Rattrapage : Mehdi refait une semaine de stage, hors de la période de sa classe
  {
    const [mehdi] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, "RAHMANI"), eq(schema.eleves.etablissementId, E))).limit(1);
    const [r] = await db.insert(schema.periodes).values({
      classeId: pre.c.id, eleveId: mehdi.id, libelle: "Rattrapage PFMP 1", debut: "2026-10-26", fin: "2026-10-30", rattrapeId: pre.p.id,
      motif: "absence pour maladie du 12 au 16 octobre pendant la PFMP 1", creeParId: benali.id,
    }).returning();
    await db.insert(schema.stages).values({ eleveId: mehdi.id, periodeId: r.id, entrepriseId: ent("Police"), horaires: STD, signatures: TOUS, tuteur: tuteurDe("Police") });
  }

  // Visites déjà organisées pour les terminales en stage
  async function visite(nom: string, visiteurId: string, date: string, ordreMission: "aucun" | "a_signer" | "signe", heure: string | null = null) {
    const [el] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, nom), eq(schema.eleves.etablissementId, E))).limit(1);
    const [st] = await db.select().from(schema.stages).where(eq(schema.stages.eleveId, el.id)).limit(1);
    await db.insert(schema.visites).values({
      stageId: st.id, visiteurId, date, heure, ordreMission, transport: ordreMission === "aucun" ? null : "vehicule",
      ordreMissionSigneParId: ordreMission === "signe" ? direction.id : null, ordreMissionSigneLe: ordreMission === "signe" ? new Date() : null,
    });
    return st;
  }
  const emma = await visite("LAURENT", leroy.id, "2026-10-28", "signe", "10:00");
  await visite("FONTAINE", garnier.id, "2026-11-03", "a_signer");
  const rayan = await visite("MANSOURI", diallo.id, "2026-10-22", "signe", "14:00");
  // Appels au tuteur de la première semaine (questions par défaut de Cap PFMP)
  const appel = (parId: string, date: string, non: number[], commentaire: string) => ({
    date, parId, commentaire, reponses: QUESTIONS_APPEL.map((question, i) => ({ question, reponse: non.includes(i) ? "non" as const : "oui" as const })),
  });
  await db.update(schema.visites).set({ appel: appel(diallo.id, "2026-10-20", [], "Tuteur joint au téléphone : tout se passe bien.") }).where(eq(schema.visites.stageId, rayan.id));
  await db.update(schema.visites).set({ appel: appel(leroy.id, "2026-10-21", [0], "Deux retards en début de semaine ; le tuteur reste confiant.") }).where(eq(schema.visites.stageId, emma.id));

  // Documents : fin de stage des 1re (période terminée) et historique de l'année précédente pour les terminales
  async function doc(eleveNom: string, type: schema.TypeDocument, statut: "valide" | "a_verifier", annee = "2026-2027", classeLibelle?: string, stageId?: string) {
    const [el] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, eleveNom), eq(schema.eleves.etablissementId, E))).limit(1);
    const [st] = stageId ? [{ id: stageId }] : await db.select({ id: schema.stages.id }).from(schema.stages).where(eq(schema.stages.eleveId, el.id)).orderBy(asc(schema.stages.createdAt)).limit(1);
    const cle = `${E}/${randomUUID()}.pdf`;
    const b = fauxPdf(`${type} - ${el.prenom} ${el.nom}`);
    await ecrireOctets(db, cle, b);
    const [cl] = await db.select().from(schema.classes).where(eq(schema.classes.id, el.classeId!)).limit(1);
    await db.insert(schema.documents).values({
      etablissementId: E, eleveId: el.id, stageId: st?.id ?? null, anneeScolaire: annee, classeLibelle: classeLibelle ?? cl.libelle, type,
      nomFichier: `${type}_${el.nom.toLowerCase()}.pdf`, cleStockage: cle, typeMime: "application/pdf", taille: b.length, statut,
      deposeParId: tuteurAtlas.id, valideLe: statut === "valide" ? new Date() : null,
    });
  }
  await doc("BOUZID", "attestation", "valide"); await doc("BOUZID", "livret", "valide");
  await doc("KONÉ", "livret", "valide");
  await doc("NGUYEN", "attestation", "a_verifier");
  for (const n of ["LAURENT", "CISSÉ", "FONTAINE", "MANSOURI", "BOUZID", "KONÉ", "NGUYEN", "RAHMANI"]) await doc(n, "convention", "valide");

  // Livret de compétences : les compétences de chaque diplôme du lycée (exemple fictif), évaluées par le tuteur
  await db.insert(schema.modelesDocuments).values({
    etablissementId: E, type: "livret", mode: "cap_pfmp", personnalisation: {
      competences: [
        { filiere: "Bac Pro Métiers de la sécurité", liste: [
          "Surveiller un site et protéger les biens et les personnes", "Contrôler les accès et filtrer les entrées",
          "Prévenir les risques d'incendie et de panique", "Intervenir face à un incident et alerter les secours",
          "Porter assistance et secourir", "Rendre compte de son activité à l'écrit et à l'oral",
        ] },
        { filiere: "CAP Agent de sécurité", liste: [
          "Accueillir le public et contrôler les accès", "Effectuer une ronde de surveillance", "Prévenir les risques et alerter", "Rendre compte de son activité",
        ] },
      ],
    },
  });

  // Allocation de stage : RIB et pièce d'identité déposés par les familles, gardés pour toute la scolarité
  async function piece(eleveNom: string, type: "rib" | "piece_identite", statut: "valide" | "a_verifier", deposeParId: string | null, annee = "2026-2027", classeLibelle?: string) {
    const [el] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, eleveNom), eq(schema.eleves.etablissementId, E))).limit(1);
    const cle = `${E}/${randomUUID()}.pdf`;
    const b = fauxPdf(`${type === "rib" ? "RIB" : "Piece d'identite"} - ${el.prenom} ${el.nom}`);
    await ecrireOctets(db, cle, b);
    const [cl] = await db.select().from(schema.classes).where(eq(schema.classes.id, el.classeId!)).limit(1);
    await db.insert(schema.documents).values({
      etablissementId: E, eleveId: el.id, stageId: null, anneeScolaire: annee, classeLibelle: classeLibelle ?? cl.libelle, type,
      nomFichier: `${type}_${el.nom.toLowerCase()}.pdf`, cleStockage: cle, typeMime: "application/pdf", taille: b.length, statut, deposeParId,
      valideParId: statut === "valide" ? direction.id : null, valideLe: statut === "valide" ? new Date() : null,
      deposeLe: annee === "2026-2027" ? undefined : new Date(`${annee.slice(0, 4)}-11-03T10:00:00Z`),
    });
  }
  const [leila] = await db.select().from(schema.users).where(eq(schema.users.email, `l.rahmani@${DOMAINE}`)).limit(1);
  await piece("BOUZID", "rib", "valide", null); await piece("BOUZID", "piece_identite", "valide", null);
  await piece("KONÉ", "rib", "valide", null);
  await piece("RAHMANI", "rib", "a_verifier", leila.id);

  // Année précédente : les terminales étaient en 1re, avec leur stage et leurs documents
  const [ancienne] = await db.insert(schema.classes).values({
    etablissementId: E, libelle: "1re MS", niveau: "1RE", anneeScolaire: "2025-2026", referentId: benali.id,
    filiere: "Bac Pro Métiers de la sécurité", regleStructure: "dominante",
  }).returning();
  const [pAncienne] = await db.insert(schema.periodes).values({ classeId: ancienne.id, libelle: "PFMP 1", debut: "2025-11-17", fin: "2025-12-12" }).returning();
  const terminales = await db.select().from(schema.eleves).where(eq(schema.eleves.classeId, ter.c.id));
  for (const [i, t] of terminales.entries()) {
    const [st] = await db.insert(schema.stages).values({ eleveId: t.id, periodeId: pAncienne.id, entrepriseId: ents[(i + 2) % ents.length].id, horaires: STD, signatures: TOUS_2025, tuteur: tuteurDe(ents[(i + 2) % ents.length].nom) }).returning();
    for (const ty of ["convention", "attestation", "livret"] as const) await doc(t.nom, ty, "valide", "2025-2026", "1re MS", st.id);
  }
  // Pièces de l'allocation déposées l'an dernier : toujours valables cette année
  await piece("LAURENT", "rib", "valide", null, "2025-2026", "1re MS"); await piece("LAURENT", "piece_identite", "valide", null, "2025-2026", "1re MS");

  // Campagne de rentrée envoyée le 12 octobre : deux entreprises ont répondu, dont une en ligne avec son lien personnel.
  // Les autres sont relancées automatiquement 7 et 14 jours après l'envoi.
  {
    const [c] = await db.insert(schema.campagnes).values({
      etablissementId: E, anneeScolaire: "2026-2027", sujet: "Accueil de stagiaires en PFMP – année 2026-2027", creeParId: direction.id,
      envoyeeLe: new Date("2026-10-12T08:00:00+02:00"),
      message: `Madame, Monsieur,\n\n${NOM_LYCEE} prépare les périodes de formation en milieu professionnel (PFMP) de ses élèves pour l'année 2026-2027.\n\nNous serions heureux de poursuivre ou de démarrer un partenariat avec {entreprise}. Pourriez-vous nous indiquer combien d'élèves vous pourriez accueillir sur chacune de ces périodes ?\n\nCordialement,\nClaire DUVAL\n${NOM_LYCEE}`,
    }).returning();
    await db.insert(schema.campagneReponses).values(ents.map((x) => ({ campagneId: c.id, entrepriseId: x.id })));
    const repondre = (n: string, places: [typeof cap, number][], le: string, extra: { repondant?: string; commentaire?: string } = {}) =>
      db.update(schema.campagneReponses).set({ placesParClasse: Object.fromEntries(places.map(([k, v]) => [k.c.id, v])), reponduLe: new Date(`${le}T10:00:00+02:00`), ...extra })
        .where(and(eq(schema.campagneReponses.campagneId, c.id), eq(schema.campagneReponses.entrepriseId, ent(n))));
    await repondre("Atlas", [[sec, 2], [pre, 1], [ter, 1], [cap, 2]], "2026-10-14");
    await repondre("Héliance", [[pre, 2], [ter, 1]], "2026-10-15", { repondant: "M. Lambert", commentaire: "Plutôt des élèves de 1re et de terminale, pour le poste SSIAP." });
  }

  // Partenariats : un souci signalé, et une entreprise écartée par le DDFPT (motif interne, jamais visible des familles)
  {
    const [noah] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.nom, "PETIT"), eq(schema.eleves.etablissementId, E))).limit(1);
    await db.insert(schema.soucisEntreprises).values({
      etablissementId: E, entrepriseId: ent("Garde Ouest"), eleveId: noah.id, auteurId: martin.id, categorie: "horaires",
      description: "Horaires de nuit prévus pour un élève mineur de 2nde : à corriger avant le départ.", createdAt: new Date("2026-10-20T16:00:00+02:00"),
    });
    const [vigil] = await db.insert(schema.entreprises).values({
      etablissementId: E, nom: "Vigil'Express", secteur: "prive", domaine: "Sûreté / gardiennage", ville: "Ville-démo", tuteurNom: "T. Martel",
      email: `contact@vigil-express.${DOMAINE}`, telephone: "06 39 98 00 09", placesParDefaut: 2,
      ecarteeLe: new Date("2026-09-15T10:00:00+02:00"), ecarteeMotif: "Élève laissé seul en poste de nuit en 2025-2026 ; tâches sans rapport avec la formation", ecarteeParId: direction.id,
    }).returning();
    await db.insert(schema.soucisEntreprises).values({
      etablissementId: E, entrepriseId: vigil.id, auteurId: direction.id, categorie: "securite",
      description: "Élève de 1re laissé seul en poste de nuit, sans tuteur sur place (PFMP de mars 2026).", createdAt: new Date("2026-03-20T10:00:00+01:00"),
    });
  }

  // Repère pour scripts/preparer.ts : ces données de démonstration sont à jour.
  await db.insert(schema.journal).values({ etablissementId: E, action: "donnees_demo", entite: "etablissement", entiteId: E, details: { version: VERSION_DONNEES_DEMO } });

  console.log(`Lycée de démonstration créé. Mot de passe de tous les comptes : ${MOT_DE_PASSE_DEMO}`);
  console.log(`Comptes : direction@${DOMAINE}, ddfpt@${DOMAINE} (DDFPT), p.martin@${DOMAINE} (référent 2nde), ines.haddad@${DOMAINE} et emma.laurent@${DOMAINE} (élèves), f.traore@${DOMAINE} et l.rahmani@${DOMAINE} (parents), k.ferhat@${DOMAINE} (entreprise), vie.scolaire@${DOMAINE} (vie scolaire), admin@${DOMAINE} (administration de Cap PFMP)`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
