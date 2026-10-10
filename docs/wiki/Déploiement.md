# Déploiement (Docker et Cloudflare Tunnel)

Le site tourne dans Docker. Il est exposé sur Internet par un **tunnel Cloudflare** (`cloudflared`) : aucun port n'est ouvert vers l'extérieur et Cloudflare fournit le HTTPS, donc ni Caddy ni certificat à gérer.

```
Internet ──HTTPS──► Cloudflare ──tunnel──► cloudflared ──http://site:3000──► site
                                                                       │
                                                         /data ◄── dossier de l'hôte (DATA_DIR)
                                       backup (chaque jour) ──► dossier de l'hôte (BACKUP_DIR)
```

## Les données : où elles sont, et pourquoi elles ne peuvent pas se perdre

Tout l'état du site (base, originaux, preuves, logos, images servies) est dans **un dossier de l'hôte**, `DATA_DIR`, monté dans le conteneur sous `/data`. Plusieurs protections empêchent de le perdre :

| Risque | Protection |
|---|---|
| Oubli du montage | Le serveur **refuse de démarrer** si `/data` n'est pas un montage : « n'est pas un montage : les données seraient perdues ». |
| Dossier absent ou mal orthographié | Compose **refuse de démarrer** (`create_host_path: false`) au lieu de créer un dossier vide. |
| `docker compose down -v`, `docker system prune` | Sans effet : un dossier de l'hôte n'est pas un volume Docker. Vérifié : 12 photos et 12 preuves intactes après `down -v` et une reconstruction. |
| Recréation ou mise à jour de l'image | L'image ne contient aucune donnée, et le système de fichiers du conteneur est en lecture seule. |
| Arrêt brutal pendant un calcul d'image | Écritures atomiques et ménage au démarrage (voir [Images et variantes](Images-et-variantes)). |
| Panne du disque, fausse manœuvre | Sauvegarde quotidienne dans un **second dossier**, `BACKUP_DIR` (idéalement sur un autre disque, puis copié hors de la machine). |

## Installation

```bash
git clone https://github.com/Volfieldd/deux-regards.git && cd deux-regards
sudo mkdir -p /srv/site-photo/data /srv/site-photo/sauvegardes
sudo chown -R 1000:1000 /srv/site-photo         # ou l'utilisateur choisi par APP_UID/APP_GID
cp .env.example .env                             # puis compléter (voir ci-dessous)
docker compose --profile tunnel up -d --build
```

Variables propres au déploiement, dans `.env` :

| Variable | Exemple | Rôle |
|---|---|---|
| `DATA_DIR` | `/srv/site-photo/data` | Dossier des données sur l'hôte. **Obligatoire.** |
| `BACKUP_DIR` | `/srv/site-photo/sauvegardes` | Dossier des sauvegardes sur l'hôte. **Obligatoire**, et pas à l'intérieur de `DATA_DIR`. |
| `APP_UID`, `APP_GID` | `1000` | Utilisateur du conteneur, qui doit posséder les deux dossiers. |
| `BIND_ADDR`, `HOST_PORT` | `127.0.0.1`, `3000` | Port local du site, utile pour un contrôle ; cloudflared n'en a pas besoin. |
| `TUNNEL_TOKEN` | — | Jeton du tunnel Cloudflare (profil `tunnel`). |
| `BACKUP_KEEP` | `14` | Nombre d'instantanés de base conservés. |
| `BACKUP_INTERVAL_HOURS` | `24` | Fréquence des sauvegardes. |

Et pour le site en ligne :

```dotenv
NODE_ENV=production
PUBLIC_URL=https://photos.exemple.fr
COOKIE_SECRET=<32+ caractères aléatoires>
OIDC_ISSUER=… OIDC_CLIENT_ID=… OIDC_CLIENT_SECRET=… OIDC_PROJECT_ID=… OIDC_ORG_ID=…
# Pas de LOCAL_AUTH_TOKEN en ligne (le serveur refuserait de démarrer).
```

## Cloudflare Tunnel (une fois)

1. Cloudflare Zero Trust → **Networks → Tunnels → Create a tunnel** (type *Cloudflared*).
2. Copier le **jeton** affiché dans `TUNNEL_TOKEN` (fichier `.env`).
3. Dans le tunnel, ajouter un **Public hostname** : le domaine du site et le service `http://site:3000`. `site` est le nom du service dans `compose.yaml`.
4. Lancer `docker compose --profile tunnel up -d`.
5. Dans Zitadel, déclarer `https://<domaine>/auth/callback` et `https://<domaine>/`.

L'adresse réelle des visiteurs arrive par `X-Forwarded-For`. Le site fait confiance au réseau Docker local (`TRUST_PROXY` par défaut) : la limite de connexions s'applique donc par visiteur, pas au tunnel entier.

## Sauvegardes

Le service `backup` fait une sauvegarde au démarrage, puis toutes les 24 h :

```
BACKUP_DIR/
  db/site-2026-10-10T130335.db     instantané cohérent de la base, contrôlé (14 derniers gardés)
  files/originals/…                originaux : ajoutés, jamais effacés
  files/watermarks/…, files/brand/…
  last.json                        compte rendu de la dernière sauvegarde
```

- **Variantes :** elles ne sont pas sauvegardées, puisqu'elles se recalculent.
- **Originaux :** ceux qu'on supprime dans l'admin restent dans la sauvegarde.
- **Hors de la machine :** copiez aussi `BACKUP_DIR` ailleurs (`rsync`, `restic`, disque externe). Une sauvegarde sur la même machine ne protège pas d'une panne de celle-ci.

Vérifier : `cat $BACKUP_DIR/last.json` ou `docker compose logs backup`.

Sauvegarde manuelle : `docker compose run --rm backup node server/db/backup.js`.

## Restaurer

```bash
docker compose down
cp -a "$DATA_DIR" "$DATA_DIR.avant-restauration"                    # toujours garder l'état actuel
cp "$BACKUP_DIR/db/site-<date>.db" "$DATA_DIR/site.db" && rm -f "$DATA_DIR"/site.db-wal "$DATA_DIR"/site.db-shm
rsync -a "$BACKUP_DIR/files/" "$DATA_DIR/"                          # originaux, logos
docker compose up -d                                                 # les variantes se recalculent seules
```

Les preuves d'antériorité restent valides : elles portent sur les originaux, restaurés à l'identique.

## Mettre à jour

```bash
git pull
docker compose up -d --build        # migrations appliquées au démarrage
```

Pour plus de sûreté, faites d'abord une sauvegarde manuelle (voir plus haut).

## Serveur de test (réseau local, HTTP)

Pour un serveur de test sur le réseau local, sans tunnel ni Zitadel :

```dotenv
NODE_ENV=development
PUBLIC_URL=http://10.21.30.23:3080
BIND_ADDR=10.21.30.23
HOST_PORT=3080
COOKIE_SECRET=<…>
LOCAL_AUTH_TOKEN=<…>
```

Lancement : `docker compose up -d --build`, sans le profil `tunnel`.
