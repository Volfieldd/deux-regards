# Site photo

Galerie de Sébastien et Julien, avec un admin réservé aux auteurs (connexion OIDC via Zitadel Cloud). Nom provisoire : « Deux Regards », réglable par `SITE_NAME`.

Le plan complet est dans [PLAN.md](PLAN.md).

## Démarrer

Prérequis : Node.js 22+.

```bash
npm install
cp .env.example .env   # puis compléter
npm run seed           # crée la base et importe les 12 photos de démonstration
npm run dev            # http://localhost:3000
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur avec rechargement automatique |
| `npm start` | serveur |
| `npm run migrate` | applique les migrations SQL en attente |
| `npm run seed` | migrations + jeu de démonstration (ignoré si des photos existent) |
| `npm run variants` | régénère les images servies (`-- --force` pour tout refaire) |
| `npm test` | tests (`node:test`) |

## Données

Tout est dans `STORAGE_DIR` (par défaut `./storage`, hors Git) : la base SQLite, `originals/` (jamais servi) et `variants/` (AVIF/WebP sans EXIF, servis sous `/media/`). Sauvegarder ce dossier suffit.
