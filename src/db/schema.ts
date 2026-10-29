import {
  customType, type AnyPgColumn,
  pgTable, uuid, text, timestamp, date, boolean, integer, real, jsonb, primaryKey, uniqueIndex, index, bigserial,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Types partagés                                                       */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "direction" | "gestionnaire" | "professeur" | "vie_scolaire" | "eleve" | "parent" | "entreprise";

/** Organisation propre à chaque lycée (cahier des charges, section 3). */
/** Qui peut faire une visite : les professeurs de l'enseignement professionnel, de l'enseignement général, ou toute l'équipe. */
export type QuiVisite = "pro" | "general" | "tous";

export type Reglages = {
  gestion: "referent" | "bde" | "ddfpt";
  /** Résumé de `quiVisite` (« pro » si seuls les professeurs de l'enseignement professionnel visitent), gardé pour l'affichage. */
  visiteurs: "pro" | "equipe";
  /**
   * Qui visite quoi, selon l'organisation du lycée (décision d'Anissa) : la première période de PFMP de l'année de la classe,
   * la dernière, les autres, et les classes d'examen (terminale, 2e année de CAP), qui passent avant tout le reste.
   */
  quiVisite: { premiere: QuiVisite; derniere: QuiVisite; autres: QuiVisite; examen: QuiVisite };
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
  /** Qui signe l'ordre de mission avant la visite : la direction, la gestion des PFMP (DDFPT, bureau des entreprises), ou les deux. */
  signatairesOrdreMission: ("direction" | "gestionnaire")[];
  compteRendu: boolean;
  /** Calendrier des PFMP consultable sans compte, avec un lien public (sans aucun nom d'élève). */
  calendrierPublic: boolean;
  /** Frais de visite des professeurs : le barème du lycée (décision d'Anissa : « chaque lycée applique son calcul »). */
  frais: BaremeFrais;
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
  /**
   * Relances automatiques, envoyées chaque matin, jamais le samedi ni le dimanche
   * (une relance prévue un jour de week-end part le lundi). Une liste de jours vide : pas de relance.
   */
  relances: {
    /** Convention pas encore signée par tous : jours avant le départ en stage. */
    convention: number[];
    /** Absence pas encore justifiée : jours après son signalement. */
    absences: number[];
    /** RIB ou pièce d'identité manquant : une relance par semaine, au plus ce nombre de fois dans l'année (0 : jamais). */
    piecesMax: number;
    /** Élève : un rappel chaque jour de ce qui lui reste à faire (trouver son stage, signer sa convention). */
    eleveQuotidien: boolean;
    /** La recherche de stage figure dans ce rappel à partir de ce nombre de jours avant le début de la période. */
    eleveRechercheJours: number;
    /** Entreprise : un rappel tous les N jours tant qu'elle n'a pas répondu (places, signature, attestation et livret). 0 : jamais. */
    entrepriseIntervalle: number;
    /** Au plus ce nombre de rappels pour une même demande ; ensuite, le lycée est prévenu pour appeler l'entreprise. */
    entrepriseMax: number;
    /** Mail d'accueil à l'entreprise, ce nombre de jours avant le début du stage (0 : pas de mail). */
    accueilAvant: number;
    /** Remerciements à l'entreprise, avec le lien pour l'attestation et le livret, ce nombre de jours après la fin (0 : pas de mail). */
    remerciementApres: number;
    /**
     * Attestation et livret : ils se remplissent en ligne à partir de ce nombre de jours avant la fin du stage, et le tuteur reçoit
     * alors son lien, pour les remplir avec l'élève encore présent (0 : à partir du dernier jour, sans ce mail).
     */
    attestationAvant: number;
    /** Tailles de la tenue pas encore indiquées : jours avant la date limite de la saisie (élève et famille). */
    tailles: number[];
    /** Élève qui n'est pas en stage alors que sa période a commencé : un rappel tous les N jours (0 : jamais). */
    sansStageIntervalle: number;
    /** Alertes au DDFPT : visite que personne n'a prise N jours avant le début du stage, compte rendu non fait N jours après la visite, ordre de mission non signé N jours avant la visite. */
    visiteNonPriseAvant: number;
    compteRenduApres: number;
    ordreMissionAvant: number;
    /** Échéances officielles du calendrier (Cap Veille) : rappels ces nombres de jours avant la date. */
    echeances: number[];
    /** Entreprise contactée sans réponse : rappel à l'élève N jours après, puis au référent N jours plus tard (0 : jamais). */
    demarcheEleve: number;
    demarcheReferent: number;
  };
  /**
   * Agents IA (décision d'Anissa : « l'agent 1 est obligatoire, le 2 et le 3, c'est le lycée qui sélectionne ce qu'il veut ») :
   * l'agent administratif (Cap Admin) est toujours là ; veille réglementaire (Cap Veille) et recherche d'entreprises (Cap Partenaires) au choix.
   */
  agents: {
    veille: boolean;
    entreprises: boolean;
    /** Cap Admin propose un mail à la famille d'un élève toujours sans stage à partir de ce nombre de jours avant la période (0 : jamais). */
    sansStageJours: number;
    /** Cap Admin propose un mail à la famille à partir de ce nombre d'absences non justifiées pendant un stage (0 : jamais). */
    absencesMail: number;
    /** Option SMS, choisie (et payée) par le lycée : la personne qui valide un mail peut l'envoyer aussi par SMS. Sinon, que des mails. */
    sms: boolean;
    /** Option payante de Cap Partenaires : l'entraînement à l'entretien à l'oral (reconnaissance vocale hébergée en Europe). Sinon, par écrit. */
    oral: boolean;
  };
  /** L'académie du lycée (ex. « VERSAILLES »), reportée sur l'attestation récapitulative des PFMP. */
  academie: string;
  /** Tenues et matériel : les membres de l'équipe que le DDFPT désigne pour la distribution (en plus de la gestion des PFMP et de la direction). */
  tenues: { distributeurs: string[] };
  /** Langues des familles ajoutées par le lycée, en plus de la liste de Cap PFMP (src/lib/langues.ts). */
  langues: string[];
  /** Cap Veille : les pages de son académie que le lycée fait lire chaque semaine (alertes directes, sans relecture par l'administration). */
  veillePages: string[];
};

/** Les agents IA de Cap PFMP. */
export type Agent = "administratif" | "veille" | "entreprises";
/** Prix mensuel (en euros) de chaque formule, fixé par l'administration de Cap PFMP. */
export type Tarifs = { seul: number; veille: number; entreprises: number; complet: number };
/** Nombre de demandes à l'IA par mois et par lycée, pour chaque agent (0 : sans plafond). */
export type Plafonds = Record<Agent, number>;

export const REGLAGES_PAR_DEFAUT: Reglages = {
  gestion: "referent",
  visiteurs: "equipe",
  quiVisite: { premiere: "tous", derniere: "tous", autres: "tous", examen: "tous" },
  repartition: "auto",
  signature: "les2",
  signatureModele: "simple",
  dernierSignataire: "direction",
  ordreMission: true,
  signatairesOrdreMission: ["direction", "gestionnaire"],
  compteRendu: true,
  calendrierPublic: false,
  frais: { kilometrique: [], repas: 0, nuitees: [], consignes: "" },
  regles: { heuresMin: 25, heuresMax: 35, nuitDebut: "22:00", nuitFin: "06:00", dimancheInterdit: true, joursReposConsecutifs: 2, reglesMineurs: true },
  relances: { convention: [7, 3], absences: [2, 7], piecesMax: 3, eleveQuotidien: true, eleveRechercheJours: 30, entrepriseIntervalle: 3, entrepriseMax: 5, accueilAvant: 3, remerciementApres: 1, attestationAvant: 2, tailles: [7, 2], sansStageIntervalle: 2, visiteNonPriseAvant: 7, compteRenduApres: 2, ordreMissionAvant: 3, echeances: [15, 3], demarcheEleve: 7, demarcheReferent: 7 },
  agents: { veille: false, entreprises: false, sansStageJours: 60, absencesMail: 2, sms: false, oral: false },
  academie: "",
  tenues: { distributeurs: [] },
  langues: [],
  veillePages: [],
};

/** Réglages enregistrés complétés par les valeurs par défaut : un lycée créé avant l'ajout d'un réglage le reçoit ainsi. */
/** Une tranche du barème kilométrique : jusqu'à `jusqua` km parcourus dans l'année (null : au-delà), montant = km × taux + fixe. */
export type TrancheBareme = { jusqua: number | null; taux: number; fixe: number };
/** Une ligne du barème kilométrique : un véhicule et sa puissance (ex. « Voiture 5 CV »), en tranches. */
export type LigneBareme = { vehicule: string; tranches: TrancheBareme[] };
export type BaremeFrais = {
  kilometrique: LigneBareme[];
  /** Montant d'un repas, en euros. */
  repas: number;
  /** Montant d'une nuitée selon le lieu (ex. Paris et petite couronne, autres départements), en euros. */
  nuitees: { zone: string; montant: number }[];
  /** Ce qui ne se calcule pas : trajet retenu, billet de train hors de la région, justificatifs… */
  consignes: string;
};

export function completerReglages(r: Partial<Reglages> | null | undefined): Reglages {
  // Un lycée réglé avant « qui visite quoi » garde son choix : professeurs de l'enseignement professionnel, ou toute l'équipe.
  const tous: QuiVisite = r?.visiteurs === "pro" ? "pro" : "tous";
  return {
    ...REGLAGES_PAR_DEFAUT, ...(r ?? {}),
    quiVisite: r?.quiVisite ?? { premiere: tous, derniere: tous, autres: tous, examen: tous },
    regles: { ...REGLAGES_PAR_DEFAUT.regles, ...(r?.regles ?? {}) },
    relances: { ...REGLAGES_PAR_DEFAUT.relances, ...(r?.relances ?? {}) },
    agents: { ...REGLAGES_PAR_DEFAUT.agents, ...(r?.agents ?? {}) },
    tenues: { ...REGLAGES_PAR_DEFAUT.tenues, ...(r?.tenues ?? {}) },
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
  /** Critères notés (avant le lot 3.2) ; « accueil » : accueil et encadrement par l'entreprise, compté dans sa note. */
  criteres: Record<string, string>;
  /** Commentaires sur le stagiaire. */
  observations: string;
  suite: string;
  /** Attitudes professionnelles, selon la grille du lycée au moment du compte rendu (critère et niveau en toutes lettres). */
  evaluations?: { critere: string; niveau: string }[];
  /** Les activités confiées sont-elles en adéquation avec la formation ? */
  adequation?: "oui" | "en_partie" | "non";
  commentaireEntreprise?: string;
};

/** Appel au tuteur pendant la première semaine de stage, avec les questions du modèle du lycée. */
export type AppelTuteur = { date: string; reponses: { question: string; reponse: "oui" | "non" }[]; commentaire?: string; parId: string | null };

/** Signature de l'entreprise visitée, recueillie sur le téléphone du professeur pendant la visite. */
export type CachetEntreprise = { nom: string; qualite: string; image: string; le: string; parId: string | null };

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
  /** Logo du lycée (image PNG ou JPG), en tête des documents du modèle Cap PFMP. */
  logoCle: text("logo_cle"),
  /**
   * Formation incluse : lycée d'entraînement d'un membre de l'équipe (son compte dans son vrai lycée). Données fictives ;
   * rien n'en sort (aucun vrai message, pas de relances automatiques).
   */
  entrainementDeId: uuid("entrainement_de_id").references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
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
  /**
   * Entreprise écartée par le DDFPT ou la direction : plus proposée aux élèves, plus de nouveau stage.
   * Le motif reste interne au lycée, jamais visible par l'entreprise, les élèves ni les familles.
   */
  ecarteeLe: timestamp("ecartee_le", { withTimezone: true }),
  ecarteeMotif: text("ecartee_motif"),
  ecarteeParId: uuid("ecartee_par_id"),
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
  /** Formation incluse : la visite guidée, montrée à la première connexion, vue (ou passée) ce jour-là. */
  visiteGuideeLe: timestamp("visite_guidee_le", { withTimezone: true }),
  /** Formation incluse : meilleure note au quiz (sur 5) et date de cette note. */
  quizNote: integer("quiz_note"),
  quizLe: timestamp("quiz_le", { withTimezone: true }),
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

/** Pôles de formation du lycée (décision d'Anissa : « dans les lycées professionnels, on trouve plusieurs pôles »). */
export const poles = pgTable("poles", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
}, (t) => [index("poles_etab_idx").on(t.etablissementId)]);

/** Formations (diplômes en voie scolaire) de chaque pôle ; les formations en apprentissage n'entrent pas dans Cap PFMP. */
export const formations = pgTable("formations", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  poleId: uuid("pole_id").references(() => poles.id, { onDelete: "set null" }),
  /** Le diplôme préparé, ex. « Bac pro Métiers de la sécurité » ou « CAP Maintenance des véhicules, option véhicules légers ». */
  libelle: text("libelle").notNull(),
  /** Code métier ROME, pour La bonne boîte (Cap Partenaires). */
  codeRome: text("code_rome"),
  /** Durée habituelle du cycle, en années (bac pro : 3, CAP : 2) ; vide : selon le niveau des classes. */
  dureeCycle: integer("duree_cycle"),
  /** Semaines de PFMP attendues sur le cycle, selon sa durée (ex. bac pro : 20 en 3 ans, 15 en 2 ans ; CAP : 12). */
  semainesAttendues: jsonb("semaines_attendues").$type<SemainesAttendues>(),
}, (t) => [index("formations_etab_idx").on(t.etablissementId)]);

/**
 * Spécialités (autrefois « dominantes ») : rattachées à une formation. Dans une même classe, les élèves d'une spécialité
 * peuvent partir en PFMP à d'autres dates que le reste de la classe (`periodes.dominanteId`).
 */
export const dominantes = pgTable("dominantes", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  formationId: uuid("formation_id").references(() => formations.id, { onDelete: "set null" }),
  libelle: text("libelle").notNull(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  libelle: text("libelle").notNull(),
  niveau: text("niveau").$type<"CAP" | "2NDE" | "1RE" | "TLE">().notNull(),
  filiere: text("filiere"),
  /** CAP en deux ans : la 2e année est l'année d'examen (la terminale l'est toujours). */
  anneeExamen: boolean("annee_examen").notNull().default(false),
  anneeScolaire: text("annee_scolaire").notNull(),
  /** prive : structure du secteur privé exigée · dominante : domaine = dominante de l'élève · libre */
  regleStructure: text("regle_structure").$type<"prive" | "dominante" | "libre">().notNull(),
  /** Code métier ROME de la formation (ex. K2503, sécurité privée) : Cap Partenaires s'en sert pour La bonne boîte. */
  codeRome: text("code_rome"),
  /** La formation (et donc le pôle) de la classe ; `filiere` reprend alors son libellé. */
  formationId: uuid("formation_id").references((): AnyPgColumn => formations.id, { onDelete: "set null" }),
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
  /** Période d'une seule spécialité de la classe (ses élèves partent à d'autres dates) ; vide : toute la classe. */
  dominanteId: uuid("dominante_id").references((): AnyPgColumn => dominantes.id, { onDelete: "no action" }),
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
  /** Attestation récapitulative des PFMP (année d'examen) : numéro de candidat, durée du cycle si elle diffère de la formation, dérogation. */
  numeroCandidat: text("numero_candidat"),
  dureeCycle: integer("duree_cycle"),
  derogation: boolean("derogation").notNull().default(false),
  /** Visa du chef d'établissement sur l'attestation récapitulative (seule la direction vise). */
  visaRecapLe: timestamp("visa_recap_le", { withTimezone: true }),
  visaRecapParId: uuid("visa_recap_par_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  /** Commune où habite l'élève (jamais son adresse) : Cap Partenaires cherche des entreprises proches de chez lui. */
  commune: text("commune"),
  /** Langue de la famille (code de src/lib/langues.ts) : messages aux parents et espace « Mon enfant » traduits ; vide : le français. */
  langueFamille: text("langue_famille"),
  /** Tailles pour la tenue professionnelle (haut, bas, pointure…), indiquées par l'élève, sa famille ou l'équipe. */
  tailles: jsonb("tailles").$type<Tailles>().notNull().default({}),
  taillesLe: timestamp("tailles_le", { withTimezone: true }),
  taillesParId: uuid("tailles_par_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
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

/** Qui a rempli l'attestation : le tuteur avec l'élève et le professeur quand c'est possible, sinon avec l'élève, sinon seul (décision d'Anissa). */
export type RempliePar = "tuteur_eleve_professeur" | "tuteur_eleve" | "tuteur";

/** Un document de fin de stage rempli et signé en ligne par le tuteur ; le PDF produit est rangé dans les documents de l'élève. */
export type RemplissageEnLigne = {
  rempliePar: RempliePar;
  /** Le professeur présent, quand il y en a un. */
  professeur: string | null;
  signataire: { nom: string; fonction: string | null };
  signature: { modele: "simple" | "dessinee"; image?: string };
  le: string;
  /** Rempli sur le téléphone du professeur, dans le compte du tuteur, ou avec le lien personnel de l'entreprise. */
  depuis: "professeur" | "compte" | "lien";
  parId: string | null;
  documentId: string;
};

/** L'attestation de stage remplie en ligne : ce que le tuteur déclare et signe, et ce que Cap PFMP comptait au même moment. */
export type AttestationStage = RemplissageEnLigne & {
  joursEffectues: number;
  joursAbsence: number;
  /** Jours prévus moins les absences signalées dans Cap PFMP : un écart avec la déclaration du tuteur est à vérifier. */
  joursCalcules: number;
  absencesCalculees: number;
  activites: string;
  appreciation: string | null;
};

/**
 * Le livret de compétences rempli en ligne : le niveau retenu pour chaque attitude professionnelle (grille du lycée) et chaque
 * compétence du diplôme, tels qu'ils étaient au moment de le remplir, et le bilan du tuteur.
 */
export type LivretStage = RemplissageEnLigne & {
  attitudes: { critere: string; niveau: string }[];
  competences: { competence: string; niveau: string }[];
  bilan: string | null;
};

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  periodeId: uuid("periode_id").notNull().references(() => periodes.id, { onDelete: "cascade" }),
  entrepriseId: uuid("entreprise_id").notNull().references(() => entreprises.id, { onDelete: "restrict" }),
  horaires: jsonb("horaires").$type<Horaires>().notNull(),
  signatures: jsonb("signatures").$type<Signatures>().notNull().default({}),
  /** Tuteur désigné pour ce stage ; vide si aucun tuteur n'est désigné (il ne signe alors pas la convention). */
  tuteur: jsonb("tuteur").$type<Tuteur>(),
  /** Première invitation à signer la convention : point de départ des rappels à l'entreprise. Remis à zéro si le stage change. */
  conventionEnvoyeeLe: timestamp("convention_envoyee_le", { withTimezone: true }),
  /**
   * Champs du PDF du lycée que la famille ou l'entreprise complète au moment de signer (assureur, téléphone…),
   * par document puis par nom de champ.
   */
  complements: jsonb("complements").$type<Complements>().notNull().default({}),
  /** Modèle figé à la première signature : une convention signée ne change plus si le lycée modifie son modèle ensuite. */
  modeles: jsonb("modeles").$type<ModelesFiges>().notNull().default({}),
  /** Attestation de stage remplie en ligne par le tuteur ; le PDF produit est rangé dans les documents de l'élève. */
  attestation: jsonb("attestation").$type<AttestationStage>(),
  /** Livret de compétences rempli en ligne par le tuteur ; le PDF produit est rangé dans les documents de l'élève. */
  livret: jsonb("livret").$type<LivretStage>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("stages_eleve_periode_idx").on(t.eleveId, t.periodeId), index("stages_entreprise_idx").on(t.entrepriseId)]);

/**
 * Liens personnels envoyés par mail ou SMS : signer une convention, répondre à la campagne de rentrée ou déposer
 * l'attestation et le livret sans compte, se connecter sans mot de passe (élèves, parents, entreprises).
 * Seule l'empreinte du jeton est enregistrée ; le lien expire.
 */
export type ObjetLien = "signature" | "campagne" | "connexion" | "documents" | "rendezvous";

export const liensAcces = pgTable("liens_acces", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  jeton: text("jeton").notNull(),
  objet: text("objet").$type<ObjetLien>().notNull(),
  stageId: uuid("stage_id").references(() => stages.id, { onDelete: "cascade" }),
  qualite: text("qualite").$type<Signataire>(),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "cascade" }),
  /** Lien de connexion : le compte qu'il ouvre. */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
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
  /** Fiche de remise de la tenue et du matériel, signée par l'élève. */
  | "remise_tenue"
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

/** Carnet de bord : les activités de chaque jour de stage, notées par l'élève (une note par jour). */
export const activitesJour = pgTable("activites_jour", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  texte: text("texte").notNull(),
  parId: uuid("par_id").references(() => users.id, { onDelete: "set null" }),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("activites_jour_stage_date_idx").on(t.stageId, t.date)]);

export const visites = pgTable("visites", {
  id: uuid("id").primaryKey().defaultRandom(),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  visiteurId: uuid("visiteur_id").references(() => users.id, { onDelete: "set null" }),
  date: date("date"),
  heure: text("heure"),
  mode: text("mode").$type<"presentiel" | "distanciel">().notNull().default("presentiel"),
  /**
   * Ce que prévoit le professeur en prenant la visite (décision d'Anissa) : sur place, à distance, ou vide (à décider après
   * l'appel au tuteur). Il le change selon les disponibilités du tuteur, jusqu'au rendez-vous confirmé.
   */
  formePrevue: text("forme_prevue").$type<"presentiel" | "distanciel">(),
  creneauxProposes: jsonb("creneaux_proposes").$type<[string, string][]>(),
  propositionEnvoyeeLe: timestamp("proposition_envoyee_le", { withTimezone: true }),
  ordreMission: text("ordre_mission").$type<"aucun" | "a_signer" | "signe">().notNull().default("aucun"),
  ordreMissionSigneParId: uuid("ordre_mission_signe_par_id").references(() => users.id, { onDelete: "set null" }),
  ordreMissionSigneLe: timestamp("ordre_mission_signe_le", { withTimezone: true }),
  compteRendu: jsonb("compte_rendu").$type<CompteRendu>(),
  compteRenduLe: timestamp("compte_rendu_le", { withTimezone: true }),
  /** Prise de rendez-vous : formes de visite proposées à l'entreprise (sur place, à distance, ou au choix). */
  modesProposes: text("modes_proposes").$type<"presentiel" | "distanciel" | "les2">(),
  /** Pour une visite à distance : lien de visio ou numéro de téléphone, donné par le professeur. */
  lienDistance: text("lien_distance"),
  /** Message de l'entreprise en prenant rendez-vous (ou quand aucun créneau ne lui convient). */
  rdvCommentaire: text("rdv_commentaire"),
  /** Appel au tuteur la première semaine. */
  appel: jsonb("appel").$type<AppelTuteur>(),
  /** Mode de transport indiqué sur l'ordre de mission. */
  transport: text("transport").$type<"vehicule" | "commun">(),
  /** Signature de l'entreprise visitée (à défaut, la photo du document tamponné est rangée dans le dossier). */
  cachet: jsonb("cachet").$type<CachetEntreprise>(),
}, (t) => [uniqueIndex("visites_stage_idx").on(t.stageId)]);

/**
 * Demande de remboursement des frais d'une visite, préparée par le professeur et validée par la gestion des PFMP.
 * Montants en centimes ; le calcul suit le barème du lycée au moment de la demande.
 */
export const fraisDeplacement = pgTable("frais_deplacement", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  visiteId: uuid("visite_id").notNull().references(() => visites.id, { onDelete: "cascade" }),
  professeurId: uuid("professeur_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Jour de la visite. */
  date: date("date").notNull(),
  transport: text("transport").$type<"vehicule" | "commun">().notNull(),
  /** Ligne du barème choisie (véhicule et puissance). */
  vehicule: text("vehicule"),
  /** Kilomètres du trajet, aller et retour. */
  km: real("km").notNull().default(0),
  /** Kilomètres déjà parcourus dans l'année avant ce trajet : le barème s'applique par tranches annuelles. */
  cumulAvant: real("cumul_avant").notNull().default(0),
  montantKm: integer("montant_km").notNull().default(0),
  peage: integer("peage").notNull().default(0),
  /** Billets de train, de bus… sur justificatif. */
  billets: integer("billets").notNull().default(0),
  repas: integer("repas").notNull().default(0),
  montantRepas: integer("montant_repas").notNull().default(0),
  nuitees: integer("nuitees").notNull().default(0),
  zoneNuitee: text("zone_nuitee"),
  montantNuitees: integer("montant_nuitees").notNull().default(0),
  total: integer("total").notNull().default(0),
  commentaire: text("commentaire"),
  statut: text("statut").$type<"envoyee" | "validee" | "refusee">().notNull().default("envoyee"),
  motifRefus: text("motif_refus"),
  valideParId: uuid("valide_par_id").references(() => users.id, { onDelete: "set null" }),
  valideLe: timestamp("valide_le", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("frais_visite_idx").on(t.visiteId), index("frais_prof_idx").on(t.professeurId, t.date)]);

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

/** Souci signalé avec une entreprise (par un professeur ou la gestion) : compte dans sa note de partenariat. Jamais visible par l'entreprise. */
export type CategorieSouci = "horaires" | "securite" | "comportement" | "taches" | "documents" | "autre";
export const soucisEntreprises = pgTable("soucis_entreprises", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  entrepriseId: uuid("entreprise_id").notNull().references(() => entreprises.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").references(() => eleves.id, { onDelete: "set null" }),
  auteurId: uuid("auteur_id").references(() => users.id, { onDelete: "set null" }),
  categorie: text("categorie").$type<CategorieSouci>().notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("soucis_entreprise_idx").on(t.entrepriseId)]);

/* ------------------------------------------------------------------ */
/* Modèles de documents propres à chaque lycée                          */
/* ------------------------------------------------------------------ */

/** Documents dont le lycée choisit le modèle. */
export type TypeModele = "convention" | "ordre_mission" | "attestation" | "livret";

/**
 * Un champ du PDF du lycée et ce qu'on y écrit. `source` : une donnée de Cap PFMP (ex. « eleve.nomPrenom »),
 * « fixe » (le texte `fixe`), « famille » ou « entreprise » (complété par elle en signant), ou vide (rempli à la main).
 */
export type ChampPdf = {
  nom: string;
  type: "texte" | "case" | "liste" | "signature";
  /** Pages où le champ apparaît (à partir de 1). */
  pages: number[];
  options?: string[];
  source: string;
  fixe?: string;
  /** Intitulé montré à la famille ou à l'entreprise quand elle complète ce champ en signant. */
  libelle?: string;
};

/**
 * Une zone placée par le lycée sur son PDF (même sans champs) : la page, le rectangle en points PDF (origine en bas à gauche)
 * et la donnée qu'y écrit Cap PFMP (texte, croix ou signature), ou un texte fixe.
 */
export type ZonePdf = { page: number; x: number; y: number; l: number; h: number; source: string; fixe?: string };

/** Le modèle Cap PFMP adapté par le lycée : titre, texte d'introduction, rubriques ajoutées, pied de page. */
export type PersonnalisationModele = {
  titre?: string;
  introduction?: string;
  engagements?: string;
  rubriques?: { titre: string; texte: string }[];
  piedDePage?: string;
  /** Ordre de mission : questions de l'appel au tuteur la première semaine. */
  questions?: string[];
  /** Ordre de mission : grille d'évaluation des attitudes professionnelles (critères et niveaux, du plus faible au plus fort). */
  grille?: { critere: string; niveaux: string[] }[];
  /** Livret : les compétences de chaque diplôme (formation des classes), évaluées par le tuteur. */
  competences?: { filiere: string; liste: string[] }[];
  /** Livret : niveaux d'acquisition des compétences, du plus faible au plus fort. */
  niveauxCompetences?: string[];
};

export type Complements = Partial<Record<TypeModele, Record<string, string>>>;

/** Ce qu'il faut pour refaire le document à l'identique : le modèle tel qu'il était à la première signature. */
export type ModeleFige = {
  mode: "cap_pfmp" | "pdf";
  personnalisation: PersonnalisationModele;
  pdfCle: string | null;
  pdfNom: string | null;
  champs: ChampPdf[];
  logoCle: string | null;
  /** Zones placées sur le PDF du lycée. */
  zones?: ZonePdf[];
};
export type ModelesFiges = Partial<Record<TypeModele, ModeleFige>>;

export const modelesDocuments = pgTable("modeles_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  type: text("type").$type<TypeModele>().notNull(),
  /** cap_pfmp : le modèle de l'application, adapté · pdf : le PDF du lycée, rempli à l'identique */
  mode: text("mode").$type<"cap_pfmp" | "pdf">().notNull().default("cap_pfmp"),
  personnalisation: jsonb("personnalisation").$type<PersonnalisationModele>().notNull().default({}),
  pdfCle: text("pdf_cle"),
  pdfNom: text("pdf_nom"),
  champs: jsonb("champs").$type<ChampPdf[]>().notNull().default([]),
  /** Zones placées d'un clic sur le PDF du lycée, quand il n'a pas de champs (ou pour compléter ses champs). */
  zones: jsonb("zones").$type<ZonePdf[]>().notNull().default([]),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  majParId: uuid("maj_par_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [uniqueIndex("modeles_documents_etab_type_idx").on(t.etablissementId, t.type)]);

/** Semaines de PFMP attendues sur le cycle, selon sa durée en années (« 2 », « 3 »). */
export type SemainesAttendues = Partial<Record<"1" | "2" | "3", number>>;

/** Le tableau des PFMP d'un onglet élève : première ligne, nombre de lignes prévues, colonnes. */
export type LignesRecap = { premiere: number; nombre: number; debut: string; fin: string; entreprise: string; jours: string };
export type CaseRecap = "titre" | "academie" | "session" | "etablissement" | "nom" | "prenom" | "numero" | "duree" | "derogation" | "visa";
/** Où écrire, dans le fichier de l'académie : repéré d'après les intitulés, corrigeable par le lycée. */
export type StructureRecap = {
  /** Les onglets des élèves, dans l'ordre (« ELEVE 1 », « ELEVE 2 »…). */
  feuillesEleves: string[];
  /** Les cases d'un onglet élève (toutes les feuilles élèves ont la même disposition). */
  cases: Partial<Record<CaseRecap, string>>;
  lignes: LignesRecap | null;
  synthese: { feuille: string; premiere: number; numero: string; nom: string; prenom: string } | null;
  garde: { feuille: string; etablissement?: string; premiere: number; numero: string; nom: string; prenom: string; semaines: string; duree?: string; derogation?: string; observations?: string } | null;
};

/**
 * Le fichier Excel de l'académie pour l'attestation récapitulative des PFMP, déposé par le lycée (décision d'Anissa :
 * « chaque lycée doit avoir l'option pour déposer le sien »), avec les cases repérées.
 */
export const modelesRecapitulatifs = pgTable("modeles_recapitulatifs", {
  etablissementId: uuid("etablissement_id").primaryKey().references(() => etablissements.id, { onDelete: "cascade" }),
  cle: text("cle").notNull(),
  nom: text("nom").notNull(),
  structure: jsonb("structure").$type<StructureRecap>().notNull(),
  deposeLe: timestamp("depose_le", { withTimezone: true }).notNull().defaultNow(),
  deposeParId: uuid("depose_par_id").references(() => users.id, { onDelete: "set null" }),
});

/**
 * Rappels des jours de stage manquants arrêtés (décision d'Anissa) : par le DDFPT ou le référent, avec la raison écrite
 * librement ; pour l'élève et sa famille (cible « famille ») ou pour la personne elle-même (cible : son identifiant).
 * Le rappel reste arrêté jusqu'à ce qu'il soit réactivé.
 */
export const arretsRappels = pgTable("arrets_rappels", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  cible: text("cible").notNull(),
  raison: text("raison").notNull(),
  parId: uuid("par_id").references(() => users.id, { onDelete: "set null" }),
  le: timestamp("le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("arrets_rappels_idx").on(t.eleveId, t.cible)]);

/** Traductions déjà faites pour les familles (textes sans noms ni coordonnées), pour ne pas traduire deux fois le même texte. */
export const traductions = pgTable("traductions", {
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  /** Empreinte de la langue et du texte français (repères à la place des noms). */
  cle: text("cle").notNull(),
  langue: text("langue").notNull(),
  texte: text("texte").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.etablissementId, t.cle] })]);

/* ------------------------------------------------------------------ */
/* Tenues professionnelles et matériel (décisions d'Anissa)             */
/* ------------------------------------------------------------------ */

/** Ce que l'élève indique pour sa tenue : la taille du haut, du bas, sa pointure, ses gants, sa ceinture. */
export type Mesure = "haut" | "bas" | "pointure" | "gants" | "ceinture";
export type Tailles = Partial<Record<Mesure, string>>;
export type CategorieArticle = "tenue" | "protection" | "materiel";

/** Les articles remis aux élèves d'une formation, choisis par le DDFPT dans la liste préremplie ou ajoutés. */
export const articlesFormation = pgTable("articles_formation", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  formationId: uuid("formation_id").notNull().references(() => formations.id, { onDelete: "cascade" }),
  /** L'article de la liste préremplie (vide : ajouté par le lycée). */
  code: text("code"),
  libelle: text("libelle").notNull(),
  categorie: text("categorie").$type<CategorieArticle>().notNull(),
  /** La taille à demander à l'élève (vide : taille unique ou sans taille). */
  mesure: text("mesure").$type<Mesure>(),
  /** Nombre remis à chaque élève (ex. 2 polos). */
  quantite: integer("quantite").notNull().default(1),
}, (t) => [index("articles_formation_idx").on(t.formationId)]);

/** Saisie des tailles d'une classe, ouverte par le DDFPT avec une date limite (relances avant cette date). */
export const campagnesTenues = pgTable("campagnes_tenues", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  classeId: uuid("classe_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  dateLimite: date("date_limite").notNull(),
  ouverteLe: timestamp("ouverte_le", { withTimezone: true }).notNull().defaultNow(),
  ouverteParId: uuid("ouverte_par_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [uniqueIndex("campagnes_tenues_classe_idx").on(t.classeId)]);

/** Un article remis, tel qu'il était le jour de la remise. */
export type ArticleRemis = { articleId: string; libelle: string; taille: string | null; quantite: number };

/** Une remise signée par l'élève, le jour même, sur l'appareil de la personne qui distribue ; un article manquant est remis plus tard. */
export const remisesTenues = pgTable("remises_tenues", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  campagneId: uuid("campagne_id").notNull().references(() => campagnesTenues.id, { onDelete: "cascade" }),
  articles: jsonb("articles").$type<ArticleRemis[]>().notNull(),
  /** Image de la signature de l'élève. */
  signatureCle: text("signature_cle").notNull(),
  remiseLe: timestamp("remise_le", { withTimezone: true }).notNull().defaultNow(),
  remiseParId: uuid("remise_par_id").references(() => users.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
}, (t) => [index("remises_tenues_eleve_idx").on(t.eleveId)]);

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

/* ------------------------------------------------------------------ */
/* Agents IA (lot 7)                                                    */
/* ------------------------------------------------------------------ */

/** Réglages de la plateforme, fixés par l'administration de Cap PFMP (une seule ligne, id « cap-pfmp »). */
export const plateforme = pgTable("plateforme", {
  id: text("id").primaryKey(),
  tarifs: jsonb("tarifs").$type<Tarifs>().notNull(),
  plafonds: jsonb("plafonds").$type<Plafonds>().notNull(),
  /** Cap Veille : les pages officielles lues chaque semaine (Bulletin officiel…), les liens déjà vus, le dernier passage. */
  veillePages: jsonb("veille_pages").$type<string[]>().notNull().default([]),
  veilleVus: jsonb("veille_vus").$type<string[]>().notNull().default([]),
  /** Les pages de chaque académie (ex. « VERSAILLES »), lues chaque semaine ; leurs alertes vont aux lycées de cette académie. */
  veilleAcademies: jsonb("veille_academies").$type<Record<string, string[]>>().notNull().default({}),
  veilleLe: timestamp("veille_le", { withTimezone: true }),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});

/** Chaque demande faite à l'IA : pour le plafond du mois et le suivi des coûts (sans aucun texte). */
export const usageIa = pgTable("usage_ia", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** Vide : demande de l'administration de Cap PFMP (veille réglementaire, pour tous les lycées). */
  etablissementId: uuid("etablissement_id").references(() => etablissements.id, { onDelete: "cascade" }),
  agent: text("agent").$type<Agent>().notNull(),
  objet: text("objet").notNull(),
  /** Sans clé d'IA configurée (démonstration, lycée d'entraînement) : texte d'exemple, sans appel à l'IA. */
  simule: boolean("simule").notNull(),
  tokensEntree: integer("tokens_entree").notNull().default(0),
  tokensSortie: integer("tokens_sortie").notNull().default(0),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("usage_ia_etab_idx").on(t.etablissementId, t.agent, t.at)]);

/**
 * Mails préparés par un agent, à valider par une personne avant de partir (décision d'Anissa) : le professeur référent
 * de la classe de l'élève, ou la gestion des PFMP (qui peut tout valider).
 */
export const mailsAValider = pgTable("mails_a_valider", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  agent: text("agent").$type<Agent>().notNull(),
  eleveId: uuid("eleve_id").references(() => eleves.id, { onDelete: "cascade" }),
  entrepriseId: uuid("entreprise_id").references(() => entreprises.id, { onDelete: "cascade" }),
  /** Pour ne jamais proposer deux fois le même mail (ex. « sans-stage:<élève>:<période> »). */
  cle: text("cle").notNull(),
  /** Pourquoi l'agent propose ce mail. */
  motif: text("motif").notNull(),
  /** 1 : urgent · 2 : à faire · 3 : quand vous pouvez. */
  priorite: integer("priorite").notNull().default(2),
  destinataires: jsonb("destinataires").$type<{ email: string; nom: string }[]>().notNull(),
  /**
   * Prévenus à l'envoi (décision d'Anissa) : quand aucun responsable de l'élève n'a de compte, le mail part à l'élève,
   * et son professeur référent et le DDFPT en sont informés.
   */
  prevenir: jsonb("prevenir").$type<{ email: string; nom: string }[]>().notNull().default([]),
  sujet: text("sujet").notNull(),
  corps: text("corps").notNull(),
  simule: boolean("simule").notNull().default(false),
  statut: text("statut").$type<"a_valider" | "envoye" | "abandonne">().notNull().default("a_valider"),
  demandeParId: uuid("demande_par_id").references(() => users.id, { onDelete: "set null" }),
  traiteParId: uuid("traite_par_id").references(() => users.id, { onDelete: "set null" }),
  traiteLe: timestamp("traite_le", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mails_a_valider_cle_idx").on(t.etablissementId, t.cle), index("mails_a_valider_statut_idx").on(t.etablissementId, t.statut)]);

/** Alertes de veille réglementaire (Cap Veille), préparées puis publiées par l'administration de Cap PFMP. */
export const alertesVeille = pgTable("alertes_veille", {
  id: uuid("id").primaryKey().defaultRandom(),
  titre: text("titre").notNull(),
  /** Lien vers le texte officiel (Bulletin officiel, Légifrance, Éduscol). */
  source: text("source").notNull(),
  resume: text("resume").notNull(),
  /** Ce qu'il faudrait changer dans Cap PFMP ou dans l'organisation du lycée : chaque lycée décide. */
  propositions: jsonb("propositions").$type<string[]>().notNull(),
  /** Les échéances trouvées dans le texte, proposées au calendrier de chaque lycée (le DDFPT les corrige). */
  echeances: jsonb("echeances").$type<EcheanceProposee[]>().notNull().default([]),
  /** Les changements applicables en un clic (le DDFPT propose, la direction valide). */
  changements: jsonb("changements").$type<ChangementVeille[]>().notNull().default([]),
  /** Alerte d'une académie (vide : pour tous les lycées). */
  academie: text("academie"),
  /** Alerte d'une page choisie par un lycée : pour lui seul, publiée sans relecture par l'administration. */
  etablissementId: uuid("etablissement_id").references(() => etablissements.id, { onDelete: "cascade" }),
  simule: boolean("simule").notNull().default(false),
  publieeLe: timestamp("publiee_le", { withTimezone: true }),
  creeParId: uuid("cree_par_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EcheanceProposee = { titre: string; date: string; concerne: "toutes" | "examen" };
export type ChangementVeille = { libelle: string; cible: string; valeur: string };

/** Le calendrier des échéances officielles d'un lycée : proposées par Cap Veille, ajoutées ou corrigées par le DDFPT. */
export const echeances = pgTable("echeances", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  titre: text("titre").notNull(),
  date: date("date").notNull(),
  /** Qui est concerné : toutes les classes, ou les classes d'examen (leurs référents sont prévenus). */
  concerne: text("concerne").$type<"toutes" | "examen">().notNull().default("toutes"),
  /** proposee : par Cap Veille, à vérifier · retenue : dans le calendrier, avec des rappels. */
  statut: text("statut").$type<"proposee" | "retenue">().notNull().default("retenue"),
  alerteId: uuid("alerte_id").references(() => alertesVeille.id, { onDelete: "set null" }),
  majParId: uuid("maj_par_id").references(() => users.id, { onDelete: "set null" }),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("echeances_etab_idx").on(t.etablissementId)]);

/** Ce que chaque lycée a fait d'une alerte : lue, et la décision prise pour chaque proposition. */
export const suitesVeille = pgTable("suites_veille", {
  alerteId: uuid("alerte_id").notNull().references(() => alertesVeille.id, { onDelete: "cascade" }),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  lueLe: timestamp("lue_le", { withTimezone: true }),
  decisions: jsonb("decisions").$type<Record<string, "fait" | "pas_pour_nous">>().notNull().default({}),
  /** La comparaison du texte avec les documents du lycée. */
  comparaison: jsonb("comparaison").$type<{ le: string; ecarts: { document: string; ecart: string }[]; simule: boolean }>(),
  /** Les changements en un clic, par numéro : proposés par le DDFPT, validés (et appliqués) ou refusés par la direction. */
  applications: jsonb("applications").$type<Record<string, { proposeParId: string; proposeLe: string; valideParId?: string; valideLe?: string; refuseLe?: string }>>().notNull().default({}),
  parId: uuid("par_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [primaryKey({ columns: [t.alerteId, t.etablissementId] })]);

/** Propositions de Cap Partenaires pour un élève : lieux de stage, ou relecture de son CV (la dernière de chaque sorte compte). */
export type PropositionEntreprise = { nom: string; ville: string | null; domaine: string | null; raison: string; entrepriseId: string | null; source: "annuaire" | "public" | "bonne_boite" };
export type RelectureCv = { pointsForts: string[]; aAmeliorer: string[]; conseil: string };
/** Lettre de motivation : l'élève est guidé par des questions, sans que l'agent écrive à sa place (décision d'Anissa). */
export type GuideLettre = { plan: string[]; conseils: string[]; questions: string[] };
/** Préparer l'appel et l'entretien : ce qu'il faut dire au téléphone, et les questions possibles avec des pistes. */
export type FicheEntretien = { entreprise: string; telephone: string[]; questions: { question: string; piste: string }[] };
export type EchangeEntretien = { role: "tuteur" | "eleve"; texte: string };
export type TypeSuggestion = "entreprises" | "cv" | "lettre" | "lettre_guide" | "entretien_fiche" | "entretien";
export const suggestionsIa = pgTable("suggestions_ia", {
  id: uuid("id").primaryKey().defaultRandom(),
  etablissementId: uuid("etablissement_id").notNull().references(() => etablissements.id, { onDelete: "cascade" }),
  eleveId: uuid("eleve_id").notNull().references(() => eleves.id, { onDelete: "cascade" }),
  type: text("type").$type<TypeSuggestion>().notNull(),
  contenu: jsonb("contenu").$type<{
    entreprises?: PropositionEntreprise[]; conseil?: string; cv?: RelectureCv; guide?: GuideLettre; fiche?: FicheEntretien;
    echanges?: EchangeEntretien[]; bilan?: string; oral?: boolean;
  }>().notNull(),
  /** Propositions lancées pour toute une classe : le référent les relit avant que l'élève les voie (décision d'Anissa). */
  aRelire: boolean("a_relire").notNull().default(false),
  relueLe: timestamp("relue_le", { withTimezone: true }),
  relueParId: uuid("relue_par_id").references(() => users.id, { onDelete: "set null" }),
  simule: boolean("simule").notNull().default(false),
  parId: uuid("par_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("suggestions_ia_eleve_idx").on(t.eleveId, t.type, t.createdAt)]);
