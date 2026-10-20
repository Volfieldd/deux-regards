# Thèmes sélectionnables par rubrique

Un thème général et des exceptions par rubrique permettent de combiner les trois présentations historiques et les six chambres noires : **Obscura, Panoramique, Contact, Résonances, Itinérance et Hors cadre**. L’installation du code ne change pas le site publié. Il faut enregistrer un choix dans **Apparence → Thèmes et rubriques** pour activer le système.

Exemple : Obscura partout, V1 pour l’accueil et Résonances pour les Carnets. Les choix s’appliquent aux visiteurs après enregistrement ; l’aperçu est réservé à la session de l’administrateur. Les deux versions de l’admin proposent le même formulaire, avec des libellés français, anglais et allemands.

[Mode d’emploi](../aide/08-apparence.md#thèmes-et-rubriques) · [Contrôles et captures](validation.md)

## Périmètre

| Choix | Présentation |
|---|---|
| V1 — Originale | Gabarits historiques et palette existante |
| V2 — Essentielle | Gabarits V2 et palette existante |
| V3 — Plein cadre | Présentation V3 et palette existante |
| Obscura | Tirage centré, marges généreuses, galerie aérée |
| Panoramique | Ouverture cinématographique, bande de sélection, grandes séquences |
| Contact | Planche numérotée et grille compacte |
| Résonances | Images par paires, composition équilibrée |
| Itinérance | Notes à côté des images, étapes et récit |
| Hors cadre | Accrochage asymétrique, tailles et espacements variés |

Les rubriques sont : accueil, galeries/séries/recherche, visionneuse, carte, voyages, Carnets, regards, contact et informations. Les listes et leurs détails partagent un choix. Une visionneuse utilise la rubrique Photos et conserve les fonctions existantes, notamment le contexte du Carnet, les connexes et la mini-carte lorsqu’un lieu est publié.

Le choix concerne une **rubrique de pages**, pas chaque bloc d’une page. Une galerie intégrée dans l’accueil garde le thème de l’accueil ; le menu Galerie ouvre `/galerie`, qui utilise le thème des galeries. Cette nouvelle adresse est disponible lorsque le système est activé, ou dans l’aperçu d’une chambre noire. Les filtres, les séries et les regards existants restent disponibles à leurs adresses.

Les six chambres noires partagent les fonctions V2 et la même administration. Elles ne publient aucun contenu, ne changent pas les permissions et n’activent pas la carte si celle-ci est désactivée. Les galeries privées gardent leur présentation dédiée ; les pages d’authentification restent hors de ce système. Les pages sans gabarit V2 conservent leur repli historique.

Les Carnets restent disponibles dans le nouveau système, même si le thème choisi est V1 : leur rubrique utilise alors V2. Sans configuration de thèmes, le comportement historique V1 reste identique, y compris l’indisponibilité des Carnets. Les menus, le flux, le plan du site et les indications de l’administration utilisent la même règle de disponibilité.

## Structure et coût de maintenance

Le choix par rubrique ajoute un résolveur commun et un réglage persistant. Il ne multiplie pas les modules métier. L’essentiel du coût se trouve dans le dessin et la validation responsive des compositions ; ajouter une exception à une rubrique déjà couverte coûte peu. Un nouveau comportement propre à un thème serait plus coûteux, puisqu’il faudrait le maintenir et le tester séparément.

- `server/designs.js` : catalogue fermé, rubriques, validation et tailles d’images pour les compositions.
- `server/version-publique.js` : héritage, exceptions et aperçus de session ; compatibilité des anciens réglages.
- `views/themes/_ouverture.eta` : ouverture adaptée aux six directions, alimentée par les photos publiées choisies pour l’accueil.
- `public/css/themes/chambre-noire.css` : compositions des pages communes, chargées seulement lorsqu’elles sont utilisées.
- `public/js/chambre-noire.js` : sélection manuelle des images d’ouverture et mode calme. Aucun diaporama automatique, aucune bibliothèque ajoutée.
- `views/admin/_compositions.eta` : formulaire partagé par les deux administrations, utilisable sans JavaScript.

Il s’agit de l’intégration des directions graphiques dans les pages fonctionnelles existantes, pas d’une copie des pages de démonstration. Aucun fichier image des maquettes n’est nécessaire au fonctionnement. Les variantes responsives, les images différées et les polices locales existantes sont réutilisées. Aucun service externe ni animation continue n’est ajouté.

## Réglages, aperçu et retour arrière

Une seule valeur JSON dans la table `settings`, clé `public_design` :

```json
{"default":"obscura","sections":{"accueil":"v1","carnets":"resonances"}}
```

Une rubrique absente suit `default`. La configuration entière est validée avant l’écriture atomique ; un identifiant ou une rubrique inconnus sont refusés sans modification. Une configuration illisible en base est ignorée au profit des réglages historiques.

Le formulaire fait un POST vers `/admin/apparence/compositions`, avec le droit `site.apparence` et un jeton CSRF. Les modifications figurent au journal ; le changement de réglage fait partie de la surveillance existante de la Vigie. L’aperçu utilise la vue serveur de la session existante : un paramètre d’URL ou un cookie forgé ne peut pas imposer une composition à un visiteur. Les réponses de session restent privées et non mises en cache.

**Revenir aux réglages historiques** enregistre `null` dans `public_design`. Les anciennes valeurs `public_version`, `theme` et `brand` sont conservées. Aucun contenu, média ou compte n’est modifié. La suppression des exceptions par ce bouton est volontaire ; noter une combinaison avant de la retirer si l’on veut la retrouver ensuite.

Le mode calme est une préférence locale non sensible. Il s’applique aux déplacements et transitions facultatifs ; la réduction des mouvements demandée par le système prévaut toujours. Sans JavaScript, l’image initiale, les liens, les textes et les formulaires restent utilisables.
