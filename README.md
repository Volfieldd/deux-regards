# Nicephos

Site photo de Sébastien et Julien : une galerie publique et une administration réservée aux auteurs. En ligne sur **https://www.nicephos.art**.

Le dépôt s'appelle `deux-regards`, le nom de travail du projet. Le nom affiché du site se règle dans l'admin (**Réglages**) ou par la variable `SITE_NAME`.

## En bref

- **Site public** : ouverture plein cadre, filtre par photographe, séries, grille, visionneuse (clavier, glissé, retour à l'endroit quitté), page Droits d'utilisation en français, anglais et allemand. Il fonctionne sans JavaScript et ne charge rien depuis un autre site.
- **Admin** (`/admin`) : import, édition, publication et ordre des photos ; séries, auteurs, réglages ; filigrane et EXIF ; preuves d'antériorité ; thèmes ; statistiques anonymes ; publication sur Instagram. Utilisable sur ordinateur et sur iPhone.
- **Connexion** : OIDC (Zitadel), rôle `admin` exigé. L'application ne gère aucun mot de passe.
- **Images** : les originaux ne sont jamais servis ; le site sert des variantes AVIF et WebP (640, 1280, 2000 px) ; chaque original est horodaté par une autorité tierce.
- **Technique** : Node.js 22, Fastify, SQLite, sharp, gabarits Eta. Pas de framework front, pas d'étape de build.

## Documentation : par où commencer

| Vous voulez… | Lire |
|---|---|
| Utiliser l'admin (publier, ranger, régler) | l'**aide intégrée** (menu « Aide » de l'admin), sources dans [`docs/aide/`](docs/aide/) |
| Installer, déployer, configurer, sauvegarder | le **wiki** : [`docs/wiki/`](docs/wiki/Home.md), publié sur le [wiki GitHub](https://github.com/Volfieldd/deux-regards/wiki) |
| Reprendre le développement | [Développer](docs/wiki/Développer.md) : organisation du code, conventions, cycle PR → image → déploiement |
| Savoir ce que fait le site, fonction par fonction | [Spécifications](docs/wiki/Spécifications.md) et [`docs/specs/`](docs/specs/) |
| Comprendre les choix et l'historique, voir ce qui reste à faire | [PLAN.md](PLAN.md) |
| Connaître les protections en place | [Sécurité](docs/wiki/Sécurité.md) |
| Relire les audits d'ergonomie et de design | [`docs/audit-ergonomie-2026-10/`](docs/audit-ergonomie-2026-10/README.md), [`docs/audit-iphone-2026-10/`](docs/audit-iphone-2026-10/README.md), [`docs/design-2026-10/`](docs/design-2026-10/README.md), [revue de code](docs/revue-2026-10.md) |

Règle : **une modification visible met à jour sa documentation dans la même PR** (aide si cela change un geste, wiki si cela change l'installation, l'exploitation ou une spécification, `PLAN.md` pour une étape ou la feuille de route).

## Démarrer en local

Prérequis : Node.js 22 ou plus.

```bash
npm install
cp .env.example .env   # puis compléter (voir docs/wiki/Configuration.md)
npm run seed           # crée la base et importe les 12 photos de démonstration
npm run dev            # http://localhost:3000
```

Pour entrer dans l'admin sans Zitadel, laissez les variables `OIDC_*` vides et mettez dans `.env` un `LOCAL_AUTH_TOKEN` de 16 caractères ou plus : `/admin` mène alors à un formulaire qui demande ce jeton et l'auteur à incarner. Un bandeau rouge le signale. Le serveur refuse de démarrer avec cette variable dès que le site est en ligne (`PUBLIC_URL` en HTTPS ou `NODE_ENV=production`).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur avec rechargement automatique |
| `npm start` | serveur |
| `npm run migrate` | applique les migrations SQL en attente |
| `npm run seed` | migrations + jeu de démonstration (ignoré si des photos existent) |
| `npm run variants` | régénère les images servies (`-- --force` pour tout refaire) |
| `npm run backup` | sauvegarde : instantané de la base et copie des originaux et logos dans `BACKUP_DIR` (`-- --loop` pour la répéter ; voir [Déploiement](docs/wiki/Déploiement.md)) |
| `npm test` | tests serveur (`node:test`) |
| `npm run e2e` | tests navigateur dans le conteneur Playwright officiel, contre un serveur démarré (voir [Tests](docs/wiki/Tests.md)) |

## Connexion à l'admin

L'admin n'accepte que des comptes qui ont un rôle, donné dans **Comptes et rôles** (Administrateur, Photographe, Modérateur, Relecteur) ; un compte inconnu arrive « en attente ». Le rôle de projet `admin` (Zitadel), ou, en repli, un `sub` listé dans `OIDC_ALLOWED_SUBS` avec un e-mail vérifié, ne sert qu'à créer un administrateur à sa première connexion. Renseigner `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID` et `OIDC_ORG_ID`, et déclarer `PUBLIC_URL/auth/callback` comme URL de redirection dans Zitadel. Sans ces variables, le site public fonctionne et `/auth/login` répond 503. Pas à pas : [Connexion et comptes](docs/wiki/Connexion-et-comptes.md).

Le serveur refuse de démarrer sans `COOKIE_SECRET` (32 caractères ou plus) dès que `PUBLIC_URL` est en HTTPS, que `NODE_ENV=production` ou qu'il écoute ailleurs qu'en local (`HOST` autre qu'une adresse de bouclage) ; il refuse aussi un émetteur OIDC en HTTP une fois en ligne.

## Mettre en production

1. Une PR est fusionnée sur `main`.
2. GitHub Actions construit l'image Docker et la publie sur `ghcr.io/volfieldd/deux-regards` (étiquettes `latest` et `sha-xxxxxxx`).
3. Sur le serveur Unraid : **Compose Pull** puis **Compose Up** (paquet dans [`deploy/unraid/`](deploy/unraid/README.md)).

Le site est exposé par Cloudflare Tunnel ; toutes les adresses (`nicephos.art`, sous-domaines, HTTP) sont redirigées vers `https://www.nicephos.art`. Détails, sauvegardes et restauration : [Déploiement](docs/wiki/Déploiement.md).

## Données

Tout est dans `STORAGE_DIR` (par défaut `./storage`, hors Git) : la base SQLite, `originals/` (jamais servis), `variants/` (AVIF/WebP, servis sous `/media/`, recalculables), `watermarks/` (logos de filigrane), `brand/` (emblème, favicon) et, si « Proposer une série » est allumé, `models/` (modèle d'analyse d'images, ≈ 90 Mo, retéléchargeable, hors sauvegarde). Sauvegarder ce dossier suffit ; `npm run backup` le fait sans arrêter le site.
