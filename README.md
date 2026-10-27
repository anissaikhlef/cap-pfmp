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
| `p.martin@demo.cap-pfmp.example` | Professeur référent de la 2nde |
| `s.benali@demo.cap-pfmp.example` | Professeure référente de la 1re (rattrapage de Mehdi) |
| `m.garnier@demo.cap-pfmp.example` | Professeure d'enseignement général (visites à choisir) |
| `vie.scolaire@demo.cap-pfmp.example` | Vie scolaire : élèves en stage, rattrapages, absences |
| `ines.haddad@demo.cap-pfmp.example` | Élève |
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
