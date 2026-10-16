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
