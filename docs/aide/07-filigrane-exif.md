# Filigrane et EXIF

Ces réglages concernent les **images servies sur le site**. Les originaux ne sont jamais modifiés : on peut changer d'avis à tout moment.

## Mettre un filigrane texte

1. Cochez **Ajouter un filigrane aux images du site**, puis choisissez **Type : Texte**.
2. Saisissez le **texte** (80 caractères). Variables possibles :
   - `{auteur}` : nom de l'auteur de la photo ;
   - `{annee}` : année de prise de vue, à défaut d'import ;
   - `{site}` : nom du site ;
   - `{titre}` : titre de la photo.

   Par exemple, `© {auteur} {annee}` donne « © Julien 2024 ».
3. **Police** (celles du site) et **teinte** : claire pour les photos sombres, sombre pour les claires.
4. **Position** : neuf emplacements, ou **Mosaïque** (motif répété en diagonale sur toute l'image, le plus difficile à effacer).
5. **Opacité** (5 à 100 %), **largeur** (3 à 60 % de l'image), **marge** (0 à 20 %).
6. **Appliquer aux tailles** :
   - toutes ;
   - 1280 px et plus (vignettes épargnées) ;
   - 2000 px seulement.

   La plus grande image de chaque photo est toujours marquée.

## Essayer avant d'enregistrer

1. Choisissez la **Photo d'aperçu**.
2. Cliquez sur **Aperçu sans enregistrer** : l'image s'ouvre dans un nouvel onglet avec les réglages du formulaire. **Rien n'est enregistré.**

L'image à gauche de la page montre, elle, les réglages **enregistrés**.

## Mettre un logo en filigrane

1. Dans **Logo du filigrane**, envoyez une image **PNG ou WebP à fond transparent** :
   - 5 Mo et 4000 px de côté au plus ;
   - 8 px au moins ;
   - rapport largeur/hauteur de 10 au plus.

   Les SVG sont refusés.
2. Choisissez **Type : Logo (image)**, puis enregistrez.

**Retirer le logo** supprime ce filigrane jusqu'au prochain envoi.

## Exclure une photo

Dans la fiche de la photo : **Filigrane → Jamais sur cette photo**, puis **Enregistrer**. Les métadonnées choisies s'appliquent quand même.

## Métadonnées (EXIF)

| Choix | Les images du site contiennent | Pour |
|---|---|---|
| **Aucune métadonnée** (par défaut) | rien | ne rien divulguer |
| **Droits d'auteur** | auteur, « © année auteur », mentions IPTC (crédit, lien vers « Droits d'utilisation ») | signer les fichiers ; Google Images affiche alors un badge « Licence » |
| **Prise de vue** | droits + appareil, objectif, ouverture, vitesse, ISO, focale, date ; **jamais la localisation** | partager sa technique |
| **Tout l'EXIF de l'original** | tout, **y compris la position GPS** | rarement : révèle où la photo a été prise |

Les champs EXIF n'acceptent que des caractères simples : « © 2024 Sébastien » y devient « (C) 2024 Sebastien ». Les mentions IPTC et le filigrane gardent les accents.

## Mise à jour des images

Après **Enregistrer et mettre à jour les images** :

- un bandeau indique la progression (« Mise à jour des images en cours : 5 / 12 ») ;
- le site reste en ligne avec les anciennes images ;
- chaque photo passe aux nouvelles dès qu'elles sont prêtes, sans image cassée ;
- à la fin, le bandeau indique « Images à jour », ou la liste des photos en erreur.

Comptez quelques secondes par photo.

Le même recalcul se déclenche quand vous renommez un auteur, changez le nom du site, ou modifiez le titre, la date, l'auteur ou l'option de filigrane d'une photo.

**Revenir en arrière :** décochez le filigrane, choisissez « Aucune métadonnée », puis enregistrez. Les images redeviennent celles d'origine.
