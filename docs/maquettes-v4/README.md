# Nicephos V4 — six chambres noires

20 octobre 2026 · deuxième round de maquettes · **aucun code applicatif modifié**.

**[Parcourir les 217 WebP](webp/index.html)** · **[Comparer les six accueils en WebP](webp/00-comparatif-six-pistes.webp)** · **[Ouvrir les maquettes HTML](index.html)**

Le dossier WebP couvre les principaux parcours dans les six directions, sur ordinateur et téléphone : 202 captures et 15 planches. [Guide des exports et vérification des images](webp/README.md).

## Les images

Ce dossier utilise exclusivement **quatre paysages fictifs générés pour cette étude**, sans image de référence. Ils ne proviennent pas du site, ne reprennent aucune photographie des auteurs et ne leur sont pas attribués. Les textes, collections et lieux sont également fictifs. La carte est un schéma de récit, sans coordonnées réelles.

Les images générées et les prompts sont consignés dans [assets/provenance.json](assets/provenance.json). Outil intégré `imagegen`, puis encodage WebP sans recadrage des fichiers. Les quatre fichiers représentent environ **865 Ko** ; ce total ne constitue pas une mesure de consommation par visite.

Le premier dossier, y compris ses images, captures, présentations et métadonnées, a été retiré. Le commit de la branche a été réécrit. Les anciens livrables ne doivent pas être recopiés dans cette branche. Les captures présentes ici ont toutes été recréées avec les nouveaux paysages générés.

## Consulter

Depuis la racine de ce worktree ou du dépôt après récupération de la branche :

```sh
python3 -m http.server 3185 --bind 127.0.0.1
```

Ouvrir **http://127.0.0.1:3185/docs/maquettes-v4/**. Aucune installation ni compilation. Conserver le dépôt entier : les polices locales viennent de `docs/maquettes-v3/_commun/fonts/`. Ne pas exposer ce serveur de consultation sur Internet.

## Six compositions, six façons de regarder

| Piste | Intention | Navigation et mouvement | Compromis |
|---|---|---|---|
| **01 — [Obscura](obscura.html)** | Un tirage entier suspendu dans le noir. L’image domine, la légende se tient en retrait. | Précédente/suivante à la demande, fondu bref, ouverture entière et retour à l’image choisie. | Peu d’images visibles au départ. Le visiteur entre dans la collection dans un second temps. |
| **02 — [Panoramique](panoramique.html)** | Une salle de cinéma ouverte sur le paysage. Échelle généreuse, bande de vues discrète. | Choix d’une vue dans la bande, ouverture entière, jamais de lecture automatique. | L’accueil recadre en panorama ; l’agrandissement et la visionneuse conservent toujours l’image entière. |
| **03 — [Contact](contact.html)** | Une planche-contact sur fond noir. Le plaisir de choisir et de comparer. | Collection directement visible, accès à la recherche et aux univers. | Plus dense et plus rationnelle ; une grande collection demanderait pagination et respirations éditoriales. |
| **04 — [Résonances](resonances.html)** | Deux images composent un dialogue. La rencontre fait partie de l’œuvre. | Deux diptyques essayables, ouverture de chaque image. | Les associations doivent être choisies par les auteurs. Les portraits et paysages peuvent demander des compositions différentes. |
| **05 — [Itinérance](itinerance.html)** | Le voyage comme fil conducteur. Un grand paysage et une progression lisible. | Entrée dans le récit, trois étapes, retour à la bonne étape après une photo. | Plus narrative ; demande un peu de rédaction et une sélection éditoriale. Les couvertures peuvent être recadrées, pas la visionneuse. |
| **06 — [Hors cadre](hors-cadre.html)** | Un accrochage libre, de grandes respirations et des tailles variées. | Parcours vertical naturel, découverte associative ; ordre linéaire sur téléphone. | Plus de travail de composition, sans drag-and-drop ni manipulation obligatoire du visiteur. |

**Ma recommandation : Obscura pour la galerie, Résonances pour affirmer l’identité des deux regards, Itinérance pour les voyages.** Ce sont trois usages complémentaires d’une même grammaire noire ; aucune fusion n’est imposée dans cette maquette.

La typographie ne recouvre pas les photographies. Le noir est un espace de respiration. Pas de boucle animée, de parallaxe imposée, de défilement capturé, de vidéo ou de fond sonore automatique.

## Les parcours communs

Les six accueils ont des compositions distinctes. Les pages intérieures reprennent désormais la grammaire de chaque direction : espacement des tirages, séquences larges, planche-contact, diptyques, chapitres ou asymétrie. Les fonctions restent communes ; l’administration garde une présentation conventionnelle partagée.

- **[Carte](carte.html)** : quatre points sur un territoire fictif, sélection d’une image, liste équivalente et retour depuis la photo.
- **[Regards](regards.html)** et **[contact](nous-ecrire.html)** : présentation éditoriale fictive, formulaire sans transmission de données.
- **[Collection](galerie.html)** : recherche, univers, état sans résultat et récupération ; le filtre est conservé au retour d’une photo.
- **[Photo](photo.html)** : image entière, précédente/suivante, agrandissement au clavier, petite carte schématique, trois images connexes, retour au contexte de provenance.
- **[Voyages](voyages.html)** et **[voyage](voyage.html)** : couverture, trois étapes, images et textes courts. Une photo revient à son étape ; les connexes du même voyage conservent ce contexte.
- **[Carnets](carnets.html)** et **[billet](carnet.html)** : deux textes distincts, lecture longue, sommaire, images et retour au bon billet. Le second billet utilise `?billet=ombre`.
- **[L’atelier](admin.html)** : navigation conventionnelle Créer / Publier / Gérer ; fiche photo éditable en mémoire, ajout d’une sortie, brouillon de Carnet et confirmation de publication simulée. Les réglages sont regroupés en six familles explicites.

L’administration n’appelle aucune API. Ses modifications restent en mémoire et disparaissent au rechargement. Le récit de voyage de référence reste fixe ; ajouter une sortie dans l’admin ne modifie pas les pages publiques. Les rubriques de réglages sont explicatives, sans fausse commande connectée.

Pour retrouver **l’admin V2 existante**, le parcours observé lors du premier audit était : menu de l’admin → **« Essayer l’admin v2 »** au pied du menu. La préférence concerne le compte, indépendamment de la version du site public. Aucune activation réelle effectuée ici.

## Accessibilité et sobriété

Un socle commun aux six pistes : liens et boutons natifs, clavier, focus visible, fermeture des dialogues par Échap, retour du focus, textes alternatifs et messages d’erreur. Le mode calme respecte la préférence système et peut être mémorisé localement. Il retire les mouvements sans retirer de contenu.

Les mouvements sont bornés : arrivée de page 550 ms, transition entre documents 180 ms lorsque disponible, changement de tirage 280 ms. Pas de déplacement permanent. Les liens conservent leur fonctionnement dans les navigateurs ne proposant pas les transitions entre documents.

Images locales WebP, polices locales, aucune bibliothèque de mouvement ou carte tierce. Une image principale prioritaire, images secondaires chargées paresseusement. L’implémentation réelle devra reprendre les variantes responsives du produit ; les maquettes utilisent quatre fichiers fixes. Aucune économie carbone chiffrée revendiquée.

Les [vérifications et leurs limites](CONTROLE.md) distinguent les essais exécutés des intentions. Ce dossier ne vaut ni conformité RGAA ni évaluation exhaustive RGESN.

## Ce que ce round ne réinvente pas

Le premier audit avait confirmé que la V3 dispose déjà des Carnets et des fonctions V2, et que les cartes et photos proches existent dans les trois versions publiques. Les besoins majeurs portaient sur la continuité photo → voyage, la conservation de la recherche, la mise en scène éditoriale et les connexes lorsqu’aucun lieu public n’est disponible.

Ces constats antérieurs orientent les maquettes ; ils n’ont pas fait l’objet d’un nouvel audit de l’application pendant ce round. La carte fictive et les connexes éditoriaux présents ici illustrent une intention, pas un nouveau moteur de production.

## Historique retiré et limite GitHub

Les références de cette branche et la version courante de la PR n’incluent plus le premier commit. Les objets Git locaux devenus obsolètes ont été supprimés après vérification qu’aucune autre référence ni aucun reflog ne les utilisait.

**La réécriture d’une branche ne purge pas les anciens caches et références internes de GitHub.** L’ancien commit restait accessible par son identifiant après réécriture. Une demande de purge au support GitHub a été préparée séparément, hors dépôt ; elle n’a pas été envoyée automatiquement. La suppression côté serveur et dans d’éventuels autres clones ne peut donc pas être déclarée achevée.

Référence : [GitHub — suppression de données sensibles, purge côté serveur](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository#fully-removing-the-data-from-github).
