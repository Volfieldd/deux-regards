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

En production, utilisez Docker : voir [Déploiement](Déploiement).

## Ce qui est créé

Tout est créé dans `STORAGE_DIR` (par défaut `./storage`, hors Git) :

```
storage/
  site.db          base SQLite (photos, séries, auteurs, réglages, sessions, preuves, statistiques, Instagram)
  originals/       originaux importés, jamais servis
  variants/        images servies (AVIF/WebP), recalculables
  watermarks/      logo du filigrane
  brand/           fichiers de marque (emblème, icône, logo complet, image de partage)
  tmp/             fichiers en cours d'import
```

Les dossiers apparaissent au premier usage. Les migrations SQL (`server/db/migrations/`, numérotées `001` à `012`) s'appliquent seules au démarrage, et aussi avec `npm run migrate`.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur avec rechargement automatique |
| `npm start` | serveur |
| `npm run migrate` | applique les migrations en attente |
| `npm run seed` | migrations + jeu de démonstration (ignoré si des photos existent) |
| `npm run variants` | vérifie et recalcule les images servies (`-- --force` : tout recalculer) |
| `npm run backup` | une sauvegarde de la base et des fichiers irremplaçables dans `BACKUP_DIR` (voir [Exploitation](Exploitation#sauvegarde)) |
| `npm test` | tests unitaires et d'intégration |
| `npm run e2e` | tests navigateur dans le conteneur Playwright, contre un serveur déjà démarré (voir [Tests](Tests)) |

## Se connecter sans Zitadel (tests)

Ajoutez `LOCAL_AUTH_TOKEN=<au moins 16 caractères>` à `.env`. `/admin` mène alors à un formulaire « Connexion de test ». Voir [Connexion et comptes](Connexion-et-comptes#connexion-locale-de-test).
