import "server-only";
import type { Contexte } from "./auth";
import { a, estGestionnaire, idsElevesReferent, peutAdministrer, peutSignerOrdreMission } from "./acces";
import { aLAgent } from "./agents";

export type Lien = { href: string; libelle: string };

/** Onglets affichés selon les rôles et l'organisation du lycée. */
export async function liensPour(ctx: Contexte): Promise<Lien[]> {
  const l: Lien[] = [];
  const gestion = await estGestionnaire(ctx);
  const tousLesProfs = gestion || a(ctx, "professeur", "direction");
  if (gestion) {
    l.push({ href: "/", libelle: "Tableau de bord" });
    l.push({ href: "/eleves", libelle: "Élèves" });
  }
  if (tousLesProfs) l.push({ href: "/entreprises", libelle: "Entreprises" });
  if (gestion) {
    l.push({ href: "/documents", libelle: "Documents" });
    l.push({ href: "/allocations", libelle: "Allocations" });
    l.push({ href: "/visites", libelle: "Visites" });
    l.push({ href: "/campagne", libelle: "Campagne" });
  }
  if (a(ctx, "direction") || peutSignerOrdreMission(ctx)) l.push({ href: "/a-signer", libelle: "À signer" });
  const referent = a(ctx, "professeur") && !gestion && (await idsElevesReferent(ctx)).length > 0;
  if (referent) l.push({ href: "/mes-eleves", libelle: "Mes élèves" });
  // Agent 1, Cap Admin : les mails qu'il prépare sont validés par le référent de l'élève ou la gestion des PFMP.
  if (gestion || referent || a(ctx, "direction", "gestionnaire")) l.push({ href: "/mails-a-valider", libelle: "Mails à valider" });
  if (a(ctx, "professeur")) l.push({ href: "/mes-visites", libelle: "Mes visites" });
  if (gestion) {
    l.push({ href: "/classes", libelle: "Classes" });
    l.push({ href: "/messages", libelle: "Messages" });
  }
  if (peutAdministrer(ctx)) {
    l.push({ href: "/equipe", libelle: "Équipe" });
    l.push({ href: "/organisation", libelle: "Organisation" });
  }
  // Listes à exporter (Excel, PDF) : la gestion des PFMP toutes, le professeur celles de ses classes.
  if (gestion || a(ctx, "direction", "gestionnaire", "professeur")) l.push({ href: "/listes", libelle: "Listes" });
  if (peutAdministrer(ctx) && aLAgent(ctx.etab.reglages, "veille")) l.push({ href: "/veille", libelle: "Veille" });
  if (a(ctx, "admin")) l.push({ href: "/admin", libelle: "Administration" });
  if (a(ctx, "vie_scolaire")) l.push({ href: "/vie-scolaire", libelle: "Vie scolaire" });
  if (a(ctx, "eleve")) l.push({ href: "/mon-stage", libelle: "Mon stage" });
  if (a(ctx, "parent")) l.push({ href: "/mon-enfant", libelle: "Mon enfant" });
  if (a(ctx, "entreprise")) l.push({ href: "/stagiaires", libelle: "Mes stagiaires" });
  if (!l.length) l.push({ href: "/", libelle: "Accueil" });
  // Le calendrier des PFMP est visible par tous (décision d'Anissa).
  l.push({ href: "/calendrier", libelle: "Calendrier" });
  // Formation incluse : lycée d'entraînement, missions, quiz et attestation, pour l'équipe du lycée.
  if (a(ctx, "direction", "gestionnaire", "professeur", "vie_scolaire")) l.push({ href: "/formation", libelle: "Formation" });
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
  vie_scolaire: "Vie scolaire",
  eleve: "Élève",
  parent: "Responsable légal",
  entreprise: "Entreprise",
  admin: "Administrateur",
};
