ALTER TABLE "classes" ADD COLUMN "code_rome" text;--> statement-breakpoint
ALTER TABLE "mails_a_valider" ADD COLUMN "prevenir" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plateforme" ADD COLUMN "veille_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plateforme" ADD COLUMN "veille_vus" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plateforme" ADD COLUMN "veille_le" timestamp with time zone;