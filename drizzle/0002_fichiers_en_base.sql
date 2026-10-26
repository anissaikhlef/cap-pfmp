CREATE TABLE "fichiers" (
	"cle" text PRIMARY KEY NOT NULL,
	"contenu" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
