# Cap PFMP — consignes pour les sessions de travail

- Tout le texte visible (interface, messages, commits, documentation) est en **français**. La porteuse du projet, Anissa Ikhlef, n'est pas développeuse : expliquer simplement.
- Chaque lecture ou écriture de données passe par `src/lib/acces.ts` et filtre sur `ctx.etab.id`. Aucune action serveur sans `contexte()` en tête.
- L'organisation propre à chaque lycée vient de `etablissements.reglages` : ne jamais coder en dur qui gère, qui visite ou comment on signe.
- Règles métier : fonctions pures dans `src/lib/regles.ts`, avec tests dans `tests/`.
- Après une modification : `npm run lint`, `npm test`, `npx next build`, puis le parcours `e2e/` concerné.
- Données de démonstration uniquement fictives (domaine `demo.cap-pfmp.example`, numéros 06 39 98 xx xx).
