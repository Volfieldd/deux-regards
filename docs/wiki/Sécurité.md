# Sécurité

Cette page résume les protections en place. Chacune est couverte par des tests (`test/`).

## Accès à l'admin

- **Connexion OIDC uniquement**, sans aucun mot de passe dans l'application. Le site vérifie `state`, `nonce`, PKCE (S256), la signature, l'émetteur et l'audience.
- **Autorisation :** rôles du site, donnés dans **Comptes et rôles** et relus à chaque requête. Sans rôle : 403 et aucune session. Le rôle de projet `admin` de Zitadel, lié à l'organisation `OIDC_ORG_ID`, ne sert qu'à l'amorce d'un compte à sa première connexion ; une fois en ligne, sans `OIDC_ORG_ID`, il est ignoré.
- **Sessions côté serveur :**
  - seule l'empreinte du jeton est en base ;
  - 8 h sans activité, 24 h au plus ;
  - régénérées à chaque connexion.
- **Cookies :** `httpOnly`, `SameSite=Lax`, et en HTTPS `Secure` avec le préfixe `__Host-`. Quatre cookies de transaction OIDC au plus, et la page demandée n'y est gardée que si elle est courte : une page tierce ne peut pas gonfler l'en-tête `Cookie` jusqu'au refus (431) du site.
- **Cache :** aucune réponse de l'admin n'est gardée en cache (`no-store`, fichiers compris).
- **CSRF :** jeton synchronisé sur toute écriture (champ `_csrf` ou en-tête `x-csrf-token` pour les appels JSON de l'admin : envoi photo par photo, actions groupées, enregistrement champ par champ, ordre des séries). Pour un import, il doit précéder le premier fichier : aucun fichier n'est lu avant sa vérification.
- **Suppressions groupées :** jamais sans confirmation explicite (`confirm`) ; sans elle, l'admin affiche une page de confirmation.
- **Redirections :** le paramètre `next` est normalisé par l'analyseur d'URL. Une adresse qui mène hors du site est refusée, y compris avec des caractères de contrôle ou des segments `/./` ou `/../` qui, une fois normalisés, donneraient `//autre-site`.
- **Limite de débit :**
  - tentatives de connexion limitées par adresse (`AUTH_RATE_LIMIT`, 30 par 10 minutes par défaut) ;
  - IPv6 par bloc /64, mémoire bornée ;
  - `TRUST_PROXY=true` refusé.
- **Journal d'audit :** chaque action d'écriture de l'admin est journalisée (`action admin`), avec le compte (`sub`), la route et le résultat, ainsi que les lectures les plus sensibles : exports RGPD (rencontre, personne), téléchargement d'un original, connexion du compte Instagram. Une action refusée par un message d'erreur suivi d'une redirection (`failed()`, réponse 303) est gardée en base avec le statut 422 : la page **Journal** la dit « refusé », et non « fait ».
- **Routes de l'admin (revue du 16 octobre 2026) :**
  - sur la fiche ou dans la photothèque, un compte qui voit toutes les photos (relecteur, modérateur) sans avoir les personnes ou les statistiques de tous ne voit, pour la photo d'un autre photographe, ni ses personnes, ni le détail des accords, ni son audience ;
  - toute modification d'une photo programmée par son photographe (annulations, série, carte comprises) la renvoie devant le modérateur ;
  - actions groupées : droit de l'action vérifié avant de lire la liste, bornée à 5 000 photos (413 au-delà) ;
  - relance forcée de l'horodatage : une toutes les 5 minutes au plus ;
  - une valeur reçue n'est lue dans une table (thème, période, emplacement de marque, action) que si elle en est une clé propre, jamais `constructor` ni `__proto__`.
- **Journaux :** le code et le `state` OIDC, le jeton de l'adresse d'image Instagram, celui d'une photo offerte (`/pour-vous/…`) et le code de contrôle d'une carte (`/bonjour/J-0042-…`) sont masqués dans les URL, même encodés dans un paramètre ; les adresses IP sont tronquées (/24 en IPv4, /48 en IPv6).

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
- **Téléchargement des originaux :** réservé aux comptes qui en ont le droit (Administrateur ; Photographe pour ses photos), pour constituer un dossier de preuve ; chaque téléchargement est noté au Journal.

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
- avec une autorité d'horodatage en HTTP (`TSA_URL`) ;
- en production (`NODE_ENV=production`) sans `PUBLIC_URL`.

En conteneur (`REQUIRE_PERSISTENT_STORAGE=1`), il refuse aussi une base (`DATABASE_PATH`) hors du dossier des données. Avec `TRUST_PROXY` laissé par défaut sur un serveur joignable du réseau, il l'écrit dans ses journaux au démarrage.

Détail et autres refus de démarrage : [Configuration](Configuration), section « Site en ligne ».

## Base et sauvegardes

- **Effacement effectif :** la base est ouverte avec `secure_delete` : une donnée effacée (droit à l'effacement, purges, sessions) est mise à zéro dans le fichier au lieu de rester lisible dans l'espace libre. Les restes d'avant ce réglage ont été retirés une fois, au démarrage, par un `VACUUM`.
- **Instantanés :** copie compacte en une seule lecture (`VACUUM INTO`), sans pages libres ; contrôle d'intégrité ; 14 gardés. Les fichiers supprimés des données quittent `files/` pour `supprimes/` (effacés à 90 jours) : une restauration ne peut pas faire revenir un original effacé.
- **Restauration** (`server/db/restore.js`) : refusée si le site tourne ; ferme toutes les sessions ; ne recopie que les originaux que cite l'instantané ; liste les actions faites depuis (effacements, comptes et rôles à refaire).
- **Garde-fous :** sauvegardes jamais dans le dossier des données (ni le même dossier, ni l'un dans l'autre, ni le même dossier monté deux fois) ; une base devenue vide par erreur n'efface pas les vrais instantanés ; healthcheck du conteneur de sauvegarde.
- **Index des clés étrangères :** chaque clé étrangère a son index (test générique) ; supprimer une photo ne parcourt plus toutes les statistiques.

## Déploiement

- **Secrets :** le jeton du tunnel Cloudflare n'est transmis qu'à `cloudflared` (vide pour le site, qui traite des fichiers reçus).
- **Adresse des visiteurs :** sur Unraid, réseau dédié à adresses fixes ; `TRUST_PROXY` = l'adresse du tunnel, hors de la plage des autres conteneurs ; le pays de Cloudflare n'est compté que pour une requête passée par ce proxy.
- **Image publiée :** actions GitHub épinglées sur un commit, constructions une à une, `latest` posée depuis `main` seulement ; script d'installation d'ONNX Runtime et ses dépendances retirés de l'image.
- **Unraid :** partages `appdata` et `backups` non exportés sur le réseau (l'invité SMB est l'utilisateur des conteneurs) ; archive d'export lisible par son seul propriétaire.

## Points d'attention

- **Mode EXIF « Tout l'EXIF de l'original » :** il publie la position GPS des photos.
- **Rôles :** ils vivent dans la base du site et sont relus à chaque requête ; un rôle retiré dans **Comptes et rôles** s'applique tout de suite. Le rôle `admin` de Zitadel ne sert qu'à la première connexion : un compte supprimé qui se reconnecte revient « en attente », sans rôle (seul son `sub` est gardé, table `accounts_removed`, le temps qu'il revienne). L'e-mail d'un compte n'est retenu que s'il est vérifié par le fournisseur.
- **Liens mailto :** l'adresse d'un visiteur (signalement, `/bonjour`, rencontre) est encodée dans le lien (`encodeURIComponent`, arobase gardée) : une adresse acceptée par la validation mais qui contient `?bcc=…` ou `&body=…` ne peut pas ajouter de destinataire caché ni de texte au message préparé (RFC 6068).
- **HSTS :** il est envoyé sans `includeSubDomains`. À ajouter une fois le domaine choisi, si tous ses sous-domaines sont en HTTPS.
- **Cache des images publiées :** il dure un an. Une photo dépubliée cesse d'être servie par le site, mais un navigateur ou un proxy qui l'a déjà en cache peut la garder.
- **Rôles et permissions :** chaque route de l'admin déclare une permission (`server/permissions.js`) ; une route qui n'en déclare pas empêche le démarrage, et une permission absente du compte est refusée (fermé par défaut). Les routes à plusieurs actions (actions groupées, fiche qui publie, effacement avec photos, réglages) vérifient aussi l'action précise. Quatre rôles existent (Administrateur, Photographe, Modérateur, Relecteur), donnés dans **Comptes et rôles** ; un compte inconnu arrive « en attente », sans accès. Garde-fous : au moins un administrateur actif, pas de désactivation de soi-même, `ADMIN_SUBS` toujours administrateurs. Le lien compte ↔ photographe ne se règle plus dans la fiche Photographe (porte d'escalade fermée). Portée « les miennes » (rôle Photographe) : ce qui n'est pas au photographe lié au compte n'existe pas pour lui (404 sur les photos, images de l'admin, rencontres, personnes, sorties, QR), les listes, la recherche, « Aujourd'hui » et les statistiques sont filtrées à la source, et une personne partagée entre photographes ne se modifie que par un administrateur. Le **Journal** (en base, 13 mois) dit qui a fait quoi. Revue de sécurité et de code du 15 octobre 2026 : la permission de chaque route est vérifiée sur le photographe de la chose visée (et pas seulement sa visibilité), les annulations et les identifiants envoyés dans un formulaire suivent la même portée, une session sans compte n'apporte aucun rôle, et retirer les rôles ou désactiver un compte ferme ses sessions. Revue du 16 octobre 2026 : un compte supprimé ne redevient pas administrateur par le rôle de Zitadel, `ADMIN_SUBS` rétablit aussi un compte désactivé, la connexion de test ne change plus les rôles, le modérateur ne voit pas l'adresse laissée avec un signalement et ne vide pas une série qui a des photos, les réglages du circuit ne valent que pour le rôle Photographe (sans ôter ce qu'un autre rôle donne), et une session sans rôle a une sortie. Revue du 16 octobre 2026 (gabarits et scripts de l'admin) : ce que la page montre suit les mêmes droits que les routes qu'elle appelle (bandeau « Mise à jour des images » et titres des photos en échec réservés à `site.filigrane` ; panneau des propositions de séries à `series.propositions` ; compte et réglages Instagram à `instagram.compte` ; audience à `statistiques.voir` ; « Publier » d'Aujourd'hui à `photos.publier`) ; les raisons d'accord des erreurs Instagram (référence de carte, refus) ne sont lues que par qui voit les personnes ; `/admin/photos/donnees?ids=` (données de plusieurs photos) ne renvoie que les photos visibles du compte ; un glisser vers une série n'accepte que des photos glissées depuis la page elle-même (jamais les données d'un glisser venu d'un autre site).

## Mesure d’audience

Le module de statistiques (`server/stats.js`) ne stocke **aucune donnée personnelle** :

- un visiteur du jour est reconnu par une empreinte HMAC-SHA-256 (adresse IP + navigateur) calculée avec une clé aléatoire **renouvelée chaque jour**, gardée **en mémoire** puis oubliée à minuit ;
- la base ne reçoit que des compteurs par jour (tables `stats_*`), purgés au-delà de 25 mois ;
- provenance : le nom de domaine seul, jamais l’adresse complète ni les paramètres ;
- non comptés : robots, administrateurs connectés, `DNT: 1` et `Sec-GPC: 1`, préchargements, pages introuvables ;
- pas de cookie, pas de script, pas de service tiers : dans le cadre de l’exemption de consentement de la CNIL pour la mesure d’audience. La page publique `/droits` en informe les visiteurs.
- **Chiffrement des données personnelles** (`DATA_KEY`, `server/vault.js`) : noms, e-mails, parent, lieu et détails, position, historique et messages, signature, photos de repère et de carte chiffrés en AES-256-GCM (clé dérivée par HKDF, nonce aléatoire, authentifié) ; clé dans le `.env`, jamais dans la base ni les sauvegardes ; données existantes chiffrées au démarrage (seulement ce qui reste en clair, ligne à ligne) ; une saisie qui ressemble déjà à un chiffré (« enc1: ») est chiffrée à son tour : un chiffré tiré d'une sauvegarde volée n'est jamais déchiffré pour l'admin ni pour un export ; sans la bonne clé, un avertissement remplace la donnée (jamais d'erreur), et l'enregistrer ne remplace pas la donnée chiffrée. Documents : [RGPD](RGPD).
- **Confidentialité (RGPD)** : page `/confidentialite` en trois langues, tenue à jour avec le code (`server/privacy.js`) ; durées automatisées (demandes 12 mois, photo de repère 6 mois, accords et refus 5 ans après la dernière photo liée, originaux supprimés effacés des sauvegardes après 90 jours) ; l'authentification à deux facteurs et le chiffrement des disques ne sont annoncés qu'une fois cochés dans Réglages.
- **Droits des personnes** : demande d'accès ou d'effacement depuis `/bonjour` (échéance d'un mois affichée) ; export ZIP (données, historique, signature, images, photos liées en JPEG réduit) réservé aux admins, journalisé ; effacement complet (photos comprises sur demande, effacées des sauvegardes sous 90 jours) ; un refus reste appliqué sans identité si des photos liées ou de la sortie sont gardées ; l'export ne contient pas les coordonnées ni le message d'une demande sans code non appliquée (un tiers a pu taper la référence) ; une demande en cours garde son type et son échéance (un mois, de date à date) ; e-mails des demandes non vérifiées plafonnés à 30 par jour.
- **Rencontres** (`/bonjour`) : seules les données saisies par la personne (référence, e-mail, nom, choix, messages) ; aucune photo ni donnée d'une autre personne n'est affichée publiquement ; page `noindex`, `no-store` ; 8 demandes par heure et par adresse, champ piège ; codes de contrôle des cartes par HMAC-SHA-256 avec une clé tirée au hasard et gardée en base (`settings.encounter_key`, scellée par `DATA_KEY` quand elle est définie : une sauvegarde volée ne permet pas de fabriquer le code d'une carte), comparés en temps constant ; référence et heure bornées avant toute expression régulière ; dates vérifiées au calendrier. Une référence tapée sans code ne modifie jamais une rencontre établie (carte signée, saisie sur le téléphone, vérifiée), ne remplace jamais une adresse ou un nom déjà notés, ne lève pas un refus et ne décale pas la numérotation des cartes. Photo de la carte signée réencodée (JPEG sans métadonnées) et gardée dans la base (sauvegardes tournantes : une suppression disparaît des sauvegardes après 14 jours), servie seulement aux admins, `no-store`. Demandes sans accord ni refus effacées après 12 mois ; suppression complète à la demande.
- **App Rencontre** (`/admin/rencontre`, admins seulement) : seul écran autorisé à demander la position (`Permissions-Policy: geolocation=(self)` sur cette route, interdite partout ailleurs) ; position arrondie à 0,001° (~100 m) avant l'envoi ; photo de repère et photo de carte acceptées seulement en JPEG, PNG ou WebP (jamais SVG ou PDF, que la bibliothèque d'images saurait lire), réencodées (JPEG sans métadonnées) ; signature exigée en PNG et réencodée, gardées dans la base, servies aux admins seulement (`no-store`), effacées avec la rencontre ; e-mails par le SMTP de votre propre boîte (`SMTP_URL`), connexion chiffrée exigée (`smtps://`, ou STARTTLS obligatoire sauf relais sur la machine), délais courts, jamais le mot de passe ni les adresses répétées par le serveur de messagerie dans les journaux ; champs multipart limités à des noms simples commençant par une lettre ; « Déjà rencontrée ? » limitée aux personnes du photographe, montrées par leurs initiales (la page est tendue à la personne) ; sur l'écran Merci, les liens vers l'admin sont repliés jusqu'à ce que le photographe reprenne le téléphone.
- **Photo offerte** (`/pour-vous/<jeton>`) : jeton aléatoire de 192 bits, valable 30 jours, révocable ; seule une version JPEG réduite est servie (jamais l'original), `noindex`, `no-store`, `Referrer-Policy: no-referrer` ; `robots.txt` exclut `/pour-vous/` ; liens expirés effacés un mois après.
- **Traduction** : les propositions de traduction passent par le conteneur LibreTranslate de la pile (réseau Docker interne, aucun port publié) ; aucun texte n'est envoyé à un service extérieur. Seuls les auteurs connectés peuvent demander une traduction (`POST /admin/traduction`, jeton CSRF).
- **Langue** : le seul cookie du site public, `langue` (`fr`, `en` ou `de`, un an, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS), n'est posé que lorsque le visiteur choisit une langue avec le sélecteur (cookie fonctionnel demandé par le visiteur, exempté de consentement) ; `/droits` le mentionne. La redirection d'arrivée lit le pays (Cloudflare) et `Accept-Language` sans rien conserver ; `/langue/…` ne redirige que vers une page du site.
- pays des visiteurs : celui que calcule Cloudflare (en-tête `CF-IPCountry`), cru seulement si la requête vient du proxy de confiance (`TRUST_PROXY`) ; le site ne géolocalise rien et ne conserve pas l’adresse ; compteurs par jour et par pays, purgés à 25 mois (exemption CNIL : pas plus précis que la ville).
- **Position des photos** : le GPS des originaux ne sert qu’à proposer la ville la plus proche ; il n’est jamais enregistré (seuls la ville, son pays et le centre de la ville, à 0,01° près). Rien ne va sur la carte sans la case cochée par un auteur. Liste des villes embarquée (GeoNames) : aucun service de géocodage extérieur.
- **Modèles d'analyse** (visages, séries et mots-clés, descriptions) : exécutés sur le serveur, aucune image ne sort. Fichiers téléchargés figés et vérifiés avant usage (révision Hugging Face, taille et empreinte SHA-256, nom provisoire puis renommé : un fichier tronqué ou altéré n'est jamais chargé). Les descriptions (Florence-2, plusieurs secondes de calcul par photo) tournent dans un processus à part : le site n'attend pas le calcul, et ce processus est le premier arrêté si la mémoire du conteneur manque. Vingt demandes de description en attente au plus (au-delà : 429) ; une photo inconnue répond 404. Revue du 16 octobre 2026.

## Instagram

- Jeton d’accès **chiffré** en base (AES-256-GCM, clé `INSTAGRAM_TOKEN_KEY` ou dérivée de `COOKIE_SECRET`), jamais affiché ni journalisé ; erreurs de Meta nettoyées de tout jeton ou secret.
- Journal des appels à l’API (`instagram_calls`) : date et type d’appel seulement, sans jeton, URL ni contenu ; effacé après 7 jours. Budget d’appels par heure et pauses sur limite de Meta : la file ne martèle jamais l’API.
- Connexion OAuth : `state` aléatoire lié au navigateur (cookie signé, `httpOnly`, 10 min, chemin `/admin/instagram`), comparaison en temps constant ; retour refusé sinon.
- Image envoyée : adresse `/partage/instagram/<jeton>.jpg` (192 bits) valable seulement pendant l’envoi ; JPEG sans métadonnées ; originaux jamais servis.
- Détails : [Instagram](Instagram).
