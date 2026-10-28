import type { Role } from "@/db/schema";

/**
 * Formation incluse (décision d'Anissa : « comprendre l'outil comme une formation incluse ») : la visite guidée de la première
 * connexion, adaptée à chaque rôle, et l'aide « ? » de chaque page. Textes seulement : fonctions pures.
 */
export type Profil = "gestion" | "professeur" | "vie_scolaire" | "eleve" | "parent" | "entreprise";
export type Etape = { titre: string; texte: string; lien?: string };

/** Le profil de formation d'une personne : la gestion (direction, DDFPT) d'abord, puis son rôle principal. */
export function profilDe(roles: Role[]): Profil {
  if (roles.includes("direction") || roles.includes("gestionnaire") || roles.includes("admin")) return "gestion";
  if (roles.includes("professeur")) return "professeur";
  if (roles.includes("vie_scolaire")) return "vie_scolaire";
  if (roles.includes("entreprise")) return "entreprise";
  if (roles.includes("parent")) return "parent";
  return "eleve";
}

export const VISITES: Record<Profil, Etape[]> = {
  gestion: [
    { titre: "Bienvenue dans Cap PFMP", texte: "Cap PFMP suit les périodes de formation en milieu professionnel de votre lycée, de la recherche de stage aux documents de fin de stage. Cette visite dure deux minutes ; vous pouvez la revoir à tout moment avec le bouton « ? »." },
    { titre: "Le tableau de bord", texte: "Chaque matin, il montre ce qui attend une action : conventions à faire signer, documents à vérifier, élèves sans stage, relances du jour.", lien: "/" },
    { titre: "Votre organisation", texte: "Dans « Organisation », réglez qui gère les PFMP, qui visite, comment on signe, les rythmes des relances et le barème des frais. Rien n'est imposé : chaque lycée a sa façon de faire.", lien: "/organisation" },
    { titre: "Vos modèles de documents", texte: "Convention, ordre de mission, attestation, livret : gardez le modèle Cap PFMP adapté à votre lycée, ou déposez votre propre PDF et placez-y les zones d'un clic.", lien: "/organisation/documents" },
    { titre: "Les comptes", texte: "Le DDFPT crée les comptes d'une classe en un clic et imprime une fiche de connexion par élève et par parent, avec un QR code.", lien: "/eleves/acces" },
    { titre: "Pour vous entraîner", texte: "Votre lycée d'entraînement contient des élèves et des entreprises fictifs : essayez tout sans risque, rien n'en sort. Les missions et le quiz mènent à votre attestation de prise en main.", lien: "/formation" },
  ],
  professeur: [
    { titre: "Bienvenue dans Cap PFMP", texte: "Cap PFMP vous aide à suivre vos élèves en stage et à préparer vos visites. Cette visite dure une minute ; le bouton « ? » de chaque page la complète." },
    { titre: "Mes visites", texte: "Choisissez vos lieux de stage, proposez vos créneaux à l'entreprise (sur place ou à distance), notez l'appel de la première semaine et votre compte rendu.", lien: "/mes-visites" },
    { titre: "Pendant la visite", texte: "Sur votre téléphone, l'entreprise signe l'ordre de mission ; à la fin du stage, le tuteur remplit l'attestation et le livret avec vous et l'élève." },
    { titre: "Les entreprises", texte: "L'annuaire du lycée note chaque entreprise sur des faits. Signalez un souci : le DDFPT et la direction sont prévenus.", lien: "/entreprises" },
    { titre: "Pour vous entraîner", texte: "Votre lycée d'entraînement vous permet d'essayer sans risque. Les missions et le quiz mènent à votre attestation de prise en main.", lien: "/formation" },
  ],
  vie_scolaire: [
    { titre: "Bienvenue dans Cap PFMP", texte: "Vous voyez chaque jour les élèves en stage, leurs absences et les rattrapages programmés." },
    { titre: "Vie scolaire", texte: "Les absences signalées par les entreprises ou les familles arrivent ici ; suivez celles qui ne sont pas encore justifiées.", lien: "/vie-scolaire" },
    { titre: "Pour vous entraîner", texte: "Votre lycée d'entraînement et ses missions vous mènent à votre attestation de prise en main.", lien: "/formation" },
  ],
  eleve: [
    { titre: "Bienvenue", texte: "Cap PFMP t'accompagne pour ton stage, étape par étape : trouver une entreprise, signer la convention, pendant le stage, puis à la fin." },
    { titre: "Mon stage", texte: "Note les entreprises que tu contactes, dépose ton CV, signe ta convention en ligne. Chaque jour, un rappel te dit ce qui reste à faire.", lien: "/mon-stage" },
    { titre: "Pendant le stage", texte: "Remplis ton carnet de bord chaque jour : ton tuteur s'en sert pour ton livret de compétences." },
  ],
  parent: [
    { titre: "Bienvenue", texte: "Suivez le stage de votre enfant : la convention à signer, les dates, les absences à justifier et les pièces de l'allocation de stage." },
    { titre: "Mon enfant", texte: "Tout est sur une page. Vous recevez aussi un mail quand une action vous attend.", lien: "/mon-enfant" },
  ],
  entreprise: [
    { titre: "Bienvenue", texte: "Merci d'accueillir nos élèves. Ici, vous signez les conventions, signalez une absence et remplissez l'attestation et le livret à la fin du stage." },
    { titre: "Mes stagiaires", texte: "Chaque stagiaire a sa fiche : dates, horaires, visite du professeur, documents de fin de stage.", lien: "/stagiaires" },
  ],
};

/** L'aide « ? » de chaque page, choisie par le début de l'adresse (le plus long qui convient). */
const AIDE: { prefixe: string; titre: string; points: string[] }[] = [
  { prefixe: "/", titre: "Tableau de bord", points: ["Les nombres en couleur mènent à la liste des élèves concernés.", "« Envoyer les relances du jour » fait partir tout de suite les mails et SMS prévus aujourd'hui (ils partent aussi seuls chaque matin)."] },
  { prefixe: "/eleves", titre: "Élèves", points: ["Filtrez par classe ou par étape (sans stage, convention à signer, documents attendus…).", "La fiche d'un élève rassemble son stage, sa convention, ses absences, ses documents année par année."] },
  { prefixe: "/eleves/acces", titre: "Comptes et fiches de connexion", points: ["Un clic crée les comptes d'une classe et prépare une fiche par élève et par parent, avec un QR code.", "Chacun change son mot de passe à la première connexion ; un lien de connexion par mail évite le mot de passe."] },
  { prefixe: "/entreprises", titre: "Entreprises", points: ["La note sur 5 vient de faits : réponses, conventions signées à temps, documents rendus, avis après la visite.", "Un souci signalé compte dans la note ; seuls le DDFPT et la direction écartent une entreprise."] },
  { prefixe: "/documents", titre: "Documents", points: ["Les documents déposés ou remplis en ligne arrivent « à vérifier » : ouvrez, validez ou refusez avec un motif.", "Une attestation remplie en ligne n'arrive ici que si les jours déclarés diffèrent de ceux de Cap PFMP."] },
  { prefixe: "/allocations", titre: "Allocations de stage", points: ["Le dossier est complet quand le RIB, la pièce d'identité et l'attestation de chaque stage terminé sont validés.", "L'export ouvre un tableau des jours effectués, pour le service qui verse l'allocation."] },
  { prefixe: "/visites", titre: "Visites", points: ["Chaque élève en stage reçoit une visite ; la répartition suit les heures de face à face ou se fait automatiquement.", "La page d'une visite : rendez-vous, appel de la première semaine, ordre de mission, compte rendu, attestation, livret, frais."] },
  { prefixe: "/mes-visites", titre: "Mes visites", points: ["Prenez vos visites parmi celles qu'aucun collègue n'a prises : premier arrivé, premier servi. Les coordonnées de l'entreprise s'affichent aussitôt.", "Indiquez sur place, à distance ou à décider après l'appel au tuteur ; changez-le si besoin, puis proposez vos créneaux."] },
  { prefixe: "/frais", titre: "Frais de déplacement", points: ["Le montant suit le barème de votre lycée.", "Validez, ou renvoyez la demande avec un motif : le professeur la corrige."] },
  { prefixe: "/campagne", titre: "Campagne de rentrée", points: ["Un message à toutes les entreprises partenaires : elles indiquent leurs places en ligne, sans compte.", "Les entreprises sans réponse sont relancées aux rythmes réglés dans « Organisation »."] },
  { prefixe: "/a-signer", titre: "À signer", points: ["Les conventions et ordres de mission qui attendent votre signature.", "Une signature simple en un clic, ou dessinée au doigt, selon le choix du lycée."] },
  { prefixe: "/classes", titre: "Classes", points: ["Les dates de PFMP de chaque classe sont fixées par le DDFPT ou la direction.", "Un rattrapage se programme pour un seul élève, hors des périodes de sa classe."] },
  { prefixe: "/messages", titre: "Messages", points: ["Tous les mails et SMS partis de Cap PFMP, avec leur texte.", "Tant qu'aucun prestataire n'est branché, ils sont seulement enregistrés ici (« simulé »)."] },
  { prefixe: "/organisation", titre: "Organisation", points: ["Chaque réglage dit comment votre lycée travaille : rien n'est imposé.", "« Modèles de documents » : vos textes, votre logo, ou votre propre PDF."] },
  { prefixe: "/organisation/documents", titre: "Modèles de documents", points: ["Gardez le modèle Cap PFMP en l'adaptant, ou déposez votre PDF, même sans champs.", "Tracez les zones sur votre PDF à la souris, puis choisissez ce que Cap PFMP y écrit. Un document signé garde son modèle."] },
  { prefixe: "/equipe", titre: "Équipe", points: ["Les comptes de l'équipe : direction, gestion des PFMP, professeurs, vie scolaire.", "Les heures de face à face servent à répartir les visites."] },
  { prefixe: "/calendrier", titre: "Calendrier des PFMP", points: ["Toutes les dates de PFMP des classes du lycée, visibles par tous.", "Seuls le DDFPT et la direction les modifient."] },
  { prefixe: "/vie-scolaire", titre: "Vie scolaire", points: ["Les élèves en stage aujourd'hui, leurs absences et les rattrapages programmés."] },
  { prefixe: "/mon-stage", titre: "Mon stage", points: ["Les étapes de ton stage, dans l'ordre.", "Ton carnet de bord : note chaque jour ce que tu as fait."] },
  { prefixe: "/mon-enfant", titre: "Mon enfant", points: ["La convention à signer, les absences à justifier, les pièces de l'allocation à déposer."] },
  { prefixe: "/stagiaires", titre: "Mes stagiaires", points: ["Signez la convention, choisissez le créneau de la visite, signalez une absence.", "À la fin du stage, remplissez l'attestation et le livret en ligne, avec l'élève si possible."] },
  { prefixe: "/mails-a-valider", titre: "Mails à valider", points: ["Cap Admin, l'agent administratif, prépare les mails aux familles et aux entreprises : rien ne part sans vous.", "Envoyer, Modifier puis envoyer, ou Ne pas envoyer : les mails d'un élève sont validés par le référent de sa classe ou par la gestion des PFMP."] },
  { prefixe: "/veille", titre: "Veille réglementaire", points: ["Cap Veille résume chaque texte officiel sur les PFMP, avec le lien vers le texte.", "Pour chaque proposition, notez « C'est fait » ou « Pas pour nous » : rien ne change sans votre décision."] },
  { prefixe: "/organisation/formations", titre: "Pôles et formations", points: ["Les pôles de votre lycée, leurs formations en voie scolaire et les spécialités de chaque formation.", "Dans une classe, une spécialité peut partir en PFMP à d'autres dates : ajoutez sa période dans la page de la classe."] },
  { prefixe: "/organisation/agents", titre: "Agents IA", points: ["Cap Admin est inclus ; ajoutez Cap Veille et Cap Partenaires si votre lycée le souhaite.", "Le montant dépend des agents choisis ; un changement compte à partir du mois suivant."] },
  { prefixe: "/admin", titre: "Administration de Cap PFMP", points: ["Les montants de chaque formule et les plafonds d'usage des agents.", "« Veille réglementaire » : collez un texte officiel, relisez l'alerte préparée par Cap Veille, puis publiez-la."] },
  { prefixe: "/formation", titre: "Formation", points: ["Le lycée d'entraînement : des données fictives, rien n'en sort.", "Faites les missions, puis le quiz : votre attestation de prise en main est prête à imprimer."] },
];

export function aideDe(chemin: string) {
  return AIDE.filter((a) => chemin === a.prefixe || (a.prefixe !== "/" && chemin.startsWith(a.prefixe + "/")) || (a.prefixe === "/" && chemin === "/"))
    .sort((a, b) => b.prefixe.length - a.prefixe.length)[0] ?? null;
}
