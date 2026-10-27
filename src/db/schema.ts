import {
  customType, type AnyPgColumn,
  pgTable, uuid, text, timestamp, date, boolean, integer, real, jsonb, primaryKey, uniqueIndex, index, bigserial,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Types partagés                                                       */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "direction" | "gestionnaire" | "professeur" | "vie_scolaire" | "eleve" | "parent" | "entreprise";

/** Organisation propre à chaque lycée (cahier des charges, section 3). */
export type Reglages = {
  gestion: "referent" | "bde" | "ddfpt";
  visiteurs: "pro" | "equipe";
  /**
   * auto : l'application attribue chaque visite (référent, charge équilibrée) ·
   * heures : nombre de visites de chaque professeur en proportion de ses heures de face à face, puis chacun choisit ses lieux de stage.
   */
  repartition: "auto" | "heures";
  /** Convention signée en ligne, sur papier puis déposée, ou les deux. */
  signature: "enligne" | "papier" | "les2";
  /** En ligne : signature simple (case et bouton), signature dessinée au doigt, ou les deux au choix du signataire. */
  signatureModele: "simple" | "dessinee" | "les2";
  /** Qui signe en dernier, après avoir vérifié la convention : le professeur référent ou la direction. */
  dernierSignataire: "professeur" | "direction";
  ordreMission: boolean;
  compteRendu: boolean;
  regles: {
    heuresMin: number;
    heuresMax: number;
    nuitDebut: string; // "22:00"
    nuitFin: string; // "06:00"
    dimancheInterdit: boolean;
    joursReposConsecutifs: number;
    /** Règles du code du travail pour les élèves mineurs (article 10 de la convention). */
    reglesMineurs: boolean;
  };
  /** Relances automatiques, envoyées chaque matin. Une liste de jours vide : pas de relance. */
  relances: {
    /** Convention pas encore signée par tous : jours avant le départ en stage. */
    convention: number[];
    /** Attestation et livret pas encore reçus : jours après la fin du stage. */
    finDeStage: number[];
    /** Entreprises sans réponse à la campagne de rentrée : jours après l'envoi. */
    campagne: number[];
    /** Absence pas encore justifiée : jours après son signalement. */
    absences: number[];
    /** RIB ou pièce d'identité manquant : une relance par semaine, au plus ce nombre de fois dans l'année (0 : jamais). */
    piecesMax: number;
  };
};

export const REGLAGES_PAR_DEFAUT: Reglages = {
  gestion: "referent",
  visiteurs: "equipe",
  repartition: "auto",
  signature: "les2",
  signatureModele: "simple",
  dernierSignataire: "direction",
  ordreMission: true,
  compteRendu: true,
  regles: { heuresMin: 25, heuresMax: 35, nuitDebut: "22:00", nuitFin: "06:00", dimancheInterdit: true, joursReposConsecutifs: 2, reglesMineurs: true },
  relances: { convention: [7, 3], finDeStage: [3, 10], campagne: [7, 14], absences: [2, 7], piecesMax: 3 },
};

/** Réglages enregistrés complétés par les valeurs par défaut : un lycée créé avant l'ajout d'un réglage le reçoit ainsi. */
export function completerReglages(r: Partial<Reglages> | null | undefined): Reglages {
  return {
    ...REGLAGES_PAR_DEFAUT, ...(r ?? {}),
    regles: { ...REGLAGES_PAR_DEFAUT.regles, ...(r?.regles ?? {}) },
    relances: { ...REGLAGES_PAR_DEFAUT.relances, ...(r?.relances ?? {}) },
  };
}

/** Une plage horaire : début et fin, « HH:MM ». */
export type Plage = [string, string];
/** Du lundi (0) au dimanche (6) : une ou deux plages par jour (matin, après-midi). null = repos. */
export type Horaires = (Plage[] | null)[];

/** Tuteur de stage désigné dans l'entreprise pour ce stage. */
export type Tuteur = { nom: string; fonction: string | null; email: string | null; telephone: string | null };

export type Signataire = "eleve" | "parent" | "entreprise" | "tuteur" | "professeur" | "direction";
export type Signature = {
  le: string;
  par: string | null;
  mode: "enligne" | "papier";
  /** simple : case et bouton · dessinee : signature manuscrite dessinée au doigt (image enregistrée) */
  modele?: "simple" | "dessinee";
  /** Clé de stockage de l'image de la signature dessinée. */
  image?: string;
  /** Nom indiqué par la personne qui a signé avec un lien personnel, sans compte. */
  nom?: string;
  lien?: boolean;
};
export type Signatures = Partial<Record<Signataire, Signature>>;

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
  /** Personne qui signe les conventions pour l'entreprise. */
  representantNom: text("representant_nom"),
  representantFonction: text("representant_fonction"),
  representantEmail: text("representant_email"),
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

/**
 * Périodes de PFMP. Une période de classe concerne tous ses élèves (eleveId vide).
 * Un rattrapage est une période propre à un seul élève (eleveId renseigné), en dehors des périodes de la classe.
 */
export const periodes = pgTable("periodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  classeId: uuid("classe_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  debut: date("debut").notNull(),
  fin: date("fin").notNull(),
  eleveId: uuid("eleve_id").references((): AnyPgColumn => eleves.id, { onDelete: "cascade" }),
  /** Rattrapage : la période de la classe qui est rattrapée, et pourquoi. */
  rattrapeId: uuid("rattrape_id").references((): AnyPgColumn => periodes.id, { onDelete: "set null" }),
  motif: text("motif"),
  creeParId: uuid("cree_par_id").references(() => users.id, { onDelete: "set null" }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("periodes_classe_idx").on(t.classeId), index("periodes_eleve_idx").on(t.eleveId)]);

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
  /** Tuteur désigné pour ce stage ; vide si aucun tuteur n'est désigné (il ne signe alors pas la convention). */
  tuteur: jsonb("tuteur").$type<Tuteur>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("stages_eleve_periode_idx").on(t.eleveId, t.periodeId), index("stages_entreprise_idx").on(t.entrepriseId)]);

/**
 * Liens personnels envoyés par mail ou SMS à ceux qui n'ont pas de compte : signer une convention,
 * répondre à la campagne de rentrée. Seule l'empreinte du jeton est enregistrée ; le lien expire.
 */
export const liensAcces = pgTable("liens_acces", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  jeton: text("jeton").notNull(),
  objet: text("objet").$type<"signature" | "campagne">().notNull(),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "cascade" }),
  qualite: text("qualite").$type<Signataire>(),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "cascade" }),
  destinataire: text("destinataire").notNull(),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  utiliseLe: timestamp("utilise_le", { withTimezone: true }),
  creeParId: uuid("cree_par_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("liens_acces_jeton_idx").on(t.jeton), index("liens_acces_stage_idx").on(t.stageId)]);

export type TypeDocument =
  | "convention" | "attestation" | "livret" | "ordre_mission" | "compte_rendu" | "justificatif"
  /** Candidature de l'élève : relue par le référent (valide : c'est bon · refuse : à améliorer, avec un commentaire). */
  | "cv" | "lettre"
  /** Pièces de l'allocation, gardées pour toute la scolarité. */
  | "rib" | "piece_identite"
  | "autre";

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

/** Heures de face à face hebdomadaires d'un professeur dans une classe : servent à répartir les visites. */
export const heuresClasses = pgTable("heures_classes", {
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  professeurId: uuid("professeur_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  classeId: uuid("classe_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  heures: real("heures").notNull(),
}, (t) => [primaryKey({ columns: [t.professeurId, t.classeId] }), index("heures_classes_etab_idx").on(t.etablissementId)]);

/** Nombre de visites confié à chaque professeur pour une période, validé par la gestion ; le professeur choisit ensuite ses lieux de stage. */
export const quotasVisites = pgTable("quotas_visites", {
  periodeId: uuid("periode_id").notNull().references(() => periodes.id, { onDelete: "cascade" }),
  professeurId: uuid("professeur_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nombre: integer("nombre").notNull(),
  valideLe: timestamp("valide_le", { withTimezone: true }).notNull().defaultNow(),
  valideParId: uuid("valide_par_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [primaryKey({ columns: [t.periodeId, t.professeurId] })]);

/**
 * Absences pendant un stage. Signalées par le tuteur, la famille ou le lycée ; justifiées par la famille.
 * origine : entreprise (tuteur) · famille (parent, ou l'élève majeur) · lycee (gestion des PFMP).
 */
export const absences = pgTable("absences", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  debut: date("debut").notNull(),
  fin: date("fin").notNull(),
  origine: text("origine").$type<"entreprise" | "famille" | "lycee">().notNull(),
  signaleParId: uuid("signale_par_id").references(() => users.id, { onDelete: "set null" }),
  commentaire: text("commentaire"),
  motif: text("motif"),
  justification: text("justification"),
  justifieeLe: timestamp("justifiee_le", { withTimezone: true }),
  justifieeParId: uuid("justifiee_par_id").references(() => users.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("absences_etab_idx").on(t.etablissementId, t.debut), index("absences_stage_idx").on(t.stageId)]);

/** Notes de suivi sur un élève (vie scolaire, gestion, référent), jamais visibles par l'élève, sa famille ou l'entreprise. */
export const notesEleves = pgTable("notes_eleves", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  auteurId: uuid("auteur_id").references(() => users.id, { onDelete: "set null" }),
  texte: text("texte").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notes_eleves_eleve_idx").on(t.eleveId, t.createdAt)]);

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
  /** Réponse en ligne avec le lien personnel : nom de la personne qui a répondu, et son commentaire. */
  repondant: text("repondant"),
  commentaire: text("commentaire"),
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
  /** Documents joints (CV, lettre) : envoyés en pièces jointes quand un prestataire de mail sera branché. */
  piecesJointes: jsonb("pieces_jointes").$type<string[]>(),
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
