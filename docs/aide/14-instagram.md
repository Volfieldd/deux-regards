# Instagram

Les photos publiées sur le site peuvent partir sur **un compte Instagram** (celui de Nicephos), **une par une, aux heures choisies**, avec une légende tirée d’un **modèle**. Pour chaque photo, vous pouvez changer le cadre, le filigrane et la légende.

La mise en place se fait une seule fois : un **compte Instagram professionnel**, une **application Meta**, deux lignes dans la configuration du serveur, puis **Connecter** dans l’admin. Comptez une demi-heure.

## Au quotidien

1. **Choisissez ce qui part sur Instagram.** Par défaut, rien n’y entre seul : ouvrez la fiche d’une photo publiée sur le site et, dans la section **Instagram**, cliquez sur **Ajouter à la file Instagram**. (Une photo en brouillon doit d’abord être publiée sur le site.) Pour qu’une série entière parte automatiquement, cochez-la dans **Instagram → Réglages → Mise en file automatique** : chaque photo publiée dans cette série entrera alors dans la **file Instagram**.
2. **Aux heures choisies** (18 h 30 par défaut, heure de Paris), la première photo de la file part sur Instagram. Une par créneau.
3. **Jusqu’au départ**, tout se règle :
   - dans la **fiche de la photo**, section **Instagram** : cadre, filigrane, légende, avec l’aperçu exact de l’image envoyée, puis **Mettre à jour** ; **Retirer de la file** l’en sort ;
   - dans la page **Instagram** : l’ordre de la file (↑ ↓), **Publier maintenant**, **Retirer**.
4. Une fois publiée, la fiche donne le lien **voir le post ↗**, et l’historique de la page Instagram le lien **Voir sur Instagram ↗**.

> Une photo n’entre jamais deux fois d’elle-même dans la file : dépubliée puis republiée, elle n’est pas reproposée. Pour la partager à nouveau, utilisez **Republier (remettre dans la file)** dans sa fiche.

## Le cadre de l’image

Instagram n’accepte que des images entre **4:5** (en hauteur) et **1,91:1** (en largeur). Vos photos 2:3 en hauteur n’y entrent pas telles quelles. Trois choix, par défaut dans les réglages et photo par photo dans la fiche :

| Cadre | Résultat |
|---|---|
| **Passe-partout blanc** | la photo entière, avec une marge blanche, sur un carré 4:5 de 1080 × 1350 px : un fil régulier |
| **Passe-partout noir** | la même chose sur fond noir |
| **Recadrage (sans bordure)** | sans bordure : les photos en hauteur sont recadrées en 4:5 (au centre de l’intérêt), les autres gardent leur format |

L’image envoyée est un JPEG de 1080 px de large, **sans aucune métadonnée**. Le **filigrane** (case dans la fiche, valeur par défaut dans les réglages) est celui de **Filigrane & EXIF**, même s’il est désactivé sur le site. Une photo réglée sur « jamais de filigrane » n’en a pas non plus sur Instagram.

## La légende

Le **modèle** (Instagram → Réglages) s’applique à toutes les photos, avec ces variables :

| Variable | Remplacée par |
|---|---|
| `{titre}` · `{legende}` · `{lieu}` · `{date}` | les champs de la photo (date en clair : « nov. 2023 ») |
| `{auteur}` · `{serie}` | son auteur, sa série |
| `{site}` | le nom du site |
| `{hashtags}` | les hashtags « pour toutes les photos », puis ceux de sa série, sans doublon, 30 au plus |
| `{signature}` | la signature du photographe (voir ci-dessous) ; sans cette variable dans le modèle, elle se place juste sous la légende |

**Signature du photographe** : chaque photographe règle la sienne dans [Photographes](auteurs) (par exemple « — Julien · @julien.photo »). Elle s'ajoute au post **seulement quand la photo a une légende**. Pour une photo, décochez **Ajouter ma signature** dans la section Instagram de sa fiche, puis **Ajouter à la file** ou **Mettre à jour** : elle n'y figurera pas. Le site, lui, n'affiche pas la signature.

**Une ligne dont toutes les variables sont vides disparaît**, et une virgule restée seule est retirée : une photo sans lieu ni date ne laisse pas de « , » dans sa légende.

**Pour une photo**, dans sa fiche : modifiez directement la légende. La case **Légende personnalisée** se coche toute seule ; **Revenir au modèle** reprend celle du modèle. Le compteur indique la longueur (2 200 caractères au plus). Des avertissements signalent un lien (non cliquable sur Instagram : préférez « lien en bio ») ou plus de 30 hashtags.

## Limites de l’API

Il n’existe pas d’offre payante de l’API d’Instagram : Meta autorise **100 publications par compte sur 24 h glissantes** et un nombre d’appels qu’il calcule lui-même. Le site publie donc dans un **budget**, réglé dans **Instagram → Réglages → Limites de l’API** :

| Réglage | Publications sur 24 h | Écart entre deux | Appels par heure |
|---|---|---|---|
| **Prudent** (par défaut) | 25 | 60 min | 100 |
| **Limites de Meta** | le quota lu chez Instagram (100 aujourd’hui) | aucun | 200 |
| **Personnalisé** | 1 à 100 | 0 à 1 440 min | 10 à 1 000 |

- **Hors budget**, la photo attend dans la file. **Publier maintenant** refuse en expliquant pourquoi et quand ce sera possible (« Dernière publication il y a 20 min ; 60 min au moins entre deux publications : prochaine possible à 14 h 30 »).
- **Si Instagram signale une limite**, la file se met **en pause** le temps qu’il indique (sinon 1 h, puis 2 h, 4 h, 8 h, 24 h). La photo reste en tête de file et **l’essai n’est pas compté**. Un bandeau l’annonce sur la page **Instagram**, avec **Reprendre maintenant** pour lever la pause à la main. À la reprise, une photo par créneau, jamais de rafale.
- La page **Instagram** affiche la **consommation** : publications sur 24 h, appels sur la dernière heure, quota lu chez Instagram.

## Likes et commentaires

Chaque matin (après 6 h), le site relève les **likes** et les **commentaires** des photos qu'il a publiées sur Instagram, et garde un relevé par jour.

- **Fiche d'une photo**, section Instagram : « 39 likes · 4 commentaires », la date du relevé et une courbe de l'évolution des likes.
- **Page Instagram**, « Les plus aimées sur Instagram » : le classement des photos par likes, avec le lien vers chaque post. **Relever maintenant** fait un relevé sans attendre le lendemain (une fois toutes les 10 minutes au plus).
- **Seulement des nombres** : Instagram ne dit pas qui a aimé ni ce que disent les commentaires.
- **Posts publiés directement sur Instagram**, sans passer par le site : ils ne sont pas relevés (ils ne sont liés à aucune photo du site).
- Le relevé coûte 1 à 3 appels par jour, comptés dans les limites ci-dessus. S'il échoue (Instagram indisponible), un nouvel essai a lieu une heure plus tard et le motif s'affiche sur la page Instagram.

## En cas d’échec

- **Nouvel essai automatique :** la photo reste en tête de file, et le message d’erreur s’affiche dans la file et dans la fiche. Elle repart au créneau suivant, **3 essais au plus**.
- **Après 3 échecs :** elle passe dans l’**historique**, avec **Réessayer**.
- **Accès expiré :** le jeton d’accès dure 60 jours et se renouvelle tout seul. S’il a expiré (plus de 60 jours sans fonctionner), reconnectez le compte depuis la page **Instagram** : **Déconnecter**, puis **Connecter le compte Instagram**. Si l’admin affiche **Reconnecter le compte** (clé de chiffrement changée, voir l’étape 6), cliquez simplement dessus.

---

## Mise en place (une fois)

### 1. Passer le compte Instagram en compte professionnel

L’API de publication ne fonctionne qu’avec un compte **Créateur** ou **Entreprise**. C’est gratuit, sans perte d’abonnés ni de publications, et réversible.

1. Dans l’application Instagram, ouvrez le **profil** du compte Nicephos, puis le menu **☰**.
2. **Paramètres et activité** → **Type de compte et outils** → **Passer à un compte professionnel**.
3. Choisissez **Créateur** (conseillé pour des photographes) ou **Entreprise**.
4. Catégorie : **Photographe**. Les coordonnées publiques sont facultatives.
5. Aucune page Facebook n’est nécessaire : la connexion se fait directement avec Instagram.

### 2. Créer un compte développeur Meta

1. Allez sur **developers.facebook.com** et cliquez sur **Commencer**.
2. Connectez-vous avec un compte Facebook, celui de l’un de vous deux.
3. Acceptez les conditions et confirmez votre e-mail ou votre téléphone si Meta le demande.

### 3. Créer l’application

1. **Mes applications** → **Créer une application**.
2. Nom de l’application : par exemple « Nicephos ». E-mail de contact : le vôtre.
3. Cas d’utilisation : **Gérer les messages et le contenu sur Instagram** (« Instagram API »), puis suivant jusqu’à **Créer l’application**.
4. L’application est en **mode Développement**. C’est suffisant : pour publier sur votre **propre** compte, aucune vérification par Meta n’est nécessaire.

### 4. Récupérer les identifiants et déclarer l’adresse de retour

1. Dans l’application : **Instagram** → **Configuration de l’API avec la connexion Instagram** (« API setup with Instagram login »).
2. Notez :
   - l’**ID de l’application Instagram**, à mettre dans `INSTAGRAM_APP_ID` ;
   - la **clé secrète de l’application Instagram** (« Afficher »), à mettre dans `INSTAGRAM_APP_SECRET`.

   Ce sont les identifiants **Instagram** de l’application, différents de son ID Facebook affiché en haut.
3. Section **Configurer la connexion professionnelle Instagram** (« Set up Instagram business login ») → **Paramètres de l’application** :
   - **URI de redirection OAuth valides :** `https://www.nicephos.art/admin/instagram/callback`. C’est l’adresse affichée sur la page **Instagram** de l’admin, au caractère près.
   - Enregistrez.
4. Autorisations demandées par le site, rien à cocher : `instagram_business_basic` et `instagram_business_content_publish`.

### 5. Autoriser le compte Nicephos sur l’application

En mode Développement, seuls les comptes invités peuvent se connecter :

1. Dans l’application Meta : **Rôles de l’application** → **Rôles** → **Ajouter des personnes** → **Testeur Instagram**. Saisissez le nom du compte (@nicephos).
2. Dans Instagram, sur le compte Nicephos : **Paramètres et activité** → **Applications et sites web** → **Invitations de testeur** → **Accepter**. Sur ordinateur, c’est aussi possible sur instagram.com → Paramètres → Applications et sites web.

### 6. Configurer le serveur

Dans le fichier `.env` du serveur (sur Unraid : **Edit Stack → ENV File**) :

```dotenv
INSTAGRAM_APP_ID=…            # ID de l'application Instagram
INSTAGRAM_APP_SECRET=…        # clé secrète de l'application Instagram
```

Conseillé : `INSTAGRAM_TOKEN_KEY`, une clé de chiffrement du jeton d’accès (`openssl rand -base64 32`). Sans elle, la clé est dérivée de `COOKIE_SECRET` : changer ce secret, ou restaurer la base sur un serveur qui en a un autre, oblige alors à **reconnecter** le compte (l’admin le signale ; aucune photo n’est perdue).

Puis redémarrez le site (**Compose Up**). Le site doit être en **HTTPS** (`PUBLIC_URL=https://…`) : Meta refuse les adresses en `http`, et doit pouvoir télécharger l’image.

### 7. Connecter

1. Admin → **Instagram** → **Connecter le compte Instagram**.
2. Instagram demande d’autoriser l’application. Connectez-vous **avec le compte Nicephos**, puis acceptez.
3. Retour dans l’admin : « Compte Instagram @nicephos connecté ». La file peut partir.

### Si la connexion échoue

| Message | Cause, solution |
|---|---|
| « Invalid redirect_uri » / « redirect_uri is missing » | l’adresse de retour déclarée (étape 4) n’est pas exactement celle affichée dans l’admin |
| « Insufficient developer role » | l’invitation de testeur n’a pas été acceptée (étape 5), ou un autre compte Instagram est connecté dans le navigateur |
| « Connexion refusée : la demande ne vient pas de cet écran ou a expiré » | plus de 10 minutes entre le clic et le retour, ou retour dans un autre navigateur : recommencez |
| « Le site doit être en HTTPS » | `PUBLIC_URL` en `http://` : la connexion n’est possible qu’en ligne |
| « image refusée par Instagram » | rare ; essayez un autre cadre pour cette photo |

**Déconnecter** (page Instagram) efface le jeton du serveur. Pour retirer aussi l’accès côté Instagram : **Paramètres** → **Applications et sites web** → **Actives** → l’application → **Supprimer**.
