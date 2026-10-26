CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"origine" text NOT NULL,
	"signale_par_id" uuid,
	"commentaire" text,
	"motif" text,
	"justification" text,
	"justifiee_le" timestamp with time zone,
	"justifiee_par_id" uuid,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heures_classes" (
	"etablissement_id" uuid NOT NULL,
	"professeur_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"heures" real NOT NULL,
	CONSTRAINT "heures_classes_professeur_id_classe_id_pk" PRIMARY KEY("professeur_id","classe_id")
);
--> statement-breakpoint
CREATE TABLE "notes_eleves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"eleve_id" uuid NOT NULL,
	"auteur_id" uuid,
	"texte" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotas_visites" (
	"periode_id" uuid NOT NULL,
	"professeur_id" uuid NOT NULL,
	"nombre" integer NOT NULL,
	"valide_le" timestamp with time zone DEFAULT now() NOT NULL,
	"valide_par_id" uuid,
	CONSTRAINT "quotas_visites_periode_id_professeur_id_pk" PRIMARY KEY("periode_id","professeur_id")
);
--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "eleve_id" uuid;--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "rattrape_id" uuid;--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "motif" text;--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "cree_par_id" uuid;--> statement-breakpoint
ALTER TABLE "periodes" ADD COLUMN "cree_le" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_signale_par_id_users_id_fk" FOREIGN KEY ("signale_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_justifiee_par_id_users_id_fk" FOREIGN KEY ("justifiee_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heures_classes" ADD CONSTRAINT "heures_classes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heures_classes" ADD CONSTRAINT "heures_classes_professeur_id_users_id_fk" FOREIGN KEY ("professeur_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heures_classes" ADD CONSTRAINT "heures_classes_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_eleves" ADD CONSTRAINT "notes_eleves_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_eleves" ADD CONSTRAINT "notes_eleves_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_eleves" ADD CONSTRAINT "notes_eleves_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas_visites" ADD CONSTRAINT "quotas_visites_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "public"."periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas_visites" ADD CONSTRAINT "quotas_visites_professeur_id_users_id_fk" FOREIGN KEY ("professeur_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas_visites" ADD CONSTRAINT "quotas_visites_valide_par_id_users_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absences_etab_idx" ON "absences" USING btree ("etablissement_id","debut");--> statement-breakpoint
CREATE INDEX "absences_stage_idx" ON "absences" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "heures_classes_etab_idx" ON "heures_classes" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "notes_eleves_eleve_idx" ON "notes_eleves" USING btree ("eleve_id","created_at");--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_eleve_id_eleves_id_fk" FOREIGN KEY ("eleve_id") REFERENCES "public"."eleves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_rattrape_id_periodes_id_fk" FOREIGN KEY ("rattrape_id") REFERENCES "public"."periodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodes" ADD CONSTRAINT "periodes_cree_par_id_users_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "periodes_eleve_idx" ON "periodes" USING btree ("eleve_id");