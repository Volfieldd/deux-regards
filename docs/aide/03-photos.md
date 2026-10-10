# Photos

La page **Photos** réunit l'import, la recherche et la liste de toutes les photos, dans l'ordre du site. L'import se fait en trois étapes : **choisir et vérifier**, **envoi et traitement**, **compléter et publier**.

## Importer des photos

### 1. Choisir

1. Cliquez sur **＋ Importer des photos** : le choix des fichiers s'ouvre aussitôt. Vous pouvez aussi **déposer des photos n'importe où sur la page**.
2. Sélectionnez vos photos. **C'est tout : l'envoi commence tout seul.**

- Les fichiers qui ne passeront pas sont écartés **avant tout envoi**, avec la raison : « ✕ Ce n'est pas une image », « ✕ Trop lourde (60 Mo max.) », « ✕ Trop grande (120 Mpx max.) ». **✕** les retire de la liste.
- **Auteur et série du lot :** en haut du panneau d'import (votre fiche est présélectionnée). Choisissez-les avant d'ajouter les photos si besoin ; sinon, changez-les photo par photo à l'étape 3.
- Des photos ajoutées pendant l'envoi partent à leur tour.

### 2. Envoi et traitement

- **Par photo :** une barre montre l'envoi en pourcentage, puis le traitement « images *n* / 6 » (les 6 tailles d'images du site), puis « ✓ Prête ».
- **Pour le lot :** en haut, le décompte (prêtes, en traitement, en envoi, en échec), une barre d'ensemble et le **temps restant** estimé.
- **Connexion interrompue :** seule la photo concernée échoue ; **Réessayer** la renvoie sans toucher au reste.
- **Annuler le reste :** arrête les envois pas encore terminés. Les photos déjà envoyées restent en brouillon.
- **Pendant l'envoi**, gardez la page ouverte (le navigateur vous prévient si vous la quittez). **Le traitement**, lui, continue sur le serveur même si vous changez de page : l'indicateur **Traitement : *n* photos** reste affiché en haut de toutes les pages.
- Dès que l'envoi est terminé, **Compléter et publier les *n* photos →** apparaît (et reçoit le focus) : il mène à l'étape 3, même si le traitement n'est pas fini.

| | |
|---|---|
| Formats | JPEG, PNG, WebP, TIFF, HEIF |
| Taille | 60 Mo et 120 mégapixels par fichier au plus |
| Statut | **brouillon** : rien n'est visible sur le site avant publication |
| Titre | **provisoire**, tiré du nom du fichier (`IMG_2041 quai-nord.jpg` → « IMG 2041 quai nord ») |
| Date | **reprise de l'appareil photo** (date de prise de vue des métadonnées EXIF), quand elle existe |

Au traitement, le site applique l'orientation de l'appareil, calcule les images servies (filigrane et métadonnées du moment) et prépare la [preuve d'antériorité](preuves) de l'original.

> Sans JavaScript, l'import reste possible : choisissez les fichiers puis **Importer** ; tout le lot part d'un coup et le compte rendu s'affiche à la fin.

### 3. Compléter et publier

Toutes les photos du lot sont réunies dans **un seul tableau** : titre, série, lieu et date.

- **Chaque champ s'enregistre quand vous le quittez** (Tab, clic ailleurs ou Entrée). La colonne **État** affiche « Enregistrement… » puis « ✓ Enregistré ». Le message en bas de l'écran propose **Annuler** pendant quelques secondes.
- **Titre provisoire :** tant que le titre est celui du nom de fichier, il est signalé sous le champ.
- **Date :** déjà remplie quand l'appareil l'a enregistrée. Sinon, en langage courant : « oct. 2026 », « octobre 2026 », « 10/2026 », « 5/10/2026 » ou « 2026-10 ». Le site affiche ce qu'il a compris (« compris : oct. 2026 »).
- **Pour les photos cochées** (toutes, au départ), la barre sombre applique une **série** (y compris une nouvelle), un **lieu** ou une **date** **dès que vous les changez** — sans bouton à cliquer, avec **Annuler** dans le message. Puis **Publier**.

En pratique, pour un lot : tapez les titres, le lieu une fois dans la barre, puis **Publier**.
- **Publier des photos à titre provisoire :** une fenêtre les nomme et propose d'abord **Corriger les titres**. Rien n'est publié sans votre confirmation.

Légende, filigrane et preuve se règlent dans la fiche de chaque photo (voir plus bas).

## La liste

Chaque ligne montre une **case à cocher**, le **numéro d'ordre** (N°), la vignette, le **titre** (avec série, auteur, lieu, date et, le cas échéant, « Titre provisoire »), le **statut** — « ● Publiée » ou « ○ Brouillon » — et le menu **⋯**.

- **Ouvrir la fiche :** cliquez sur le titre (ou sur la vignette).
- **Menu ⋯ d'une ligne :** Modifier la fiche, Publier ou Dépublier, Monter ou Descendre d'une place.
- **Liste / Grille :** en haut à droite, l'affichage en lignes ou en vignettes.

> Le N° de l'admin est la place dans **toute** la liste, brouillons compris. Sur le site, les photos publiées sont numérotées sans trou (N°01, N°02…).

## Agir sur plusieurs photos

1. Cochez les photos. **Maj + clic** coche toute la plage depuis la case précédente ; **Tout sélectionner** coche la liste affichée.
2. Une barre sombre apparaît (en haut ; en bas de l'écran sur téléphone) : **Publier**, **Dépublier**, **Changer de série** (choisissez la série, ou « ＋ Nouvelle série… » et son nom), **Supprimer…**.
3. Un message confirme l'action et propose **Annuler** pendant 10 secondes (sauf pour la suppression, qui demande une confirmation avant).

## Changer l'ordre

L'ordre de la liste est celui du site : galerie, visionneuse et numéros.

- **À la souris :** saisissez une ligne et déposez-la sur une autre.
  - Lâchée sur la **moitié haute** d'une ligne, elle se place **avant** ; sur la **moitié basse**, **après**. C'est ainsi qu'on atteint la dernière place.
  - Un trait de couleur montre l'endroit du dépôt.
  - L'ordre est **enregistré aussitôt** ; les numéros se mettent à jour.
- **Au clavier, ou sans souris :** menu **⋯** de la ligne, **Monter d'une place** ou **Descendre d'une place**.
- **Avec des filtres, ou en grille :** le réordonnancement n'est possible que sur la liste **complète**. Effacez d'abord les filtres.

Si l'enregistrement échoue (session expirée…), la liste reprend son ordre précédent et un message vous invite à recharger la page.

## Rechercher et filtrer

- **Recherche :** cherche dans le titre, le lieu, la légende et l'adresse.
- **Auteur**, **Série**, **Statut** : à combiner librement ; la liste se met à jour dès que vous changez un choix.
- **Effacer** revient à la liste complète.

## La fiche d'une photo

| Champ | Règles |
|---|---|
| **Titre** | obligatoire, 160 caractères au plus |
| **Adresse** | la fin de l'URL : `/photo/<adresse>`. Vide : déduite du titre. Minuscules, chiffres et tirets ; elle doit être unique. La changer casse les anciens liens partagés (l'ouverture, elle, suit). |
| **Série**, **Auteur** | listes |
| **Lieu** | texte libre, 120 caractères |
| **Date** | en langage courant : « mars 2024 », « 3/2024 », « 2/3/2024 » ou `2024-03` |
| **Légende** | affichée sous la photo, 2000 caractères |
| **Statut** | Brouillon ou Publiée |
| **Filigrane** | « Selon les réglages », ou « Jamais sur cette photo » (voir [Filigrane et EXIF](filigrane-exif)) |

Cliquez sur **Enregistrer**.

L'aperçu à gauche montre l'image telle que servie (filigrane compris) et ses dimensions. Pour une photo publiée, **voir sur le site** l'ouvre dans la galerie.

Plus bas, la section [Preuve d'antériorité](preuves) montre l'empreinte et l'horodatage de l'original.

## Supprimer une photo

1. En bas de la fiche, ouvrez **Supprimer cette photo**.
2. Confirmez avec **Supprimer définitivement**.

L'original, les images du site et la preuve d'antériorité sont effacés, et la photo est retirée de l'ouverture.

**C'est irréversible depuis l'admin.** Téléchargez d'abord l'original et la preuve si vous voulez les garder. L'original reste par ailleurs dans les sauvegardes du serveur.
