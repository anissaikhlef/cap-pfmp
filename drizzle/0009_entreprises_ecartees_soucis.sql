CREATE TABLE "soucis_entreprises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"entreprise_id" uuid NOT NULL,
	"eleve_id" uuid,
	"auteur_id" uuid,
	"categorie" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "ecartee_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "ecartee_motif" text;--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "ecartee_par_id" uuid;--> statement-breakpoint
ALTER TABLE "soucis_entreprises" ADD CONSTRAINT "soucis_entreprises_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soucis_entreprises" ADD CONSTRAINT "soucis_entreprises_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soucis_entreprises" ADD CONSTRAINT "soucis_entreprises_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soucis_entreprises" ADD CONSTRAINT "soucis_entreprises_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "soucis_entreprise_idx" ON "soucis_entreprises" USING btree ("entreprise_id");