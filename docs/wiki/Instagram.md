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

1. **Entrée dans la file** : à chaque passage brouillon → publiée (fiche, liste, actions groupées, lot), si l’option « Mettre dans la file chaque photo publiée » est active ; jamais une photo déjà dans la file ou déjà partagée. Ajout manuel depuis la fiche (section Instagram).
2. **Créneaux** : chaque minute, le site regarde le dernier créneau passé (heure de Paris) ; au premier passage après un créneau, la tête de file part. Au tout premier démarrage, il attend le créneau suivant (pas de rafale au déploiement). Si le serveur était arrêté, une seule photo part au redémarrage.
3. **Envoi** :
   1. un jeton aléatoire (24 octets) ouvre l’adresse `/partage/instagram/<jeton>.jpg`, valable **uniquement pendant l’envoi** ;
   2. `POST /{ig-user-id}/media` (`image_url`, `caption`) → conteneur ;
   3. attente du statut `FINISHED` ;
   4. `POST /{ig-user-id}/media_publish` → publication, puis lecture du `permalink` ;
   5. le jeton d’image est effacé : l’adresse renvoie 404.
4. **Échec** : la publication reste en tête de file avec son erreur et repart au créneau suivant ; après **3 essais**, elle passe en échec (bouton **Réessayer**). Exceptions, sans nouvel essai automatique pour éviter un doublon : échec pendant `media_publish` (le post existe peut-être), et envoi interrompu par un redémarrage du serveur. Chaque appel à Meta a un délai maximal de 30 s.
5. **Photo dépubliée** : retirée de la file ; une photo non publiée en tête de file est sautée (le créneau sert à la suivante). Changer les heures ne fait rien partir d’avance.
6. **Jeton d’accès** : échangé contre un jeton longue durée (60 jours) à la connexion ; renouvelé automatiquement (`refresh_access_token`) dès qu’il lui reste moins de 30 jours, au plus une fois par jour.

## Image

- JPEG 1080 px de large, qualité 90, sans métadonnées (ni EXIF ni XMP), sRGB.
- **Passe-partout** : toile 4:5 (1080 × 1350), photo entière à 90 %, fond blanc ou noir.
- **Recadrage** : rapport ramené entre 4:5 et 1,91:1 (recadrage centré sur l’« attention » de sharp), sinon format d’origine.
- **Filigrane** : celui des réglages *Filigrane & EXIF*, appliqué à la photo avant le cadre, même désactivé sur le site ; « jamais de filigrane sur cette photo » reste respecté.

## Données

| Table | Contenu |
|---|---|
| `instagram_account` | une ligne : identifiant et nom du compte, **jeton chiffré** (AES-256-GCM), échéance |
| `instagram_posts` | la file et l’historique : photo, statut, ordre, cadre, filigrane, légende personnalisée (ou `NULL` = modèle), erreur, essais, lien du post |
| `settings.instagram` | réglages : option automatique, heures, cadre et filigrane par défaut, modèle, hashtags |
| `settings.instagram_state` | dernier créneau traité |

Supprimer une photo supprime ses publications en file (`ON DELETE CASCADE`) ; les posts déjà sur Instagram n’y sont pas touchés.

## Sécurité

- Jeton d’accès **chiffré** en base, jamais affiché ni journalisé ; les messages d’erreur de Meta sont **nettoyés** (`access_token=…`, secret de l’application) avant d’être enregistrés.
- Connexion OAuth protégée par un `state` aléatoire lié au navigateur (cookie signé, `httpOnly`, 10 minutes, limité à `/admin/instagram`), comparé en temps constant.
- Toutes les routes `/admin/instagram/*` exigent une session d’administrateur ; les écritures, le jeton CSRF.
- L’adresse publique de l’image n’existe que pendant l’envoi (jeton de 192 bits) ; `robots.txt` exclut `/partage/`.
- Les originaux ne quittent jamais le serveur : seul le JPEG préparé est servi.
