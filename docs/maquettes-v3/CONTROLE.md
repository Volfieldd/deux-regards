# Contrôle des maquettes v3 : une seule passe (19 oct. 2026)

Refait après le retrait de la boutique (MQ-13 à MQ-15 sortis de la v3 ; prix, boutons d'achat, « Tirages » et panier retirés des onze autres) : mêmes outils, mêmes résultats.

Une passe de mesures outillées, puis une notation unique sur la [grille de l'audit](../audit-ergonomie-2026-10-16/maquettes/GRILLE.md), sans jury ni passe de reprise. Chromium de Playwright 1.64 en conteneur ; outils de `dr-work/outils/` lancés sur ce dossier (`MQ_RACINE`).

## Mesures

| Contrôle | Outil | Résultat |
|---|---|---|
| axe-core (WCAG 2.2 A et AA, bonnes pratiques), au bureau (1 440 × 900) et sur Pixel 7 | `consol-final.mjs` | **0 violation** sur les 11 maquettes |
| axe-core sur la page dont on a retiré tous les `inert` et `.is-focus` (chaque état actif) | `consol-final.mjs` | **0 violation** sur les 11 |
| Débordements à 320, 412, 820, 1 024 et 1 440 px, en français et avec l'en-tête allemand du code | `consol-final.mjs` | **aucun** |
| Textes coupés d'une ellipse ; lignes qui défilent sans suite visible | `consol-final.mjs` | **aucun** ; **aucune** |
| Textes rendus sous 13 px (SVG à l'échelle de leur viewBox) | `consol-final.mjs` | **aucun** |
| Validation HTML (html-validate 11, configuration de l'audit) | `htmlvalidate.json` | **0 erreur** |
| Images à la taille d'affichage (accueil et visionneuse, de 320 à 1 440 px) | `p3-images.mjs` | **toutes à la taille** |
| Contraste réel du texte posé sur l'ouverture plein cadre : 6 photos du bureau, 4 du téléphone, pixel le plus clair du fond sous chaque texte | `v3-contraste.mjs`, `v3-contraste.py` | au pire : titre **11,1:1**, méta **9,4:1**, « 1 / 6 » **12,8:1**, « Lire » **13,7:1**, menu **7,7:1** (seuils 4,5:1 ; 3:1 pour le titre et les traits), traits au repos **7,7:1** |
| Contraste calculé au pire théorique (photo blanc pur) | calcul | titre 7,4:1, méta 5,9:1, menu 5,8:1 |
| Poids après défilement complet (bureau / téléphone), sans script ni ressource tierce | `consol-final.mjs` | accueil 282 / 302 ko (v2 : 262 / 291) ; visionneuse 257 / 256 ko ; galerie 304 / 462 ko |

Le poids de l'accueil prend 20 ko : la photo d'ouverture se charge en 1 600 px au bureau, à la taille du plein cadre.

Pas refaits dans cette passe (inchangés depuis la v2, qui les passait) : `focus-colle.mjs` (aucun élément collant ajouté : l'en-tête posé sur la photo est en position absolue), `formulaires.mjs` (aucun formulaire touché), `p4-portrait.mjs` et `sizes-tel-ecrire.py` (rangées inchangées), `debord-hauteurs.mjs`.

## Notation (une passe, sur l'ensemble v3)

La grille note de 0 à 10 ; la note d'une maquette est la plus basse de ses notes.

| # | Critère | Note | Pourquoi |
|---|---|---|---|
| 1 | Guidage | 9 | Rien n'a bougé de place ; titres plus lisibles, étiquettes en sable. |
| 2 | Charge de travail | 9 | Accueil : le choix du regard se fait une fois au lieu de deux. |
| 3 | Contrôle explicite | 10 | Diaporama toujours à l'arrêt, « Lire » visible. |
| 4 | Adaptabilité | 9 | Sans script, allemand, 320 px : vérifiés ; le plein cadre suit l'écran avec ses bandes au-delà de 1 667 px pour 1 000. |
| 5 | Gestion des erreurs | 10 | Formulaires inchangés (MQ-05, MQ-06, MQ-15, MQ-16). |
| 6 | Homogénéité | 8 | Un seul fichier de dessin pour les 11 écrans ; mais MQ-03 garde la liste à filets « La même série, un seul regard », que l'accueil a quittée. |
| 7 | Signifiance | 9 | Mots inchangés ; bascules sans cadre, toujours icône et verbe. |
| 8 | Compatibilité | 9 | Plein cadre et en-tête sur la photo : la convention des sites de photographes. |
| 9 | Accessibilité | 9 | Mesures ci-dessus sans défaut ; le texte sur la photo repose sur un voile calculé au pire et mesuré. |
| 10 | Sobriété | 9 | +20 ko à l'accueil ; une seule image d'ouverture chargée. |
| 11 | Direction artistique | 9 | La photo d'abord, du relief, de la chaleur : à toi d'en juger sur les rendus. |
| 12 | Fidélité et faisabilité | 8 | Un fichier CSS à reporter ; à créer : point focal par photo, deuxième liste d'ouverture (`hero_tel`, déjà demandée par la v2), en-tête posé sur la photo. |
| 13 | Couverture des constats | 7 | UX-F-17 revu à dessein (recadrage de 10 % au plus, voile sous le texte), sur décision du 19 oct. |
| 14 | Lisibilité de la maquette | 7 | Seules MQ-00 et MQ-01 ont des encarts réécrits ; les 9 autres gardent leurs repères v2, avec une ligne v3 en tête. Sur l'accueil, les pastilles 2, 3, 5 et 6 sont sur la photo, faute d'autre place en plein cadre. |

**Note de l'ensemble : 7/10**, tirée par deux choix assumés (le constat UX-F-17 revu et des annotations allégées), et non par un défaut d'accessibilité ou de rendu.
