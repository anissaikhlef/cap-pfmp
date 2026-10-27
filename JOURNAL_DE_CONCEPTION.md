# Journal de conception de Cap PFMP

Ce journal consigne, avec leur date, les décisions de conception prises par **Anissa Ikhlef**, porteuse du projet. Il sert à garder la trace de qui a décidé quoi et pourquoi, d'une séance de travail à l'autre.

Les décisions sont celles d'Anissa Ikhlef. Le code est écrit avec l'aide de l'assistant Claude (Anthropic), sous sa direction.

---

## 26 octobre 2026 : rôles des acteurs et évolutions de l'application

Séance de travail du 26/10/2026, à partir de 22 h 47 (heure de Paris). Anissa Ikhlef décrit le rôle de chaque acteur, puis répond, une question à la fois, aux questions de l'assistant. Elle transmet aussi les modèles de documents de son lycée.

### Rôle de chaque acteur (description d'Anissa Ikhlef)

| Acteur | Rôle |
| --- | --- |
| DDFPT | Donne les accès. Collecte les documents pour l'attribution des allocations. Met à jour, si nécessaire, les modèles de convention, d'attestation, de livret de compétences et d'ordre de mission. Répartit le nombre de visites de stage entre les enseignants du général et du professionnel, selon les périodes prévues et les heures de face à face de chaque professeur dans la classe. Certaines de ces tâches doivent être confiées à un assistant IA. |
| Élèves | Envoient leur CV et leur lettre de motivation aux entreprises, signent les conventions, renseignent les tâches effectuées en stage. |
| Parents | Signent les conventions et justifient les absences de leurs enfants en stage. |
| Entreprises | Donnent le nombre de places d'accueil disponibles, signent les conventions, renseignent l'attestation et le livret de compétences. |
| Professeur référent | Aide les élèves à trouver un stage, vérifie et signe les conventions, vérifie les attestations et les livrets de compétences. Certaines de ces tâches doivent être confiées à un assistant IA. |
| Professeurs du professionnel et du général | Font les visites de stage, rédigent les comptes rendus, complètent les ordres de mission. |
| Vie scolaire (nouveau) | À ajouter : la vie scolaire n'est parfois pas au courant des élèves qui rattrapent une période en dehors des périodes prévues. |

Principe conservé : chaque lycée s'organise à sa façon. Quand un lycée confie la gestion des PFMP au référent ou au bureau des entreprises plutôt qu'au DDFPT, les tâches décrites ici pour le DDFPT reviennent à cette personne.

### Décisions

1. **Allocations PFMP.** Pièces à collecter : RIB, attestation de stage, pièce d'identité. L'application compte le nombre de jours effectués par semaine. Elle ne calcule pas le montant.
2. **Modèles de documents.** Les deux possibilités sont proposées pour chaque modèle (convention, attestation, livret, ordre de mission) :
   - un **formulaire en ligne**, dont les réponses sont écrites sur le PDF d'origine du lycée, pour un résultat identique au modèle ;
   - un **PDF modifiable** déposé par le DDFPT, dont l'application remplit les champs automatiquement.
3. **Répartition des visites.** L'assistant IA propose le **nombre de visites** de chaque professeur, en proportion de ses heures de face à face dans la classe. Le DDFPT valide. Ensuite, **chaque professeur choisit lui-même ses lieux de stage**, jusqu'à atteindre son nombre de visites.
4. **Heures de face à face.** Deux possibilités : saisie à la main (tableau professeur × classe) ou import d'un fichier tiré de l'emploi du temps.
5. **CV et lettre de motivation.** La relecture peut être faite par le référent ou par l'assistant IA. L'élève envoie ensuite son CV et sa lettre **depuis l'application**, et l'envoi est ajouté à ses démarches.
6. **Absences en stage.** Le tuteur ou le parent signale l'absence, et le parent la justifie. Sont prévenus : la vie scolaire, le référent, le DDFPT, et le parent quand c'est le tuteur qui signale. Les jours d'absence sont retirés des jours effectués.
7. **Ordre de mission.** Le professeur le complète d'après le modèle du lycée (appel au tuteur en semaine 1, mode de transport, date de visite, commentaires, attitudes professionnelles). Il est signé **avant** la visite.
8. **Vie scolaire.** Elle consulte les élèves en stage chaque jour, les rattrapages et les absences. Elle peut ajouter une note sur un élève. Elle reçoit une alerte quand un élève rattrape un stage.
9. **Rattrapages.** Créés par le DDFPT ou par le référent. Un rattrapage se passe comme un stage normal : convention, contrôle des règles, visite, attestation.
10. **Assistant IA.** Il agit seul sur les tâches simples (relire un CV, rédiger une relance). Un humain valide les décisions importantes (répartition, validation de documents).
11. **Frais de visite.** L'application calcule les frais de chaque professeur (kilomètres × barème selon la puissance du véhicule, repas, nuitée) et prépare la demande de remboursement, validée par le DDFPT. Le barème est modifiable par chaque lycée.
12. **Signatures de la convention.**
    - l'élève signe toujours ;
    - le parent signe seulement si l'élève est mineur ;
    - le représentant de l'entreprise signe ;
    - le tuteur de stage signe s'il a été désigné ;
    - la direction peut signer à n'importe quel moment ;
    - **le professeur référent signe en dernier**, après avoir vérifié la convention.

    Ce choix est un réglage du lycée : un autre lycée peut garder la direction en dernier.
13. **Horaires.** Deux plages par jour (matin et après-midi), comme dans l'annexe pédagogique de la convention du lycée.
14. **Règles pour les élèves mineurs.** Elles sont contrôlées automatiquement : 8 h de travail par jour au maximum, pause de 30 minutes au-delà de 4 h 30, pas de travail de nuit dès 20 h pour les moins de 16 ans (22 h pour les 16-18 ans).

### Modèles transmis

Le 26/10/2026, Anissa Ikhlef a transmis cinq modèles de son lycée : la convention PFMP (PDF modifiable de 8 pages), le livret de stage et de compétences (19 pages), l'attestation de stage (version 2024), l'ordre de mission et rapport de visite, et l'annexe sur le remboursement des frais de déplacement.

Ces modèles contiennent des informations réelles sur le lycée. Ils ne sont **pas** versés dans ce dépôt. Le site de démonstration utilise des versions au nom d'un lycée fictif, construites sur le même principe.

### Ordre de travail retenu

1. **Lot 1** : vie scolaire, rattrapages, absences, heures de face à face et répartition des visites.
2. **Lot 2** : signatures, horaires en deux plages, règles pour les mineurs ; CV et lettre de motivation ; allocations.
3. **Lot 3** : modèles de documents (formulaires en ligne et PDF), livret, attestation, ordre de mission, frais de visite.
4. **Lot 4** : l'assistant IA.

Le travail sur le lot 1 a commencé dans la nuit du 26 au 27/10/2026, vers 0 h 15, à la demande d'Anissa Ikhlef (« commence »).

---

## 27 octobre 2026 : réalisation du lot 1

Lot réalisé dans la nuit du 26 au 27/10/2026 et mis en ligne sur le site de démonstration.

### Ce qui a été construit, d'après les décisions du 26/10

- **Vie scolaire** (décision 8) : nouveau rôle, créé dans « Équipe ». Son espace montre, pour le jour choisi, les élèves en stage (entreprise, horaires du jour, tuteur), les rattrapages en cours et à venir, les élèves dont la classe est en stage mais qui n'ont pas de lieu (attendus au lycée), et les absences en stage. Elle ajoute des notes sur un élève. Elle reçoit un mail à chaque rattrapage (programmé, modifié, annulé, lieu connu) et à chaque absence.
- **Rattrapages** (décision 9) : programmés depuis la fiche de l'élève par la gestion des PFMP ou par le professeur référent, avec le motif et la période rattrapée. Le rattrapage devient une période de l'élève : lieu de stage, convention, règles, visite et attestation comme pour un stage normal.
- **Absences en stage** (décision 6) : signalées par le tuteur ou la famille, justifiées par la famille (motif, précision, justificatif). Sont prévenus la vie scolaire, le référent, la gestion des PFMP, et la famille quand l'absence vient du tuteur ou du lycée. Les jours d'absence sont déduits des jours effectués, affichés semaine par semaine (base du futur dossier d'allocation, décision 1).
- **Répartition des visites** (décisions 3 et 4) : heures de face à face saisies à la main (tableau professeur × classe) ou importées d'un fichier de l'emploi du temps. Pour chaque période, l'application propose le nombre de visites de chaque professeur, en proportion de ses heures. La gestion ajuste et valide, puis chaque professeur choisit ses lieux de stage dans « Mes visites ». Ce mode se choisit dans « Organisation » ; l'ancien mode (répartition automatique) reste disponible pour les autres lycées.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **L'assistant IA n'est pas encore branché** (prévu au lot 4). Pour l'instant, la proposition du nombre de visites est un calcul : proportion exacte des heures, arrondie pour que le total corresponde au nombre de stages.
2. **Rattrapages et visites** : les rattrapages, propres à un élève, ne sont pas comptés dans les nombres de visites par professeur ; la gestion attribue directement leur visite.
3. **Un élève majeur** peut signaler et justifier lui-même ses absences, comme il signe seul sa convention.
4. **La gestion des PFMP** peut aussi enregistrer une absence ou une justification reçue par téléphone ou sur papier.
5. **Notes de suivi** : visibles par la vie scolaire, la gestion des PFMP, la direction et le professeur référent ; jamais par l'élève, sa famille ou l'entreprise.
6. **Confidentialité** : la vie scolaire ne voit ni les conventions, ni les livrets, ni les comptes rendus de visite ; seulement ce dont elle a besoin (présence, lieux, horaires, absences, justificatifs). L'entreprise ne voit jamais un justificatif d'absence. La double authentification est demandée à la vie scolaire, comme à la direction et à la gestion.
7. **Un jour effectué** est un jour où l'élève a des horaires prévus et n'est pas absent, quel que soit le nombre d'heures ce jour-là.
8. **Formulaires** : après un message d'erreur, les champs déjà remplis restent en place (auparavant, ils se vidaient).

---

## 27 octobre 2026 : décisions pour le lot 2

Réponses d'Anissa Ikhlef aux questions de l'assistant, une à une, puis « commence ».

1. **Deux modèles de signature** : la signature simple dans l'application (case « J'ai lu », puis bouton « Je signe ») et la signature manuscrite dessinée au doigt sur l'écran, qui apparaît sur le PDF de la convention.
2. **Qui choisit le modèle** : le lycée autorise l'un, l'autre ou les deux dans « Organisation » ; quand les deux sont autorisés, chaque signataire choisit au moment de signer. La signature sur papier avec dépôt du scan reste possible.
3. **Comment on signe** : ceux qui ont un compte signent depuis leur espace ; les autres (entreprise, tuteur, parfois les parents) reçoivent un lien personnel par mail ou par SMS, qui expire au bout de quelques jours.
4. **CV et lettre de motivation** : la relecture (par le référent, plus tard par l'assistant IA) est conseillée, pas obligatoire ; l'élève envoie quand il veut, depuis l'application.
5. **Pièces de l'allocation** (RIB, pièce d'identité) : déposées par la famille (le parent, ou l'élève majeur) ; le DDFPT peut aussi les déposer lui-même, **sans que les familles le sachent**, pour privilégier le dépôt par la famille. Les pièces sont gardées pour toute la scolarité et peuvent être remplacées.
6. **Relances à ne pas oublier** : les entreprises, pour qu'elles donnent leur nombre de places ; la signature de la convention ; les parents et les élèves, pour les documents.

Ordre de travail du lot 2 : signatures, horaires et règles des mineurs ; CV et lettre ; allocations ; relances.

## 27 octobre 2026 : une équipe d'agents IA (lot 4 élargi)

Anissa Ikhlef précise ce qu'elle attend de l'assistant IA :

- **Un agent administratif**, capable de comprendre les enjeux et immergé dans l'éducation : il identifie les opportunités et les affecte aux stagiaires, rédige les mails aux parties intéressées, établit le classement des priorités et détecte toute modification, comme une **veille réglementaire**.
- **Un agent de prospection et de partenariat avec les entreprises**, qui gère l'**agenda des rencontres**. Les rencontres sont ensuite finalisées par **une personne physique chargée des interactions**, en visio ou en face à face ; cette personne est aidée par **un agent qui s'occupe de ses courriels**.

Les questions de détail (sources des opportunités, validation humaine avant l'envoi des mails, coût, protection des données) seront posées après la livraison du lot 2.

---

## 27 octobre 2026 : réalisation du lot 2.1 (signatures, horaires, mineurs)

- **Deux modèles de signature** (décisions 1 et 2 du lot 2) : la signature simple et la signature dessinée au doigt, qui apparaît sur la convention. Le lycée choisit dans « Organisation » : simple, dessinée, ou les deux au choix du signataire.
- **Signature sans compte** (décision 3) : la gestion clique sur « Envoyer la convention aux signataires ». Ceux qui ont un compte reçoivent une invitation à signer dans leur espace ; les autres un lien personnel par mail, ou par SMS s'il n'y a pas d'adresse. Les relances avant le départ contiennent aussi ce lien.
- **Signataires** (décision 12 du 26/10) : élève, responsable légal si l'élève est mineur, représentant de l'entreprise, tuteur s'il est désigné, professeur référent, direction. Qui signe en dernier se règle dans « Organisation » : le professeur référent (lycée de démonstration) ou la direction. Le dernier signataire est prévenu par mail dès qu'il ne manque plus que lui.
- **Tuteur et représentant** : le tuteur est désigné pour chaque stage (repris de la fiche entreprise) ; le représentant qui signe pour l'entreprise est indiqué sur la fiche entreprise.
- **Horaires** (décision 13) : matin et après-midi pour chaque jour.
- **Élèves mineurs** (décision 14) : contrôle de l'article 10 de la convention du lycée.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Règles des mineurs** : en plus des trois règles validées le 26/10 (8 h par jour, pause après 4 h 30, nuit), les deux autres règles du même article 10 sont contrôlées : 14 h (moins de 16 ans) ou 12 h de repos entre deux journées, et 2 jours de repos consécutifs dont le dimanche. Le lycée peut désactiver ces contrôles.
2. **Compte jamais utilisé** : un parent dont le compte a été créé mais qui ne s'est jamais connecté reçoit lui aussi un lien personnel, pour ne pas être bloqué par le mot de passe.
3. **Lien personnel** : valable 7 jours, pour une seule signature ; une relance envoie un nouveau lien.
4. **Changement de tuteur** : comme un changement d'entreprise ou d'horaires, il efface les signatures déjà recueillies et annule les liens envoyés.
5. **Stage hors règles** : quand le référent signe en dernier, c'est sa signature qui est bloquée tant que le stage ne respecte pas les règles ; la direction peut signer avant lui.
6. **Compte de l'entreprise** : le tuteur qui a un compte peut signer à la fois pour l'entreprise et en tant que tuteur.

---

## 27 octobre 2026 : réalisation du lot 2.2 (CV et lettre de motivation)

- **Dépôt** (décision 4 du lot 2) : l'élève dépose son CV et sa lettre de motivation dans « Mon stage » ; une nouvelle version remplace celle qui n'avait pas encore été relue.
- **Relecture conseillée, jamais bloquante** : le professeur référent (ou la gestion des PFMP) donne son avis, « C'est bon » ou « À améliorer » avec un commentaire ; l'élève est prévenu par mail. Les CV à relire se retrouvent avec le filtre « CV à relire » et dans « À faire » du tableau de bord.
- **Envoi depuis l'application** : l'élève choisit une entreprise de l'annuaire du lycée (ou en indique une autre avec son adresse), écrit son message (un modèle est proposé avec les dates du stage) et joint son CV et sa lettre. L'envoi est ajouté à ses démarches.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Limite d'envoi** : 20 candidatures par élève et par jour, pour éviter les envois en masse.
2. **Confidentialité** : l'entreprise reçoit le CV et la lettre en pièces jointes du mail ; elle ne peut pas les ouvrir dans l'application.
3. **Adresse de réponse** : le mail indique l'adresse de l'élève pour que l'entreprise lui réponde directement.

## 27 octobre 2026 : réalisation du lot 2.3 (allocations de stage)

- **Pièces** (décisions 1 du 26/10 et 5 du lot 2) : le RIB et la pièce d'identité sont déposés par la famille (le responsable légal, ou l'élève majeur) dans son espace. La gestion des PFMP les vérifie (valider ou refuser avec un motif transmis à la famille). Les pièces sont gardées pour toute la scolarité et peuvent être remplacées.
- **Dépôt par le DDFPT, discret** : sur la fiche de l'élève, « Enregistrer une pièce reçue » permet d'enregistrer une pièce remise au lycée ; elle est vérifiée d'office. Rien ne l'indique aux familles, qui voient seulement que la pièce est vérifiée.
- **Jours effectués par semaine** (décision 1 du 26/10) : pour chaque stage de l'année, les jours effectués semaine par semaine, absences déduites. Aucun montant n'est calculé.
- **Écran « Allocations »** : l'état de chaque dossier (pièces, attestations de stage, jours effectués), des filtres (pièces manquantes, à vérifier, attestations attendues, dossiers complets) et un export pour tableur (une ligne par élève, stage et semaine).

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Dossier complet** : RIB et pièce d'identité vérifiés, et attestation de stage validée pour chaque stage terminé de l'année.
2. **Qui voit le RIB et la pièce d'identité** : seulement la gestion des PFMP, la direction, l'élève et ses responsables légaux. Les professeurs qui visitent l'élève, la vie scolaire et les entreprises ne les voient pas.
3. **Pièce refusée** : la famille reçoit le motif par mail et dépose une nouvelle pièce ; une pièce en cours de vérification n'est pas redemandée.
4. **Tableau de bord** : « À faire » signale les élèves qui ont un lieu de stage mais dont le RIB ou la pièce d'identité manque.

## 27 octobre 2026 : réalisation du lot 2.4 (relances automatiques)

D'après la décision 6 du lot 2 (« la relance de mail pour les entreprises pour nous donner le nombre de places, la signature de convention, relance parent et élève pour les documents »).

- **Places des entreprises** : chaque mail de la campagne de rentrée contient un lien personnel. L'entreprise indique, sans compte, combien d'élèves elle peut accueillir pour chaque classe, avec son nom et un commentaire. La réponse s'inscrit dans le suivi de la campagne, met à jour l'annuaire et les suggestions faites aux élèves, et la personne qui a lancé la campagne est prévenue par mail. Sans réponse, l'entreprise est relancée automatiquement 7 et 14 jours après l'envoi, avec un nouveau lien.
- **Signature de la convention** : relances 7 et 3 jours avant le départ (déjà en place), avec le lien personnel pour signer.
- **Documents des familles** : quand le RIB ou la pièce d'identité manque, la famille (le responsable légal, ou l'élève majeur) est relancée une fois par semaine, au plus 3 fois dans l'année. Le mail ne dit pas que le lycée peut déposer ces pièces lui-même.
- **Absences non justifiées** : la famille est relancée 2 et 7 jours après le signalement de l'absence.
- **Délais réglables** : tous ces jours se règlent dans « Organisation », rubrique « Relances automatiques » (une liste vide : pas de relance).

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Lien de la campagne** : valable 30 jours, il ne sert qu'une fois ; une nouvelle campagne annule les liens de la précédente. Pour modifier sa réponse, l'entreprise répond au mail du lycée.
2. **Relance des familles** : elle commence dès que l'élève a un lieu de stage dans l'année, et compte à nouveau à partir de 0 chaque année scolaire.
3. **Bouton « Envoyer les relances du jour »** : la campagne de rentrée, qui concerne tout le lycée, n'est relancée d'ici que par la direction ou la gestion de tout l'établissement ; les relances partent aussi seules chaque matin.

---

## 27 octobre 2026 : décisions après le lot 2 (formation incluse, agents IA, abonnement, accès, entreprises, calendrier)

Réponses d'Anissa Ikhlef aux questions de l'assistant, une à une, puis « commence ».

### Formation incluse

Demande d'Anissa : « une idée qui permet aux utilisateurs de comprendre l'outil comme une formation incluse ».

1. **Visite guidée** à la première connexion, adaptée à chaque rôle, et **bouton « ? »** sur chaque page.
2. **Lycée d'entraînement** : « très bien ».
3. **Missions, quiz et attestation de prise en main** : « oui, cette dernière apporte une plus-value ».

### Agents IA (lot 4)

1. **Rappels** : « automatisation en fonction du besoin : rappel élève chaque jour, rappel entreprise tous les trois jours ». Les rappels partent seuls.
2. **Autres mails qui concernent un élève** : validés par le professeur référent de la classe, « pour décharger le DDFPT » ; « le DDFPT peut valider si besoin ».
3. **Mails qui ne concernent aucun élève** (prospection, rendez-vous) : validés « selon l'organisation du lycée », au choix dans « Organisation » : le référent de la classe concernée, la personne chargée des relations avec les entreprises, ou le DDFPT.
4. **Recherche d'opportunités** : l'annuaire du lycée, les réponses à la campagne et des sources publiques gratuites (annuaire officiel des entreprises, « La bonne boîte » de France Travail).
5. **Données des élèves** : l'IA ne voit aucun nom ; l'application le remet au moment de la relecture. Pour relire un CV, l'IA reçoit le texte sans les coordonnées.
6. **Veille réglementaire** : une alerte avec un résumé et le lien vers le texte officiel, et des propositions de changements dans Cap PFMP, validées par une personne avant de s'appliquer.
7. **Abonnement** : « le fonctionnement ou pas des agents définira le montant de l'abonnement ». Trois niveaux : **Essentiel** (sans IA), **Plus** (agent administratif et veille réglementaire), **Complet** (tous les agents). Anissa règle le niveau de chaque lycée depuis un compte administrateur de Cap PFMP.
8. **Marque** : « je veux les vendre comme mes propres agents ». Les agents portent la marque Cap PFMP ; le fournisseur d'IA n'apparaît pas dans l'application.

### Documents (lot 3)

« Les documents peuvent être modifiés en fonction des lycées » : pour chaque document, le lycée choisit son propre PDF, rempli à l'identique, ou le modèle Cap PFMP qu'il adapte dans l'application (textes, logo, rubriques).

### Accès et droits

1. **Comptes et mots de passe** : « seul le DDFPT gère la création des mots de passe et des accès » (la direction garde tous les droits). Un générateur crée les comptes d'une classe et imprime une fiche de connexion par élève et par parent ; une connexion par lien envoyé par mail évite le mot de passe.
2. **Documents reçus sur papier ou par courrier** : déposés par « le DDFPT ou le professeur référent ».
3. **Calendrier des PFMP** : « une rubrique qui renferme toutes les dates de PFMP de toutes les classes du lycée, visible pour tous, non modifiable que par le DDFPT ».
4. **Rattrapages** : « visibles pour le DDFPT, la famille, la vie scolaire et les professeurs de la classe de l'élève ».

### Entreprises

1. **Entreprises qui ne se connectent pas** : un lien personnel pour remplir et signer l'attestation et le livret, ou déposer le scan ; pendant la visite, le professeur fait signer le tuteur sur son téléphone ou photographie le document signé ; le DDFPT ou le référent dépose ce qui arrive par courrier.
2. **Mails aux entreprises qui accueillent les élèves** : les deux, un message groupé écrit par le DDFPT, et des mails automatiques (accueil avant le stage, remerciements à la fin avec le lien pour l'attestation et le livret).
3. **Classement** : « un outil qui permet de classer et d'identifier les entreprises qui jouent le jeu et de bannir celles avec qui les élèves ont eu un souci ».

### Couleurs

Les couleurs de la plateforme pourront être changées plus tard (couleurs de la marque ou propositions à comparer).

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Lycée d'entraînement** : un par membre de l'équipe (direction, gestion, professeurs, vie scolaire), remis à zéro à la demande ; on peut s'y mettre à la place d'un parent, d'un élève ou d'une entreprise ; rien n'en sort (aucun vrai message, données fictives, bandeau de couleur). Pour les élèves, les parents et les entreprises, la visite guidée suffit.
2. **Formation incluse dans les trois niveaux** d'abonnement.
3. **Rappels** : aucun le week-end ; le rappel quotidien de l'élève regroupe ce qui lui reste à faire et ne part que s'il reste quelque chose ; au plus 5 rappels à une entreprise pour une même demande, puis le lycée est prévenu pour l'appeler.
4. **Mails à valider** : une liste « Mails à valider » avec « Envoyer », « Modifier », « Ne pas envoyer » ; le DDFPT peut lire ceux des référents ; dans une classe sans référent, la personne qui gère les PFMP valide.
5. **Fournisseur d'IA** : engagé par contrat à ne pas utiliser les données pour entraîner ses modèles, indiqué aux lycées dans le contrat (RGPD) ; une mention « préparé avec… » prévient que le texte vient d'une IA (loi européenne sur l'IA).
6. **Veille réglementaire** : sources officielles seulement (Bulletin officiel, Légifrance, Éduscol) ; alertes à la direction et à la personne qui gère les PFMP.
7. **Abonnement** : un plafond d'usage par mois et par niveau protège la marge ; au-delà, l'agent s'arrête jusqu'au mois suivant, ou le lycée passe au niveau supérieur. Noms possibles des agents : « Cap Admin », « Cap Partenaires », « Cap Courrier », « Cap Veille », à déposer comme marques à l'INPI.
8. **Calendrier des PFMP** : les rattrapages n'y figurent pas ; un lien public, sans compte, peut être activé dans « Organisation ».
9. **Rattrapages** : les professeurs de la classe voient l'élève et les dates, pas le motif (souvent médical) ; un court mail les prévient quand un rattrapage est programmé.
10. **Entreprises** : une note de partenariat calculée à partir de faits (réponse à la campagne, conventions signées à temps, documents renvoyés, élèves accueillis au fil des années, avis du professeur après la visite), un badge « Partenaire fiable », visibles seulement par l'équipe ; un souci est signalé par le référent ou le DDFPT ; seul le DDFPT, ou la direction, écarte une entreprise, avec un motif interne et factuel.
11. **Mails d'accueil et de remerciement** : 3 jours avant le début du stage, et le lendemain de la fin ; jours réglables dans « Organisation ».

### Ordre de travail retenu

1. Ce journal. 2. Nouveaux rythmes de rappel. 3. Accès, droits du DDFPT, calendrier des PFMP et rattrapages. 4. Entreprises : mails, classement, entreprises écartées. 5. Lot 3 : modèles de documents.
Le résultat est présenté à Anissa avant 6. la formation incluse et 7. les agents IA.

## 27 octobre 2026 : réalisation de l'étape 2 (rythmes de rappel)

- **Élève, chaque jour** : un seul mail qui liste ce qui lui reste à faire. Il ne part que s'il reste quelque chose :
  - trouver son lieu de stage, à partir de 30 jours avant le début de la période ;
  - relancer les entreprises contactées sans réponse depuis 7 jours ;
  - déposer son CV ;
  - signer sa convention.
- **Entreprise, tous les 3 jours** tant qu'elle n'a pas répondu, au plus 5 fois pour une même demande, puis le lycée reçoit la liste des entreprises à appeler (avec leur numéro). Trois demandes : les places de la campagne de rentrée (depuis l'envoi), la signature de la convention (depuis son premier envoi) et l'attestation avec le livret (depuis la fin du stage).
- **Jamais de relance le samedi ni le dimanche** : une relance prévue ce jour-là part le lundi.
- **Réglages** dans « Organisation » : rappel quotidien des élèves (oui ou non) et début de la recherche, rythme et nombre de rappels des entreprises ; les jours avant le départ (convention) et après le signalement d'une absence restent réglables.
- **Signature sur papier** : un lycée qui signe ses conventions sur papier ne reçoit plus d'invitations à signer en ligne.
