CREATE TABLE "arrets_rappels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"cible" text NOT NULL,
	"raison" text NOT NULL,
	"par_id" uuid,
	"le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arrets_rappels" ADD CONSTRAINT "arrets_rappels_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrets_rappels" ADD CONSTRAINT "arrets_rappels_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrets_rappels" ADD CONSTRAINT "arrets_rappels_par_id_users_id_fk" FOREIGN KEY ("par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arrets_rappels_idx" ON "arrets_rappels" USING btree ("eleve_id","cible");