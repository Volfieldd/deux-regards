# AGENTS.md : consignes pour un agent qui travaille sur ce dépôt

Ce fichier est lu par les agents de code (Codex, Claude Code…). Il dit **ce qu'il faut savoir avant de toucher au dépôt** et renvoie aux documents qui font foi ; il ne les recopie pas. Quand il se contredit avec un autre document, c'est l'autre qui a raison : signale l'écart.

**Nicephos** (dépôt `deux-regards`) : site photo de Sébastien et Julien, galerie publique et administration. Node.js 22, Fastify, SQLite, gabarits Eta, aucun framework front, aucune étape de build. La **Vigie** (`vigie/`, `server/securite/`) est son composant de sécurité isolé : journal chaîné, règles Sigma, alertes et, depuis la 1.191, dossiers.

## Où lire, dans cet ordre

1. [`docs/wiki/Développer.md`](docs/wiki/Développer.md) : organisation du code, règles du projet, cycle d'une PR, quelle documentation mettre à jour. **À lire en entier avant la première modification.**
2. [`PLAN.md`](PLAN.md) : l'historique, ce qui est fait et ce qui reste ; une étape franchie s'y inscrit.
3. [`docs/wiki/Vigie.md`](docs/wiki/Vigie.md) et [`docs/etudes/`](docs/etudes/README.md) pour tout ce qui touche à la Vigie ; pour les dossiers : [`vigie-dossiers.md`](docs/etudes/vigie-dossiers.md).
4. [`docs/wiki/Tests.md`](docs/wiki/Tests.md) pour les tests ; [`docs/wiki/Sécurité.md`](docs/wiki/Sécurité.md) pour les protections en place.

## Règles qui coûtent cher quand on les oublie

- **Français partout** : interface, commentaires, messages de commit, documentation, PR. Écriture soignée : espaces insécables avant « : ; ! ? », apostrophes typographiques dans les textes affichés.
- **Imite le code voisin** : même densité de commentaires (on explique le *pourquoi*, avec le numéro de décision ou de revue quand il existe), mêmes noms, même idiome. Pas de refonte hors sujet, pas de dépendance nouvelle sans raison dite dans la PR.
- **Pas de style en ligne, pas de script obligatoire, rien de tiers** : la CSP interdit `unsafe-inline` ; un style passe par une classe. Dans les gabarits, `<%= … %>` (échappé) pour toute donnée ; `<%~ … %>` seulement pour du HTML produit par le serveur. Tout ce qui vient d'une requête, d'un événement ou d'une base (compte, adresse, titre généré) est échappé et borné avant l'affichage ou la ligne de commande.
- **Migrations** : un nouveau fichier `NNN_nom.sql` ; jamais de modification d'une migration déjà fusionnée (site : `server/db/migrations/`, Vigie : `vigie/migrations/`).
- **Données personnelles** : tout champ qui concerne une personne passe par `server/vault.js`, a une durée de conservation, figure dans l'export et sur la page Confidentialité, et met à jour [RGPD](docs/wiki/RGPD.md). Les originaux des photos ne sont jamais servis.
- **Droits sur le code** : le code est propriétaire (voir `LICENSE`). Tout nouveau fichier JS ou CSS **servi aux navigateurs** (`public/`) commence par la ligne `/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */` (copie-la d'un fichier voisin). Les `package.json` portent `UNLICENSED`.
- **Contenu du dépôt** : jamais de secret ni de `.env`, jamais d'adresse interne d'un serveur, jamais le logo du site ni de photo personnelle (les maquettes et les captures n'utilisent que des images générées ou neutres).
- **Un bogue corrigé arrive avec le test qui l'aurait vu.**

## La Vigie : ce qu'on y demande en plus

- **Toute brique du site** (route, saisie, permission, cookie, migration, export) est évaluée face à la Vigie : une section « **Impact sur la Vigie** » dans la PR dit ce que la Vigie peut consommer (événement émis, dans le vocabulaire fermé de `server/securite/vocabulaire.js`) et ce qui lui manque, rattaché à un cas DS ou proposé comme besoin `BV-n` dans [`vigie-besoins-des-briques.md`](docs/etudes/vigie-besoins-des-briques.md).
- **Règles** (`vigie/regles/*.yml`) : étiquettes MITRE ATT&CK **justes** (une tactique et ses techniques, d'après `vigie/attack-enterprise.json`, v20) ; `npm run test:vigie` échoue sinon. La phase d'un dossier se projette des étiquettes (`vigie/phases.js`) ; ne réétiquette jamais une règle pour obtenir une phase : utilise `phase_dossier` / `nature_dossier`.
- **Moteur** : tout changement du moteur ou des dossiers a son test et ne ralentit pas le banc (`node vigie/banc.js --dossier /tmp/x --historique 20000 --evenements 5000 --rafale 5000`, avant et après).
- **Console** (`vigie/console/`) : rendu serveur sans script, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, titre de page sans compte ni adresse ; une Lectrice lit seulement, adresses tronquées (/24, /48) ; formulaires POST avec jeton `_csrf` ; affaiblir la surveillance demande un motif.
- **Maquettes** (`docs/maquettes-vigie/`, `docs/maquettes-v*/`) : elles font référence pour l'écran réel. Une **seule** passe de contrôle (axe, débordements, cibles, contrastes, validation HTML, cohérence des données), notée une fois : pas de jurys successifs. Si le code diffère de la maquette, la PR dit pourquoi.

## Vérifier avant d'ouvrir une PR

- `npm test` **et** `npm run test:vigie` passent. Rapporte les résultats tels quels, avec leurs nombres ; un test qui échoue n'est ni ignoré ni affaibli. Un test qui échoue seul sur l'horloge se relance, et la PR le dit.
- Une modification d'interface s'essaie dans un **vrai navigateur** (Playwright, voir [Tests](docs/wiki/Tests.md)) avant de dire qu'elle marche. `npm test` ne prouve pas l'affichage.
- `node --test test/liens-internes.test.js` quand tu touches à la documentation.
- Données de test : un serveur jetable ou l'instance de démonstration ([Développer](docs/wiki/Développer.md#serveur-de-test-jetable)). **Ne lis pas les données réelles** (bases et sauvegardes de l'instance de test ou de production).

## Git et PR

- Branche depuis `main`, nommée par nature (`feat/`, `fix/`, `docs/`, `design/`, `deploy/`, `maquettes/`, `etude/`), **une PR par étape**, ouverte **en brouillon**, avec : le contexte, les changements, les vérifications (avec leurs nombres), une section « Impact sur la Vigie » si elle s'applique, un paragraphe « Sécurité ».
- **Nouveautés** : une PR qui change ce que voit un utilisateur de l'admin ajoute son entrée en tête de `server/nouveautes.json` (français, anglais, allemand ; `"perm": "securite.voir"` pour tout ce qui concerne la Vigie) et passe `package.json` et `package-lock.json` à **`1.<numéro de la PR>.0`**. Le numéro n'est connu qu'une fois la PR ouverte : ajoute l'entrée juste après, puis pousse. `test/nouveautes.test.js` le vérifie.
- **Ne fusionne jamais toi-même** : le propriétaire écrit « merge » quand c'est validé. Pas de `git push --force`, pas de réécriture de l'historique de `main`, pas de suppression de branche qui n'est pas la tienne.
- Message de commit : une ligne qui dit ce qui change et pourquoi, en français, puis le détail si besoin.
- Si `gh pr edit` échoue (« Projects (classic) is being deprecated ») : `gh api -X PATCH repos/Volfieldd/deux-regards/pulls/<n> -F body=@fichier.md`. Le DNS de `github.com` est parfois intermittent : vérifie un `push` avec `git ls-remote origin <branche>` plutôt que sur le seul code de retour.

## Machine de travail partagée

Plusieurs agents et le propriétaire travaillent sur la même machine.

- **N'écris pas dans le dépôt principal** (celui qui sert à construire l'instance de test) : travaille dans **un worktree à toi** : `git fetch origin main && git worktree add -b <branche> <dossier> origin/main` (ou un clone à part). Avant d'y toucher, `git status` : si des fichiers inattendus traînent, ils sont peut-être le travail d'un autre agent ; ne les supprime pas, signale-les.
- `node_modules` se lie depuis un autre arbre du dépôt (ou `npm ci`) ; la Vigie a les siens dans `vigie/`.
- **Ne touche pas** aux dossiers de données, de sauvegardes ni à `storage/` ; ne supprime ni ne déplace rien hors de ton worktree sans l'avoir regardé.
- **Services voisins** : ports libres seulement ; ne tue jamais un processus par motif large (`pkill node`…).
- **Production** (Unraid) : tu n'y as pas accès et tu n'y déploies rien ; fournis des commandes à copier-coller pour le propriétaire, et dis ce que tu n'as pas pu essayer (installateur, Cloudflare, Zitadel réels).
- Pour des maquettes, les outils de contrôle (Playwright en conteneur, validateur HTML, générateurs) sont hors du dépôt, dans le dossier de travail du propriétaire ; demande où ils sont plutôt que de les réécrire.

## En cas de doute

Dis-le dans la PR ou demande avant d'écrire du code : un choix de sécurité, de données personnelles ou de droits (rôles, permissions) se tranche avec le propriétaire, pas en silence. Une décision déjà prise (numéros `D…` dans les études et `PLAN.md`) ne se rouvre pas dans une PR de code.
