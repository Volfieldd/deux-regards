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
- **Journal d'audit :** chaque action d'écriture de l'admin est journalisée (`action admin`), avec le compte (`sub`), la route et le résultat. Une action refusée par un message d'erreur suivi d'une redirection (`failed()`, réponse 303) est gardée en base avec le statut 422 : la page **Journal** la dit « refusé », et non « fait ».
- **Journaux :** le code et le `state` OIDC, et le jeton de l'adresse d'image Instagram, sont masqués dans les URL, même encodés dans un paramètre ; les adresses IP sont tronquées (/24 en IPv4, /48 en IPv6).

## Site public

- **Politique de sécurité du contenu stricte** (`server/app.js`), sur toutes les réponses :

  ```
  default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; font-src 'self';
  connect-src 'self'; base-uri 'self'; form-action 'self' <origine de l'IdP>; frame-ancestors 'none'; object-src 'none'
  ```

  Tout vient du site lui-même, sans `unsafe-inline` ni ressource tierce. `form-action` n'ajoute que l'origine de l'IdP OIDC (cible de la redirection après déconnexion), quand OIDC est configuré. Seule autre ouverture : `img-src blob:`, pour l'aperçu local des photos choisies à l'import (adresses créées par le navigateur, jamais par un tiers).
- **En-têtes :** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` ; en HTTPS seulement, `Strict-Transport-Security: max-age=31536000` et `Cross-Origin-Opener-Policy: same-origin`.
- **Contenu :** tout ce qui est saisi dans l'admin est échappé à l'affichage.
- **Erreurs :** une erreur inattendue renvoie un message générique ; le détail (chemins, noms de fichiers) ne va que dans les journaux.
- **Images :**
  - les originaux ne sont jamais servis ;
  - les brouillons ne sont pas servis publiquement (l'admin les voit via `/admin/media/`, sous session, sans cache) ;
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

- **Photos :** formats JPEG, PNG, WebP, TIFF et HEIF, vérifiés par décodage. Limites : 90 Mo (sous le plafond de 100 Mo par requête de Cloudflare), 120 mégapixels (aussi imposées au décodage, contre les bombes de décompression) et 50 fichiers par envoi.
- **Logo du filigrane :** PNG ou WebP seulement (le SVG est refusé), 5 Mo, 4000 px de côté. Il est réencodé avant usage.
- **Fichiers de marque (Apparence) :** PNG, WebP ou JPEG (SVG refusé), 5 Mo, 6000 px de côté ; réencodés, sans métadonnées.
- **Stockage :** les noms de fichiers sont toujours générés par le site (UUID) ; le nom envoyé ne sert qu'à proposer un titre.

## Configuration en ligne

Dès que `PUBLIC_URL` est en HTTPS ou que `NODE_ENV=production`, le serveur refuse de démarrer dans les cas suivants :

- sans `COOKIE_SECRET` ;
- avec un émetteur OIDC en HTTP ;
- avec la connexion locale de test (`LOCAL_AUTH_TOKEN`) ;
- avec une autorité d'horodatage en HTTP (`TSA_URL`).

Détail et autres refus de démarrage : [Configuration](Configuration), section « Site en ligne ».

## Points d'attention

- **Mode EXIF « Tout l'EXIF de l'original » :** il publie la position GPS des photos.
- **Rôles :** ils vivent dans la base du site et sont relus à chaque requête ; un rôle retiré dans **Comptes et rôles** s'applique tout de suite. Le rôle `admin` de Zitadel ne sert qu'à la première connexion.
- **Liens mailto :** l'adresse d'un visiteur (signalement, `/bonjour`, rencontre) est encodée dans le lien (`encodeURIComponent`, arobase gardée) : une adresse acceptée par la validation mais qui contient `?bcc=…` ou `&body=…` ne peut pas ajouter de destinataire caché ni de texte au message préparé (RFC 6068).
- **HSTS :** il est envoyé sans `includeSubDomains`. À ajouter une fois le domaine choisi, si tous ses sous-domaines sont en HTTPS.
- **Cache des images publiées :** il dure un an. Une photo dépubliée cesse d'être servie par le site, mais un navigateur ou un proxy qui l'a déjà en cache peut la garder.
- **Rôles et permissions :** chaque route de l'admin déclare une permission (`server/permissions.js`) ; une route qui n'en déclare pas empêche le démarrage, et une permission absente du compte est refusée (fermé par défaut). Les routes à plusieurs actions (actions groupées, fiche qui publie, effacement avec photos, réglages) vérifient aussi l'action précise. Quatre rôles existent (Administrateur, Photographe, Modérateur, Relecteur), donnés dans **Comptes et rôles** ; un compte inconnu arrive « en attente », sans accès. Garde-fous : au moins un administrateur actif, pas de désactivation de soi-même, `ADMIN_SUBS` toujours administrateurs. Le lien compte ↔ photographe ne se règle plus dans la fiche Photographe (porte d'escalade fermée). Portée « les miennes » (rôle Photographe) : ce qui n'est pas au photographe lié au compte n'existe pas pour lui (404 sur les photos, images de l'admin, rencontres, personnes, sorties, QR), les listes, la recherche, « Aujourd'hui » et les statistiques sont filtrées à la source, et une personne partagée entre photographes ne se modifie que par un administrateur. Le **Journal** (en base, 13 mois) dit qui a fait quoi. Revue de sécurité et de code du 15 octobre 2026 : la permission de chaque route est vérifiée sur le photographe de la chose visée (et pas seulement sa visibilité), les annulations et les identifiants envoyés dans un formulaire suivent la même portée, une session sans compte n'apporte aucun rôle, et retirer les rôles ou désactiver un compte ferme ses sessions. Revue du 16 octobre 2026 (gabarits et scripts de l'admin) : ce que la page montre suit les mêmes droits que les routes qu'elle appelle (bandeau « Mise à jour des images » et titres des photos en échec réservés à `site.filigrane` ; panneau des propositions de séries à `series.propositions` ; compte et réglages Instagram à `instagram.compte` ; audience à `statistiques.voir` ; « Publier » d'Aujourd'hui à `photos.publier`) ; les raisons d'accord des erreurs Instagram (référence de carte, refus) ne sont lues que par qui voit les personnes ; `/admin/photos/donnees?ids=` (données de plusieurs photos) ne renvoie que les photos visibles du compte ; un glisser vers une série n'accepte que des photos glissées depuis la page elle-même (jamais les données d'un glisser venu d'un autre site).

## Mesure d’audience

Le module de statistiques (`server/stats.js`) ne stocke **aucune donnée personnelle** :

- un visiteur du jour est reconnu par une empreinte HMAC-SHA-256 (adresse IP + navigateur) calculée avec une clé aléatoire **renouvelée chaque jour**, gardée **en mémoire** puis oubliée à minuit ;
- la base ne reçoit que des compteurs par jour (tables `stats_*`), purgés au-delà de 25 mois ;
- provenance : le nom de domaine seul, jamais l’adresse complète ni les paramètres ;
- non comptés : robots, administrateurs connectés, `DNT: 1` et `Sec-GPC: 1`, préchargements, pages introuvables ;
- pas de cookie, pas de script, pas de service tiers : dans le cadre de l’exemption de consentement de la CNIL pour la mesure d’audience. La page publique `/droits` en informe les visiteurs.
- **Chiffrement des données personnelles** (`DATA_KEY`, `server/vault.js`) : noms, e-mails, parent, lieu et détails, position, historique et messages, signature, photos de repère et de carte chiffrés en AES-256-GCM (clé dérivée par HKDF, nonce aléatoire, authentifié) ; clé dans le `.env`, jamais dans la base ni les sauvegardes ; données existantes chiffrées au démarrage ; sans la bonne clé, un avertissement remplace la donnée (jamais d'erreur). Documents : [RGPD](RGPD).
- **Confidentialité (RGPD)** : page `/confidentialite` en trois langues, tenue à jour avec le code (`server/privacy.js`) ; durées automatisées (demandes 12 mois, photo de repère 6 mois, accords et refus 5 ans après la dernière photo liée, originaux supprimés effacés des sauvegardes après 90 jours) ; l'authentification à deux facteurs et le chiffrement des disques ne sont annoncés qu'une fois cochés dans Réglages.
- **Droits des personnes** : demande d'accès ou d'effacement depuis `/bonjour` (échéance d'un mois affichée) ; export ZIP (données, historique, signature, images, photos liées en JPEG réduit) réservé aux admins, journalisé ; effacement complet (photos comprises sur demande, effacées des sauvegardes sous 90 jours) ; un refus reste appliqué sans identité si des photos liées sont gardées.
- **Rencontres** (`/bonjour`) : seules les données saisies par la personne (référence, e-mail, nom, choix, messages) ; aucune photo ni donnée d'une autre personne n'est affichée publiquement ; page `noindex`, `no-store` ; 8 demandes par heure et par adresse, champ piège ; codes de contrôle des cartes par HMAC-SHA-256 avec une clé tirée au hasard et gardée en base (`settings.encounter_key`), comparés en temps constant. Photo de la carte signée réencodée (JPEG sans métadonnées) et gardée dans la base (sauvegardes tournantes : une suppression disparaît des sauvegardes après 14 jours), servie seulement aux admins, `no-store`. Demandes sans accord ni refus effacées après 12 mois ; suppression complète à la demande.
- **App Rencontre** (`/admin/rencontre`, admins seulement) : seul écran autorisé à demander la position (`Permissions-Policy: geolocation=(self)` sur cette route, interdite partout ailleurs) ; position arrondie à 0,001° (~100 m) avant l'envoi ; photo de repère et photo de carte acceptées seulement en JPEG, PNG ou WebP (jamais SVG ou PDF, que la bibliothèque d'images saurait lire), réencodées (JPEG sans métadonnées) ; signature exigée en PNG et réencodée, gardées dans la base, servies aux admins seulement (`no-store`), effacées avec la rencontre ; e-mails par le SMTP de votre propre boîte (`SMTP_URL`), délais courts, jamais le mot de passe dans les journaux ; champs multipart limités à des noms simples.
- **Photo offerte** (`/pour-vous/<jeton>`) : jeton aléatoire de 192 bits, valable 30 jours, révocable ; seule une version JPEG réduite est servie (jamais l'original), `noindex`, `no-store`, `Referrer-Policy: no-referrer` ; `robots.txt` exclut `/pour-vous/` ; liens expirés effacés un mois après.
- **Traduction** : les propositions de traduction passent par le conteneur LibreTranslate de la pile (réseau Docker interne, aucun port publié) ; aucun texte n'est envoyé à un service extérieur. Seuls les auteurs connectés peuvent demander une traduction (`POST /admin/traduction`, jeton CSRF).
- **Langue** : le seul cookie du site public, `langue` (`fr`, `en` ou `de`, un an, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS), n'est posé que lorsque le visiteur choisit une langue avec le sélecteur (cookie fonctionnel demandé par le visiteur, exempté de consentement) ; `/droits` le mentionne. La redirection d'arrivée lit le pays (Cloudflare) et `Accept-Language` sans rien conserver ; `/langue/…` ne redirige que vers une page du site.
- pays des visiteurs : celui que calcule Cloudflare (en-tête `CF-IPCountry`), cru seulement si la requête vient du proxy de confiance (`TRUST_PROXY`) ; le site ne géolocalise rien et ne conserve pas l’adresse ; compteurs par jour et par pays, purgés à 25 mois (exemption CNIL : pas plus précis que la ville).
- **Position des photos** : le GPS des originaux ne sert qu’à proposer la ville la plus proche ; il n’est jamais enregistré (seuls la ville, son pays et le centre de la ville, à 0,01° près). Rien ne va sur la carte sans la case cochée par un auteur. Liste des villes embarquée (GeoNames) : aucun service de géocodage extérieur.

## Instagram

- Jeton d’accès **chiffré** en base (AES-256-GCM, clé `INSTAGRAM_TOKEN_KEY` ou dérivée de `COOKIE_SECRET`), jamais affiché ni journalisé ; erreurs de Meta nettoyées de tout jeton ou secret.
- Journal des appels à l’API (`instagram_calls`) : date et type d’appel seulement, sans jeton, URL ni contenu ; effacé après 7 jours. Budget d’appels par heure et pauses sur limite de Meta : la file ne martèle jamais l’API.
- Connexion OAuth : `state` aléatoire lié au navigateur (cookie signé, `httpOnly`, 10 min, chemin `/admin/instagram`), comparaison en temps constant ; retour refusé sinon.
- Image envoyée : adresse `/partage/instagram/<jeton>.jpg` (192 bits) valable seulement pendant l’envoi ; JPEG sans métadonnées ; originaux jamais servis.
- Détails : [Instagram](Instagram).
