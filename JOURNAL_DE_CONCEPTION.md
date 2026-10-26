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
