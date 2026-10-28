ALTER TABLE "etablissements" ADD COLUMN "entrainement_de_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiz_note" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiz_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "etablissements" ADD CONSTRAINT "etablissements_entrainement_de_id_users_id_fk" FOREIGN KEY ("entrainement_de_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;