CREATE TABLE "campagne_reponses" (
	"campagne_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"places_par_classe" jsonb,
	"repondu_le" timestamp with time zone,
	"relance_le" timestamp with time zone,
	CONSTRAINT "campagne_reponses_campagne_id_entreprise_id_pk" PRIMARY KEY("campagne_id","entreprise_id")
);
--> statement-breakpoint
CREATE TABLE "campagnes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"annee_scolaire" text NOT NULL,
	"sujet" text NOT NULL,
	"message" text NOT NULL,
	"envoyee_le" timestamp with time zone,
	"cree_par_id" uuid
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"niveau" text NOT NULL,
	"filiere" text,
	"annee_scolaire" text NOT NULL,
	"regle_structure" text NOT NULL,
	"referent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "demarches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"entreprise_nom" text NOT NULL,
	"entreprise_id" uuid,
	"date" date NOT NULL,
	"reponse" text DEFAULT 'attente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"stage_id" uuid,
	"annee_scolaire" text NOT NULL,
	"classe_libelle" text NOT NULL,
	"type" text NOT NULL,
	"nom_fichier" text NOT NULL,
	"cle_stockage" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille" integer NOT NULL,
	"statut" text DEFAULT 'a_verifier' NOT NULL,
	"motif_refus" text,
	"depose_par_id" uuid,
	"depose_le" timestamp with time zone DEFAULT now() NOT NULL,
	"valide_par_id" uuid,
	"valide_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dominantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"libelle" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eleves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"classe_id" uuid,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"date_naissance" date,
	"email" text,
	"dominante_id" uuid,
	"referent_id" uuid,
	"user_id" uuid,
	"archive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entreprises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"secteur" text NOT NULL,
	"domaine" text,
	"adresse" text,
	"ville" text,
	"tuteur_nom" text,
	"tuteur_fonction" text,
	"email" text,
	"telephone" text,
	"places_par_defaut" integer DEFAULT 0 NOT NULL,
	"notes_internes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etablissements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"ville" text,
	"uai" text,
	"annee_scolaire" text NOT NULL,
	"reglages" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"etablissement_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" text,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"destinataire" text NOT NULL,
	"sujet" text,
	"corps" text NOT NULL,
	"statut" text NOT NULL,
	"eleve_id" uuid,
	"entreprise_id" uuid,
	"envoye_par_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classe_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responsables" (
	"eleve_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "responsables_eleve_id_user_id_pk" PRIMARY KEY("eleve_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eleve_id" uuid NOT NULL,
	"periode_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"horaires" jsonb NOT NULL,
	"signatures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentatives_connexion" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reussie" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"prenom" text NOT NULL,
	"nom" text NOT NULL,
	"roles" text[] NOT NULL,
	"discipline" text,
	"enseignement_pro" boolean DEFAULT false NOT NULL,
	"entreprise_id" uuid,
	"telephone" text,
	"actif" boolean DEFAULT true NOT NULL,
	"doit_changer_mot_de_passe" boolean DEFAULT true NOT NULL,
	"derniere_connexion" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"visiteur_id" uuid,
	"date" date,
	"heure" text,
	"mode" text DEFAULT 'presentiel' NOT NULL,
	"creneaux_proposes" jsonb,
	"proposition_envoyee_le" timestamp with time zone,
	"ordre_mission" text DEFAULT 'aucun' NOT NULL,
	"ordre_mission_signe_par_id" uuid,
	"ordre_mission_signe_le" timestamp with time zone,
	"compte_rendu" jsonb,
	"compte_rendu_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campagne_reponses" ADD CONSTRAINT "campagne_reponses_campagne_id_campagnes_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagne_reponses" ADD CONSTRAINT "campagne_reponses_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes" ADD CONSTRAINT "campagnes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes" ADD CONSTRAINT "campagnes_cree_par_id_users_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_referent_id_users_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demarches" ADD CONSTRAINT "demarches_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demarches" ADD CONSTRAINT "demarches_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_depose_par_id_users_id_fk" FOREIGN KEY ("depose_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_valide_par_id_users_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dominantes" ADD CONSTRAINT "dominantes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_dominante_id_dominantes_id_fk" FOREIGN KEY ("dominante_id") REFERENCES "public"."dominantes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_referent_id_users_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entreprises" ADD CONSTRAINT "entreprises_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_envoye_par_id_users_id_fk" FOREIGN KEY ("envoye_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsables" ADD CONSTRAINT "responsables_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responsables" ADD CONSTRAINT "responsables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_visiteur_id_users_id_fk" FOREIGN KEY ("visiteur_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visites" ADD CONSTRAINT "visites_ordre_mission_signe_par_id_users_id_fk" FOREIGN KEY ("ordre_mission_signe_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_etab_idx" ON "classes" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "demarches_eleve_idx" ON "demarches" USING btree ("eleve_id");--> statement-breakpoint
CREATE INDEX "documents_eleve_idx" ON "documents" USING btree ("eleve_id");--> statement-breakpoint
CREATE INDEX "documents_statut_idx" ON "documents" USING btree ("etablissement_id","statut");--> statement-breakpoint
CREATE INDEX "eleves_etab_idx" ON "eleves" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "eleves_classe_idx" ON "eleves" USING btree ("classe_id");--> statement-breakpoint
CREATE INDEX "entreprises_etab_idx" ON "entreprises" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "journal_etab_idx" ON "journal" USING btree ("etablissement_id","at");--> statement-breakpoint
CREATE INDEX "messages_etab_idx" ON "messages" USING btree ("etablissement_id","created_at");--> statement-breakpoint
CREATE INDEX "periodes_classe_idx" ON "periodes" USING btree ("classe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_eleve_periode_idx" ON "stages" USING btree ("eleve_id","periode_id");--> statement-breakpoint
CREATE INDEX "stages_entreprise_idx" ON "stages" USING btree ("entreprise_id");--> statement-breakpoint
CREATE INDEX "tentatives_email_idx" ON "tentatives_connexion" USING btree ("email","at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_etab_idx" ON "users" USING btree ("etablissement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visites_stage_idx" ON "visites" USING btree ("stage_id");