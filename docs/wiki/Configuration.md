# Configuration

Tout se règle par variables d'environnement, dans le fichier `.env` (lu par les scripts `npm` grâce à `--env-file-if-exists=.env`) ou dans l'environnement du conteneur. Modèles commentés : [`.env.example`](https://github.com/Volfieldd/deux-regards/blob/main/.env.example) (poste de développement, Compose générique) et [`deploy/unraid/env.example`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/env.example) (Unraid).

Le serveur lit presque tout dans [`server/config.js`](https://github.com/Volfieldd/deux-regards/blob/main/server/config.js). Quelques variables sont lues ailleurs : la colonne « Lu dans » l'indique. Les variables propres à Docker Compose (`DATA_DIR`, `BACKUP_DIR` côté hôte, `APP_UID`, `TUNNEL_TOKEN`…) ne sont pas lues par le serveur : voir [Déploiement](Déploiement).

## Site et serveur

| Variable | Défaut | Rôle |
|---|---|---|
| `SITE_NAME` | `Nicephos` | Nom affiché, si l'admin n'en définit pas (**Site public → Nom du site**). |
| `HOST` | `127.0.0.1` | Adresse d'écoute. |
| `PORT` | `3000` | Port d'écoute. |
| `PUBLIC_URL` | `http://localhost:PORT` | URL publique : liens absolus (Open Graph, URL canonique), redirections OIDC. **En HTTPS, le site est considéré « en ligne »** (voir plus bas). |
| `NODE_ENV` | — (`production` dans l'image Docker) | `production` : cache des gabarits, CSS/JS en cache long, et site considéré « en ligne ». |
| `TRUST_PROXY` | en ligne : `loopback,uniquelocal` ; sinon aucun | Proxys dont on accepte `X-Forwarded-*` : liste d'IP, de CIDR ou de mots-clés (`loopback`, `uniquelocal`), ou nombre de proxys (`1`). `false` : aucun. `true` est **refusé** (n'importe quel client pourrait se faire passer pour un autre et contourner la limite de connexions). Indiquez l'adresse exacte du proxy : sur Unraid, la pile la fixe à l'adresse du conteneur `cloudflared` (`TUNNEL_IP`, `172.29.42.10` par défaut). |
| `COOKIE_SECRET` | secret de développement | Signature des cookies, 32 caractères au moins. **Obligatoire en ligne, et dès que `HOST` n'est pas une adresse locale** (`127.0.0.1`, `::1`, `localhost`). |

## Données

| Variable | Défaut | Lu dans | Rôle |
|---|---|---|---|
| `STORAGE_DIR` | `./storage` (`/data` dans l'image) | `config.js`, `db/backup.js` | Dossier des originaux, variantes, logos, marque et fichiers temporaires ; la base y est aussi par défaut. |
| `DATABASE_PATH` | `STORAGE_DIR/site.db` | `config.js`, `db/backup.js` | Base SQLite. |
| `IMAGE_THREADS` | `4` (ou le nombre de cœurs s'il est plus petit) | `server/images.js` | Threads de libvips (sharp) par opération d'image, de 1 à 16. Sous Linux glibc, sharp n'en prend qu'**un** par défaut : ce réglage accélère fortement le calcul des variantes. L'image Docker charge jemalloc pour que la mémoire ne se fragmente pas. |
| `IMPORT_CONCURRENCY` | `2` | `server/imports.js` | Photos importées traitées en même temps (1 à 8). Mémoire : environ 100 Mo par photo de 24 Mpx en cours. |
| `AVIF_EFFORT` | `4` | `server/images.js` | Effort d'encodage AVIF des variantes, de 0 (rapide) à 9 (plus compact) ; hors bornes, ramené dans 0–9. `npm test` le met à `0` pour accélérer les tests. |
| `REQUIRE_PERSISTENT_STORAGE` | — (`1` dans l'image Docker) | `server/storage-guard.js`, `db/backup.js` | `1` : refus de démarrer si `STORAGE_DIR` n'est pas un point de montage (données perdues à la recréation du conteneur) ou n'est pas inscriptible. Le service de sauvegarde vérifie aussi `BACKUP_DIR`. |

## Sauvegarde

Lues par [`server/db/backup.js`](https://github.com/Volfieldd/deux-regards/blob/main/server/db/backup.js) seulement : `npm run backup` (une sauvegarde) ou `node server/db/backup.js --loop` (une sauvegarde, puis une à chaque intervalle ; c'est le service `backup` de Compose). Voir [Déploiement](Déploiement#sauvegardes).

| Variable | Défaut | Rôle |
|---|---|---|
| `BACKUP_DIR` | — | Dossier des sauvegardes. **Obligatoire** pour le script, et jamais à l'intérieur de `STORAGE_DIR`. Dans Compose, c'est `/backups`, monté depuis le `BACKUP_DIR` de l'hôte. |
| `BACKUP_KEEP` | `14` | Nombre d'instantanés de la base conservés (1 au moins). |
| `BACKUP_INTERVAL_HOURS` | `24` | Intervalle entre deux sauvegardes avec `--loop` (1 au moins). |
| `BACKUP_DELETED_DAYS` | `90` | Jours pendant lesquels un fichier supprimé des données (original, logo) reste dans la sauvegarde avant d'en être effacé (droit à l'effacement). Garde-fou : un dossier source vide n'efface rien. |

## Connexion

| Variable | Défaut | Rôle |
|---|---|---|
| `OIDC_ISSUER` | — | URL de l'instance Zitadel, par exemple `https://monsite-abc123.zitadel.cloud`. **HTTPS obligatoire en ligne.** |
| `OIDC_CLIENT_ID` | — | Identifiant de l'application OIDC. |
| `OIDC_CLIENT_SECRET` | — | Secret de l'application (méthode « Code »). Vide : client public, PKCE seul. |
| `OIDC_REDIRECT_URI` | `PUBLIC_URL/auth/callback` | À déclarer à l'identique dans Zitadel. |
| `OIDC_PROJECT_ID` | — | Projet Zitadel : ajoute le projet à l'audience pour recevoir les rôles. |
| `OIDC_ORG_ID` | — | Organisation propriétaire du projet. Un rôle donné dans une autre organisation est ignoré. Fortement recommandé : sans lui (et avec `OIDC_PROJECT_ID`), le serveur l'écrit dans ses journaux au démarrage. |
| `OIDC_ADMIN_ROLE` | `admin` | Rôle de projet qui ouvre l'admin. |
| `ADMIN_SUBS` | — | Garde-fou : identifiants `sub` (séparés par des virgules) toujours administrateurs, quoi qu'il arrive aux comptes dans l'admin. Conseillé : le vôtre. |
| `OIDC_ALLOWED_SUBS` | — | Repli sans Zitadel (Google en direct) : identifiants `sub` autorisés, séparés par des virgules, avec e-mail vérifié. |
| `AUTH_RATE_LIMIT` | `30` | Tentatives de connexion (retours de l'IdP, envois du formulaire de test) par adresse sur 10 minutes ; une adresse IPv6 compte par bloc /64. La simple redirection vers l'IdP n'est pas comptée. |
| `LOCAL_AUTH_TOKEN` | — | Connexion locale de **test**, 16 caractères au moins. **Refusée en ligne.** |

## Instagram

Facultatif : publication des photos sur un compte Instagram professionnel. Voir [Instagram](Instagram).

| Variable | Défaut | Rôle |
|---|---|---|
| `INSTAGRAM_APP_ID` | — | ID de l'application **Instagram** (Meta). Avec le secret, active la connexion du compte ; il faut aussi `PUBLIC_URL` en HTTPS (adresse de retour `PUBLIC_URL/admin/instagram/callback`). |
| `INSTAGRAM_APP_SECRET` | — | Clé secrète de l'application Instagram. |
| `INSTAGRAM_TOKEN_KEY` | dérivée de `COOKIE_SECRET` | Clé de chiffrement du jeton d'accès Instagram (32 caractères au moins). |
| `INSTAGRAM_API_VERSION` | `v23.0` | Version de l'API Graph d'Instagram, au format `vNN.N` ; une autre valeur est ignorée. |

## Preuves d'antériorité

| Variable | Défaut | Rôle |
|---|---|---|
| `TSA_URL` | `https://freetsa.org/tsr` | Autorité d'horodatage RFC 3161. `off` : pas d'horodatage (les empreintes restent calculées). **HTTPS obligatoire en ligne.** |
| `TSA_CA_FILE` | certificat FreeTSA fourni (`assets/tsa/freetsa-cacert.pem`) si `TSA_URL` est la valeur par défaut ; sinon aucun | Certificat racine de l'autorité, au format PEM : la chaîne de chaque jeton est vérifiée jusqu'à lui. Sans lui, la vérification affiche « autorité non vérifiée ». |

Pour une présomption d'exactitude de la date (eIDAS), choisissez une **autorité qualifiée** figurant sur la liste de confiance européenne. Reportez alors son URL RFC 3161 dans `TSA_URL` et son certificat racine dans `TSA_CA_FILE`. Le serveur doit pouvoir joindre cette URL en sortie.

## Site « en ligne »

Dès que `PUBLIC_URL` est en HTTPS ou que `NODE_ENV=production`, le serveur **refuse de démarrer** dans les cas suivants :

- `COOKIE_SECRET` est absent ;
- `OIDC_ISSUER` est en HTTP ;
- `LOCAL_AUTH_TOKEN` est défini ;
- `TSA_URL` est en HTTP.

Le serveur refuse aussi de démarrer, en ligne ou non, si `COOKIE_SECRET` fait moins de 32 caractères, si `LOCAL_AUTH_TOKEN` en fait moins de 16, si `INSTAGRAM_TOKEN_KEY` en fait moins de 32, si `TRUST_PROXY=true`, ou si `COOKIE_SECRET` manque alors que `HOST` n'est pas une adresse locale.

En ligne, il fait aussi confiance par défaut aux proxys locaux (`TRUST_PROXY`). Quand `PUBLIC_URL` est en HTTPS, les cookies sont `Secure` et préfixés `__Host-`, et les en-têtes HSTS et COOP sont envoyés. Ces protections ne dépendent donc pas d'une seule variable qu'on pourrait oublier.

## Données personnelles, e-mails, traduction

| Variable | Défaut | Rôle |
|---|---|---|
| `DATA_KEY` | — | Clé de chiffrement des données personnelles des rencontres dans la base (noms, e-mails, signatures, photos de repère, messages, positions), 32 caractères au moins (`openssl rand -base64 32`). **Gardez-en une copie hors du serveur : perdue, ces données sont illisibles.** Sans elle, rien n'est chiffré (Droits & confidentialité le signale). Données existantes chiffrées au démarrage. Voir [RGPD](RGPD). |
| `SMTP_URL` | — | Envoi d'e-mails par le serveur (récapitulatif d'une rencontre, circuit de publication, demandes RGPD et leurs relances, récapitulatifs de « Aujourd'hui » ; test depuis Comptes et rôles), par votre propre boîte : `smtps://utilisateur:motdepasse@serveur:465`. Sans elle : bouton « Mail » sur le téléphone. |
| `MAIL_FROM` | — | Expéditeur, **obligatoire avec `SMTP_URL`** : `Nicephos <adresse@exemple.fr>`. |
| `TRANSLATE_URL` | — (pile Unraid : `http://libretranslate:5000`) | Serveur LibreTranslate du réseau local pour les propositions de traduction dans l'admin. Sans elle, pas de bouton. |
| `TRANSLATE_API_KEY` | — | Clé, seulement si votre LibreTranslate en exige une. |

