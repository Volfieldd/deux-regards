# Maquettes v3 du site public (19 oct. 2026)

La v2 (maquettes de l'[audit d'ergonomie du 16 oct.](../audit-ergonomie-2026-10-16/maquettes/README.md), puis le site v2) a corrigé l'accessibilité de la v1, mais l'a payé en beauté : la photo tenue dans une boîte, une typographie sans relief (tout entre 13 et 16 px), chaque règle dessinée à l'écran (un cadre d'un pixel autour des boutons, de gros points, des filets partout), aucune chaleur. La v3 garde le fond de la v2 (composants, mots, contrastes, cibles de 44 px, focus, rien sans geste ni sans script) et change le dessin.

Elle tient en un fichier, [`_commun/v3.css`](_commun/v3.css), chargé après `public.css` par chaque maquette, et en deux écrans refaits : l'accueil (MQ-01) et la planche (MQ-00). C'est ce fichier qu'il faudra reporter dans `public/css/v2/` pour que le site change.

## Ce qui change

| | v2 | v3 |
|---|---|---|
| Ouverture de l'accueil | La photo entière dans un cadre, la promesse et le cartel dessous, des points et « Lire » encadré | **Plein cadre** : la photo prend l'écran, recadrée de 10 % au plus (horizontales au bureau, verticales au téléphone, point focal par photo) ; l'en-tête posé dessus sur une bande sombre fixée en pixels ; le titre de la photo en 60 px dans le bas, sur un voile limité au texte ; des traits au lieu des points |
| Titres | Page 52 px, partie 32 px | Page 64 px, partie 44 px, promesse 80 px, Jost 300 |
| Méta du cartel | Jost 13 px gris | Plex Mono 13 px, casse normale (la voix de la v1, sans ses capitales de 11 px) |
| Étiquettes courtes | Gris | Sable |
| Bascules (J'aime, Lire, Favori), « Menu » | Cadre d'un pixel, inversées quand actives | Sans cadre : icône et verbe, 44 px de haut ; l'état se lit à l'icône pleine (sable) et à `aria-pressed` |
| En-tête | Filet en bas, séparateur de « Tirages » sur toute la hauteur | Sans filet, séparateur de 18 px |
| Choix du regard (accueil) | Une liste à filets, puis un diptyque à côté, puis les mêmes choix en filtres | Trois cartes à l'image : « Les deux » (le diptyque du Douro), Sébastien, Julien |
| Rythme | 96 px entre les parties, filets autour des listes | 128 px au bureau, un filet au-dessus du titre d'une partie seulement, plus d'air entre les rangées |
| Visionneuse | Titre 20 px, Partager souligné, blocs à filets, « Tirage : à partir de 180 € » | Titre 34 px, position en sable, Partager en action, blocs sans filets, légende 21 px, sans bouton d'achat |
| Pied de page | — | Plus d'air, liens toujours soulignés (UX-F-23), d'un trait plus discret |

**Décision du 19 oct. 2026 contraire à la lettre de l'audit :** l'ouverture recadre (10 % au plus) et voile (le bas, sous le texte, et la bande de l'en-tête), là où UX-F-17 demandait « ni recadrage ni voile ». Les garde-fous : un cadre au format de la photo à 10 % près, un point focal par photo, le voile limité à la hauteur du texte, des contrastes calculés au pire (sur un blanc pur : titre 7,4:1, méta 5,9:1, menu 5,8:1).

## La liste

Les onze écrans du site public, administration exclue (elle garde son dessin, la « Chambre noire »). **Sans boutique** (19 oct. 2026) : ni prix, ni bouton d'achat, ni « Tirages », ni panier ; les écrans de la boutique (MQ-13 à MQ-15) restent en v2, dans les maquettes de l'audit, pour le jour où elle se fera.

| Maquette | Écran | Rendus |
|---|---|---|
| [MQ-00](MQ-00-direction-artistique.html) | Planche de direction artistique | [bureau](MQ-00-direction-artistique-bureau.webp) · [téléphone](MQ-00-direction-artistique-mobile.webp) |
| [MQ-01](MQ-01-accueil-promesse.html) | Accueil, plein cadre (refait) | [bureau](MQ-01-accueil-promesse-bureau.webp) · [téléphone](MQ-01-accueil-promesse-mobile.webp) |
| [MQ-02](MQ-02-galerie-rangees-filtres.html) | Galerie | [bureau](MQ-02-galerie-rangees-filtres-bureau.webp) · [téléphone](MQ-02-galerie-rangees-filtres-mobile.webp) |
| [MQ-03](MQ-03-page-serie.html) | Page d'une série | [bureau](MQ-03-page-serie-bureau.webp) · [téléphone](MQ-03-page-serie-mobile.webp) |
| [MQ-04](MQ-04-visionneuse-cartel.html) | Visionneuse | [bureau](MQ-04-visionneuse-cartel-bureau.webp) · [téléphone](MQ-04-visionneuse-cartel-mobile.webp) |
| [MQ-05](MQ-05-bonjour-formulaire.html) | « Je vous ai photographié » | [bureau](MQ-05-bonjour-formulaire-bureau.webp) · [téléphone](MQ-05-bonjour-formulaire-mobile.webp) |
| [MQ-06](MQ-06-contact-tirage.html) | Licence, contact | [bureau](MQ-06-contact-tirage-bureau.webp) · [téléphone](MQ-06-contact-tirage-mobile.webp) |
| [MQ-11](MQ-11-carnets-liste.html) | Carnets : la liste | [bureau](MQ-11-carnets-liste-bureau.webp) · [téléphone](MQ-11-carnets-liste-mobile.webp) |
| [MQ-12](MQ-12-carnet-billet.html) | Carnets : un billet | [bureau](MQ-12-carnet-billet-bureau.webp) · [téléphone](MQ-12-carnet-billet-mobile.webp) |
| [MQ-16](MQ-16-galerie-privee-acces.html) | Galerie privée : l'accès | [bureau](MQ-16-galerie-privee-acces-bureau.webp) · [téléphone](MQ-16-galerie-privee-acces-mobile.webp) |
| [MQ-17](MQ-17-galerie-privee.html) | Galerie privée ouverte | [bureau](MQ-17-galerie-privee-bureau.webp) · [téléphone](MQ-17-galerie-privee-mobile.webp) |

Les autres écrans gardent leurs repères de la v2 : leur encart « Ce qui change » s'ouvre sur une ligne v3. Les rendus sont faits comme ceux de la v2 (bureau 1 440 × 900, densité 1 ; Pixel 7, densité 2 ; en bandes au-delà de 16 000 px, à lire de gauche à droite), annotations comprises ; `#sans-annotations` les retire.

## Dans le site

La v3 se choisit dans l'administration, comme la v1 et la v2 : Réglages → Apparence → « Site public : v1, v2 ou v3 » pour tous les visiteurs, ou le bouton « Voir en v3 » pour vous seul (PLAN, point 9 ; Spécifications, P28).

## Contrôle

Une seule passe, sans jury : [CONTROLE.md](CONTROLE.md).

## Ouvrir les maquettes

Ouvrez un fichier `MQ-xx-….html` dans un navigateur, en gardant le dossier entier : tout est dans `_commun/` (copie de celui de la v2, plus `v3.css`), rien n'est chargé d'Internet.
