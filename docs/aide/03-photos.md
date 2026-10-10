# Photos

La page **Photos** réunit l'import, la recherche et la liste de toutes les photos, dans l'ordre du site.

## Importer des photos

1. Choisissez l'**auteur** et la **série** : ils s'appliquent à tout le lot. Votre propre fiche est présélectionnée si votre compte y est lié.
2. Ajoutez les fichiers, au choix :
   - **glissez-les** depuis votre ordinateur sur la zone en pointillés (elle se colore quand vous la survolez) ;
   - ou **cliquez** sur la zone pour les choisir.

   La zone indique « *n* fichier(s) prêt(s) à importer ».
3. Cliquez sur **Importer**. Le message « Import en cours… » s'affiche et le bouton se désactive. Comptez quelques secondes par photo : les images du site sont calculées à ce moment-là.
4. Vous arrivez sur la liste des **brouillons**, avec un compte rendu : « 3 photo(s) importée(s) en brouillon, 1 refusée(s) », et la raison de chaque refus.

| | |
|---|---|
| Formats | JPEG, PNG, WebP, TIFF, HEIF |
| Taille | 60 Mo et 120 mégapixels par fichier au plus |
| Nombre | 50 fichiers par envoi au plus |
| Statut | **brouillon** : rien n'est visible sur le site avant publication |
| Titre | tiré du nom du fichier (`IMG_2041 quai-nord.jpg` → « IMG 2041 quai nord »), à corriger dans la fiche |

À l'import, le site :

- applique l'orientation de l'appareil (photo prise en portrait) ;
- calcule les images servies, avec le filigrane et les métadonnées du moment ;
- prépare la [preuve d'antériorité](preuves) de l'original.

Un fichier refusé (pas une image, format non pris en charge, trop lourd) n'empêche pas les autres du lot d'être importés.

## La liste

Chaque ligne montre :

- le **numéro d'ordre** (N°) ;
- la vignette ;
- le **titre**, avec série, auteur, lieu et date ;
- le **statut** (Publiée ou Brouillon) ;
- les boutons **Publier / Dépublier** et **↑ ↓**.

- **Ouvrir la fiche :** cliquez sur le titre (ou sur la vignette).
- **Publier, dépublier :** un clic sur le bouton de la ligne. Une photo dépubliée disparaît aussitôt du site, et ses images cessent d'être servies. Vous restez sur la même liste, filtres compris.

> Le N° de l'admin est la place dans **toute** la liste, brouillons compris. Sur le site, les photos publiées sont numérotées sans trou (N°01, N°02…).

## Changer l'ordre

L'ordre de la liste est celui du site : galerie, visionneuse et numéros.

- **À la souris :** saisissez une ligne et déposez-la sur une autre.
  - Lâchée sur la **moitié haute** d'une ligne, elle se place **avant** ; sur la **moitié basse**, **après**. C'est ainsi qu'on atteint la dernière place.
  - Un trait de couleur montre l'endroit du dépôt.
  - L'ordre est **enregistré aussitôt** ; les numéros et les boutons ↑ ↓ se mettent à jour.
- **Au clavier, ou sans souris :** boutons **↑** (monter d'une place) et **↓** (descendre d'une place). Ils sont grisés en tête et en fin de liste.
- **Avec des filtres :** le réordonnancement n'est possible que sur la liste **complète**. Effacez d'abord les filtres.

Si l'enregistrement échoue (session expirée…), la liste reprend son ordre précédent et un message vous invite à recharger la page.

## Rechercher et filtrer

- **Recherche :** cherche dans le titre, le lieu, la légende et l'adresse.
- **Auteur**, **Série**, **Statut** : à combiner librement.
- **Filtrer** applique les filtres ; **Effacer** revient à la liste complète.

## La fiche d'une photo

| Champ | Règles |
|---|---|
| **Titre** | obligatoire, 160 caractères au plus |
| **Adresse** | la fin de l'URL : `/photo/<adresse>`. Vide : déduite du titre. Minuscules, chiffres et tirets ; elle doit être unique. La changer casse les anciens liens partagés (l'ouverture, elle, suit). |
| **Série**, **Auteur** | listes |
| **Lieu** | texte libre, 120 caractères |
| **Date** | `AAAA-MM` (mars 2024) ou `AAAA-MM-JJ` |
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
