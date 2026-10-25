import "server-only";
import type { Contexte } from "./auth";
import { a, estGestionnaire, peutAdministrer } from "./acces";

export type Lien = { href: string; libelle: string };

/** Onglets affichés selon les rôles et l'organisation du lycée. */
export async function liensPour(ctx: Contexte): Promise<Lien[]> {
  const l: Lien[] = [];
  const gestion = await estGestionnaire(ctx);
  if (gestion) {
    l.push({ href: "/", libelle: "Tableau de bord" });
    l.push({ href: "/eleves", libelle: "Élèves" });
    l.push({ href: "/classes", libelle: "Classes" });
  }
  if (peutAdministrer(ctx)) {
    l.push({ href: "/equipe", libelle: "Équipe" });
    l.push({ href: "/organisation", libelle: "Organisation" });
  }
  if (!gestion) l.unshift({ href: "/", libelle: "Accueil" });
  if (a(ctx, "eleve")) l.push({ href: "/mon-stage", libelle: "Mon stage" });
  if (a(ctx, "parent")) l.push({ href: "/mon-enfant", libelle: "Mon enfant" });
  if (a(ctx, "entreprise")) l.push({ href: "/stagiaires", libelle: "Mes stagiaires" });
  return dedoublonner(l);
}

function dedoublonner(l: Lien[]) {
  const vus = new Set<string>();
  return l.filter((x) => (vus.has(x.href) ? false : (vus.add(x.href), true)));
}

export const LIBELLES_ROLES: Record<string, string> = {
  direction: "Direction",
  gestionnaire: "Gestion des PFMP",
  professeur: "Professeur",
  eleve: "Élève",
  parent: "Responsable légal",
  entreprise: "Entreprise",
  admin: "Administrateur",
};
