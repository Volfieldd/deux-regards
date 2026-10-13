# Publication sur Instagram

Les photos publiées sur le site partent sur **un compte Instagram professionnel** par l’API officielle de Meta (*Instagram API with Instagram Login*, `graph.instagram.com`) : une **file d’attente**, une publication par **créneau horaire**, une **légende tirée d’un modèle** et personnalisable photo par photo, un **cadre** (passe-partout blanc ou noir, ou recadrage) et un **filigrane** au choix.

Mode d’emploi et **mise en place pas à pas** (compte professionnel, application Meta, connexion) : [Aide → Instagram](Aide-Instagram).

## Configuration du serveur

| Variable | Obligatoire | Rôle |
|---|---|---|
| `INSTAGRAM_APP_ID` | oui | ID **de l’application Instagram** (Meta → Instagram → API setup with Instagram login) |
| `INSTAGRAM_APP_SECRET` | oui | clé secrète de l’application Instagram |
| `INSTAGRAM_TOKEN_KEY` | conseillée | clé de chiffrement du jeton d’accès (32+ caractères) ; à défaut, dérivée de `COOKIE_SECRET` (changer ce secret, ou restaurer la base ailleurs, impose alors de reconnecter le compte) |
| `INSTAGRAM_API_VERSION` | non | version de l’API Graph (`v23.0` par défaut) ; à relever quand Meta retire une version |
| `PUBLIC_URL` | en HTTPS | adresse de retour OAuth (`PUBLIC_URL/admin/instagram/callback`) et adresse de l’image envoyée |

Sans ces variables, ou en `http://`, la file fonctionne (photos ajoutées, réglées, ordonnées) mais rien ne part ; l’admin l’explique.

## Fonctionnement

1. **Entrée dans la file** : à chaque passage brouillon → publiée (fiche, liste, actions groupées, lot), seulement si la série de la photo est cochée dans **Instagram → Réglages → Mise en file automatique** (aucune par défaut ; l’ancien interrupteur global `autoQueue` est ignoré) ; jamais une photo déjà dans la file ou déjà partagée. Ajout manuel depuis la fiche (section Instagram), quelle que soit la série.
2. **Créneaux** : chaque minute, le site regarde le dernier créneau passé (heure de Paris) ; au premier passage après un créneau, la tête de file part. Au tout premier démarrage, il attend le créneau suivant (pas de rafale au déploiement). Si le serveur était arrêté, une seule photo part au redémarrage.
3. **Envoi** :
   1. contrôle du budget (réglage, pause en cours) puis lecture du quota réel (`GET /{ig-user-id}/content_publishing_limit`) ; hors budget : refus expliqué, rien n’est consommé ;
   2. un jeton aléatoire (24 octets) ouvre l’adresse `/partage/instagram/<jeton>.jpg`, valable **uniquement pendant l’envoi**, 15 minutes au plus, et seulement si la photo est toujours publiée ;
   3. `POST /{ig-user-id}/media` (`image_url`, `caption`) → conteneur ;
   4. attente du statut `FINISHED`, vérifications espacées (2, 3, 5, 8, 13, 21, 34 s ; 8 au plus) ;
   5. `POST /{ig-user-id}/media_publish` → publication, puis lecture du `permalink` ;
   6. le jeton d’image est effacé : l’adresse renvoie 404.
4. **Échec** : la publication reste en tête de file avec son erreur et repart au créneau suivant (une limite signalée par Meta n’est pas un échec : voir le point 5) ; après **3 essais**, elle passe en échec (bouton **Réessayer**). Exceptions, sans nouvel essai automatique pour éviter un doublon : échec pendant `media_publish` (le post existe peut-être), et envoi interrompu par un redémarrage du serveur. Chaque appel à Meta a un délai maximal de 30 s.
5. **Limites** (`server/instagram-limits.js`) : préréglages Prudent (25 / 24 h, 60 min, 100 appels / h, défaut), Limites de Meta (quota lu, sans écart, 200 / h), Personnalisé ; le quota lu chez Meta plafonne toujours. Chaque appel est journalisé (`instagram_calls`) et refusé au-delà du plafond horaire. Erreurs de limite de Meta (codes 4, 17, 32, 613, HTTP 429, et 9 / 2207042 pour le quota) : `RateLimitError`, pause du temps indiqué (`Retry-After`, `X-Business-Use-Case-Usage` → `estimated_time_to_regain_access`), sinon paliers 1, 2, 4, 8 puis 24 h ; la photo reste en file, l’essai n’est pas compté ; le palier revient à zéro après une publication réussie. Les créneaux passés pendant une pause sont consommés : une photo par créneau à la reprise.
6. **Photo dépubliée** : retirée de la file ; une photo non publiée en tête de file est sautée (le créneau sert à la suivante). Changer les heures ne fait rien partir d’avance.
7. **Jeton d’accès** : échangé contre un jeton longue durée (60 jours) à la connexion ; renouvelé automatiquement (`refresh_access_token`) dès qu’il lui reste moins de 30 jours, au plus une fois par jour.

## Likes et commentaires

Une fois par jour, au premier passage de la minuterie après 6 h (heure de Paris), `GET /{ig-user-id}/media?fields=id,like_count,comments_count&limit=100`, pages suivies (adresse `paging.next` acceptée seulement sur `graph.instagram.com`, 20 pages au plus) jusqu'à avoir trouvé tous les posts connus du site (`instagram_posts.ig_media_id`). Autorisation `instagram_business_basic`, déjà demandée pour la publication : pas de reconnexion. Appels journalisés (`engagement`) et comptés dans le budget horaire. Échec : motif nettoyé (jamais de jeton), nouvel essai une heure plus tard. **Relever maintenant** (`POST /admin/instagram/likes`) : 10 minutes au moins entre deux relevés.

## Image

- JPEG 1080 px de large, qualité 90, sans métadonnées (ni EXIF ni XMP), sRGB.
- **Passe-partout** : toile 4:5 (1080 × 1350), photo entière à 90 %, fond blanc ou noir.
- **Recadrage** : rapport ramené entre 4:5 et 1,91:1 (recadrage centré sur l’« attention » de sharp), sinon format d’origine.
- **Filigrane** : celui des réglages *Filigrane & EXIF*, appliqué à la photo avant le cadre, même désactivé sur le site ; « jamais de filigrane sur cette photo » reste respecté.

## Données

| Table | Contenu |
|---|---|
| `instagram_account` | une ligne : identifiant et nom du compte, **jeton chiffré** (AES-256-GCM), échéance |
| `instagram_posts` | la file et l’historique : photo, statut, ordre, cadre, filigrane, légende personnalisée (ou `NULL` = modèle), erreur, essais, lien du post, jeton d’image et sa date d’émission |
| `settings.instagram` | réglages : limites (`limits` : préréglage, publications sur 24 h, écart en minutes, appels par heure), séries mises en file automatiquement (`autoSeries`, vide par défaut), heures des créneaux (4 au plus, `18:30` par défaut), cadre et filigrane par défaut, modèle de légende (2 200 caractères au plus), hashtags généraux et par série (30 au plus en tout) |
| `instagram_calls` | journal des appels à l’API : date et type (`media`, `status`, `publish`, `quota`, `token`…), jamais de jeton ni de contenu ; effacé après 7 jours |
| `settings.instagram_state` | dernier créneau traité, pause en cours (fin, motif, palier), dernier quota lu chez Meta |
| `instagram_engagement` | likes et commentaires des posts publiés depuis le site, un relevé par post et par jour (heure de Paris) ; seulement des nombres (migration 014) |
| `settings.instagram_engagement` | dernier relevé : jour, date, nombre de posts relevés, dernier essai et motif d'échec |

Supprimer une photo supprime ses publications en file (`ON DELETE CASCADE`) ; les posts déjà sur Instagram n’y sont pas touchés.

## Sécurité

- Jeton d’accès **chiffré** en base, jamais affiché ni journalisé ; les messages d’erreur de Meta sont **nettoyés** (`access_token=…`, secret de l’application) avant d’être enregistrés.
- Connexion OAuth protégée par un `state` aléatoire lié au navigateur (cookie signé, `httpOnly`, 10 minutes, limité à `/admin/instagram`), comparé en temps constant.
- Toutes les routes `/admin/instagram/*` exigent une session d’administrateur ; les écritures, le jeton CSRF.
- L’adresse publique de l’image n’existe que pendant l’envoi (jeton de 192 bits, 15 minutes au plus), répond `no-store` et `noindex` ; `robots.txt` exclut `/partage/` ; le jeton est masqué dans les journaux.
- Les originaux ne quittent jamais le serveur : seul le JPEG préparé est servi.
