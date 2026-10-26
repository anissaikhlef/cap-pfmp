import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "./auth";

/** Heures de face à face des professeurs dans les classes données. */
export async function heuresDesClasses(ctx: Contexte, classeIds: string[]) {
  if (!classeIds.length) return [];
  return db.select().from(schema.heuresClasses)
    .where(and(eq(schema.heuresClasses.etablissementId, ctx.etab.id), inArray(schema.heuresClasses.classeId, classeIds)));
}

/** Professeurs du lycée (comptes actifs ayant le rôle professeur), par ordre alphabétique. */
export async function professeursActifs(ctx: Contexte) {
  const tous = await db.select().from(schema.users)
    .where(and(eq(schema.users.etablissementId, ctx.etab.id), eq(schema.users.actif, true)))
    .orderBy(asc(schema.users.nom), asc(schema.users.prenom));
  return tous.filter((u) => u.roles.includes("professeur"));
}

/** Nombres de visites validés pour les périodes données. */
export async function quotasDesPeriodes(periodeIds: string[]) {
  if (!periodeIds.length) return [];
  return db.select().from(schema.quotasVisites).where(inArray(schema.quotasVisites.periodeId, periodeIds));
}

/** Nombres de visites validés pour un professeur, avec la période et la classe. */
export async function quotasDuProfesseur(ctx: Contexte, professeurId: string) {
  return db.select({ q: schema.quotasVisites, p: schema.periodes, c: schema.classes }).from(schema.quotasVisites)
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.quotasVisites.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .where(and(
      eq(schema.quotasVisites.professeurId, professeurId),
      eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire),
    ))
    .orderBy(asc(schema.periodes.debut), asc(schema.classes.libelle));
}
