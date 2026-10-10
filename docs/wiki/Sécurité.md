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
- **CSRF :** jeton synchronisé sur toute écriture (champ `_csrf` ou en-tête `x-csrf-token` pour les appels JSON de l'admin : envoi photo par photo, actions groupées, enregistrement champ par champ, ordre des séries). Pour un import, il doit précéder le premier fichier : aucun fichier n'est lu avant sa vérification.
- **Suppressions groupées :** jamais sans confirmation explicite (`confirm`) ; sans elle, l'admin affiche une page de confirmation.
- **Redirections :** le paramètre `next` est normalisé par l'analyseur d'URL. Une adresse qui mène hors du site est refusée, y compris avec des caractères de contrôle ou des segments `/./` ou `/../` qui, une fois normalisés, donneraient `//autre-site`.
- **Limite de débit :**
  - tentatives de connexion limitées par adresse (`AUTH_RATE_LIMIT`, 30 par 10 minutes par défaut) ;
  - IPv6 par bloc /64, mémoire bornée ;
  - `TRUST_PROXY=true` refusé.
- **Journal d'audit :** chaque action d'écriture de l'admin est journalisée (`action admin`), avec le compte (`sub`), la route et le résultat.
- **Journaux :** le code et le `state` OIDC sont masqués.

## Site public

- **Politique de sécurité du contenu stricte :** tout vient du site lui-même, sans `unsafe-inline` ni ressource tierce ; seuls les formulaires peuvent rediriger vers l'IdP. Seule ouverture : `img-src blob:`, pour l'aperçu local des photos choisies à l'import (adresses créées par le navigateur, jamais par un tiers).
- **En-têtes :** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, et HSTS en HTTPS.
- **Contenu :** tout ce qui est saisi dans l'admin est échappé à l'affichage.
- **Erreurs :** une erreur inattendue renvoie un message générique ; le détail (chemins, noms de fichiers) ne va que dans les journaux.
- **Images :**
  - les originaux ne sont jamais servis ;
  - les brouillons ne sont pas servis publiquement ;
  - aucune métadonnée par défaut.

## Preuves d'antériorité

- **Ce qui sort du serveur :** seule l'empreinte SHA-256 de l'original est envoyée à l'autorité d'horodatage, jamais l'image.
- **Contrôle des jetons avant conservation :**
  - empreinte SHA-256 et nonce identiques à la demande ;
  - attributs signés désignant un jeton d'horodatage ;
  - signature valide (SHA-1 refusé) ;
  - certificat signataire désigné par le jeton (`SigningCertificate`), d'usage « horodatage », valide à la date ;
  - chaîne jusqu'au certificat racine attendu.
- **Réponse de la TSA :** 64 ko au plus, sans redirection suivie ; un jeton mal formé est refusé proprement.
- **Sans certificat racine configuré :** la vérification le dit (« autorité non vérifiée ») au lieu de conclure « preuve valide ».
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
- **Cache des images publiées :** il dure un an. Une photo dépubliée cesse d'être servie par le site, mais un navigateur ou un proxy qui l'a déjà en cache peut la garder.
- **Co-admins :** ils ont tous les mêmes droits (supprimer, changer le mode EXIF…). Le journal d'audit permet de savoir qui a fait quoi.
