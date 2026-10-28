"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { sourceOfficielle } from "@/lib/agents";
import { preparerAlerte, publierAlerte, veilleDeLaSemaine } from "@/lib/agent-veille";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import type { Etat } from "@/components/Formulaire";

/** L'administration de Cap PFMP (compte « admin ») : tarifs, plafonds, veille réglementaire. */
const admin = () => contexte({ roles: ["admin"] });

const montant = z.coerce.number().min(0, "Montant positif").max(100000);
const plafond = z.coerce.number().int().min(0, "Plafond positif").max(1000000);

export async function enregistrerTarifs(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await admin();
  const p = z.object({
    seul: montant, veille: montant, entreprises: montant, complet: montant,
    plafondAdministratif: plafond, plafondEntreprises: plafond,
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  const v = p.data;
  const tarifs = { seul: v.seul, veille: v.veille, entreprises: v.entreprises, complet: v.complet };
  const plafonds = { administratif: v.plafondAdministratif, veille: 0, entreprises: v.plafondEntreprises };
  await db.insert(schema.plateforme).values({ id: "cap-pfmp", tarifs, plafonds })
    .onConflictDoUpdate({ target: schema.plateforme.id, set: { tarifs, plafonds, majLe: new Date() } });
  await journaliser(ctx, "tarifs_modifies", "plateforme", "cap-pfmp", { tarifs, plafonds });
  revalidatePath("/", "layout");
  return { ok: "Tarifs et plafonds enregistrés. Les lycées voient les nouveaux montants dans « Organisation », « Agents IA »." };
}

export async function nouvelleAlerte(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await admin();
  const p = z.object({
    titre: z.string().trim().min(5, "Titre de l'alerte manquant").max(200),
    source: z.string().trim().url("Lien vers le texte officiel invalide"),
    texte: z.string().trim().min(80, "Collez le texte officiel (au moins quelques lignes).").max(40000, "Texte trop long : collez la partie qui concerne les PFMP."),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? "Valeurs invalides." };
  if (!sourceOfficielle(p.data.source)) return { erreur: "Cap Veille ne travaille qu'avec les sources officielles : Bulletin officiel (education.gouv.fr), Légifrance, Éduscol, Service public, ministère du Travail." };
  const r = await preparerAlerte(ctx.user.id, p.data);
  if (!r.ok) return { erreur: r.erreur };
  await journaliser(ctx, "veille_preparee", "alerte_veille", r.alerte.id);
  revalidatePath("/admin/veille");
  return { ok: "Cap Veille a préparé l'alerte : relisez-la, corrigez si besoin, puis publiez-la." };
}

export async function corrigerAlerte(fd: FormData) {
  const ctx = await admin();
  const p = z.object({
    id: z.string().uuid(), titre: z.string().trim().min(5).max(200), resume: z.string().trim().min(20, "Résumé trop court").max(3000),
    propositions: z.string().max(4000),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) revenirAvec(fd, p.error.issues[0]?.message ?? "Valeurs invalides.", "err");
  const propositions = p.data.propositions.split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter((x) => x.length >= 5).slice(0, 8);
  await db.update(schema.alertesVeille).set({ titre: p.data.titre, resume: p.data.resume, propositions })
    .where(and(eq(schema.alertesVeille.id, p.data.id), isNull(schema.alertesVeille.publieeLe)));
  await journaliser(ctx, "veille_corrigee", "alerte_veille", p.data.id);
  revalidatePath("/admin/veille");
  revenirAvec(fd, "Alerte corrigée.");
}

export async function publier(fd: FormData) {
  const ctx = await admin();
  const id = z.string().uuid().parse(fd.get("id"));
  const n = await publierAlerte(id);
  await journaliser(ctx, "veille_publiee", "alerte_veille", id, { mails: n });
  revalidatePath("/", "layout");
  revenirAvec(fd, `Alerte publiée pour les lycées qui ont Cap Veille (${n} mail(s) à la direction et à la gestion des PFMP).`);
}

export async function supprimerAlerte(fd: FormData) {
  const ctx = await admin();
  const id = z.string().uuid().parse(fd.get("id"));
  await db.delete(schema.alertesVeille).where(and(eq(schema.alertesVeille.id, id), isNull(schema.alertesVeille.publieeLe)));
  await journaliser(ctx, "veille_supprimee", "alerte_veille", id);
  revalidatePath("/admin/veille");
  revenirAvec(fd, "Brouillon d'alerte supprimé.");
}

/** Les pages officielles que Cap Veille lit chaque semaine (une adresse par ligne). */
export async function enregistrerSourcesVeille(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await admin();
  const pages = String(fd.get("pages") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  const refusees = pages.filter((x) => !sourceOfficielle(x));
  if (refusees.length) return { erreur: `Sources non officielles refusées : ${refusees.join(", ")}` };
  await db.insert(schema.plateforme).values({ id: "cap-pfmp", tarifs: { seul: 0, veille: 0, entreprises: 0, complet: 0 }, plafonds: { administratif: 400, veille: 0, entreprises: 300 }, veillePages: pages })
    .onConflictDoUpdate({ target: schema.plateforme.id, set: { veillePages: pages } });
  await journaliser(ctx, "veille_sources", "plateforme", "cap-pfmp", { pages });
  revalidatePath("/admin/veille");
  return { ok: pages.length ? `${pages.length} source(s) enregistrée(s) : Cap Veille les lit chaque semaine.` : "Sources par défaut : Cap Veille lit le Bulletin officiel chaque semaine." };
}

/** « Lire les sources maintenant » : Cap Veille passe tout de suite, sans attendre la semaine. */
export async function lireSourcesMaintenant(fd: FormData) {
  const ctx = await admin();
  const r = (await veilleDeLaSemaine({ maintenant: true }))!;
  await journaliser(ctx, "veille_lecture", "plateforme", "cap-pfmp", r);
  revalidatePath("/admin/veille");
  if (!r.lues) revenirAvec(fd, `Cap Veille n'a pu lire aucune source. ${r.echecs.join(" ; ")}.`, "err");
  if (r.erreur) revenirAvec(fd, `${r.preparees} alerte(s) préparée(s). ${r.erreur}`, "err");
  const detail = `${r.liens} lien(s) officiel(s) trouvé(s), dont ${r.surLesStages} sur les stages${r.echecs.length ? ` ; non lue(s) : ${r.echecs.join(" ; ")}` : ""}`;
  revenirAvec(fd, r.preparees ? `Cap Veille a préparé ${r.preparees} alerte(s) à relire (${detail}).` : `Cap Veille a lu ${r.lues} source(s) : aucun nouveau texte sur les stages (${detail}).`);
}
