# Configuration

Tout se règle par variables d'environnement, dans le fichier `.env` (lu par `npm start` et `npm run dev`) ou dans l'environnement du conteneur. Le modèle commenté est [`.env.example`](https://github.com/Volfieldd/deux-regards/blob/main/.env.example).

## Site et serveur

| Variable | Défaut | Rôle |
|---|---|---|
| `SITE_NAME` | `Deux Regards` | Nom affiché, si l'admin n'en définit pas (**Réglages → Nom du site**). |
| `HOST` | `127.0.0.1` | Adresse d'écoute. |
| `PORT` | `3000` | Port d'écoute. |
| `PUBLIC_URL` | `http://localhost:PORT` | URL publique : liens absolus (Open Graph, URL canonique), redirections OIDC. **En HTTPS, le site est considéré « en ligne »** (voir plus bas). |
| `NODE_ENV` | — | `production` : cache des gabarits, CSS/JS en cache long, et site considéré « en ligne ». |
| `TRUST_PROXY` | en ligne : `loopback,uniquelocal` ; sinon aucun | Proxys dont on accepte `X-Forwarded-*` : liste d'IP, de CIDR ou de mots-clés (`loopback`, `uniquelocal`), ou nombre de proxys (`1`). `false` : aucun. `true` est **refusé** (n'importe quel client pourrait se faire passer pour un autre et contourner la limite de connexions). Indiquez l'adresse exacte de Caddy. |
| `COOKIE_SECRET` | secret de développement | Signature des cookies, 32 caractères au moins. **Obligatoire en ligne, et dès que `HOST` n'est pas une adresse locale** (`127.0.0.1`, `::1`, `localhost`). |

## Données

| Variable | Défaut | Rôle |
|---|---|---|
| `STORAGE_DIR` | `./storage` | Dossier des images, du logo et des fichiers temporaires. |
| `DATABASE_PATH` | `STORAGE_DIR/site.db` | Base SQLite. |
| `AVIF_EFFORT` | `4` | Effort d'encodage AVIF, de 0 (rapide) à 9 (plus compact). |

## Connexion

| Variable | Défaut | Rôle |
|---|---|---|
| `OIDC_ISSUER` | — | URL de l'instance Zitadel, par exemple `https://monsite-abc123.zitadel.cloud`. **HTTPS obligatoire en ligne.** |
| `OIDC_CLIENT_ID` | — | Identifiant de l'application OIDC. |
| `OIDC_CLIENT_SECRET` | — | Secret de l'application (méthode « Code »). Vide : client public, PKCE seul. |
| `OIDC_REDIRECT_URI` | `PUBLIC_URL/auth/callback` | À déclarer à l'identique dans Zitadel. |
| `OIDC_PROJECT_ID` | — | Projet Zitadel : ajoute le projet à l'audience pour recevoir les rôles. |
| `OIDC_ORG_ID` | — | Organisation propriétaire du projet. Un rôle donné dans une autre organisation est ignoré. Fortement recommandé. |
| `OIDC_ADMIN_ROLE` | `admin` | Rôle de projet qui ouvre l'admin. |
| `OIDC_ALLOWED_SUBS` | — | Repli sans Zitadel (Google en direct) : identifiants `sub` autorisés, séparés par des virgules, avec e-mail vérifié. |
| `AUTH_RATE_LIMIT` | `30` | Tentatives de connexion (retours de l'IdP, envois du formulaire de test) par adresse sur 10 minutes ; une adresse IPv6 compte par bloc /64. La simple redirection vers l'IdP n'est pas comptée. |
| `LOCAL_AUTH_TOKEN` | — | Connexion locale de **test**, 16 caractères au moins. **Refusée en ligne.** |

## Preuves d'antériorité

| Variable | Défaut | Rôle |
|---|---|---|
| `TSA_URL` | `https://freetsa.org/tsr` | Autorité d'horodatage RFC 3161. `off` : pas d'horodatage (les empreintes restent calculées). **HTTPS obligatoire en ligne.** |
| `TSA_CA_FILE` | certificat FreeTSA fourni (`assets/tsa/`) si `TSA_URL` est la valeur par défaut | Certificat racine de l'autorité, au format PEM : la chaîne de chaque jeton est vérifiée jusqu'à lui. |

Pour une présomption d'exactitude de la date (eIDAS), choisissez une **autorité qualifiée** figurant sur la liste de confiance européenne. Reportez alors son URL RFC 3161 dans `TSA_URL` et son certificat racine dans `TSA_CA_FILE`. Le serveur doit pouvoir joindre cette URL en sortie.

## Site « en ligne »

Dès que `PUBLIC_URL` est en HTTPS ou que `NODE_ENV=production`, le serveur **refuse de démarrer** dans les cas suivants :

- `COOKIE_SECRET` est absent ;
- `OIDC_ISSUER` est en HTTP ;
- `LOCAL_AUTH_TOKEN` est défini ;
- `TSA_URL` est en HTTP.

Il fait aussi confiance au proxy local, et envoie l'en-tête HSTS quand `PUBLIC_URL` est en HTTPS. Ces protections ne dépendent donc pas d'une seule variable qu'on pourrait oublier.
