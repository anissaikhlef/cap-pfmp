ALTER TABLE "eleves" ADD COLUMN "commune" text;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD COLUMN "a_relire" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD COLUMN "relue_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD COLUMN "relue_par_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions_ia" ADD CONSTRAINT "suggestions_ia_relue_par_id_users_id_fk" FOREIGN KEY ("relue_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;