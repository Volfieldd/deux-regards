# Lexique et données fictives des maquettes

Référence commune des vingt maquettes (MQ-01 à MQ-20), avec la planche [MQ-00](MQ-00-direction-artistique.html). Une maquette n'invente ni un mot ni une donnée : elle prend ici ce dont elle a besoin. Ce qui manque s'ajoute ici d'abord.

Les données suivent l'instance de démonstration (http://127.0.0.1:3091) quand elle les a : mêmes photos, mêmes titres, mêmes comptes de séries. Les écarts avec la démo (§ 4.8) et les arbitrages faits avec l'étude des projets (§ 4.9) sont listés à la fin. Mise à jour du 16 oct. 2026, après la refonte des vingt maquettes : adresses du carnet, numéro d'inventaire, ordre « choisi par nous », données des boutiques, des galeries privées et de l'administration.

## 1. Lexique

### Site public

| On écrit | Ce que cela désigne | On n'écrit plus |
|---|---|---|
| **Tirages** | La boutique : entrée du menu (DE « Kunstdrucke », EN « Prints »), pages `/tirages`, groupe du pied de page. | « Boutique » côté public ; « Tirages et licences » |
| **Tirage : à partir de 180 €** | Le lien ou le bouton vers la page d'un tirage, depuis une photo ou un billet (DE « Kunstdruck: ab 180 € »). | « Tirage : dès 180 € », « Acheter » |
| **un tirage** | Un exemplaire d'art signé et numéroté d'une photo. | « print », « produit » |
| **Droits et licences** | La page `/droits` et sa demande de licence (presse, entreprise, usage hors catalogue). | « Droits, tirages et licences » |
| **Demander une licence** | Le lien d'une photo vers la demande préremplie : `/droits/demande?photo=miradouro-l-heure-doree` (DE « Lizenz anfragen »). | « Licence : nous écrire » |
| **Les deux · Sébastien · Julien** | Le choix du regard, dans cet ordre, partout (galerie, séries, carnets). | « Tous », « Les 2 », « Nous » |
| **Galerie** | Toutes les photos publiées, en rangées. | « Toutes les photos », « Toutes les séries » |
| **Séries** | Les ensembles d'auteur (Atlantique, Paysage, Portrait, Rue, Voyage). | « Catégories », « Thèmes » |
| **Carnets** · **un billet** | La rubrique de textes (menu « Carnets », DE « Reisetagebücher », EN « Notebooks ») et chacun de ses textes. Deux rubriques : Voyages (DE « Reisen »), Notes d'atelier. Adresses : `/carnet`, `/carnet/lisbonne-et-porto`, `/carnet/flux.xml`, filtres `?rubrique=voyages`, `?par=julien` ; le slug reste français dans toutes les langues (`/de/carnet/lisbonne-et-porto`), comme le reste du site (étude, B1 et B73). | « Blog », « Journal » (pris par l'admin), « Voyages » comme entrée de menu ; `/carnets`, `/de/reisetagebuecher/…` |
| **J'aime** | Public : un visiteur apprécie une photo. Cœur, bouton bascule, compteur affiché dès 1. | « Favori » sur le site public ; « 0 j'aime » |
| **Favori** | Galerie privée : l'invité met une photo dans sa sélection. Étoile, bouton bascule ; « 4 favoris » dans l'en-tête de la galerie. | « J'aime » en galerie privée ; « Sélectionner » |
| **Galerie privée** | Un espace privé de photos, ouvert par un lien et un mot de passe. | « Espace client », « Album » |
| **Panier (2)** | Le panier et son nombre de tirages, en toutes lettres au bureau ; l'icône et le nombre au téléphone (nom lu : « Panier, 2 tirages »). | « Mon panier », « Caddie » |
| **Payer 305,00 € à Julien** | Le bouton final du tunnel répète le montant et nomme le photographe qui encaisse (un paiement par vendeur). En allemand, l'obligation légale : « Zahlungspflichtig bestellen ». | « Valider », « Continuer », « Payer » sans destinataire |
| **Renoncer à une commande** | La fonction de rétractation (pied de page, page de suivi). | « Retour », « Annuler ma commande » après paiement |
| **Retour au panier** · **← Lisbonne et Porto** | Un retour dit toujours où il mène. | « ← Retour », « RETOUR AU PANIER » |
| **Menu** | Le bouton du menu au téléphone ; le mot ne change pas quand il est ouvert (l'icône devient ✕). | « Fermer » à la place de « Menu » |
| **choisi par nous** · **Plus récentes d'abord** | Les deux ordres de la Galerie (DE « von uns gewählt », « Neueste zuerst »). | « Sélection » dans l'interface, « Tri » |
| **Inventaire** | Le numéro stable d'une photo publiée, `J26-003` (voir § 2). | « N°19 », « Numéro » |

### Administration

| On écrit | Ce que cela désigne | On n'écrit plus |
|---|---|---|
| **Proposée** (photo) · **Proposé** (billet) | Un statut : l'objet attend le modérateur. Pastille ◐. | « Proposée : Rue » pour une suggestion d'assistant |
| **✦ Suggestion** | Ce que proposent les assistants d'analyse : « ✦ Suggestion : Rue ». | « Proposition », « Proposée » |
| **prête** | Traitement des images fini (et rien d'autre). | « prête » pour les accords ou pour « terminée » |
| **Accord à vérifier** · **accords en règle** | État des accords de droit à l'image d'une photo. | « Site : prête » |
| **vues** | Audience d'une page. | « ouvertures » |
| **Brouillon · Proposée · Publiée · Accord à vérifier · Dépubliée** | Les états d'une photo (voir § 3). | une douzaine de statuts sans légende |
| **Photothèque** | La liste des photos de l'admin. | « Photos » dans un titre de page (le mot reste dans la barre d'onglets du téléphone) |
| **Boutique** | Le module de l'admin : Commandes, Éditions. (Le public dit « Tirages ».) | « Shop » en français |
| **Accès** | Une invitation à une galerie privée : un lien, un mot de passe, une échéance, des droits. | « Partage », « Lien privé » |
| **App de terrain** | L'app du téléphone pour les accords sur le terrain (DE « Unterwegs-App »). | « App, cartes, QR » dans le menu |
| **Réglages** | Une seule entrée de menu, vers une page à onglets (Identité et apparence, Filigrane et EXIF, Mentions et confidentialité, Photographes, Assistants d'analyse). | dix entrées « Réglages » |

### Le sens unique des mots d'action

| Mot | Un seul sens | Exemple |
|---|---|---|
| **Annuler** | Ne pas faire : fermer un dialogue ou abandonner une saisie sans rien changer. Toujours le premier bouton d'un dialogue. | [Annuler] [Révoquer l'accès de Lucie] |
| **Défaire** | Revenir sur un geste déjà fait, dans le message d'action, pendant 10 s (en pause au survol et au focus). | « « Brume sur la Loire » publiée. · Défaire » |
| **Revenir à la version enregistrée** | Abandonner les modifications non enregistrées, là où un bouton d'enregistrement existe encore. | Mentions légales |
| **Enregistrer** | Seulement sans JavaScript, ou dans un formulaire sans effet public. Ce qui a un effet public, légal ou financier dit son effet : Publier, Proposer, Programmer…, Mettre en ligne les mentions, Rembourser 290,00 €, Révoquer l'accès. | — |
| **Supprimer…** | Ouvre le dialogue de confirmation (les points de suspension le disent). Le dialogue répète l'objet : « Supprimer la photo ». | — |

## 2. Formats

| Donnée | Règle | Exemples |
|---|---|---|
| Prix en vitrine (pages Tirages, visionneuse, billet) | euros entiers, espace insécable avant € ; un prix « à partir de », jamais « dès » | 180 € · 290 € · « Tirage : à partir de 180 € » |
| Prix au panier, dans le tunnel, la commande, la facture, l'admin | deux décimales, virgule | 290,00 € · 15,00 € · Total 305,00 € |
| TVA | une seule mention, une fois par page qui affiche un prix, près du premier prix ou du total ; jamais « TTC » ni « HT » | « TVA non applicable, art. 293 B du CGI » (jusqu'au 31 déc. 2026 ; « art. L. 233-3 du CIBS » ensuite) |
| Date dans l'interface | jour, mois abrégé, année | 16 oct. 2026 · 10 oct. 2026 · mars 2024 (photo datée au mois) |
| Date dans une confirmation ou un e-mail | en toutes lettres, avec le jour | vendredi 16 octobre 2026 |
| Période | du … au … | du 30 oct. au 6 nov. |
| Heure | h, espaces insécables | 22 h 42 · 7 h 12 |
| Mois abrégés | janv., févr., mars, avr., mai, juin, juil., août, sept., oct., nov., déc. | — |
| Saisie d'une date (admin, et date de rencontre de `/bonjour`) | libre (« 14/10/2026 », « 14 oct. 2026 », « octobre 2026 »), relue en toutes lettres ; jamais `type=date` | — |
| Nombres | espace insécable des milliers | 1 280 px · 15 000 € |
| Formats de tirage | image puis feuille, en cm, signe × | image 40 × 60 cm · feuille 50 × 70 |
| Références (Plex Mono) | commande `C-2026-0007` ; facture par vendeur `S-2026-0002`, `J-2026-0001` ; exemplaire `6/15` ; inventaire `J26-003` ; fichier `R0004012.jpg` ; personne (carte « Bonjour ») `J-0001` | — |
| Numéro d'inventaire (UX-T-05) | donné à la première publication et jamais changé : initiale de l'auteur, deux chiffres de l'année de publication, rang de l'auteur dans l'année sur trois chiffres. Il se lit dans les données de la visionneuse (« Inventaire J26-003 ») et sur le certificat ; la position « 4 / 10 » sert à la navigation. Il ne se confond ni avec une facture (`J-2026-0001` : tiret, quatre chiffres d'année, quatre chiffres), ni avec une carte (`J-0001`) | `J26-003` · `S25-001` |
| Adresses publiques | slug du titre entier, en minuscules sans accents ; langue en préfixe (`/en`, `/de`), slug français partout | `/photo/miradouro-l-heure-doree` · `/photo/quai-7-h-12` · `/tirages/brume-sur-la-loire` · `/series/rue` · `/carnet/lisbonne-et-porto` · `/de/photo/belem-contre-jour` · `/galerie?regard=julien&serie=rue&ordre=recentes` |

## 3. États de l'administration

Un symbole, une couleur fixe, un mot ; jamais l'un sans les autres. Les filtres portent les noms des états.

| Symbole | Sens | Couleur | Photo | Billet | Accès privé | Commande |
|---|---|---|---|---|---|---|
| ○ | à faire, pas commencé | `--ink2` | Brouillon | Brouillon | Pas encore envoyé | En attente de paiement |
| ◐ | en cours, attend quelqu'un | `--accent-ink` | Proposée | Proposé · Programmé | Envoyé, pas ouvert | Payée, à préparer · Tirage lancé · Expédiée |
| ● | abouti | `--ok` | Publiée | Publié | Ouvert | Livrée |
| ▲ | demande votre attention | `--warn` | Accord à vérifier | Photo sans accord | Expire dans 3 jours | À vérifier (litige, retard) |
| ✕ | arrêté, fin sans suite | `--danger` | Dépubliée · Refusée | Retiré | Expiré · Révoqué | Annulée · Remboursée |

## 4. Référentiel des données fictives

Règles :

- **Une image = une photo, à jamais** : même titre, même auteur, même lieu, même date, même série dans toutes les maquettes. Il y a 26 images dans `_commun/photos/`, donc 26 photos ; un écran n'en montre jamais plus.
- Tailles : `photos/160/` pour les pastilles et listes de l'admin, `photos/480/` pour les vignettes, `photos/` (900 px) pour les grands formats, `photos/1600/` (1 600 px de côté long) pour les 14 dessins de la démo montrés en grand (ouverture de l'accueil, visionneuse, billet, couverture de série) ; toujours en `srcset`, avec un `sizes` juste, pour que le navigateur ne prenne la grande que s'il en a besoin. Les 12 dégradés du dépôt n'existent qu'en 900 px (pas de source plus grande) : on ne les montre pas plus large que 900 px à densité 1.
- **Une image chargée par emplacement** : quand l'image change avec l'appareil (ouverture de l'accueil, couverture d'une série), une `<picture>` et une `<source media>` ; jamais d'« image vide en ligne ».
- **Réservées aux grands formats** (trop sombres pour une couverture, un panier ou une vignette isolée) : Deux, minuit · Élise, contre-jour · Deux ombres. Dans les rangées, elles ne sont jamais en tête de rangée ni dans la première rangée de la Galerie : l'ordre « choisi par nous » (§ 4.2) les place en conséquence.
- Les douze premières sont les dégradés du dépôt (`seed/images`), les quatorze autres les dessins de la démo (`outils/demo-photos`) ; aucune photo réelle, aucun logo.

### 4.1 Les 26 photos

| Fichier | Inventaire | Rang | Titre | Auteur | Lieu | Date | Série | Statut | Format | Usage |
|---|---|---|---|---|---|---|---|---|---|---|
| `brume.webp` | `S25-001` | 1 | Brume sur la Loire | Sébastien | Anjou | mars 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `nuit.webp` | `J25-001` | 22 | Deux, minuit | Julien | Nantes | nov. 2023 | Rue | Publiée | verticale 2:3 | réservée aux grands formats |
| `dune.webp` | `S25-002` | 2 | Dernière heure | Sébastien | Erg Chebbi | avr. 2023 | Voyage | Publiée | horizontale 3:2 | toutes |
| `portrait.webp` | `J25-002` | 19 | Élise, contre-jour | Julien | Nantes | janv. 2025 | Portrait | Publiée | verticale 2:3 | réservée aux grands formats |
| `quai.webp` | `S25-003` | 3 | Quai, 7 h 12 | Sébastien | Angers | oct. 2024 | Rue | Publiée | horizontale 3:2 | toutes |
| `mer.webp` | `J25-003` | 4 | Ligne d’eau | Julien | Finistère | août 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ciel.webp` | `S25-004` | 5 | Le ciel s’est ouvert | Sébastien | Anjou | oct. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ruelle.webp` | `J25-004` | 7 | Passage, fin d’après-midi | Julien | Lisbonne | mai 2024 | Rue | Publiée | verticale 2:3 | toutes |
| `neige.webp` | `S25-005` | 8 | Silence blanc | Sébastien | Vercors | févr. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `foret.webp` | `J25-005` | 9 | Sous-bois | Julien | Chandelais | juin 2025 | Paysage | Publiée | verticale 2:3 | toutes |
| `lac.webp` | `S25-006` | 10 | Le lac ne dit rien | Sébastien | La Réunion | sept. 2024 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ombre.webp` | `J25-006` | 6 | Deux ombres | Julien | Paris | déc. 2023 | Rue | Publiée | horizontale 3:2 | réservée aux grands formats |
| `cais.webp` | `S26-001` | 11 | Cais do Sodré, marée basse | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `belem.webp` | `S26-002` | 12 | Belém, contre-jour | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tiago.webp` | `S26-003` | 13 | Tiago, marché do Bolhão | Sébastien | Porto | 11 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `foz.webp` | `S26-004` | 14 | Foz, la barre | Sébastien | Porto | 11 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tram.webp` | `J26-001` | 15 | Alfama, premier tram | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `linge.webp` | `J26-002` | 16 | Linge au balcon | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | horizontale 3:2 | toutes |
| `miradouro.webp` | `J26-003` | 17 | Miradouro, l’heure dorée | Julien | Lisbonne | 10 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ines.webp` | `J26-004` | 18 | Inês, rua dos Remédios | Julien | Lisbonne | 10 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `ribeira.webp` | `J26-005` | 20 | Ribeira, brume du fleuve | Julien | Porto | 11 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `escaliers.webp` | `J26-006` | 21 | Escaliers des Guindais | Julien | Porto | 11 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `pont.webp` | — | — | Pont Dom-Luís, le soir | Julien | Porto | 11 oct. 2026 | Voyage | Proposée | horizontale 3:2 | toutes |
| `ligny.webp` | — | — | Quai Ligny, soir | Sébastien | Angers | 14 oct. 2026 | Rue | Brouillon, accord à vérifier | horizontale 3:2 | toutes |
| `maine.webp` | — | — | Minoterie, brume du matin (titre en cours de saisie) | Sébastien | Angers | 14 oct. 2026 | — (Paysage en cours de saisie) | Brouillon (R0004012.jpg) | horizontale 3:2 | toutes |
| `reverberes.webp` | — | — | Réverbères, quai Ligny (titre prévu) | Sébastien | Angers | 14 oct. 2026 | — | Brouillon (R0004057.jpg) | horizontale 3:2 | toutes |


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

Données de « Miradouro, l'heure dorée » montrées par la visionneuse (MQ-04), d'après l'EXIF de la démo (DSCF2117.JPG) : Fujifilm X-T5 · 23 mm · 1/1000 s · f/11 · ISO 160 ; « J'aime 12 » (13 une fois aimée, MQ-00) ; 8 tirages disponibles sur 15 ; À proximité (distances depuis le miradouro da Graça) : Alfama, premier tram 600 m · Linge au balcon 700 m · Cais do Sodré, marée basse 2,4 km · Belém, contre-jour 6 km (même soir) ; « 4 photos à moins de 7 km ». Les EXIF des autres dessins sont ceux de la démo (Julien : Fujifilm X-T5, XF 23 mm ; Sébastien : Ricoh GR III, 18,3 mm).

Titres en allemand (maquettes en allemand) : Belém im Gegenlicht · Nebel über der Loire · Letzte Stunde · Wasserlinie · Miradouro, goldene Stunde · Der Himmel hat sich geöffnet · Die Treppen der Guindais · Alfama, die erste Straßenbahn · Tiago, Markt do Bolhão · Zwei, Mitternacht. Séries : Atlantik · Landschaft · Porträt · Straße · Reise. Les titres qui ne sont pas traduits gardent le titre français.

Légendes connues (démo) : Brume sur la Loire « Six heures, le fleuve fume encore. » · Dernière heure « Le vent efface les traces avant la nuit. » · Ligne d'eau « Une seule ligne, et tout le reste en dessous. » · Deux ombres « Nous deux, en passant. » · Cais do Sodré « Les pieux comptent les heures à la place de l'eau. » · Tiago « « Prenez-moi avec les oranges, c'est elles qui comptent. » » · Foz « Là où le fleuve devient l'océan, ça cogne. » · Alfama « Le 28 monte à vide ; la ville n'est pas encore levée. » · Linge au balcon « Toute la rue sèche au même fil. » · Miradouro « On attendait le soleil ; il a pris son temps, et nous aussi. » · Inês « Elle vend des fleurs depuis trente ans au même coin de rue. » · Ribeira « Le Douro garde sa brume jusqu'à dix heures. » · Escaliers « Deux cent soixante marches, et quelqu'un les monte toujours. » · Pont Dom-Luís « Les lumières s'allument d'une rive à l'autre. » Les textes de remplacement sont dans `MQ-00` (attribut `alt` de chaque vignette).

### 4.2 Comptes, séries, regards

- **Photos publiées : 22** (inventaire `S25-001` à `S26-004` et `J25-001` à `J26-006`) — Sébastien 10, Julien 12. Non publiées : 4 (Pont Dom-Luís ◐ Proposée ; Quai Ligny ○ Brouillon ▲ Accord à vérifier ; R0004012.jpg et R0004057.jpg ○ Brouillons à trier).
- **Séries** (couverture entre parenthèses) :

| Série | Photos | Sébastien | Julien | Couverture |
|---|---|---|---|---|
| Atlantique | 3 | 3 | 0 | Cais do Sodré, marée basse |
| Paysage | 5 | 3 | 2 | Brume sur la Loire |
| Portrait | 3 | 1 | 2 | Inês, rua dos Remédios |
| Rue | 7 | 1 | 6 | Linge au balcon |
| Voyage | 4 | 2 | 2 | Miradouro, l'heure dorée |

- Ordre « choisi par nous » de la galerie (colonne Rang du § 4.1) : celui de la démo, sauf les trois photos très sombres, déplacées pour n'ouvrir aucune rangée (contrôlé à 1 440, 1 024, 820 et 412 px) : Brume sur la Loire · Dernière heure · Quai, 7 h 12 · Ligne d'eau · Le ciel s'est ouvert · Deux ombres · Passage, fin d'après-midi · Silence blanc · Sous-bois · Le lac ne dit rien · Cais do Sodré · Belém (dans « Les deux », le diptyque « Même soir, deux regards » prend sa place et Miradouro quitte la sienne) · Tiago · Foz · Alfama · Linge au balcon · Miradouro · Inês · Élise, contre-jour · Ribeira · Escaliers des Guindais · Deux, minuit. « Plus récentes d'abord » : les photos d'octobre 2026 (Escaliers des Guindais en tête), puis les douze plus anciennes par date de publication.
- **L'ordre d'une série est celui de la galerie filtrée** : Rue = Quai, 7 h 12 · Deux ombres · Passage, fin d'après-midi · Alfama, premier tram · Linge au balcon · Escaliers des Guindais · Deux, minuit ; Portrait = Tiago · Élise · Inês.
- **Ouverture de l'accueil** : au bureau, 6 horizontales (Belém, contre-jour · Brume sur la Loire · Dernière heure · Ligne d'eau · Miradouro, l'heure dorée · Le ciel s'est ouvert) ; au téléphone, 4 verticales (Escaliers des Guindais · Alfama, premier tram · Tiago, marché do Bolhão · Deux, minuit). Promesse : « Deux regards, une même lumière. » ; sous-ligne : « Les photographies de Sébastien et Julien, d'Angers à Lisbonne et Porto. » (DE « Zwei Blicke, ein Licht. »).
- Choix du regard (accueil) : « Les deux · 22 photos, dans l'ordre que nous avons choisi » · « Sébastien · 10 photos · le matin, les quais, les fleuves » · « Julien · 12 photos · la rue, et ceux qui y passent ».
- Badges de l'admin (16 oct. 2026, compte de Julien) : Aujourd'hui ✕ 1 (le signalement du 14 oct. attend une réponse depuis plus de 48 h) · Personnes 1 (la demande de Claire Exemple) · Signalements 1 · À valider 1 (Pont Dom-Luís) · Boutique 1 (C-2026-0005 à préparer).

### 4.3 Carnets

4 billets publiés (page 1 sur 1 ; la pagination n'apparaît qu'au-delà de 12 billets), 1 brouillon.

| Billet | Rubrique | Auteur | Publié le | Lecture | Couverture | Photos, dans l'ordre |
|---|---|---|---|---|---|---|
| Lisbonne et Porto (DE « Lissabon und Porto ») · `/carnet/lisbonne-et-porto` | Voyages | Sébastien et Julien | 14 oct. 2026, mis à jour le 15 oct. | 4 min | Alfama, premier tram | 1 Alfama, premier tram · 2 Linge au balcon · 3 Cais do Sodré, marée basse · 4 Miradouro, l'heure dorée · 5 Belém, contre-jour · 6 Inês, rua dos Remédios · 7 Tiago, marché do Bolhão · 8 Ribeira, brume du fleuve · 9 Escaliers des Guindais · 10 Foz, la barre (diptyque « Même soir, deux regards » : 4 et 5 ; deux journées : samedi 10, dimanche 11 octobre) |
| Inês, ou comment demander une photo · `/carnet/ines-ou-comment-demander-une-photo` | Notes d'atelier | Julien | 15 oct. 2026 | 3 min | Inês, rua dos Remédios | Inês, rua dos Remédios |
| Pourquoi nous ne recadrons pas · `/carnet/pourquoi-nous-ne-recadrons-pas` | Notes d'atelier | Sébastien | 2 oct. 2026 | 4 min | Brume sur la Loire | Brume sur la Loire · Ligne d'eau |
| Tirer sur Photo Rag · `/carnet/tirer-sur-photo-rag` | Notes d'atelier | Sébastien | 25 sept. 2026 | 4 min | Silence blanc | Silence blanc |
| Angers, un soir d'octobre (○ brouillon, commencé le 15 oct. à 22 h 10 ; 1 min de lecture) | Voyages | Sébastien | — | — | — | Quai, 7 h 12 · Quai Ligny, soir (accord à vérifier) · Réverbères, quai Ligny |

Le billet « Lisbonne et Porto » remplace la page Voyage du même nom de la démo ; son texte d'introduction est celui du voyage, tel que la démo l'a corrigé (`outils/demo-photos/retouche.mjs`) : « Deux jours, deux regards, un même océan. Sébastien a cherché la mer, Julien les gens : du premier tram de l'Alfama à la barre de Foz, là où le Douro rencontre l'Atlantique. » (DE « Zwei Tage, zwei Blicke, ein Ozean. ») Deux jours, comme les photos : samedi 10 octobre à Lisbonne (6 photos), dimanche 11 octobre à Porto (4 photos). Le temps de lecture est le même dans les trois langues. Flux : `/carnet/flux.xml` (et `/en/…`, `/de/…`).

### 4.4 Tirages : offre, stocks, numéros

- **Offre** : 9 photos. Chacune en édition de **15 exemplaires, tous formats confondus**, numérotés dans l'ordre des ventes. Petit format (image 24 × 36 cm, feuille 30 × 40) **180 €** ; grand format (image 40 × 60 cm, feuille 50 × 70) **290 €**. Hahnemühle Photo Rag 308 g, signé, certificat. Livraison à plat, suivie : **15 €** en France métropolitaine (du 30 oct. au 6 nov. pour une commande du 16 oct.), **25 €** dans l'UE (du 3 au 10 nov.). Boutique ouverte le 1er oct. 2026 ; les premiers numéros ont été vendus en exposition (Angers, juin 2026).

| Tirage | Vendeur | Numéros vendus | Réservé | Disponibles | Prochain numéro |
|---|---|---|---|---|---|
| Brume sur la Loire | Sébastien | 1 à 4 (exposition), 5 (C-2026-0002) | — | 10 | 6 |
| Cais do Sodré, marée basse | Sébastien | 1 (exposition) | — | 14 | 2 |
| Foz, la barre | Sébastien | 1 (exposition) | 2 (C-2026-0006, jusqu'à 9 h 47) | 13 | 3 |
| Silence blanc | Sébastien | 1 et 2 (exposition), 3 (C-2026-0001) | — | 12 | 4 |
| Le ciel s'est ouvert | Sébastien | 1 à 15 | — | **0 : épuisé** | — |
| Miradouro, l'heure dorée | Julien | 1 à 6, 7 (C-2026-0005) | — | 8 | 8 |
| Ribeira, brume du fleuve | Julien | 1 à 3, 4 (C-2026-0005) | — | 11 | 5 |
| Escaliers des Guindais | Julien | 1 à 4, 5 (C-2026-0003) | — | 10 | 6 |
| Sous-bois | Julien | 1 | — | 14 | 2 |

Le certificat porte le numéro d'inventaire de la photo (Brume sur la Loire : `S25-001` ; Escaliers des Guindais : `J26-006`), le numéro d'exemplaire et les dates de prise de vue et de tirage. « Le ciel s'est ouvert » est l'exemple d'édition épuisée (bouton indisponible, raison écrite à côté ; épuisé entre l'ajout et le paiement dans l'état d'erreur du panier).

Photos non vendues (ni tirage ni bouton) : les portraits sans accord « tirage » (Tiago : site seulement) et toutes les autres. Inês a donné son accord pour un tirage, mais il n'est pas au catalogue.

### 4.5 Commandes (au vendredi 16 oct. 2026, 10 h)

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

Lien : `https://www.nicephos.art/g/<jeton>` (exemple de Lucie : `/g/6Me5pScUZIQhW-wezlKchJ9h3k7EDpzm`) ; mot de passe de 12 caractères en trois groupes (exemple montré : `k7qm p3xw 9tra`), donné par un autre canal (SMS) ; après le bon mot de passe : `/prive/<id>` — `/prive/7Hk2Qp9xLm4R` pour « Lisbonne et Porto, planche de travail » (DE « Lissabon und Porto, Arbeitsauswahl »), `/prive/Rm8vT2kq5Wz1` pour « Quai Ligny, 14 octobre ». Vues : `?vue=favoris`. Après 5 refus, pause de sécurité (« réessayez à 13 h 58 ») ; Lucie entre ensuite, à 14 h 05. Ses 4 favoris sont envoyés à Julien le 16 oct. à 15 h 20 ; elle demande ensuite une licence pour « Miradouro, l'heure dorée » (MQ-06, `/droits/demande?photo=miradouro-l-heure-doree`). Claire télécharge : archive ZIP de 2,6 Mo (les 2 photos en JPEG de 2 048 px) ou une photo, 1,3 Mo. L'accès de Lucie : créé le 16 oct., « dans 30 jours, le 15 nov. » par défaut, porté au 30 nov. (fermeture de la galerie).

### 4.7 Personnes

| Personne | Rôle dans les maquettes |
|---|---|
| Sébastien Exemple | Photographe (préfixe S). Vit à Angers. Matin, quais, fleuves, grand angle. |
| Julien Exemple | Administrateur (préfixe J), directeur de la publication. Photographe de rue ; demande toujours l'accord. |
| Camille Exemple | Relectrice (traductions anglaises et allemandes). |
| Inês Exemplo | Fleuriste, Lisbonne. Rencontre J-0001 du 10 oct. 2026 : accord signé pour le site, Instagram, un tirage et son prénom. |
| Tiago Exemplo | Marchand de fruits, Porto. Rencontre S-0001 du 11 oct. 2026 : accord pour le site seulement. |
| Claire Exemple | Photographiée le 14 oct. à 18 h 15 quai Ligny (avec Hugo) ; demande envoyée par `/bonjour` le 15 oct. : accord en ligne, à vérifier ; veut recevoir la photo. Cliente du panier en cours. |
| Hugo Exemple | L'ami de Claire sur Quai Ligny, soir ; pas encore d'accord. Client de la commande annulée C-2026-0004. |
| Anna Beispiel | Cliente allemande (Fribourg-en-Brisgau), commande C-2026-0005, langue DE. |
| Marc Exemple · Paul Exemple · Léa Exemple | Clients (Nantes, Lyon, Bruxelles). |
| Lucie Exemple | Éditrice (Éditions du Fleuve), invitée de la galerie privée « Lisbonne et Porto, planche de travail ». |

Coordonnées légales (démo) : Sébastien Exemple et Julien Exemple, 12 rue de l'Exemple, 49000 Angers ; contact@example.org ; +33 1 99 00 12 34. Les adresses e-mail des personnes sont en `prenom.nom@example.org`, sans accent : `sebastien.exemple@`, `julien.exemple@`, `claire.exemple@`, `lucie.exemple@`, `anna.beispiel@`, `ines.exemplo@example.org`. Adresse de Claire : 5 rue des Exemples, 49100 Angers.

Camille Exemple, relectrice : compte désactivé le 2 oct. 2026 ; ses 14 traductions restent sur le site (MQ-09).

### 4.8 Écarts avec la démo (à corriger dans la démo, pas dans les maquettes)

- « Quai, 7h12 » s'écrit « Quai, 7 h 12 ».
- Élise, contre-jour : la démo donne le lieu « Atelier », qui se confond avec le thème et la rubrique « Notes d'atelier » ; le référentiel dit « Nantes ».
- La démo n'a pas de titre pour R0004012.jpg ni R0004057.jpg (brouillons à trier) ; le référentiel fixe les titres que les maquettes saisissent.
- La démo a un voyage « Lisbonne et Porto » ; les maquettes en font un billet des Carnets.
- La démo ne sert ni la boutique, ni les galeries privées, ni les carnets : leurs données sont propres au référentiel.
- La démo numérote les photos par leur rang (« N°11 »), qui change à chaque réordonnancement ; les maquettes donnent un numéro d'inventaire stable (UX-T-05, § 2).
- L'ordre « choisi par nous » des maquettes diffère de celui de la démo pour trois photos sombres (§ 4.2).
- Le premier dessin de l'ouverture de l'accueil est Belém, contre-jour (un dessin de la démo, disponible en 1 600 px), et non Le ciel s'est ouvert (dégradé de 900 px).

### 4.9 Administration : données des maquettes MQ-07 à MQ-10 et MQ-18 à MQ-20

- Journée de référence : vendredi 16 oct. 2026, compte de Julien (administrateur) ; le soir, Sébastien (photographe) travaille sur son brouillon. Heures montrées : lot de trois brouillons enregistré à 21 h 34 (MQ-08) ; « Mon compte » enregistré à 22 h 40 (MQ-07) ; billet « Angers, un soir d'octobre » enregistré à 22 h 42, traduction proposée à 22 h 44 (MQ-20) ; publication Instagram de « Cais do Sodré » à 22 h 50, légende rétablie « comme à 22 h 51 », suggestion de description demandée à 22 h 55 et arrivée à 22 h 56, capture de MQ-09 à 22 h 58.
- Fichiers des brouillons d'Angers (EXIF de la démo) : `R0004012.jpg` Minoterie, brume du matin (14 oct., 6 h 55) · `R0004046.jpg` Quai Ligny, soir (18 h 10) · `R0004057.jpg` Réverbères, quai Ligny (18 h 40).
- App de terrain (MQ-10) : rencontre d'Inês, carte `J-0001`, à 19 h 20 ; prochaine carte `J-0002` ; adresse imprimée sur la carte : `nicephos.art/bonjour/j` (puis le numéro) ; session de terrain ouverte jusqu'à 3 h 24.
- Galeries privées (MQ-18) et commandes (MQ-19) : les données du § 4.5 et du § 4.6.

### 4.10 Arbitrages avec l'étude des projets (docs/etudes/blog-galeries-boutique.md)

- **Carnet** : adresses de l'étude (`/carnet`, B1 ; slug français dans toutes les langues, B73) ; le libellé public reste « Carnets ». L'administration suit la même règle : `/admin/carnet` (B1).
- **Galeries privées** : « Accès » (et non « partage ») ; « favoris » (et non « sélectionnés ») ; l'invitation part à la création de l'accès ; une sélection envoyée se reprend (`POST /prive/:pid/selection/reprendre`, à ajouter à l'annexe des routes : il contredit G50, qui la figeait).
- **Boutique** : motif de remboursement libre ; le suivi Colissimo est un numéro de 13 signes ; un exemplaire revenu (remboursement, annulation) redevient disponible (S7 aligné sur S49) ; D16 en lecture seule.
- **Formulaires** : la date de rencontre de `/bonjour` se saisit en champ libre (comme dans l'admin), et non en `type=date` : écart voulu avec le code actuel.
- **Routes à créer** : `/droits/demande?photo=<slug>` (demande de licence préremplie) et `/instagram` (MQ-06).
- **Références de commande** : les maquettes écrivent `C-2026-0007` pour la lisibilité ; l'étude (S55) veut une référence aléatoire d'au moins 50 bits (`C-` et 11 caractères). À trancher avant le lot boutique : soit une référence lisible et un jeton séparé, soit la référence aléatoire partout.
- **Adresse de la boutique** : les maquettes et ce lexique écrivent `/tirages` (le mot public) ; l'étude écrit `/boutique` (annexe des routes). À aligner dans l'étude.
