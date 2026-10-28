import type { Profil } from "./aide";

/**
 * Formation incluse : les missions à réussir dans le lycée d'entraînement, le quiz, et ce qu'il faut pour l'attestation de
 * prise en main (décision d'Anissa : « cette dernière apporte une plus-value »). Fonctions pures, testées.
 */
export type Mission = { titre: string; comment: string; actions: string[] };
export type Question = { question: string; choix: string[]; bonne: number };

/** Note minimale au quiz pour l'attestation. */
export const REUSSITE_QUIZ = 4;

export const MISSIONS: Partial<Record<Profil, Mission[]>> = {
  gestion: [
    { titre: "Fixer les dates d'une PFMP", comment: "« Classes », une classe, « Ajouter la période ».", actions: ["periode_ajoutee", "periode_modifiee"] },
    { titre: "Préparer les fiches de connexion d'une classe", comment: "« Élèves », « Comptes et fiches de connexion ».", actions: ["fiches_connexion"] },
    { titre: "Envoyer une convention pour signature", comment: "La fiche d'un élève qui a un stage, « Envoyer pour signature ».", actions: ["convention_envoyee"] },
    { titre: "Faire signer une convention", comment: "Mettez-vous à la place de l'élève ou de l'entreprise (bandeau du haut), puis signez.", actions: ["convention_signee"] },
    { titre: "Adapter un modèle de document", comment: "« Organisation », « Modèles de documents ».", actions: ["modele_adapte", "modele_zones", "modele_pdf_depose"] },
    { titre: "Envoyer les relances du jour", comment: "« Tableau de bord », « Envoyer les relances du jour » (rien ne sort du lycée d'entraînement).", actions: ["relances_du_jour"] },
  ],
  professeur: [
    { titre: "Proposer des créneaux de visite", comment: "« Mes visites », la visite d'Inès TEST, « Envoyer à l'entreprise ».", actions: ["creneaux_proposes"] },
    { titre: "Noter l'appel de la première semaine", comment: "La page d'une visite, « Noter l'appel ».", actions: ["appel_tuteur"] },
    { titre: "Rédiger un compte rendu de visite", comment: "La visite passée d'Hugo FICTIF, « Compte rendu ».", actions: ["compte_rendu_enregistre"] },
    { titre: "Signaler un souci avec une entreprise", comment: "« Entreprises », une entreprise, « Signaler un souci ».", actions: ["souci_signale"] },
  ],
  vie_scolaire: [
    { titre: "Signaler une absence", comment: "« Vie scolaire », un élève en stage, « Signaler une absence ».", actions: ["absence_signalee"] },
    { titre: "Ajouter une note de suivi", comment: "La fiche d'un élève, « Notes de suivi ».", actions: ["note_ajoutee"] },
  ],
};

export const QUIZ: Partial<Record<Profil, Question[]>> = {
  gestion: [
    { question: "Qui fixe les dates des PFMP dans Cap PFMP ?", choix: ["Chaque professeur", "Le DDFPT et la direction", "Les entreprises"], bonne: 1 },
    { question: "Une convention est signée. Le lycée change ensuite son modèle de convention. Que devient la convention signée ?", choix: ["Elle garde le modèle avec lequel elle a été signée", "Elle prend le nouveau modèle", "Elle doit être signée de nouveau"], bonne: 0 },
    { question: "Une entreprise n'a pas de compte. Comment signe-t-elle la convention ?", choix: ["Elle doit créer un compte", "Avec le lien personnel reçu par mail", "Seulement sur papier"], bonne: 1 },
    { question: "Quand une attestation remplie en ligne arrive-t-elle « à vérifier » ?", choix: ["Toujours", "Quand les jours déclarés diffèrent de ceux de Cap PFMP", "Jamais"], bonne: 1 },
    { question: "En terminale, l'élève voit-il son livret de compétences ?", choix: ["Oui", "Non : c'est l'année d'examen", "Seulement ses parents"], bonne: 1 },
  ],
  professeur: [
    { question: "Comment l'entreprise choisit-elle le créneau de la visite ?", choix: ["Par téléphone uniquement", "En ligne, avec le lien reçu par SMS et par mail", "Elle ne le choisit pas"], bonne: 1 },
    { question: "Quand l'appel au tuteur se fait-il ?", choix: ["La première semaine du stage", "Après la visite", "Le dernier jour"], bonne: 0 },
    { question: "Pendant la visite, l'entreprise peut signer…", choix: ["Sur votre téléphone, avec le doigt", "Uniquement sur papier", "Jamais"], bonne: 0 },
    { question: "Un souci avec une entreprise : qui est prévenu quand vous le signalez ?", choix: ["Personne", "Le DDFPT et la direction", "L'entreprise"], bonne: 1 },
    { question: "Votre demande de frais de déplacement est calculée…", choix: ["Avec le barème de votre lycée", "Avec un barème national fixe", "À la main par le DDFPT"], bonne: 0 },
  ],
  vie_scolaire: [
    { question: "Qui peut signaler une absence en stage ?", choix: ["Seulement le lycée", "Le tuteur, la famille ou le lycée", "Personne"], bonne: 1 },
    { question: "Voyez-vous le motif d'un rattrapage ?", choix: ["Oui", "Non, jamais", "Seulement s'il est médical"], bonne: 0 },
    { question: "Une absence non justifiée : que fait Cap PFMP ?", choix: ["Rien", "Il relance la famille aux jours réglés par le lycée", "Il prévient l'entreprise"], bonne: 1 },
    { question: "Les notes de suivi sont-elles visibles par l'élève ?", choix: ["Oui", "Non, jamais", "Seulement par ses parents"], bonne: 1 },
    { question: "Où voyez-vous les élèves en stage aujourd'hui ?", choix: ["« Vie scolaire »", "« Messages »", "Nulle part"], bonne: 0 },
  ],
};

/** Les missions réussies : au moins une de leurs actions a été faite dans le lycée d'entraînement. */
export function missionsReussies(profil: Profil, faites: Set<string>): boolean[] {
  return (MISSIONS[profil] ?? []).map((m) => m.actions.some((a) => faites.has(a)));
}

/** La note du quiz : le nombre de bonnes réponses. */
export function noteQuiz(profil: Profil, reponses: (number | null)[]): number {
  return (QUIZ[profil] ?? []).reduce((n, q, i) => n + (reponses[i] === q.bonne ? 1 : 0), 0);
}

/** L'attestation de prise en main : toutes les missions réussies et le quiz réussi. */
export function attestationPossible(missions: boolean[], note: number | null): boolean {
  return missions.length > 0 && missions.every(Boolean) && note !== null && note >= REUSSITE_QUIZ;
}
