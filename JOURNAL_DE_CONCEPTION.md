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

## 27 octobre 2026 : réalisation de l'étape 3 (accès, droits du DDFPT, calendrier, rattrapages)

- **Comptes et mots de passe réservés au DDFPT** (et à la direction) : création des comptes des élèves, des parents et des tuteurs, mots de passe provisoires. Les professeurs référents voient l'état des comptes, sans formulaire.
- **Comptes et fiches de connexion par classe** (« Élèves », bouton « Comptes et fiches de connexion ») : en un clic, le DDFPT crée les comptes des élèves qui ont une adresse e-mail, donne un nouveau mot de passe provisoire aux comptes jamais utilisés, et imprime une fiche par élève et par parent : adresse du site, identifiant, mot de passe provisoire, QR code qui ouvre la page de connexion avec l'identifiant déjà rempli. Les mots de passe ne sont affichés qu'une fois.
- **Connexion sans mot de passe** : « Me connecter sans mot de passe » sur la page de connexion. Un élève, un parent ou une entreprise reçoit un lien par mail, valable 15 minutes et une seule fois. L'équipe du lycée garde son mot de passe et sa double authentification.
- **Dépôt des documents papier** : le professeur référent peut déposer un document reçu sur papier ou par courrier (convention, attestation, livret), validé d'office, même quand le DDFPT gère les PFMP.
- **Calendrier des PFMP** (onglet « Calendrier », pour tous les comptes) : une frise de l'année et la liste de toutes les périodes de toutes les classes. Seuls le DDFPT et la direction fixent les dates.
- **Rattrapages** : visibles dans le calendrier par le DDFPT, la direction, la vie scolaire et les professeurs de la classe (référent et professeurs qui y ont déclaré des heures) ; la famille les voit dans son espace. Les professeurs de la classe reçoivent un mail quand un rattrapage est programmé, modifié ou annulé.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Lien de connexion** : au plus 3 liens par heure pour une même adresse ; la réponse ne dit jamais si l'adresse a un compte. Se connecter par lien rend inutilisable un mot de passe provisoire jamais changé : la personne continue par lien, ou demande un nouveau mot de passe au DDFPT.
2. **Fiches** : un élève sans adresse e-mail n'a pas de compte ; il est signalé pour que sa fiche soit complétée. Un parent de plusieurs élèves de la classe reçoit une seule fiche.
3. **Calendrier public** (« Organisation ») : désactivé par défaut ; activé, il montre les dates des classes, jamais un nom d'élève ni un rattrapage.
4. **Démonstration** : un compte DDFPT fictif (`ddfpt@demo.cap-pfmp.example`) ; les élèves du CAP ont une adresse e-mail pour essayer les fiches.

## 27 octobre 2026 : réalisation de l'étape 4 (entreprises)

- **Note de partenariat** (« Entreprises », visible seulement par l'équipe du lycée) : une note sur 5 calculée à partir de faits, avec ses raisons en clair : élèves accueillis au fil des années, réponse à la campagne de rentrée, conventions signées avant le départ, attestations et livrets rendus, avis du professeur après la visite (nouveau critère du compte rendu : « Accueil et encadrement par l'entreprise »). Badge « Partenaire fiable » ; filtres « Partenaires fiables » et « Écartées ».
- **Soucis** : depuis la fiche d'une entreprise, un professeur, le DDFPT ou la direction signale un souci (horaires, sécurité de l'élève, comportement, tâches sans rapport avec la formation, documents jamais rendus, autre), avec des faits. Le DDFPT et la direction sont prévenus par mail. Le souci compte dans la note.
- **Entreprises écartées** : seul le DDFPT, ou la direction, écarte une entreprise, avec un motif interne. Elle n'est plus proposée aux élèves, ne reçoit plus la campagne de rentrée et on ne peut plus y enregistrer de stage. « Lever l'écartement » la rétablit.
- **Message aux entreprises d'accueil** (« Entreprises », bouton « Écrire aux entreprises d'accueil ») : le DDFPT écrit en une fois à toutes les entreprises qui accueillent les élèves d'une période ; chacune reçoit son nom et la liste de ses élèves.
- **Mails automatiques** : un mail d'accueil au tuteur 3 jours avant le début du stage (dates, horaires, professeur référent à contacter), des remerciements le lendemain de la fin, avec un lien personnel pour déposer l'attestation et le livret s'ils manquent.
- **Dépôt sans compte** : avec ce lien, l'entreprise dépose les documents (PDF ou photo) depuis son ordinateur ou son téléphone ; ils arrivent dans les documents « à vérifier » du lycée. Les rappels suivants, et le rappel envoyé à la main depuis la fiche de l'élève, contiennent aussi un lien.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Calcul de la note** : élèves accueillis 20 points (12 la première année), campagne 15, conventions 25, documents 25, avis des professeurs 15 ; un point sans recul ne compte pas. Chaque souci retire 1,25 point sur 5. Pas de note tant que l'entreprise n'a accueilli aucun élève. L'attestation et le livret comptent deux semaines après la fin du stage. « Partenaire fiable » : 4 sur 5 au moins et aucun souci.
2. **Soucis** : jamais visibles de l'entreprise, des élèves ni des familles ; il est demandé de rester factuel (la personne concernée peut demander à consulter ce qui la concerne).
3. **Entreprise écartée** : les stages déjà enregistrés chez elle restent modifiables ; la décision se lève à tout moment.
4. **Mails d'accueil et de remerciement** : 3 jours avant et le lendemain (jamais le week-end), jours réglables ou désactivables dans « Organisation ». Un stage enregistré moins de 3 jours avant le départ reçoit le mail d'accueil le jour ouvré suivant, au plus tard le premier jour du stage. Les remerciements comptent comme la première demande de documents : ensuite, un rappel tous les 3 jours, 5 au plus, puis le lycée appelle.
5. **Lien de dépôt** : valable 30 jours et une seule fois ; il ne propose que les documents qui manquent. Un document refusé par le lycée est redemandé à l'entreprise, avec le motif et un nouveau lien.
6. **Démonstration** : une entreprise fictive écartée (« Vigil'Express ») et un souci signalé avec Garde Ouest Services.

## 27 octobre 2026 : lot 3, questions sur les documents

1. **Attestation et livret remplis en ligne** : « deux options : tuteur avec élève et prof quand c'est possible, ou tuteur et élève, et si ce n'est pas possible le tuteur seul ». Le document indique qui l'a rempli ; pendant la visite, le professeur peut le remplir avec le tuteur et l'élève sur son téléphone.
2. **Frais de visite** : « je t'avais donné le document et chaque lycée applique son calcul ». Aucun barème n'est imposé : chaque lycée recopie sa propre méthode, comme dans son annexe de remboursement. Par exemple, l'annexe transmise prévoit un barème kilométrique par tranches de kilomètres parcourus dans l'année, selon le véhicule (voiture, deux-roues, moto) et sa puissance, plafonné à une puissance donnée, le péage en plus, un billet de train hors de la région, un montant par repas et deux montants de nuitée selon le département.

### Ordre de travail du lot 3, proposé par l'assistant

1. Modèles de documents : pour chaque document, le modèle Cap PFMP adapté par le lycée (logo, textes, rubriques) ou le PDF du lycée rempli à l'identique ; d'abord la convention.
2. Ordre de mission et compte rendu de visite sur le modèle du lycée : appel au tuteur la première semaine, mode de transport, signature avant la visite, cachet ou signature de l'entreprise visitée, attitudes professionnelles.
3. Frais de visite : barème du lycée, demande de remboursement préparée par le professeur, validée par le DDFPT.
4. Attestation en ligne.
5. Livret de compétences en ligne : attitudes professionnelles, activités de chaque jour, grille de compétences du diplôme.

## 27 octobre 2026 : réalisation du lot 3.1 (modèles de documents, la convention d'abord)

- **Modèles de documents** (« Organisation », bouton « Modèles de documents ») : pour la convention, le lycée choisit le modèle Cap PFMP qu'il adapte (logo, titre, texte d'introduction, engagements, jusqu'à 5 rubriques ajoutées, pied de page) ou son propre PDF.
- **PDF du lycée rempli à l'identique** : le DDFPT dépose son « PDF modifiable ». Cap PFMP trouve ses champs et propose pour chacun une donnée d'après son nom (élève, classe, dates, entreprise, tuteur, professeur référent, horaires du matin et de l'après-midi, signatures). Le DDFPT vérifie et choisit : une donnée, un texte fixe, laisser vide, ou « à compléter en signant » par la famille ou par l'entreprise, avec la question à lui poser. Un aperçu montre où se trouve chaque champ, un autre le résultat avec un vrai stage ; un PDF d'exemple fictif permet d'essayer.
- **Listes déroulantes du PDF** : Cap PFMP choisit l'option qui correspond (classe « 2nde MS » : « 2nde bac pro »), ou n'en choisit aucune en cas de doute.
- **Signatures** : le nom et la date de chaque signataire ; la signature dessinée au doigt est placée juste au-dessus du nom ; une signature simple laisse la mention « Signé en ligne dans Cap PFMP le … ».
- **En signant**, la famille complète ses champs (téléphone, adresse…) et l'entreprise les siens (assureur, numéro de contrat…), depuis son compte ou avec son lien personnel.
- Quand le lycée utilise son PDF, la convention s'ouvre remplie dans ce PDF, pour tous ceux qui peuvent la voir.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Une convention signée ne change plus** : le modèle est figé à la première signature. Le lycée peut modifier son modèle sans toucher aux conventions déjà signées. Si le stage change et que les signatures sont effacées, la convention refaite suit le modèle du moment.
2. **Qui adapte les modèles** : le DDFPT et la direction.
3. **PDF accepté** : un PDF avec des champs à remplir (« PDF modifiable ») ; un PDF scanné, sans champs, n'est pas accepté pour l'instant.
4. **Une convention par période** : les champs prévus pour une deuxième période sont laissés vides, car chaque période a sa propre convention dans Cap PFMP.
5. **Champs complétés en signant** : facultatifs. Si l'entreprise du stage change, ses réponses sont effacées ; celles de la famille sont gardées.
6. **Affichage** : pour la sécurité du site, le PDF s'ouvre dans un nouvel onglet, sans être intégré à la page.

## 27 octobre 2026 : réalisation du lot 3.2 (ordre de mission et compte rendu de visite)

Sur le modèle transmis par Anissa Ikhlef (« Compte rendu de visite / Ordre de mission ») :

- **Appel au tuteur la première semaine** : le professeur (visiteur ou référent) ou la gestion des PFMP note la date et les réponses (oui ou non) aux questions du lycée, avec un commentaire. « Mes visites » liste les appels à passer pour les stages en cours.
- **Ordre de mission** : demandé par le visiteur avec son mode de transport (véhicule personnel ou transport en commun) ; l'adresse de l'entreprise est obligatoire avant la signature. Il est signé avant la visite par la direction, la gestion des PFMP (DDFPT, bureau des entreprises), ou les deux : réglage dans « Organisation ».
- **Pendant la visite** : le tuteur ou le représentant de l'entreprise signe sur le téléphone du professeur ; à défaut, le professeur photographie l'ordre de mission tamponné, rangé dans le dossier de l'élève.
- **Compte rendu** : commentaires sur le stagiaire, grille des attitudes professionnelles, et pour l'entreprise : activités en adéquation avec la formation (oui, en partie, non), accueil et encadrement (compté dans sa note de partenariat), commentaires.
- **Document imprimable** sur le modèle du lycée : ordre de mission signé, appel, visite et signature de l'entreprise, commentaires, grille des attitudes avec une croix sur le niveau retenu.
- **Modèle adaptable** (« Modèles de documents » › « Ordre de mission et compte rendu de visite ») : titre, introduction, rubriques, pied de page, questions de l'appel et grille des attitudes (une ligne par critère : « Critère : niveau 1 / niveau 2 / … »).

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Grille par défaut** : les 8 attitudes professionnelles de son modèle (intérêt porté au travail, compréhension, esprit d'initiative, sens de l'organisation, niveau d'activité, habileté, qualité du travail, sociabilité), chacune sur 5 niveaux. Chaque niveau se choisit : aucune réponse n'est pré-cochée.
2. **Questions de l'appel par défaut** : présence et ponctualité, insertion, livret remis au tuteur, tâches réalisables.
3. **Signataires de l'ordre de mission** : par défaut, la direction et la gestion des PFMP, comme sur son modèle (DDFPT, chef d'établissement ou responsable formation entreprise).
4. **Signature de l'entreprise** : proposée à partir du jour de la visite ; un compte rendu ou un appel déjà rédigé garde les questions et la grille avec lesquelles il a été rempli.
5. **Question en attente** : son ordre de mission, son attestation et son livret sont des PDF sans champs ; la façon de les remplir à l'identique lui a été demandée (placer les zones dans Cap PFMP, modèle Cap PFMP d'abord, ou PDF à champs fabriqué par le lycée).

## 27 octobre 2026 : réalisation du lot 3.3 (frais de visite)

« Chaque lycée applique son calcul » :

- **Barème du lycée** (« Organisation » › « Barème des frais ») : le DDFPT ou la direction recopie la méthode de son annexe de remboursement. Une ligne par véhicule (ex. « Voiture 5 CV »), avec jusqu'à 3 tranches de kilomètres parcourus dans l'année : montant = kilomètres × taux + montant fixe ; le montant d'un repas ; les montants de nuitée selon le lieu ; des consignes (trajet retenu, billet de train hors de la région, justificatifs).
- **Demande du professeur**, sur la page de la visite, une fois la visite passée et l'ordre de mission signé : véhicule personnel (véhicule, kilomètres aller et retour, péage) ou transport en commun (billets), repas, nuitées, commentaire. Cap PFMP calcule le montant avec le barème du lycée.
- **Validation** (« Visites » › « Frais de déplacement ») : la gestion des PFMP valide la demande, ou la renvoie avec un motif ; le professeur est prévenu par mail et corrige sa demande. Récapitulatif par professeur et export pour un tableur.
- **Démonstration** : un barème d'exemple sur le modèle du barème kilométrique fiscal (plafonné à 7 CV), que chaque lycée remplace par le sien.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Tranches annuelles** : les kilomètres de l'année civile s'additionnent d'un déplacement à l'autre, pour que le barème par tranches s'applique comme sur l'année entière.
2. **Qui valide** : le DDFPT et la direction ; une demande validée ne se modifie plus.
3. **Justificatifs** (ticket de péage, billet de train) : pour l'instant remis sur papier à la gestion des PFMP ; leur dépôt en photo pourra suivre.
4. **Ordre de mission obligatoire** avant la demande, quand le lycée utilise les ordres de mission.

## 27 octobre 2026 : prise de rendez-vous en ligne pour la visite de stage

Demande d'Anissa : « rajoute prise de rdv pour visite de stage avec deux option en présentiel et en distantiel ».

- **Le professeur propose**, sur la page de la visite, jusqu'à 3 créneaux et la forme de la visite : sur place, à distance, ou au choix de l'entreprise. Pour une visite à distance, il indique s'il le souhaite un lien de visio ou un numéro de téléphone.
- **L'entreprise reçoit un lien personnel** par SMS et par mail, sans compte à créer : elle choisit son créneau, la forme de la visite quand le professeur la lui laisse, et peut laisser un message. Si aucun créneau ne lui convient, elle donne ses disponibilités : le professeur les reçoit par mail, les voit dans « Mes visites » et propose d'autres créneaux (le nouveau lien remplace l'ancien).
- **Confirmation** : le professeur et l'entreprise reçoivent un mail ; pour une visite à distance, il contient le lien de visio ou le numéro. La date et la forme de la visite apparaissent dans « Mes visites », dans la liste des visites et dans l'espace du tuteur.
- Le tuteur qui a un compte peut toujours choisir dans son espace, et le professeur peut enregistrer une réponse reçue par téléphone.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Par défaut, « au choix de l'entreprise »** ; le professeur peut imposer une visite sur place ou à distance.
2. **Visio** : Cap PFMP ne crée pas la réunion ; le professeur colle le lien de son outil habituel, ou donne un numéro de téléphone.
3. **Lien valable 14 jours**, pour une seule prise de rendez-vous ; pour changer de date ensuite, l'entreprise répond au professeur, qui renvoie de nouveaux créneaux.
4. **Changement de visiteur** : les créneaux de l'ancien visiteur restés sans réponse sont annulés, et son lien ne sert plus.

## 27 octobre 2026 : réalisation du lot 3.4 (attestation de stage en ligne)

Sur la décision d'Anissa : « deux options : tuteur avec élève et prof quand c'est possible, ou tuteur et élève, et si ce n'est pas possible le tuteur seul ».

- **Trois façons de la remplir**, toujours par le tuteur, qui indique qui la remplit avec lui :
  - **Avec le professeur** : sur la page de la visite, le tuteur la remplit sur le téléphone du professeur, avec l'élève, et signe en dessinant avec le doigt.
  - **Dans son compte** (« Mes stagiaires », bloc « Fin de stage »).
  - **Avec son lien personnel**, sans compte : le lien reçu par mail sert à remplir l'attestation en ligne ou à déposer le document signé, et à déposer le livret.
- **Ce qui est rempli** : les jours de stage effectués et d'absence (proposés par Cap PFMP : jours prévus moins absences signalées au lycée), les activités réalisées, une appréciation, le nom et la fonction de la personne qui signe. Le document indique qui l'a remplie.
- **Quand** : à partir de 2 jours avant la fin du stage (réglable dans « Organisation »), pour la remplir avec l'élève encore présent ; le tuteur reçoit alors son lien par mail. Les remerciements de fin de stage proposent aussi l'attestation en ligne.
- **Le PDF** suit le modèle Cap PFMP adapté par le lycée (« Modèles de documents » › « Attestation de stage » : titre, introduction, rubriques, pied de page, logo), avec un aperçu. Il est rangé dans le dossier de l'élève.
- **Vérification** : l'attestation est validée d'office quand les jours déclarés sont ceux de Cap PFMP ; sinon, elle arrive « à vérifier » chez la gestion des PFMP, avec l'écart affiché (jours déclarés, jours comptés par Cap PFMP).

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Validation d'office** quand les jours concordent, pour ne pas ajouter de travail au DDFPT ; un écart (absence non signalée, stage écourté) est toujours vérifié.
2. **Signature** : dessinée sur le téléphone du professeur ; dans le compte du tuteur ou avec son lien, simple ou dessinée, selon le réglage du lycée.
3. **Ouverture 2 jours avant la fin** : l'élève est encore là pour la remplir avec son tuteur ; le lycée peut changer ce nombre de jours.
4. **Le PDF de son lycée** (attestation sans champs) : en attente de la réponse d'Anissa sur la façon de remplir ses PDF (1, 2 ou 3) ; d'ici là, le modèle Cap PFMP adapté.

## 28 octobre 2026 : réalisation du lot 3.5 (livret de compétences en ligne)

Même décision d'Anissa que pour l'attestation : le tuteur remplit le livret avec l'élève et le professeur quand c'est possible, sinon avec l'élève, sinon seul.

- **Carnet de bord** : pendant le stage, l'élève note chaque jour ce qu'il a fait (« Mon stage » › « Mon carnet de bord »), depuis son téléphone. Une note par jour, qu'il peut compléter. Le tuteur, l'équipe et la famille la lisent.
- **Évaluation par le tuteur**, aux mêmes endroits que l'attestation (téléphone du professeur pendant la visite, compte du tuteur, lien personnel) et aux mêmes dates (quelques jours avant la fin) : un niveau pour chaque attitude professionnelle (la grille du lycée, la même qu'à la visite), un niveau pour chaque compétence du diplôme de la classe, un bilan, la signature.
- **Compétences de chaque diplôme** : le lycée les saisit dans « Modèles de documents » › « Livret de compétences », une liste par formation de ses classes, avec ses niveaux d'acquisition (par défaut : non évaluée, non acquise, en cours d'acquisition, acquise).
- **Le PDF** au modèle du lycée reprend les évaluations, le bilan et le carnet de bord ; il est rangé, validé, dans le dossier de l'élève.
- Le mail envoyé au tuteur avant la fin du stage et les remerciements proposent l'attestation et le livret en ligne, avec le même lien.
- **Démonstration** : Emma LAURENT (terminale, compte `emma.laurent`) a déjà noté quelques jours ; compétences d'exemple pour le bac pro Métiers de la sécurité et le CAP Agent de sécurité.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Attitudes professionnelles** : la même grille qu'au compte rendu de visite, pour ne la saisir qu'une fois.
2. **Livret validé d'office** une fois signé (pas de jours à comparer, contrairement à l'attestation).
3. **Rappel quotidien de l'élève** : il pourra lui rappeler de remplir son carnet de bord pendant le stage, si Anissa le souhaite.
4. **Livret papier du lycée** : comme pour l'attestation, en attente de sa réponse (1, 2 ou 3) sur ses PDF sans champs.

## 28 octobre 2026 : agents IA et abonnement (modifie la décision 7 du 27 octobre)

Anissa : « l'application doit avoir trois agents IA comme prévu […] il faut donc une IA toujours et le prix va changer en fonction des niveaux d'intervention des IA », puis « l'agent 1 est obligatoire, le 2 et le 3, c'est le lycée qui sélectionne ce qu'il veut ».

- **Plus d'abonnement sans IA** : chaque lycée a toujours l'agent 1.
- **Agent 1, obligatoire** : l'agent administratif (mails et relances aux élèves, aux familles et aux entreprises, validés selon l'organisation du lycée).
- **Agents 2 et 3, au choix du lycée** : l'agent de veille réglementaire, et l'agent de recherche d'entreprises (lieux de stage, relecture des CV). Le lycée peut prendre l'un, l'autre, les deux, ou aucun.
- **Prix** : il dépend des agents choisis (agent 1 seul, agent 1 + un agent, ou les trois). Les formules « Essentiel / Plus / Complet » du 27 octobre sont abandonnées.
- Les autres décisions sur les agents (données des élèves cachées à l'IA, validation par une personne, marque Cap PFMP) restent valables.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Qui choisit les agents 2 et 3** : le DDFPT ou la direction, dans « Organisation » ; le changement prend effet au mois suivant, pour la facturation.
2. **Montants** : fixés par Anissa depuis son compte administrateur de Cap PFMP, pour chaque combinaison d'agents.

## 28 octobre 2026 : livret de compétences et année d'examen

Anissa : « l'élève et parent peuvent consulter les livrets de compétences en seconde, en première, mais pas en terminale car c'est l'année du bac » ; pour le CAP : « la deuxième est une année d'examen ».

- En **seconde, première et 1re année de CAP**, l'élève et sa famille consultent le livret.
- En **terminale et en 2e année de CAP**, le livret est transmis au lycée sans être communiqué à l'élève ni à sa famille : ni résumé, ni fichier (l'ouverture directe du fichier est refusée). L'élève garde son carnet de bord, qu'il écrit lui-même. L'équipe et l'entreprise voient le livret.
- **Fiche de la classe** : un réglage « Pour un CAP : année » (1re année, ou 2e année, année d'examen).

## 28 octobre 2026 : le PDF de chaque lycée, même sans champs (réponse « 1 » d'Anissa)

Anissa : « l'essentiel est de prendre en compte le fait que chaque lycée a ses modèles de documents, et au final on a la trace des documents signés » ; elle choisit de placer les zones d'un clic sur le PDF du lycée.

- **Pour les quatre documents** (convention, ordre de mission, attestation, livret), le lycée dépose son propre PDF, avec ou sans champs (un document scanné ou imprimé depuis un traitement de texte convient).
- **Zones** : dans « Modèles de documents », le DDFPT ou la direction voit les pages de son PDF, trace une zone à la souris (ou au doigt) à l'endroit où écrire, et choisit ce que Cap PFMP y met : une donnée (élève, classe, dates, entreprise, tuteur, jours effectués, activités…), une croix dans une case (transport, niveau d'une attitude ou d'une compétence, réponse oui/non de l'appel…), une signature, ou un texte fixe. Un aperçu montre chaque zone avec sa donnée, un autre le document rempli avec un vrai stage ; des exemples fictifs sans champs permettent d'essayer.
- **Choix du modèle** : pour chaque document, le modèle Cap PFMP adapté ou le PDF du lycée.
- **Trace des documents signés** : la convention et l'ordre de mission gardent le modèle du jour de leur signature, même si le lycée change son modèle ensuite ; l'attestation et le livret sont rangés en PDF, tels que signés, dans le dossier de l'élève.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Écriture dans les zones** : en bleu foncé, sur plusieurs lignes si besoin, en réduisant la taille du texte pour qu'il tienne dans la zone.
2. **Signature dessinée** placée dans sa zone ; une signature simple y laisse la mention « Signé en ligne dans Cap PFMP le … ».
3. **PDF remplacé** : les zones déjà placées sont gardées quand elles tiennent dans les pages du nouveau PDF.

## 28 octobre 2026 : réalisation du lot 6 (formation incluse)

Sur les décisions d'Anissa du 27 octobre : visite guidée et bouton « ? », lycée d'entraînement (« très bien »), missions, quiz et attestation de prise en main (« cette dernière apporte une plus-value »).

- **Visite guidée** à la première connexion, adaptée au rôle (gestion des PFMP et direction, professeur, vie scolaire, élève, parent, entreprise), de deux à six étapes ; on peut la passer, et la revoir à tout moment.
- **Bouton « ? »** en haut de chaque page : ce que fait la page, en quelques points, et un lien vers la formation.
- **Lycée d'entraînement** (onglet « Formation », pour l'équipe du lycée) : un lycée rien qu'à soi, avec les réglages et les modèles de documents de son vrai lycée, des élèves, entreprises et stages fictifs (un stage terminé, un en cours, un à venir). Un bandeau violet le signale ; on peut s'y mettre à la place d'un élève, d'un parent ou d'une entreprise, revenir à son lycée, ou le remettre à zéro. Rien n'en sort : aucune relance automatique, aucun vrai message.
- **Missions** à réussir dans le lycée d'entraînement, cochées toutes seules (gestion des PFMP : fixer des dates, préparer les fiches de connexion, envoyer et faire signer une convention, adapter un modèle, envoyer les relances ; professeur : créneaux de visite, appel, compte rendu, souci signalé ; vie scolaire : absence, note de suivi).
- **Quiz** de cinq questions (quatre bonnes réponses pour le réussir, à repasser autant qu'on veut) et **attestation de prise en main** en PDF, prête dès que les missions et le quiz sont réussis.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Remettre à zéro** le lycée d'entraînement efface aussi ses missions réussies (l'attestation déjà obtenue se refait en refaisant les missions).
2. **Élèves, parents et entreprises** : la visite guidée et l'aide « ? » suffisent, sans lycée d'entraînement ni quiz.

## 28 octobre 2026 : lot 7, les trois agents IA

Mise en œuvre des décisions d'Anissa : « l'agent 1 est obligatoire, le 2 et le 3, c'est le lycée qui sélectionne ce qu'il veut » ; le prix dépend des agents choisis ; l'IA ne voit aucun nom ; rien ne part sans validation d'une personne ; les agents portent la marque Cap PFMP.

- **Agent 1, Cap Admin (inclus pour tous les lycées)** : chaque matin, il repère les élèves toujours sans stage à l'approche de leur période et les absences répétées non justifiées, et rédige le mail à la famille. L'équipe peut aussi lui demander un mail depuis la fiche d'un élève (pour la famille ou le tuteur). Les mails attendent dans « Mails à valider » : « Envoyer », « Modifier » ou « Ne pas envoyer ». Ils sont validés par le professeur référent de la classe de l'élève ; la gestion des PFMP peut tous les valider. Le mail envoyé porte la mention « Message préparé avec Cap Admin […] et relu par » la personne qui l'a validé. Les rappels automatiques déjà en place partent toujours seuls.
- **Agent 2, Cap Veille (au choix)** : l'administration de Cap PFMP colle un texte officiel (Bulletin officiel, Légifrance, Éduscol, Service public, ministère du Travail : aucune autre source acceptée) ; Cap Veille le résume et propose des changements ; l'administration relit, corrige, puis publie. L'alerte arrive dans « Veille » chez chaque lycée qui a choisi Cap Veille, avec un mail à la direction et à la gestion des PFMP. Pour chaque proposition, le lycée note « C'est fait » ou « Pas pour nous » : rien ne change tout seul.
- **Agent 3, Cap Partenaires (au choix)** : pour un élève sans stage, il propose jusqu'à 5 lieux (annuaire du lycée avec places libres et règles de la classe, puis annuaire public des entreprises), classés sur des faits (domaine proche de la formation, places libres, entreprise qui accueille déjà des élèves, ville), en écartant les entreprises déjà contactées ; la note de partenariat compte dans le classement sans jamais être montrée à l'élève. Il relit le CV : points forts, points à améliorer, un conseil. L'élève s'en sert dans « Mon stage », l'équipe sur la fiche de l'élève.
- **Choix et montant** : dans « Organisation », « Agents IA », le DDFPT ou la direction coche Cap Veille et Cap Partenaires et voit le montant de sa formule ; le changement est immédiat, le montant compte à partir du mois suivant.
- **Administration de Cap PFMP** (compte `admin`) : montant de chaque formule (Cap Admin seul, avec Cap Veille, avec Cap Partenaires, les trois), plafond de demandes par mois et par lycée pour Cap Admin et Cap Partenaires (au-delà, l'agent s'arrête jusqu'au mois suivant), liste des lycées avec leur formule, leur montant et leur usage du mois.
- **Données** : l'IA reçoit « [ÉLÈVE] » à la place du nom et du prénom (même dans une demande écrite par l'équipe) ; Cap PFMP remet le prénom au retour. Le CV est envoyé sans nom, adresse, téléphone, mail ni date de naissance. Le journal d'usage ne garde aucun texte.
- **Sans clé d'IA** (démonstration) et toujours dans le lycée d'entraînement : les agents répondent avec des textes d'exemple préparés par l'application, signalés comme tels.

### Choix proposés par l'assistant, à confirmer par Anissa Ikhlef

1. **Seuils de Cap Admin** : mail à la famille d'un élève sans stage 15 jours avant la période, et à partir de 2 absences non justifiées pendant un stage ; réglables par le lycée.
2. **Élève dont aucun responsable n'a de compte** : Cap Admin écrit à l'élève lui-même (en le tutoyant).
3. **Montants de démonstration** : 49 €, 69 €, 79 € et 99 € par mois, fictifs, à remplacer par les montants d'Anissa dans « Administration ».
4. **Plafonds par défaut** : 400 demandes par mois pour Cap Admin, 300 pour Cap Partenaires.
5. **Annuaire public des entreprises** : recherche-entreprises.api.gouv.fr (gratuit, sans compte) ; « La bonne boîte » de France Travail demande une inscription, à faire par Anissa si elle le souhaite.
6. **Surveillance automatique des sources officielles** : pour l'instant, l'administration colle le texte ; une lecture automatique du Bulletin officiel pourra suivre.

## 28 octobre 2026 : réponses d'Anissa sur les agents IA, puis « commence »

1. **Élève sans stage** : Cap Admin écrit à la famille « 2 mois avant » le début de la période (60 jours par défaut, réglable par le lycée jusqu'à 120).
2. **Aucun responsable n'a de compte** : Cap Admin « lui écrit et prévient le prof tuteur et le DDFPT ». Le mail part à l'élève ; à l'envoi, son professeur référent et les comptes « Gestion des PFMP » reçoivent un mail « Pour information », qui leur rappelle de créer les comptes des responsables.
3. **Montants des formules** : « je ne sais pas encore ». Les montants d'exemple restent en démonstration ; Anissa les fixera dans « Administration ».
4. **Plafonds** (400 demandes par mois pour Cap Admin, 300 pour Cap Partenaires) : « oui, et on modifiera si nécessaire ».
5. **La bonne boîte** (France Travail) : « oui », avec un rappel pour l'inscription. Le rappel est en haut de la page « Administration » tant que l'accès n'est pas branché. Chaque classe a un « code métier ROME » (ex. K2503 pour la sécurité privée), qui sert à la recherche.
6. **Veille réglementaire** : « possible les deux ». Chaque semaine, Cap Veille lit les pages officielles choisies dans « Administration » (par défaut, le Bulletin officiel) et prépare une alerte à relire pour chaque nouveau texte qui parle des stages ; l'administration est prévenue par mail. Elle peut toujours aussi coller un texte elle-même. Rien n'est publié sans relecture.

### À vérifier au branchement

- **La bonne boîte** : l'adresse de l'API et le nom des paramètres sont dans la documentation remise à l'inscription sur francetravail.io. Ils se règlent sans toucher au code (FRANCE_TRAVAIL_LBB_URL, FRANCE_TRAVAIL_SCOPE) ; en cas d'erreur, Cap Partenaires continue avec l'annuaire du lycée et l'annuaire public.
- **Page lue par Cap Veille** : la page du Bulletin officiel (ou son flux RSS) se confirme en ligne au premier passage, avec le bouton « Lire les sources maintenant ».

## 28 octobre 2026 : veille, pôles, spécialités et visites

### Veille réglementaire

Le site du ministère refuse la lecture automatique du Bulletin officiel (réponse 403 au premier essai en ligne). Anissa choisit l'option 3 : **Légifrance automatiquement** (accès officiel gratuit pour les logiciels, après inscription d'Anissa sur piste.gouv.fr) **et le bulletin du jeudi** (lettre gratuite du ministère qui envoie le sommaire du BO chaque jeudi ; Anissa colle dans Cap Veille les textes qui parlent des stages). Le contournement du blocage du ministère est exclu.

### Pôles de formation

« Dans les lycées professionnels, on trouve plusieurs pôles » : chaque lycée a ses pôles, chaque pôle ses formations, chaque formation ses spécialités. Les formations en apprentissage sont exclues de Cap PFMP (« que je ferai plus tard dans une autre appli »). Démonstration, formations en voie scolaire : Sécurité (CAP Agent de sécurité, Bac pro Métiers de la sécurité), Automobile (CAP Maintenance des véhicules, option véhicules légers), Maintenance industrielle (2de pro Métiers du pilotage et de la maintenance d'installations automatisées, Bac pro Maintenance des systèmes de production connectés), Informatique, réseaux et électronique (2de pro Métiers des transitions numérique et énergétique, Bac pro CIEL).

### Spécialités et dates de PFMP

« Parfois, dans la même classe, des groupes d'élèves partent en stage à des périodes différentes » (par exemple, à partir de la première, sûreté et sécurité) ; c'est « toujours en lien avec des spécialités ». Une période de PFMP concerne toute la classe ou une spécialité de la classe ; chaque élève suit les dates de sa spécialité ; le calendrier les montre. Le mot « dominante » devient « spécialité ».

### Visites

1. **Nombre de visites** : réparti par Cap Admin en proportion des heures de cours du professeur dans la classe, validé par le DDFPT.
2. **Choix des élèves** : chaque professeur se positionne sur les lieux de stage qu'aucun collègue n'a pris, « premier arrivé, premier servi ».
3. **Sur place ou à distance** : « le choix vient après l'appel de l'entreprise, ou bien le prof l'indique et le modifie en fonction de la disponibilité du tuteur ». En prenant la visite, le professeur indique sur place, à distance, ou à décider après l'appel ; il peut le changer jusqu'au rendez-vous confirmé.
4. **Coordonnées** : dès que le professeur prend une visite, il voit l'adresse du lieu de stage, le tuteur et son téléphone.
5. **Qui visite quoi, selon chaque lycée** : dans le lycée d'Anissa, les premières visites sont faites par les professeurs de l'enseignement professionnel, les dernières par ceux de l'enseignement général, et les classes d'examen ne sont visitées que par les professeurs de l'enseignement professionnel ; d'autres lycées ont leur propre organisation. Réglage dans « Organisation » : pour la première période de l'année, la dernière, les autres, et les classes d'examen, qui peut visiter (enseignement professionnel, enseignement général, ou toute l'équipe).

## 28 octobre 2026 : listes exportables

Anissa : « une fois les cases renseignées, par exemple tous les RIB, générer une liste avec tous les élèves de la classe avec les RIB, une liste avec les lieux de stage, durée et date par année… », « ces listes peuvent être exportées », en Excel et en PDF (« les deux »), et « des listes que tu estimes utiles ».

- **Droits** : « le DDFPT peut extraire tout, le prof tout sauf les RIB », et seulement « ses propres classes » (celles dont il est référent ou où il a des heures de cours). La direction, qui a tous les droits, exporte tout.
- **Les neuf listes** (onglet « Listes », pour une année scolaire et une classe ou toutes) : RIB et pièces d'identité ; lieux de stage (spécialité, entreprise, adresse, tuteur, téléphone, dates, semaines, jours prévus) ; élèves sans stage (et entreprises déjà contactées) ; conventions (qui a signé, qui doit signer) ; attestations et livrets ; absences en stage (sans le motif) ; visites (professeur, date, sur place ou à distance, ordre de mission, compte rendu) ; entreprises partenaires (sans la note de partenariat) ; bilan de l'année par classe.
- **Formats** : fichier Excel .xlsx (Anissa : « oui pour les fichiers .xlsx » ; titre, en-tête figé et filtrable, vraies dates, colonnes à la bonne largeur) et PDF à l'italienne prêt à imprimer.

## 28 et 29 octobre 2026 : attestation récapitulative des PFMP (fichier de l'académie)

Anissa montre le fichier Excel de son académie (« Attestation de PFMP ou de durée d'apprentissage », session 2026) et demande « un outil qui me permet de renseigner ce document ».

- **Les deux formats** : « les 2 » : le fichier de l'académie rempli par Cap PFMP, et la même attestation au format Cap PFMP (Excel et PDF).
- **Chaque lycée dépose le sien** : « je ne connais pas le modèle des autres académies, donc chaque lycée doit avoir l'option pour déposer le sien ». Dans « Organisation », « Attestation récapitulative » : le lycée dépose le fichier .xlsx ; Cap PFMP reconnaît ses cases d'après leurs intitulés (académie, session, établissement, nom et prénom, n° candidat, durée du cycle, dérogation, visa, tableau des PFMP, onglet de synthèse, page de garde) et les affiche ; le lycée les corrige si besoin. Mise en page, listes déroulantes et formules de l'académie restent intactes ; les formules se recalculent à l'ouverture.
- **Qui** : « la direction, le DDFPT et seulement le référent de la classe de terminale » ; la 2e année de CAP, classe d'examen elle aussi, est comprise.
- **Visa** : seule la direction vise (la croix du visa du chef d'établissement n'apparaît qu'après son visa ; elle peut le retirer).
- **Ce qui compte** : « déjà effectué et attesté » : seules les PFMP terminées dont l'attestation de stage est validée, sur tout le cycle de l'élève (toutes ses années). Jours : ceux que l'entreprise a déclarés dans l'attestation en ligne, sinon les jours prévus moins les absences ; 1 semaine = 5 jours. Une PFMP terminée sans attestation validée est signalée, comme un numéro de candidat manquant.
- **Semaines attendues** : « bac pro 3 ans : 20 semaines, bac pro 2 ans : 15 semaines, CAP : 12 semaines » ; modifiables par formation (« Pôles et formations »), avec la durée du cycle ; la durée d'un élève peut différer de celle de sa formation. Les élèves à qui il manque des semaines figurent sur la page de garde, avec la dérogation.
- **Démonstration** : le modèle d'Anissa, vierge (« ce n'est pas un fichier confidentiel »), est déposé pour le lycée de démonstration, sans recharger les données qu'Anissa y a saisies.
