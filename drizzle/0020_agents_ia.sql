CREATE TABLE "alertes_veille" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titre" text NOT NULL,
	"source" text NOT NULL,
	"resume" text NOT NULL,
	"propositions" jsonb NOT NULL,
	"simule" boolean DEFAULT false NOT NULL,
	"publiee_le" timestamp with time zone,
	"cree_par_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mails_a_valider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"eleve_id" uuid,
	"entreprise_id" uuid,
	"cle" text NOT NULL,
	"motif" text NOT NULL,
	"priorite" integer DEFAULT 2 NOT NULL,
	"destinataires" jsonb NOT NULL,
	"sujet" text NOT NULL,
	"corps" text NOT NULL,
	"simule" boolean DEFAULT false NOT NULL,
	"statut" text DEFAULT 'a_valider' NOT NULL,
	"demande_par_id" uuid,
	"traite_par_id" uuid,
	"traite_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plateforme" (
	"id" text PRIMARY KEY NOT NULL,
	"tarifs" jsonb NOT NULL,
	"plafonds" jsonb NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"type" text NOT NULL,
	"contenu" jsonb NOT NULL,
	"simule" boolean DEFAULT false NOT NULL,
	"par_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suites_veille" (
	"alerte_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"lue_le" timestamp with time zone,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"par_id" uuid,
	CONSTRAINT "suites_veille_alerte_id_etablissement_id_pk" PRIMARY KEY("alerte_id","etablissement_id")
);
--> statement-breakpoint
CREATE TABLE "usage_ia" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"etablissement_id" uuid,
	"agent" text NOT NULL,
	"objet" text NOT NULL,
	"simule" boolean NOT NULL,
	"tokens_entree" integer DEFAULT 0 NOT NULL,
	"tokens_sortie" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD CONSTRAINT "alertes_veille_cree_par_id_users_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD CONSTRAINT "mails_a_valider_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD CONSTRAINT "mails_a_valider_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD CONSTRAINT "mails_a_valider_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD CONSTRAINT "mails_a_valider_demande_par_id_users_id_fk" FOREIGN KEY ("demande_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD CONSTRAINT "mails_a_valider_traite_par_id_users_id_fk" FOREIGN KEY ("traite_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD CONSTRAINT "suggestions_ia_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD CONSTRAINT "suggestions_ia_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD CONSTRAINT "suggestions_ia_par_id_users_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suites_veille" ADD CONSTRAINT "suites_veille_alerte_id_alertes_veille_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alertes_veille"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suites_veille" ADD CONSTRAINT "suites_veille_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suites_veille" ADD CONSTRAINT "suites_veille_par_id_users_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ia" ADD CONSTRAINT "usage_ia_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mails_a_valider_cle_idx" ON "mails_a_valider" USING btree ("etablissement_id","cle");--> statement-breakpoint
CREATE INDEX "mails_a_valider_statut_idx" ON "mails_a_valider" USING btree ("etablissement_id","statut");--> statement-breakpoint
CREATE INDEX "suggestions_ia_eleve_idx" ON "suggestions_ia" USING btree ("eleve_id","type","created_at");--> statement-breakpoint
CREATE INDEX "usage_ia_etab_idx" ON "usage_ia" USING btree ("etablissement_id","agent","at");