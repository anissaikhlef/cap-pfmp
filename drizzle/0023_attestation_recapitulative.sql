CREATE TABLE "modeles_recapitulatifs" (
	"etablissement_id" uuid PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"nom" text NOT NULL,
	"structure" jsonb NOT NULL,
	"depose_le" timestamp with time zone DEFAULT now() NOT NULL,
	"depose_par_id" uuid
);
--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "numero_candidat" text;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "duree_cycle" integer;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "derogation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "visa_recap_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "visa_recap_par_id" uuid;--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "duree_cycle" integer;--> statement-breakpoint
ALTER TABLE "formations" ADD COLUMN "semaines_attendues" jsonb;--> statement-breakpoint
ALTER TABLE "modeles_recapitulatifs" ADD CONSTRAINT "modeles_recapitulatifs_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modeles_recapitulatifs" ADD CONSTRAINT "modeles_recapitulatifs_depose_par_id_users_id_fk" FOREIGN KEY ("depose_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_visa_recap_par_id_users_id_fk" FOREIGN KEY ("visa_recap_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;