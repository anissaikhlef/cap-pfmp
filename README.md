# Cap PFMP

Plateforme de gestion des périodes de formation en milieu professionnel (PFMP) pour les lycées professionnels : recherche de stage, règles, conventions, dépôt des documents, visites et suivi sur toute la formation.

Projet porté par Anissa Ikhlef. Le cahier des charges décrit l'ensemble du produit ; ce dépôt en construit la **phase 1 (MVP)**.

## État d'avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Comptes, rôles, paramétrage du lycée, classes et périodes, élèves (saisie et import CSV) | Fait |
| 2 | Entreprises, recherche de stage, horaires et règles | Fait |
| 3 | Conventions, boîte de dépôt, dossiers par année | Fait |
| 4 | Visites, ordre de mission, compte rendu | Fait |
| 5 | Tableau de bord complet, relances, campagne de rentrée, double authentification, année suivante | Fait |
| Lot 1 | Vie scolaire, rattrapages hors des périodes prévues, absences en stage (signalées, justifiées, déduites des jours effectués), heures de face à face et choix des visites par les professeurs | Fait |
| Lot 2.1 | Signature simple ou dessinée au doigt, lien personnel pour signer sans compte, tuteur signataire, référent ou direction en dernier, horaires en deux plages, règles des élèves mineurs | Fait |
| Lot 2.2 | CV et lettre de motivation : dépôt, relecture conseillée par le référent, envoi aux entreprises depuis l'application | Fait |
| Lot 2.3 | Allocations de stage : RIB et pièce d'identité déposés par la famille et vérifiés, jours effectués par semaine, export pour tableur | Fait |
| Lot 2.4 | Relances automatiques réglables : places des entreprises (réponse en ligne avec un lien personnel), conventions, pièces de l'allocation et absences non justifiées | Fait |
| Rappels | Rappel quotidien de l'élève (ce qui lui reste à faire), rappel des entreprises tous les 3 jours (5 fois au plus, puis le lycée appelle), jamais le week-end | Fait |
| Accès | Comptes et mots de passe réservés au DDFPT, fiches de connexion par classe avec QR code, connexion sans mot de passe par lien, calendrier des PFMP pour tous, rattrapages vus par les professeurs de la classe | Fait |
| Entreprises | Note de partenariat et badge « Partenaire fiable », soucis signalés par l'équipe, entreprises écartées par le DDFPT, message groupé aux entreprises d'accueil, mails d'accueil et de remerciement, dépôt de l'attestation et du livret par lien personnel, sans compte | Fait |
| Lot 3.1 | Modèles de documents : convention au modèle Cap PFMP adapté (logo, textes, rubriques) ou PDF du lycée rempli à l'identique, champs complétés en signant par la famille et l'entreprise, convention figée à la première signature | Fait |
| Lot 3.2 | Ordre de mission et compte rendu de visite sur le modèle du lycée : appel au tuteur la première semaine, mode de transport, signature avant la visite (direction ou gestion des PFMP, au choix du lycée), signature de l'entreprise pendant la visite ou photo du document tamponné, grille des attitudes professionnelles adaptable | Fait |
| Lot 3.3 | Frais de visite : barème propre à chaque lycée (tranches de kilomètres annuels par véhicule, repas, nuitées), demande de remboursement du professeur après la visite, validation par la gestion des PFMP, export pour un tableur | Fait |
| Lot 3.4 | Attestation de stage en ligne : remplie par le tuteur avec l'élève et le professeur quand c'est possible (sur le téléphone du professeur), avec l'élève, ou seul (dans son compte ou avec son lien personnel), signée, et rangée en PDF au modèle du lycée dans le dossier de l'élève ; validée d'office, ou à vérifier si les jours déclarés diffèrent de ceux de Cap PFMP | Fait |
| Lot 3.5 | Livret de compétences en ligne : carnet de bord de l'élève (ses activités de chaque jour), évaluation par le tuteur des attitudes professionnelles (grille du lycée) et des compétences de chaque diplôme (saisies par le lycée), avec l'élève et le professeur quand c'est possible, bilan, signature, PDF au modèle du lycée rangé dans le dossier de l'élève | Fait |
| PDF du lycée | Pour la convention, l'ordre de mission, l'attestation et le livret : le PDF du lycée, même sans champs, rempli dans les zones que le lycée y place d'un clic (données, cases, signatures, texte fixe) ; un document signé garde le modèle du jour de sa signature | Fait |
| Lot 6 | Formation incluse : visite guidée à la première connexion selon le rôle, bouton « ? » sur chaque page, lycée d'entraînement fictif pour chaque membre de l'équipe (à la place d'un élève, d'un parent ou d'une entreprise ; rien n'en sort), missions, quiz et attestation de prise en main | Fait |
| Rendez-vous | Prise de rendez-vous en ligne pour la visite de stage : le professeur propose ses créneaux et la forme de la visite (sur place, à distance, ou au choix de l'entreprise) ; l'entreprise choisit avec un lien personnel, sans compte, ou donne ses disponibilités ; confirmation par mail, avec le lien de visio pour une visite à distance | Fait |

Les décisions de conception d'Anissa Ikhlef sont consignées, avec leur date, dans [JOURNAL_DE_CONCEPTION.md](JOURNAL_DE_CONCEPTION.md).

## Technique

- [Next.js](https://nextjs.org) 15 (App Router, actions serveur), TypeScript
- PostgreSQL 16 via [Drizzle ORM](https://orm.drizzle.team)
- Authentification par session (cookie `httpOnly`, jeton stocké haché), mots de passe hachés avec bcrypt, blocage après 5 échecs en 15 minutes
- Aucune dépendance à un service extérieur pour l'instant : mails et SMS sont **simulés** et consignés en base

## Mettre en ligne

Voir [DEPLOIEMENT.md](DEPLOIEMENT.md) : démonstration gratuite (Vercel + Neon) pas à pas, puis ce qu'il faut pour une vraie utilisation.

## Installer en local

Prérequis : Node.js 20 ou plus, PostgreSQL 16.

```bash
npm install
cp .env.example .env          # puis adapter DATABASE_URL
createdb cap_pfmp
npm run db:migrate            # crée les tables
npm run db:seed               # lycée de démonstration (données fictives)
npm run dev                   # http://localhost:3000
```

Comptes de démonstration (mot de passe `Demo-pfmp-2026`) :

| Compte | Rôle |
| --- | --- |
| `direction@demo.cap-pfmp.example` | Direction : voit tout, paramètre l'organisation |
| `ddfpt@demo.cap-pfmp.example` | DDFPT : crée les comptes et les fiches de connexion, fixe les dates de PFMP |
| `p.martin@demo.cap-pfmp.example` | Professeur référent de la 2nde |
| `s.benali@demo.cap-pfmp.example` | Professeure référente de la 1re (rattrapage de Mehdi) |
| `m.garnier@demo.cap-pfmp.example` | Professeure d'enseignement général (visites à choisir) |
| `vie.scolaire@demo.cap-pfmp.example` | Vie scolaire : élèves en stage, rattrapages, absences |
| `ines.haddad@demo.cap-pfmp.example` | Élève |
| `emma.laurent@demo.cap-pfmp.example` | Élève de terminale en stage (carnet de bord) |
| `f.traore@demo.cap-pfmp.example` | Responsable légal (CAP), pièces de l'allocation à déposer |
| `l.rahmani@demo.cap-pfmp.example` | Responsable légale de Mehdi (absence à justifier, RIB en cours de vérification) |
| `k.ferhat@demo.cap-pfmp.example` | Tuteur en entreprise |

## Vérifier

```bash
npm run lint        # contrôle des types
npm test            # tests du moteur de règles et de l'import
node e2e/etape1.mjs # parcours dans un navigateur (application lancée sur le port 3100)
node e2e/etape2.mjs
node e2e/etape3.mjs
node e2e/etape4.mjs
node e2e/etape5.mjs
node e2e/organisations.mjs
node e2e/lot1.mjs
node e2e/lot2.mjs
node e2e/acces.mjs
node e2e/entreprises.mjs
node e2e/modeles.mjs
node e2e/ordre-mission.mjs
node e2e/frais.mjs
node e2e/rendez-vous.mjs
node e2e/attestation.mjs
node e2e/livret.mjs
node e2e/zones.mjs
node e2e/formation.mjs
node e2e/mobile.mjs   # chaque parcours suppose des données de démo fraîches (npm run db:seed)
```

Les parcours sont écrits pour le 26 octobre 2026 : lancez l'application avec `CAP_PFMP_DATE_DU_JOUR=2026-10-26` (par exemple `CAP_PFMP_DATE_DU_JOUR=2026-10-26 npx next start -p 3100`).

## Réglages (fichier `.env`)

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `STOCKAGE` | `disque` (par défaut, dossier `UPLOAD_DIR`) ou `base` (fichiers dans PostgreSQL, pour un hébergement sans disque permanent) |
| `COOKIE_SECURE` | `true` dès que le site est servi en HTTPS |
| `SITE_URL` | Adresse publique du site (ex. `https://cap-pfmp.example.fr`), écrite dans les liens personnels envoyés par mail et SMS. Sur Vercel, l'adresse de production est trouvée automatiquement |
| `DOUBLE_AUTH_OBLIGATOIRE` | `true` par défaut : la direction et les gestionnaires doivent activer un code sur téléphone. `false` seulement pour une démonstration |
| `TACHES_JETON` | Jeton secret de la tâche quotidienne `/api/taches/quotidiennes` (relances automatiques, aux jours réglés dans « Organisation »), à appeler chaque matin |

## Organisation du code

- `src/db/schema.ts` : toutes les tables
- `src/lib/regles.ts` : règles de stage, statuts, jours effectués et dossier d'allocation (fonctions pures, testées)
- `src/lib/allocations.ts` : pièces de l'allocation (RIB, pièce d'identité) et jours effectués de chaque stage de l'année
- `src/lib/periodes.ts` : période de référence d'une classe ou d'un élève en rattrapage (fonctions pures, testées)
- `src/lib/repartition.ts` : répartition des visites et nombre de visites selon les heures de face à face (fonctions pures, testées)
- `src/lib/acces.ts` : qui peut voir et faire quoi ; **toute** lecture ou écriture passe par ces fonctions
- `src/lib/modeles.ts` : modèles de documents, partie pure (données que l'on peut écrire dans un champ, donnée proposée d'après le nom du champ, option d'une liste déroulante), testée
- `src/lib/modeles-pdf.ts` et `src/lib/modeles-documents.ts` : lecture et remplissage du PDF du lycée ([pdf-lib](https://pdf-lib.js.org)), modèle de chaque lycée, modèle figé à la première signature
- `src/lib/frais.ts` : kilomètres déjà parcourus dans l'année (le calcul du barème est dans `regles.ts`, testé)
- `src/lib/attestation.ts` : attestation de stage en ligne (ouverture, jours comptés par Cap PFMP, enregistrement, PDF au modèle du lycée avec `pdf-simple.ts`)
- `src/lib/zones.ts` (pur, testé) et `src/lib/valeurs-zones.ts` : zones placées sur le PDF du lycée et ce que Cap PFMP y écrit ; `src/components/EditeurZones.tsx` : l'éditeur (pages affichées avec pdf.js)
- `src/lib/livret.ts` : livret de compétences en ligne et carnet de bord ; `src/lib/fin-de-stage.ts` : ce qui est commun à l'attestation et au livret (qui remplit, signature, PDF rangé)
- `src/lib/rendez-vous.ts` : prise de rendez-vous pour la visite (forme retenue, confirmation au professeur et à l'entreprise, lien de l'entreprise)
- `src/lib/partenariats.ts` : faits et note de partenariat de chaque entreprise (calcul dans `regles.ts`, testé)
- `src/lib/entreprises-accueil.ts` : entreprises d'une période, adresse à utiliser pour un stage, lien de dépôt de l'attestation et du livret
- `src/lib/auth.ts` : connexion, sessions, mots de passe
- `src/app/(app)/` : les écrans, chacun avec ses actions serveur
- `scripts/` : migrations et données de démonstration (`version-demo.ts` : à augmenter quand les données de démonstration changent)

## Avant une mise en production

Ces points du cahier des charges ne sont pas encore traités :

- stockage des fichiers chez un hébergeur objet en France ou dans l'UE, avec analyse antivirus ;
- prestataires réels de mail, de SMS et de signature électronique ;
- sauvegardes, supervision, analyse d'impact (AIPD) et contrat de sous-traitance RGPD ;
- relecture du code par un développeur et test d'intrusion.

**Ne pas y enregistrer de données réelles d'élèves avant ces étapes.**
