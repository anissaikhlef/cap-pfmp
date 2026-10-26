# Mettre Cap PFMP en ligne

Deux situations très différentes :

1. **Une démonstration** avec les données fictives, pour essayer l'application et la montrer. Gratuit, environ 20 minutes.
2. **La vraie utilisation** avec de vrais élèves. À faire seulement après les vérifications de sécurité et RGPD listées dans le README.

---

## 1. Démonstration (Vercel + Neon)

Deux comptes gratuits : **Neon** héberge la base de données, **Vercel** fait tourner l'application. Vercel lit le code directement sur votre GitHub.

### Étape A : la base de données (Neon)

1. Allez sur https://neon.tech et créez un compte (vous pouvez utiliser « Continue with GitHub »).
2. Créez un projet : nom `cap-pfmp`, version PostgreSQL 16, région **AWS Europe Central (Frankfurt)**.
3. Sur le tableau de bord du projet, cliquez sur **Connect**. Copiez l'adresse de connexion (« connection string ») qui commence par `postgresql://`. Gardez-la de côté : c'est votre `DATABASE_URL`.

### Étape B : l'application (Vercel)

1. Allez sur https://vercel.com et créez un compte avec « Continue with GitHub ».
2. Cliquez sur **Add New… → Project**, puis **Import** à côté de `cap-pfmp`. Si le dépôt n'apparaît pas, cliquez sur « Adjust GitHub App Permissions » et autorisez-le.
3. Avant de cliquer sur Deploy, ouvrez **Environment Variables** et ajoutez :

| Nom | Valeur |
| --- | --- |
| `DATABASE_URL` | l'adresse copiée dans Neon |
| `DEMO` | `oui` |
| `STOCKAGE` | `base` |
| `COOKIE_SECURE` | `true` |
| `DOUBLE_AUTH_OBLIGATOIRE` | `false` |
| `CRON_SECRET` | une longue suite de lettres et de chiffres au hasard (au moins 24) |

4. Cliquez sur **Deploy**. Au premier déploiement, les tables et le lycée de démonstration sont créés automatiquement.
5. Vercel affiche l'adresse du site, du type `https://cap-pfmp-xxxx.vercel.app`. Ouvrez-la et connectez-vous avec un compte de démonstration (mot de passe `Demo-pfmp-2026`) :
   - `direction@demo.cap-pfmp.example`
   - `p.martin@demo.cap-pfmp.example` (professeur référent de 2nde)
   - `s.benali@demo.cap-pfmp.example` (professeure référente de 1re)
   - `m.garnier@demo.cap-pfmp.example` (professeure d'enseignement général)
   - `vie.scolaire@demo.cap-pfmp.example` (vie scolaire)
   - `ines.haddad@demo.cap-pfmp.example` (élève)
   - `f.traore@demo.cap-pfmp.example` et `l.rahmani@demo.cap-pfmp.example` (parents)
   - `k.ferhat@demo.cap-pfmp.example` (tuteur en entreprise)

À chaque nouvel envoi de code sur GitHub, Vercel met le site à jour tout seul. Quand les données de démonstration changent (nouvelle version dans `scripts/version-demo.ts`), elles sont rechargées automatiquement : ce que vous aviez modifié sur le site de démonstration est alors effacé.

**Limites de la démonstration** : pas de vrais mails ni SMS (ils sont seulement enregistrés dans « Messages ») ; fichiers déposés limités à 4 Mo ; serveurs Vercel hors de l'Union européenne pour une partie du traitement. **Aucune donnée réelle d'élève.**

Pour repartir de zéro : dans Neon, supprimez puis recréez la base, puis dans Vercel cliquez sur **Redeploy**.

---

## 2. Vraie utilisation (à préparer avec un développeur)

- **Hébergement en France** : Scaleway, OVHcloud ou Clever Cloud, avec une base PostgreSQL gérée. Le `Dockerfile` fourni construit l'image de l'application ; au démarrage, elle met la base à jour.
- **Fichiers** : un stockage objet chiffré chez le même hébergeur (à brancher dans `src/lib/stockage-brut.ts`) et une analyse antivirus.
- **Réglages** : `DOUBLE_AUTH_OBLIGATOIRE=true`, `COOKIE_SECURE=true`, `TACHES_JETON` secret, **sans** `DEMO`.
- **Tâche quotidienne** : appeler chaque matin `https://votre-site/api/taches/quotidiennes` avec l'en-tête `Authorization: Bearer <TACHES_JETON>` (relances automatiques).
- **Mails et SMS** : brancher un prestataire hébergé dans l'UE dans `src/lib/messages.ts`.
- **Signature électronique** certifiée (eIDAS) si les conventions doivent être signées en ligne avec valeur juridique.
- **Sauvegardes** quotidiennes, **analyse d'impact (AIPD)**, **contrat de sous-traitance RGPD** avec chaque lycée, **test d'intrusion**.
