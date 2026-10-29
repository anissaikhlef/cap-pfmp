CREATE TABLE "articles_formation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"formation_id" uuid NOT NULL,
	"code" text,
	"libelle" text NOT NULL,
	"categorie" text NOT NULL,
	"mesure" text,
	"quantite" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campagnes_tenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"date_limite" date NOT NULL,
	"ouverte_le" timestamp with time zone DEFAULT now() NOT NULL,
	"ouverte_par_id" uuid
);
--> statement-breakpoint
CREATE TABLE "remises_tenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"campagne_id" uuid NOT NULL,
	"articles" jsonb NOT NULL,
	"signature_cle" text NOT NULL,
	"remise_le" timestamp with time zone DEFAULT now() NOT NULL,
	"remise_par_id" uuid,
	"document_id" uuid
);
--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "tailles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "tailles_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eleves" ADD COLUMN "tailles_par_id" uuid;--> statement-breakpoint
ALTER TABLE "articles_formation" ADD CONSTRAINT "articles_formation_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles_formation" ADD CONSTRAINT "articles_formation_formation_id_formations_id_fk" FOREIGN KEY ("formation_id") REFERENCES "public"."formations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes_tenues" ADD CONSTRAINT "campagnes_tenues_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes_tenues" ADD CONSTRAINT "campagnes_tenues_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campagnes_tenues" ADD CONSTRAINT "campagnes_tenues_ouverte_par_id_users_id_fk" FOREIGN KEY ("ouverte_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_tenues" ADD CONSTRAINT "remises_tenues_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_tenues" ADD CONSTRAINT "remises_tenues_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_tenues" ADD CONSTRAINT "remises_tenues_campagne_id_campagnes_tenues_id_fk" FOREIGN KEY ("campagne_id") REFERENCES "public"."campagnes_tenues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_tenues" ADD CONSTRAINT "remises_tenues_remise_par_id_users_id_fk" FOREIGN KEY ("remise_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remises_tenues" ADD CONSTRAINT "remises_tenues_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_formation_idx" ON "articles_formation" USING btree ("formation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campagnes_tenues_classe_idx" ON "campagnes_tenues" USING btree ("classe_id");--> statement-breakpoint
CREATE INDEX "remises_tenues_eleve_idx" ON "remises_tenues" USING btree ("eleve_id");--> statement-breakpoint
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_tailles_par_id_users_id_fk" FOREIGN KEY ("tailles_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;