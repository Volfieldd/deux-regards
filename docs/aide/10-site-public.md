# Le site vu par les visiteurs

Ce que vos visiteurs peuvent faire, pour savoir ce que vos réglages changent.

## Langues

Le site existe en **français** (adresses habituelles, `/photo/…`), **anglais** (`/en/…`) et **allemand** (`/de/…`).

- **Ce qui est traduit :** menus, titres de sections, boutons, pied de page, dates (« oct. 2024 », « Oct 2024 », « Okt. 2024 »), noms de pays sur la carte. Ces textes sont fournis par le site, sans traduction automatique.
- **Vos textes** (accroche, introduction, À propos, biographies, noms des séries, titres, légendes et lieux des photos) : leur version anglaise et allemande est **facultative** ; vous la remplissez dans l'admin (repliée sous chaque champ, « en anglais et en allemand »). Si elle manque, on affiche une autre langue :
  - page en allemand : allemand, sinon français, sinon anglais ;
  - page en anglais : anglais, sinon français, sinon allemand ;
  - page en français : français, sinon anglais, sinon allemand.
- **Sélecteur :** au bout du menu (et en haut de la page d'une photo), le drapeau et le code de la langue (🇫🇷 FR). Il ouvre la **même page** dans une autre langue, filtres compris. Le choix est retenu (le seul cookie du site, posé seulement à ce moment-là).
- **Langue à l'arrivée** sur une page française, si le visiteur n'a rien choisi :
  - pays de langue française (France, Monaco, outre-mer, Afrique francophone…) : français ;
  - Allemagne, Autriche, Liechtenstein : allemand ;
  - Belgique, Suisse, Luxembourg, Canada : la langue du navigateur départage (une Zurichoise a l'allemand, un Belge néerlandophone l'anglais) ;
  - ailleurs : anglais ; pays inconnu (réseau local) : la langue du navigateur.
- **Jamais redirigés :** les robots des moteurs de recherche (chaque langue est indexée à sa propre adresse, liées entre elles), les aperçus de liens, et toute adresse en `/en/` ou `/de/` (un lien partagé s'ouvre dans la langue choisie par celui qui le partage).

## Accueil

- **Ouverture :**
  - photos plein écran qui défilent toutes les 6 secondes ;
  - vignettes pour choisir une photo ;
  - bouton **Pause** pour arrêter le défilement (il devient **Lecture** pour le relancer) ;
  - le défilement s'interrompt aussi quand la souris ou le clavier est sur l'ouverture.
- **Deux regards :** « Les deux », ou un photographe. La galerie se filtre **sans recharger la page**, et l'adresse change (`/auteur/julien`) : elle se partage.
- **Séries :** l'index en grand. Le survol montre une photo de la série ; un clic filtre, un second clic retire le filtre. Les filtres se combinent avec les regards.
- **Ordre :** au-dessus de la grille, **Sélection** (l'ordre que vous avez choisi dans la photothèque, par défaut) ou **Plus récentes** (par date de publication, la dernière publiée d'abord). L'ordre se cumule avec les filtres, garde son adresse (`?ordre=recentes`) et vaut aussi pour la photo précédente et suivante. La date retenue est celle de la **première** publication : une photo dépubliée puis republiée garde sa place.
- **Galerie :** toutes les photos publiées, dans l'ordre de l'admin.

## Visionneuse (page d'une photo)

| Geste | Effet |
|---|---|
| **→** ou glissé vers la gauche | photo suivante |
| **←** ou glissé vers la droite | photo précédente |
| **Échap**, « Fermer » ou le bouton Retour du navigateur | retour à la série (ou à la galerie), au même filtre et à l'endroit quitté |
| pincement (téléphone) | zoom sur la photo |
| **Lire la suite** | déplie une légende longue (3 lignes sinon) ; on la lit en faisant défiler la page, **Réduire** la replie |

Le premier écran montre la photo, son titre et le début de la légende ; une légende courte s'affiche en entier. Sur téléphone, les flèches ‹ › sont sous le texte.

La photo suivante dépend du filtre actif : dans « Rue, par Julien », on reste dans cette sélection.

**Retour à la série :** passer d'une photo à la précédente ou à la suivante ne s'empile pas dans l'historique du navigateur. Après avoir vu dix photos, **un seul** Retour (ou **Fermer**, ou **Échap**) ramène à la série, à la hauteur où on l'avait quittée, et la dernière photo vue est remise à l'écran.

## Autres pages

- **À propos :** logo complet, accroche, texte, biographies des auteurs.
- **Droits d'utilisation :** conditions, contact et information sur la mesure d'audience, en trois langues : `/droits` (français), `/en/droits` (anglais), `/de/droits` (allemand). Le sélecteur de langue du menu passe de l'une à l'autre (les anciennes adresses `/droits/en` et `/droits/de` mènent aux nouvelles). Les textes se règlent dans [Réglages](reglages).
- **Carte** (si vous l'avez publiée dans les [Réglages](reglages)) : une mappemonde aux couleurs du thème, avec la vignette ronde d'une photo sur chaque ville et, en pastille, le nombre de photos de cette ville. Les villes trop proches pour être distinguées se regroupent (nombre cumulé) ; un clic sur le groupe agrandit la carte jusqu'à les séparer. Sous la carte, la liste des lieux avec leurs photos ; un clic sur une vignette de la carte y mène.

  | Geste | Effet |
  |---|---|
  | **+**, **−**, **Monde** | zoom avant, arrière, retour au monde entier |
  | pincement (téléphone), **Ctrl + molette** ou pincement du pavé tactile | zoom à l'endroit visé |
  | glisser (carte agrandie) | se déplacer |

  En zoomant, le fond devient plus détaillé (côtes, frontières, petites îles) : seule la zone affichée est chargée. La molette seule et le glissé vertical sur la carte au monde entier font défiler la page, comme ailleurs. Sans JavaScript, la carte est fixe et la liste des lieux reste complète.
- **« Je vous ai photographié »** (`/bonjour`) : la page du QR des cartes de rencontre et des vêtements (`/bonjour/J` : avec le nom du photographe), sans lien dans le menu (voir [Rencontres](rencontres)).
- **Page introuvable :** pour une adresse inconnue ou une photo dépubliée.

## Toujours

- **Sans JavaScript, au clavier, avec un lecteur d'écran :** le site fonctionne.
- **Images :** elles s'adaptent à l'écran (format AVIF ou WebP, taille juste).
- **Protection :**
  - le clic droit et le glisser des images sont désactivés ;
  - les originaux ne sont jamais accessibles ;
  - les photos en brouillon ne sont visibles que dans l'admin.
