# Mode opératoire de l'admin

L'admin se trouve à l'adresse **`/admin`** (par exemple `https://<domaine>/admin`). Toutes ses pages sont utilisables au clavier, et sans JavaScript ; le JavaScript ajoute seulement le glisser-déposer et l'affichage de la progression.

En haut de chaque page : **Tableau de bord · Photos · Séries · Auteurs · Filigrane & EXIF · Apparence · Réglages · Voir le site · Se déconnecter**.

Après chaque action, un message confirme ce qui a été fait, ou explique pourquoi c'est refusé.

---

## 1. Se connecter

1. Ouvrir `/admin`.
2. Se connecter sur la page Zitadel (ou « Continuer avec Google »).
3. On arrive sur le **tableau de bord** : nombre de photos publiées et de brouillons, de séries, d'auteurs, et compte connecté.

> **« Accès refusé » ?** Votre compte n'a pas le rôle `admin`. Demandez-le à l'autre auteur, dans Zitadel, ou utilisez « Utiliser un autre compte ».

## 2. Importer des photos

**Photos → Importer**

1. Choisir l'**auteur** et la **série** : ils s'appliquent à tout le lot. L'auteur lié à votre compte est présélectionné.
2. Glisser les fichiers sur la zone en pointillés, ou cliquer pour les choisir. Le nombre de fichiers prêts s'affiche.
3. Cliquer sur **Importer**. Le calcul des images peut prendre quelques secondes par photo.
4. On arrive sur la liste des **brouillons** : les photos importées ne sont **pas encore visibles** sur le site.

**Formats acceptés :** JPEG, PNG, WebP, TIFF, HEIF.
**Limites :** 60 Mo et 120 mégapixels par fichier, 50 fichiers par envoi.

**Titre :** il est tiré du nom du fichier (`IMG_2041 quai-nord.jpg` donne « IMG 2041 quai nord »). Il se corrige dans la fiche.

**Fichier refusé ?** Le message indique lequel et pourquoi (pas une image, format non pris en charge, trop lourd…). Les autres fichiers du lot sont importés normalement.

## 3. Compléter et publier une photo

**Photos → cliquer sur le titre**

| Champ | Remarques |
|---|---|
| Titre | Obligatoire. |
| Adresse | Fin de l'URL : `/photo/<adresse>`. Laisser vide pour la déduire du titre. Minuscules, chiffres et tirets ; elle doit être unique. |
| Série, Auteur | Listes. |
| Lieu | Texte libre. |
| Date | `AAAA-MM` ou `AAAA-MM-JJ` (affichée « mars 2024 »). |
| Légende | Affichée sous la photo. |
| Statut | **Brouillon** : invisible sur le site. **Publiée** : visible. |
| Filigrane | « Selon les réglages », ou « Jamais sur cette photo ». |

Cliquer sur **Enregistrer**. En cas d'erreur, les champs fautifs sont signalés et le reste de la saisie est conservé.

**Publier rapidement :** dans la liste, le bouton **Publier** / **Dépublier** de chaque ligne suffit.

> Une photo dépubliée disparaît du site **et** ses images cessent d'être servies.

## 4. Ordonner les photos

L'ordre de la liste est celui du site, et il fixe le numéro « N° » de chaque photo.

- **À la souris :** glisser une ligne à sa nouvelle place ; l'ordre est enregistré aussitôt.
- **Au clavier, ou sans JavaScript :** boutons **↑** et **↓** de chaque ligne.

Le réordonnancement n'est possible que sur la liste **complète** : effacez d'abord les filtres.

## 5. Chercher et filtrer

Le bandeau de filtres propose :

- une **recherche** dans le titre, le lieu, la légende et l'adresse ;
- des filtres par **auteur**, **série** et **statut**.

**Effacer** revient à la liste complète.

## 6. Supprimer une photo

1. Ouvrir la fiche de la photo.
2. Cliquer sur **Supprimer cette photo**.
3. Confirmer avec **Supprimer définitivement**.

L'original, toutes ses images et sa preuve d'antériorité sont effacés, et la photo est retirée de l'ouverture. Téléchargez d'abord la preuve si elle peut encore servir. **Cette action est irréversible** (sauf restauration d'une sauvegarde, voir [Exploitation](Exploitation)).

## 7. Séries

**Séries**

- **Créer :** champ « Nouvelle série », puis **Créer**. Elle s'ajoute en fin de liste.
- **Renommer, changer l'adresse :** modifier puis **Enregistrer** sur la ligne. L'adresse est la fin de `/serie/<adresse>` ; la changer casse les anciens liens.
- **Ordonner :** boutons **↑** et **↓**. C'est l'ordre de l'index des séries sur le site.
- **Supprimer :** **Supprimer**, puis confirmer. C'est **impossible tant que la série contient des photos** : déplacez-les d'abord vers une autre série.

## 8. Auteurs

**Auteurs**

- **Nom, adresse** (`/auteur/<adresse>`) et **biographie**, affichée sur la page « À propos ».
- **Compte de connexion :** l'identifiant `sub` affiché sur le tableau de bord de la personne. Voir [Connexion et comptes](Connexion-et-comptes#lier-un-compte-à-un-auteur).
- **Ajouter** un auteur : formulaire « Nouvel auteur ».
- **Supprimer** : impossible tant que l'auteur a des photos.

Renommer un auteur met à jour ses images si son nom figure dans le filigrane ou dans les EXIF.

## 9. Réglages du site

**Réglages**

| Champ | Où il apparaît |
|---|---|
| Nom du site | Logo, titre des pages. Vide : valeur de `SITE_NAME`. |
| Accroche | Titre de la section « regards » de l'accueil, titre de « À propos », description pour les moteurs de recherche. |
| Introduction | Texte sous l'accroche, à l'accueil. |
| À propos | Page « À propos » ; séparer les paragraphes par une ligne vide. |
| Photos de l'ouverture | Diaporama de l'accueil : 8 au plus, parmi les photos publiées, dans l'ordre de la galerie. Sans choix : les 5 premières. |
| Droits d'utilisation | Texte et contact de la page publique `/droits` (voir [Preuves d'antériorité et droits](Preuves-et-droits#page-droits-dutilisation)). |

## 9 bis. Apparence

Thème du site, emblème, sous-titre : voir [Apparence et thèmes](Apparence-et-thèmes).

## 10. Filigrane et EXIF

Voir la page dédiée : [Filigrane et EXIF](Filigrane-et-EXIF).

## 11. Preuve d'antériorité d'une photo

Chaque photo importée est horodatée automatiquement. La section **Preuve d'antériorité** de sa fiche permet de vérifier cette preuve et de la télécharger. Voir [Preuves d'antériorité et droits](Preuves-et-droits#constituer-un-dossier-en-cas-de-litige).

## 12. Se déconnecter

Utilisez le bouton **Se déconnecter**, en haut à droite. Pensez-y sur un ordinateur partagé : la session resterait sinon ouverte jusqu'à 8 h sans activité.
