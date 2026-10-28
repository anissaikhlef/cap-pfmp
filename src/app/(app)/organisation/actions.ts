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
import { revenirAvec } from "@/lib/retour";

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM");
const Schema = z.object({
  nom: z.string().trim().min(2).max(120),
  anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/, "Année scolaire au format 2026-2027"),
  gestion: z.enum(["referent", "bde", "ddfpt"]),
  quiPremiere: z.enum(["pro", "general", "tous"]),
  quiDerniere: z.enum(["pro", "general", "tous"]),
  quiAutres: z.enum(["pro", "general", "tous"]),
  quiExamen: z.enum(["pro", "general", "tous"]),
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
  attestationAvant: z.coerce.number().int().min(0, "Attestation et livret : entre 0 et 10 jours").max(10, "Attestation et livret : entre 0 et 10 jours"),
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
  const quiVisite = { premiere: v.quiPremiere, derniere: v.quiDerniere, autres: v.quiAutres, examen: v.quiExamen };
  const reglages: Reglages = {
    // Ce qui se règle ailleurs (barème des frais) est gardé tel quel.
    frais: ctx.etab.reglages.frais, agents: ctx.etab.reglages.agents,
    gestion: v.gestion, quiVisite, visiteurs: Object.values(quiVisite).every((x) => x === "pro") ? "pro" : "equipe", repartition: v.repartition, signature: v.signature,
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
      accueilAvant: v.accueilAvant, remerciementApres: v.remerciementApres, attestationAvant: v.attestationAvant,
    },
  };
  await db.update(schema.etablissements).set({ nom: v.nom, anneeScolaire: v.anneeScolaire, reglages }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "organisation_modifiee", "etablissement", ctx.etab.id, reglages);
  revalidatePath("/", "layout");
  return { ok: "Organisation enregistrée. Toute l'application en tient compte." };
}

/* ------------------- Pôles, formations et spécialités (décision d'Anissa) ------------------- */

const libelle = (fd: FormData, max = 120) => String(fd.get("libelle") ?? "").trim().slice(0, max);
const rafraichirFormations = () => { revalidatePath("/organisation/formations"); revalidatePath("/classes", "layout"); };

export async function ajouterPole(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const l = libelle(fd, 80);
  if (l.length < 2) return { erreur: "Donnez un nom au pôle (ex. Maintenance industrielle)." };
  await db.insert(schema.poles).values({ etablissementId: ctx.etab.id, libelle: l });
  await journaliser(ctx, "pole_ajoute", "pole", null, { libelle: l });
  rafraichirFormations();
  return { ok: `Pôle « ${l} » ajouté.` };
}

export async function ajouterFormation(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const l = libelle(fd);
  if (l.length < 3) return { erreur: "Indiquez le diplôme préparé (ex. Bac pro Métiers de la sécurité)." };
  const poleId = z.string().uuid().safeParse(fd.get("poleId")).data;
  const [pole] = poleId ? await db.select().from(schema.poles).where(and(eq(schema.poles.id, poleId), eq(schema.poles.etablissementId, ctx.etab.id))).limit(1) : [];
  if (!pole) return { erreur: "Choisissez le pôle de cette formation." };
  const rome = String(fd.get("codeRome") ?? "").trim().toUpperCase();
  if (rome && !/^[A-Z]\d{4}$/.test(rome)) return { erreur: "Code ROME : une lettre et quatre chiffres (ex. K2503)." };
  await db.insert(schema.formations).values({ etablissementId: ctx.etab.id, poleId: pole.id, libelle: l, codeRome: rome || null });
  await journaliser(ctx, "formation_ajoutee", "formation", null, { libelle: l, pole: pole.libelle });
  rafraichirFormations();
  return { ok: `Formation « ${l} » ajoutée au pôle ${pole.libelle}.` };
}

/** Spécialité d'une formation (autrefois « dominante ») : ses élèves peuvent partir en PFMP à d'autres dates. */
export async function ajouterDominante(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const l = libelle(fd, 80);
  if (l.length < 2) return { erreur: "Saisissez un nom de spécialité." };
  const formationId = z.string().uuid().safeParse(fd.get("formationId")).data;
  const [f] = formationId ? await db.select().from(schema.formations).where(and(eq(schema.formations.id, formationId), eq(schema.formations.etablissementId, ctx.etab.id))).limit(1) : [];
  await db.insert(schema.dominantes).values({ etablissementId: ctx.etab.id, libelle: l, formationId: f?.id ?? null });
  rafraichirFormations();
  revalidatePath("/organisation");
  return { ok: `Spécialité « ${l} » ajoutée${f ? ` à la formation ${f.libelle}` : ""}.` };
}

export async function supprimerDominante(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  const [d] = await db.select().from(schema.dominantes).where(and(eq(schema.dominantes.id, id), eq(schema.dominantes.etablissementId, ctx.etab.id))).limit(1);
  if (!d) return;
  const [p] = await db.select({ id: schema.periodes.id }).from(schema.periodes).where(eq(schema.periodes.dominanteId, d.id)).limit(1);
  if (p) revenirAvec(fd, `La spécialité « ${d.libelle} » a ses propres dates de PFMP : supprimez d'abord ces périodes dans la classe.`, "err");
  await db.update(schema.eleves).set({ dominanteId: null }).where(and(eq(schema.eleves.dominanteId, d.id), eq(schema.eleves.etablissementId, ctx.etab.id)));
  await db.delete(schema.dominantes).where(eq(schema.dominantes.id, d.id));
  rafraichirFormations();
  revalidatePath("/organisation");
  revenirAvec(fd, `Spécialité « ${d.libelle} » retirée.`);
}

export async function supprimerFormation(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  const [f] = await db.select().from(schema.formations).where(and(eq(schema.formations.id, id), eq(schema.formations.etablissementId, ctx.etab.id))).limit(1);
  if (!f) return;
  const [c] = await db.select({ id: schema.classes.id }).from(schema.classes).where(eq(schema.classes.formationId, f.id)).limit(1);
  if (c) revenirAvec(fd, `Des classes préparent « ${f.libelle} » : changez d'abord leur formation.`, "err");
  await db.update(schema.dominantes).set({ formationId: null }).where(eq(schema.dominantes.formationId, f.id));
  await db.delete(schema.formations).where(eq(schema.formations.id, f.id));
  await journaliser(ctx, "formation_retiree", "formation", f.id);
  rafraichirFormations();
  revenirAvec(fd, `Formation « ${f.libelle} » retirée.`);
}

export async function supprimerPole(fd: FormData) {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const id = z.string().uuid().parse(fd.get("id"));
  const [p] = await db.select().from(schema.poles).where(and(eq(schema.poles.id, id), eq(schema.poles.etablissementId, ctx.etab.id))).limit(1);
  if (!p) return;
  const [f] = await db.select({ id: schema.formations.id }).from(schema.formations).where(eq(schema.formations.poleId, p.id)).limit(1);
  if (f) revenirAvec(fd, `Le pôle « ${p.libelle} » a encore des formations : retirez-les d'abord.`, "err");
  await db.delete(schema.poles).where(eq(schema.poles.id, p.id));
  await journaliser(ctx, "pole_retire", "pole", p.id);
  rafraichirFormations();
  revenirAvec(fd, `Pôle « ${p.libelle} » retiré.`);
}

/** Les agents IA du lycée : l'agent 1 toujours ; les agents 2 et 3 au choix (DDFPT ou direction). */
export async function enregistrerAgents(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const p = z.object({
    sansStageJours: z.coerce.number().int().min(0, "Élèves sans stage : entre 0 et 120 jours").max(120, "Élèves sans stage : entre 0 et 120 jours"),
    absencesMail: z.coerce.number().int().min(0, "Absences : entre 0 et 10").max(10, "Absences : entre 0 et 10"),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const agents = { veille: fd.get("veille") === "on", entreprises: fd.get("entreprises") === "on", ...p.data };
  const avant = ctx.etab.reglages.agents;
  await db.update(schema.etablissements).set({ reglages: { ...ctx.etab.reglages, agents } }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "agents_choisis", "etablissement", ctx.etab.id, { avant, apres: agents });
  revalidatePath("/", "layout");
  const change = avant.veille !== agents.veille || avant.entreprises !== agents.entreprises;
  return { ok: change ? "Agents enregistrés. Ils sont disponibles tout de suite ; le nouveau montant s'applique à partir du mois prochain." : "Réglages des agents enregistrés." };
}
