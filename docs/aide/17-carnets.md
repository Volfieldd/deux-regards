# Carnets

Les **Carnets** sont les billets du site : récits de voyage et notes d'atelier, datés et signés, avec les photos de la photothèque. On les écrit dans l'administration (barre latérale, groupe « Publier », **Carnets**) ; ils paraissent sur le site public **en version 2 seulement** : tant que la v1 est appliquée (Réglages → Apparence), leurs pages ne sont visibles que dans l'aperçu de la v2.

La page **Carnets** liste les billets, le plus récent d'abord, avec leur état (○ Brouillon, ◐ Proposé ou Programmé, ▲ À reprendre, ● Publié, ✕ Retiré), leurs signatures, leur rubrique et leur date. **Nouveau billet** : un titre, une rubrique (Voyages ou Notes d'atelier) et une ou deux signatures ; un photographe signe toujours ses billets.

## Écrire un billet

L'éditeur s'ouvre sur la version française, la langue d'origine. En haut : le titre, l'état, la méta (signatures, rubrique, date de début) et **Enregistré à …**.

- **Titre** (120 signes au plus) et **Chapô** (300 signes au plus, exigé pour proposer) : les compteurs signalent, sans bloquer, un titre de plus de 70 signes ou un chapô de plus de 160 (les moteurs de recherche couperaient la fin).
- **Texte** : en Markdown restreint (voir plus bas). Une photo s'écrit seule sur sa ligne : `photo:quai-7h12`.
- **Enregistrement automatique** : avec le script, le texte est gardé à part toutes les quelques secondes (« Enregistré à 22 h 42 »), jamais dans le billet en ligne. À la réouverture, l'éditeur reprend ce texte et propose **Enregistrer dans le billet** ou **Écarter**. Si le réseau tombe, une copie reste sur l'appareil. Sans script, **Enregistrer et voir l'aperçu**.
- **Aperçu** : sous le texte (au téléphone, l'onglet **Aperçu**), le billet comme sur le site, rendu par le serveur ; une photo non publiée y est marquée.
- **Langues** : les onglets **Français**, **English**, **Deutsch** disent l'état de chaque langue (publié, à relire, vide). Une traduction n'est publiée que si **Traduction relue : publier aussi en …** est cochée ; sinon la page de cette langue montre le texte français avec un bandeau, sans redirection. **Proposer une traduction** (si le traducteur local est installé) remplit les champs, à relire.
- **Autres réglages** (replié) : signatures, rubrique, couverture et image de partage (par défaut, la première photo du texte), voyage lié, « Écrire à … » en bas du billet, adresse (elle suit le titre jusqu'à la première publication ; changée ensuite, l'ancienne mène à la nouvelle), **Mise à jour signalée** (« Mis à jour le … » ; une coquille ne la coche pas), **Mention commerciale** (contenu fait en partenariat) et **Réponse** (droit de réponse : la réponse d'une personne nommée, datée, après le billet).
- **Versions** : chaque enregistrement garde une version (les 30 dernières), à rétablir. Si quelqu'un a enregistré entre-temps, rien n'est écrasé : votre texte est gardé, à reprendre.

## La mise en forme

| Écrire | Pour |
|---|---|
| `## Samedi, Lisbonne` | un intertitre ; deux au moins font le sommaire du billet |
| <code>&#42;&#42;gras&#42;&#42;</code>, `*italique*` | l'emphase |
| `> une citation` | une citation ; `> (pt-PT) …` dit sa langue, `> Traduction : …` sa traduction, `> — Inês` sa source |
| `- un point` | une liste |
| <code>[texte]&#40;https://…)</code> | un lien ; titre `"sponsorisé"` pour un lien payé ou d'affiliation |
| <code>[texte]&#40;serie:rue)</code>, `voyage:…`, `carnet:…`, `photo:…` | un lien vers le site (s'il n'est pas publié, il s'affiche en texte simple) |
| `photo:quai-7h12` seule sur sa ligne | une photo |
| deux lignes `photo:` qui se suivent | une paire (un diptyque quand ce sont les deux regards) |
| trois à douze lignes `photo:` | une galerie |

La barre (avec le script) insère ces formes ; **Photo…**, **Galerie…** et **Lien interne…** ouvrent le choix des photos. Raccourcis : Ctrl ou ⌘ + B, I, K (lien), S (enregistrer). Le HTML s'affiche comme du texte ; une image d'un autre site est retirée ; un lien vers un schéma inconnu devient du texte.

## Les photos d'un billet

Le panneau **Photos du billet** reprend chaque photo du texte, dans l'ordre, avec son état (● Publiée, ○ Brouillon, ▲ Accord à vérifier, ✕ Bloquée) :

- **Décrire la photo…** : son **texte de remplacement** (ce qu'elle montre, pour qui ne la voit pas ; exigé pour proposer, sauf photo décorative), sa **légende** et sa **taille** (largeur du texte ou pleine largeur), par langue. Vide, le texte de remplacement est celui de la photothèque.
- **Retirer du billet** : sa ligne disparaît du texte dans les trois langues.
- **Ajouter des photos** (sans script) : les photos cochées s'ajoutent à la fin du texte, une ligne chacune. On ne peut mettre que des photos publiées, ou les siennes.

Sur le site, une photo non publiée n'apparaît pas ; chaque photo mène à la visionneuse dans le contexte du billet (retour au billet, photos voisines du billet).

## Le circuit de publication

Comme pour les photos : le photographe **propose**, le modérateur **publie** (tout de suite ou à une date) ou **renvoie** avec une remarque.

- **Proposer à …** : vérifie le chapô, les textes de remplacement et les accords ; ce qui bloque est dit en tête, avec un lien vers chaque point. Les photos encore en brouillon partent avec le billet.
- **Publier** ou **Programmer** (panneau **Publication**) : écrivez le jour et l'heure comme vous voulez (« samedi 8 h », « 17/10 8:00 ») ; une date passée est refusée. Les photos encore en brouillon des signataires du billet (ou déjà proposées) sont publiées (ou programmées à la même heure) avec lui si vous pouvez les publier ; sinon, publiez-les d'abord. À l'heure dite, le billet est publié par « publication programmée » ; si une photo n'est plus publiée, il revient « à reprendre » avec la raison. Un billet programmé modifié par quelqu'un qui ne publie pas (texte, photo, version rétablie) repasse « proposé » : il sera revu avant de partir.
- **Renvoyer…** (remarque obligatoire), **Déprogrammer**, **Retirer du site…** (raison obligatoire ; l'adresse répond « retiré ») et **Republier**. Un billet jamais publié se supprime ; un billet publié se retire.
- **Droits** : un photographe écrit et propose ses billets (ceux qu'il signe) et modifie ceux qui sont en ligne ; « Publier ses billets sans validation » se règle photographe par photographe (Réglages → Circuit de publication). Le relecteur corrige les textes ; le modérateur publie.

## Sur le site

En v2, **Carnets** apparaît dans le menu dès qu'un billet est publié. La liste filtre par **rubrique** et par **regard** (chaque choix dit son nombre de billets), 12 billets par page. Un billet s'ouvre sur sa couverture, ses auteurs, ses dates et son sommaire ; puis le texte, « Écrire à … » (un message vers l'adresse réglée sur la page Carnets, par défaut celle des mentions légales ; rien n'est gardé), **Partager ce billet**, les photos du billet et les billets voisins. Les lecteurs s'abonnent au **flux RSS des carnets**, un par langue. Le plan du site et les moteurs de recherche ne voient que les billets publiés, dans leurs langues publiées.
