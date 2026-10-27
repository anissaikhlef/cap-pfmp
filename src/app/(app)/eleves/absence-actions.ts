"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutGererEleve } from "@/lib/acces";
import { chargerConvention, type ContexteConvention } from "@/lib/convention";
import { droitsAbsences } from "@/lib/absences";
import { alerter, equipeAPrevenir, responsablesDe } from "@/lib/alertes";
import { enregistrerFichier } from "@/lib/stockage";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { ageAu, aujourdhui, dateCourte, texteDates } from "@/lib/dates";
import { joursDAbsence } from "@/lib/regles";
import { MOTIFS_ABSENCE } from "@/lib/constantes-absences";
import type { Etat } from "@/components/Formulaire";

type Ctx = Awaited<ReturnType<typeof contexte>>;

function rafraichir(eleveId: string) {
  for (const p of [`/eleves/${eleveId}`, "/mon-enfant", "/mon-stage", "/stagiaires", "/vie-scolaire", "/eleves", "/"]) revalidatePath(p);
}

/** Enregistre le justificatif éventuel comme document du dossier de l'élève (jamais visible par l'entreprise). */
async function deposerJustificatif(ctx: Ctx, cv: ContexteConvention, f: FormDataEntryValue | null): Promise<string | null | { erreur: string }> {
  if (!(f instanceof File) || f.size === 0) return null;
  const r = await enregistrerFichier(ctx.etab.id, f);
  if (typeof r === "string") return { erreur: r };
  const [doc] = await db.insert(schema.documents).values({
    etablissementId: ctx.etab.id, eleveId: cv.e.id, stageId: cv.s.id, anneeScolaire: cv.c.anneeScolaire, classeLibelle: cv.c.libelle,
    type: "justificatif", nomFichier: r.nom, cleStockage: r.cle, typeMime: r.mime, taille: r.taille,
    deposeParId: ctx.user.id, statut: "valide", valideParId: ctx.user.id, valideLe: new Date(),
  }).returning({ id: schema.documents.id });
  return doc.id;
}

const Signalement = z.object({
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début de l'absence manquante"),
  fin: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  commentaire: z.string().trim().max(500).optional(),
  motif: z.union([z.enum(MOTIFS_ABSENCE), z.literal("")]).optional(),
  justification: z.string().trim().max(500).optional(),
});

/** Signaler une absence : le tuteur, la famille (ou l'élève majeur), ou la gestion des PFMP. */
export async function signalerAbsence(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const cv = await chargerConvention(ctx, z.string().uuid().parse(fd.get("stageId")));
  if (!cv) return { erreur: "Stage introuvable." };
  const droits = await droitsAbsences(ctx, cv);
  if (!droits.signaler) return { erreur: "Vous ne pouvez pas signaler d'absence pour ce stage." };
  const p = Signalement.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const debut = p.data.debut, fin = p.data.fin || p.data.debut;
  if (fin < debut) return { erreur: "La fin de l'absence est avant son début." };
  if (debut < cv.p.debut || fin > cv.p.fin) return { erreur: `L'absence doit se situer pendant le stage, du ${dateCourte(cv.p.debut)} au ${dateCourte(cv.p.fin)}.` };
  if (droits.signaler === "entreprise" && debut > aujourdhui()) return { erreur: "Le tuteur signale une absence constatée : la date ne peut pas être dans le futur." };
  const jours = joursDAbsence(cv.s.horaires, { debut, fin });
  if (!jours) return { erreur: "Aucun jour de stage n'est prévu à ces dates (jours de repos)." };
  const existantes = await db.select().from(schema.absences).where(eq(schema.absences.stageId, cv.s.id));
  if (existantes.some((x) => x.debut <= fin && x.fin >= debut)) return { erreur: "Une absence est déjà signalée sur ces dates. Vous pouvez la justifier ci-dessous." };

  const peutJustifier = droits.justifier && !!p.data.motif;
  const doc = peutJustifier ? await deposerJustificatif(ctx, cv, fd.get("fichier")) : null;
  if (doc && typeof doc === "object") return doc;
  const [abs] = await db.insert(schema.absences).values({
    etablissementId: ctx.etab.id, stageId: cv.s.id, eleveId: cv.e.id, debut, fin, origine: droits.signaler,
    signaleParId: ctx.user.id, commentaire: p.data.commentaire || null,
    ...(peutJustifier ? { motif: p.data.motif || null, justification: p.data.justification || null, justifieeLe: new Date(), justifieeParId: ctx.user.id, documentId: doc } : {}),
  }).returning();
  await journaliser(ctx, "absence_signalee", "eleve", cv.e.id, { debut, fin, origine: droits.signaler, justifiee: peutJustifier });

  // Qui prévenir : la vie scolaire, le référent et la gestion ; la famille quand l'absence vient du tuteur ou du lycée.
  const qui = { entreprise: `Le tuteur de ${cv.ent.nom}`, famille: `${ctx.user.prenom} ${ctx.user.nom}`, lycee: `${ctx.user.prenom} ${ctx.user.nom} (lycée)` }[droits.signaler];
  const eleve = `${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle})`;
  const quand = texteDates(debut, fin);
  const etat = abs.justifieeLe ? `Motif indiqué : ${abs.motif}${abs.justification ? ` (${abs.justification})` : ""}.` : "L'absence n'est pas encore justifiée.";
  const equipe = await equipeAPrevenir(ctx, cv.e);
  let n = await alerter(ctx, equipe, {
    sujet: `Absence en stage : ${eleve}`, eleveId: cv.e.id, entrepriseId: cv.ent.id,
    corps: (prenom) => `Bonjour ${prenom},\n\n${qui} signale l'absence de ${eleve} en stage chez ${cv.ent.nom} ${quand} (${jours} jour${jours > 1 ? "s" : ""} de stage).${abs.commentaire ? `\nCommentaire : ${abs.commentaire}` : ""}\n${etat}\n\n${ctx.etab.nom}`,
  });
  const majeur = (ageAu(cv.e.dateNaissance, debut) ?? 0) >= 18;
  if (droits.signaler !== "famille" && !majeur) {
    const parents = (await responsablesDe(cv.e.id)).filter((u) => u.id !== ctx.user.id);
    n += await alerter(ctx, parents, {
      sujet: `Absence de ${cv.e.prenom} en stage`, eleveId: cv.e.id, entrepriseId: cv.ent.id,
      corps: (prenom) => `Bonjour ${prenom},\n\n${qui} signale l'absence de ${cv.e.prenom} ${cv.e.nom} en stage chez ${cv.ent.nom} ${quand}.${abs.commentaire ? `\nCommentaire : ${abs.commentaire}` : ""}\nMerci de justifier cette absence sur Cap PFMP (motif et, si possible, justificatif).\n\n${ctx.etab.nom}`,
    });
  }
  rafraichir(cv.e.id);
  revenirAvec(fd, `Absence enregistrée (${jours} jour${jours > 1 ? "s" : ""} de stage). ${n ? `${n} personne${n > 1 ? "s" : ""} prévenue${n > 1 ? "s" : ""}.` : ""}`);
}

const Justification = z.object({
  motif: z.enum(MOTIFS_ABSENCE, { error: "Choisissez le motif de l'absence." }),
  justification: z.string().trim().max(500).optional(),
});

/** Justifier une absence : la famille (ou l'élève majeur), ou la gestion des PFMP qui a reçu le justificatif. */
export async function justifierAbsence(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("absenceId"));
  const [abs] = await db.select().from(schema.absences).where(and(eq(schema.absences.id, id), eq(schema.absences.etablissementId, ctx.etab.id))).limit(1);
  if (!abs) return { erreur: "Absence introuvable." };
  const cv = await chargerConvention(ctx, abs.stageId);
  if (!cv || !(await droitsAbsences(ctx, cv)).justifier) return { erreur: "Vous ne pouvez pas justifier cette absence." };
  const p = Justification.safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const doc = await deposerJustificatif(ctx, cv, fd.get("fichier"));
  if (doc && typeof doc === "object") return doc;
  await db.update(schema.absences).set({
    motif: p.data.motif, justification: p.data.justification || null, justifieeLe: new Date(), justifieeParId: ctx.user.id,
    ...(doc ? { documentId: doc } : {}),
  }).where(eq(schema.absences.id, id));
  await journaliser(ctx, "absence_justifiee", "eleve", cv.e.id, { absenceId: id, motif: p.data.motif });
  const dest = await equipeAPrevenir(ctx, cv.e, { gestion: false });
  await alerter(ctx, dest, {
    sujet: `Absence justifiée : ${cv.e.prenom} ${cv.e.nom} (${cv.c.libelle})`, eleveId: cv.e.id,
    corps: (prenom) => `Bonjour ${prenom},\n\nL'absence de ${cv.e.prenom} ${cv.e.nom} en stage ${texteDates(abs.debut, abs.fin)} est justifiée par ${ctx.user.prenom} ${ctx.user.nom}.\nMotif : ${p.data.motif}${p.data.justification ? ` (${p.data.justification})` : ""}.${doc ? "\nUn justificatif est joint au dossier de l'élève." : ""}\n\n${ctx.etab.nom}`,
  });
  rafraichir(cv.e.id);
  revenirAvec(fd, "Absence justifiée. La vie scolaire et le professeur référent sont prévenus.");
}

/** Retirer une absence signalée par erreur : la personne qui l'a signalée, ou la gestion des PFMP. */
export async function retirerAbsence(fd: FormData) {
  const ctx = await contexte();
  const id = z.string().uuid().parse(fd.get("absenceId"));
  const [abs] = await db.select().from(schema.absences).where(and(eq(schema.absences.id, id), eq(schema.absences.etablissementId, ctx.etab.id))).limit(1);
  if (!abs) return;
  const [e] = await db.select().from(schema.eleves).where(eq(schema.eleves.id, abs.eleveId)).limit(1);
  if (!e || (abs.signaleParId !== ctx.user.id && !(await peutGererEleve(ctx, e)))) return;
  await db.delete(schema.absences).where(eq(schema.absences.id, id));
  await journaliser(ctx, "absence_retiree", "eleve", e.id, { debut: abs.debut, fin: abs.fin });
  rafraichir(e.id);
  revenirAvec(fd, "Absence retirée.");
}
