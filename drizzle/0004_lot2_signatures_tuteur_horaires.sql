CREATE TABLE "liens_acces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"jeton" text NOT NULL,
	"objet" text NOT NULL,
	"stage_id" uuid,
	"qualite" text,
	"entreprise_id" uuid,
	"destinataire" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilise_le" timestamp with time zone,
	"cree_par_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "representant_nom" text;--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "representant_fonction" text;--> statement-breakpoint
ALTER TABLE "entreprises" ADD COLUMN "representant_email" text;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "tuteur" jsonb;--> statement-breakpoint
ALTER TABLE "liens_acces" ADD CONSTRAINT "liens_acces_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liens_acces" ADD CONSTRAINT "liens_acces_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liens_acces" ADD CONSTRAINT "liens_acces_entreprise_id_entreprises_id_fk" FOREIGN KEY ("entreprise_id") REFERENCES "public"."entreprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liens_acces" ADD CONSTRAINT "liens_acces_cree_par_id_users_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "liens_acces_jeton_idx" ON "liens_acces" USING btree ("jeton");--> statement-breakpoint
CREATE INDEX "liens_acces_stage_idx" ON "liens_acces" USING btree ("stage_id");--> statement-breakpoint
-- Horaires : une plage par jour devient une liste de plages (matin, après-midi). Sans effet sur des horaires déjà convertis.
UPDATE "stages" SET "horaires" = (
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(j) = 'array' AND jsonb_typeof(j->0) = 'string' THEN jsonb_build_array(j) ELSE j END ORDER BY i)
  FROM jsonb_array_elements("horaires") WITH ORDINALITY AS t(j, i)
);
