# Six chambres noires — le site en WebP

**[Ouvrir le catalogue](index.html)** · **[Comparer les six accueils](00-comparatif-six-pistes.webp)**

217 fichiers WebP : **202 captures d’écrans et 15 planches**. Toutes les photographies visibles proviennent exclusivement des quatre paysages générés pour cette étude. Aucune vraie photo du site, aucune ancienne capture du premier dossier, aucune métadonnée photographique des auteurs.

## Comment regarder

Le catalogue `index.html` fonctionne directement après décompression, sans serveur ni connexion Internet. Il donne accès aux planches et aux images individuelles. Cliquer sur un WebP permet de l’ouvrir en taille réelle.

- **Planches** : aperçu du début de chaque écran, pour comparer l’ambiance et la composition.
- **Fichiers individuels** : pages entières, y compris les contenus situés sous le premier écran : carte et connexes de la photo, étapes du voyage, texte des Carnets, pied de page.
- **Exceptions** : agrandissements, menu mobile et fenêtres de l’admin capturés à la taille de la fenêtre, comme ils apparaissent à l’ouverture.

Les WebP sont statiques. Le mode calme stabilise les captures ; les mouvements se consultent dans les maquettes HTML du dépôt. Les photos entières sont conservées en visionneuse ; certaines couvertures ou galeries utilisent le cadrage éditorial propre à leur piste.

## Les six suggestions

| Direction | Planche ordinateur | Planche téléphone |
|---|---|---|
| Obscura | [Voir](obscura/00-parcours-bureau.webp) | [Voir](obscura/00-parcours-mobile.webp) |
| Panoramique | [Voir](panoramique/00-parcours-bureau.webp) | [Voir](panoramique/00-parcours-mobile.webp) |
| Contact | [Voir](contact/00-parcours-bureau.webp) | [Voir](contact/00-parcours-mobile.webp) |
| Résonances | [Voir](resonances/00-parcours-bureau.webp) | [Voir](resonances/00-parcours-mobile.webp) |
| Itinérance | [Voir](itinerance/00-parcours-bureau.webp) | [Voir](itinerance/00-parcours-mobile.webp) |
| Hors cadre | [Voir](hors-cadre/00-parcours-bureau.webp) | [Voir](hors-cadre/00-parcours-mobile.webp) |
| Administration commune | [Voir](admin-commune/00-parcours-bureau.webp) | [Voir](admin-commune/00-parcours-mobile.webp) |

Chaque direction comprend **15 vues ordinateur à 1440 px** et **16 vues téléphone à 390 px** :

1. Accueil.
2. Galerie complète.
3. Photo horizontale avec carte et images connexes.
4. Photo verticale avec carte et images connexes.
5. Photo agrandie.
6. Carte des images.
7. Liste des voyages.
8. Voyage complet et ses trois étapes.
9. Liste des Carnets.
10. Premier Carnet : ralentir.
11. Second Carnet : laisser une place à l’ombre.
12. Les deux regards.
13. Contact.
14. Recherche filtrée.
15. Recherche sans résultat.
16. Menu ouvert, pour le téléphone uniquement.

Les pages intérieures reprennent la grammaire de chaque direction : tirages espacés pour Obscura, larges séquences pour Panoramique, structure de laboratoire pour Contact, paires pour Résonances, chapitres pour Itinérance, asymétrie pour Hors cadre. Les fonctions restent communes.

L’administration reste volontairement conventionnelle et **commune aux six directions** : 8 états dans chacun des deux formats — photothèque, fiche photo, voyages, sortie ajoutée, édition du Carnet, confirmation de publication simulée, vérification, réglages.

## Aucune photographie réelle du site

Le serveur de capture a été créé dans un répertoire temporaire isolé. Il ne contenait que les sources des maquettes, les polices locales et les quatre fichiers autorisés : `maree.webp`, `dune.webp`, `foret.webp`, `cimes.webp`.

Avant la copie, chaque fichier a été comparé par SHA-256 au réencodage de son PNG généré d’origine. Le navigateur refusait tout autre fichier et toute image hors de cette liste. Les captures ont été faites dans un contexte neuf, sans connexion au site ni à son administration. Aucun appel externe ni chargement d’une cinquième image n’a été observé.

- [Empreintes des quatre images générées](provenance-images.json).
- [Manifeste des 202 captures et 15 planches](manifest.json) : dimensions, fichier, empreinte, sources photographiques chargées et vérifications.

La carte est un territoire dessiné et fictif, sans coordonnées réelles. Les textes de présentation des deux regards sont des intentions de maquette, pas des biographies attribuées aux auteurs. Le formulaire et l’admin sont des simulations sans envoi de données.

## Vérifications et limites

Les 202 captures ont été vérifiées pour le chargement des images, l’absence de débordement horizontal et l’absence d’erreur JavaScript au moment de la prise de vue. Chaque WebP a été rouvert après encodage : format, dimensions et absence d’EXIF contrôlés. Des planches, galeries, cartes, voyages et vues mobiles ont été relus visuellement.

Le choix d’un point sur la carte change l’image présentée ; le retour depuis la photo conserve le point et la direction. Le formulaire de contact affiche explicitement qu’aucune donnée n’est transmise. Recherche filtrée, état vide, menu et états de l’admin ont été contrôlés avant leur capture.

Les scénarios d’administration ont été capturés avec un chargement neuf pour chaque état : un simple changement de fragment d’URL pouvait conserver une fenêtre ouverte du scénario précédent. Les premières captures concernées ont été remplacées.

Il s’agit d’une proposition visuelle complète des principaux parcours, pas d’une reproduction exhaustive des écrans et fonctions de production. Les fonctions serveur, authentification, galeries privées, aides techniques réelles et conformité complète RGAA/RGESN ne sont pas évaluées par ces exports.

Les WebP occupent environ **28,2 Mo** au total. L’archive de livraison est créée séparément pour éviter de dupliquer tous ces fichiers dans Git.
