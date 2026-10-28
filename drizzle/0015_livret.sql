CREATE TABLE "activites_jour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"date" date NOT NULL,
	"texte" text NOT NULL,
	"par_id" uuid,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "livret" jsonb;--> statement-breakpoint
ALTER TABLE "activites_jour" ADD CONSTRAINT "activites_jour_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activites_jour" ADD CONSTRAINT "activites_jour_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activites_jour" ADD CONSTRAINT "activites_jour_par_id_users_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activites_jour_stage_date_idx" ON "activites_jour" USING btree ("stage_id","date");