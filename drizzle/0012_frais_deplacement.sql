CREATE TABLE "frais_deplacement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"visite_id" uuid NOT NULL,
	"professeur_id" uuid NOT NULL,
	"date" date NOT NULL,
	"transport" text NOT NULL,
	"vehicule" text,
	"km" real DEFAULT 0 NOT NULL,
	"cumul_avant" real DEFAULT 0 NOT NULL,
	"montant_km" integer DEFAULT 0 NOT NULL,
	"peage" integer DEFAULT 0 NOT NULL,
	"billets" integer DEFAULT 0 NOT NULL,
	"repas" integer DEFAULT 0 NOT NULL,
	"montant_repas" integer DEFAULT 0 NOT NULL,
	"nuitees" integer DEFAULT 0 NOT NULL,
	"zone_nuitee" text,
	"montant_nuitees" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"commentaire" text,
	"statut" text DEFAULT 'envoyee' NOT NULL,
	"motif_refus" text,
	"valide_par_id" uuid,
	"valide_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frais_deplacement" ADD CONSTRAINT "frais_deplacement_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frais_deplacement" ADD CONSTRAINT "frais_deplacement_visite_id_visites_id_fk" FOREIGN KEY ("visite_id") REFERENCES "public"."visites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frais_deplacement" ADD CONSTRAINT "frais_deplacement_professeur_id_users_id_fk" FOREIGN KEY ("professeur_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frais_deplacement" ADD CONSTRAINT "frais_deplacement_valide_par_id_users_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frais_visite_idx" ON "frais_deplacement" USING btree ("visite_id");--> statement-breakpoint
CREATE INDEX "frais_prof_idx" ON "frais_deplacement" USING btree ("professeur_id","date");