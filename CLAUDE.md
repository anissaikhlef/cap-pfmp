# Cap PFMP — consignes pour les sessions de travail

- Tout le texte visible (interface, messages, commits, documentation) est en **français**. La porteuse du projet, Anissa Ikhlef, n'est pas développeuse : expliquer simplement.
- Chaque lecture ou écriture de données passe par `src/lib/acces.ts` et filtre sur `ctx.etab.id`. Aucune action serveur sans `contexte()` en tête.
- L'organisation propre à chaque lycée vient de `etablissements.reglages` : ne jamais coder en dur qui gère, qui visite ou comment on signe.
- Règles métier : fonctions pures dans `src/lib/regles.ts`, avec tests dans `tests/`.
- Après une modification : `npm run lint`, `npm test`, `npx next build`, puis le parcours `e2e/` concerné.
- Données de démonstration uniquement fictives (domaine `demo.cap-pfmp.example`, numéros 06 39 98 xx xx).
- Parcours de test : `e2e/etape1.mjs` à `etape5.mjs` et `organisations.mjs`, chacun sur des données fraîches (`npm run db:seed`), application sur le port 3100.
- Messages de confirmation après une action : `revenirAvec()` (src/lib/retour.ts) et le bandeau commun ; dans un formulaire simple, ajouter `<ChampRetour />`.
- Mails et SMS : toujours via `envoyer()` (src/lib/messages.ts), jamais directement.
