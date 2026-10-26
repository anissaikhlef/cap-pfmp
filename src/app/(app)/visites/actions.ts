"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, peutGererClasse, peutGererEleve } from "@/lib/acces";
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

/* ------------------- Répartition selon les heures de face à face ------------------- */

/** La gestion valide le nombre de visites de chaque professeur pour une période (champs q_<professeur>). */
export async function validerQuotas(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const periodeId = z.string().uuid().parse(fd.get("periodeId"));
  const [r] = await db.select({ p: schema.periodes, c: schema.classes }).from(schema.periodes)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.periodes.id, periodeId), eq(schema.classes.etablissementId, ctx.etab.id))).limit(1);
  if (!r || r.p.eleveId || !(await peutGererClasse(ctx, r.c.id))) return { erreur: "Vous ne gérez pas cette période." };
  const pool = await visiteursPossibles(ctx);
  const nouveaux = new Map<string, number>();
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^q_([0-9a-f-]{36})$/);
    if (!m || !pool.some((u) => u.id === m[1])) continue;
    const n = Number(String(v).trim() || "0");
    if (!Number.isInteger(n) || n < 0 || n > 200) return { erreur: "Chaque nombre de visites doit être un nombre entier, 0 ou plus." };
    nouveaux.set(m[1], n);
  }
  const anciens = await db.select().from(schema.quotasVisites).where(eq(schema.quotasVisites.periodeId, periodeId));
  await db.transaction(async (tx) => {
    await tx.delete(schema.quotasVisites).where(eq(schema.quotasVisites.periodeId, periodeId));
    const lignes = [...nouveaux].filter(([, n]) => n > 0).map(([professeurId, nombre]) => ({ periodeId, professeurId, nombre, valideParId: ctx.user.id }));
    if (lignes.length) await tx.insert(schema.quotasVisites).values(lignes);
  });
  // Chaque professeur dont le nombre de visites change est prévenu.
  const stages = (await visitesAOrganiser(ctx, { periodeIds: [periodeId] })).length;
  let prevenus = 0;
  for (const [id, n] of nouveaux) {
    const avant = anciens.find((q) => q.professeurId === id)?.nombre ?? 0;
    const u = pool.find((x) => x.id === id);
    if (!u || n === avant || n === 0) continue;
    await envoyer(ctx, {
      canal: "mail", destinataire: u.email, sujet: `Visites de stage à choisir : ${r.c.libelle}, ${r.p.libelle}`,
      corps: `Bonjour ${u.prenom},\n\nPour la ${r.p.libelle} de la classe ${r.c.libelle} (du ${dateLongue(r.p.debut)} au ${dateLongue(r.p.fin)}), ${n} visite${n > 1 ? "s" : ""} de stage vous ${n > 1 ? "sont confiées" : "est confiée"}, en proportion de vos heures de cours dans la classe.\nChoisissez vos lieux de stage dans Cap PFMP, rubrique « Mes visites ».\n\n${ctx.etab.nom}`,
    });
    prevenus++;
  }
  const total = [...nouveaux.values()].reduce((t, n) => t + n, 0);
  await journaliser(ctx, "quotas_visites_valides", "periode", periodeId, Object.fromEntries(nouveaux));
  rafraichir();
  const ecart = total !== stages ? ` Attention : ${total} visite(s) validée(s) pour ${stages} stage(s) à visiter.` : "";
  return { ok: `Nombres de visites validés.${prevenus ? ` ${prevenus} professeur(s) prévenu(s) : ils peuvent maintenant choisir leurs lieux de stage.` : ""}${ecart}` };
}

/** Le professeur choisit un lieu de stage à visiter, dans la limite du nombre de visites qui lui est confié. */
export async function prendreVisite(fd: FormData) {
  const ctx = await contexte({ roles: ["professeur"] });
  const stageId = z.string().uuid().parse(fd.get("stageId"));
  const [l] = await db.select({ s: schema.stages, p: schema.periodes, c: schema.classes }).from(schema.stages)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(eq(schema.stages.id, stageId), eq(schema.classes.etablissementId, ctx.etab.id))).limit(1);
  if (!l || ctx.etab.reglages.repartition !== "heures") return;
  const resultat = await db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.quotasVisites)
      .where(and(eq(schema.quotasVisites.periodeId, l.p.id), eq(schema.quotasVisites.professeurId, ctx.user.id))).for("update");
    if (!q) return "Aucune visite ne vous est confiée pour cette période.";
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.visites)
      .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
      .where(and(eq(schema.stages.periodeId, l.p.id), eq(schema.visites.visiteurId, ctx.user.id)));
    if (n >= q.nombre) return `Vous avez déjà choisi vos ${q.nombre} visite(s) pour cette période.`;
    // Les élèves d'une même entreprise sont visités le même jour.
    const [voisine] = await tx.select({ date: schema.visites.date }).from(schema.visites)
      .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
      .where(and(eq(schema.stages.periodeId, l.p.id), eq(schema.stages.entrepriseId, l.s.entrepriseId), eq(schema.visites.visiteurId, ctx.user.id))).limit(1);
    const date = voisine?.date ?? dateProposee(l.p.debut, l.p.fin, aujourdhui());
    const pris = await tx.insert(schema.visites).values({ stageId, visiteurId: ctx.user.id, date })
      .onConflictDoUpdate({ target: schema.visites.stageId, set: { visiteurId: ctx.user.id, date }, setWhere: isNull(schema.visites.visiteurId) })
      .returning({ id: schema.visites.id });
    return pris.length ? null : "Un collègue vient de choisir cette visite.";
  });
  if (resultat) revenirAvec(fd, resultat, "err");
  await journaliser(ctx, "visite_choisie", "stage", stageId);
  rafraichir();
  revenirAvec(fd, "Visite ajoutée à vos visites. Proposez un créneau au tuteur depuis le détail de la visite.");
}

/** Le professeur rend une visite qu'il avait choisie (tant que l'ordre de mission n'est pas signé et sans compte rendu). */
export async function rendreVisite(fd: FormData) {
  const ctx = await contexte({ roles: ["professeur"] });
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v || l.v.visiteurId !== ctx.user.id) return;
  if (l.v.compteRendu || l.v.ordreMission === "signe") revenirAvec(fd, "Cette visite a déjà un ordre de mission signé ou un compte rendu : demandez à la gestion des stages de la réattribuer.", "err");
  await db.update(schema.visites).set({
    visiteurId: null, date: null, heure: null, creneauxProposes: null, propositionEnvoyeeLe: null,
    ordreMission: "aucun", ordreMissionSigneParId: null, ordreMissionSigneLe: null,
  }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "visite_rendue", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, "Visite rendue : un collègue peut maintenant la choisir.");
}
