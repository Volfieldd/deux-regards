# Spécification : filigrane et métadonnées (EXIF)

| | |
|---|---|
| Statut | Implémenté (branche `feat/filigrane-exif`) |
| Écran | Admin → **Filigrane & EXIF** (`/admin/images`), option par photo dans la fiche photo |
| Code | `server/watermark.js`, `server/images.js`, `server/variants.js`, `server/routes/admin.js` |
| Tests | `test/watermark.test.js`, `e2e/tests/parcours.spec.js` |

## 1. Objectif

Permettre aux auteurs :

1. d'apposer un **filigrane** (texte ou logo) sur les images servies par le site ;
2. de choisir le **niveau de métadonnées EXIF** conservé dans ces images, de « aucune » (défaut) à « tout l'EXIF de l'original ».

Les **originaux ne sont jamais modifiés** : filigrane et métadonnées ne concernent que les variantes servies (AVIF et WebP, 640, 1280 et 2000 px).

## 2. Exigences fonctionnelles

### 2.1 Filigrane

| Id | Exigence |
|---|---|
| F1 | Le filigrane est désactivé par défaut. Une case l'active pour tout le site. |
| F2 | Deux types : **texte** ou **logo** (image PNG ou WebP, de préférence transparente). |
| F3 | Le texte accepte des variables : `{auteur}` (nom de l'auteur de la photo), `{annee}` (année de prise de vue, à défaut année d'import), `{site}` (nom du site), `{titre}` (titre de la photo). 80 caractères au plus. Défaut : `© {auteur}`. |
| F4 | Police au choix parmi celles du site : Jost, Cormorant Garamond italique (défaut), IBM Plex Mono. Teinte claire (défaut) ou sombre. |
| F5 | Position : 9 emplacements (coins, bords, centre ; défaut en bas à droite) ou **mosaïque** (motif répété en diagonale à 30° sur toute l'image). |
| F6 | Opacité de 5 à 100 % (défaut 60), largeur de 3 à 60 % de la largeur de l'image (défaut 22), marge de 0 à 20 % (défaut 3). Le filigrane n'est jamais plus grand que l'image. |
| F7 | Tailles concernées : toutes (défaut), 1280 px et plus (les vignettes de 640 px sont épargnées), ou 2000 px seulement. La plus grande variante produite est toujours marquée, même si l'original est plus petit que le seuil. |
| F8 | Une photo peut être **exclue** du filigrane (« Jamais sur cette photo ») ; elle reçoit tout de même les métadonnées choisies. |
| F9 | Logo : PNG ou WebP, 5 Mo et 4000 px de côté au plus, 8 px au moins, rapport largeur/hauteur de 10 au plus ; il est toujours redimensionné dans la boîte de l'image (pas d'image intermédiaire géante). Il est **réencodé en PNG** à l'envoi ; le fichier envoyé n'est jamais servi tel quel. Un seul logo à la fois ; l'ancien est supprimé au remplacement. Sans logo, un filigrane de type « Logo » n'est pas appliqué (et l'admin le signale). |
| F10 | **Aperçu** : la page montre la photo choisie avec les réglages enregistrés ; le bouton « Aperçu sans enregistrer » ouvre dans un nouvel onglet le rendu des réglages du formulaire, sans rien enregistrer. |

### 2.2 Métadonnées

| Mode | Contenu des images servies |
|---|---|
| **Aucune métadonnée** (défaut) | Rien : EXIF, XMP, GPS et profil retirés. |
| **Droits d'auteur** | `Artist` = nom de l'auteur, `Copyright` = `© année auteur`, écrits par le site (pas recopiés). Champs ASCII : « © 2024 Sébastien » devient « (C) 2024 Sebastien ». |
| **Prise de vue** | Droits + `Make`, `Model`, `LensModel`, `ExposureTime`, `FNumber`, `ISOSpeedRatings`, `FocalLength`, `DateTimeOriginal` recopiés de l'original. **Jamais** de GPS ni de numéro de série. |
| **Tout l'EXIF de l'original** | L'EXIF complet de l'original, **GPS compris**. Signalé comme à éviter dans l'admin. |

Dans tous les cas, l'orientation est appliquée aux pixels et la balise `Orientation` vaut 1 (pas de double rotation dans les navigateurs).

### 2.3 Mise à jour des images

| Id | Exigence |
|---|---|
| M1 | Tout changement qui modifie le rendu (réglages, logo, nom du site, nom d'un auteur, titre, date ou auteur d'une photo, exclusion d'une photo) déclenche un **recalcul en arrière-plan** des seules photos concernées. |
| M2 | Pendant le recalcul, le site continue de servir les anciennes images ; chaque photo bascule d'un coup sur ses nouvelles variantes une fois celles-ci écrites. Jamais d'image cassée. |
| M3 | L'admin affiche la progression (« Mise à jour des images en cours : n / total ») et les éventuelles erreurs. |
| M4 | Une photo importée reçoit immédiatement le filigrane et les métadonnées du moment. |
| M5 | Au démarrage du serveur, les variantes sont vérifiées et recalculées si besoin (réglages modifiés hors de l'admin, recalcul interrompu). |
| M6 | `npm run variants` fait la même vérification en ligne de commande ; `-- --force` recalcule tout. |

## 3. Conception

### 3.1 Empreinte des variantes

Les variantes sont mises en cache un an (`immutable`) par les navigateurs. Pour qu'un changement de réglage soit visible sans attendre, **le nom de chaque variante porte une empreinte des réglages qui l'ont produite** :

```
<uuid>-<largeur>.<format>               variante brute (ni filigrane ni métadonnée)
<uuid>-<empreinte>-<largeur>.<format>   variante avec filigrane et/ou métadonnées
```

- L'empreinte est la composante `variant_key` de la photo : les 8 premiers caractères hexadécimaux du SHA-256 de `{ version du rendu, filigrane effectif, métadonnées effectives }`.
- Le filigrane effectif contient le texte **après** remplacement des variables. Renommer un auteur ne change donc que l'empreinte de ses photos.
- Sans filigrane ni métadonnée, l'empreinte est vide : les noms d'origine sont conservés, et passer à ces réglages ne recalcule rien pour des variantes déjà brutes.
- `/media/<nom>` ne sert une variante que si la photo est publiée **et** que l'empreinte du nom est l'empreinte courante. Une ancienne variante n'est donc plus jamais servie, même si un fichier traînait.
- La constante `PIPELINE` (`server/variants.js`) entre dans l'empreinte. L'incrémenter force le recalcul de tout, par exemple après une modification du code de rendu.

### 3.2 Recalcul

`createVariantService` (`server/variants.js`) gère une **file unique** : jamais deux rendus en parallèle, et des demandes rapprochées ne produisent qu'un seul passage complet. Pour chaque photo :

1. calcul des réglages effectifs et de l'empreinte (`specFor`) ;
2. si l'empreinte est identique et que tous les fichiers existent, rien à faire ;
3. sinon, rendu des variantes sous le nouveau nom, mise à jour de `photos.variant_key`, puis suppression des variantes portant une autre empreinte.

### 3.3 Rendu

- Un seul pipeline `sharp` par variante : `rotate()` (orientation EXIF), `resize()`, `composite()` (le filigrane, posé à la taille finale), puis métadonnées et encodage. Il n'y a pas de réencodage intermédiaire.
- Filigrane texte : rendu par Pango (inclus dans `sharp`) avec les polices du site converties en TTF dans `assets/fonts/` (familles « Filigrane Sans/Serif/Mono », licence SIL OFL). La conversion est nécessaire car le Pango de `sharp` ne lit pas WOFF/WOFF2. Les caractères spéciaux sont échappés (balisage Pango).
- Opacité : la couche alpha du filigrane est multipliée (`dest-in`).
- Mosaïque : le motif est tourné de -30°, espacé d'une demi-largeur et répété (`tile`).
- Métadonnées « prise de vue » : l'EXIF de l'original est lu avec `exif-reader`, et seule la liste blanche de balises est réécrite (`withExif`). « Tout » utilise `keepExif()`.

### 3.4 Données

Migration `003_variants.sql` :

| Colonne | Rôle |
|---|---|
| `photos.watermark` | `NULL` = réglage général, `0` = jamais de filigrane sur cette photo |
| `photos.variant_key` | empreinte des variantes servies (`''` = brutes) |

Réglages (table `settings`, JSON) : `watermark` (`enabled`, `kind`, `text`, `font`, `tone`, `position`, `opacity`, `size`, `margin`, `minWidth`, `image`) et `exif` (`mode`). Le logo est rangé dans `STORAGE_DIR/watermarks/<uuid>.png`.

### 3.5 Routes

| Méthode et route | Rôle |
|---|---|
| `GET /admin/images` | page des réglages |
| `POST /admin/images` | enregistrer, puis recalculer en arrière-plan |
| `GET /admin/images/apercu.webp?photo=` | aperçu des réglages enregistrés |
| `POST /admin/images/apercu` | aperçu des réglages du formulaire, sans enregistrer |
| `GET /admin/images/etat` | progression du recalcul (JSON) |
| `GET /admin/images/logo` | logo actuel |
| `POST /admin/images/logo` | envoi du logo (multipart, jeton CSRF avant le fichier) |
| `POST /admin/images/logo/delete` | retrait du logo |

Toutes exigent une session admin. Les écritures exigent le jeton CSRF. Les réponses ne sont pas mises en cache (`no-store`).

## 4. Sécurité

- Toutes les valeurs du formulaire sont bornées ou ramenées à une liste fermée (`normalizeWatermark`, `normalizeExif`) ; aucune valeur libre n'atteint le rendu, à l'exception du texte, qui est échappé.
- Le logo est décodé (PNG/WebP seulement, SVG refusé), limité en poids et en pixels, puis réencodé.
- « Prise de vue » ne recopie qu'une liste blanche de balises : jamais de GPS, de numéro de série ni de champ libre de l'appareil.
- « Tout l'EXIF » est un choix explicite, signalé en rouge dans l'admin.

## 5. Limites connues

- Un filigrane dissuade mais ne protège pas : il peut être recadré ou retouché. La mosaïque est la plus difficile à retirer.
- Les champs EXIF texte sont en ASCII : `libexif` translittère à l'écriture (« Sébastien » devient « Sebastien », `©` devient `(C)`). Le filigrane, lui, garde les accents.
- Le recalcul complet coûte de quelques secondes à quelques minutes selon le nombre de photos (l'AVIF domine). `AVIF_EFFORT` règle le compromis vitesse/poids.
- Les polices embarquées ne couvrent que le sous-ensemble latin (français compris).

## 6. Critères d'acceptation (testés)

- Sans réglage, les noms et le contenu des variantes sont inchangés (empreinte vide, aucune métadonnée).
- Activer le filigrane change le nom des images publiques ; l'ancienne URL répond 404 et la nouvelle 200. Revenir aux réglages par défaut rétablit les noms d'origine.
- Une photo exclue ne porte pas de filigrane. Renommer un auteur met à jour ses photos.
- Le texte est posé à l'endroit voulu et nulle part ailleurs ; la mosaïque couvre l'image ; le seuil de taille épargne les vignettes ; le logo respecte l'opacité.
- Chaque mode EXIF produit exactement les balises prévues ; le mode « prise de vue » ne contient jamais de GPS.
- Le logo SVG est refusé, le PNG réencodé. Le jeton CSRF est exigé, l'aperçu n'enregistre rien.
- Une photo importée est rendue avec les réglages du moment ; au démarrage, des réglages modifiés hors de l'admin sont appliqués.
