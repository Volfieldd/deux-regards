# Développer

Cette page est pour qui reprend le code : où sont les choses, quelles règles suivre, comment une modification arrive en ligne. Les choix d'architecture et l'historique sont dans [`PLAN.md`](https://github.com/Volfieldd/deux-regards/blob/main/PLAN.md).

## Organisation du code

| Dossier | Contenu |
|---|---|
| `server/` | serveur Fastify. `app.js` assemble tout (plugins, CSP et en-têtes, rendu Eta, fichiers statiques) ; `config.js` lit l'environnement ([Configuration](Configuration)) |
| `server/routes/` | `public.js` (site, trois langues, `/bonjour`, `/pour-vous`, `/confidentialite`), `admin.js` (admin), `rencontres.js` (Rencontres, cartes, QR des vêtements, app iPhone, droits RGPD ; enregistré dans le plugin admin), `media.js` (images), `brand.js` (emblème, favicon) |
| `server/*.js` | un module par sujet : `auth.js` / `oidc.js` / `sessions.js` (connexion), `repo.js` / `admin-repo.js` (données), `images.js` / `media.js` / `variants.js` / `watermark.js` (images), `proofs.js` / `timestamp.js` (preuves), `stats.js`, `instagram.js` / `instagram-limits.js`, `rights.js` (textes des droits FR/EN/DE), `privacy.js` (page Confidentialité FR/EN/DE), `i18n.js` (textes de l'interface, repli des traductions, détection de la langue), `translate.js` (LibreTranslate), `encounters.js` (rencontres, codes des cartes, consentements, durées de conservation), `vault.js` (chiffrement des données personnelles, `DATA_KEY`), `mailer.js` (SMTP facultatif), `cards.js` (planches de cartes), `textile.js` (QR des vêtements, texte en tracés), `zip.js` (export RGPD), `describe.js` / `describe-worker.js` (descriptions suggérées : file de nuit ; Florence-2 par transformers.js dans un processus à part, fichiers du modèle figés et vérifiés), `keywords-suggest.js` (mots-clés suggérés : vocabulaire `vocabulaire.json` et ses empreintes CLIP, `scripts/vocabulaire.mjs` après chaque changement du vocabulaire), `geo/` (villes GeoNames avec régions et noms FR/EN/DE, `scripts/villes.mjs` pour les régénérer ; projection de la carte), `themes.js`, `help.js` (aide intégrée) |
| `server/securite/` | Vigie (facultative) : `vocabulaire.js` (types d'événements, commun avec la Vigie), `detection.js` (saisies malveillantes, familles de navigateurs), `reseau.js` (adresse et position d'une requête), `index.js` (file, lots signés, tampon, budget, battement), `site.js` (branchement : crochets, pièges, comptes, configuration), `retrait.js` (effacement quand la Vigie est retirée) ; chargés seulement si `VIGIE_URL` est réglé (sauf `retrait.js`, `piege.js` et les fonctions pures de détection) |
| `vigie/` | service de la Vigie (image à part, `Dockerfile.vigie`, dépendances dans `vigie/package.json`) : `index.js` (démarrage), `ingest.js` (réception signée, décisions), `store.js` (base chaînée, purge), `decisions.js`, `interrupteurs.js`, `zitadel.js` et `zitadel/types-suivis.json`, `backup.js`, `cli.js` ; seul `server/securite/vocabulaire.js` est partagé avec le site. Voir [Vigie](Vigie) |
| `server/db/` | migrations SQL, seed de démonstration, CLI (`migrate`, `seed`, `variants`), sauvegarde (`backup.js`) et restauration (`restore.js`) |
| `views/`, `views/admin/` | gabarits Eta du site et de l'admin |
| `public/` | `css/` et `js/` du site, `admin/` (CSS et JS de l'admin), `themes/` |
| `docs/aide/` | aide intégrée de l'admin, source unique (aussi publiée dans ce wiki) |
| `docs/wiki/` | sources de ce wiki |
| `test/`, `e2e/` | tests serveur (`node:test`) et navigateur (Playwright) : voir [Tests](Tests) |
| `deploy/unraid/` | paquet de déploiement |

## Règles du projet

- **Français partout** : interface, commentaires, messages de commit, documentation.
- **Pas de framework front ni d'étape de build.** Le serveur rend les pages ; le JavaScript n'est qu'une amélioration. Le site public doit fonctionner sans JS (`data-js-only` : visible seulement avec JS ; `data-nojs` : seulement sans).
- **CSP stricte, rien de tiers** (`server/app.js`) : aucun script ni style en ligne, aucune ressource d'un autre site. Un style dynamique passe par une classe CSS ou par `element.style` en JS (autorisé), jamais par un attribut `style="…"` dans un gabarit.
- **Échappement** : dans les gabarits, `<%= … %>` (échappé) pour toute donnée ; `<%~ … %>` (brut) seulement pour du HTML produit par le serveur et de confiance.
- **Migrations** : un nouveau fichier `NNN_nom.sql` par changement de schéma ; ne jamais modifier une migration déjà fusionnée.
- **Données personnelles** : tout nouveau champ qui concerne une personne passe par `vault.js` (`seal` à l'écriture, `open` à la lecture), a une durée de conservation (`purge` dans `encounters.js`), figure dans l'export (`exportData`) et sur la page `/confidentialite` (`privacy.js`), et met à jour la page [RGPD](RGPD) (registre).
- **Réglages** : table `settings`, une clé par réglage, valeur JSON. Un texte « par défaut » est stocké vide et affiché tel quel dans l'admin (exemple : `server/rights.js`).
- **Originaux** : jamais servis. Seules les variantes sortent (`/media/`, `/admin/media/` pour les brouillons).
- **Accessibilité** : cibles d'au moins 44 px sur téléphone, focus visible, champs étiquetés ; l'admin doit rester utilisable sur iPhone (projet e2e `iphone`).
- **Tests** : toute correction de bogue arrive avec le test qui l'aurait détecté.

## Cycle d'une modification

1. **Branche** depuis `main`, nommée par nature : `feat/…`, `fix/…`, `docs/…`, `design/…`, `deploy/…`.
2. **Code, tests, documentation** dans la même branche (voir le tableau ci-dessous).
   - **Nouveautés** : une PR qui change ce que voit un utilisateur ajoute son entrée en tête de `server/nouveautes.json` (titre et lignes en français, anglais et allemand ; `perm` facultatif pour ne la montrer qu'à qui a ce droit) et passe la version de `package.json` (et `package-lock.json`) à **1.<numéro de la PR>.0**. `test/nouveautes.test.js` vérifie les trois langues, l'ordre, et que la version installée est la plus récente. Chaque compte voit la fenêtre « Nouveautés » une seule fois, à sa connexion suivante.
3. **Vérifier** : `npm test` doit passer ; pour une modification d'interface, lancer aussi les tests navigateur contre un serveur de test (voir plus bas).
4. **PR** vers `main` avec : le contexte (le problème), les changements, les vérifications faites, et un paragraphe **Sécurité** (ce qui est exposé, échappé, protégé).
5. **Fusion** (commit de fusion). GitHub Actions construit l'image Docker et la publie sur `ghcr.io/volfieldd/deux-regards` avec les étiquettes `latest` et `sha-xxxxxxx` (suivi : `gh run list`).
6. **Déploiement** sur Unraid : **Compose Pull** puis **Compose Up** ([Déploiement](Déploiement)).

### Quelle documentation mettre à jour

| La modification change… | Mettre à jour |
|---|---|
| un geste ou un écran de l'admin | l'aide (`docs/aide/`), et [Visite de l'admin](Visite-de-l-admin) si un écran change |
| ce que voit le visiteur, ou une fonction | [Spécifications](Spécifications), et `docs/aide/10-site-public.md` |
| une variable d'environnement | [Configuration](Configuration), `.env.example`, `deploy/unraid/env.example` |
| l'installation, la mise en ligne, la sauvegarde | [Installation](Installation), [Déploiement](Déploiement), [Exploitation](Exploitation) |
| une protection | [Sécurité](Sécurité) |
| un fichier de test ou un projet e2e | [Tests](Tests) |
| une étape franchie, ou ce qui reste à faire | `PLAN.md` (phases et feuille de route) |

Les liens de l'admin vers l'aide utilisent des ancres calculées depuis les titres (`anchor` dans `server/help.js`). Renommer un titre de l'aide oblige à corriger les liens qui y pointent (`grep -rn "admin/aide#" views server public`) ; `test/aide.test.js` vérifie les liens internes.

## Serveur de test jetable

Pour essayer une branche sans toucher à vos données :

```bash
export STORAGE_DIR=/tmp/nicephos-test DATABASE_PATH=/tmp/nicephos-test/site.db
export PORT=3311 PUBLIC_URL=http://localhost:3311 LOCAL_AUTH_TOKEN=un-jeton-de-test-assez-long
npm run seed && npm start
```

Puis, dans un autre terminal, les tests navigateur contre ce serveur :

```bash
BASE_URL=http://localhost:3311 E2E_LOCAL_AUTH=un-jeton-de-test-assez-long npm run e2e -- --project=desktop --project=mobile --project=iphone
```

Ajouter `E2E_ALLOW_WRITES=1` pour les tests qui modifient des données (réservé à ce genre de serveur jetable).

## Pièges connus

- **Photos de démonstration trop petites** (900 × 600 px) : elles masquent les défauts de taille. Vérifier une modification d'images ou de vignettes avec de vraies photos de 24 Mpx.
- **Encodage AVIF lent** : `npm test` fixe `AVIF_EFFORT=0` pour aller vite ; la production garde l'effort par défaut.
- **Tests navigateur** : le conteneur fait `npm install` dans `e2e/`. Si ce dossier n'est pas inscriptible par l'utilisateur courant, lancer depuis une copie. Le test `statistiques` peut échouer quand tous les projets tournent ensemble (il compte aussi les visites des autres tests) ; il passe seul.
- **Captures pleine page dans WebKit** : Playwright injecte une feuille de style que la CSP refuse, d'où un message « Refused to apply a stylesheet ». Ce n'est pas un défaut du site.
- **Dépôt appartenant à un autre utilisateur système** : Git refuse de travailler (« dubious ownership ») ; ajouter `git config --global --add safe.directory <chemin>` pour votre utilisateur, ou passer `-c safe.directory=<chemin>` à chaque commande.
