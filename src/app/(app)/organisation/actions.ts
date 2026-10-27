"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import type { Etat } from "@/components/Formulaire";
import type { Reglages } from "@/db/schema";
import { lireJours } from "@/lib/regles";

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM");
const Schema = z.object({
  nom: z.string().trim().min(2).max(120),
  anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/, "Année scolaire au format 2026-2027"),
  gestion: z.enum(["referent", "bde", "ddfpt"]),
  visiteurs: z.enum(["pro", "equipe"]),
  repartition: z.enum(["auto", "heures"]),
  signature: z.enum(["enligne", "papier", "les2"]),
  ordreMission: z.enum(["oui", "non"]),
  calendrierPublic: z.enum(["oui", "non"]),
  compteRendu: z.enum(["oui", "non"]),
  heuresMin: z.coerce.number().min(0).max(48),
  heuresMax: z.coerce.number().min(1).max(48),
  nuitDebut: heure,
  nuitFin: heure,
  dimancheInterdit: z.enum(["oui", "non"]),
  joursReposConsecutifs: z.coerce.number().int().min(0).max(3),
  reglesMineurs: z.enum(["oui", "non"]),
  signatureModele: z.enum(["simple", "dessinee", "les2"]),
  dernierSignataire: z.enum(["professeur", "direction"]),
  relanceConvention: z.string(),
  relanceAbsences: z.string(),
  relancePiecesMax: z.coerce.number().int().min(0, "Relances des pièces : entre 0 et 10 fois").max(10, "Relances des pièces : entre 0 et 10 fois"),
  eleveQuotidien: z.enum(["oui", "non"]),
  eleveRechercheJours: z.coerce.number().int().min(0, "Rappel des élèves : entre 0 et 180 jours").max(180, "Rappel des élèves : entre 0 et 180 jours"),
  entrepriseIntervalle: z.coerce.number().int().min(0, "Rappel des entreprises : entre 0 et 30 jours").max(30, "Rappel des entreprises : entre 0 et 30 jours"),
  entrepriseMax: z.coerce.number().int().min(1, "Rappels des entreprises : entre 1 et 20 fois").max(20, "Rappels des entreprises : entre 1 et 20 fois"),
  accueilAvant: z.coerce.number().int().min(0, "Mail d'accueil : entre 0 et 30 jours").max(30, "Mail d'accueil : entre 0 et 30 jours"),
  remerciementApres: z.coerce.number().int().min(0, "Remerciements : entre 0 et 30 jours").max(30, "Remerciements : entre 0 et 30 jours"),
});

export async function enregistrerOrganisation(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const p = Schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  if (v.heuresMin > v.heuresMax) return { erreur: "La durée minimale dépasse la durée maximale." };
  const jours = [v.relanceConvention, v.relanceAbsences].map(lireJours);
  if (jours.some((j) => j === null)) return { erreur: "Relances : indiquez des nombres de jours entre 1 et 60, séparés par des virgules (ex. 7, 3)." };
  const [convention, absences] = jours as number[][];
  // Qui signe l'ordre de mission : plusieurs cases (direction, gestion des PFMP)
  const signatairesOrdreMission = (["direction", "gestionnaire"] as const).filter((r) => fd.getAll("signatairesOrdreMission").includes(r));
  if (v.ordreMission === "oui" && !signatairesOrdreMission.length) return { erreur: "Ordre de mission : cochez qui le signe (la direction, la gestion des PFMP, ou les deux)." };
  const reglages: Reglages = {
    gestion: v.gestion, visiteurs: v.visiteurs, repartition: v.repartition, signature: v.signature,
    signatureModele: v.signatureModele, dernierSignataire: v.dernierSignataire,
    ordreMission: v.ordreMission === "oui", signatairesOrdreMission: signatairesOrdreMission.length ? [...signatairesOrdreMission] : ["direction"],
    compteRendu: v.compteRendu === "oui", calendrierPublic: v.calendrierPublic === "oui",
    regles: {
      heuresMin: v.heuresMin, heuresMax: v.heuresMax, nuitDebut: v.nuitDebut, nuitFin: v.nuitFin,
      dimancheInterdit: v.dimancheInterdit === "oui", joursReposConsecutifs: v.joursReposConsecutifs,
      reglesMineurs: v.reglesMineurs === "oui",
    },
    relances: {
      convention, absences, piecesMax: v.relancePiecesMax,
      eleveQuotidien: v.eleveQuotidien === "oui", eleveRechercheJours: v.eleveRechercheJours,
      entrepriseIntervalle: v.entrepriseIntervalle, entrepriseMax: v.entrepriseMax,
      accueilAvant: v.accueilAvant, remerciementApres: v.remerciementApres,
    },
  };
  await db.update(schema.etablissements).set({ nom: v.nom, anneeScolaire: v.anneeScolaire, reglages }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "organisation_modifiee", "etablissement", ctx.etab.id, reglages);
  revalidatePath("/", "layout");
  return { ok: "Organisation enregistrée. Toute l'application en tient compte." };
}

export async function ajouterDominante(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const libelle = String(fd.get("libelle") ?? "").trim();
  if (libelle.length < 2 || libelle.length > 80) return { erreur: "Saisissez un nom de dominante." };
  await db.insert(schema.dominantes).values({ etablissementId: ctx.etab.id, libelle });
  revalidatePath("/organisation");
  return { ok: `Dominante « ${libelle} » ajoutée.` };
}

export async function supprimerDominante(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  await db.delete(schema.dominantes).where(and(eq(schema.dominantes.id, id), eq(schema.dominantes.etablissementId, ctx.etab.id)));
  revalidatePath("/organisation");
}
