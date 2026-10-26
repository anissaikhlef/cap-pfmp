import {
  customType,
  pgTable, uuid, text, timestamp, date, boolean, integer, jsonb, primaryKey, uniqueIndex, index, bigserial,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Types partagés                                                       */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "direction" | "gestionnaire" | "professeur" | "eleve" | "parent" | "entreprise";

/** Organisation propre à chaque lycée (cahier des charges, section 3). */
export type Reglages = {
  gestion: "referent" | "bde" | "ddfpt";
  visiteurs: "pro" | "equipe";
  signature: "enligne" | "papier" | "les2";
  ordreMission: boolean;
  compteRendu: boolean;
  regles: {
    heuresMin: number;
    heuresMax: number;
    nuitDebut: string; // "22:00"
    nuitFin: string; // "06:00"
    dimancheInterdit: boolean;
    joursReposConsecutifs: number;
  };
};

export const REGLAGES_PAR_DEFAUT: Reglages = {
  gestion: "referent",
  visiteurs: "equipe",
  signature: "les2",
  ordreMission: true,
  compteRendu: true,
  regles: { heuresMin: 25, heuresMax: 35, nuitDebut: "22:00", nuitFin: "06:00", dimancheInterdit: true, joursReposConsecutifs: 2 },
};

/** Une plage par jour, du lundi (0) au dimanche (6). null = repos. */
export type Horaires = ([string, string] | null)[];

export type Signataire = "eleve" | "parent" | "professeur" | "entreprise" | "direction";
export type Signatures = Partial<Record<Signataire, { le: string; par: string | null; mode: "enligne" | "papier" }>>;

export type CompteRendu = {
  date: string;
  mode: "presentiel" | "distanciel";
  personneRencontree: string;
  criteres: Record<string, string>;
  observations: string;
  suite: string;
};

/* ------------------------------------------------------------------ */
/* Établissements, comptes, sessions                                    */
/* ------------------------------------------------------------------ */

export const etablissements = pgTable("etablissements", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  ville: text("ville"),
  uai: text("uai"),
  anneeScolaire: text("annee_scolaire").notNull(),
  reglages: jsonb("reglages").$type<Reglages>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entreprises = pgTable("entreprises", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  nom: text("nom").notNull(),
  secteur: text("secteur").$type<"prive" | "public">().notNull(),
  domaine: text("domaine"),
  adresse: text("adresse"),
  ville: text("ville"),
  tuteurNom: text("tuteur_nom"),
  tuteurFonction: text("tuteur_fonction"),
  email: text("email"),
  telephone: text("telephone"),
  placesParDefaut: integer("places_par_defaut").notNull().default(0),
  notesInternes: text("notes_internes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entreprises_etab_idx").on(t.etablissementId)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").references(() => etablissements.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  prenom: text("prenom").notNull(),
  nom: text("nom").notNull(),
  roles: text("roles").array().$type<Role[]>().notNull(),
  discipline: text("discipline"),
  enseignementPro: boolean("enseignement_pro").notNull().default(false),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "set null" }),
  telephone: text("telephone"),
  actif: boolean("actif").notNull().default(true),
  doitChangerMotDePasse: boolean("doit_changer_mot_de_passe").notNull().default(true),
  /** Double authentification : secret TOTP (base 32), actif une fois le premier code confirmé. */
  totpSecret: text("totp_secret"),
  totpActif: boolean("totp_actif").notNull().default(false),
  derniereConnexion: timestamp("derniere_connexion", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_etab_idx").on(t.etablissementId)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // empreinte SHA-256 du jeton ; le jeton lui-même n'est jamais stocké
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** false tant que le second facteur n'a pas été saisi */
  verifiee: boolean("verifiee").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tentativesConnexion = pgTable("tentatives_connexion", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),
  reussie: boolean("reussie").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tentatives_email_idx").on(t.email, t.at)]);

/* ------------------------------------------------------------------ */
/* Classes, périodes, élèves                                            */
/* ------------------------------------------------------------------ */

export const dominantes = pgTable("dominantes", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  niveau: text("niveau").$type<"CAP" | "2NDE" | "1RE" | "TLE">().notNull(),
  filiere: text("filiere"),
  anneeScolaire: text("annee_scolaire").notNull(),
  /** prive : structure du secteur privé exigée · dominante : domaine = dominante de l'élève · libre */
  regleStructure: text("regle_structure").$type<"prive" | "dominante" | "libre">().notNull(),
  referentId: uuid("referent_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("classes_etab_idx").on(t.etablissementId)]);

export const periodes = pgTable("periodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  classeId: uuid("classe_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  debut: date("debut").notNull(),
  fin: date("fin").notNull(),
}, (t) => [index("periodes_classe_idx").on(t.classeId)]);

export const eleves = pgTable("eleves", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  classeId: uuid("classe_id").references(() => classes.id, { onDelete: "set null" }),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  dateNaissance: date("date_naissance"),
  email: text("email"),
  dominanteId: uuid("dominante_id").references(() => dominantes.id, { onDelete: "set null" }),
  referentId: uuid("referent_id").references(() => users.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  archive: boolean("archive").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("eleves_etab_idx").on(t.etablissementId), index("eleves_classe_idx").on(t.classeId)]);

export const responsables = pgTable("responsables", {
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.eleveId, t.userId] })]);

/* ------------------------------------------------------------------ */
/* Recherche de stage, stages, documents, visites                       */
/* ------------------------------------------------------------------ */

export const demarches = pgTable("demarches", {
  id: uuid("id").primaryKey().defaultRandom(),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  entrepriseNom: text("entreprise_nom").notNull(),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  reponse: text("reponse").$type<"attente" | "refus" | "entretien" | "accord">().notNull().default("attente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("demarches_eleve_idx").on(t.eleveId)]);

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  periodeId: uuid("periode_id").notNull().references(() => periodes.id, { onDelete: "cascade" }),
  entrepriseId: uuid("entreprise_id").notNull().references(() => entreprises.id, { onDelete: "restrict" }),
  horaires: jsonb("horaires").$type<Horaires>().notNull(),
  signatures: jsonb("signatures").$type<Signatures>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("stages_eleve_periode_idx").on(t.eleveId, t.periodeId), index("stages_entreprise_idx").on(t.entrepriseId)]);

export type TypeDocument = "convention" | "attestation" | "livret" | "ordre_mission" | "compte_rendu" | "autre";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
  anneeScolaire: text("annee_scolaire").notNull(),
  classeLibelle: text("classe_libelle").notNull(),
  type: text("type").$type<TypeDocument>().notNull(),
  nomFichier: text("nom_fichier").notNull(),
  cleStockage: text("cle_stockage").notNull(),
  typeMime: text("type_mime").notNull(),
  taille: integer("taille").notNull(),
  statut: text("statut").$type<"a_verifier" | "valide" | "refuse">().notNull().default("a_verifier"),
  motifRefus: text("motif_refus"),
  deposeParId: uuid("depose_par_id").references(() => users.id, { onDelete: "set null" }),
  deposeLe: timestamp("depose_le", { withTimezone: true }).notNull().defaultNow(),
  valideParId: uuid("valide_par_id").references(() => users.id, { onDelete: "set null" }),
  valideLe: timestamp("valide_le", { withTimezone: true }),
}, (t) => [index("documents_eleve_idx").on(t.eleveId), index("documents_statut_idx").on(t.etablissementId, t.statut)]);

export const visites = pgTable("visites", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  visiteurId: uuid("visiteur_id").references(() => users.id, { onDelete: "set null" }),
  date: date("date"),
  heure: text("heure"),
  mode: text("mode").$type<"presentiel" | "distanciel">().notNull().default("presentiel"),
  creneauxProposes: jsonb("creneaux_proposes").$type<[string, string][]>(),
  propositionEnvoyeeLe: timestamp("proposition_envoyee_le", { withTimezone: true }),
  ordreMission: text("ordre_mission").$type<"aucun" | "a_signer" | "signe">().notNull().default("aucun"),
  ordreMissionSigneParId: uuid("ordre_mission_signe_par_id").references(() => users.id, { onDelete: "set null" }),
  ordreMissionSigneLe: timestamp("ordre_mission_signe_le", { withTimezone: true }),
  compteRendu: jsonb("compte_rendu").$type<CompteRendu>(),
  compteRenduLe: timestamp("compte_rendu_le", { withTimezone: true }),
}, (t) => [uniqueIndex("visites_stage_idx").on(t.stageId)]);

/* ------------------------------------------------------------------ */
/* Campagne de rentrée et messages sortants                             */
/* ------------------------------------------------------------------ */

export const campagnes = pgTable("campagnes", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  anneeScolaire: text("annee_scolaire").notNull(),
  sujet: text("sujet").notNull(),
  message: text("message").notNull(),
  envoyeeLe: timestamp("envoyee_le", { withTimezone: true }),
  creeParId: uuid("cree_par_id").references(() => users.id, { onDelete: "set null" }),
});

export const campagneReponses = pgTable("campagne_reponses", {
  campagneId: uuid("campagne_id").notNull().references(() => campagnes.id, { onDelete: "cascade" }),
  entrepriseId: uuid("entreprise_id").notNull().references(() => entreprises.id, { onDelete: "cascade" }),
  placesParClasse: jsonb("places_par_classe").$type<Record<string, number>>(),
  reponduLe: timestamp("repondu_le", { withTimezone: true }),
  relanceLe: timestamp("relance_le", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.campagneId, t.entrepriseId] })]);

/** File des mails et SMS. En l'absence de prestataire configuré, les messages sont « simulés » et seulement consignés. */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  canal: text("canal").$type<"mail" | "sms">().notNull(),
  destinataire: text("destinataire").notNull(),
  sujet: text("sujet"),
  corps: text("corps").notNull(),
  statut: text("statut").$type<"simule" | "envoye" | "erreur">().notNull(),
  eleveId: uuid("eleve_id").references(() => eleves.id, { onDelete: "set null" }),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "set null" }),
  envoyeParId: uuid("envoye_par_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_etab_idx").on(t.etablissementId, t.createdAt)]);

/** Contenu des fichiers quand STOCKAGE=base (hébergement sans disque permanent, démonstration). */
const octets = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const fichiers = pgTable("fichiers", {
  cle: text("cle").primaryKey(),
  contenu: octets("contenu").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Journal des actions (cahier des charges, section 6). */
export const journal = pgTable("journal", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  etablissementId: uuid("etablissement_id").references(() => etablissements.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entite: text("entite").notNull(),
  entiteId: text("entite_id"),
  details: jsonb("details"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("journal_etab_idx").on(t.etablissementId, t.at)]);
