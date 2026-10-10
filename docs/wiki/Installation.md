# Installation

## Prérequis

- Node.js 22 ou plus récent (voir `.nvmrc`).
- Pour les tests navigateur seulement : Docker.

Aucune bibliothèque système n'est nécessaire : `sharp` embarque libvips, Pango et les codecs, et les polices du filigrane sont fournies dans `assets/fonts/`.

## Premier démarrage

```bash
git clone https://github.com/Volfieldd/deux-regards.git
cd deux-regards
npm install
cp .env.example .env      # puis compléter (voir Configuration)
npm run seed              # crée la base et importe les 12 photos de démonstration
npm run dev               # http://localhost:3000, rechargement automatique
```

En production, utilisez `npm start` (sans rechargement), avec `NODE_ENV=production` et une `PUBLIC_URL` en HTTPS.

## Ce qui est créé

Tout est créé dans `STORAGE_DIR` (par défaut `./storage`, hors Git) :

```
storage/
  site.db          base SQLite (photos, séries, auteurs, réglages, sessions)
  originals/       originaux importés, jamais servis
  variants/        images servies (AVIF/WebP), recalculables
  watermarks/      logo du filigrane
  tmp/             fichiers en cours d'import
```

Les migrations SQL (`server/db/migrations/`) s'appliquent seules au démarrage, et aussi avec `npm run migrate`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur avec rechargement automatique |
| `npm start` | serveur |
| `npm run migrate` | applique les migrations en attente |
| `npm run seed` | migrations + jeu de démonstration (ignoré si des photos existent) |
| `npm run variants` | vérifie et recalcule les images servies (`-- --force` : tout recalculer) |
| `npm test` | tests unitaires et d'intégration |
| `npm run e2e` | tests navigateur (voir [Tests](Tests)) |

## Se connecter sans Zitadel (tests)

Ajoutez `LOCAL_AUTH_TOKEN=<au moins 16 caractères>` à `.env`. `/admin` mène alors à un formulaire « Connexion de test ». Voir [Connexion et comptes](Connexion-et-comptes#connexion-locale-de-test).
