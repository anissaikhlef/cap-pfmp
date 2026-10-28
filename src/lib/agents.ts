import type { Agent, Plafonds, Reglages, Tarifs } from "@/db/schema";

/**
 * Les agents IA de Cap PFMP (décision d'Anissa, 28 octobre 2026) : « l'agent 1 est obligatoire, le 2 et le 3, c'est le lycée
 * qui sélectionne ce qu'il veut » ; le prix dépend des agents choisis. Les agents portent la marque Cap PFMP. Fonctions pures.
 */
export const AGENTS: Record<Agent, { numero: 1 | 2 | 3; nom: string; role: string; detail: string; obligatoire: boolean }> = {
  administratif: {
    numero: 1, nom: "Cap Admin", role: "Agent administratif", obligatoire: true,
    detail: "Il repère chaque jour les situations qui demandent un mail (élève sans stage à l'approche de la période, absences répétées) et rédige les mails aux familles et aux entreprises. Rien ne part sans la validation d'une personne du lycée.",
  },
  veille: {
    numero: 2, nom: "Cap Veille", role: "Veille réglementaire", obligatoire: false,
    detail: "Il suit les textes officiels (Bulletin officiel, Légifrance, Éduscol) et vous envoie une alerte : un résumé, le lien vers le texte et ce qu'il faudrait changer dans Cap PFMP. Vous décidez de chaque changement.",
  },
  entreprises: {
    numero: 3, nom: "Cap Partenaires", role: "Recherche d'entreprises", obligatoire: false,
    detail: "Il propose à chaque élève sans stage des lieux de stage adaptés (annuaire du lycée, réponses à la campagne, annuaire public des entreprises) et relit les CV des élèves.",
  },
};
export const LISTE_AGENTS: Agent[] = ["administratif", "veille", "entreprises"];

/** Les agents d'un lycée : l'agent 1 toujours, les agents 2 et 3 s'il les a choisis. */
export function agentsDuLycee(r: Pick<Reglages, "agents">): Agent[] {
  return ["administratif", ...(r.agents.veille ? ["veille" as const] : []), ...(r.agents.entreprises ? ["entreprises" as const] : [])];
}

export const aLAgent = (r: Pick<Reglages, "agents">, agent: Agent) => agentsDuLycee(r).includes(agent);

/** La formule d'un lycée selon ses agents : agent 1 seul, avec l'agent 2, avec l'agent 3, ou les trois. */
export function formuleDe(r: Pick<Reglages, "agents">): keyof Tarifs {
  const { veille, entreprises } = r.agents;
  return veille && entreprises ? "complet" : veille ? "veille" : entreprises ? "entreprises" : "seul";
}

export const LIBELLES_FORMULES: Record<keyof Tarifs, string> = {
  seul: "Cap Admin",
  veille: "Cap Admin + Cap Veille",
  entreprises: "Cap Admin + Cap Partenaires",
  complet: "Les trois agents",
};

/** Le prix mensuel d'un lycée (en euros), selon les tarifs fixés par l'administration de Cap PFMP. */
export const prixMensuel = (tarifs: Tarifs, r: Pick<Reglages, "agents">) => tarifs[formuleDe(r)];

/** Le premier jour du mois d'une date « AAAA-MM-JJ », et le premier jour du mois suivant. */
export function moisDe(jour: string): { debut: string; suivant: string } {
  const [a, m] = jour.split("-").map(Number);
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { debut: `${jour.slice(0, 7)}-01`, suivant };
}

/** Il reste des demandes à l'agent ce mois-ci (plafond fixé par l'administration de Cap PFMP ; 0 : sans plafond). */
export const sousLePlafond = (plafonds: Plafonds, agent: Agent, utilisees: number) => !plafonds[agent] || utilisees < plafonds[agent];

export const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

/** Veille réglementaire : sources officielles seulement (Bulletin officiel, Légifrance, Éduscol, Service public, ministère du Travail). */
export const SOURCES_OFFICIELLES = ["education.gouv.fr", "legifrance.gouv.fr", "eduscol.education.fr", "service-public.fr", "travail-emploi.gouv.fr"];
export function sourceOfficielle(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SOURCES_OFFICIELLES.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
