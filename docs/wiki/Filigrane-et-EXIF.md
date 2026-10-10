# Filigrane et EXIF

**Admin → Filigrane & EXIF**

Ces réglages s'appliquent aux images **servies sur le site**. Les originaux ne sont jamais modifiés : on peut changer d'avis à tout moment, et les images sont recalculées à partir des originaux.

La spécification complète est dans [`docs/specs/filigrane-et-exif.md`](https://github.com/Volfieldd/deux-regards/blob/main/docs/specs/filigrane-et-exif.md).

---

## Mettre un filigrane texte

1. Cocher **Ajouter un filigrane aux images du site**.
2. Choisir **Type : Texte**.
3. Saisir le **texte**, avec si besoin ces variables :

   | Variable | Remplacée par |
   |---|---|
   | `{auteur}` | le nom de l'auteur de la photo |
   | `{annee}` | l'année de prise de vue (à défaut, l'année d'import) |
   | `{site}` | le nom du site |
   | `{titre}` | le titre de la photo |

   Par exemple, `© {auteur} {annee}` donne « © Julien 2024 ».
4. Choisir la **police** (celles du site), la **teinte** (claire sur les photos sombres, sombre sur les photos claires) et la **position**.
5. Régler l'**opacité**, la **largeur** (en % de la largeur de l'image) et la **marge**.
6. Choisir **Appliquer aux tailles** :
   - toutes ;
   - 1280 px et plus, pour épargner les vignettes de la grille ;
   - 2000 px seulement, pour ne marquer que la plus grande image.

   Dans tous les cas, la plus grande image produite pour une photo est marquée, même si l'original est plus petit que le seuil.
7. Cliquer sur **Aperçu sans enregistrer** : le rendu s'ouvre dans un nouvel onglet, sur la photo choisie dans « Photo d'aperçu ». Rien n'est enregistré.
8. Une fois le résultat convenable, cliquer sur **Enregistrer et mettre à jour les images**.

Un bandeau indique ensuite la progression (« Mise à jour des images en cours : 5 / 12 »). Pendant ce temps, le site reste en ligne avec les anciennes images, et chaque photo passe aux nouvelles dès qu'elles sont prêtes.

### Conseils

- **Discret :** en bas à droite, opacité 40 à 60 %, largeur 15 à 25 %.
- **Dissuasif :** mosaïque, opacité 15 à 30 %, largeur 15 à 20 %. C'est le plus difficile à recadrer ou à effacer, mais aussi le plus visible.
- **Photo très claire ou très sombre :** changez la teinte, ou excluez la photo (voir plus bas).

## Mettre un logo

1. Dans **Logo du filigrane**, envoyer une image **PNG ou WebP à fond transparent** : 5 Mo et 4000 px de côté au plus, 8 px au moins, et un rapport largeur/hauteur de 10 au plus.
2. Dans le formulaire du filigrane, choisir **Type : Logo envoyé ci-dessous**, puis enregistrer. Ce logo garde ses couleurs.

## Utiliser les dessins de la marque

**Type : Emblème du site** ou **Logo complet du site** reprend les dessins envoyés dans Apparence (des masques : la forme seule), colorés dans la teinte choisie. Le nom du fichier entre dans l'empreinte des variantes : remplacer le dessin dans Apparence recalcule les images.

- **Teinte automatique :** pour chaque photo, luminosité moyenne de la zone du filigrane (le tiers concerné pour un bord ou un coin, toute l'image pour le centre, le plein cadre et la mosaïque) ; au-dessus de 150 sur 255, le filigrane est sombre, sinon clair.
- **Plein cadre :** le dessin tient dans l'image moins les marges, proportions gardées, centré. Réglage conseillé : opacité 15 à 25 %, marge 5 à 8 %.

Envoyer un nouveau logo remplace l'ancien. **Retirer le logo** supprime le filigrane de type « Logo » jusqu'au prochain envoi.

> Les SVG sont refusés. Le logo est réenregistré en PNG par le site : le fichier envoyé n'est jamais servi tel quel.

## Exclure une photo du filigrane

Dans la fiche de la photo, choisir **Filigrane : Jamais sur cette photo**, puis enregistrer. Les métadonnées choisies s'appliquent quand même à cette photo.

## Choisir les métadonnées (EXIF)

| Choix | Ce que contiennent les images du site | Quand le choisir |
|---|---|---|
| **Aucune métadonnée** (défaut) | Rien. | Par défaut : rien ne fuit. |
| **Droits d'auteur** | Auteur, « © année auteur », et mentions IPTC (crédit, lien vers la page « Droits d'utilisation ») | Pour signer les fichiers. Voir [Preuves d'antériorité et droits](Preuves-et-droits#signer-les-images-mentions-iptc). |
| **Prise de vue** | Droits + appareil, objectif, ouverture, vitesse, ISO, focale, date | Pour partager sa technique. **Jamais la localisation.** |
| **Tout l'EXIF de l'original** | Tout, **y compris la position GPS** et le numéro de série éventuel | Rarement : révèle où la photo a été prise. |

Les champs EXIF n'acceptent que des caractères simples : « © 2024 Sébastien » y est écrit « (C) 2024 Sebastien ». Les mentions IPTC (XMP) et le filigrane, eux, gardent les accents.

## Revenir en arrière

Pour revenir au comportement d'origine :

1. Décocher **Ajouter un filigrane**.
2. Choisir **Aucune métadonnée**.
3. Enregistrer.

Les images redeviennent identiques à celles d'avant, avec les mêmes adresses.

## Questions fréquentes

**J'ai enregistré, mais je vois encore l'ancienne image.**
Attendez la fin du bandeau de progression, puis rechargez la page. Les nouvelles images ont une nouvelle adresse : le cache du navigateur ne peut pas les masquer.

**Une photo affiche une erreur dans le bandeau.**
Son original est peut-être illisible. Supprimez-la et importez-la de nouveau. Le détail figure dans les journaux du serveur.

**Le recalcul est long.**
Il dépend du nombre de photos et surtout de l'encodage AVIF : comptez quelques secondes par photo. Voir `AVIF_EFFORT` dans [Configuration](Configuration).
