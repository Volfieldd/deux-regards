# Déploiement (Docker et Cloudflare Tunnel)

> **Unraid :** guide et fichiers prêts à l'emploi dans [`deploy/unraid/`](https://github.com/Volfieldd/deux-regards/tree/main/deploy/unraid) : pile Compose, modèles Unraid, export des données, configuration de Zitadel et de Cloudflare. Le site de production est `https://www.nicephos.art`. L'image est publiée sur `ghcr.io/volfieldd/deux-regards` à chaque mise à jour de `main` (voir [Image Docker](#image-docker)).

Cette page décrit la pile générique du dépôt (`compose.yaml` à la racine), qui **construit l'image sur place**. La pile Unraid, elle, télécharge l'image publiée.

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

L'adresse réelle des visiteurs arrive par `X-Forwarded-For`. Le site fait confiance aux adresses privées (`TRUST_PROXY` par défaut en ligne : `loopback,uniquelocal`), donc à `cloudflared` sur le réseau Docker : la limite de connexions s'applique par visiteur, pas au tunnel entier. Si le port du site est ouvert sur le réseau local (`BIND_ADDR`), un poste de ce réseau peut lui aussi se faire passer pour un autre visiteur : fixez alors `TRUST_PROXY` à l'adresse exacte de `cloudflared`, comme le fait la pile Unraid (réseau dédié, `TUNNEL_IP`).

## Cloudflare : une seule adresse publique

Le site n'a qu'une adresse canonique, celle de `PUBLIC_URL` (en production `https://www.nicephos.art`). Elle sert aux liens absolus, à la connexion Zitadel, à Instagram et aux mentions de droits des images. Toutes les autres adresses (`nicephos.art` sans `www`, autres sous-domaines, `http://`) y sont redirigées par Cloudflare, avant d'atteindre le tunnel.

1. **Tunnel :** le *Public hostname* du tunnel est `www.nicephos.art` (service `http://site:3000`, ou `nicephos:3000` sur Unraid).
2. **DNS :** pour que Cloudflare puisse rediriger une adresse, elle doit exister et être **proxifiée** (nuage orange) : un enregistrement pour `@` et un pour `*`. Leur cible importe peu, puisque la règle répond avant tout contact avec un serveur (par exemple un `A` vers `192.0.2.1`, adresse de documentation jamais jointe). `www` garde l'enregistrement `CNAME` créé par le tunnel.
3. **Rules → Redirect Rules → Create rule :**
   - *If incoming requests match…* : **Custom filter expression**, puis *Field* **Hostname**, *Operator* **does not equal**, *Value* `www.nicephos.art` (sans guillemets). L'*Expression Preview* doit afficher exactement `(http.host ne "www.nicephos.art")` ;
   - *Then* : **Dynamic**, expression `concat("https://www.nicephos.art", http.request.uri.path)` ;
   - code **301**, case **Preserve query string** cochée.
4. **SSL/TLS → Edge Certificates → Always Use HTTPS** : activé. `http://www.nicephos.art` passe ainsi en HTTPS (la règle ci-dessus ne le traite pas, puisque l'hôte est déjà le bon).
5. **Network → IP Geolocation** : activé (c’est le cas par défaut). Cloudflare transmet alors le pays du visiteur (`CF-IPCountry`), utilisé par la carte de la page Statistiques ; sans lui, les visites sont comptées en « Pays inconnu ».

Pièges :

- **Expression dans le champ *Value* :** le champ *Value* n'attend qu'un nom de domaine. Y coller une expression (`http.host ne …`), ou laisser *Field* sur **URI Full**, produit une règle qui compare l'URL complète à ce texte : avec l'opérateur *wildcard*, elle ne correspond jamais (aucune redirection) ; avec *does not equal*, elle correspond toujours, y compris pour `www.nicephos.art`, d'où une **boucle de redirection** et un site inaccessible. Si cela arrive : désactiver la règle (le site revient aussitôt), corriger l'aperçu comme ci-dessus, et tester en **302** avant de repasser en 301 (un navigateur garde un 301 en mémoire).
- **Certificat :** le certificat gratuit de Cloudflare (*Universal SSL*) couvre `nicephos.art` et `*.nicephos.art`, soit **un seul niveau** de sous-domaine. `a.b.nicephos.art` provoquerait une erreur de certificat avant toute redirection : ne créez pas d'adresse à deux niveaux.

**Vérifier :** `curl -sI "https://nicephos.art/serie/rue?x=1"` doit répondre `301` avec `location: https://www.nicephos.art/serie/rue?x=1`, et `curl -sI https://www.nicephos.art/` doit répondre `200`.

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

## Image Docker

Le workflow [`.github/workflows/image.yml`](https://github.com/Volfieldd/deux-regards/blob/main/.github/workflows/image.yml) construit l'image (`linux/amd64`) à chaque push sur `main`, ou à la demande (*Run workflow*), et la publie sur `ghcr.io/volfieldd/deux-regards` avec deux étiquettes :

| Étiquette | Usage |
|---|---|
| `latest` | dernière version de `main` |
| `sha-xxxxxxx` | version d'un commit précis (7 premiers caractères) : pour revenir en arrière ou figer une version |

L'image ([`Dockerfile`](https://github.com/Volfieldd/deux-regards/blob/main/Dockerfile)) part de `node:22-bookworm-slim`, tourne sous l'utilisateur `node`, sans compilateur, et contient seulement le code, les gabarits, les fichiers publics, `assets/`, `seed/` et `docs/aide/`. Elle fixe `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`, `STORAGE_DIR=/data`, `DATABASE_PATH=/data/site.db` et `REQUIRE_PERSISTENT_STORAGE=1`, et vérifie sa santé sur `/healthz`. Elle n'a pas d'instruction `VOLUME` : sans montage de `/data`, le serveur refuse de démarrer.

## E-mails (facultatif)

Le récapitulatif d'une rencontre saisie sur le téléphone peut partir tout seul : `SMTP_URL` (par exemple `smtps://adresse%40gmail.com:motdepasse@smtp.gmail.com:465`, avec un mot de passe d'application Gmail) et `MAIL_FROM` (`Nicephos <adresse@gmail.com>`) dans le `.env`. Gratuit, par votre propre boîte : aucun service d'envoi tiers. Sans ces variables, l'écran propose d'envoyer le message depuis l'app Mail du téléphone.

## Traduction (facultatif)

Les propositions de traduction de l'admin passent par un serveur [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) installé à côté du site : `docker compose --profile traduction up -d`, puis `TRANSLATE_URL=http://libretranslate:5000` dans le `.env`. Il télécharge une fois ses modèles (fr, en, de, ~300 Mo dans le volume `traduction-modeles`) et travaille ensuite hors ligne : aucun texte ne sort du serveur. Environ 1 Go de mémoire. Sans `TRANSLATE_URL`, le bouton n'apparaît pas. Sur Unraid, le conteneur fait partie de la pile (voir `deploy/unraid/README.md`).

## Mettre à jour

Pile générique (image construite sur place) :

```bash
git pull
docker compose up -d --build        # migrations appliquées au démarrage
```

Pile Unraid (image publiée) : **Compose Pull** puis **Compose Up**. Pour revenir à une version précise, mettez `IMAGE=ghcr.io/volfieldd/deux-regards:sha-xxxxxxx` dans le `.env` de la pile. Attention : une migration déjà appliquée par une version plus récente n'est pas défaite ; en cas de doute, restaurez aussi la base d'avant la mise à jour.

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
