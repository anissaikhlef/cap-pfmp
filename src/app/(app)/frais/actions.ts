"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { chargerVisite } from "@/lib/visites";
import { journaliser } from "@/lib/journal";
import { envoyer } from "@/lib/messages";
import { revenirAvec } from "@/lib/retour";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { kmAvant } from "@/lib/frais";
import { calculFrais, euros } from "@/lib/regles";
import type { Etat } from "@/components/Formulaire";

const nombre = (max: number, message: string) => z.preprocess(
  (v) => (String(v ?? "").trim() === "" ? 0 : Number(String(v).trim().replace(/\s/g, "").replace(",", "."))),
  z.number({ error: message }).min(0, message).max(max, message),
);

/** Le professeur qui a fait la visite prépare sa demande de remboursement ; il la corrige tant qu'elle n'est pas validée. */
export async function demanderRemboursement(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const visiteId = z.string().uuid().parse(fd.get("visiteId"));
  const l = await chargerVisite(ctx, visiteId);
  if (!l?.v || l.v.visiteurId !== ctx.user.id) return { erreur: "Seul le professeur qui a fait la visite demande le remboursement de ses frais." };
  if (!l.v.date || l.v.date > aujourdhui()) return { erreur: "La demande se fait après la visite." };
  if (ctx.etab.reglages.ordreMission && l.v.ordreMission !== "signe") return { erreur: "L'ordre de mission doit d'abord être signé." };
  const b = ctx.etab.reglages.frais;
  const p = z.object({
    transport: z.enum(["vehicule", "commun"], { error: "Indiquez votre mode de transport." }),
    vehicule: z.string().optional(),
    km: nombre(2000, "Kilomètres : un nombre entre 0 et 2000."),
    peage: nombre(500, "Péage : un montant entre 0 et 500 €."),
    billets: nombre(2000, "Billets : un montant entre 0 et 2000 €."),
    repas: nombre(10, "Repas : un nombre entre 0 et 10.").pipe(z.number().int("Repas : un nombre entier.")),
    nuitees: nombre(10, "Nuitées : un nombre entre 0 et 10.").pipe(z.number().int("Nuitées : un nombre entier.")),
    zoneNuitee: z.string().optional(),
    commentaire: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  const enVehicule = v.transport === "vehicule";
  if (enVehicule && !b.kilometrique.length) return { erreur: "Votre lycée n'a pas encore saisi son barème kilométrique : prévenez la gestion des PFMP." };
  if (enVehicule && !b.kilometrique.some((x) => x.vehicule === v.vehicule)) return { erreur: "Choisissez votre véhicule dans le barème du lycée." };
  if (enVehicule && v.km <= 0) return { erreur: "Indiquez les kilomètres du trajet, aller et retour." };
  if (v.nuitees > 0 && !b.nuitees.some((x) => x.zone === v.zoneNuitee)) return { erreur: "Indiquez le lieu de la nuitée." };
  const [avant] = await db.select().from(schema.fraisDeplacement).where(eq(schema.fraisDeplacement.visiteId, visiteId)).limit(1);
  if (avant?.statut === "validee") return { erreur: "Cette demande est déjà validée." };
  const cumulAvant = enVehicule ? await kmAvant(ctx.user.id, l.v.date, avant ? { id: avant.id, createdAt: avant.createdAt } : undefined) : 0;
  const valeurs = {
    transport: v.transport, vehicule: enVehicule ? v.vehicule! : null, km: enVehicule ? v.km : 0, cumulAvant,
    peage: enVehicule ? v.peage : 0, billets: enVehicule ? 0 : v.billets, repas: v.repas, nuitees: v.nuitees, zoneNuitee: v.nuitees > 0 ? v.zoneNuitee! : null,
  };
  const c = calculFrais({ bareme: b, ...valeurs });
  const ligne = {
    ...valeurs, peage: Math.round(valeurs.peage * 100), billets: Math.round(valeurs.billets * 100), ...c,
    commentaire: v.commentaire || null, statut: "envoyee" as const, motifRefus: null, majLe: new Date(),
  };
  if (avant) await db.update(schema.fraisDeplacement).set(ligne).where(eq(schema.fraisDeplacement.id, avant.id));
  else await db.insert(schema.fraisDeplacement).values({ etablissementId: ctx.etab.id, visiteId, professeurId: ctx.user.id, date: l.v.date, ...ligne });
  await journaliser(ctx, "frais_demandes", "visite", visiteId, { total: c.total });
  for (const x of [`/visites/${visiteId}`, "/frais", "/mes-visites", "/"]) revalidatePath(x);
  revenirAvec(fd, `Demande de remboursement envoyée : ${euros(c.total)}. La gestion des PFMP la valide.`);
}

async function demandeDuLycee(ctx: Awaited<ReturnType<typeof contexte>>, id: string) {
  const [r] = await db.select({ f: schema.fraisDeplacement, u: schema.users, e: schema.eleves }).from(schema.fraisDeplacement)
    .innerJoin(schema.users, eq(schema.users.id, schema.fraisDeplacement.professeurId))
    .innerJoin(schema.visites, eq(schema.visites.id, schema.fraisDeplacement.visiteId))
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .where(and(eq(schema.fraisDeplacement.id, id), eq(schema.fraisDeplacement.etablissementId, ctx.etab.id))).limit(1);
  return r ?? null;
}

/** La gestion des PFMP (DDFPT) ou la direction valide la demande ; le professeur est prévenu. */
export async function validerFrais(fd: FormData) {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return;
  const x = await demandeDuLycee(ctx, z.string().uuid().parse(fd.get("id")));
  if (!x || x.f.statut !== "envoyee") return;
  await db.update(schema.fraisDeplacement).set({ statut: "validee", valideParId: ctx.user.id, valideLe: new Date(), motifRefus: null }).where(eq(schema.fraisDeplacement.id, x.f.id));
  await envoyer(ctx, {
    canal: "mail", destinataire: x.u.email, sujet: "Frais de déplacement : demande validée",
    corps: `Bonjour ${x.u.prenom},\n\nVotre demande de remboursement pour la visite du ${dateLongue(x.f.date)} (stage de ${x.e.prenom} ${x.e.nom}) est validée : ${euros(x.f.total)}.\n\n${ctx.etab.nom}`,
  });
  await journaliser(ctx, "frais_valides", "visite", x.f.visiteId, { total: x.f.total });
  for (const p of ["/frais", `/visites/${x.f.visiteId}`, "/"]) revalidatePath(p);
  revenirAvec(fd, `Demande validée : ${euros(x.f.total)}. ${x.u.prenom} ${x.u.nom} est prévenu(e).`);
}

export async function refuserFrais(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: "Seuls le DDFPT et la direction valident les frais." };
  const x = await demandeDuLycee(ctx, z.string().uuid().parse(fd.get("id")));
  if (!x || x.f.statut !== "envoyee") return { erreur: "Demande introuvable." };
  const motif = String(fd.get("motif") ?? "").trim().slice(0, 300);
  if (motif.length < 3) return { erreur: "Indiquez le motif : il est transmis au professeur." };
  await db.update(schema.fraisDeplacement).set({ statut: "refusee", motifRefus: motif, valideParId: ctx.user.id, valideLe: new Date() }).where(eq(schema.fraisDeplacement.id, x.f.id));
  await envoyer(ctx, {
    canal: "mail", destinataire: x.u.email, sujet: "Frais de déplacement : demande à reprendre",
    corps: `Bonjour ${x.u.prenom},\n\nVotre demande de remboursement pour la visite du ${dateLongue(x.f.date)} (stage de ${x.e.prenom} ${x.e.nom}) est à reprendre : ${motif}.\nVous pouvez la corriger depuis la page de la visite, dans Cap PFMP.\n\n${ctx.etab.nom}`,
  });
  await journaliser(ctx, "frais_refuses", "visite", x.f.visiteId, { motif });
  for (const p of ["/frais", `/visites/${x.f.visiteId}`, "/"]) revalidatePath(p);
  revenirAvec(fd, "Demande refusée. Le professeur est prévenu et peut la corriger.");
}
