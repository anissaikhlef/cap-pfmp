CREATE TABLE "echeances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"date" date NOT NULL,
	"concerne" text DEFAULT 'toutes' NOT NULL,
	"statut" text DEFAULT 'retenue' NOT NULL,
	"alerte_id" uuid,
	"maj_par_id" uuid,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD COLUMN "echeances" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD COLUMN "changements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD COLUMN "academie" text;--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD COLUMN "etablissement_id" uuid;--> statement-breakpoint
ALTER TABLE "plateforme" ADD COLUMN "veille_academies" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "suites_veille" ADD COLUMN "comparaison" jsonb;--> statement-breakpoint
ALTER TABLE "suites_veille" ADD COLUMN "applications" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_alerte_id_alertes_veille_id_fk" FOREIGN KEY ("alerte_id") REFERENCES "public"."alertes_veille"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_maj_par_id_users_id_fk" FOREIGN KEY ("maj_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "echeances_etab_idx" ON "echeances" USING btree ("etablissement_id");--> statement-breakpoint
ALTER TABLE "alertes_veille" ADD CONSTRAINT "alertes_veille_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;