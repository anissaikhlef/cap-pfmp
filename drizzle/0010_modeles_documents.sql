CREATE TABLE "modeles_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"type" text NOT NULL,
	"mode" text DEFAULT 'cap_pfmp' NOT NULL,
	"personnalisation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pdf_cle" text,
	"pdf_nom" text,
	"champs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_par_id" uuid
);
--> statement-breakpoint
ALTER TABLE "etablissements" ADD COLUMN "logo_cle" text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "complements" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "modeles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "modeles_documents" ADD CONSTRAINT "modeles_documents_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeles_documents" ADD CONSTRAINT "modeles_documents_maj_par_id_users_id_fk" FOREIGN KEY ("maj_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modeles_documents_etab_type_idx" ON "modeles_documents" USING btree ("etablissement_id","type");