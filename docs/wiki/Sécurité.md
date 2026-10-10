# Sécurité

Cette page résume les protections en place. Chacune est couverte par des tests (`test/`).

## Accès à l'admin

- **Connexion OIDC uniquement**, sans aucun mot de passe dans l'application. Le site vérifie `state`, `nonce`, PKCE (S256), la signature, l'émetteur et l'audience.
- **Autorisation :** rôle de projet `admin`, lié à l'organisation `OIDC_ORG_ID`. Sans ce rôle : 403 et aucune session.
- **Sessions côté serveur :**
  - seule l'empreinte du jeton est en base ;
  - 8 h sans activité, 24 h au plus ;
  - régénérées à chaque connexion.
- **Cookies :** `httpOnly`, `SameSite=Lax`, et en HTTPS `Secure` avec le préfixe `__Host-`.
- **CSRF :** jeton synchronisé sur toute écriture. Pour un import, il doit précéder le premier fichier : aucun fichier n'est lu avant sa vérification.
- **Redirections :** le paramètre `next` est normalisé par l'analyseur d'URL. Une adresse qui mène hors du site, même avec des caractères de contrôle, est refusée.
- **Limite de débit :** tentatives de connexion limitées par IP (`AUTH_RATE_LIMIT`, 30 par 10 minutes par défaut).
- **Journaux :** le code et le `state` OIDC sont masqués.

## Site public

- **Politique de sécurité du contenu stricte :** tout vient du site lui-même, sans `unsafe-inline` ni ressource tierce ; seuls les formulaires peuvent rediriger vers l'IdP.
- **En-têtes :** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, et HSTS en HTTPS.
- **Contenu :** tout ce qui est saisi dans l'admin est échappé à l'affichage.
- **Images :**
  - les originaux ne sont jamais servis ;
  - les brouillons ne sont pas servis publiquement ;
  - aucune métadonnée par défaut.

## Preuves d'antériorité

- **Ce qui sort du serveur :** seule l'empreinte SHA-256 de l'original est envoyée à l'autorité d'horodatage, jamais l'image.
- **Contrôle des jetons avant conservation :** empreinte et nonce identiques à la demande, signature et validité du certificat, chaîne jusqu'au certificat racine attendu.
- **Téléchargement des originaux :** réservé à l'admin, pour constituer un dossier de preuve.

## Fichiers reçus

- **Photos :** formats JPEG, PNG, WebP, TIFF et HEIF, vérifiés par décodage. Limites : 60 Mo, 120 mégapixels (aussi imposées au décodage, contre les bombes de décompression) et 50 fichiers par envoi.
- **Logo du filigrane :** PNG ou WebP seulement (le SVG est refusé), 5 Mo, 4000 px de côté. Il est réencodé avant usage.
- **Stockage :** les noms de fichiers sont toujours générés par le site (UUID) ; le nom envoyé ne sert qu'à proposer un titre.

## Configuration en ligne

Dès que `PUBLIC_URL` est en HTTPS ou que `NODE_ENV=production`, le serveur refuse de démarrer dans les cas suivants :

- sans `COOKIE_SECRET` ;
- avec un émetteur OIDC en HTTP ;
- avec la connexion locale de test (`LOCAL_AUTH_TOKEN`).

## Points d'attention

- **Mode EXIF « Tout l'EXIF de l'original » :** il publie la position GPS des photos.
- **Rôle retiré dans Zitadel :** il cesse de valoir au plus tard 24 h après la dernière connexion de la personne.
- **HSTS :** il est envoyé sans `includeSubDomains`. À ajouter une fois le domaine choisi, si tous ses sous-domaines sont en HTTPS.
