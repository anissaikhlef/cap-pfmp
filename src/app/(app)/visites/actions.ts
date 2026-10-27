"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { a, estReferentDe, peutGererClasse, peutGererEleve, peutSignerOrdreMission } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { revenirAvec } from "@/lib/retour";
import { adresseDuSite, creerLien } from "@/lib/liens";
import { confirmerRendezVous, fermerLienRendezVous, JOURS_LIEN_RENDEZ_VOUS, texteCreneau, texteMode, visitePourRendezVous } from "@/lib/rendez-vous";
import { modeRetenu } from "@/lib/regles";
import { chargerVisite, visiteursPossibles, visitesAOrganiser } from "@/lib/visites";
import { dateProposee, repartir } from "@/lib/repartition";
import { aujourdhui, dateLongue } from "@/lib/dates";
import type { Etat } from "@/components/Formulaire";
import type { AppelTuteur, CachetEntreprise, CompteRendu } from "@/db/schema";
import { NIVEAUX } from "@/lib/constantes-visites";
import { grilleEtQuestions } from "@/lib/modeles-documents";
import { enregistrerAttestation } from "@/lib/attestation";
import { chargerConvention } from "@/lib/convention";
import { enregistrerFichier, enregistrerSignatureDessinee } from "@/lib/stockage";

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
  const change = nouveauVisiteur !== v.visiteurId;
  await db.update(schema.visites).set({
    visiteurId: nouveauVisiteur,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    // Changer de visiteur annule l'ordre de mission en cours.
    ...(change ? { ordreMission: "aucun" as const, ordreMissionSigneParId: null, ordreMissionSigneLe: null } : {}),
    // Les créneaux proposés par l'ancien visiteur, encore sans réponse, ne valent plus.
    ...(change && !v.heure ? { creneauxProposes: null, propositionEnvoyeeLe: null, modesProposes: null, rdvCommentaire: null } : {}),
  }).where(eq(schema.visites.id, v.id));
  if (change) await fermerLienRendezVous(stageId);
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


/**
 * Prise de rendez-vous (demande d'Anissa) : le professeur propose ses créneaux et la forme de la visite — sur place,
 * à distance, ou au choix de l'entreprise. L'entreprise reçoit un lien personnel (SMS et mail) pour choisir en ligne, sans compte.
 */
export async function proposerCreneaux(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v?.visiteurId) return { erreur: "Visite introuvable." };
  const modes = z.enum(["presentiel", "distanciel", "les2"]).safeParse(fd.get("mode"));
  if (!modes.success) return { erreur: "Choisissez la forme de la visite : sur place, à distance, ou au choix de l'entreprise." };
  const lienDistance = String(fd.get("lienDistance") ?? "").trim().slice(0, 300) || null;
  const creneaux: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    const d = String(fd.get(`date_${i}`) ?? ""), h = String(fd.get(`heure_${i}`) ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(h)) {
      if (d < aujourdhui()) return { erreur: "Un créneau est dans le passé." };
      creneaux.push([d, h]);
    }
  }
  if (!creneaux.length) return { erreur: "Proposez au moins un créneau." };
  // Le tuteur désigné pour ce stage, à défaut la fiche entreprise.
  const mobile = l.s.tuteur?.telephone ?? l.ent.telephone;
  const email = l.s.tuteur?.email ?? l.ent.email;
  if (!mobile && !email) return { erreur: "Aucun mobile ni adresse e-mail pour le tuteur : complétez le stage ou la fiche entreprise." };
  const [visiteur] = await db.select().from(schema.users).where(eq(schema.users.id, l.v.visiteurId)).limit(1);
  // Un seul lien de prise de rendez-vous à la fois : les précédents ne servent plus.
  await fermerLienRendezVous(l.s.id);
  const { jeton } = await creerLien(ctx.etab.id, { objet: "rendezvous", destinataire: email ?? mobile!, jours: JOURS_LIEN_RENDEZ_VOUS, stageId: l.s.id, creeParId: ctx.user.id });
  const url = `${await adresseDuSite()}/rendez-vous/${jeton}`;
  const formes = modes.data === "les2" ? "sur place ou à distance, à votre choix" : texteMode(modes.data);
  const bonjour = `Bonjour ${l.s.tuteur?.nom ?? l.ent.tuteurNom ?? ""}`.trim();
  if (mobile) {
    await envoyer(ctx, {
      canal: "sms", destinataire: mobile, eleveId: l.e.id, entrepriseId: l.ent.id,
      corps: `${bonjour}, je suis ${visiteur.prenom} ${visiteur.nom}, professeur de ${l.e.prenom} ${l.e.nom}, en stage chez vous. Je souhaite faire la visite de stage ${formes}. Mes disponibilités : ${creneaux.map(texteCreneau).join(", ")}. Choisissez votre rendez-vous en ligne : ${url} Merci. ${ctx.etab.nom}`,
    });
  }
  if (email) {
    await envoyer(ctx, {
      canal: "mail", destinataire: email, sujet: `Visite de stage de ${l.e.prenom} ${l.e.nom} : choisissez votre rendez-vous`, eleveId: l.e.id, entrepriseId: l.ent.id,
      corps: `${bonjour},\n\nJe suis ${visiteur.prenom} ${visiteur.nom}, professeur de ${l.e.prenom} ${l.e.nom}, en stage chez vous. Je souhaite faire la visite de stage ${formes}.\n\nMes disponibilités :\n${creneaux.map((c) => `- ${texteCreneau(c)}`).join("\n")}\n\nChoisissez votre rendez-vous en ligne, sans créer de compte :\n${url}\n\nMerci,\n${visiteur.prenom} ${visiteur.nom}\n${ctx.etab.nom}`,
    });
  }
  await db.update(schema.visites).set({
    mode: modes.data === "les2" ? l.v.mode : modes.data, modesProposes: modes.data, lienDistance,
    creneauxProposes: creneaux, propositionEnvoyeeLe: new Date(), heure: null, rdvCommentaire: null,
  }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "creneaux_proposes", "visite", visiteId, { creneaux, modes: modes.data });
  rafraichir();
  revenirAvec(fd, `Créneaux envoyés${mobile ? ` par SMS au ${mobile}` : ""}${mobile && email ? " et" : ""}${email ? ` par mail à ${email}` : ""}, avec un lien pour prendre rendez-vous en ligne (envoi simulé tant qu'aucun prestataire n'est branché).`);
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
  const mode = modeRetenu(l.v.modesProposes, fd.get("mode") as string | null, l.v.mode);
  if (!mode) revenirAvec(fd, "Choisissez la forme de la visite : sur place ou à distance.", "err");
  const x = await visitePourRendezVous(ctx.etab.id, l.s.id);
  if (!x) return;
  const quand = await confirmerRendezVous(ctx, x, i, mode, null, tuteur ? "entreprise" : "professeur");
  await journaliser(ctx, "creneau_choisi", "visite", visiteId, { creneau: l.v.creneauxProposes[i], mode, par: tuteur ? "entreprise" : "professeur" });
  rafraichir();
  revenirAvec(fd, `Visite confirmée ${quand}.`);
}

/* ------------------------- Attestation de stage, remplie avec le professeur ------------------------- */

/**
 * Le tuteur remplit l'attestation sur le téléphone du professeur (pendant la visite ou à la fin du stage), avec l'élève
 * quand il est là ; il signe en dessinant.
 */
export async function remplirAttestationVisite(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  const cv = l?.v ? await chargerConvention(ctx, l.s.id) : null;
  if (!l?.v || !cv) return { erreur: "Visite introuvable." };
  const r = await enregistrerAttestation(ctx.etab, cv, fd, { depuis: "professeur", parId: ctx.user.id, professeur: `${ctx.user.prenom} ${ctx.user.nom}` });
  if ("erreur" in r) return r;
  rafraichir();
  for (const p of [`/visites/${visiteId}`, `/eleves/${l.e.id}`, "/documents"]) revalidatePath(p);
  revenirAvec(fd, r.statut === "valide"
    ? "Attestation signée par le tuteur : elle est rangée dans le dossier de l'élève."
    : "Attestation signée par le tuteur. Les jours indiqués diffèrent de ceux de Cap PFMP : la gestion des PFMP la vérifie.");
}

/* ------------------------- Appel au tuteur, première semaine ------------------------- */

/** Le professeur (visiteur ou référent) ou la gestion note l'appel au tuteur de la première semaine de stage. */
export async function enregistrerAppel(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v || !(l.v.visiteurId === ctx.user.id || (await peutGererEleve(ctx, l.e)) || (await estReferentDe(ctx, l.e)))) return { erreur: "Visite introuvable." };
  const date = String(fd.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > aujourdhui()) return { erreur: "Indiquez la date de l'appel (aujourd'hui au plus tard)." };
  const { questions } = await grilleEtQuestions(ctx.etab.id);
  const reponses = questions.map((question, i) => ({ question, reponse: String(fd.get(`q_${i}`) ?? "") }));
  if (reponses.some((r) => r.reponse !== "oui" && r.reponse !== "non")) return { erreur: "Répondez à chaque question par oui ou par non." };
  const appel: AppelTuteur = {
    date, reponses: reponses as AppelTuteur["reponses"], parId: ctx.user.id,
    ...(String(fd.get("commentaire") ?? "").trim() ? { commentaire: String(fd.get("commentaire")).trim().slice(0, 1000) } : {}),
  };
  await db.update(schema.visites).set({ appel }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "appel_tuteur", "visite", visiteId);
  rafraichir();
  // Le formulaire se replie une fois l'appel noté : la confirmation passe par le bandeau.
  revenirAvec(fd, "Appel enregistré : il figure sur l'ordre de mission.");
}

/* ------------------------------ Ordre de mission ------------------------------ */

/** Le visiteur demande l'ordre de mission, avec son mode de transport ; il est signé avant la visite. */
export async function demanderOrdreMission(fd: FormData) {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v?.visiteurId || !ctx.etab.reglages.ordreMission) return;
  if (!l.v.date) revenirAvec(fd, "Fixez d'abord la date de la visite.", "err");
  const transport = z.enum(["vehicule", "commun"]).safeParse(fd.get("transport"));
  if (!transport.success) revenirAvec(fd, "Indiquez votre mode de transport.", "err");
  // Champs obligatoires avant la signature : classe, élève, entreprise et son adresse.
  if (!l.ent.adresse && !l.ent.ville) revenirAvec(fd, `L'adresse de ${l.ent.nom} manque : complétez la fiche de l'entreprise avant de demander l'ordre de mission.`, "err");
  await db.update(schema.visites).set({ ordreMission: "a_signer", transport: transport.data }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "ordre_mission_demande", "visite", visiteId, { transport: transport.data });
  rafraichir();
  const qui = ctx.etab.reglages.signatairesOrdreMission;
  revenirAvec(fd, `Ordre de mission transmis pour signature (${qui.length > 1 ? "direction ou gestion des PFMP" : qui[0] === "direction" ? "direction" : "gestion des PFMP"}).`);
}

/** Signé avant la visite par la direction et/ou la gestion des PFMP, selon l'organisation du lycée. */
export async function signerOrdreMission(fd: FormData) {
  const ctx = await contexte();
  if (!peutSignerOrdreMission(ctx)) return;
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v || l.v.ordreMission !== "a_signer") return;
  await db.update(schema.visites).set({ ordreMission: "signe", ordreMissionSigneParId: ctx.user.id, ordreMissionSigneLe: new Date() }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "ordre_mission_signe", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, "Ordre de mission signé.");
}

/* ------------------- Pendant la visite : signature ou cachet de l'entreprise ------------------- */

/** Le tuteur ou le représentant signe sur le téléphone du professeur, pendant la visite. */
export async function signerCachet(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v) return { erreur: "Visite introuvable." };
  const nom = String(fd.get("nom") ?? "").trim().slice(0, 120);
  const qualite = String(fd.get("qualite") ?? "").trim().slice(0, 120);
  if (nom.length < 2) return { erreur: "Indiquez le nom de la personne qui signe pour l'entreprise." };
  const r = await enregistrerSignatureDessinee(ctx.etab.id, String(fd.get("image") ?? ""));
  if (typeof r === "string") return { erreur: r };
  const cachet: CachetEntreprise = { nom, qualite, image: r.cle, le: new Date().toISOString(), parId: ctx.user.id };
  await db.update(schema.visites).set({ cachet }).where(eq(schema.visites.id, visiteId));
  await journaliser(ctx, "cachet_entreprise", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, `Signature de ${nom} enregistrée : elle figure sur l'ordre de mission.`);
}

/** À défaut, la photo de l'ordre de mission tamponné par l'entreprise, rangée dans le dossier de l'élève. */
export async function deposerPhotoOrdreMission(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await visiteDuVisiteur(ctx, visiteId);
  if (!l?.v) return { erreur: "Visite introuvable." };
  const f = fd.get("photo");
  if (!(f instanceof File) || f.size === 0) return { erreur: "Prenez en photo l'ordre de mission tamponné, ou choisissez le fichier." };
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: l.e.id, stageId: l.s.id, anneeScolaire: l.c.anneeScolaire, classeLibelle: l.c.libelle, type: "ordre_mission",
    nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille, deposeParId: ctx.user.id, statut: "valide", valideParId: ctx.user.id, valideLe: new Date(),
  });
  await journaliser(ctx, "ordre_mission_photo", "visite", visiteId);
  rafraichir();
  revalidatePath(`/eleves/${l.e.id}`);
  revenirAvec(fd, "Photo enregistrée dans le dossier de l'élève.");
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
    adequation: z.enum(["oui", "en_partie", "non"], { error: "Les activités confiées sont-elles en adéquation avec la formation ?" }),
    accueil: z.enum(NIVEAUX, { error: "Évaluez l'accueil et l'encadrement par l'entreprise." }),
    commentaireEntreprise: z.string().trim().max(2000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message };
  if (p.data.date > aujourdhui()) return { erreur: "Le compte rendu se rédige après la visite." };
  // Attitudes professionnelles : la grille du lycée, recopiée en toutes lettres dans le compte rendu.
  const { grille } = await grilleEtQuestions(ctx.etab.id);
  const evaluations = grille.map((g, i) => ({ critere: g.critere, niveau: String(fd.get(`att_${i}`) ?? "") }));
  if (evaluations.some((e, i) => !grille[i].niveaux.includes(e.niveau))) return { erreur: "Évaluez chaque attitude professionnelle." };
  const { accueil, adequation, commentaireEntreprise, ...reste } = p.data;
  const cr: CompteRendu = { ...reste, criteres: { accueil }, evaluations, adequation, ...(commentaireEntreprise ? { commentaireEntreprise } : {}) };
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
    modesProposes: null, lienDistance: null, rdvCommentaire: null,
    ordreMission: "aucun", ordreMissionSigneParId: null, ordreMissionSigneLe: null,
  }).where(eq(schema.visites.id, visiteId));
  await fermerLienRendezVous(l.s.id);
  await journaliser(ctx, "visite_rendue", "visite", visiteId);
  rafraichir();
  revenirAvec(fd, "Visite rendue : un collègue peut maintenant la choisir.");
}
