# Réglages

Accroche, introduction et « À propos » ont chacun leur version **anglaise et allemande**, facultative, repliée sous le champ français (« … en anglais et en allemand » ; l'état indique *facultatif*, *1 langue sur 2* ou *traduit*). Vide : les visiteurs anglais et allemands lisent le texte français (voir [Le site vu par les visiteurs](site-public)). Le bouton **Proposer une traduction** pré-remplit un champ (voir [Photos](photos), « La fiche d'une photo »).

| Champ | Où il apparaît |
|---|---|
| **Nom du site** | logo texte, titre des pages, variable `{site}` du filigrane. Vide : nom par défaut du serveur. |
| **Accroche** | titre de la section « regards » de l'accueil, titre de « À propos », description pour les moteurs de recherche |
| **Introduction** | texte sous l'accroche, à l'accueil |
| **À propos** | page « À propos ». Séparez les paragraphes par une ligne vide. |
| **Droits d'utilisation : Français** | page publique `/droits`. Le champ affiche le texte publié, avec un badge **Texte par défaut** ou **Texte personnalisé**. Laissé tel quel, le texte par défaut suit les noms des auteurs ; **Rétablir le texte par défaut** le remet (puis enregistrez). |
| **Droits d'utilisation : English, Deutsch** | pages `/en/droits` (anglais) et `/de/droits` (allemand), proposées aux visiteurs par le sélecteur de langue en haut de la page (Français, English, Deutsch). Mêmes badges et même bouton. Si le texte français est personnalisé et pas une traduction, un avertissement le signale : adaptez-la, sinon les visiteurs étrangers lisent la traduction du texte par défaut. |
| **Droits d'utilisation : contact** | adresse e-mail ou lien `https://`, affiché comme lien sur `/droits` |
| **Confidentialité** | le **contact** des responsables affiché sur la page `/confidentialite` (RGPD, en trois langues) et deux cases à cocher **seulement quand c'est vrai** : l'authentification à deux facteurs pour tous les comptes de l'admin, et des disques chiffrés pour les données et les sauvegardes (la page les annonce alors). Le reste de la page suit le site tout seul. |
| **Page Carte** | case **Publier la page Carte**, décochée par défaut. Cochée : la page `/carte` est ouverte aux visiteurs, un lien **Carte** apparaît dans le menu du site, et la page entre dans `sitemap.xml`. Décochée : les visiteurs reçoivent « page introuvable » ; connecté, vous la voyez en **aperçu** (bandeau en tête). Le panneau indique combien de photos sont sur la carte. Seules les photos **publiées** dont la fiche coche **Afficher sur la carte** y figurent (voir [Photos](photos)). |
| **Photos de l'ouverture** | le diaporama plein écran de l'accueil, dans l'ordre choisi |

## Photos de l'ouverture

Le diaporama plein écran de l'accueil, **dans l'ordre que vous choisissez**.

- **Ajouter :** cochez une photo publiée dans « Ajouter des photos publiées ». Elle s'ajoute en fin de diaporama.
- **Vignettes :** chacune montre la photo **entière**, sans la déformer ni la couper, dans un cadre au format 3:2 (des bandes neutres complètent les photos en hauteur).
- **Ordonner :** dans « Ordre du diaporama », glissez une vignette, ou utilisez **←** et **→** sous chaque vignette.
- **Retirer :** **✕** sous la vignette.
- **Limite :** 8 photos. Le compteur (« 5 / 8 choisies ») l'indique ; à 8, les autres cases se désactivent et un message le dit.
- **Sans choix :** les 5 premières photos publiées de la galerie.
- **Photo dépubliée ou supprimée :** elle sort de l'ouverture. **Adresse modifiée :** elle y reste.

Cliquez sur **Enregistrer l'ouverture** (ou **Enregistrer les réglages** en bas de page). Sans JavaScript, les boutons ← → ✕ enregistrent aussitôt.
