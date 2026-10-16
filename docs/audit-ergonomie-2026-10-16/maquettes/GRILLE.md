# Grille d'évaluation des maquettes

Chaque maquette est notée sur 10 pour chacun des critères ci-dessous, par un jury qui ne l'a pas dessinée. **La note d'une maquette est la plus basse de ses notes** : une seule faiblesse suffit à la faire descendre. Cible : 10/10 partout. Seuil : un choix qui ferait passer un critère sous 8/10 déclenche une nouvelle évaluation et une autre solution.

| # | Critère | 10/10 veut dire | Comment on le vérifie |
|---|---|---|---|
| 1 | Guidage (B&S 1) | On sait où l'on est, ce qu'on peut faire et ce qui vient de se passer, sans chercher. | Lecture de l'écran à froid, en 5 secondes ; repères, titres, états actifs, retours visibles. |
| 2 | Charge de travail (B&S 2) | La tâche principale se fait en un minimum d'actions ; rien d'inutile à lire. | Compte des actions et des écrans de la tâche ; densité. |
| 3 | Contrôle explicite (B&S 3) | Rien ne se déclenche sans geste explicite ; tout se défait. | Actions nommées, confirmations proportionnées, annulation. |
| 4 | Adaptabilité (B&S 4) | Clavier, toucher, souris ; bureau et téléphone ; sans JavaScript ; trois langues. | Rendus bureau et téléphone ; libellés allemands plus longs tenus. |
| 5 | Gestion des erreurs (B&S 5) | Erreurs prévenues, annoncées près du champ, faciles à corriger ; saisie gardée. | États d'erreur montrés quand l'écran a un formulaire. |
| 6 | Homogénéité (B&S 6) | Mêmes composants, mêmes mots, mêmes places d'une maquette à l'autre, conformes à la planche de direction artistique. | Comparaison avec MQ-00 et les autres maquettes. |
| 7 | Signifiance (B&S 7) | Chaque mot et chaque icône disent exactement ce qu'ils font ; vocabulaire du site. | Relecture des libellés. |
| 8 | Compatibilité (B&S 8) | Conforme aux habitudes des visiteurs et des photographes (sens de lecture, conventions e-commerce, gestes). | Comparaison aux conventions établies (Baymard pour la boutique). |
| 9 | Accessibilité (RGAA 4.1.2, WCAG 2.2 AA) | 0 violation axe ; contrastes ≥ 4,5:1 (3:1 grands textes et composants) ; focus visible ; cibles ≥ 24 px (44 px au toucher) ; structure et noms accessibles. | axe-core sur chaque rendu ; mesures de contraste ; lecture du HTML. |
| 10 | Sobriété (RGESN 2024) | Rien d'inutile chargé ; images à la taille d'affichage ; pas de JavaScript obligatoire. | Poids et requêtes du rendu ; lecture du HTML. |
| 11 | Direction artistique | La photo d'abord ; rythme, silence, hiérarchie ; typographie et couleurs du site ; on a envie d'y rester. | Regard de photographe sur les rendus. |
| 12 | Fidélité au site et faisabilité | Construite avec les styles, gabarits et données réels du site ; implémentable telle quelle dans le code actuel, sans framework ni dépendance ; données plausibles. | Comparaison avec `views/`, `public/css`, `public/admin`, le modèle de données. |
| 13 | Couverture des constats | Chaque constat cité par la maquette est réellement résolu à l'écran. | Liste des constats UX-… et vérification un par un. |
| 14 | Lisibilité de la maquette | Les états importants sont montrés ; les annotations éclairent sans gêner la lecture de l'écran. | Lecture par quelqu'un qui n'a pas lu l'audit. |

## Contrôles outillés (passe 2 du 16 oct. 2026)

Les critères ne changent pas. Une partie de leurs vérifications est outillée, dans `/home/claudecode/dr-work/outils/` ; un jury peut s'en servir, et une maquette ne se déclare pas finie sans les avoir passés :

| Critère | Contrôle |
|---|---|
| 4, 9 | axe-core au bureau et sur Pixel 7 ; débordement de 320 à 1 440 px, en allemand compris (`consol-final.mjs`, `consol-admin.mjs`) ; focus visible sur chaque champ, en erreur compris |
| 10 | `passe2-rangees.mjs` : le fichier chargé par chaque vignette, à comparer à sa largeur d'affichage ; passe 3 : `p3-images.mjs`, toutes les images (états compris) à 1 440, 1 024, 820, Pixel 7 et 320 px, le fichier chargé comparé au plus petit du `srcset` qui couvre l'écran (12 % d'agrandissement admis ; un cran de trop admis dans une rangée justifiée sur tablette) ; `sizes-tel.py` et `sizes-tel-ecrire.py` (place réelle au téléphone) |
| 6, 7 | `insecables.py` (ponctuation) ; lexique, § 0 et § 4.9 (mots, données, chronologie du 16 oct.) |
| 11 | `p3-sombres.mjs` : les trois scènes de nuit et de contre-jour jamais dans la première rangée d'une vue filtrée, à 9 largeurs |
| 14 | `controle-annotations.mjs` : pastilles dans l'écran et hors des photos et des textes, étiquettes entières, cadres `inert`, pied de page avant l'encart, un seul bloc Mesures, interface identique sans annotations (géométrie) ; `consol-sans.py` (pixels, magenta masqué ; `p3-sans-ecrans.mjs` et `.py` écran par écran pour une page trop haute) ; `radios-cadres.py` (un nom de groupe de radios par cadre) |

**Contrôles ajoutés après le jury v2 (passe 4, 16 oct. 2026).** Une maquette ne se déclare pas finie sans eux non plus :

- **Allemand du code.** L'en-tête allemand de contrôle de `consol-final.mjs` emploie les libellés de `server/i18n.js` (« Suchen ») ; le remplacement garde le panier et la page active.
- **Ellipses.** `consol-final.mjs` et `consol-admin.mjs` listent à part (« ellipse … ») tout texte coupé par `text-overflow: ellipsis` ou `line-clamp`, à chaque largeur, en français et en allemand.
- **Lignes qui défilent.** Ils vérifient que toute ligne qui défile à l'horizontale montre une suite au défilement 0 (un élément coupé au bord droit), sinon « ligne défilante sans suite visible », de 320 à 1 440 px et sur Pixel 7.
- **axe sans `inert`.** Ils repassent axe-core sur la page dont on a retiré tous les `inert` et `.is-focus` (« axe sans inert ») : un état doit être sans défaut une fois actif. `p2adm-focus.mjs` et `p2-1820-de.mjs` acceptent `--sans-inert` : le focus visible est testé dans les cadres d'état aussi.
- **Barre latérale.** `consol-admin.mjs` mesure l'intérieur de chaque `.side` (cadres compris) : aucun descendant hors de la barre, pas de défilement horizontal ; en français à toutes les largeurs, et à 820, 1 024 et 1 440 px avec la barre allemande de `MQ-00-echantillons/admin-bureau-clair-de.html`.
- **Images sans `srcset`.** `p3-images.mjs` les contrôle aussi (bloc « sans srcset ») : la taille affichée × densité est comparée aux variantes 160, 480, 900 et 1 600 qui existent (« trop petit » sous 88 % du besoin quand une variante plus grande existe ; « trop gros » quand une plus petite suffit à 12 % près).
- **Insécables.** `insecables.py` protège aussi le jour abrégé suivi du quantième (« sam. 10 oct. »).
- **Focus caché par un élément collant (WCAG 2.4.11, RGAA 10.7).** `focus-colle.mjs` parcourt la page au clavier au bureau, sur Pixel 7 et à 320 × 640 (Tab puis Shift+Tab, en continu et « au bord ») et signale tout élément focalisé caché par un élément `sticky` ou `fixed` : « CACHÉ (2.4.11) » si tous les points testés sont couverts, « en partie (2.4.12) » sinon. Le remède : `scroll-padding-top` ou `-bottom` à la hauteur de la barre (`public.css` § 17, `admin-plus.css` § 2).
- **Deux photos au plus par rangée au téléphone.** `p4-portrait.mjs` recompose les vues Portrait, Julien et deux cas limites (trois et cinq verticales de suite) à 320, 360, 412 et 767 px ; `sizes-tel.py` applique la même règle (`public.css` § 18).
- **Copie figée.** `MQ_RACINE=<dossier>/ run-pw.sh …` fait tourner un outil sur une copie figée des maquettes (pour prouver qu'un contrôle voit un défaut corrigé depuis).
