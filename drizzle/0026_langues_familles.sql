CREATE TABLE "traductions" (
	"etablissement_id" uuid NOT NULL,
	"cle" text NOT NULL,
	"langue" text NOT NULL,
	"texte" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traductions_etablissement_id_cle_pk" PRIMARY KEY("etablissement_id","cle")
);
--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "langue_famille" text;--> statement-breakpoint
ALTER TABLE "traductions" ADD CONSTRAINT "traductions_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;