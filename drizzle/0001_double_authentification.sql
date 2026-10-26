ALTER TABLE "sessions" ADD COLUMN "verifiee" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_actif" boolean DEFAULT false NOT NULL;