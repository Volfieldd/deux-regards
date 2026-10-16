# Lexique et données fictives des maquettes

Référence commune des vingt maquettes (MQ-01 à MQ-20), avec la planche [MQ-00](MQ-00-direction-artistique.html). Une maquette n'invente ni un mot ni une donnée : elle prend ici ce dont elle a besoin. Ce qui manque s'ajoute ici d'abord.

Les données suivent l'instance de démonstration (http://127.0.0.1:3091) quand elle les a : mêmes photos, mêmes titres, mêmes comptes de séries. Les écarts sont listés à la fin.

## 1. Lexique

### Site public

| On écrit | Ce que cela désigne | On n'écrit plus |
|---|---|---|
| **Tirages** | La boutique : entrée du menu (DE « Kunstdrucke », EN « Prints »), pages `/tirages`, groupe du pied de page. | « Boutique » côté public ; « Tirages et licences » |
| **un tirage** | Un exemplaire d'art signé et numéroté d'une photo. | « print », « produit » |
| **Droits et licences** | La page `/droits` et sa demande de licence (presse, entreprise, usage hors catalogue). | « Droits, tirages et licences » |
| **Les deux · Sébastien · Julien** | Le choix du regard, dans cet ordre, partout (galerie, séries, carnets). | « Tous », « Les 2 », « Nous » |
| **Galerie** | Toutes les photos publiées, en rangées. | « Toutes les photos », « Toutes les séries » |
| **Séries** | Les ensembles d'auteur (Atlantique, Paysage, Portrait, Rue, Voyage). | « Catégories », « Thèmes » |
| **Carnets** · **un billet** | La rubrique de textes (DE « Reisetagebücher », EN « Notebooks ») et chacun de ses textes. Deux rubriques : Voyages, Notes d'atelier. | « Blog », « Journal » (pris par l'admin), « Voyages » comme entrée de menu |
| **J'aime** | Public : un visiteur apprécie une photo. Cœur, bouton bascule, compteur affiché dès 1. | « Favori » sur le site public ; « 0 j'aime » |
| **Favori** | Galerie privée : l'invité met une photo dans sa sélection. Étoile, bouton bascule ; « 4 favoris » dans l'en-tête de la galerie. | « J'aime » en galerie privée ; « Sélectionner » |
| **Galerie privée** | Un espace privé de photos, ouvert par un lien et un mot de passe. | « Espace client », « Album » |
| **Panier (2)** | Le panier et son nombre de tirages, en toutes lettres au bureau ; l'icône et le nombre au téléphone (nom lu : « Panier, 2 tirages »). | « Mon panier », « Caddie » |
| **Payer 305,00 €** | Le bouton final du tunnel répète le montant. En allemand, l'obligation légale : « Zahlungspflichtig bestellen ». | « Valider », « Continuer » |
| **Renoncer à une commande** | La fonction de rétractation (pied de page, page de suivi). | « Retour », « Annuler ma commande » après paiement |
| **Retour au panier** · **← Lisbonne et Porto** | Un retour dit toujours où il mène. | « ← Retour », « RETOUR AU PANIER » |
| **Menu** | Le bouton du menu au téléphone ; le mot ne change pas quand il est ouvert (l'icône devient ✕). | « Fermer » à la place de « Menu » |

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
| Prix en vitrine (pages Tirages, visionneuse) | euros entiers, espace insécable avant € | 180 € · 290 € · « Tirage : à partir de 180 € » |
| Prix au panier, dans le tunnel, la commande, la facture, l'admin | deux décimales, virgule | 290,00 € · 15,00 € · Total 305,00 € |
| TVA | une seule mention, une fois par page qui affiche un prix, près du premier prix ou du total ; jamais « TTC » ni « HT » | « TVA non applicable, art. 293 B du CGI » (jusqu'au 31 déc. 2026 ; « art. L. 233-3 du CIBS » ensuite) |
| Date dans l'interface | jour, mois abrégé, année | 16 oct. 2026 · 10 oct. 2026 · mars 2024 (photo datée au mois) |
| Date dans une confirmation ou un e-mail | en toutes lettres, avec le jour | vendredi 16 octobre 2026 |
| Période | du … au … | du 30 oct. au 6 nov. |
| Heure | h, espaces insécables | 22 h 42 · 7 h 12 |
| Mois abrégés | janv., févr., mars, avr., mai, juin, juil., août, sept., oct., nov., déc. | — |
| Saisie d'une date (admin) | libre (« 14/10/2026 », « 14 oct. 2026 », « octobre 2026 »), relue en toutes lettres | — |
| Nombres | espace insécable des milliers | 1 280 px · 15 000 € |
| Formats de tirage | image puis feuille, en cm, signe × | image 40 × 60 cm · feuille 50 × 70 |
| Références (Plex Mono) | commande `C-2026-0007` ; facture par vendeur `S-2026-0002`, `J-2026-0001` ; exemplaire `4/15` ; fichier `R0004012.jpg` ; personne `J-0001` | — |
| Numéro de photo | « N°19 », dans la visionneuse seulement | — |

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
- Tailles : `photos/160/` pour les pastilles et listes de l'admin, `photos/480/` pour les vignettes, `photos/` (900 px) pour les grands formats ; `srcset` comme le site.
- **Réservées aux grands formats** (trop sombres pour une couverture, un panier ou une vignette isolée) : Deux, minuit · Élise, contre-jour · Deux ombres. Dans la galerie complète, elles restent à leur place.
- Les douze premières sont les dégradés du dépôt (`seed/images`), les quatorze autres les dessins de la démo (`outils/demo-photos`) ; aucune photo réelle, aucun logo.

### 4.1 Les 26 photos

| Fichier | N° | Titre | Auteur | Lieu | Date | Série | Statut | Format | Usage |
|---|---|---|---|---|---|---|---|---|---|
| `brume.webp` | 01 | Brume sur la Loire | Sébastien | Anjou | mars 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `nuit.webp` | 02 | Deux, minuit | Julien | Nantes | nov. 2023 | Rue | Publiée | verticale 2:3 | réservée aux grands formats |
| `dune.webp` | 03 | Dernière heure | Sébastien | Erg Chebbi | avr. 2023 | Voyage | Publiée | horizontale 3:2 | toutes |
| `portrait.webp` | 04 | Élise, contre-jour | Julien | Nantes | janv. 2025 | Portrait | Publiée | verticale 2:3 | réservée aux grands formats |
| `quai.webp` | 05 | Quai, 7 h 12 | Sébastien | Angers | oct. 2024 | Rue | Publiée | horizontale 3:2 | toutes |
| `mer.webp` | 06 | Ligne d’eau | Julien | Finistère | août 2024 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ciel.webp` | 07 | Le ciel s’est ouvert | Sébastien | Anjou | oct. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `ruelle.webp` | 08 | Passage, fin d’après-midi | Julien | Lisbonne | mai 2024 | Rue | Publiée | verticale 2:3 | toutes |
| `neige.webp` | 09 | Silence blanc | Sébastien | Vercors | févr. 2025 | Paysage | Publiée | horizontale 3:2 | toutes |
| `foret.webp` | 10 | Sous-bois | Julien | Chandelais | juin 2025 | Paysage | Publiée | verticale 2:3 | toutes |
| `lac.webp` | 11 | Le lac ne dit rien | Sébastien | La Réunion | sept. 2024 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ombre.webp` | 12 | Deux ombres | Julien | Paris | déc. 2023 | Rue | Publiée | horizontale 3:2 | réservée aux grands formats |
| `cais.webp` | 13 | Cais do Sodré, marée basse | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `belem.webp` | 14 | Belém, contre-jour | Sébastien | Lisbonne | 10 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tiago.webp` | 15 | Tiago, marché do Bolhão | Sébastien | Porto | 11 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `foz.webp` | 16 | Foz, la barre | Sébastien | Porto | 11 oct. 2026 | Atlantique | Publiée | horizontale 3:2 | toutes |
| `tram.webp` | 17 | Alfama, premier tram | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `linge.webp` | 18 | Linge au balcon | Julien | Lisbonne | 10 oct. 2026 | Rue | Publiée | horizontale 3:2 | toutes |
| `miradouro.webp` | 19 | Miradouro, l’heure dorée | Julien | Lisbonne | 10 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `ines.webp` | 20 | Inês, rua dos Remédios | Julien | Lisbonne | 10 oct. 2026 | Portrait | Publiée | verticale 2:3 | toutes |
| `ribeira.webp` | 21 | Ribeira, brume du fleuve | Julien | Porto | 11 oct. 2026 | Voyage | Publiée | horizontale 3:2 | toutes |
| `escaliers.webp` | 22 | Escaliers des Guindais | Julien | Porto | 11 oct. 2026 | Rue | Publiée | verticale 2:3 | toutes |
| `pont.webp` | — | Pont Dom-Luís, le soir | Julien | Porto | 11 oct. 2026 | Voyage | Proposée | horizontale 3:2 | toutes |
| `ligny.webp` | — | Quai Ligny, soir | Sébastien | Angers | 14 oct. 2026 | Rue | Brouillon, accord à vérifier | horizontale 3:2 | toutes |
| `maine.webp` | — | Minoterie, brume du matin (titre en cours de saisie) | Sébastien | Angers | 14 oct. 2026 | — (Paysage en cours de saisie) | Brouillon (R0004012.jpg) | horizontale 3:2 | toutes |
| `reverberes.webp` | — | Réverbères, quai Ligny (titre prévu) | Sébastien | Angers | 14 oct. 2026 | — | Brouillon (R0004057.jpg) | horizontale 3:2 | toutes |


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

Légendes connues (démo) : Brume sur la Loire « Six heures, le fleuve fume encore. » · Dernière heure « Le vent efface les traces avant la nuit. » · Ligne d'eau « Une seule ligne, et tout le reste en dessous. » · Deux ombres « Nous deux, en passant. » · Cais do Sodré « Les pieux comptent les heures à la place de l'eau. » · Tiago « « Prenez-moi avec les oranges, c'est elles qui comptent. » » · Foz « Là où le fleuve devient l'océan, ça cogne. » · Alfama « Le 28 monte à vide ; la ville n'est pas encore levée. » · Linge au balcon « Toute la rue sèche au même fil. » · Miradouro « On attendait le soleil ; il a pris son temps, et nous aussi. » · Inês « Elle vend des fleurs depuis trente ans au même coin de rue. » · Ribeira « Le Douro garde sa brume jusqu'à dix heures. » · Escaliers « Deux cent soixante marches, et quelqu'un les monte toujours. » · Pont Dom-Luís « Les lumières s'allument d'une rive à l'autre. » Les textes de remplacement sont dans `MQ-00` (attribut `alt` de chaque vignette).

### 4.2 Comptes, séries, regards

- **Photos publiées : 22** (N°01 à N°22) — Sébastien 10, Julien 12. Non publiées : 4 (Pont Dom-Luís ◐ Proposée ; Quai Ligny ○ Brouillon ▲ Accord à vérifier ; R0004012.jpg et R0004057.jpg ○ Brouillons à trier).
- **Séries** (couverture entre parenthèses) :

| Série | Photos | Sébastien | Julien | Couverture |
|---|---|---|---|---|
| Atlantique | 3 | 3 | 0 | Cais do Sodré, marée basse |
| Paysage | 5 | 3 | 2 | Brume sur la Loire |
| Portrait | 3 | 1 | 2 | Inês, rua dos Remédios |
| Rue | 7 | 1 | 6 | Linge au balcon |
| Voyage | 4 | 2 | 2 | Miradouro, l'heure dorée |

- Ordre « Sélection » de la galerie : N°01 à N°22. « Plus récentes d'abord » : N°22 à N°13, puis N°12 à N°01 par date de publication.
- Badges de l'admin (16 oct. 2026, compte de Julien) : Aujourd'hui ✕ 1 (le signalement du 14 oct. attend une réponse depuis plus de 48 h) · Personnes 1 (la demande de Claire Exemple) · Signalements 1 · À valider 1 (Pont Dom-Luís) · Boutique 1 (C-2026-0005 à préparer).

### 4.3 Carnets

4 billets publiés (page 1 sur 1), 1 brouillon.

| Billet | Rubrique | Auteur | Publié le | Photos, dans l'ordre |
|---|---|---|---|---|
| Lisbonne et Porto | Voyages | Sébastien et Julien | 14 oct. 2026 | 1 Alfama, premier tram · 2 Linge au balcon · 3 Cais do Sodré, marée basse · 4 Miradouro, l'heure dorée · 5 Belém, contre-jour · 6 Inês, rua dos Remédios · 7 Tiago, marché do Bolhão · 8 Ribeira, brume du fleuve · 9 Escaliers des Guindais · 10 Foz, la barre (diptyque « Même soir, deux regards » : 4 et 5 ; deux journées : samedi 10, dimanche 11 octobre) |
| Inês, ou comment demander une photo | Notes d'atelier | Julien | 15 oct. 2026 | Inês, rua dos Remédios |
| Pourquoi nous ne recadrons pas | Notes d'atelier | Sébastien | 2 oct. 2026 | Brume sur la Loire · Ligne d'eau |
| Tirer sur Photo Rag | Notes d'atelier | Sébastien | 25 sept. 2026 | Silence blanc |
| Angers, un soir d'octobre (○ brouillon, commencé le 15 oct. à 22 h 10) | Voyages | Sébastien | — | Quai, 7 h 12 · Quai Ligny, soir (accord à vérifier) · Réverbères, quai Ligny |

Le billet « Lisbonne et Porto » remplace la page Voyage du même nom de la démo ; son texte d'introduction est celui du voyage (« Quatre jours, deux regards, un même océan… »).

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

Photos non vendues (ni tirage ni bouton) : les portraits sans accord « tirage » (Tiago : site seulement) et toutes les autres. Inês a donné son accord pour un tirage, mais il n'est pas au catalogue.

### 4.5 Commandes (au vendredi 16 oct. 2026, 10 h)

Une commande par vendeur ; un panier qui mêle les deux photographes donne deux commandes et deux paiements, dans le même écran.

| Commande | Date | Client | Vendeur | Contenu | Montant | État | Facture |
|---|---|---|---|---|---|---|---|
| C-2026-0001 | 3 oct. | Marc Exemple, Nantes | Sébastien | Silence blanc, petit, ex. 3/15 | 180,00 + 15,00 = 195,00 € | ● Livrée le 10 oct. | S-2026-0001 |
| C-2026-0002 | 5 oct. | Paul Exemple, Lyon | Sébastien | Brume sur la Loire, grand, ex. 5/15 | 290,00 + 15,00 = 305,00 € | ● Livrée le 12 oct. | S-2026-0002 |
| C-2026-0003 | 9 oct. | Léa Exemple, Bruxelles | Julien | Escaliers des Guindais, petit, ex. 5/15 | 180,00 + 25,00 = 205,00 € | ◐ Expédiée le 14 oct. (Colissimo) | J-2026-0001 |
| C-2026-0004 | 12 oct. | Hugo Exemple, Angers | Sébastien | Cais do Sodré, petit | 195,00 € | ✕ Annulée (paiement non abouti, exemplaire libéré) | — |
| C-2026-0005 | 15 oct., 21 h 04 | Anna Beispiel, Fribourg-en-Brisgau (commande en allemand) | Julien | Ribeira, grand, ex. 4/15 · Miradouro, grand, ex. 7/15 | 290,00 + 290,00 + 25,00 = 605,00 € | ◐ Payée, à préparer | à l'expédition (J-2026-0002) |
| C-2026-0006 | 16 oct., 9 h 12 | Marc Exemple, Nantes | Sébastien | Foz, la barre, grand (numéro montré après paiement) | 290,00 + 15,00 = 305,00 € | ○ En attente de paiement | — |

Panier en cours (maquettes du panier et du tunnel) : **Claire Exemple**, Angers — bloc Sébastien : Brume sur la Loire, petit format, 180,00 € + livraison 15,00 € = **195,00 €** ; bloc Julien : Escaliers des Guindais, grand format, 290,00 € + 15,00 € = **305,00 €** (« Payer 305,00 € »). Après paiement : C-2026-0007 (Julien, Escaliers ex. 6/15), puis C-2026-0008 (Sébastien, Brume ex. 6/15).

### 4.6 Galeries privées et accès

| Galerie | Créée par | Pour | Photos | Droits | Créée · expire | État |
|---|---|---|---|---|---|---|
| Lisbonne et Porto, planche de travail | Julien, 16 oct. 2026 | Lucie Exemple, Éditions du Fleuve | 11 : les 10 du carnet et Pont Dom-Luís, le soir | voir et choisir (favoris), sans téléchargement | 16 oct. · 30 nov. 2026 | ● Ouvert le 16 oct. à 14 h 05 · 4 favoris (Alfama, Miradouro, Ribeira, Pont Dom-Luís) |
| Quai Ligny, 14 octobre | Sébastien, 15 oct. 2026 | Claire Exemple (et Hugo Exemple) | 2 : Quai Ligny, soir · Réverbères, quai Ligny | voir et télécharger | 15 oct. · 14 nov. 2026 | ● Ouvert le 15 oct. à 20 h 31 |
| Angers, juin 2026 | Sébastien, 2 juin 2026 | Marc Exemple | 3 : Brume sur la Loire · Quai, 7 h 12 · Silence blanc | voir seulement | 2 juin · 30 sept. 2026 | ✕ Expiré |

Lien : `https://www.nicephos.art/g/<jeton>` ; mot de passe de 12 caractères, donné par un autre canal ; après le bon mot de passe : `/prive/<id>`.

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

Coordonnées légales (démo) : Sébastien Exemple et Julien Exemple, 12 rue de l'Exemple, 49000 Angers ; contact@example.org ; +33 1 99 00 12 34. Les adresses e-mail des personnes sont en `prenom.nom@example.org`.

### 4.8 Écarts avec la démo (à corriger dans la démo, pas dans les maquettes)

- « Quai, 7h12 » s'écrit « Quai, 7 h 12 ».
- Élise, contre-jour : la démo donne le lieu « Atelier », qui se confond avec le thème et la rubrique « Notes d'atelier » ; le référentiel dit « Nantes ».
- La démo n'a pas de titre pour R0004012.jpg ni R0004057.jpg (brouillons à trier) ; le référentiel fixe les titres que les maquettes saisissent.
- La démo a un voyage « Lisbonne et Porto » ; les maquettes en font un billet des Carnets.
- La démo ne sert ni la boutique, ni les galeries privées, ni les carnets : leurs données sont propres au référentiel.
