# Cap PFMP

Plateforme de gestion des périodes de formation en milieu professionnel (PFMP) pour les lycées professionnels : recherche de stage, règles, conventions, dépôt des documents, visites et suivi sur toute la formation.

Projet porté par Anissa Ikhlef. Le cahier des charges décrit l'ensemble du produit ; ce dépôt en construit la **phase 1 (MVP)**.

## État d'avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Comptes, rôles, paramétrage du lycée, classes et périodes, élèves (saisie et import CSV) | Fait |
| 2 | Entreprises, recherche de stage, horaires et règles | À faire |
| 3 | Conventions, boîte de dépôt, dossiers par année | À faire |
| 4 | Visites, ordre de mission, compte rendu | À faire |
| 5 | Tableau de bord complet, relances, campagne de rentrée | À faire |

## Technique

- [Next.js](https://nextjs.org) 15 (App Router, actions serveur), TypeScript
- PostgreSQL 16 via [Drizzle ORM](https://orm.drizzle.team)
- Authentification par session (cookie `httpOnly`, jeton stocké haché), mots de passe hachés avec bcrypt, blocage après 5 échecs en 15 minutes
- Aucune dépendance à un service extérieur pour l'instant : mails et SMS sont **simulés** et consignés en base

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
| `ines.haddad@demo.cap-pfmp.example` | Élève |
| `f.traore@demo.cap-pfmp.example` | Responsable légal |
| `k.ferhat@demo.cap-pfmp.example` | Tuteur en entreprise |

## Vérifier

```bash
npm run lint        # contrôle des types
npm test            # tests du moteur de règles et de l'import
node e2e/etape1.mjs # parcours complet dans un navigateur (application lancée sur le port 3100)
```

## Organisation du code

- `src/db/schema.ts` : toutes les tables
- `src/lib/regles.ts` : règles de stage et statuts (fonctions pures, testées)
- `src/lib/acces.ts` : qui peut voir et faire quoi ; **toute** lecture ou écriture passe par ces fonctions
- `src/lib/auth.ts` : connexion, sessions, mots de passe
- `src/app/(app)/` : les écrans, chacun avec ses actions serveur
- `scripts/` : migrations et données de démonstration

## Avant une mise en production

Ces points du cahier des charges ne sont pas encore traités :

- double authentification pour la direction et les gestionnaires ;
- stockage des fichiers chez un hébergeur objet en France ou dans l'UE, avec analyse antivirus ;
- prestataires réels de mail, de SMS et de signature électronique ;
- sauvegardes, supervision, analyse d'impact (AIPD) et contrat de sous-traitance RGPD ;
- relecture du code par un développeur et test d'intrusion.

**Ne pas y enregistrer de données réelles d'élèves avant ces étapes.**
