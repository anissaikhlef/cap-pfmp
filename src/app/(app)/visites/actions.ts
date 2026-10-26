"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutGererEleve } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { revenirAvec } from "@/lib/retour";
import { chargerVisite, visiteursPossibles, visitesAOrganiser } from "@/lib/visites";
import { dateProposee, repartir } from "@/lib/repartition";
import { aujourdhui, dateLongue, jourSemaine, JOURS } from "@/lib/dates";
import type { Etat } from "@/components/Formulaire";
import type { CompteRendu } from "@/db/schema";
import { CRITERES, NIVEAUX } from "@/lib/constantes-visites";

function rafraichir() {
  for (const p of ["/visites", "/mes-visites", "/a-signer", "/stagiaires", "/"]) revalidatePath(p);
}

/** Crée la visite d'un stage si elle n'existe pas encore. */
async function visiteDuStage(stageId: string) {
  await db.insert(schema.visites).values({ stageId }).onConflictDoNothing();
  const [v] = await db.select().from(schema.visites).where(eq(schema.visites.stageId, stageId)).limit(1);
  return v;
}

async function stageGere(ctx: Awaited<ReturnType<typeof contexte>>, stageId: string) {
  const [r] = await db.select({ s: schema.stages, e: schema.eleves }).from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .where(and(eq(schema.stages.id, stageId), eq(schema.eleves.etablissementId, ctx.etab.id))).limit(1);
  if (!r || !(await peutGererEleve(ctx, r.e))) return null;
  return r;
}

/* ------------------------------ Attribution ------------------------------ */

export async function attribuer(fd: FormData) {
  const ctx = await contexte();
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  if (!(await stageGere(ctx, stageId))) return;
  const visiteurId = String(fd.get("visiteurId") ?? "");
  const date = String(fd.get("date") ?? "");
  const pool = await visiteursPossibles(ctx);
  const v = await visiteDuStage(stageId);
  const nouveauVisiteur = visiteurId && pool.some((p) => p.id === visiteurId) ? visiteurId : null;
  await db.update(schema.visites).set({
    visiteurId: nouveauVisiteur,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    // Changer de visiteur annule l'ordre de mission en cours.
    ...(nouveauVisiteur !== v.visiteurId ? { ordreMission: "aucun" as const, ordreMissionSigneParId: null, ordreMissionSigneLe: null } : {}),
  }).where(eq(schema.visites.id, v.id));
  await journaliser(ctx, "visite_attribuee", "visite", v.id, { visiteurId: nouveauVisiteur, date });
  rafraichir();
}

export async function repartirAutomatiquement(fd: FormData) {
  const ctx = await contexte();
  const lignes = (await visitesAOrganiser(ctx, { gerees: true })).filter((l) => l.p.fin >= aujourdhui());
  const pool = await visiteursPossibles(ctx);
  const res = repartir(lignes.map((l) => ({
    stageId: l.s.id, entrepriseId: l.ent.id, periodeId: l.p.id, referentId: l.referentId,
    visiteurId: l.v?.visiteurId && pool.some((p) => p.id === l.v!.visiteurId) ? l.v.visiteurId : null,
  })), pool.map((p) => p.id));
  for (const [stageId, visiteurId] of res) {
    const l = lignes.find((x) => x.s.id === stageId)!;
    const v = await visiteDuStage(stageId);
    // Les élèves d'une même entreprise sont visités le même jour.
    const memeJour = lignes.find((x) => x.ent.id === l.ent.id && x.p.id === l.p.id && x.v?.date && (res.get(x.s.id) ?? x.v?.visiteurId) === visiteurId);
    await db.update(schema.visites).set({ visiteurId, date: v.date ?? memeJour?.v?.date ?? dateProposee(l.p.debut, l.p.fin, aujourdhui()) }).where(eq(schema.visites.id, v.id));
  }
  await journaliser(ctx, "visites_reparties", "visite", null, { n: res.size });
  rafraichir();
  revenirAvec(fd, res.size ? `${res.size} visite(s) attribuée(s). Vérifiez et ajustez si besoin.` : "Toutes les visites ont déjà un visiteur.");
}

/* ----------------------- Proposition de créneaux par SMS ----------------------- */

async function visiteDuVisiteur(ctx: Awaited<ReturnType<typeof contexte>>, visiteId: string) {
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v) return null;
  if (l.v.visiteurId === ctx.user.id || (await peutGererEleve(ctx, l.e))) return l;
  return null;
}

function texteCreneau([d, h]: [string, string]) {
  return `${JOURS[jourSemaine(d)].toLowerCase()} ${dateLongue(d).replace(/ \d{4}$/, "")} à ${h.replace(":", "h")}`;
}

export async function proposerCreneaux(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v?.visiteurId) return { erreur: "Visite introuvable." };
  const mode = z.enum(["presentiel", "distanciel"]).parse(fd.get("mode"));
  const creneaux: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    const d = String(fd.get(`date_${i}`) ?? ""), h = String(fd.get(`heure_${i}`) ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(h)) {
      if (d < aujourdhui()) return { erreur: "Un créneau est dans le passé." };
      creneaux.push([d, h]);
    }
  }
  if (!creneaux.length) return { erreur: "Proposez au moins un créneau." };
  if (!l.ent.telephone) return { erreur: "Aucun numéro de mobile pour le tuteur : complétez la fiche entreprise." };
  const [visiteur] = await db.select().from(schema.users).where(eq(schema.users.id, l.v.visiteurId)).limit(1);
  const corps = `Bonjour ${l.ent.tuteurNom ?? ""}, je suis ${visiteur.prenom} ${visiteur.nom}, professeur de ${l.e.prenom} ${l.e.nom}, en stage chez vous. Je souhaite faire la visite de stage ${mode === "presentiel" ? "sur place" : "à distance (visio ou téléphone)"}. Mes disponibilités : ${creneaux.map(texteCreneau).join(", ")}. Pouvez-vous me répondre avec le créneau qui vous convient, ou le choisir sur Cap PFMP ? Merci. ${ctx.etab.nom}`;
  await envoyer(ctx, { canal: "sms", destinataire: l.ent.telephone, corps, eleveId: l.e.id, entrepriseId: l.ent.id });
  await db.update(schema.visites).set({ mode, creneauxProposes: creneaux, propositionEnvoyeeLe: new Date(), heure: null }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "creneaux_proposes", "visite", visiteId, { creneaux, mode });
  rafraichir();
  revenirAvec(fd, `Créneaux envoyés par SMS au ${l.ent.telephone} (envoi simulé tant qu'aucun prestataire n'est branché).`);
}

/** Le créneau retenu : choisi par le tuteur dans son espace, ou saisi par le professeur après sa réponse. */
export async function choisirCreneau(fd: FormData) {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const i = z.coerce.number().int().min(0).max(2).parse(fd.get("creneau"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v?.creneauxProposes?.[i]) return;
  const tuteur = a(ctx, "entreprise") && ctx.user.entrepriseId === l.ent.id;
  if (!tuteur && !(await visiteDuVisiteur(ctx, visiteId))) return;
  const [d, h] = l.v.creneauxProposes[i];
  await db.update(schema.visites).set({ date: d, heure: h }).where(eq(schema.visites.id, visiteId));
  if (tuteur && l.v.visiteurId) {
    const [visiteur] = await db.select().from(schema.users).where(eq(schema.users.id, l.v.visiteurId)).limit(1);
    if (visiteur) await envoyer(ctx, { canal: "mail", destinataire: visiteur.email, sujet: `Visite de ${l.e.prenom} ${l.e.nom} confirmée`, corps: `${l.ent.nom} a choisi le créneau du ${texteCreneau([d, h])}.`, eleveId: l.e.id, entrepriseId: l.ent.id });
  }
  await journaliser(ctx, "creneau_choisi", "visite", visiteId, { d, h, par: tuteur ? "entreprise" : "professeur" });
  rafraichir();
  revenirAvec(fd, `Visite confirmée le ${texteCreneau([d, h])}.`);
}

/* ------------------------------ Ordre de mission ------------------------------ */

export async function demanderOrdreMission(fd: FormData) {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v?.visiteurId || !l.v.date || !ctx.etab.reglages.ordreMission) return;
  await db.update(schema.visites).set({ ordreMission: "a_signer" }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "ordre_mission_demande", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, "Ordre de mission transmis à la direction pour signature.");
}

export async function signerOrdreMission(fd: FormData) {
  const ctx = await contexte({ roles: ["direction"] });
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v || l.v.ordreMission !== "a_signer") return;
  await db.update(schema.visites).set({ ordreMission: "signe", ordreMissionSigneParId: ctx.user.id, ordreMissionSigneLe: new Date() }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "ordre_mission_signe", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, "Ordre de mission signé.");
}

/* ------------------------------ Compte rendu ------------------------------ */

export async function enregistrerCompteRendu(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v) return { erreur: "Visite introuvable." };
  const p = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de la visite manquante"),
    mode: z.enum(["presentiel", "distanciel"]),
    personneRencontree: z.string().trim().min(2, "Indiquez la personne rencontrée").max(120),
    observations: z.string().trim().max(4000),
    suite: z.enum(["aucune", "point_eleve", "famille", "alerte"]),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  if (p.data.date > aujourdhui()) return { erreur: "Le compte rendu se rédige après la visite." };
  const criteres: Record<string, string> = {};
  for (const [k] of CRITERES) {
    const v = String(fd.get(`critere_${k}`) ?? "");
    if (!(NIVEAUX as readonly string[]).includes(v)) return { erreur: "Évaluez chaque critère." };
    criteres[k] = v;
  }
  const cr: CompteRendu = { ...p.data, criteres };
  await db.update(schema.visites).set({ compteRendu: cr, compteRenduLe: new Date(), date: p.data.date, mode: p.data.mode }).where(eq(schema.visites.id, visiteId));
  if (p.data.suite === "alerte") {
    // Prévient le référent de la classe et la direction
    const dest = await db.select().from(schema.users).where(eq(schema.users.etablissementId, ctx.etab.id));
    const cibles = dest.filter((u) => u.actif && (u.id === l.referentId || u.roles.includes("direction") || u.roles.includes("gestionnaire")) && u.id !== ctx.user.id);
    for (const u of cibles) await envoyer(ctx, { canal: "mail", destinataire: u.email, sujet: `Alerte après la visite de ${l.e.prenom} ${l.e.nom}`, corps: `${ctx.user.prenom} ${ctx.user.nom} signale une situation à traiter chez ${l.ent.nom} :\n\n${p.data.observations}`, eleveId: l.e.id });
  }
  await journaliser(ctx, "compte_rendu_enregistre", "visite", visiteId, { suite: p.data.suite });
  rafraichir();
  revalidatePath(`/eleves/${l.e.id}`);
  revenirAvec(fd, p.data.suite === "alerte" ? "Compte rendu enregistré. L'alerte a été transmise." : "Compte rendu enregistré dans le dossier de l'élève.");
}
