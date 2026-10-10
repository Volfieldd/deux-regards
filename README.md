# Site photo

Galerie de Sébastien et Julien, avec un admin réservé aux auteurs (connexion OIDC via Zitadel Cloud). Nom provisoire : « Deux Regards », réglable par `SITE_NAME`.

Le plan complet est dans [PLAN.md](PLAN.md).

## Documentation

- **Wiki** (mode opératoire, configuration, exploitation) : sources dans [`docs/wiki/`](docs/wiki/), publiées sur le [wiki GitHub](https://github.com/Volfieldd/deux-regards/wiki) par `docs/wiki/publish.sh`.
- **Spécifications** : [`docs/specs/`](docs/specs/), dont [filigrane et EXIF](docs/specs/filigrane-et-exif.md).

## Déployer

Docker + Cloudflare Tunnel, données persistantes et sauvegardes : voir [docs/wiki/Déploiement.md](docs/wiki/Déploiement.md).

## Démarrer

Prérequis : Node.js 22+.

```bash
npm install
cp .env.example .env   # puis compléter
npm run seed           # crée la base et importe les 12 photos de démonstration
npm run dev            # http://localhost:3000
```

## Connexion à l'admin

L'admin (`/admin`) n'accepte que des comptes OIDC portant le rôle de projet `admin` (Zitadel), ou, en repli, un `sub` listé dans `OIDC_ALLOWED_SUBS` avec un e-mail vérifié. Renseigner `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID` et `OIDC_ORG_ID` dans `.env`, et déclarer `PUBLIC_URL/auth/callback` comme URL de redirection dans Zitadel. Sans ces variables, le site public fonctionne et `/auth/login` répond 503.

Dès que `PUBLIC_URL` est en HTTPS (ou `NODE_ENV=production`), le serveur refuse de démarrer sans `COOKIE_SECRET` ou avec un émetteur OIDC en HTTP.

### Connexion locale de test

Pour tester l'admin sans Zitadel, définir `LOCAL_AUTH_TOKEN` (16 caractères ou plus) : `/auth/login` mène alors à un formulaire qui demande ce jeton et l'auteur à incarner. Un bandeau rouge le signale dans l'admin. Le serveur refuse de démarrer avec cette variable dès que le site est en ligne (`PUBLIC_URL` en HTTPS ou `NODE_ENV=production`).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur avec rechargement automatique |
| `npm start` | serveur |
| `npm run migrate` | applique les migrations SQL en attente |
| `npm run seed` | migrations + jeu de démonstration (ignoré si des photos existent) |
| `npm run variants` | régénère les images servies (`-- --force` pour tout refaire) |
| `npm test` | tests (`node:test`) |
| `npm run e2e` | tests navigateur dans le conteneur Playwright officiel, contre un serveur démarré (`BASE_URL`, et `E2E_LOCAL_AUTH` = `LOCAL_AUTH_TOKEN` pour l'admin) |

## Données

Tout est dans `STORAGE_DIR` (par défaut `./storage`, hors Git) : la base SQLite, `originals/` (jamais servi) et `variants/` (AVIF/WebP sans EXIF, servis sous `/media/`). Sauvegarder ce dossier suffit.
