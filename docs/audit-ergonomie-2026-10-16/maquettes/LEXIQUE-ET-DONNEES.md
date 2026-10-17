# Lexique et données fictives des maquettes

Référence commune des vingt maquettes (MQ-01 à MQ-20), avec la planche [MQ-00](MQ-00-direction-artistique.html). Une maquette n'invente ni un mot ni une donnée : elle prend ici ce dont elle a besoin. Ce qui manque s'ajoute ici d'abord.

Les données suivent l'instance de démonstration (http://127.0.0.1:3091) quand elle les a : mêmes photos, mêmes titres, mêmes comptes de séries. Les écarts avec la démo (§ 4.8), la journée du 16 octobre heure par heure (§ 4.9) et les arbitrages faits avec l'étude des projets (§ 4.10) sont à la fin. Les changements de la passe 2 (après le jury v1) sont résumés au § 0. Mise à jour du 16 oct. 2026, après la refonte des vingt maquettes : adresses du carnet, numéro d'inventaire, ordre « choisi par nous », données des boutiques, des galeries privées et de l'administration. Consolidation de l'administration (même jour) : barre latérale du rôle Photographe, `/admin/carnet`, entrée Voyages gardée, noms de fichiers de la démo (`R0004046.JPG`), référence de commande et jeton de suivi, adresse `/tirages` (§ 1, § 4.9, § 4.10).

## 0. Changements de la passe 2 (16 oct. 2026, après le jury v1) : à reprendre dans chaque maquette

Ce qui suit change une règle, un mot ou une donnée ; une maquette qui ne le reprend pas se contredit avec la planche. Le détail est dans les paragraphes indiqués.

1. **Ordre « choisi par nous »** : « Deux ombres » passe du rang 6 au rang 18, juste avant « Élise, contre-jour » (§ 4.1, § 4.2). Les rangs 6 à 17 reculent d'une place. La série Rue devient Quai, 7 h 12 · Passage · Alfama · Linge · Deux ombres · Escaliers · Deux, minuit ; Portrait devient Tiago · Inês · Élise.
2. **Les trois scènes de nuit et de contre-jour** (Deux ombres, Élise, contre-jour, Deux, minuit) : redessinées à la passe 3 (même titre, même fichier, même ordre), elles sont lisibles (lumières, silhouettes, formes nettes ; luminance moyenne de 0,33 à 0,64) et ne sont plus réservées aux grands formats. Règle assouplie : **dans une vue filtrée** (regard, série, « À proximité »), jamais dans la première rangée, à aucune largeur ; plus de règle de tête de rangée dans la Galerie (§ 4).
3. **Rangées au téléphone : deux photos au plus** (hauteur visée 40 % de la largeur, `public.css` § 6). **`sizes` selon le format** et `srcset` partout, avec les vraies largeurs des fichiers (§ 4).
4. **Cartel jamais coupé** : plus d'ellipse ; la méta passe à la ligne, avec une espace insécable avant chaque « · » et dans la date. Variantes déclarées : « À proximité » met la distance d'abord (« 600 m · Alfama · Julien ») ; le récit d'un billet donne lieu précis et heure ; dans un billet à deux voix, l'auteur en tête (« Julien · Alfama, Lisbonne · sam. 10 oct., 7 h 42 », passe 3) (§ 2).
5. **Diptyque « Même soir »** : Miradouro (18 h 52) puis Belém (19 h 05), partout où il paraît (l'accueil a le sien, « Même fleuve », sur le Douro) ; étiquette « Même soir », phrase « deux regards, à 18 h 52 puis à 19 h 05 » en casse normale (§ 4.2).
6. **« À proximité »** trié par distance : Alfama 600 m · Linge 700 m · Cais do Sodré 2,4 km · Belém 6 km (même soir) (§ 4.1).
7. **Adresses** : `/serie/<slug>` (le code), et non `/series/<slug>` ; la liste de ce qui existe et de ce qui est à créer est au § 2.
8. **Dates** : abrégées partout dans l'interface (cartels, données, diptyques, en-têtes), en toutes lettres seulement dans une confirmation, un e-mail ou la prose d'un billet (§ 2).
9. **Ponctuation** : espace fine insécable avant « : ; ! ? » et dans les guillemets ; outil `dr-work/outils/insecables.py` (§ 2).
10. **Capitales espacées** : trois mots au plus, les nombres ne comptent pas (« Commande 1 sur 2 », « Même soir ») ; au-delà, casse normale (§ 2).
11. **Mots** : « Revenir à la version enregistrée » / « Annuler » ; « prête » ; « von uns gewählt » ; « Bonsoir » après 18 h ; « flux RSS » (§ 1).
12. **Administration** : compteurs de séries selon la règle du code (toutes les photos, tous statuts ; § 4.9) ; chronologie unique du 16 oct. heure par heure (§ 4.9) ; barre latérale à parité avec main (Nouveautés et version 1.90.0, « Traitement : n photos », langue et thème en formulaires POST) ; variante Photographe sans lien « Séries » ; danger rouge `#f0605a` en Chambre noire ; focus visible sur un champ en erreur.
13. **Gabarit des maquettes** : résumé d'erreurs en `<section>` titrée ; cadres d'état `inert` ; pied de page avant l'encart ; un seul bloc « Mesures » ; pastilles jamais hors de l'écran ni sur une photo ou un texte ; commandes à script en `.js-seul` ; contrôle `dr-work/outils/controle-annotations.mjs`.

**Passe 3 (16 oct. 2026, consolidation du site public)** : les trois scènes de nuit et de contre-jour redessinées et lisibles, la règle assouplie (point 2) ; cartel du récit à deux voix (point 4) ; `sizes` au téléphone selon la place réelle (§ 4) ; un nom de groupe de radios par cadre d'état (`annotations.css`, contrôle `outils/radios-cadres.py`) ; composants versés dans la planche : `.billet-e--cote` en liste, `.choix-sous`, étoile de `.favorisable` sous le cartel, titre de l'en-tête Contexte sur deux lignes, grille du contact, `.rangees--par-deux`, `.mur` sans aplat et réduit au petit format (page `.suit-format`), `.p-haut`, vignettes de `.ligne`, `.rc-l` et `.commandes` qui suivent le format (`style="--r: 0.6667"` sur la ligne d'une verticale), aperçu d'impression `.feuille` à l'échelle 1 et `.f-date`, adresses imprimées en 10 pt (`public.css`) ; `.mq-ecran--plein::after` et `.e-plein` (`annotations.css`). Sur la planche, le diaporama de l'ouverture est montré à l'arrêt (« Lire »), comme MQ-01.

**Passe 3 (16 oct. 2026, consolidation de l'administration)** : titre de page de l'administration à la forme de main, « Page · Administration · Nicephos » (§ 2) ; SIREN fictif `000 000 000` (§ 4.7) ; rencontres `/admin/rencontres/30` (Tiago) et `/admin/rencontres/31` (Claire) (§ 2, § 4.7) ; une photo de billet s'écrit d'une ligne (§ 4.10, écart avec l'étude § 1.4) ; composants que MQ-07 à MQ-10 et MQ-18 à MQ-20 gardaient en local versés dans `admin-plus.css` (et, pour l'app de terrain, en fin d'`app.css`) : `.js-seul`, `.sr-only` en `clip-path`, `<details>` fermés hors de la mise en page, onglets qui passent à la ligne au téléphone et de 44 px de large, onglets de langue sur deux lignes sous 420 px, `.titre-dedans`, `.sur-onglet`, ligne d'erreur pleine largeur du lot, `.ecran-a .bulk`, formulaire caché cible de `form=…`, `h3` dans `.resume-a`, `.chiffres`, `.favoris-a`, `.galerie-resume`, choix rapides d'une date en boutons d'envoi, `.vis-b`, pastille de la barre d'actions fixe, bouton inactif en contour et boutons radio en erreur de l'app ; les sept maquettes de l'administration ont la même barre latérale, d'un seul générateur.

**Passe 4 (16 oct. 2026, après le jury v2) : à reprendre dans chaque maquette** (le détail par maquette est dans le compte rendu de la passe 4) :

14. **« Suchen »** : la recherche de l'en-tête allemand s'écrit « Suchen », comme le code (`server/i18n.js`, `nav.search`), et non « Suche » (§ 1). Remplacé partout le 16 oct. ; l'en-tête allemand de contrôle (`outils/consol-final.mjs`) aussi.
15. **Une seule visionneuse par adresse** : `/photo/<slug>`, avec ou sans `?carnet=<billet>`, s'ouvre toujours dans la visionneuse entière de MQ-04 (`.vis`, cartel « Julien · Lisbonne · 10 oct. 2026 », « Tirage : à partir de 180 € » en bouton plein) ; depuis un billet, seuls changent le retour de l'en-tête (« ← Lisbonne et Porto ») et l'ordre des voisines (celui du billet). La visionneuse compacte (`.vu`) est **réservée à la galerie privée**, avec le cartel de MQ-17 (`public.css` § 20).
16. **Deux photos au plus par rangée au téléphone, garanti par le CSS** et non plus par l'ordre : chaque photo verticale porte la classe `.v` (une carrée `.c`), et `public.css` § 18 empêche trois photos sur une rangée (vérifié sur la série Portrait, Tiago · Inês | Élise). La règle « jamais trois verticales de suite » est retirée (§ 4).
17. **Barre de filtres** (Galerie) : collante à partir de 768 px seulement ; `scroll-padding-top` sous tout élément collant (le focus n'est jamais caché, WCAG 2.4.11) ; une ligne qui défile montre toujours un choix coupé au bord (`public.css` § 17).
18. **En-tête des galeries privées** (`.sh--prive`) : « Galerie privée » au bord gauche sur la page du mot de passe (Tunnel) comme dans la galerie (Contexte), la marque au centre dès 560 px (`public.css` § 1).
19. **Modèle des séries : celui du code.** Toute photo a une série (`photos.category_id INTEGER NOT NULL`, migration `001_init.sql` ; les sélecteurs de `photo.eta` et `batch.eta` n'ont pas d'option vide) : « pas encore rangée » veut dire série non vérifiée (`series_checked = 0`), jamais « sans série ». Les brouillons d'Angers sont dans leur série d'import (R0004012 et R0004057 en Paysage, R0004046 en Rue) ; R0004057 garde « ✦ Suggestion : Rue », pas encore acceptée. Compteurs de la barre latérale, toute la journée du 16 oct. : Julien **3 · 7 · 3 · 8 · 5**, Sébastien **3 · 5 · 1 · 2 · 2** (§ 4.9). Plus d'option « Choisir une série ».
20. **Écarts avec le code déclarés** : toute évolution que le code n'a pas encore (champ « Texte de remplacement », adresses `/galerie` et `/series`, mode jour automatique, rangées justifiées, etc.) est écrite « à créer » ici (§ 2, « Évolutions à créer ») et dans l'encart de la maquette qui la montre.
21. **Images** : la règle des tailles est écrite sur les variantes du code (640, 1 280 et 2 000 px de large, AVIF puis WebP dans une `<picture>`), avec la correspondance des fichiers des maquettes (§ 4).
22. **Dates** : le jour de la semaine abrégé ne se sépare pas du quantième, « sam. 10 oct. », avec une espace insécable après « sam. » (`outils/insecables.py`, § 2).
23. **Administration** : « Menu » de la barre d'onglets du téléphone est un lien vers `#admin-nav`, qui ouvre la barre sans script (`.side:target`) ; « Fermer » est un lien vers `#contenu` (`admin-plus.css` § 1 ; défaut de main, `dr-work/mq2-correctifs-main.md` § 8). Le pied de la barre de 220 px passe à la ligne au lieu de déborder en allemand. La fiche de référence de la planche a le champ « Texte de remplacement » (à créer, UX-F-44). « Défaire » se dit « Rückgängig » en allemand, comme main. Un brouillon joint à un billet « ira à Julien avec le billet » (« Proposée » reste le statut ◐).
24. **Couverture du billet « Pourquoi nous ne recadrons pas »** : Ligne d'eau (et non plus Brume sur la Loire, trop proche de Silence blanc dans la liste des carnets) (§ 4.3).

**Finalisation (16 oct. 2026, avant le jury final)** : « Retour au billet : » (et non « au carnet ») sur le retour de la visionneuse ouverte depuis un billet, « Billet » dans ses données (§ 1) ; noms lus de l'en-tête allemand pris au code partout, planche et en-tête de contrôle compris : « Navigation », « Sprache: Deutsch », « Sprache » (`server/i18n.js`) ; deux exemplaires au plus par photo dans un panier (S23, § 4.4) ; Minoterie entièrement décrite à 22 h 40 (§ 4.9) ; `POST /commande/livraison` à créer (§ 2) ; versés dans le commun : `.msg p` qui passe à la ligne et `.sh--prive .sh-retour-t` sur deux lignes (`public.css` § 13 et § 1), adresse `/prive/:id/photo/:n` (§ 20), filtre d'état `.chip .chip-st` et interrupteur à deux mots (`admin-plus.css` § 9 et § 11).

**Passe 5 (17 oct. 2026, après le jury final)** : noms lus de l'en-tête pris au code **en français aussi** : la navigation « Navigation », le bouton de langue « FR – Langue : français » (le code visible, puis `nav.langCurrent`), sa liste « Langue » (`server/i18n.js`, `nav.label`, `nav.langCurrent`, `nav.lang`) ; le panneau du téléphone garde un nom distinct, « Navigation (téléphone) » ; dans un cadre d'état allemand, « Navigation (Beispiel) », pour qu'une page de maquette n'ait pas deux repères du même nom (§ 1) ; « Directeur de la publication », le terme de la loi, partout (§ 1, correctif de main) ; « Tous les tirages (9) » (§ 1) ; deux listes d'ouverture de l'accueil déclarées à créer (§ 2) ; colonne « Galerie privée » des états (§ 3) ; aucun lien dans le libellé d'une case : « Lire les conditions de vente » en `.choix-sous` (MQ-15, planche) ; textes SVG à 13 px rendus au moins (mini-carte de MQ-04, carte au trait du billet, `public.css`).

## 1. Lexique

### Site public

| On écrit | Ce que cela désigne | On n'écrit plus |
|---|---|---|
| **Tirages** | La boutique : entrée du menu (DE « Kunstdrucke », EN « Prints »), pages `/tirages`, groupe du pied de page. | « Boutique » côté public ; « Tirages et licences » |
| **Tirage : à partir de 180 €** | Le lien ou le bouton vers la page d'un tirage, depuis une photo ou un billet (DE « Kunstdruck: ab 180 € »). | « Tirage : dès 180 € », « Acheter » |
| **un tirage** | Un exemplaire d'art signé et numéroté d'une photo (DE « ein Kunstdruck », « Kunstdrucke » ; EN « a print »), dans l'interface comme dans les e-mails et les factures. | « print », « produit » ; DE « Abzug », « Fotoabzug » |
| **Droits et licences** | La page `/droits` et sa demande de licence (presse, entreprise, usage hors catalogue). | « Droits, tirages et licences » |
| **Demander une licence** | Le lien d'une photo vers la demande préremplie : `/droits/demande?photo=miradouro-l-heure-doree` (DE « Lizenz anfragen »). | « Licence : nous écrire » |
| **Les deux · Sébastien · Julien** | Le choix du regard, dans cet ordre, partout (galerie, séries, carnets). | « Tous », « Les 2 », « Nous » |
| **Galerie** | Toutes les photos publiées, en rangées. | « Toutes les photos », « Toutes les séries » |
| **Séries** | Les ensembles d'auteur (Atlantique, Paysage, Portrait, Rue, Voyage). | « Catégories », « Thèmes » |
| **Carnets** · **un billet** | La rubrique de textes (menu « Carnets », DE « Reisetagebücher », EN « Notebooks ») et chacun de ses textes (un billet, DE « Beitrag »). Depuis un billet, le retour de la visionneuse se lit « Retour au billet : Lisbonne et Porto » (DE « Zurück zum Beitrag: Lissabon und Porto ») et la ligne des données s'intitule « Billet » (« Lisbonne et Porto, photo 4 sur 10 »). Deux rubriques : Voyages (DE « Reisen »), Notes d'atelier. Adresses : `/carnet`, `/carnet/lisbonne-et-porto`, `/carnet/flux.xml`, filtres `?rubrique=voyages`, `?par=julien` ; le slug reste français dans toutes les langues (`/de/carnet/lisbonne-et-porto`), comme le reste du site (étude, B1 et B73). Le lien vers la liste compte des billets : « Tous les billets (4) ». Une carte de billet porte toujours la même méta : « Auteur · date · n photos · n min de lecture » (MQ-11). | « Blog », « Journal » (pris par l'admin), « Voyages » comme entrée de menu ; `/carnets`, `/de/reisetagebuecher/…` ; « Tous les carnets (4) » ; « Retour au carnet : », « Carnet » dans les données de la visionneuse |
| **J'aime** | Public : un visiteur apprécie une photo. Cœur, bouton bascule, compteur affiché dès 1. | « Favori » sur le site public ; « 0 j'aime » |
| **Favori** | Galerie privée : l'invité met une photo dans sa sélection. Étoile, bouton bascule ; « 4 favoris » dans l'en-tête de la galerie. | « J'aime » en galerie privée ; « Sélectionner » |
| **Galerie privée** | Un espace privé de photos, ouvert par un lien et un mot de passe. | « Espace client », « Album » |
| **Panier (2)** | Le panier et son nombre de tirages, en toutes lettres au bureau ; l'icône et le nombre au téléphone (nom lu : « Panier, 2 tirages »). | « Mon panier », « Caddie » |
| **Payer 305,00 € à Julien** | Le bouton final du tunnel répète le montant et nomme le photographe qui encaisse (un paiement par vendeur). En allemand, l'obligation légale : « Zahlungspflichtig bestellen ». | « Valider », « Continuer », « Payer » sans destinataire |
| **Renoncer à une commande** | La fonction de rétractation (pied de page, page de suivi). | « Retour », « Annuler ma commande » après paiement |
| **Retour au panier** · **← Lisbonne et Porto** | Un retour dit toujours où il mène. | « ← Retour », « RETOUR AU PANIER » |
| **Menu** | Le bouton du menu au téléphone ; le mot ne change pas quand il est ouvert (l'icône devient ✕). | « Fermer » à la place de « Menu » |
| **choisi par nous** · **Plus récentes d'abord** | Les deux ordres de la Galerie (DE « von uns gewählt », « Neueste zuerst » ; la page d'une série dit « 7 Fotos, von uns gewählt »). | « Sélection » dans l'interface, « Tri » ; DE « von uns geordnet » |
| **Même soir** | L'étiquette du diptyque (Miradouro puis Belém), suivie en casse normale de « deux regards, à 18 h 52 puis à 19 h 05 » (DE « Derselbe Abend » · « zwei Blicke, um 18:52 und um 19:05 »). | « MÊME SOIR, DEUX REGARDS » en capitales |
| **flux RSS** | L'abonnement aux carnets (« S'abonner au flux RSS des carnets ») : le mot que le public connaît ; le format servi est Atom (`/carnet/flux.xml`, `type="application/atom+xml"`, étude B58). | « flux Atom » dans l'interface |
| **Demander une licence** est un lien | Partout (visionneuse, galerie privée, planche) : un lien souligné, jamais un bouton à filet. | — |
| **Inventaire** | Le numéro stable d'une photo publiée, `J26-003` (voir § 2). | « N°19 », « Numéro » |
| **Rechercher** | L'outil de recherche de l'en-tête (`/recherche`) : DE « Suchen », EN « Search », les mots du code (`server/i18n.js`, `nav.search`). | DE « Suche » |
| **Navigation** · **Langue : français** · **Langue** | Les noms lus de l'en-tête, ceux du code (`server/i18n.js`) : la navigation « Navigation » (`nav.label`) ; le bouton de langue « FR – Langue : français » (le code visible, puis `nav.langCurrent`, pour que le nom lu contienne ce qu'on voit, WCAG 2.5.3) ; sa liste « Langue » (`nav.lang`). DE « Navigation », « DE – Sprache: Deutsch », « Sprache » ; EN « Navigation », « EN – Language: English », « Language ». Le panneau du menu au téléphone, second repère de navigation de la page : « Navigation (téléphone) » (DE « Navigation (Telefon) »). Dans une maquette, un cadre d'état ajoute l'état au nom (« Navigation (état : première tabulation) », « Navigation (Beispiel) ») : une page n'a jamais deux repères du même nom. | « Menu principal », « FR – langue de la page : français », « Choisir la langue » |
| **Directeur de la publication** | La personne qui répond de ce qui est publié : rubrique des mentions légales et réglage `legal_director` (LCEN, art. 1-1, issu de la loi SREN du 21 mai 2024, ex-art. 6, III ; loi du 29 juillet 1982, art. 93-2). DE « Verantwortlich für den Inhalt » (§ 18 MStV) ; l'anglais de main, « Responsible for the content », reste. Main écrit « Responsable de la publication » : à corriger (`dr-work/mq2-correctifs-main.md`, § 11). | « Responsable de la publication », qui se confond avec le « responsable de la rédaction », un autre rôle de la même loi |
| **Tous les billets (4)** · **Tous les tirages (9)** | Le lien vers une liste entière dit ce qu'il compte, même sous un titre plus étroit : sous « Les autres tirages de Sébastien », « Tous les tirages (9) » mène aux 9 tirages des deux (`/tirages`, MQ-13). | « Voir les 9 tirages » sous un titre qui en nomme moins |

### Administration

| On écrit | Ce que cela désigne | On n'écrit plus |
|---|---|---|
| **Proposée** (photo) · **Proposé** (billet) | Un statut : l'objet attend le modérateur. Pastille ◐. Un brouillon joint à un billet qui n'est pas encore proposé « ira à Julien avec le billet ». | « Proposée : Rue » pour une suggestion d'assistant ; « proposée avec le billet » pour un brouillon |
| **✦ Suggestion** | Ce que proposent les assistants d'analyse : « ✦ Suggestion : Rue ». | « Proposition », « Proposée » |
| **prête** | Traitement des images fini (et rien d'autre) : « 3 photos prêtes ». | « prête » pour les accords, des suggestions (« 2 nouvelles suggestions de série »), une commande ou « terminée » |
| **Bonjour, Julien.** · **Bonsoir, Julien.** | Le salut de « Aujourd'hui » suit l'heure, comme main (`views/admin/home.eta`) : « Bonsoir » de 18 h à 5 h. Le soir du 16 oct. (§ 4.9), c'est « Bonsoir, Julien. ». | « Bonjour » à 22 h 40 |
| **Nouveautés** | L'entrée du pied de la barre latérale, avec le numéro de version (`1.90.0`, `package.json`) ; DE « Neuigkeiten ». | — |
| **Traitement : 3 photos** | L'indicateur du pied de la barre latérale pendant le calcul des images (DE « Verarbeitung: 3 Fotos ») ; caché sinon. | « En cours… » sans nombre |
| **Accord à vérifier** · **accords en règle** | État des accords de droit à l'image d'une photo. | « Site : prête » |
| **vues** | Audience d'une page. | « ouvertures » |
| **Brouillon · Proposée · Publiée · Accord à vérifier · Dépubliée** | Les états d'une photo (voir § 3). | une douzaine de statuts sans légende |
| **Photothèque** | La liste des photos de l'admin. | « Photos » dans un titre de page (le mot reste dans la barre d'onglets du téléphone) |
| **Boutique** | Le module de l'admin : Commandes, Éditions. (Le public dit « Tirages ».) | « Shop » en français |
| **Accès** | Une invitation à une galerie privée : un lien, un mot de passe, une échéance, des droits. | « Partage », « Lien privé » |
| **App de terrain** | L'app du téléphone pour les accords sur le terrain (DE « Unterwegs-App »). | « App, cartes, QR » dans le menu |
| **Voyages** | L'entrée de l'administration pour les voyages du code (`/admin/voyages`, groupe Photos) ; elle coexiste avec Carnets (étude B9, B64). | « Voyages » comme entrée du menu public |
| **Carnets** | Le module de l'admin pour les billets : `/admin/carnet` (étude B1), groupe Publier ; icône d'une page (le Journal a une horloge). | `/admin/carnets` |
| **Réglages** | Une seule entrée de menu, vers une page à onglets (Identité et apparence, Filigrane et EXIF, Mentions et confidentialité, Photographes, Assistants d'analyse). | dix entrées « Réglages » |

### Le sens unique des mots d'action

| Mot | Un seul sens | Exemple |
|---|---|---|
| **Annuler** | Ne pas faire : fermer un dialogue, ou abandonner une **création** (rien n'est encore enregistré). Toujours le premier bouton d'un dialogue. | [Annuler] [Révoquer l'accès de Lucie] · nouvel accès : [Annuler] [Créer l'accès et envoyer l'invitation] |
| **Défaire** | Revenir sur un geste déjà fait, dans le message d'action, pendant 10 s (en pause au survol et au focus). DE « Rückgängig », comme main (`public/admin/admin.js`). | « « Brume sur la Loire » publiée. · Défaire » ; DE jamais « Rückgängig machen » |
| **Revenir à la version enregistrée** | Abandonner les modifications non enregistrées d'un objet qui **existe déjà** (une version est en ligne ou enregistrée), là où un bouton d'enregistrement existe encore. Jamais « Annuler » dans ce cas : ce serait croire que rien n'a jamais existé. | Mentions légales : « Modifié, pas encore en ligne · [Revenir à la version enregistrée] [Mettre en ligne les mentions] » |
| **Enregistrer** | Seulement sans JavaScript, ou dans un formulaire sans effet public. Ce qui a un effet public, légal ou financier dit son effet : Publier, Proposer, Programmer…, Mettre en ligne les mentions, Rembourser 290,00 €, Révoquer l'accès. | — |
| **Supprimer…** | Ouvre le dialogue de confirmation (les points de suspension le disent). Le dialogue répète l'objet : « Supprimer la photo ». | — |

## 2. Formats

| Donnée | Règle | Exemples |
|---|---|---|
| Prix en vitrine (pages Tirages, visionneuse, billet) | euros entiers, espace insécable avant € ; un prix « à partir de », jamais « dès » | 180 € · 290 € · « Tirage : à partir de 180 € » |
| Prix au panier, dans le tunnel, la commande, la facture, l'admin | deux décimales, virgule | 290,00 € · 15,00 € · Total 305,00 € |
| TVA | une seule mention, une fois par page qui affiche un prix, près du premier prix ou du total ; jamais « TTC » ni « HT » | « TVA non applicable, art. 293 B du CGI » (jusqu'au 31 déc. 2026 ; « art. L. 233-3 du CIBS » ensuite) |
| Date dans l'interface | jour, mois abrégé, année ; partout : cartels, données de la visionneuse (« 10 oct. 2026, 18 h 52 »), diptyques, listes, en-têtes, admin. Le jour de la semaine, s'il aide, s'abrège aussi (« sam. 10 oct., 7 h 42 ») et ne se sépare jamais du quantième : espace insécable après « sam. » (passe 4, `insecables.py`) | 16 oct. 2026 · 10 oct. 2026 · mars 2024 (photo datée au mois) · sam. 10 oct. (insécable après « sam. ») |
| Date dans une confirmation, un e-mail, la prose d'un billet | en toutes lettres, avec le jour ; aussi la relecture d'une date saisie (« Lu : mercredi 14 octobre 2026 ») et les titres de journée d'un billet (« Samedi 10 octobre, Lisbonne »), qui sont du texte | vendredi 16 octobre 2026 |
| Période | du … au … | du 30 oct. au 6 nov. |
| Heure | h, espaces insécables (en anglais « 7:24 pm », en allemand « 19:24 Uhr ») | 22 h 42 · 7 h 12 |
| Ponctuation | espace fine insécable (U+202F) avant « ; : ! ? » et à l'intérieur des guillemets « » ; espace insécable (U+00A0) avant « · », dans les heures, dans une date abrégée et devant une unité (€, px, Mo, km, m, min, %). Jamais d'espace avant « : ; ! ? » en anglais ni en allemand. Outil : `python3 dr-work/outils/insecables.py --ecrire MQ-xx.html` | « Vous partez ? » · 290 € · 22 h 42 · Julien · Lisbonne · 10 oct. 2026 |
| Capitales espacées (`.etiquette`) | trois mots au plus, les nombres ne comptent pas ; au-delà, la phrase s'écrit en casse normale | RUE · VOYAGES · MÊME SOIR · COMMANDE 1 SUR 2 ; pas « JE VOUS AI PHOTOGRAPHIÉ » ni « LE MÊME FLEUVE, DEUX REGARDS » |
| Titre de page (`<title>`) | Site public : « Page · Nicephos », comme `pageTitle` de main (`server/routes/public.js`). Administration : « Page · Administration · Nicephos », comme main (`server/routes/admin.js` : `${title} · ${t('Administration')} · ${siteName}`) ; la page est le titre de l'écran (le titre de la photo pour sa fiche, comme main), suivi de sa rubrique quand elle en a une (« Assistants d'analyse · Réglages », « Commandes · Boutique ») ; l'app de terrain n'a pas « Administration » (`app.eta` : « Nouvelle rencontre · Nicephos »). En erreur, « Erreur : 2 points à corriger · » devant. Une maquette ajoute « (maquette MQ-xx) » après (passe 3 : on suit main, la forme courte « Page · Nicephos » n'est plus celle de l'administration) | Foz, la barre · Administration · Nicephos (maquette MQ-09) · Erreur : 2 points à corriger · Angers, un soir d'octobre · Administration · Nicephos (maquette MQ-20) · Nouvelle rencontre · Nicephos (maquette MQ-10) |
| Mois abrégés | janv., févr., mars, avr., mai, juin, juil., août, sept., oct., nov., déc. | — |
| Saisie d'une date (admin, et date de rencontre de `/bonjour`) | libre (« 14/10/2026 », « 14 oct. 2026 », « octobre 2026 »), relue en toutes lettres ; jamais `type=date` | — |
| Nombres | espace insécable des milliers | 1 280 px · 15 000 € |
| Formats de tirage | image puis feuille, en cm, signe × | image 40 × 60 cm · feuille 50 × 70 |
| Références (Plex Mono) | commande `C-2026-0007` ; facture par vendeur `S-2026-0002`, `J-2026-0001` ; exemplaire `6/15` ; inventaire `J26-003` ; fichier `R0004012.JPG` ; personne (carte « Bonjour ») `J-0001` | — |
| Numéro d'inventaire (UX-T-05) | donné à la première publication et jamais changé : initiale de l'auteur, deux chiffres de l'année de publication, rang de l'auteur dans l'année sur trois chiffres. Il se lit dans les données de la visionneuse (« Inventaire J26-003 ») et sur le certificat ; la position « 4 / 10 » sert à la navigation. Il ne se confond ni avec une facture (`J-2026-0001` : tiret, quatre chiffres d'année, quatre chiffres), ni avec une carte (`J-0001`) | `J26-003` · `S25-001` |
| Adresses publiques | slug du titre entier, en minuscules sans accents ; langue en préfixe (`/en`, `/de`), slug français partout | `/photo/miradouro-l-heure-doree` · `/photo/quai-7-h-12` · `/serie/rue` · `/de/photo/belem-contre-jour` · `/tirages/brume-sur-la-loire` (à créer) · `/carnet/lisbonne-et-porto` (à créer) |
| Adresses qui existent (code de main, `server/routes/public.js`) | à employer telles quelles ; **seulement celles-ci** sont des adresses du code (`/galerie` et `/series` n'en sont pas : la démo répond 404) | `/` (aujourd'hui la Galerie, filtres `?regard=julien&serie=rue&ordre=recentes`) · `/serie/:slug` · `/auteur/:slug` · `/photo/:slug` (et `/partager`, `POST /aime`, `/signaler`) · `/voyages`, `/voyage/:slug` · `/recherche` · `/a-propos` · `/carte` · `/bonjour`, `/bonjour/merci`, `/bonjour/:ref` · `/droits` · `/confidentialite` · `/mentions-legales` · `/langue/:lang` · `/pour-vous/:token` |
| Adresses à créer (évolutions montrées par les maquettes ; à reporter dans l'annexe des routes de l'étude) | à écrire avec « (à créer) » dans un encart | `/galerie` (la Galerie quand l'accueil prend `/`, MQ-01, MQ-02 ; l'ancien `/?regard=…` redirige) · `/series` (index des séries, MQ-02, MQ-03) · `/carnet`, `/carnet/:slug`, `/carnet/:slug/partager`, `/carnet/flux.xml`, `?rubrique=`, `?par=` (MQ-11, MQ-12) · `/photo/:slug?carnet=<billet>` (la visionneuse entière, ouverte depuis un billet : retour et voisines du billet, MQ-04, MQ-12) · `/tirages`, `/tirages/:slug`, `/panier`, `/commande`, `POST /commande/livraison` (« Recalculer la livraison » sans script : le formulaire des coordonnées revient avec la livraison du pays choisi, MQ-15), `/commande/:ref/payer`, `/commande/suivi/:jeton`, `/renoncer`, `/conditions-de-vente`, `/livraison` (MQ-13 à MQ-15) · `/g/:jeton`, `/prive/:id`, `/prive/:id/photo/:n` (la visionneuse compacte, la photo par sa place dans la galerie), `?vue=favoris`, `POST /prive/:id/langue`, `POST /prive/quitter`, `POST /prive/:id/selection/terminer` et `/reprendre` (MQ-16, MQ-17) · `/droits/demande?photo=<slug>`, `/instagram` (MQ-06) |
| Évolutions à créer (ce que les maquettes montrent et que le code n'a pas ; à écrire « à créer » dans l'encart de la maquette) | une par ligne dans l'encart, avec son constat | **Site public** : rangées justifiées dans l'ordre « choisi par nous », classes `.v` et `.c` posées par le serveur (UX-F-13 ; le code a une grille en colonnes) · `<picture>` à variantes plus petites que 640 px, 160 et 480 (UX-T-07) · numéro d'inventaire `J26-003` (UX-T-05 ; le code affiche « N°11 ») · en-tête Site, Contexte, Tunnel (`public.css` § 1 ; le code a un autre en-tête) · « Carnets » et « Tirages » dans le menu (DE « Reisetagebücher », « Kunstdrucke ») · mode jour automatique du billet (MQ-12) · diaporama à l'arrêt avec « Lire » (MQ-01) · deux listes d'ouverture, bureau (6 horizontales) et téléphone (4 verticales), au lieu de la seule `settings.hero` (réglage `hero_tel` à créer et sa liste passée à `views/home.eta`, MQ-01) · « Directeur de la publication » au lieu de « Responsable de la publication » (`server/legal.js`, `views/admin/settings.eta`, MQ-06, MQ-07 ; correctifs de main § 11) · nom lu du bouton de langue « FR – Langue : français », le code visible en tête (`views/langs.eta` met `nav.langCurrent` en `aria-label`, qui remplace le « FR » visible ; correctifs de main § 12) · « À proximité » trié par distance (MQ-04) · demande de licence préremplie (MQ-06) · « Recalculer la livraison » sans script (`POST /commande/livraison`, `formaction` du bouton, MQ-15) · tout le carnet, la boutique et les galeries privées (MQ-11 à MQ-17). **Administration** : champ « Texte de remplacement » de la fiche, par langue (UX-F-44 ; `photo.eta` n'en a pas : MQ-07, MQ-09, MQ-20, planche) · Réglages à onglets (`/admin/reglages/<onglet>`, MQ-07) · menu du téléphone sans script, `.side:target` (correctif de main, § 8 de `mq2-correctifs-main.md`) · « Fermer » en haut de la barre au téléphone · focus visible sur un champ en erreur, danger rouge en Chambre noire (correctifs de main § 1 et 2) · Mentions : téléphone, e-mail, « Hébergement » (correctifs § 6 et 7) · Carnets, Galeries privées, Boutique et leurs permissions (MQ-18 à MQ-20) |
| Adresses de l'administration | celles de main ; un objet par son numéro | `/admin/photos/24` · `/admin/rencontres/30` (la rencontre de Tiago, carte S-0001, MQ-18) · `/admin/rencontres/31` (la demande de Claire, MQ-20) (jamais `/admin/rencontres/S-0001` ni un slug) · `/admin/series` · à créer : `/admin/carnet`, `/admin/galeries`, `/admin/boutique`, `/admin/reglages/<onglet>`, `/admin/compte` |

## 3. États de l'administration

Un symbole, une couleur fixe, un mot ; jamais l'un sans les autres. Les filtres portent les noms des états. Un filtre d'état s'écrit comme une pastille : le symbole dans sa couleur, puis le mot et le nombre (« ◐ Proposées 1 », « ○ Brouillons 3 ») ; la même forme dans la Photothèque (MQ-09), les commandes (MQ-19), les accès (MQ-18) et la planche (passe 4).

| Symbole | Sens | Couleur | Photo | Billet | Accès privé | Galerie privée | Commande |
|---|---|---|---|---|---|---|---|
| ○ | à faire, pas commencé | `--ink2` | Brouillon | Brouillon | Pas encore envoyé | Brouillon (l'équipe seule) | En attente de paiement |
| ◐ | en cours, attend quelqu'un | `--accent-ink` | Proposée | Proposé · Programmé | Envoyé, pas ouvert | — (pas d'état : voir dessous) | Payée, à préparer · Tirage lancé · Expédiée |
| ● | abouti | `--ok` | Publiée | Publié | Ouvert | Ouverte (« jusqu'au 30 nov. 2026 ») | Livrée |
| ▲ | demande votre attention | `--warn` | Accord à vérifier | Photo sans accord | Expire dans 3 jours | Ferme dans 7 jours (puis 6… 2 jours, « Ferme demain ») | À vérifier (litige, retard) |
| ✕ | arrêté, fin sans suite | `--danger` | Dépubliée · Refusée | Retiré | Expiré · Révoqué | Fermée (« le 30 sept. · données des invités effacées le 30 mars 2027 ») | Annulée · Remboursée |

**Galerie privée** (étude, `docs/etudes/blog-galeries-boutique.md`, G3 et G62) : trois états, brouillon (l'équipe seule), ouverte, fermée, la fermeture étant automatique à `closes_at` ou faite à la main (G3) ; un avertissement, « ▲ Ferme dans 7 jours », dès 7 jours avant `closes_at`, le délai décompté chaque jour jusqu'à « Ferme demain » (G62 : « espace qui expire dans 7 jours », signalé dans « Aujourd'hui »). Un accès prévient à 3 jours (« ▲ Expire dans 3 jours »), une galerie à 7 : la fin d'une galerie ferme tous ses accès, il faut le temps de la prolonger ou de prévenir. Pas d'état ◐ : « Sélection envoyée », un accès en pause ou suspendu, un lien ouvert sur plus de 3 appareils sont des **signaux** (G62), écrits sous le nom de la galerie (MQ-18), pas des états ; la légende de la liste les nomme à part. Les galeries du § 4.6 : « Lisbonne et Porto, planche de travail » et « Quai Ligny, 14 octobre » sont ● Ouvertes, « Angers, juin 2026 » ✕ Fermée le 30 sept. 2026.

## 4. Référentiel des données fictives

Règles :

- **Une image = une photo, à jamais** : même titre, même auteur, même lieu, même date, même série dans toutes les maquettes. Il y a 26 images dans `_commun/photos/`, donc 26 photos ; un écran n'en montre jamais plus.
- **Les variantes du code et celles des maquettes** (passe 4). Le site sert chaque photo en **640, 1 280 et 2 000 px de large** (jamais plus que l'original), **en AVIF puis en WebP**, dans une `<picture>` : `<source type="image/avif" srcset="… 640w, … 1280w, … 2000w" sizes="…">` puis `<img srcset="(les mêmes en WebP)" sizes="…" width height>` (`server/images.js`, `WIDTHS` et `FORMATS` ; `server/picture.js`). Les maquettes n'ont que des fichiers WebP de démonstration, en **160, 480, 900 et 1 600 px de côté long** ; ce qui compte, et qui passe tel quel dans le code, c'est le **`sizes`** (la place réelle de l'image), écrit ci-dessous et dans `public.css` § 6. Correspondance : un fichier de maquette de 160 ou 480 px tient la place de la variante de 640 px du code ; 900 px, celle de 1 280 ; 1 600 px, celle de 2 000. Ce que les maquettes demandent en plus est **à créer** : des variantes de 160 et 480 px pour les vignettes, pastilles et listes (UX-T-07 : le code sert aujourd'hui 640 px à des vignettes de 18 à 220 px). Les contrôles (`outils/p3-images.mjs`) portent sur les fichiers des maquettes ; dans le code, le même `sizes` choisit, de la même façon, le plus petit fichier qui couvre la place.
- Tailles : `photos/160/` pour les pastilles et listes de l'admin, `photos/480/` pour les vignettes, `photos/` (900 px) pour les grands formats, `photos/1600/` (1 600 px de côté long) pour les 14 dessins de la démo montrés en grand (ouverture de l'accueil, visionneuse, billet, couverture de série) ; les 12 dégradés du dépôt n'existent qu'en 900 px (pas de source plus grande) : on ne les montre pas plus large que 900 px à densité 1.
- **`srcset` partout, avec les vraies largeurs des fichiers** (le côté long fait 160, 480, 900 ou 1 600 px) : horizontale `160/ 160w, 480/ 480w, 900 px 900w, 1600/ 1600w` ; verticale `160/ 107w, 480/ 320w, 900 px 600w, 1600/ 1067w`. Une vignette de 64 à 120 px (panier, commande, admin) a au moins 160 et 480 ; une couverture, une planche finale, une photo épuisée ont 480 et 900 (et 1 600 s'il existe).
- **`sizes` selon le format dans les rangées** (règle de `public.css` § 6, à recopier) : horizontale `(min-width: 1280px) 470px, (min-width: 768px) 390px, calc(100vw - 48px)` · verticale `(min-width: 1280px) 210px, (min-width: 768px) 175px, calc(50vw - 28px)` · carrée `(min-width: 1280px) 312px, (min-width: 768px) 260px, calc(60vw - 30px)` ; rangée étirée (« À proximité », séries) : horizontale `(min-width: 1280px) 330px, (min-width: 768px) 210px, calc(100vw - 48px)`, verticale `(min-width: 1280px) 150px, (min-width: 768px) 120px, calc(50vw - 28px)`. Au téléphone, la dernière partie du `sizes` est la place réelle de la photo dans sa rangée (passe 3) : horizontale seule `calc(100vw - 48px)`, à côté d'une verticale `calc(69.2vw - 39px)`, verticale à côté d'une horizontale `calc(30.8vw - 17px)`, deux verticales `calc(50vw - 28px)`, dernière rangée non étirée `calc(60vw - 29px)` et `calc(26.7vw - 13px)` ; outil `dr-work/outils/sizes-tel.py HVHH…`. Hors des rangées, `sizes` est la largeur réelle d'affichage (diptyque : la moitié du bloc moins l'écart). Plus jamais un `sizes` commun à toutes les vignettes.
- **Une image chargée par emplacement** : quand l'image change avec l'appareil (ouverture de l'accueil, couverture d'une série), une `<picture>` et une `<source media>` ; jamais d'« image vide en ligne ».
- **Les trois scènes de nuit et de contre-jour** : Deux, minuit (une rue à minuit, un réverbère, une vitrine allumée, deux silhouettes sur le pavé mouillé) · Élise, contre-jour (un buste en ombre chinoise devant une verrière claire) · Deux ombres (deux promeneurs à contre-jour sur un quai, leurs ombres longues vers nous). Passe 3 : les trois dégradés d'origine, presque noirs (luminance moyenne 0,08 à 0,17), ont été redessinés à la racine (`seed/images/nuit.jpg`, `ombre.jpg`, `portrait.jpg` et leurs copies de `_commun/photos/`, `480/`, `160/` ; générateur `dr-work/dr-tmp/p3/photos-nuit.cjs`, même esprit que les dessins de la démo) : luminance moyenne 0,33 (Deux, minuit), 0,54 (Élise) et 0,64 (Deux ombres). Elles vont désormais partout, comme les autres. **Une seule règle reste : dans une vue filtrée (regard, série, « À proximité »), jamais dans la première rangée**, à aucune largeur ; une série dont toutes les photos tiennent sur une rangée (Portrait) met la scène de nuit en dernier. L'ordre « choisi par nous » (§ 4.2) le garantit ; contrôle de la passe 3 (`dr-work/outils/p3-sombres.mjs`, toutes les listes en rangées des maquettes du site et de MQ-00, états compris, à 1 440, 1 280, 1 024, 820, 768, 767, 412, 360 et 320 px) : aucune des trois dans une première rangée, filtrée ou non.
- **Au téléphone, deux photos au plus par rangée, garanti par le CSS** (`public.css` § 18, passe 4) : chaque `<li>` d'une photo verticale porte la classe `.v` (une carrée `.c`) ; la photo qui suit deux verticales ouvre la rangée suivante. L'ordre des photos n'a plus à l'éviter : la série Portrait (Tiago · Inês · Élise, trois verticales) se compose Tiago · Inês, puis Élise ; la vue Julien, Ligne d'eau · Passage, puis Sous-bois · Alfama. Si trois verticales ouvrent une rangée et qu'une horizontale suit, la troisième reste seule, à la moitié de la largeur (aucune vue des maquettes n'a ce cas). Contrôle : `outils/p4-portrait.mjs` ; `sizes` au téléphone : `outils/sizes-tel.py`, qui applique la même règle.
- Les douze premières sont les dégradés du dépôt (`seed/images` ; trois d'entre eux redessinés en scènes de nuit et de contre-jour à la passe 3), les quatorze autres les dessins de la démo (`outils/demo-photos`) ; aucune photo réelle, aucun logo.

### 4.1 Les 26 photos

| Fichier | Inventaire | Rang | Titre | Auteur | Lieu | Date | Série | Statut | Format | Usage |
|---|---|---|---|---|---|---|---|---|---|---|
| `brume.webp` | `S25-001` | 1 | Brume sur la Loire | Sébastien | Anjou | mars 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `nuit.webp` | `J25-001` | 22 | Deux, minuit | Julien | Nantes | nov. 2023 | Rue | Publiée | verticale 2:3 | toutes (pas dans la 1re rangée d'une vue filtrée) |
| `dune.webp` | `S25-002` | 2 | Dernière heure | Sébastien | Erg Chebbi | avr. 2023 | Voyage | Publiée | horizontale 3:2 | toutes |
| `portrait.webp` | `J25-002` | 19 | Élise, contre-jour | Julien | Nantes | janv. 2025 | Portrait | Publiée | verticale 2:3 | toutes (pas dans la 1re rangée d'une vue filtrée) |
| `quai.webp` | `S25-003` | 3 | Quai, 7 h 12 | Sébastien | Angers | oct. 2024 | Rue | Publiée | horizontale 3:2 | toutes |
| `mer.webp` | `J25-003` | 4 | Ligne d’eau | Julien | Finistère | août 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ciel.webp` | `S25-004` | 5 | Le ciel s’est ouvert | Sébastien | Anjou | oct. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ruelle.webp` | `J25-004` | 6 | Passage, fin d’après-midi | Julien | Lisbonne | mai 2024 | Rue | Publiée | verticale 2:3 | toutes |
| `neige.webp` | `S25-005` | 7 | Silence blanc | Sébastien | Vercors | févr. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `foret.webp` | `J25-005` | 8 | Sous-bois | Julien | Chandelais | juin 2025 | Paysage | Publiée | verticale 2:3 | toutes |
| `lac.webp` | `S25-006` | 9 | Le lac ne dit rien | Sébastien | La Réunion | sept. 2024 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ombre.webp` | `J25-006` | 18 | Deux ombres | Julien | Paris | déc. 2023 | Rue | Publiée | horizontale 3:2 | toutes (pas dans la 1re rangée d'une vue filtrée) |
| `cais.webp` | `S26-001` | 10 | Cais do Sodré, marée basse | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `belem.webp` | `S26-002` | 11 | Belém, contre-jour | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tiago.webp` | `S26-003` | 12 | Tiago, marché do Bolhão | Sébastien | Porto | 11 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `foz.webp` | `S26-004` | 13 | Foz, la barre | Sébastien | Porto | 11 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tram.webp` | `J26-001` | 14 | Alfama, premier tram | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `linge.webp` | `J26-002` | 15 | Linge au balcon | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | horizontale 3:2 | toutes |
| `miradouro.webp` | `J26-003` | 16 | Miradouro, l’heure dorée | Julien | Lisbonne | 10 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ines.webp` | `J26-004` | 17 | Inês, rua dos Remédios | Julien | Lisbonne | 10 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `ribeira.webp` | `J26-005` | 20 | Ribeira, brume du fleuve | Julien | Porto | 11 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `escaliers.webp` | `J26-006` | 21 | Escaliers des Guindais | Julien | Porto | 11 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `pont.webp` | — | — | Pont Dom-Luís, le soir | Julien | Porto | 11 oct. 2026 | Voyage | Proposée | horizontale 3:2 | toutes |
| `ligny.webp` | — | — | Quai Ligny, soir | Sébastien | Angers | 14 oct. 2026 | Rue | Brouillon, accord à vérifier | horizontale 3:2 | toutes |
| `maine.webp` | — | — | Minoterie, brume du matin (titre en cours de saisie) | Sébastien | Angers | 14 oct. 2026 | Paysage (série de l'import, gardée au lot de 21 h 34) | Brouillon (R0004012.JPG) | horizontale 3:2 | toutes |
| `reverberes.webp` | — | — | Réverbères, quai Ligny (titre prévu) | Sébastien | Angers | 14 oct. 2026 | Paysage (série de l'import ; « ✦ Suggestion : Rue », pas encore acceptée) | Brouillon (R0004057.JPG) | horizontale 3:2 | toutes |


Série : toute photo en a une, dès l'import (`photos.category_id INTEGER NOT NULL`, `001_init.sql` ; pas d'option vide dans `photo.eta` ni `batch.eta`), comme dans la démo, où R0004012 et R0004057 sont en Paysage ; une série « pas encore vérifiée » (`series_checked = 0`) se signale, elle ne se vide pas (passe 4).

Inventaire : les douze photos de la démo ont été publiées en 2025, numérotées dans l'ordre de la démo (`S25-001` Brume sur la Loire … `J25-006` Deux ombres) ; les dix d'octobre 2026 dans l'ordre de prise de vue (`S26-001` Cais do Sodré … `J26-006` Escaliers des Guindais). Pont Dom-Luís recevra le sien à sa publication (`J26-007`). Rang : la place dans l'ordre « choisi par nous » (§ 4.2).

Heures et lieux précis des photos d'octobre 2026 (cartel de la visionneuse, carnet) :

| Photo | Jour et heure | Lieu précis |
|---|---|---|
| Alfama, premier tram | sam. 10 oct., 7 h 42 | Alfama, Lisbonne |
| Linge au balcon | sam. 10 oct., 8 h 15 | Alfama, Lisbonne |
| Cais do Sodré, marée basse | sam. 10 oct., 10 h 20 | Cais do Sodré, Lisbonne |
| Miradouro, l'heure dorée | sam. 10 oct., 18 h 52 | Miradouro da Graça, Lisbonne |
| Belém, contre-jour | sam. 10 oct., 19 h 05 | Belém, Lisbonne |
| Inês, rua dos Remédios | sam. 10 oct., 19 h 20 | Rua dos Remédios, Lisbonne |
| Tiago, marché do Bolhão | dim. 11 oct., 8 h 30 | Mercado do Bolhão, Porto |
| Ribeira, brume du fleuve | dim. 11 oct., 9 h 10 | Ribeira, Porto |
| Escaliers des Guindais | dim. 11 oct., 12 h 30 | Escadas dos Guindais, Porto |
| Foz, la barre | dim. 11 oct., 17 h 20 | Foz do Douro, Porto |
| Pont Dom-Luís, le soir | dim. 11 oct., 19 h 45 | Ponte Luís I, Porto |
| Minoterie, brume du matin | mer. 14 oct., 6 h 55 | la Maine, Angers |
| Quai Ligny, soir | mer. 14 oct., 18 h 10 | quai Ligny, Angers |
| Réverbères, quai Ligny | mer. 14 oct., 18 h 40 | quai Ligny, Angers |

Données de « Miradouro, l'heure dorée » montrées par la visionneuse (MQ-04), d'après l'EXIF de la démo (DSCF2117.JPG) : Fujifilm X-T5 · 23 mm · 1/1000 s · f/11 · ISO 160 ; « J'aime 12 » (13 une fois aimée, MQ-00) ; 8 tirages disponibles sur 15 ; prise de vue « 10 oct. 2026, 18 h 52 » ; « Tirage : à partir de 180 € » mène à `/tirages/miradouro-l-heure-doree` (dans les maquettes, MQ-13 montre « Brume sur la Loire » : le lien le dit). À proximité (distances depuis le miradouro da Graça), **trié par distance, la distance en tête de la méta** : Alfama, premier tram « 600 m · Alfama · Julien » · Linge au balcon « 700 m · Alfama · Julien » · Cais do Sodré, marée basse « 2,4 km · Cais do Sodré · Sébastien » · Belém, contre-jour « 6 km · Belém · Sébastien · même soir » ; « 4 photos à moins de 7 km ». Les EXIF des autres dessins sont ceux de la démo (Julien : Fujifilm X-T5, XF 23 mm ; Sébastien : Ricoh GR III, 18,3 mm).

Titres en allemand (maquettes en allemand) : Belém im Gegenlicht · Nebel über der Loire · Letzte Stunde · Wasserlinie · Miradouro, goldene Stunde · Der Himmel hat sich geöffnet · Die Treppen der Guindais · Alfama, die erste Straßenbahn · Tiago, Markt do Bolhão · Zwei, Mitternacht. Séries : Atlantik · Landschaft · Porträt · Straße · Reise. Les titres qui ne sont pas traduits gardent le titre français.

Légendes connues (démo) : Brume sur la Loire « Six heures, le fleuve fume encore. » · Dernière heure « Le vent efface les traces avant la nuit. » · Ligne d'eau « Une seule ligne, et tout le reste en dessous. » · Deux ombres « Nous deux, en passant. » · Cais do Sodré « Les pieux comptent les heures à la place de l'eau. » · Tiago « « Prenez-moi avec les oranges, c'est elles qui comptent. » » · Foz « Là où le fleuve devient l'océan, ça cogne. » · Alfama « Le 28 monte à vide ; la ville n'est pas encore levée. » · Linge au balcon « Toute la rue sèche au même fil. » · Miradouro « On attendait le soleil ; il a pris son temps, et nous aussi. » · Inês « Elle vend des fleurs depuis trente ans au même coin de rue. » · Ribeira « Le Douro garde sa brume jusqu'à dix heures. » · Escaliers « Deux cent soixante marches, et quelqu'un les monte toujours. » · Pont Dom-Luís « Les lumières s'allument d'une rive à l'autre. » Les textes de remplacement sont dans `MQ-00` (attribut `alt` de chaque vignette).

### 4.2 Comptes, séries, regards

- **Photos publiées : 22** (inventaire `S25-001` à `S26-004` et `J25-001` à `J26-006`) — Sébastien 10, Julien 12. Non publiées : 4 (Pont Dom-Luís ◐ Proposée ; Quai Ligny ○ Brouillon ▲ Accord à vérifier ; R0004012.JPG et R0004057.JPG ○ Brouillons à trier).
- **Séries** (couverture entre parenthèses) :

| Série | Photos | Sébastien | Julien | Couverture |
|---|---|---|---|---|
| Atlantique | 3 | 3 | 0 | Cais do Sodré, marée basse |
| Paysage | 5 | 3 | 2 | Brume sur la Loire |
| Portrait | 3 | 1 | 2 | Inês, rua dos Remédios |
| Rue | 7 | 1 | 6 | Linge au balcon |
| Voyage | 4 | 2 | 2 | Miradouro, l'heure dorée |

- Ordre « choisi par nous » de la galerie (colonne Rang du § 4.1) : celui de la démo, sauf les trois scènes de nuit et de contre-jour, placées selon la règle du § 4 (passe 2 : « Deux ombres » passe du rang 6 au rang 18) : Brume sur la Loire · Dernière heure · Quai, 7 h 12 · Ligne d'eau · Le ciel s'est ouvert · Passage, fin d'après-midi · Silence blanc · Sous-bois · Le lac ne dit rien · Cais do Sodré · Belém (dans « Les deux », le diptyque « Même soir » prend sa place et Miradouro quitte la sienne) · Tiago · Foz · Alfama · Linge au balcon · Miradouro · Inês · Deux ombres · Élise, contre-jour · Ribeira · Escaliers des Guindais · Deux, minuit. Première rangée de la Galerie : au bureau (1 440 px) Brume · Dernière heure · Quai ; au téléphone, Brume seule (puis une photo par rangée jusqu'à Passage). « Plus récentes d'abord » : les photos d'octobre 2026 (Escaliers des Guindais en tête), puis les douze plus anciennes par date de publication.
- **L'ordre d'une série est celui de la galerie filtrée** : Rue = Quai, 7 h 12 · Passage, fin d'après-midi · Alfama, premier tram · Linge au balcon · Deux ombres · Escaliers des Guindais · Deux, minuit (première rangée au bureau : Quai, Passage, Alfama, Linge) ; Portrait = Tiago · Inês · Élise ; Julien = Ligne d'eau · Passage · Sous-bois · Alfama · Linge · Miradouro · Inês · Deux ombres · Élise · Ribeira · Escaliers · Deux, minuit.
- **Diptyque « Même soir »** : Miradouro, l'heure dorée (Julien, 18 h 52) puis Belém, contre-jour (Sébastien, 19 h 05), dans l'ordre des heures, partout où il paraît (Galerie, billet, contact, planche) ; étiquette « Même soir », puis en casse normale « deux regards, à 18 h 52 puis à 19 h 05 ». Le diptyque de l'accueil, sur le Douro : Ribeira (9 h 10) puis Foz (17 h 20), étiquette « Même fleuve ».
- **Compteurs des séries** : le site public ne compte que les photos publiées (Atlantique 3 · Paysage 5 · Portrait 3 · Rue 7 · Voyage 4) ; l'administration compte selon le code (§ 4.9).
- **Ouverture de l'accueil** : au bureau, 6 horizontales (Belém, contre-jour · Brume sur la Loire · Dernière heure · Ligne d'eau · Miradouro, l'heure dorée · Le ciel s'est ouvert) ; au téléphone, 4 verticales (Escaliers des Guindais · Alfama, premier tram · Tiago, marché do Bolhão · Deux, minuit). Promesse : « Deux regards, une même lumière. » ; sous-ligne : « Les photographies de Sébastien et Julien, d'Angers à Lisbonne et Porto. » (DE « Zwei Blicke, ein Licht. »).
- Choix du regard (accueil) : « Les deux · 22 photos, dans l'ordre que nous avons choisi » · « Sébastien · 10 photos · le matin, les quais, les fleuves » · « Julien · 12 photos · la rue, et ceux qui y passent ».
- Badges de l'admin (16 oct. 2026, compte de Julien) : Aujourd'hui ✕ 1 (le signalement du 14 oct. attend une réponse depuis plus de 48 h) · Personnes 1 (la demande de Claire Exemple) · Signalements 1 · À valider 1 (Pont Dom-Luís) · Boutique 1 (le matin C-2026-0005 à préparer, 2 de 10 h 17 à 16 h 10, puis C-2026-0007 le soir : § 4.9).

### 4.3 Carnets

4 billets publiés (page 1 sur 1 ; la pagination n'apparaît qu'au-delà de 12 billets), 1 brouillon.

| Billet | Rubrique | Auteur | Publié le | Lecture | Couverture | Photos, dans l'ordre |
|---|---|---|---|---|---|---|
| Lisbonne et Porto (DE « Lissabon und Porto ») · `/carnet/lisbonne-et-porto` | Voyages | Sébastien et Julien | 14 oct. 2026, mis à jour le 15 oct. | 4 min | Alfama, premier tram | 1 Alfama, premier tram · 2 Linge au balcon · 3 Cais do Sodré, marée basse · 4 Miradouro, l'heure dorée · 5 Belém, contre-jour · 6 Inês, rua dos Remédios · 7 Tiago, marché do Bolhão · 8 Ribeira, brume du fleuve · 9 Escaliers des Guindais · 10 Foz, la barre (diptyque « Même soir » : 4 et 5, Miradouro puis Belém ; deux journées : samedi 10, dimanche 11 octobre) |
| Inês, ou comment demander une photo · `/carnet/ines-ou-comment-demander-une-photo` | Notes d'atelier | Julien | 15 oct. 2026 | 3 min | Inês, rua dos Remédios | Inês, rua dos Remédios |
| Pourquoi nous ne recadrons pas · `/carnet/pourquoi-nous-ne-recadrons-pas` | Notes d'atelier | Sébastien | 2 oct. 2026 | 4 min | Ligne d'eau (passe 4 : Brume sur la Loire faisait, à côté de Silence blanc, deux couvertures grises voisines dans la liste) | Brume sur la Loire · Ligne d'eau |
| Tirer sur Photo Rag · `/carnet/tirer-sur-photo-rag` | Notes d'atelier | Sébastien | 25 sept. 2026 | 4 min | Silence blanc | Silence blanc |
| Angers, un soir d'octobre (○ brouillon, commencé le 15 oct. à 22 h 10 ; 1 min de lecture) | Voyages | Sébastien | — | — | — | Quai, 7 h 12 · Quai Ligny, soir (accord à vérifier) · Réverbères, quai Ligny |

Le billet « Lisbonne et Porto » remplace la page Voyage du même nom de la démo ; son texte d'introduction est celui du voyage, tel que la démo l'a corrigé (`outils/demo-photos/retouche.mjs`) : « Deux jours, deux regards, un même océan. Sébastien a cherché la mer, Julien les gens : du premier tram de l'Alfama à la barre de Foz, là où le Douro rencontre l'Atlantique. » (DE « Zwei Tage, zwei Blicke, ein Ozean. ») Deux jours, comme les photos : samedi 10 octobre à Lisbonne (6 photos), dimanche 11 octobre à Porto (4 photos). Le temps de lecture est le même dans les trois langues. Flux : `/carnet/flux.xml` (et `/en/…`, `/de/…`).

### 4.4 Tirages : offre, stocks, numéros

- **Offre** : 9 photos, **deux formats au plus par photo** (étude, « Formats », proposition C). **Deux exemplaires au plus par photo dans un panier**, 20 lignes au plus (étude S23, « quantité plafonnée par œuvre : 2 ») : un second exemplaire s'ajoute depuis la page du tirage, jamais par une liste de quantités (MQ-13, MQ-14). Chacune en édition de **15 exemplaires, tous formats confondus**, numérotés dans l'ordre des ventes. Petit format (image 24 × 36 cm, feuille 30 × 40) **180 €** ; grand format (image 40 × 60 cm, feuille 50 × 70) **290 €**. Hahnemühle Photo Rag 308 g, signé, certificat. Livraison à plat, suivie : **15 €** en France métropolitaine (du 30 oct. au 6 nov. pour une commande du 16 oct.), **25 €** dans l'UE (du 3 au 10 nov.). Boutique ouverte le 1er oct. 2026 ; les premiers numéros ont été vendus en exposition (Angers, juin 2026).

| Tirage | Vendeur | Numéros vendus | Réservé | Disponibles | Prochain numéro |
|---|---|---|---|---|---|
| Brume sur la Loire | Sébastien | 1 à 4 (exposition), 5 (C-2026-0002) | — | 10 | 6 |
| Cais do Sodré, marée basse | Sébastien | 1 (exposition) | — | 14 | 2 |
| Foz, la barre | Sébastien | 1 (exposition) ; 2 (C-2026-0006, payée à 9 h 44) | 2 (C-2026-0006, jusqu'à 9 h 47 ; à 9 h 40, capture de MQ-19) | 13 | 3 |
| Silence blanc | Sébastien | 1 et 2 (exposition), 3 (C-2026-0001) | — | 12 | 4 |
| Le ciel s'est ouvert | Sébastien | 1 à 15 | — | **0 : épuisé** | — |
| Miradouro, l'heure dorée | Julien | 1 à 6, 7 (C-2026-0005) | — | 8 | 8 |
| Ribeira, brume du fleuve | Julien | 1 à 3, 4 (C-2026-0005) | — | 11 | 5 |
| Escaliers des Guindais | Julien | 1 à 4, 5 (C-2026-0003) | — | 10 | 6 |
| Sous-bois | Julien | 1 | — | 14 | 2 |

Le certificat porte le numéro d'inventaire de la photo (Brume sur la Loire : `S25-001` ; Escaliers des Guindais : `J26-006`), le numéro d'exemplaire et les dates de prise de vue et de tirage. « Le ciel s'est ouvert » est l'exemple d'édition épuisée (bouton indisponible, raison écrite à côté ; épuisé entre l'ajout et le paiement dans l'état d'erreur du panier).

Photos non vendues (ni tirage ni bouton) : les portraits sans accord « tirage » (Tiago : site seulement) et toutes les autres. Inês a donné son accord pour un tirage, mais il n'est pas au catalogue.

### 4.5 Commandes (au vendredi 16 oct. 2026, 9 h 40 : la capture de MQ-19 ; la suite de la journée est au § 4.9)

Une commande par vendeur ; un panier qui mêle les deux photographes donne deux commandes et deux paiements, dans le même écran.

| Commande | Date | Client | Vendeur | Contenu | Montant | État | Facture |
|---|---|---|---|---|---|---|---|
| C-2026-0001 | 3 oct. | Marc Exemple, Nantes | Sébastien | Silence blanc, petit, ex. 3/15 | 180,00 + 15,00 = 195,00 € | ● Livrée le 10 oct. | S-2026-0001 |
| C-2026-0002 | 5 oct. | Paul Exemple, Lyon | Sébastien | Brume sur la Loire, grand, ex. 5/15 | 290,00 + 15,00 = 305,00 € | ● Livrée le 12 oct. | S-2026-0002 |
| C-2026-0003 | 9 oct. | Léa Exemple, Bruxelles | Julien | Escaliers des Guindais, petit, ex. 5/15 | 180,00 + 25,00 = 205,00 € | ◐ Expédiée le 14 oct. (Colissimo) | J-2026-0001 |
| C-2026-0004 | 12 oct. | Hugo Exemple, Angers | Sébastien | Cais do Sodré, petit | 195,00 € | ✕ Annulée (paiement non abouti, exemplaire libéré) | — |
| C-2026-0005 | 15 oct., 21 h 04 | Anna Beispiel, Fribourg-en-Brisgau (commande en allemand) | Julien | Ribeira, grand, ex. 4/15 · Miradouro, grand, ex. 7/15 | 290,00 + 290,00 + 25,00 = 605,00 € | ◐ Payée, à préparer (livraison promise du 2 au 9 nov.) | à l'expédition (J-2026-0002) |
| C-2026-0006 | 16 oct., 9 h 12 | Marc Exemple, Nantes | Sébastien | Foz, la barre, grand, ex. 2/15 réservé jusqu'à 9 h 47 (l'admin voit le numéro ; le client le reçoit après paiement) | 290,00 + 15,00 = 305,00 € | ○ En attente de paiement | — |

Panier en cours (maquettes du panier et du tunnel) : **Claire Exemple**, 5 rue des Exemples, 49100 Angers, `claire.exemple@example.org`, le vendredi 16 oct. 2026 vers 10 h. Les blocs suivent l'ordre des ajouts : d'abord **Julien** (« Escaliers des Guindais », grand format, 290,00 € + livraison 15,00 € = **305,00 €**, commande 1 sur 2), puis **Sébastien** (« Brume sur la Loire », petit format, 180,00 € + 15,00 € = **195,00 €**, commande 2 sur 2) ; total 500,00 €. Tunnel : coordonnées une seule fois à 10 h 12, puis deux paiements à la suite, chacun chez son vendeur ; les deux exemplaires sont réservés 35 minutes, jusqu'à 10 h 47 ; boutons « Payer 305,00 € à Julien » puis « Payer 195,00 € à Sébastien » ; confirmation à 10 h 17, deux lignes sur le relevé (« NICEPHOS JULIEN EXEMPLE », « NICEPHOS SEBASTIEN EXEMPLE »). Après paiement : C-2026-0007 (Julien, Escaliers ex. 6/15 ; facture à l'expédition, J-2026-0003, après J-2026-0002 de C-2026-0005), puis C-2026-0008 (Sébastien, Brume ex. 6/15, facture à l'expédition). Livraison du 30 oct. au 6 nov., deux colis suivis. Suivi Colissimo : un numéro de 13 signes.

### 4.6 Galeries privées et accès

| Galerie | Créée par | Pour | Photos | Droits | Créée · expire | État |
|---|---|---|---|---|---|---|
| Lisbonne et Porto, planche de travail | Julien, 16 oct. 2026 | Lucie Exemple, Éditions du Fleuve | 11 : les 10 du carnet et Pont Dom-Luís, le soir | voir et choisir (favoris), sans téléchargement | 16 oct. · 30 nov. 2026 | ● Ouvert le 16 oct. à 14 h 05 · 4 favoris (Alfama, Miradouro, Ribeira, Pont Dom-Luís) |
| Quai Ligny, 14 octobre | Sébastien, 15 oct. 2026 | Claire Exemple (et Hugo Exemple) | 2 : Quai Ligny, soir · Réverbères, quai Ligny | voir et télécharger | 15 oct. · 14 nov. 2026 | ● Ouvert le 15 oct. à 20 h 31 |
| Angers, juin 2026 | Sébastien, 2 juin 2026 | Marc Exemple | 3 : Brume sur la Loire · Quai, 7 h 12 · Silence blanc | voir seulement | 2 juin · 30 sept. 2026 | ✕ Expiré |

Lien : `https://www.nicephos.art/g/<jeton>` (exemple de Lucie : `/g/6Me5pScUZIQhW-wezlKchJ9h3k7EDpzm`) ; mot de passe de 12 caractères en trois groupes (exemple montré : `k7qm p3xw 9tra`), donné par un autre canal (SMS) ; après le bon mot de passe : `/prive/<id>` — `/prive/7Hk2Qp9xLm4R` pour « Lisbonne et Porto, planche de travail » (DE « Lissabon und Porto, Arbeitsauswahl »), `/prive/Rm8vT2kq5Wz1` pour « Quai Ligny, 14 octobre ». Vues : `?vue=favoris`. Après 5 refus, pause de sécurité (« réessayez à 13 h 58 ») ; Lucie entre ensuite, à 14 h 05. Ses 4 favoris (posés de 14 h 12 à 14 h 46) sont envoyés à Julien le 16 oct. à 15 h 20 (heures au § 4.9) ; elle demande ensuite une licence pour « Miradouro, l'heure dorée » (MQ-06, `/droits/demande?photo=miradouro-l-heure-doree`). Claire télécharge : archive ZIP de 2,6 Mo (les 2 photos en JPEG de 2 048 px) ou une photo, 1,3 Mo. L'accès de Lucie : créé le 16 oct., « dans 30 jours, le 15 nov. » par défaut, porté au 30 nov. (fermeture de la galerie).

### 4.7 Personnes

| Personne | Rôle dans les maquettes |
|---|---|
| Sébastien Exemple | Photographe (préfixe S). Vit à Angers. Matin, quais, fleuves, grand angle. |
| Julien Exemple | Administrateur (préfixe J), directeur de la publication. Photographe de rue ; demande toujours l'accord. |
| Camille Exemple | Relectrice (traductions anglaises et allemandes). |
| Inês Exemplo | Fleuriste, Lisbonne. Rencontre J-0001 du 10 oct. 2026 : accord signé pour le site, Instagram, un tirage et son prénom. |
| Tiago Exemplo | Marchand de fruits, Porto. Rencontre S-0001 du 11 oct. 2026 : accord pour le site seulement. Fiche de l'administration : `/admin/rencontres/30`. |
| Claire Exemple | Photographiée le 14 oct. à 18 h 10 quai Ligny, avec Hugo (heure de l'EXIF de « Quai Ligny, soir » ; dans sa demande, elle écrit « vers 18 h 15 ») ; demande envoyée par `/bonjour` le 15 oct. : accord en ligne, à vérifier ; veut recevoir la photo. Fiche de l'administration : `/admin/rencontres/31`. Cliente du panier en cours. |
| Hugo Exemple | L'ami de Claire sur Quai Ligny, soir ; pas encore d'accord. Client de la commande annulée C-2026-0004. |
| Anna Beispiel | Cliente allemande (Fribourg-en-Brisgau), commande C-2026-0005, langue DE. |
| Marc Exemple · Paul Exemple · Léa Exemple | Clients (Nantes, Lyon, Bruxelles). |
| Lucie Exemple | Éditrice (Éditions du Fleuve), invitée de la galerie privée « Lisbonne et Porto, planche de travail ». |

Coordonnées légales (démo) : Sébastien Exemple et Julien Exemple, 12 rue de l'Exemple, 49000 Angers ; contact@example.org ; +33 1 99 00 12 34. Chacun vend en entrepreneur individuel (« Julien Exemple EI », « Sébastien Exemple EI ») ; **SIREN fictif `000 000 000`** pour les deux, sur les factures et leurs extraits (MQ-19), jamais un vrai numéro (« 000 000 000 » ne peut appartenir à personne). Les adresses e-mail des personnes sont en `prenom.nom@example.org`, sans accent : `sebastien.exemple@`, `julien.exemple@`, `claire.exemple@`, `lucie.exemple@`, `anna.beispiel@`, `ines.exemplo@example.org`. Adresse de Claire : 5 rue des Exemples, 49100 Angers.

Camille Exemple, relectrice : compte désactivé le 2 oct. 2026 ; ses 14 traductions restent sur le site (MQ-09).

### 4.8 Écarts avec la démo (à corriger dans la démo, pas dans les maquettes)

- « Quai, 7h12 » s'écrit « Quai, 7 h 12 ».
- Élise, contre-jour : la démo donne le lieu « Atelier », qui se confond avec le thème et la rubrique « Notes d'atelier » ; le référentiel dit « Nantes ».
- La démo n'a pas de titre pour R0004012.JPG ni R0004057.JPG (brouillons à trier) ; le référentiel fixe les titres que les maquettes saisissent.
- La démo a un voyage « Lisbonne et Porto » ; les maquettes en font un billet des Carnets.
- La démo ne sert ni la boutique, ni les galeries privées, ni les carnets : leurs données sont propres au référentiel.
- La démo numérote les photos par leur rang (« N°11 »), qui change à chaque réordonnancement ; les maquettes donnent un numéro d'inventaire stable (UX-T-05, § 2).
- L'ordre « choisi par nous » des maquettes diffère de celui de la démo pour les trois scènes de nuit et de contre-jour (§ 4.2) ; leurs images ont été redessinées à la passe 3 (`seed/images`, lisibles), la démo garde les anciennes jusqu'à son prochain peuplement.
- Le premier dessin de l'ouverture de l'accueil est Belém, contre-jour (un dessin de la démo, disponible en 1 600 px), et non Le ciel s'est ouvert (dégradé de 900 px).

### 4.9 La journée du vendredi 16 octobre 2026, heure par heure (et l'administration)

Une seule chronologie pour toutes les maquettes qui montrent ce jour-là : un écran montré à une heure donnée montre l'état de chaque objet à cette heure, ni avant ni après. Heure de Paris.

| Heure | Où | Ce qui se passe | Maquettes |
|---|---|---|---|
| 1 h 12 | Admin, assistants | L'analyse de nuit finit : 26 photos sur 26 (« la dernière cette nuit à 1 h 12 »). | MQ-07 |
| 8 h 50 | Admin | Le signalement reçu le 14 oct. à 8 h 50 attend depuis 48 h : « Aujourd'hui ✕ 1 » (urgence) toute la journée. | toutes |
| 9 h 12 | Boutique | Marc Exemple commande « Foz, la barre », grand format : C-2026-0006, ○ En attente de paiement, exemplaire 2/15 réservé jusqu'à 9 h 47. | MQ-19 |
| 9 h 40 | Admin, Julien | Capture de MQ-19 (Commandes) : C-2026-0006 en attente, C-2026-0005 (Anna, 15 oct.) ◐ Payée, à préparer ; badge « Boutique 1 ». Séries de la barre (règle du code, ci-dessous) : 3 · 7 · 3 · 8 · 5. | MQ-19 |
| 9 h 44 | Boutique | Marc paie : C-2026-0006 ◐ Payée, à préparer (vente de Sébastien) ; Foz : 13 disponibles. | — |
| 10 h 00 à 10 h 17 | Site | Claire Exemple : panier (Escaliers des Guindais chez Julien, puis Brume sur la Loire chez Sébastien), coordonnées à 10 h 12, exemplaires réservés jusqu'à 10 h 47, deux paiements ; confirmation à 10 h 17 : C-2026-0007 (Julien, Escaliers ex. 6/15) et C-2026-0008 (Sébastien, Brume ex. 6/15), ◐ Payées, à préparer. Badge « Boutique 2 » pour Julien (C-0005, C-0007). | MQ-14, MQ-15 |
| 11 h 24 | Admin, Julien | Accès de Lucie Exemple à « Lisbonne et Porto, planche de travail » (11 photos) : créé, invitation envoyée à lucie.exemple@example.org sans le mot de passe ; mot de passe `k7qm p3xw 9tra` affiché une seule fois, donné par SMS ; jusqu'au 30 nov. | MQ-18 |
| 11 h 31 | Galerie privée | Lien consulté sans mot de passe (l'antivirus de la messagerie). | MQ-18 |
| 13 h 49 à 13 h 57 | Galerie privée | Lucie tape le mot de passe de mémoire : 5 refus (13 h 49, 13 h 51, 13 h 54, 13 h 56, 13 h 57), pause de sécurité « réessayez à 13 h 58 ». | MQ-16, MQ-18 |
| 14 h 05 | Galerie privée | Mot de passe accepté : première ouverture, ● Ouvert. | MQ-17, MQ-18 |
| 14 h 12 à 14 h 46 | Galerie privée | Quatre favoris : Alfama, premier tram (14 h 12) · Miradouro (14 h 20) · Ribeira (14 h 31) · Pont Dom-Luís, le soir (14 h 46). | MQ-17 |
| 15 h 20 | Galerie privée | Lucie envoie sa sélection à Julien (4 favoris) ; « Reprendre ma sélection » reste possible. | MQ-17, MQ-18 |
| 15 h 34 | Site | Lucie demande une licence pour « Miradouro, l'heure dorée » (`/droits/demande?photo=miradouro-l-heure-doree`). | MQ-06 |
| 16 h 10 | Admin, Julien | C-2026-0005 : « Tirage lancé » (les 2 tirages au laboratoire) ; badge « Boutique 1 » (C-0007 à préparer) jusqu'au soir. | — |
| 17 h 30, 17 h 32 | Admin, Julien | Galeries privées (liste), puis le suivi de l'accès de Lucie : activité de 11 h 24 à 15 h 20, refus et pause compris ; « Favoris : 4 sur 11, sélection envoyée ». | MQ-18 |
| 18 h | Admin | « Bonjour, Julien. » devient « Bonsoir, Julien. » (main, `home.eta`). | MQ-07, MQ-09 |
| 21 h 34 | Admin, Sébastien | Lot de trois brouillons d'Angers enregistré : « Minoterie, brume du matin » titré, dans sa série d'import, Paysage, que Sébastien garde ; « Quai Ligny, soir » (Rue, ▲ accord à vérifier) ; R0004057 garde son titre provisoire (le nom du fichier) et sa série d'import, Paysage, avec « ✦ Suggestion : Rue » pas encore acceptée ; sa date est refusée (1 champ non enregistré). Les compteurs des séries ne bougent pas : ces trois photos y étaient déjà comptées. | MQ-08 |
| 22 h 40 | Admin, Julien | « Mon compte » enregistré. « Minoterie, brume du matin » est entièrement décrite : titre (21 h 34), légende « La Maine fume encore ; le moulin attend le soleil. », texte de remplacement « Une minoterie à six cheminées sur la Maine, à demi noyée dans la brume bleue du matin. » ; elle reste ○ Brouillon et n'est plus « à finir ». « Aujourd'hui » propose « 2 photos à finir » : Quai Ligny, soir (▲ accord à vérifier) et R0004057 (titre provisoire). | MQ-07 |
| 22 h 41 | Admin, Sébastien | R0004057 reçoit son titre, « Réverbères, quai Ligny » (dans « Décrire la photo » de l'éditeur du billet) ; il reste ○ Brouillon, texte de remplacement à écrire. | MQ-20 |
| 22 h 42, 22 h 44 | Admin, Sébastien | Billet « Angers, un soir d'octobre » (○ brouillon, commencé le 15 oct. à 22 h 10) enregistré ; traduction allemande proposée par l'assistant à 22 h 44. | MQ-20 |
| 22 h 50 à 22 h 56 | Admin, Julien | « Cais do Sodré » publiée sur Instagram (22 h 50) ; légende rétablie « comme à 22 h 51 » ; suggestion de description demandée à 22 h 55, arrivée à 22 h 56. | MQ-09 |
| 22 h 58 | Admin, Julien | Capture de MQ-09 : la Photothèque, filtre « Brouillons 3 » : Quai Ligny, soir · Minoterie, brume du matin · Réverbères, quai Ligny (titrée depuis 22 h 41) ; Pont Dom-Luís est dans « Proposées 1 », pas dans les brouillons. | MQ-09 |

Ce qui ne bouge pas de la journée : Personnes 1 (la demande de Claire, du 15 oct.) ; Signalements 1 ; À valider 1 (Pont Dom-Luís, proposé le 12 oct.) ; Camille Exemple désactivée depuis le 2 oct.

**Compteurs des séries de la barre latérale : la règle du code** (`navSeries`, `server/routes/admin.js`) : toutes les photos de la série, **quel que soit leur statut** (publiées, proposées, brouillons) ; pour un compte en portée « les miennes » (Photographe), ses seules photos. **Toute photo a une série** (passe 4 : `photos.category_id INTEGER NOT NULL`, `001_init.sql` ; la série d'import d'un brouillon compte dès l'import, comme dans la démo). Les compteurs sont donc les mêmes toute la journée du 16 oct. (rien n'est importé, rien ne change de série) :

| Compte | Atlantique | Paysage | Portrait | Rue | Voyage |
|---|---|---|---|---|---|
| Julien (administrateur) | 3 | 7 (avec Minoterie et R0004057) | 3 | 8 (avec Quai Ligny) | 5 (avec Pont Dom-Luís) |
| Sébastien (photographe) | 3 | 5 (avec Minoterie et R0004057) | 1 | 2 (avec Quai Ligny) | 2 |
| Site public (publiées seulement) | 3 | 5 | 3 | 7 | 4 |

- Barre latérale du rôle Photographe (Sébastien, MQ-07, MQ-08, MQ-20 et planche) : Aujourd'hui · Photos (Photothèque ; « Séries », un intitulé qui se déplie et **n'est pas un lien** — sans `series.gerer`, `/admin/series` lui répondrait 403 —, avec ses séries comptées sur ses 13 photos : Atlantique 3, Paysage 5, Portrait 1, Rue 2, Voyage 2, vignettes Cais do Sodré, Brume sur la Loire, Tiago, Quai 7 h 12, Dernière heure ; Sorties ; Voyages) · Personnes (Personnes 1, la demande de Claire ; App de terrain) · Publier (Mes propositions ; Carnets, Galeries privées, Boutique : modules à venir, permissions à créer) · Équipe (Statistiques) ; au pied, Aide, Voir le site, langue, Nouveautés 1.90.0 ; ni Signalements, ni Instagram, ni Réglages (`server/permissions.js`). Badge « Boutique » de Sébastien : 1 à partir de 9 h 44 (C-0006), 2 à partir de 10 h 17 (C-0008).
- Pied de la barre latérale (tous les rôles), comme `views/admin/layout.eta` : Réglages (administrateur), Aide, Voir le site, langue (formulaire POST), Nouveautés et la version `1.90.0` ; « Traitement : n photos » quand des images sont en cours (caché le 16 oct. au soir : rien n'est en cours) ; le compte, le thème (formulaire POST) et la déconnexion (POST).
- Fichiers des brouillons d'Angers (EXIF de la démo) : `R0004012.JPG` Minoterie, brume du matin (14 oct., 6 h 55) · `R0004046.JPG` Quai Ligny, soir (18 h 10) · `R0004057.JPG` Réverbères, quai Ligny (18 h 40).
- Les noms des séries sont fixes (Atlantique, Paysage, Portrait, Rue, Voyage) ; un écran qui montre une modification de série change sa description, jamais son nom.
- App de terrain (MQ-10, le samedi 10 oct. à Lisbonne, pas le 16) : rencontre d'Inês, carte `J-0001`, à 19 h 20 ; prochaine carte `J-0002` ; adresse imprimée sur la carte : `nicephos.art/bonjour/j` (puis le numéro) ; session de terrain ouverte jusqu'à 3 h 24. L'anglais montré à Inês : « has been kept on this phone since 7:24 pm », « 62% ».
- Galeries privées (MQ-18) et commandes (MQ-19) : les données du § 4.5 et du § 4.6, à l'heure de la capture (tableau ci-dessus).

### 4.10 Arbitrages avec l'étude des projets (docs/etudes/blog-galeries-boutique.md)

- **Carnet** : adresses de l'étude (`/carnet`, B1 ; slug français dans toutes les langues, B73) ; le libellé public reste « Carnets ». L'administration suit la même règle : `/admin/carnet` (B1).
- **Galeries privées** : « Accès » (et non « partage ») ; « favoris » (et non « sélectionnés ») ; l'invitation part à la création de l'accès ; une sélection envoyée se reprend (`POST /prive/:pid/selection/reprendre`, à ajouter à l'annexe des routes : il contredit G50, qui la figeait).
- **Boutique** : motif de remboursement libre ; le suivi Colissimo est un numéro de 13 signes ; un exemplaire revenu (remboursement, annulation) redevient disponible (S7 aligné sur S49) ; D16 en lecture seule.
- **Formulaires** : la date de rencontre de `/bonjour` se saisit en champ libre (comme dans l'admin), et non en `type=date` : écart voulu avec le code actuel.
- **Bouton final du tunnel** (passe 2) : « Payer 305,00 € à Julien » (FR, EN « Pay €305.00 to Julien ») plutôt que « Commander avec obligation de paiement » (étude S30, niveau O) : les lignes directrices européennes admettent « payer maintenant », et le bouton nomme le destinataire, ce qu'exige un panier à deux vendeurs. En allemand, la formule légale « Zahlungspflichtig bestellen » (§ 312j BGB) est gardée, suivie du montant et du destinataire. À reporter dans l'étude (S30).
- **Une photo dans un billet, une ligne** (passe 3, MQ-20) : la source du billet écrit une photo d'une ligne seule, son adresse (`photo:quai-ligny-soir`, le slug de la photo), et non `![Texte alternatif](photo:123 "Légende")` comme l'étude (§ 1.4). Le texte de remplacement et la légende sont des réglages de la photo dans le billet, par langue (« Photos du billet ») : la source reste lisible, la traduction n'a plus de syntaxe à protéger (B36), et B9 tient : la base ne garde que `photo:ID` (le serveur traduit le slug à l'enregistrement et réécrit le slug du moment à l'ouverture de l'éditeur ; un slug qui change ne casse rien). Sans script, cocher une photo ajoute sa ligne à la fin du texte. À reporter dans l'étude (§ 1.4, B17, B24).
- **Flux du carnet** : l'interface dit « flux RSS » (le mot connu) ; le format reste Atom (étude B58).
- **Danger en Chambre noire** (passe 2) : `#f0605a`, un rouge, au lieu de l'orangé `#e8743b` de main, trop voisin de l'ambre du bouton principal : évolution d'`admin.css` à reporter dans main (`dr-work/mq2-correctifs-main.md`).
- **Routes** : la liste de ce qui existe et de ce qui est à créer est au § 2 (adresses) ; les maquettes écrivent « (à créer) » dans leur encart pour toute adresse de la seconde liste.
- **Routes à créer** : `/droits/demande?photo=<slug>` (demande de licence préremplie) et `/instagram` (MQ-06).
- **Références de commande** (tranché le 16 oct.) : la référence lisible `C-2026-0007` reste le numéro affiché (page de suivi, e-mails, factures, admin, téléphone) ; le lien de suivi envoyé au client porte un jeton aléatoire d'au moins 128 bits (22 caractères en base64url, `https://www.nicephos.art/commande/suivi/<jeton>`, préfixe de langue au besoin), seul à ouvrir la commande : la référence seule n'ouvre rien. Cela concilie S55 (référence d'au moins 50 bits) : l'aléa est porté par le jeton, pas par le numéro. MQ-19 le montre (e-mail d'Anna, lien masqué ; paiement : « Suivi d'Anna »). À reporter dans l'étude (S55, annexe des routes).
- **Adresse de la boutique** (tranché le 16 oct.) : l'adresse publique est `/tirages` (`/tirages/<slug>`), le mot du menu ; l'étude écrivait `/boutique` (S10, schéma du parcours, annexe des routes) : à corriger dans l'étude. L'administration garde « Boutique » (`/admin/boutique`).
- **Voyages** : l'entrée « Voyages » reste dans la barre latérale de l'administration (groupe Photos) : les voyages existent dans le code et coexistent avec le Carnet (étude B9, B64) ; le billet « Lisbonne et Porto » ne remplace que la page publique du voyage.
