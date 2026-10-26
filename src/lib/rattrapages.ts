import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";
import { alerter, equipeAPrevenir } from "./alertes";
import { dateLongue } from "./dates";

type Periode = typeof schema.periodes.$inferSelect;
type Eleve = typeof schema.eleves.$inferSelect;
type Entreprise = typeof schema.entreprises.$inferSelect;

async function libelleClasse(e: Eleve) {
  if (!e.classeId) return "";
  const [c] = await db.select({ l: schema.classes.libelle }).from(schema.classes).where(eq(schema.classes.id, e.classeId)).limit(1);
  return c?.l ?? "";
}

/**
 * Prévient la vie scolaire (et le référent, la gestion des PFMP) qu'un élève sera en stage hors des périodes de sa classe :
 * à la création du rattrapage, quand ses dates changent, quand il est annulé, et quand son lieu de stage est connu.
 */
export async function alerterRattrapage(ctx: Contexte, e: Eleve, p: Periode, evenement: "programme" | "modifie" | "annule" | "lieu", ent?: Entreprise) {
  const classe = await libelleClasse(e);
  const qui = `${e.prenom} ${e.nom}${classe ? ` (${classe})` : ""}`;
  const dates = `du ${dateLongue(p.debut)} au ${dateLongue(p.fin)}`;
  const sujets = {
    programme: `Rattrapage de PFMP : ${qui}, ${dates}`,
    modifie: `Rattrapage de PFMP modifié : ${qui}, ${dates}`,
    annule: `Rattrapage de PFMP annulé : ${qui}`,
    lieu: `Lieu du rattrapage de ${qui}`,
  };
  const texte = {
    programme: `${qui} fera un stage de rattrapage ${dates}, en dehors des périodes prévues pour sa classe. Pendant ces dates, l'élève sera en entreprise et non au lycée.`,
    modifie: `Les dates du stage de rattrapage de ${qui} ont changé : il aura lieu ${dates}. Pendant ces dates, l'élève sera en entreprise et non au lycée.`,
    annule: `Le stage de rattrapage de ${qui}, prévu ${dates}, est annulé : l'élève suit les cours normalement.`,
    lieu: `${qui} fera son stage de rattrapage ${dates} chez ${ent?.nom ?? ""}${ent?.ville ? ` (${ent.ville})` : ""}.${ent?.tuteurNom ? ` Tuteur : ${ent.tuteurNom}${ent.telephone ? `, ${ent.telephone}` : ""}.` : ""}`,
  };
  const dest = await equipeAPrevenir(ctx, e);
  return alerter(ctx, dest, {
    sujet: sujets[evenement], eleveId: e.id, entrepriseId: ent?.id,
    corps: (prenom) => `Bonjour ${prenom},\n\n${texte[evenement]}${p.motif && evenement !== "lieu" ? `\nMotif : ${p.motif}.` : ""}\n\nInformation transmise par ${ctx.user.prenom} ${ctx.user.nom}.\n${ctx.etab.nom}`,
  });
}
