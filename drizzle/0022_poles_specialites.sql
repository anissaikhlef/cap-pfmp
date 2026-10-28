CREATE TABLE "formations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"pole_id" uuid,
	"libelle" text NOT NULL,
	"code_rome" text
);
--> statement-breakpoint
CREATE TABLE "poles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"libelle" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "formation_id" uuid;--> statement-breakpoint
ALTER TABLE "dominantes" ADD COLUMN "formation_id" uuid;--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "dominante_id" uuid;--> statement-breakpoint
ALTER TABLE "visites" ADD COLUMN "forme_prevue" text;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formations" ADD CONSTRAINT "formations_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poles" ADD CONSTRAINT "poles_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "formations_etab_idx" ON "formations" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "poles_etab_idx" ON "poles" USING btree ("etablissement_id");--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dominantes" ADD CONSTRAINT "dominantes_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_dominante_id_dominantes_id_fk" FOREIGN KEY ("dominante_id") REFERENCES "public"."dominantes"("id") ON DELETE no action ON UPDATE no action;