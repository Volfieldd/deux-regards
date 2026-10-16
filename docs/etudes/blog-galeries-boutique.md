# Étude : carnet (blog), galeries privées et boutique

| | |
|---|---|
| Statut | Étude, rien n'est développé. Le code n'a pas été modifié. |
| Date | 15 octobre 2026. Toutes les sources ont été consultées ce jour-là. Relue le 16 octobre 2026 (contre-vérification juridique, fiscale et tarifaire ; revue de complétude et de conception) : les corrections citent des sources consultées ce jour-là. |
| Base lue | commit `7f3727f` (branche de `main` à `4042eaa`), version `1.87.0`. Depuis, `main` est à `c88632d` (version 1.88.0, PR #88) : les références à `server/routes/admin.js` sont recalées sur `c88632d` (une ligne de plus en tête du fichier, à partir de la ligne 4). Branche rebasée sur `c88632d`. Les corrections de la revue de code et de sécurité du 16 octobre décaleront encore des numéros de ligne et règlent peut-être certains constats C : à revoir au début de la phase 34. |
| Demande | « Note à faire plus tard : blog & section / photos privées protégées par mot de passe (entre admin avec authentification zitadel et avec des personnes choisies disposant du lien -temporaire et du mot de passe), prévoit aussi un module de vente panier / achat … je veux une étude qui va jusqu'au paiement et à la facturation. » (reprise dans `PLAN.md`, « Plus tard ») |
| Périmètre | Blog ; photos et galeries privées ; boutique (offre, panier, commande, expédition) ; paiement ; facturation et comptabilité ; cadre juridique et fiscal ; architecture dans le code ; plan ; coûts ; risques ; décisions |
| Annexes | [Cadre juridique et fiscal](annexe-cadre-juridique-fiscal.md) · [Paiement et facturation](annexe-paiement-facturation.md) · [Galeries privées : sécurité](annexe-galeries-privees-securite.md) |
| Références | `fichier:ligne` depuis la racine du dépôt. Sources externes : `[n]`, liste numérotée en fin de document (les annexes gardent les mêmes numéros). |
| Avertissement | Ce n'est ni un conseil juridique ni un conseil comptable. Les points « à confirmer » se valident avec un expert-comptable, l'URSSAF ou un juriste avant la première vente. |

**Niveaux des exigences**

| Niveau | Sens |
|---|---|
| **O** | Obligatoire : imposé par un texte cité. |
| **I** | Impératif : règle écrite du projet (`docs/wiki/Développer.md`) ou condition de sécurité. Sans lui, le code est faux ou vulnérable. |
| **R** | Recommandé : bonne pratique. Un écart reste possible, en connaissant le prix. |
| **C** | Choix des auteurs. Une valeur par défaut est proposée. |

**Identifiants** : `B` carnet, `G` galeries privées, `S` boutique, `P` paiement, `F` facturation, `J` obligations juridiques et fiscales hors code, `SO` socle commun, `C` constats de sécurité relevés dans le code actuel, `D` décisions des auteurs, `M` menaces (annexe galeries), `T` tests (annexes).

---

## En bref

- **Recommandation.** Dans l'ordre : un socle de sécurité commun (phase 34), le Carnet (35-36), les galeries privées (37a à 39), la boutique (40 à 43). La boutique n'ouvre qu'après les démarches hors code : statut, SIREN, plateforme de factures, médiateur, éco-organisme, relais d'e-mails sous contrat ; et seulement avec `DATA_KEY` en place.
- **Carnet.** Billets en Markdown restreint rendus côté serveur, trois langues publiées une par une, flux Atom, pas de commentaires, aucun cookie ni script de plus.
- **Galeries privées.** Lien personnel (jeton de 192 bits, gardé haché) et mot de passe généré (12 caractères, environ 59 bits, scrypt ; la CNIL demande 50 bits avec blocage des essais [48]), donné par un autre canal ; chaque essai compté avant le calcul. L'équipe entre avec sa session Zitadel, chacun limité à ses propres espaces. Images servies par une route contrôlée, jamais par `/media/`, sans position GPS. Coût : 0 €.
- **Boutique.** Tirages d'art signés et numérotés (30 exemplaires au plus par photo, tous formats confondus [65]), tirés par un laboratoire de l'UE, signés à la main, envoyés à plat en France et dans l'UE. Achat sans compte et sans JavaScript.
- **Paiement.** Stripe Checkout en page hébergée (cartes de l'EEE : 1,5 % + 0,25 €, sans abonnement [142]) ; Mollie en alternative. Webhook signé, une adresse par vendeur, et rapprochement périodique ; confirmation et accusé de rétractation envoyés par une boîte d'envoi qui réessaie.
- **Factures.** Produites par le site (PDF/A-3, une série par vendeur, une facture par envoi, figées). Réception électronique obligatoire depuis le 1er septembre 2026 (plateforme agréée gratuite) ; e-reporting des ventes aux particuliers à partir du 1er septembre 2027, tous les bimestres civils en franchise, ventes dans l'UE déclarées par OSS comprises [96], [97], [109], [111].
- **Statut.** Chacun vend ses œuvres en son nom ; tirages originaux en artiste-auteur (micro-BNC, sans versement libératoire [314]) ; franchise de TVA des auteurs : 50 000 € l'année précédente, 55 000 € l'année en cours [61]. Pas de logiciel de caisse certifié en franchise ; ensuite, dispense probable tant que seuls cartes et virements bancaires sont acceptés [88].
- **Coût fixe connu** par vendeur : environ 126 € par an (éco-organisme 110 € HT [34], médiateur 16 € par an, HT ou TTC non précisé [18]), plus expert-comptable, assurance et banque, à chiffrer.
- **Cinq décisions.** (1) Qui vend : chacun en son nom (recommandé), sous quel statut. (2) L'offre de départ : éditions limitées seules, zones servies. (3) Le prestataire de paiement. (4) La règle d'accord pour montrer en privé et pour vendre une photo où l'on reconnaît quelqu'un (avec un juriste). (5) L'ordre des phases, si la boutique doit passer avant le carnet.

---

## 0. Arbitrages entre les recherches

L'étude s'appuie sur une carte du code et six recherches (blog, galeries, produits, droit, paiement, facturation). Là où elles divergeaient, voici ce qui est retenu.

| # | Sujet | Positions | Retenu | Pourquoi |
|---|---|---|---|---|
| 1 | Nom du blog | « Journal » (`/journal`, `blog.*`) dans la carte ; « Carnet » dans la recherche blog | **Carnet** (`/carnet`, `carnet.*`) | `/admin/journal` (`routes/admin.js:993`), `journal.voir` (`permissions.js:49`) et le menu « Journal » (`views/admin/layout.eta:107`) désignent déjà le journal d'audit. |
| 2 | Adresses des espaces privés | `/galerie/<jeton>` (carte) ; `/galerie/<id>/carnet/<slug>` (blog) ; `/g/<jeton>` puis `/prive/<id>` (galeries) | **`/g/<jeton>`** pour la page du mot de passe, **`/prive/<id>`** ensuite, billets privés compris | La page du lien doit rester lisible des robots pour qu'ils voient `noindex` ; les pages de session sont interdites dans `robots.txt`. Un seul schéma pour galeries et billets. |
| 3 | Lien billet privé ↔ espace | `posts.gallery_id` (blog) ; `private_spaces.post_id` (galeries) | **`private_spaces.post_id`** et **`posts.visibility`** | L'espace porte les invitations : c'est lui qui pointe vers le billet. `visibility = 'prive'` garantit qu'effacer l'espace ne rend jamais le billet public. |
| 4 | Cookie des visiteurs | `__Secure-` limité à `/galerie/` (carte) ; `__Host-visiteur`, `Path=/` (galeries) | **`__Host-visiteur`** | Le même cookie sert au panier. `__Host-` interdit qu'un sous-domaine l'écrase. |
| 5 | Cache des images privées | `private, no-store` (carte) ; `private, no-cache` avec ETag (galeries) | **`private, no-cache` + ETag**, option « stricte » en `no-store` | L'accès reste contrôlé à chaque affichage (réponse 304), sans retélécharger 200 photos à chaque visite. |
| 6 | Qui vend | Un seul vendeur recommandé, ou deux (paiement) ; chacun vend ses œuvres (droit, facturation) | **Chacun vend ses propres œuvres, en son nom** | Un vendeur unique qui vend pour l'autre devient diffuseur et encaisse pour un tiers (§ 6.1). Une structure commune reste possible plus tard. |
| 7 | Panier qui mêle les deux auteurs | Un panier commun (produits) ; panier séparé par vendeur (droit) ; division au paiement (facturation) | **Un panier, affiché en un bloc par vendeur ; une commande et un paiement par bloc** | Aucun encaissement pour l'autre, une série de factures par vendeur, un seul écran pour le client. |
| 8 | Seuil de franchise de TVA pour la partie commerciale d'un auteur | 85 000 € (facturation, d'après une page générale) ; 35 000 € (droit, d'après le BOFiP des auteurs) | **35 000 € / 38 500 €** | Le BOFiP propre aux auteurs dit que « seuls les plafonds […] spécifiques à leur secteur » s'appliquent [61]. À confirmer avec l'expert-comptable. |
| 9 | Moment de la facture | Avec la confirmation, au paiement (produits, droit) ; à l'expédition (facturation) | **À l'expédition** (tirage) ou à la mise à disposition (fichier). La confirmation de commande part au paiement. | La facture suit la réalisation de l'opération (art. 289 I-3 CGI [78]). Une annulation avant envoi n'appelle alors ni facture ni avoir. |
| 10 | Certificat d'authenticité | PDF (facturation, droit) ; HTML imprimable (produits) | **HTML imprimable, signé à la main** ; copie PDF quand la bibliothèque PDF arrive (phase 42) | Le certificat qui compte est le papier signé. Inutile d'attendre une dépendance PDF. |
| 11 | Registre des éditions | `editions` et `edition_prints` (facturation) ; `shop_products` et `edition_copies` (produits) | **`shop_products`** (une édition par photo) et **`edition_copies`** avec un canal (`site`, `exposition`, `autre`) | Un seul compteur de 30 par photo, qui compte aussi les ventes hors du site. |
| 12 | États d'une commande | Un seul automate (produits) ; paiement et préparation séparés (paiement) | **Deux états séparés** : paiement, préparation | Remboursements et litiges arrivent à toute étape de la préparation. |
| 13 | Adresses de commande | `/commande/…` (produits) ; `/boutique/commande/…` (paiement) | **`/panier`, `/commande/…`** | Plus courtes, cohérentes entre elles. |
| 14 | Suisse | Option dès le lancement, en DAP (produits) ; France et UE seulement au départ (droit) | **Fermée au lancement**, activable ensuite | Douane, TVA suisse et règle d'immatriculation à confirmer avec l'expert-comptable. |
| 15 | Fichiers numériques | Plus tard (produits) ; possibles au départ (droit) | **Plus tard (phase 46)**, alors vendus dans l'UE seulement | Taux de TVA et régime social à confirmer ; renonciation à la rétractation à coder. |
| 16 | Bibliothèque PDF | « Aucune dépendance » (règle de fait) ; pdfkit (facturation) | **pdfkit**, pour les factures seulement | PDF/A-3 nécessaire pour l'archivage et pour Factur-X en 2027. Licence MIT, dépendances légères [212]. |
| 17 | Sécurité générale des produits (GPSR) | Obligatoire (produits) ; « à vérifier » (droit) | **Obligatoire**, application à une œuvre originale à confirmer | La recherche produits a lu l'article 19 du règlement [29]. |
| 18 | Éco-organisme des emballages | Obligatoire avec forfait (produits) ; « à vérifier » (droit) | **Obligatoire** ; une adhésion par vendeur à confirmer | Le guide Citeo 2026 a été lu [34]. |
| 19 | Ordre des phases | Socle, galeries, blog, boutique (carte) ; carnet sans dépendance (blog) | **Socle, carnet, galeries, boutique** | Le carnet n'a pas besoin des sessions visiteur ; les galeries les créent avant la boutique, qui en a besoin. |
| 20 | Taux de TVA des frais de port d'une œuvre à 5,5 % | « Même taux que le bien » (droit, art. 267 non vérifié) ; « à confirmer » (facturation) | **Même taux que le bien** ; commande mixte : ventilation à confirmer | Les frais de transport facturés par le vendeur sont des frais accessoires, taxés « au taux du produit livré », sauf prestation que les parties ont « expressément » disjointe (BOFiP [308] § 70, relu le 16/10/2026). Commande mixte (5,5 % et 20 %) : ventilation selon la répartition par taux des autres recettes, par analogie avec [308] § 60 : à confirmer avec l'expert-comptable. Sans effet tant que les vendeurs sont en franchise. |
| 21 | Numéro d'exemplaire | Exemplaire libre réservé à la commande (§ 3.4) ; « attribué à la commande » (ligne du panier) ; numéro attribué au paiement (S7, D4, annexe paiement) | **L'exemplaire (ligne `edition_copies`) est réservé à la commande ; son numéro n'est montré qu'après le paiement** | Une seule règle : la réservation porte sur un exemplaire précis, ce qui évite de recalculer « plafond − vendus − réservés » ; le client ne voit pas un numéro qui pourrait encore changer (paiement tardif, S39). |
| 22 | Adresse du webhook de paiement | Une par vendeur, ou une seule qui essaie les deux secrets (annexe paiement) ; une seule route (principal) | **Une par vendeur** (`/paiement/webhook/stripe/<préfixe>`) | Le secret est choisi par la route ; un événement signé par un vendeur ne peut régler qu'une commande de ce vendeur. |

---

## Partie 1. Blog : le Carnet

### 1.1 Ce qui marche chez les photographes qui écrivent

| Site | Ce qu'on observe | Ce qu'on en retient |
|---|---|---|
| Bruce Percy [295] | Essais longs, photos dans le texte, huit billets en septembre 2026, plus de 100 catégories, flux RSS, lettre, pas de commentaires visibles | Le texte long porté par les images marche. Il faut peu d'étiquettes. |
| David duChemin [296] | Un billet tous les quinze jours, lettre gratuite, commentaires vivants (59 sous un billet) | La régularité annoncée. Les commentaires demandent une communauté et du temps. |
| Craig Mod [297] | Deux lettres à rythme fixe, désinscription en un clic, pas de commentaires | La lettre comme canal principal. |
| Magnum, « Theory & Practice » [298] | Formats nommés, boutique dans les articles, quatre lettres séparées | Séparer l'éditorial du commercial. |
| Johan Lolos [299] | Journal du site arrêté en octobre 2024 ; la lettre vit sur Substack | Quand l'écriture part ailleurs, le site se fige. |
| The Online Photographer [300], blog de Steve McCurry [301] | Redirection vers Patreon ; « This site is currently private » | Garder ses textes chez soi, avec un flux ouvert. |

Formats proposés (choix éditorial) : « Deux regards » (la même scène vue par les deux, billet à deux signatures), « L'histoire d'une photo », « Récit » (lié à un voyage), « Atelier » (tirage, matériel).

### 1.2 Périmètre

- **Dans le périmètre** : billets avec texte et photos de la photothèque ; billet lié à un voyage ; billet privé (après les galeries) ; réactions par e-mail ; lettre d'information (facultative).
- **Hors périmètre** : vidéo et audio (le RGESN demande la forme la plus sobre, critère 4.7 [245]) ; éditeur visuel (WYSIWYG), qui exigerait beaucoup de JavaScript ; commentaires publics (§ 1.10).

### 1.3 Modèle de contenu

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B1 | Nom interne et adresse publique : `carnet` (`server/carnet.js`, `/carnet`, permissions `carnet.*`). Jamais « journal » dans le code, les permissions ni les URL d'admin. Libellé public en anglais et en allemand : choix (« Journal » proposé). | I | Arbitrage 1 |
| B2 | Titre obligatoire en français, 120 caractères au plus ; anglais et allemand facultatifs (`title_en`, `title_de`). | I | Conventions de colonnes, `037_voyages.sql:9-13` |
| B3 | Slug tiré du titre français, modifiable tant que le billet n'a jamais été publié, figé ensuite. Le changer reste possible, explicitement : l'ancien répond en 301 (`post_slugs`). Un slug déjà pris, dans `posts` **ou** dans `post_slugs`, est refusé : sinon la 301 d'un ancien slug mènerait vers un autre billet. Ne pas reprendre le slug qui suit le nom, comme les voyages (`trips.js:63`). | R | — |
| B4 | Chapô de 300 caractères au plus, exigé pour publier. Il sert de `description`, de résumé dans la liste et dans le flux. | R | — |
| B5 | Corps en Markdown restreint (§ 1.4), 60 000 caractères au plus par langue (taille : choix). | R | — |
| B6 | Une ou deux signatures (`post_authors`). Portée « les miennes » : un billet appartient à un compte si l'un de ses auteurs est le photographe lié. | I | `permissions.js:126-136` |
| B7 | Langues publiées explicites (`langs`). Le français y est toujours ; l'anglais ou l'allemand y entre quand l'auteur coche « traduction relue ». Pas de repli champ par champ : un titre anglais sur un corps français tromperait. | R | `pick` (`i18n.js:18-24`) ne convient pas ici |
| B8 | Couverture et image de partage : deux photos publiées de la photothèque ; par défaut, la première photo du billet. | R | — |
| B9 | Références internes par identifiant, jamais par slug : `photo:ID`, `serie:ID`, `voyage:ID`, `carnet:ID`. Index `post_refs` recalculé à chaque enregistrement. | I | Les slugs changent (`admin-repo.js:120-124`, `trips.js:63`) |
| B10 | Étiquettes : 0 à 5 par billet, tirées d'une liste gérée dans l'admin, nom en trois langues. Pas de création à la volée. | R | [295] |
| B11 | Voyage lié facultatif (`trip_id`) : « Lire le récit » sur la page du voyage, encart du voyage sur le billet. Le déroulé jour par jour reste sur le voyage. | R | `public.js:296-312`, `trip-story.js` |
| B12 | États `brouillon`, `propose`, `a_reprendre`, `programme`, `publie`, `retire`, validés en JavaScript, sans `CHECK` SQL. | I | SQLite ne sait pas modifier un `CHECK` [279] |
| B13 | Dates en millisecondes epoch : `created_at`, `updated_at`, `publish_at`, `published_at` (première publication), `revised_at` (mise à jour signalée). | I | Conventions du projet |
| B14 | Mention commerciale en tête du billet dès qu'un contenu est fait en partenariat (matériel prêté, invitation, lien d'affiliation). « Toute publicité […] doit pouvoir être clairement identifiée comme telle. » | O | LCEN, art. 20 [24] |
| B15 | Visibilité `public` ou `prive` ; un billet privé est servi dans un espace privé (§ 1.9). | C | Arbitrage 3 |
| B16 | Photos « carnet seulement » : publiées mais absentes de la galerie (`photos.listed`). Le filtre n'est **pas** posé dans `repo.publishedPhotos`, dont se sert `/photo/:slug` (`public.js:235-245`) : les figures et galeries du billet mèneraient à des 404. Option `listed` de `publishedPhotos`, demandée seulement par la galerie, les séries, la recherche (`search.js`), la carte et le sitemap. `/media/` les sert, `readiness` les contrôle. | C | 52 tests de « publiée » dans `server/` : option explicite, testée sur `/photo/:slug` |

### 1.4 Syntaxe et rendu

| Élément | Syntaxe | Rendu |
|---|---|---|
| Intertitre | `## Titre`, `### Sous-titre` (`#` traité comme `##`) | `h2`, `h3`, ancre stable ; le `h1` est le titre |
| Emphase, listes, citation, séparateur, tableau | Markdown courant (GFM) | Balises correspondantes ; tableau en `<table tabindex="0">` |
| Lien externe | `[texte](https://…)` | `<a href>` |
| Lien payé ou d'affiliation | `[texte](https://… "sponsorisé")` | `<a rel="sponsored">` et mention visible (B14) |
| Lien interne | `[texte](photo:123)`, `serie:4`, `voyage:12`, `carnet:7` | Adresse localisée (`/en/photo/<slug>`…) |
| Photo | `![Texte alternatif](photo:123 "Légende")`, `?taille=large` ou `ecran` | `<figure>`, `picture()`, `<figcaption>` ; taille par classe CSS (aucun `style=`) |
| Photo décorative | `![~](photo:123)` | `alt=""` |
| Galerie | Paragraphe fait seulement de 2 à 12 photos | Grille de vignettes vers les pages des photos |
| HTML brut, image externe | `<script>`, `![x](https://…)` | HTML affiché comme texte ; image externe retirée et signalée |

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B17 | Instance `Marked` dédiée, distincte de celle de l'aide (`help.js:37-59` laisse passer HTML et liens). Renderers `html`, `link`, `image`, `heading` remplacés, chaque attribut échappé. « Marked does not sanitize the output HTML. » | I | [268] |
| B18 | Schéma d'un lien contrôlé après décodage des entités et retrait des caractères de contrôle (cas `jav&#x09;ascript:`), par `new URL()` et une liste d'autorisation : `https:`, `http:`, `mailto:`, chemins commençant par un seul `/`, schémas internes. Le reste devient du texte. | I | — |
| B19 | Corpus de tests XSS : `<script>`, `onerror`, `<svg onload>`, `javascript:`, variantes encodées, `data:`, `vbscript:`, attributs dans le titre d'un lien, `photo:` suivi d'une injection. La CSP n'est qu'une seconde barrière. | I | `app.js:47-58` |
| B20 | Rendu à l'affichage, pas de HTML figé en base : le nom des variantes change avec le filigrane (`variants.js:139-140`). Cache mémoire facultatif, indexé par billet, `updated_at` et clés de variantes. | I | — |
| B21 | Photo non publiée ou supprimée : absente du rendu public (figure retirée). Dans l'aperçu de l'équipe : servie par `/admin/media/`, avec un bandeau « non publiée ». | I | `routes/media.js:22` |
| B22 | Lien interne vers une cible non publiée : texte simple pour le public, signalé dans les vérifications (B37). | R | — |
| B23 | `#` et `##` donnent `h2`, `###` donne `h3`, au-delà `h4`. Ancres par `anchor()` (`help.js:8-9`). | R | WCAG 2.2, 1.3.1 [244] |
| B24 | Texte alternatif exigé pour publier, sauf photo décorative. Billet à deux signatures : crédit du photographe sous chaque photo. | R | WCAG 2.2, 1.1.1 [244] |
| B25 | `sizes` selon la disposition, vignettes de galerie en 640 px, `width` et `height` toujours présents, première image en `eager` avec `fetchpriority="high"`, les autres en `lazy`. | R | `picture.js:7-15` |
| B26 | Tableaux et blocs de code atteignables au clavier (`tabindex="0"`). | R | `help.js:59` ; WCAG 2.2, 2.1.1 [244] |

### 1.5 Éditeur de l'admin

```
← Carnet                                   Brouillon · enregistré à 14 h 32   [Aperçu] [Enregistrer] [Proposer ▾]
[Français : publié] [English : à relire] [Deutsch : vide]
Titre   [__________________________________________________]   54 / 70
Chapô   [__________________________________________________]  142 / 160
[Intertitre] [Gras] [Italique] [Lien] [Citation] [Liste] [Photo…] [Galerie…] [Lien interne…]   ▸ Aide Markdown
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ Zone de texte (Markdown)      │ │ Aperçu (rendu par le serveur) │
└───────────────────────────────┘ └───────────────────────────────┘
Vérifications : textes alternatifs (ok) · 2 photos non publiées (attention) · traduction allemande (absente)
Panneau : Signatures · Étiquettes · Voyage lié · Couverture · Image de partage · Visibilité · Écrire aux auteurs · Mention commerciale · Réponse
Historique : décisions du circuit · versions enregistrées (Rétablir)
```

Sur téléphone, l'aperçu devient un onglet « Écrire / Aperçu » et le panneau passe sous le texte.

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B27 | Sans JavaScript, tout marche : formulaire classique, bouton « Enregistrer et voir l'aperçu » (aperçu rendu par le serveur), ajout de photos par cases à cocher qui ajoutent `![…](photo:ID)` en fin de corps. | I | `docs/wiki/Développer.md` (amélioration progressive) |
| B28 | Avec JavaScript, aperçu à côté, une demande toutes les 1,5 s au plus (`POST /admin/carnet/:id/apercu`), même code de rendu que le public. | R | `postJson` (`public/admin/admin.js:214-224`) |
| B29 | Barre d'outils en vrais `<button type="button">` avec libellé ; raccourcis seulement avec une touche de modification (Ctrl/Cmd + B, I, K, S). L'annulation du navigateur doit survivre à une insertion (à vérifier sur Safari iOS). | R | WCAG 2.2, 2.1.4 [244] |
| B30 | Sélecteur de photos en `<dialog>` (modèle `public/admin/admin.js:731`) : recherche dans l'index de `/admin/recherche.json`, photos publiées ou publiables du compte ; une photo donne une figure, plusieurs une galerie ; texte alternatif prérempli par la description Florence-2 de la langue, marqué « à relire », jamais inséré sans action ; focus sur la recherche, Échap ferme, retour du focus au point d'insertion. | R | ATAG 2.0, B.2.3 [243] |
| B31 | Enregistrement automatique dans `post_drafts`, jamais dans le billet en ligne : 2 s après la dernière frappe, au plus toutes les 30 s. À la réouverture : « reprendre / écarter ». | R | Session de 8 h glissantes (`sessions.js:3-5`) ; ATAG A.3.2 [243] |
| B32 | Copie locale (`localStorage`) seulement si l'envoi échoue (réseau, 401), effacée dès que le serveur a enregistré. | R | — |
| B33 | Verrou optimiste : la `version` part avec chaque enregistrement ; conflit : 409 « Modifié par X à 14 h 32 », rien n'est écrasé. | R | — |
| B34 | Aperçu et enregistrement automatique hors du journal d'audit, ajoutés aux exceptions de `routes/admin.js:149-158`. Seul « Enregistrer » est noté. | I | Sinon une ligne toutes les 30 s gardée 13 mois |
| B35 | Messages d'état dans `role="status"` ; conflit et échec dans `role="alert"`. | R | WCAG 2.2, 4.1.3 [244] |
| B36 | Onglets FR / EN / DE, champs avec `lang`. « Proposer une traduction » par LibreTranslate, découpée en blocs de 10 000 caractères au plus (`translate.js:6`), sans envoyer la syntaxe ni les adresses `photo:ID`. Jamais de traduction publiée seule. | R | `translate.js:1-3` |
| B37 | Vérifications avant de proposer ou publier. Bloquantes : texte alternatif manquant, photo bloquée par les accords, chapô absent. Signalées : photo non publiée, lien interne cassé, image externe retirée, titre de plus de 70 caractères, chapô de plus de 160, niveau de titre sauté, lien « cliquez ici », traduction cochée mais vide, personnes nommées (B83). | R | ATAG B.3.1 [243] ; `readiness.gate` |
| B38 | Historique : décisions du circuit (`post_reviews`) et 30 dernières versions (`post_revisions`), avec « Rétablir ». | R | `031_circuit.sql` |
| B39 | Utilisable sur iPhone : cibles de 44 px, barre d'outils qui passe à la ligne, aucun défilement horizontal à 320 px. | I | WCAG 2.2, 1.4.10 et 2.5.8 [244] |
| B40 | Compteurs (mots, temps de lecture, caractères), aide Markdown dans un `<details>` relié par `aria-describedby`. | R | WCAG 2.2, 3.3.1 [244] |

### 1.6 Circuit de publication

Le circuit reprend le schéma de `review.js`, pas son code, qui est lié à `photos`.

| De | Action | Vers | Qui | Effets |
|---|---|---|---|---|
| brouillon, à reprendre | Proposer | proposé | `carnet.ecrire` | Vérifications B37, `readiness.gate` sur les photos, e-mail « au mieux » aux modérateurs |
| proposé | Retirer sa proposition | brouillon | auteur | — |
| proposé, brouillon | Publier | publié | `carnet.publier` | B44, `published_at`, e-mail aux auteurs |
| proposé, brouillon | Programmer | programmé | `carnet.publier` | `publish_at` futur |
| programmé | Échéance | publié ou à reprendre | minuterie | Revérifie B44 |
| programmé | Déprogrammer | proposé ou brouillon | `carnet.publier` | — |
| proposé, programmé | Renvoyer | à reprendre | `carnet.publier` | Remarque obligatoire, e-mail |
| publié | Retirer | retiré | `carnet.publier` | Raison obligatoire, 410 |
| retiré | Republier | publié | `carnet.publier` | B44 |

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B41 | Permissions : `carnet.voir` (portée), `carnet.ecrire` (portée), `carnet.publier` (portée), `carnet.publies.modifier` (portée), `carnet.textes`, `carnet.etiquettes`, `lettre.gerer`. `carnet.publier` et `carnet.publies.modifier` dans `ADJUSTABLE`. | I | `permissions.js:10-86`, `test/roles.test.js` |
| B42 | Portée par billet : visible si l'un des auteurs est le photographe du compte ; 404 sinon, 403 si la permission ne couvre pas. Le contrôle `routes/admin.js:108-145` suppose un seul propriétaire par objet : reprendre plutôt le modèle de `voyages.js` (`registerTrips` : `load`, `sees`, `manages` propres à l'objet, objet commun à `author_id` NULL), avec `post_authors`. Cas ajoutés à `test/portee.test.js`. | I | `voyages.js:11-13` |
| B43 | Proposer : avec `photos.proposer`, les photos brouillons prêtes sont proposées en même temps (comme `views/admin/trip.eta:6`). E-mails sur le modèle de `review.js:23-29`. | R | — |
| B44 | Publier exige que couverture, image de partage et toutes les photos du corps soient publiées. Avec `photos.publier`, proposer de les publier en même temps ; sinon refuser avec la liste. | I | `/media/` refuse les brouillons |
| B45 | Programmer : la minuterie d'une minute (`app.js:241`) appelle aussi `carnet.runDue()` ; B44 revérifiée ; échec : « à reprendre » avec la raison. | R | `review.js:114-130` |
| B46 | Renvoyer : remarque obligatoire, visible dans l'éditeur et dans « Aujourd'hui ». | R | `review.js` (`sendBack`) |
| B47 | Modifier un billet publié : en ligne à l'enregistrement avec `carnet.publies.modifier` ; sinon révision proposée (`post_drafts.state = 'proposee'`), invisible en ligne jusqu'à validation. | R | Logique de `photos.publiees.modifier` |
| B48 | Case « Mise à jour signalée » : `revised_at`, « Mis à jour le … », `dateModified`, `lastmod`, `<updated>`. Une coquille ne la coche pas. | R | Google n'utilise `lastmod` que s'il est exact [261] |
| B49 | Retirer : raison obligatoire, 410, sortie de la liste, du flux et du sitemap. Supprimer : seulement un billet jamais publié. | R | — |
| B50 | « Aujourd'hui » : billets proposés, à reprendre, programmés ; billet publié dont une photo a été dépubliée ; traductions manquantes. | R | `todo.js` |
| B51 | Dépublier ou supprimer une photo citée par un billet publié : l'écran prévient (« utilisée dans 2 billets publiés ») ; le billet retire la figure (B21). | R | Index `post_refs` |

### 1.7 Côté public

| Méthode | Adresse | Où la déclarer | Notes |
|---|---|---|---|
| GET | `/carnet` (+ `/en`, `/de`) | plugin `pages` (`public.js:150`) | Liste, `?page=n` |
| GET | `/carnet/:slug` | `pages` | Ancien slug : 301 ; retiré : 410 ; inconnu : 404 |
| GET | `/carnet/etiquette/:slug` | `pages` | B70 |
| GET, POST | `/carnet/:slug/partager`, `/carnet/:slug/partage` | `pages` | Partage sans JavaScript, comptage facultatif |
| GET | `/carnet/flux.xml`, `/en/carnet/flux.xml`, `/de/carnet/flux.xml` | **hors** `pages`, comme `sitemap.xml` | B58 |

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B52 | Pages dans le plugin `pages`, donc en trois langues. Lien « Carnet » dans le menu dès qu'un billet est publié (mécanisme de `tripsPage`, `app.js:126-136`, `views/nav.eta:3`). | I | — |
| B53 | Liste de 12 billets par page, URL canonique propre à chaque page, liens « Plus récents / Plus anciens », page hors limites en 404, filtres en `noindex`. | R | Google, pagination [258] |
| B54 | Billet dans une langue non publiée : contenu français, interface de la langue, `lang="fr"` sur l'article, bandeau « n'existe qu'en français », `noindex`, absent du sitemap et des `hreflang`. **Jamais de redirection** vers la page française : avec le cookie `langue`, la redirection d'arrivée (`public.js:158-170`) ferait une boucle. | I | Google tient une page non traduite pour un doublon [259] |
| B55 | Aperçu de l'équipe : billet non publié visible avec `carnet.voir` **et sa portée** (l'un des auteurs est le photographe du compte, ou portée « tout »), `noindex`, bandeau « Aperçu ». Ne pas copier `public.js:301`, qui teste `request.can('sorties.voir')` sans portée (constat C8). Autres visiteurs : 404 s'il n'a jamais été publié, 410 s'il a été retiré. | I | `permissions.js:107-111` |
| B56 | Page d'un billet, dans l'ordre : étiquettes, titre et chapô, signatures, `<time>` de publication et de mise à jour, temps de lecture, mention commerciale, couverture, corps, réponse (B82), encart du voyage, « Écrire aux auteurs », partage, billets précédent et suivant. Lisible sans JavaScript. | R | — |
| B57 | Partage par `shareLinks` et `shareQr` (`share.js:12-23`) ; page sans JavaScript ; comptage facultatif (`post_shares`). | R | — |
| B58 | Flux Atom par langue, **hors** `pages` (sinon un lecteur qui envoie `Accept-Language: de` serait redirigé) : 20 derniers billets publiés dans la langue, `xml:lang`, `<link rel="self">`, `id` d'entrée en URI `tag:` indépendante du slug, éléments obligatoires (`id`, `title`, `updated`, `author`). Lien `rel="alternate"` dans l'en-tête des pages du carnet. | R | RFC 4287 [266], RFC 4151 [267] |
| B59 | Contenu du flux : texte intégral (recommandé ; adresses absolues, images WebP 1280 px en `<img>`) ou chapô seul. Jamais de billet privé. | C | — |
| B60 | Flux avec `Last-Modified`, `ETag`, réponse 304, `Cache-Control: public, max-age=900`. | R | Le XML n'est pas en cache Cloudflare par défaut [270] |
| B61 | Statistiques `carnet` et `carnet:<slug>`, libellées dans `pageLabel` (`routes/admin.js:803-814`). Rien pour les aperçus ni les billets privés. | I | `stats.js` |
| B62 | Aucun cookie, aucune ressource tierce, aucun script de plus sur le site public. | I | CSP `app.js:47-58` |
| B63 | Ni vidéo ni audio ; galerie de 12 photos au plus ; budget de la première vue d'un billet : 1 Mo transférés au plus (valeur C), vérifié par un test Playwright ajouté à `e2e/tests/public.spec.js` (somme des `transferSize` de l'API Resource Timing). Le projet `audit` ne mesure pas de poids : il rejoue les parcours d'ergonomie de l'admin (`docs/wiki/Tests.md`). | R | RGESN 2024, 4.7 [245] |
| B64 | « Dans le carnet » sur la page d'une photo et d'un voyage : billets publiés qui les citent (`post_refs`). | R | — |

### 1.8 Référencement

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B65 | `<title>` « Titre · Nicephos », `description` = chapô, `canonical` = adresse du billet dans sa langue publiée. | R | `layout.eta:9-16` |
| B66 | `og:type` réglable dans `layout.eta` (figé à `website`, `layout.eta:24`) : `article`, avec `article:published_time`, `article:modified_time`, `article:author`, `article:tag`. `og:image` en 2000 px ; Google demande au moins 1200 px pour Discover. | R | OGP [264], Discover [260] |
| B67 | `hreflang` seulement vers les langues publiées du billet, chaque version citant toutes les autres et elle-même, `x-default` vers le français. Variable distincte de `it.langs`, qui sert aussi au sélecteur (`views/langs.eta:6`). | R | [259] |
| B68 | JSON-LD `BlogPosting` (`headline`, `image`, `datePublished`, `dateModified`, un `author` par signature), `<` échappé en `<`, inséré par `<%~ %>`. Un `<script type="application/ld+json">` est un bloc de données non exécuté : la CSP ne le bloque pas. **À confirmer** par un test navigateur (aucune violation en console). | R | Google [257], WHATWG [265] |
| B69 | Sitemap : `/carnet` et chaque billet publié, `lastmod` = `revised_at` ou `published_at`, `hreflang` limité aux langues publiées (le code annonce toujours les trois, `public.js:129`). Google ignore `priority` et `changefreq`. | R | [261] |
| B70 | Pages d'étiquette en `noindex, follow` tant qu'une étiquette a moins de 3 billets et pas d'introduction. | C | Contenu mince [258] |
| B71 | `max-image-preview:large` sur les billets : grandes vignettes dans Google contre maîtrise des images. | C | [260] |
| B72 | `rel="sponsored"` sur un lien payé ou d'affiliation ; pas de `nofollow` sur les liens éditoriaux. | R | [263] |
| B73 | Slug français dans toutes les langues, comme le reste du site. | C | `localize` (`i18n.js:27-33`) |

Exemple de JSON-LD :

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "mainEntityOfPage": "https://www.nicephos.art/carnet/brume-sur-le-vercors",
  "headline": "Brume sur le Vercors",
  "description": "Deux regards sur la même aube, à vingt mètres l'un de l'autre.",
  "image": ["https://www.nicephos.art/media/<uuid>-<clé>-2000.webp"],
  "datePublished": "2026-10-15T08:00:00+02:00",
  "dateModified": "2026-10-20T18:30:00+02:00",
  "inLanguage": "fr",
  "author": [
    { "@type": "Person", "name": "Sébastien", "url": "https://www.nicephos.art/auteur/sebastien" },
    { "@type": "Person", "name": "Julien", "url": "https://www.nicephos.art/auteur/julien" }
  ]
}
```

### 1.9 Billets privés

Le billet privé n'a pas d'accès propre : il réutilise celui des galeries privées (partie 2).

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B74 | Un billet privé (`posts.visibility = 'prive'`) est servi par un espace privé de type `billet` (`private_spaces.post_id`). Un invité y entre par sa session visiteur, l'équipe par `request.owns('galeries.voir', space.author_id)` : une seule permission pour tous les espaces, billets compris (G55). Adresse : `/prive/<public_id>`. | R | Arbitrages 2 et 3 ; constat C8 |
| B75 | Ses photos sont des photos de l'espace, servies par la route privée (G38), jamais par `/media/`. À l'enregistrement, une photo insérée qui n'est pas dans l'espace y est ajoutée après confirmation. | I | Carte, § 6.5 |
| B76 | Il n'apparaît jamais : ni liste, ni flux, ni sitemap, ni recherche, ni statistiques, ni « Dans le carnet ». En-têtes `noindex`, `private, no-store`, `Referrer-Policy: no-referrer` réellement envoyé (SO3). Pas de partage. | I | Constat C1 |
| B77 | Privé vers public : conditions de B44. Public vers privé : l'ancienne adresse répond 404 ; les images déjà publiques restent dans les caches (G43), l'auteur est prévenu. | R | — |

### 1.10 Réactions des lecteurs

**Cadre.**

- Le directeur de la publication répond comme auteur principal d'un message « fixé préalablement à sa communication au public ». Pour un message d'internaute, il n'est pas responsable comme auteur principal s'il « n'avait pas effectivement connaissance du message avant sa mise en ligne » ou s'il « a agi promptement pour retirer ce message » (loi n° 82-652, art. 93-3 [26]). Une modération *a priori* vaut donc connaissance préalable.
- Une zone de commentaires relèverait probablement des « services d'hébergement » du DSA, avec un mécanisme de notification (art. 16). **À confirmer** : le texte n'a pas pu être lu [27].
- Droit de réponse, **avec ou sans commentaires** : toute personne nommée ou désignée le demande dans les 3 mois ; le directeur de la publication l'insère dans les 3 jours, sous peine de 3 750 € d'amende (LCEN, art. 1-1, III [23] ; décret n° 2007-1527 [25]).

| Option | Travail | Données | Responsabilité | Verdict |
|---|---|---|---|---|
| Pas de réaction | Aucun | Aucune | Aucune | Base |
| Commentaires modérés *a priori* | Élevé | Nom, e-mail, message | Auteur principal [26] | Écartée |
| Commentaires modérés *a posteriori* | Moyen | Idem | Protégé s'il retire vite ; DSA probable [27] | Écartée |
| « Écrire aux auteurs » et courrier des lecteurs | Faible | Aucune (`mailto:`) | Régime éditorial ordinaire | **Retenue** |
| Webmentions [269] | Moyen | Données de tiers | Comme ci-dessus | Plus tard, si besoin |

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B78 | Pas de commentaires publics. | R | — |
| B79 | « Écrire aux auteurs » en bas du billet (option du billet) : `mailto:` vers `carnet_contact` (par défaut `legal_email`), sujet « À propos de “Titre” ». Rien n'est stocké. | R | Adresse déjà publique |
| B80 | Variante formulaire, sur le modèle des signalements (`feedback.js:46-56`) : message et adresse scellés, effacés au bout de 12 mois, 5 messages par heure, champ piège, contrôle d'`Origin`. Registre RGPD et `privacy.js` à compléter. | C | — |
| B81 | Courrier des lecteurs : citation d'un message avec l'accord de son auteur, dans une section rédigée par les photographes. | C | — |
| B82 | Droit de réponse : champ « Réponse » daté, affiché après le billet ; procédure (réception, insertion sous 3 jours) dans `docs/wiki/Procédures.md`. | O | [23], [25] |
| B83 | Personnes nommées dans un billet : rappel dans les vérifications. L'accord « nom » est recueilli (`encounters.js:15`) mais aucun code ne s'en sert ; la règle est **à confirmer** avec un juriste. | R | — |

### 1.11 Lettre d'information (facultative)

**Cadre.**

- La prospection directe par courrier électronique exige le consentement préalable d'une personne physique ; elle vise « tout message destiné à promouvoir, directement ou indirectement, des biens, des services ou l'image d'une personne vendant des biens » (CPCE, art. L34-5 [36]). Dès que la boutique existe, une lettre qui renvoie vers le carnet en relève vraisemblablement.
- Consentement « libre, spécifique, éclairé et univoque », sans case pré-cochée, preuve gardée, désinscription simple et gratuite dans chaque envoi [50], [51].
- Pixels de suivi : consentement exigé pour mesurer l'ouverture (délibération n° 2026-042, publiée le 14 avril 2026 [52]). La CNIL admet une exemption pour la mesure individuelle de la délivrabilité des courriels liés à un service demandé, et laisse trois mois de transition pour les adresses collectées avant la publication [52]. Le plus simple reste de ne rien mesurer.
- Messageries : Gmail exige SPF ou DKIM, PTR, TLS, plaintes sous 0,3 % ; au-delà de 5 000 messages par jour, SPF et DKIM, DMARC et désinscription en un clic [281]. RFC 8058 : `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, POST sans cookie ni authentification, réponse sans redirection [283]. Nodemailer pose ces en-têtes avec l'option `list` [284] ; `mailer.send` (`mailer.js:16-25`) doit la laisser passer.

| Relais | Gratuit | Au-delà | Remarque |
|---|---|---|---|
| Gmail personnel | 500 destinataires par jour [282] | — | Déconseillé (`docs/wiki/RGPD.md:24` : pas de contrat de sous-traitance) |
| Mailjet | 6 000 messages par mois, 200 par jour, 1 000 contacts [286] | 9 $ par mois, 8 000 messages [286] | Pays d'hébergement à confirmer |
| Brevo | 300 messages par jour [285] | Environ 7 € par mois pour 5 000 (source secondaire, à confirmer) | Logo Brevo retiré seulement en payant (à confirmer) |
| Amazon SES | 200 $ de crédits pendant 6 mois (nouveaux comptes) [287] | 0,10 $ pour 1 000 [287] | Région européenne à confirmer |
| Scaleway TEM | 300 messages par mois [288] | 0,25 € pour 1 000 [288] | **Lettres d'information interdites** |
| listmonk | Gratuit, AGPLv3 [289] | — | Exige PostgreSQL et un relais |

Ordre de grandeur : 150 abonnés et deux lettres par mois font 300 messages, gratuits partout.

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| B84 | Lot facultatif. D'abord le flux Atom (B58), sans donnée personnelle. | C | — |
| B85 | Inscription : adresse et langue de la page, aucune case pré-cochée, texte qui dit quoi, à quel rythme, comment partir. Preuve : date de confirmation et version du texte. | O | [36], [50], [51] |
| B86 | Double confirmation par un bouton (POST), jamais par un simple GET (les filtres des messageries ouvrent les liens). Lien valable 7 jours, inscription non confirmée effacée au bout de 7 jours. | R | — |
| B87 | Adresse scellée avec index HMAC ; jeton de confirmation haché (SO1) ; jeton de désinscription recalculé par HMAC (il figure dans chaque lettre). La lettre refuse de s'ouvrir sans `DATA_KEY` : sans clé, `vault.index()` renvoie `null` et l'insertion dans `subscribers.email_index` (`NOT NULL`) échouerait (SO9). | I | `encounters.js:83-91` ; `vault.js:33-36` |
| B88 | Lien de désinscription dans chaque lettre, plus `List-Unsubscribe` et `List-Unsubscribe-Post`. POST sans cookie ni CSRF, sans redirection ; adresse effacée. | O (lien) / R (un clic) | [36], [283], [284] |
| B89 | Aucun pixel, aucune redirection de comptage, aucune adresse d'image propre à un destinataire. | R | [52] |
| B90 | Envoi : bouton sur un billet publié, par langue, une seule fois ; file persistante (curseur en base) ; un message par destinataire ; cadence sous la limite du relais ; trois erreurs 5xx écartent l'adresse. | R | Minuteries `app.js:241-257` |
| B91 | Message en texte, une image au plus en JPEG (WebP dans les messageries : à confirmer), lien vers le billet. | R | RGESN [245] |
| B92 | Après 3 ans sans confirmation ni contact : demander si l'abonné veut continuer, effacer sans réponse sous 30 jours. Durée applicable à une lettre éditoriale **à confirmer**. | R | [51] |
| B93 | Relais européen avec contrat de sous-traitance ; SPF, DKIM et DMARC sur le domaine (DNS chez Cloudflare). Même exigence pour les e-mails des galeries et de la boutique (J16) : `docs/wiki/RGPD.md:24` écarte Gmail, que `config.js:73` et `mailer.js:4` donnent pourtant en exemple. | O (sous-traitant) / R (DNS) | [281] ; `RGPD.md:24` |
| B94 | Registre RGPD, `privacy.js`, export, effacement et purge quotidienne. | I | Règle « Données personnelles » de `Développer.md` |

---

## Partie 2. Photos et galeries privées

Détail de la sécurité (modèle de menace, mesures scrypt, en-têtes, Cloudflare, tests) : [annexe Galeries privées : sécurité](annexe-galeries-privees-securite.md).

### 2.1 Vocabulaire et cas d'usage

| Mot | Sens |
|---|---|
| Espace privé | Une **galerie** (photos choisies, avec ou sans sélection par l'invité) ou un **billet** du carnet. |
| Invitation | Le droit d'accès d'une personne, ou d'un groupe, à un espace : un lien, un mot de passe, une échéance, des droits. |
| Lien | `https://www.nicephos.art/g/<jeton>`. Le jeton ne sert qu'à arriver sur la page du mot de passe. |
| Session invité | L'accès ouvert après le bon mot de passe : un cookie et l'adresse `/prive/<id>`, sans jeton. |
| Sélection | Les photos qu'un invité choisit (« proofing »). |
| Équipe | Les comptes de l'admin : connexion Zitadel, rôles en base (`server/permissions.js`). |

Cas visés : remettre et faire choisir les photos d'une séance commandée ; aller plus loin que la photo offerte (`/pour-vous`) avec une personne photographiée ; montrer un travail en cours à un galeriste, un éditeur ou un jury ; un récit privé pour des proches ; une relecture interne. Hors périmètre : comptes clients permanents, paiement (partie 4), éditeur des billets (partie 1).

### 2.2 Ce que font les plateformes de galeries clients

Pixieset, Pic-Time, SmugMug, ShootProof et Zenfolio [290]-[294] proposent mot de passe ou code, invitations par personne avec des droits propres, téléchargement distinct de la vue, échéance avec rappels (Pic-Time : 7, 4 et 1 jour avant), favoris et « J'ai terminé » (ShootProof), suivi des visites, filigrane. SmugMug et ShootProof n'ont pu être lus que par extraits de recherche : **à confirmer**.

- **Retenu** : une invitation par personne, téléchargement distinct, échéance, sélection avec « J'ai terminé », suivi, filigrane réglable.
- **Écarté** : « e-mail exigé » sans vérification (n'importe qui tape n'importe quelle adresse) ; blocage du clic droit et « protection contre les captures » (impossible sur le web, demande du JavaScript, gêne l'accessibilité) ; comptes clients permanents.

### 2.3 Méthode d'accès

| Méthode | Points forts | Points faibles | Coût | Verdict |
|---|---|---|---|---|
| A. Mot de passe seul | Très simple | Un attaquant essaie toutes les galeries à la fois : pas de limite par cible. La CNIL demande alors 80 bits, environ 17 caractères [48]. | 0 € | Écarté |
| B. Lien seul (comme `/pour-vous`) | Aucune saisie | L'adresse traîne dans l'historique, les journaux, les messageries et les aperçus de liens [250]. | 0 € | Gardé pour la seule photo offerte |
| **C. Lien personnel + mot de passe généré** | Deux secrets, deux canaux ; suivi et révocation par personne ; 50 bits suffisent avec la limitation des essais [48] | Une saisie par appareil ; l'équipe transmet le mot de passe | 0 € | **Recommandé** (c'est la demande) |
| D. Lien magique ou code par e-mail | Rien à transmettre | Exige SMTP, aujourd'hui facultatif (`config.js:74-77`) ; les outils de messagerie consomment les codes [276] ; le NIST exclut l'e-mail comme canal hors bande [249] | 0 € | Plus tard, pour « mot de passe perdu » |
| E. Comptes invités Zitadel | Réinitialisation gérée | L'invité crée un compte ; `hasRole` ouvre l'admin à tout rôle (`auth.js:92`) ; un compte sans rôle n'a pas de session (`auth.js:176-180`) et il est purgé à 90 jours (`accounts.js:37-41`) | Gratuit jusqu'à 100 utilisateurs actifs par jour, puis 100 $ par mois [278] | Écarté pour les invités |
| F. Cloudflare Access | Rien à coder | Règles tenues dans le tableau de bord, pas de suivi dans l'admin, e-mails des invités chez Cloudflare | Gratuit sous 50 utilisateurs, puis 7 $ par utilisateur et par mois [275] | Écarté |

### 2.4 Parcours

**Équipe.**

1. Menu « Publier », puis « Galeries privées », puis « Nouvel espace » : titre, texte d'accueil (trois langues), photographe, échéance.
2. Ajout des photos depuis la photothèque (action groupée) ou depuis l'espace ; chaque photo montre son état pour l'usage « privé » (§ 2.7).
3. Réglages : téléchargement (non, web, grande taille), filigrane, sélection (et limite), commentaires, tirages.
4. Invitation : étiquette (« Marie, la mariée »), e-mail facultatif, langue, échéance, droits, personnelle ou groupe.
5. Écran « Lien et mot de passe », affiché **une seule fois** : copier le lien ou l'envoyer par e-mail ; copier le mot de passe, à donner **par un autre moyen** (SMS, appel, de vive voix).
6. Suivi par invité : « Pas encore ouvert », « Ouvert le 3 octobre », dernière visite, appareils, téléchargements, sélection.
7. Actions : prolonger (même lien), nouveau lien, nouveau mot de passe, débloquer, révoquer (effet immédiat), effacer.
8. L'espace se ferme seul à l'échéance ; les données des invités sont purgées ensuite.

**Invité.**

1. Il reçoit le lien, puis le mot de passe par un autre canal.
2. Le lien ouvre une page qui demande le mot de passe, sans montrer le titre de la galerie.
3. Bon mot de passe : il arrive sur `/prive/<id>`, sans autre demande jusqu'à la fin de la session.
4. Il parcourt, choisit (« Choisir »), commente si c'est permis, clique « J'ai terminé ma sélection ».
5. Il télécharge si c'est permis ; il commande un tirage si la boutique est ouverte (G67).
6. Après l'échéance, la page dit que le lien a expiré et qui contacter.

| Situation | Comportement |
|---|---|
| Mot de passe perdu | Pas de récupération automatique. L'équipe crée un nouveau mot de passe, le lien reste. |
| Lien perdu | Le lien n'est pas gardé : l'équipe en crée un nouveau, l'ancien cesse de marcher. |
| Lien ouvert par un antivirus ou un aperçu de lien | Événement « lien consulté », sans effet. Seul un mot de passe accepté vaut « ouvert ». |
| Lien et mot de passe transférés | Impossible à empêcher. Les appareils (sessions visiteur distinctes qui ont accepté le mot de passe) sont comptés ; au-delà de 3 (valeur C), alerte dans « Aujourd'hui » ; refus au-delà en option. |
| Ordinateur partagé | « Se souvenir de cet appareil » décoché par défaut ; « Quitter la galerie » retire l'accès et vide le cache (le panier reste). |
| La personne photographiée est l'invitée | Invitation rattachée à sa fiche Personne ; l'usage « privé » est prêt pour ses photos. |

### 2.5 Choix techniques, en résumé

- **Lien.** `crypto.randomBytes(24)` en base64url : 32 caractères, 192 bits, format `^[\w-]{32}$` contrôlé avant la base (comme `encounters.js:431`, `:441`). Seule l'empreinte SHA-256 est gardée (`sessions.js:8`). Échéance de 30 jours par défaut, 12 mois au plus, jamais au-delà de l'espace.
- **Mot de passe.** Généré par le serveur : 12 caractères de `CODE_CHARS` (`encounters.js:21`, 31 signes sans 0/O ni 1/I/L ; constante à exporter, elle ne l'est pas aujourd'hui), groupés par quatre (`K7QM-P3XW-9TRA`), soit 12 × log₂(31) ≈ 59,4 bits. La CNIL demande au moins 50 bits quand l'accès est restreint par un blocage après échecs [48]. Saisie tolérante (casse, espaces, tirets). Aucun mot de passe choisi à la main.
- **Stockage.** scrypt de `node:crypto`, N = 2¹⁵, r = 8, p = 3 (équivalent OWASP [246]), `maxmem` 64 Mio, sel de 16 octets, format `scrypt$15$8$3$<sel>$<clé>`, `timingSafeEqual`. Environ 0,45 s mesuré sur la machine de l'étude (Node 22.23.1), à remesurer sur le serveur Unraid. Argon2id demanderait une dépendance native : `crypto.argon2` n'existe pas dans Node 22 [247].
- **Concurrence.** scrypt tourne dans le pool de libuv (4 fils par défaut, partagés avec les fichiers [248]) : huit calculs simultanés retardent un `fs.stat` d'environ 0,87 s (mesuré). D'où 2 calculs à la fois au plus, une file de 10, puis 503.
- **Essais.** Par invitation, en base : 5 échecs → 1 min ; 10 → 15 min ; 30 → suspension, déblocage à la main. L'essai est compté comme un échec **avant** le calcul scrypt, dans une transaction synchrone, puis annulé en cas de succès ; un seul calcul à la fois par invitation (sinon une douzaine d'essais parallèles passeraient les seuils). Par adresse : 20 essais par 15 min, 60 ouvertures de `/g/` par heure (`createRateLimiter`).
- **Session.** Session visiteur commune avec le panier (SO2) : jeton de 32 octets dans le cookie `__Host-visiteur` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`), empreinte en base (`token_hash`), identifiant interne distinct et stable, jeton CSRF. Chaque mot de passe accepté change le jeton, sans toucher au panier. Chaque autorisation (`visitor_grants`) a sa propre échéance : 12 h d'inactivité et 7 jours au plus, 30 jours avec « se souvenir » ; la durée du cookie (30 jours si un panier existe) ne la prolonge jamais. `SameSite=Lax` et non `Strict` : sinon un clic depuis une messagerie web ramènerait à la page du mot de passe.
- **Images.** Route `/prive/:pid/m/:name` qui vérifie à chaque image la session ou la permission d'équipe, l'appartenance à l'espace et la clé courante. `Cache-Control: private, no-cache` avec ETag (option stricte : `no-store`). Règle Cloudflare « Bypass cache » sur `/g/*` et `/prive/*`, contrôle de `cf-cache-status` après mise en ligne [271]-[273]. Filigrane du site par défaut (variantes existantes, aucun rendu de plus).
- **Indexation.** `noindex` partout. `/g/` **n'est pas** interdit dans `robots.txt` : une page bloquée ne voit jamais son `noindex` et peut apparaître dans les résultats [256]. `/prive/` est interdit (tout y répond 404 sans session).
- **Équipe.** `request.owns('galeries.voir', space.author_id)` sur `/prive/…`, sans mot de passe (la session d'admin est chargée sur toute requête, `auth.js:65-73`). Pas `request.can('galeries.voir')` seul : `can()` renvoie `'les miennes'`, qui vaut vrai (`permissions.js:107-111`), et un photographe verrait l'espace de l'autre (défaut déjà présent dans l'aperçu des voyages, `public.js:301`, constat C8). `owns()` est faux pour un espace commun (`author_id` NULL) en portée « les miennes » : les espaces communs sont réservés aux comptes de portée « tout ». Bandeau « Vue équipe », aucun événement d'invité noté. Les invités ne sont jamais dans `accounts`.

### 2.6 Exigences

**A. Espaces**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G1 | Un espace privé est une galerie ou un billet, d'un photographe ou commun (`author_id` NULL). Un espace commun n'est visible que des comptes de portée « tout ». | R | Modèle `trips` (`voyages.js:11-13`) |
| G2 | Les photos gardent leur `status`. L'appartenance passe par `space_items`, jamais par un nouvel état de `photos`. | I | Reconstruire `photos` déclencherait les `ON DELETE CASCADE` de quinze tables [279] |
| G3 | États : brouillon (équipe seule), ouverte, fermée ; fermeture automatique à `closes_at`. | R | Minuterie `app.js:240-242` |
| G4 | Les invités n'ont ni compte dans `accounts` ni rôle de `ROLES`. | I | `auth.js:92` |

**B. Lien**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G5 | Une invitation par personne par défaut ; le lien de groupe est un choix explicite, signalé. | C | — |
| G6 | Jeton de 24 octets aléatoires en base64url ; format vérifié avant toute requête. | I | `encounters.js:431`, `:441` |
| G7 | Seule l'empreinte SHA-256 du jeton est gardée ; le lien s'affiche une seule fois. | I | SO1 ; corrige le modèle de C2 |
| G8 | Échéance contrôlée sur le serveur : 30 jours par défaut, 12 mois au plus, jamais au-delà de l'espace. | I (C pour les valeurs) | [250] |
| G9 | Révoquer supprime les autorisations de session dans la même transaction ; la requête suivante échoue. | I | Modèle `accounts.js:127` |
| G10 | Prolonger garde le lien ; « Nouveau lien » et « Nouveau mot de passe » invalident l'ancien. | R | — |
| G11 | Jeton mal formé ou inconnu : 404 identique à toute page absente. Jeton connu mais expiré, révoqué ou espace fermé : 410, sans titre, avec le contact. | R | Modèle `public.js:68` |
| G12 | Le GET du lien ne consomme rien et ne vaut pas « ouvert ». | R | [276] |
| G13 | Le jeton n'apparaît jamais dans le journal du serveur, les paramètres d'une route d'admin ni `audit_log`. | I | SO4 ; constats C3, C4 |

**C. Mot de passe et essais**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G14 | Mot de passe généré : 12 caractères de `CODE_CHARS`, groupés par 4. Aucun mot de passe saisi à la main. | R | CNIL ≥ 50 bits [48] |
| G15 | Saisie tolérante : casse, espaces et tirets ignorés. | R | — |
| G16 | Un mot de passe par invitation. | C | — |
| G17 | scrypt N = 2¹⁵, r = 8, p = 3, `maxmem` 64 Mio, sel de 16 octets, format auto-décrit, `timingSafeEqual`, re-hachage si les paramètres changent. | I | [246], [247] |
| G18 | Au plus 2 calculs scrypt simultanés, file de 10, puis 503 ; **un seul calcul à la fois par invitation**. | R (I par invitation) | Mesure locale |
| G19 | Compteur d'échecs en base : 5 → 1 min, 10 → 15 min, 30 → suspension, déblocage par l'équipe. Verrou contrôlé et essai compté comme échec **avant** scrypt, dans la même transaction synchrone ; échec annulé en cas de succès. Test de requêtes concurrentes (T6). | I (C pour les valeurs) | CNIL [48] ; NIST ≤ 100 échecs [249] ; annexe galeries, § 3.3 |
| G20 | Limite par adresse : 20 essais par 15 min ; 60 GET de `/g/` par heure. | R | `ratelimit.js` |
| G21 | Le message d'erreur donne les essais restants ou l'heure de fin d'attente, relié au champ. | R | — |
| G22 | Le mot de passe n'apparaît jamais dans un e-mail (par défaut), un cookie `flash`, un journal ni une URL. | I | `flash` est signé, pas chiffré (`admin.js:176-188`) |
| G23 | Pas de récupération automatique : la page dit qui contacter. | C | Méthode D plus tard |

**D. Session invité**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G24 | Mot de passe accepté : session visiteur créée, ou jeton de la session existante changé (`token_hash`, CSRF) ; l'identifiant interne, les autres autorisations et le panier restent. | I | SO2 |
| G25 | Cookie `__Host-visiteur` : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sans `Domain` (sans préfixe en HTTP local, comme `auth.js:41-45`). | I | MDN [251] |
| G26 | Durées, contrôlées autorisation par autorisation (`visitor_grants.expires_at`, `remember`, `last_seen_at`) : 12 h d'inactivité et 7 jours au plus ; 30 jours avec « se souvenir » ; jamais au-delà des échéances. La durée du cookie ne prolonge jamais une autorisation. | C (valeurs) / I (contrôle) | — |
| G27 | Redirection 303 vers `/prive/<public_id>`, adresse sans jeton ; toute autre redirection par `safeNext` (`auth.js:16-26`). | I | — |
| G28 | Toute écriture de l'invité exige un `Origin` **présent** et égal au site (ou `Sec-Fetch-Site: same-origin`), et le jeton CSRF dès qu'une session existe. `POST /g/:token` (et le premier ajout au panier) n'ont pas encore de session : ce contrôle est leur seule protection contre le CSRF de connexion. Ne pas réutiliser `sameSite` (`public.js:382`) tel quel : il accepte une requête **sans** `Origin`. | I | Annexe galeries, M11 |
| G29 | « Quitter » : autorisations de la session supprimées (pas la session, donc pas le panier), jeton changé, `Clear-Site-Data: "cache"` (pas `"cookies"`, qui effacerait la session d'admin et la langue). | R | MDN [254] |
| G30 | Une session peut ouvrir plusieurs espaces (`visitor_grants`). | R | — |
| G31 | Appareils comptés par invitation (appareil = session visiteur distincte qui a accepté le mot de passe ; vider ses cookies compte un appareil de plus) ; alerte au-delà de 3 ; refus au-delà de N en option. | C | — |

**E. Pages et en-têtes**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G32 | Pages `/g/` et `/prive/` : `no-store`, `noindex` et `Referrer-Policy: no-referrer` **réellement envoyé**. | I | SO3 ; constat C1 ; MDN [252] |
| G33 | Page du lien neutre : titre « Galerie privée · Nicephos », ni titre de galerie, ni Open Graph, ni description, ni `canonical`, ni `hreflang`. Il faut une option du gabarit : `views/layout.eta` émet aujourd'hui toujours `og:title`, `og:site_name`, `og:locale` et l'image de partage de la marque (`layout.eta:4`, `:23-33`). | R | Aperçus de liens |
| G34 | Aucun lien vers un autre site sur ces pages ; CSP inchangée. | R | [250] |
| G35 | Absents du sitemap, de la recherche, du menu et des statistiques. | I | Carte, § 8.6 |
| G36 | `robots.txt` : `Disallow: /prive/` ; `/g/` non interdit. | R | Google [256] |
| G37 | Langue : celle de l'invitation, puis le choix gardé dans la session (`POST /prive/:pid/langue`). Menu **sans** sélecteur `/langue/` sur `/g/` et `/prive/` : `langs.eta:6` pointe vers `/langue/<l>?vers=<page>` (`here`, `app.js:138`), ce qui mettrait le jeton dans le journal puis mènerait à `/en/g/…` (404). | I | `public.js:45-51` ; `nav.eta:4` |

**F. Images et téléchargements**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G38 | Route `/prive/:pid/m/:name` : session ou équipe, photo membre de l'espace, clé courante, nom conforme à `VARIANT_RE` ; sinon 404. Jamais `/media/`. L'UUID visible dans l'adresse n'est pas un secret (il figure dans le HTML public des photos publiées). Avec le réglage « Tout l'EXIF de l'original », les variantes contiennent le GPS (`variants.js:14`, `:74-75` ; `images.js:81`) : dans ce mode, la route privée sert un rendu sans GPS de `storage/private/`, ou refuse ces variantes. | I | Carte, § 6.3 et 6.5 ; annexe galeries, M19 |
| G39 | Images en `private, no-cache` avec ETag ; option stricte en `private, no-store`. Jamais `public` ni `immutable`. | I (C pour le choix) | Cloudflare [271] |
| G40 | `Cross-Origin-Resource-Policy: same-origin` sur les images et les téléchargements. | R | MDN [253] |
| G41 | Règle Cloudflare « Bypass cache » sur `/g/*` et `/prive/*` (liste complète en J14), aucune règle « Ignore cache-control » ; Always Online désactivé (il transmet à Internet Archive les adresses GET les plus demandées qui ont répondu 200 [311], dont `/g/<jeton>`) ; contrôle de `cf-cache-status` (`DYNAMIC` ou `BYPASS`) après mise en ligne. | R | [272], [273], [311] |
| G42 | Filigrane du site par défaut (sauf réglage « Tout l'EXIF », G38). Option « sans filigrane » : rendu dans `storage/private/`, hors de `variants/` (qui efface ce qu'il ne connaît pas, `variants.js:146-153`), avec son ménage. | C | — |
| G43 | Photo publiée rendue privée : nouveaux noms de variantes et purge Cloudflare par URL (ouverte à l'offre gratuite [274]), sinon le cache d'un an la sert encore ; à défaut, l'équipe est prévenue. La clé actuelle (`variant_key`) est une empreinte des seuls réglages (`variants.js:58-79`), commune aux photos et vide sans filigrane ni métadonnées : il faut un sel par photo (`photos.variant_salt`, ajouté par `ALTER TABLE … ADD COLUMN`) entré dans l'empreinte et changé au passage en privé, puis purger les 6 adresses (3 largeurs × 2 formats) et l'`og:image`. La purge demande un jeton d'API Cloudflare : nouveau secret, décrit dans `Configuration.md` (J17). | I | `docs/wiki/Sécurité.md:78` ; annexe galeries, § 3.6 |
| G44 | Téléchargement coupé par défaut. Tailles « web » (2048 px) et « grande » (4000 px ou pleine définition, à décider). JPEG rendu **une fois**, gardé dans `storage/private/`, EXIF auteur et « usage personnel », jamais de GPS, jamais l'original. | I et C | `docs/wiki/Développer.md` ; constat C6 |
| G45 | Droits par invitation, qui remplacent ceux de l'espace. | C | — |
| G46 | Archive ZIP écrite sur disque dans `storage/private/archives/` (effacée après 24 h), bornée à 100 photos et 1 Gio, 3 par jour et par invitation. Pas dans `storage/tmp/`, vidé à chaque démarrage (`admin.js:64-67`). | R | `zip.js` travaille en mémoire, sans ZIP64 |
| G47 | Ni blocage du clic droit, ni « protection contre les captures ». | R | § 2.2 |

**G. Fonctions de l'invité**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G48 | « Choisir » par un formulaire POST qui marche sans JavaScript (retour à l'ancre de la photo), amélioré en JS. | I | Règle du projet |
| G49 | Limite facultative du nombre de photos choisies, compteur visible (« 12 sur 20 »). | C | — |
| G50 | « J'ai terminé » fige la sélection et prévient le photographe (« Aujourd'hui », e-mail au mieux) ; l'équipe peut la rouvrir. | R | `review.js:23-27` |
| G51 | Plusieurs listes nommées (V2). | C | — |
| G52 | Commentaire par photo, 1 000 caractères, visible de l'équipe seulement, scellé et échappé. | R | `feedback.js:46-47` |
| G53 | Export de la sélection pour l'équipe : références et noms de fichiers d'origine (`photos.source_name`). | R | `005_source_name.sql` |
| G54 | Le client principal masque des photos aux autres invités : plus tard. | C | — |

**H. Équipe**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G55 | Permissions `galeries.voir`, `galeries.gerer`, `galeries.partager`, toutes avec portée, contrôlées par `request.owns(perm, space.author_id)`, jamais par `request.can(perm)` seul. Modérateur et Relecteur n'y ont pas accès (§ 7.5, décision à rendre explicite dans D16). | I (C pour la répartition) | `permissions.js:107-111` ; constat C8 |
| G56 | Routes d'admin par identifiant numérique ; portée sur le modèle de `voyages.js` (`load`, `sees`, `manages`), le contrôle `admin.js:114-142` supposant un seul propriétaire. | I | Constat C4 ; `test/portee.test.js` |
| G57 | Créer une invitation : jeton de formulaire à usage unique (un renvoi par F5 ou « Précédent » ne crée pas une seconde invitation, comme S31), puis 303 vers une page GET `no-store` qui lit le lien et le mot de passe dans une mémoire du serveur liée à la session d'admin, effacée à la première lecture. Jamais de `flash`. | I | G22 |
| G58 | Envoi du lien par l'e-mail du site, ou message à copier ; rappel « mot de passe par un autre canal ». | R | `mailer.js` |
| G59 | Activité par invitation et journal détaillé (`space_events`). | R | — |
| G60 | « Voir comme un invité » avec bandeau d'équipe, aucun événement noté. | R | — |
| G61 | À l'ajout d'une photo, état de l'usage « privé » : bloquée, refusée ; à vérifier, confirmation explicite gardée. | R (règle **à confirmer**) | `readiness.js` (`gate`) |
| G62 | « Aujourd'hui » : sélection terminée, espace qui expire dans 7 jours, invitation suspendue, lien peut-être transféré. | R | `todo.js` |
| G63 | À l'échéance de l'espace, toutes ses invitations cessent de marcher. | I | — |

**I. Billets privés** : voir B74 à B77. Un billet privé n'apparaît nulle part publiquement (G64), ses photos peuvent rester en brouillon (G65), le passer en public ferme ses invitations après confirmation (G66, C).

**J. Lien avec la boutique**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G67 | « Commander un tirage » si l'option tirages est active et la boutique ouverte ; la ligne va dans le panier de la même session visiteur ; prix de la grille de la boutique. | C | Partie 3 |
| G68 | La commande fige la photo, le format et le prix, et garde un lien vers l'invitation ; supprimer l'espace ne supprime pas la commande. | I | S33 |
| G69 | Tirage d'une photo avec une personne reconnaissable : usage « vente » (S3). Exception si l'acheteur est la personne liée : **à confirmer**. | R | — |

**K. RGPD et exploitation**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G70 | Étiquette, e-mail et commentaires scellés ; index HMAC de l'e-mail. Sans `DATA_KEY`, `seal()` ne chiffre rien et `index()` renvoie `null` (`vault.js:33-36`, `Configuration.md:94`) : e-mail d'invitation et commentaires désactivés tant que la clé manque (SO9). | I | `vault.js` ; règle du projet |
| G71 | Durées et purge quotidienne du § 2.7. | O | RGPD, art. 5.1.e [44] ; `app.js:193` |
| G72 | Information sur la page du lien, dans l'e-mail et sur `/confidentialite`, cookie compris. | O | RGPD, art. 13 et 14 [44] ; CNIL [46] |
| G73 | Export et effacement par e-mail d'invité (index HMAC). | O | RGPD, art. 15 et 17 [44] |
| G74 | Registre, analyse d'impact simplifiée et procédure de violation mis à jour dans la même PR. | O | RGPD, art. 30 [44] |
| G75 | Corriger « le seul cookie du site public » partout : `privacy.js:53`, `:106`, `:159` (fr, en, de), `docs/wiki/Sécurité.md:97`, `docs/wiki/Spécifications.md:31`, `docs/aide/10-site-public.md:14` et ses traductions (`docs/aide/en/`, `docs/aide/de/`). | O | Exactitude de l'information |
| G76 | `storage/private/` (archives comprises) hors sauvegarde : ces fichiers se recalculent. | R | `server/db/backup.js:24-25` (`FILE_DIRS`) |
| G77 | Documentation dans la même PR : aide, Spécifications, Sécurité, RGPD, Déploiement (règle Cloudflare), Exploitation (contrôle `cf-cache-status`). | I | `docs/wiki/Développer.md` |

**L. Section privée** (la demande parle de « section / photos privées »)

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| G78 | Partager plusieurs galeries et billets avec les mêmes personnes : (a) une invitation qui couvre plusieurs espaces (table `invite_spaces`), ou (b) une page `/prive` qui liste les espaces que la session a ouverts. Proposition : (b) en V1, (a) si le besoin se confirme. | C | Annexe galeries, § 5 |

### 2.7 RGPD, accords et droit à l'image

| Donnée | Stockage | Durée proposée (C) |
|---|---|---|
| Étiquette, e-mail facultatif | Scellés, e-mail avec index HMAC | Fin de l'invitation (échéance ou révocation) + 6 mois |
| Langue, droits, échéances, empreintes du jeton et du mot de passe | En clair ou empreintes | Idem |
| Journal des accès (date, événement, IP tronquée /24 ou /48, pays) | En clair | Idem ; la CNIL recommande de 6 mois à 1 an pour la traçabilité [49] |
| Sélections, commentaires (scellés) | — | Idem ; une sélection qui a donné une commande suit la commande |
| Session invité | Empreinte | 7 ou 30 jours au plus |
| Rendus privés | Fichiers | 30 jours après la fermeture de l'espace |
| Espace (titre, textes, photos) | En clair | Jusqu'à suppression, rappel 12 mois après la fermeture |

- **Base légale** : exécution du contrat pour le client d'une séance commandée ; intérêt légitime pour les autres invités et pour le journal (sécurité) [44]. Pas de consentement : il serait retirable à tout moment et ne correspond pas à la relation.
- **Expression artistique** : l'article 85 du RGPD et l'article 80 de la loi Informatique et Libertés [45] couvrent la création et la diffusion des photos, pas la gestion des invités (e-mails, journaux).
- **Adresse fournie par un tiers** : article 14, information au plus tard à la première communication, donc dans l'e-mail d'invitation [44].
- **Cookie** : traceur « destiné à l'authentification auprès d'un service », exempté de consentement ; l'information reste due [46], [47].
- **Destinataires** : Cloudflare (acheminement) et la messagerie si l'e-mail part par SMTP. Pas de nouveau sous-traitant.
- **Violation** : un accès non autorisé à une galerie où l'on reconnaît des personnes est une violation de données ; notification à la CNIL sous 72 h si un risque existe (art. 33 [44]).
- **Personnes photographiées.** Service-public indique que le consentement doit préciser le mode de diffusion, la finalité et la durée ; dans un lieu public, l'autorisation est requise si la personne est isolée et reconnaissable ; pour un mineur, l'autorisation écrite des parents est obligatoire [43] (fondement : art. 9 du Code civil [42]). Montrer une photo à des tiers choisis est un mode de diffusion, même restreint.
- **Règle proposée, à confirmer par un avocat** : un usage `prive` s'ajoute à `USAGES` (`readiness.js:12`, SO6). *Prête* : aucun visage, ou toutes les personnes concernées ont accepté « site » ou « expositions et tirages », ou l'invité est la personne liée. *À vérifier* : un visage sans décision ; confirmation explicite gardée (« séance commandée, la personne est la cliente »). *Bloquée* : un refus lié ou dans la sortie ; un refus vaut pour tout.
- Séances commandées : clause « galerie privée » dans le bon de commande. Ajouter une case « galerie privée » aux cartes d'accord changerait les cartes imprimées : plus tard (C).

Texte proposé pour la page du lien :

> Galerie privée, réservée aux personnes invitées par Nicephos. Nous notons la date de vos visites, vos téléchargements et vos choix, pour savoir si les photos vous sont parvenues et préparer vos tirages. Tout est effacé six mois après la fin de votre invitation. Un cookie, nécessaire, garde votre accès ouvert. En savoir plus : Confidentialité.

E-mail d'invitation (texte seul, dans la langue de l'invitation, sans le mot de passe) :

> **Objet :** Vos photos : « {titre} » (Nicephos)
>
> Bonjour {étiquette},
>
> {photographe} vous invite à voir la galerie privée « {titre} ».
>
> Votre lien personnel (merci de ne pas le transférer) :
> {lien}
>
> Le mot de passe vous est donné séparément. La galerie est ouverte jusqu'au {date}.
>
> Nous voyons quand ce lien est utilisé, pour savoir si les photos vous sont parvenues. Ces informations sont effacées six mois après la fin de l'invitation. Vous pouvez nous demander de les effacer plus tôt : {contact}. En savoir plus : {site}/confidentialite
>
> Nicephos, Sébastien et Julien

### 2.8 Écrans

- **Admin, liste « Galeries privées »** (menu « Publier ») : nom, photographe, photos, invités ouverts sur total, dernière activité ; état en forme et en mot (« Brouillon », « Ouverte jusqu'au 12 nov. », « Fermée ») ; signaux (« Sélection terminée », « Expire dans 5 jours », « Invitation suspendue »).
- **Fiche de l'espace**, en onglets : Photos (badge de l'usage « privé », ordre par boutons sans JS), Invités (une ligne par invitation, état, actions), formulaire « Inviter », écran « Lien et mot de passe, affichés une seule fois », Sélections (« Rouvrir », « Copier les noms de fichiers »), Activité (avec la note : « Un lien consulté sans mot de passe peut venir d'un antivirus de messagerie »), Réglages.
- **Invité** : page du lien (champ étiqueté, aide « 12 caractères ; majuscules, minuscules et tirets indifférents », `autocomplete="current-password"`, « Se souvenir de cet appareil 30 jours (à éviter sur un ordinateur partagé) », « Mot de passe perdu ? »), galerie (en-tête, « Ouverte jusqu'au … », « Quitter la galerie », « Toutes (48) » et « Ma sélection (12 sur 20) », « J'ai terminé ma sélection »), page d'une photo (précédente, suivante, choisir, télécharger, commenter, commander). Messages : « Mot de passe incorrect. Encore 4 essais avant une pause de 15 minutes. », « Trop d'essais. Réessayez à 15 h 20. », « Ce lien n'est plus valable depuis le 3 novembre 2026. »
- Contraintes communes : sans JavaScript, cibles de 44 px, focus visible, champs étiquetés, états jamais signalés par la seule couleur, `lang` selon la langue, textes dans `UI[lang].prive`.

---

## Partie 3. Boutique : offre, panier, commande, logistique

Paiement : partie 4. Factures : partie 5. Statut des vendeurs, TVA et droit de la consommation : partie 6 et [annexe juridique](annexe-cadre-juridique-fiscal.md).

### 3.1 Offre

**Ce que vendent les photographes indépendants**

| Produit | Intérêt | Contraintes | Régime (partie 6) | Proposition |
|---|---|---|---|---|
| **Tirage d'art en édition limitée** (jet d'encre pigmentaire ou argentique, signé, numéroté, certificat) | Cœur de l'offre, cohérent avec le site | Signature manuscrite : le tirage passe chez l'auteur. 30 exemplaires au plus, tous formats confondus. | Œuvre d'art au sens fiscal si les conditions sont remplies [65], [66] ; revenus d'artiste-auteur [113] | **V1** |
| Tirage en édition ouverte (affiche) | Prix bas, impression à la demande | Concurrence les éditions limitées | Hors œuvre originale ; régime à confirmer [114] | Pas au lancement ; jamais pour une image vendue en édition limitée |
| Tirage encadré ou contrecollé | Panier moyen élevé | Lourd, fragile, retours coûteux, expédié par le laboratoire (pas de signature sur le tirage) | À confirmer | V2 |
| Cartes postales | Entrée de gamme | Stock, impression en série | Probablement commercial [114], à confirmer | V1 : offertes avec chaque commande ; vente en V3 |
| Livre ou zine | Récit, séries | Mise en page, ISBN, stock | Autoédition possible en artiste-auteur, sous conditions [114] | V3 |
| Fichier numérique (usage personnel) | Aucun transport | Copie facile ; rétractation perdue seulement avec accord et renonciation exprès [11] ; TVA à confirmer | À confirmer | V3 |
| Licence d'usage (presse, entreprise) | Revenus | Contrat particulier à chaque fois | Droits d'auteur | Sur devis, hors panier |
| Carte cadeau | Fêtes | Validité minimale et TVA à confirmer | À confirmer | V2 |
| Tirage depuis une galerie privée | Prolonge les galeries et la photo offerte | Accord de la personne, prix propres | Selon le produit | V2 |

**Papiers.** Hahnemühle Photo Rag (308 g/m², 100 % coton, mat) [214], [215], [222] ; German Etching (310 g/m²) [215] ; papier aquarelle à grain (315 g/m²) [215] ; baryté (Ilford chez WhiteWall [221], PictoOnline [222]) ; argentique C-type Fuji Crystal Archive [217], [221], [223]. La tenue de « plus de 80 ans » annoncée par creativehub [217] n'a pas été vérifiée de façon indépendante. Proposition (C) : Photo Rag pour toutes les photos, un baryté ensuite pour le noir et blanc.

**Formats.** Les photos sont souvent en 3:2, les feuilles ISO en √2. Recommandé : imprimer l'image entière à son rapport, avec une marge blanche qui porte la signature et le numéro. La taille maximale se calcule depuis `photos.width` et `photos.height` (`001_init.sql:30-31`) : 6 000 × 4 000 px donnent 50,8 × 33,9 cm à 300 ppi, 76,2 × 50,8 cm à 200 ppi ; le seuil se règle avec le laboratoire. Proposition (C) : deux formats par photo, environ A3 (feuille 30 × 40 cm) et A2 (40 × 60 ou 50 × 70 cm), tous deux expédiés à plat.

**Éditions limitées**

| Règle | Niveau | Source |
|---|---|---|
| Une photographie est une œuvre d'art si elle est « prise par [son] auteur, tirée par lui ou sous son contrôle, signée et numérotée dans la limite de trente exemplaires, tous formats et supports confondus ». Les tirages posthumes sont exclus. | O pour le statut d'œuvre d'art | CGI, ann. III, art. 98 A [65] ; BOFiP § 280-290 [66] |
| Ces critères s'appliquent seuls : l'administration ne juge pas le caractère artistique (CJUE, 5 septembre 2019, C-145/18). | Information | [67], [68] |
| Épreuves d'artiste (EA) : le texte ne dit pas si elles comptent. Par prudence, on les compte. | R, à confirmer | — |
| Plafond annoncé jamais relevé ; jamais d'édition ouverte de la même image. | R | — |
| Sur demande de l'acheteur, facture ou bordereau reprenant nature, composition, origine et ancienneté de l'œuvre. | O | Décret n° 81-255, art. 1 [39] |

Deux schémas de plafond tiennent dans la règle (C) : un plafond global numéroté de 1 à 30 quel que soit le format, ou des plafonds par format dont la somme reste ≤ 30 (exemple : 20 en A3, 8 en A2, 2 EA).

**Certificat d'authenticité.** Aucun texte ne l'impose pour le statut d'œuvre d'art, mais c'est l'usage. Contenu recommandé : titre, auteur, numéro de la photo sur le site, lieu et date de prise de vue ; « 7/30 » ou « EA 1/2 » ; format de la feuille et de l'image, papier, procédé, encres, laboratoire, date du tirage ; **empreinte SHA-256 de l'original et date de l'horodatage RFC 3161**, déjà connues (`photos.sha256`, table `timestamps`, `004_proofs.sql`) ; signature manuscrite. Les certificats de marque (Hahnemühle, avec hologramme [228] ; Digigraphie d'Epson, avec timbre sec et laboratoire agréé [229]) sont payants et facultatifs (C).

**Offre de départ recommandée**

| Étape | Contenu |
|---|---|
| **V1** | 8 à 15 photos ; pour chacune une édition limitée (≤ 30, EA comprises), 2 formats, 1 papier (2 au plus). Tirage après la vente par un laboratoire de l'UE, livré à l'auteur, signé, numéroté, certificat, expédié à plat. Livraison en France métropolitaine, à Monaco et dans l'UE. Une carte postale offerte dans chaque envoi. |
| V2 | Tirages depuis une galerie privée, cartes cadeaux, encadrement par le laboratoire, commande au laboratoire par API, vérification publique des certificats, Suisse si l'expert-comptable valide. |
| V3 | Fichiers numériques (UE seulement), livres et zines, cartes postales vendues, éventuelles éditions ouvertes d'autres images. Dépend du statut retenu. |

### 3.2 Production

| Critère | Tirer soi-même | Laboratoire fine art, commande manuelle, livré à l'auteur | Impression à la demande par API, expédiée au client |
|---|---|---|---|
| Investissement | Imprimante A2, encres, sonde (à chiffrer) | Aucun | Aucun |
| Contrôle de la qualité | Total | Bon (profils ICC, épreuve) [222] | Faible |
| Signature manuscrite | Oui | Oui | **Non** |
| Temps des auteurs | Élevé | Moyen | Nul |
| Pour qui | Plus tard, si le volume le justifie | **Éditions limitées, V1** | Produits non numérotés, V2 et V3 |

| Laboratoire | API | Fine art | Production | Prix relevé (HT) | Remarques |
|---|---|---|---|---|---|
| Prodigi (Royaume-Uni) | REST v4, environnement de test, devis, `idempotencyKey` [216] | Photo Rag, German Etching, coton, C-type [215] | Royaume-Uni, UE, États-Unis, Australie [214] | Photo Rag « à partir de 3,00 € » (10 × 15 cm) [214] | Marque blanche [214] ; fichiers à une adresse publique [216] ; le vendeur se déclare fabricant (GPSR) [30] |
| theprintspace / creativehub (Royaume-Uni) | API et modules boutique [218] | Hahnemühle, Ilford, Fuji, 11 papiers [217] | Londres, Düsseldorf, New York [217] | Giclée A4 17,19 $, A3 22,30 $, A2 43,05 $ [219] | « Signature numérique imprimée » [218], qui n'est pas manuscrite |
| Gelato (Norvège) | API, webhooks [220] | Affiches, option giclée [220] | 140 imprimeurs, 32 pays [220] | — | Orienté affiches |
| WhiteWall (Allemagne) | Pas d'API publique générale identifiée [221] | Fuji, Ilford barytés, Dibond, acrylique | 50 pays | Revendeurs sur devis | Candidat pour l'encadré (V2) |
| PictoOnline (Paris) | Aucune identifiée | Photo Rag, baryté, contrecollage, encadrement [222] | France, livraison à un tiers possible | Jet d'encre 30 × 40 cm à partir de 12,44 € (papier non précisé) [222] | Profils ICC ; bon pour la V1 |
| LabKorner (YellowKorner) | Aucune identifiée | RA4, fine art [223] | — | — | À contacter |
| CEWE, Saal Digital, Lulu, Peecho | Livres surtout [224]-[227] | — | Europe | — | V3 (livres, zines) |

**Recommandations.**

- **V1 : commande manuelle** à un laboratoire fine art, livrée chez l'auteur. L'admin note l'état et la référence de la commande au laboratoire.
- **Production dans l'UE.** Du 1er juillet 2026 au 1er juillet 2028, un droit de douane forfaitaire de 3 € par **catégorie d'articles** frappe les colis de 150 € au plus vendus à distance par des commerçants extra-européens [137], [304]. Un tirage commandé par l'auteur (achat entre professionnels) à un laboratoire de Londres n'est pas clairement visé : **à confirmer** ; la TVA à l'importation et les frais de dédouanement restent dus dans tous les cas. Prodigi et creativehub annoncent une production dans l'UE [214], [217].
- **V2 : API** (Prodigi ou creativehub) seulement pour des produits non numérotés expédiés directement, ou des commandes livrées chez l'auteur ; toujours une clé d'idempotence ; l'état est relu par l'API avant toute transition.

**Qui signe ?** Le BOFiP exige des épreuves « signées (ou authentifiées) par l'artiste lui-même » [66].

| Schéma | Déroulé | Signature sur le tirage | Statut d'œuvre d'art | Proposition |
|---|---|---|---|---|
| A | Laboratoire → auteur (contrôle, signature, numéro, certificat) → client | Oui, au crayon | Conditions remplies (à confirmer) | **V1, toutes les éditions limitées** |
| B | Laboratoire → client ; certificat signé envoyé à part | Non | Douteux (à confirmer) | Non |
| C | Laboratoire → client avec signature numérique imprimée [218] | Imprimée | « Authentifiées » pourrait couvrir ce cas, sans confirmation | Non pour les éditions limitées |

Chacun signe ses propres photos ; avec un vendeur par commande (S1), une commande part de chez son auteur.

**Fichier d'impression.** Les originaux ne sont jamais servis (`docs/wiki/Développer.md`), sauf au téléchargement par l'admin avec `photos.original` (`admin.js:1313-1317`). Le laboratoire a besoin d'un fichier maître pleine définition sans filigrane, rendu pour une ligne de commande, rangé hors de `variants/`. V1 : l'auteur le télécharge depuis l'admin et le dépose chez le laboratoire. V2 (API, adresse publique exigée par Prodigi [216]) : route à jeton haché valable 24 h, téléchargements limités, chemin masqué ; exception à écrire dans `Sécurité.md`. Le `User-Agent` d'un laboratoire n'est pas une authentification.

**Qualité.** Une épreuve de contrôle par photo et par papier avant l'ouverture, gardée comme référence en cas de réclamation ; fichiers préparés avec le profil ICC du laboratoire [222].

### 3.3 Expédition et retours

| Classe | Pour | Emballage | Matériel (HT) |
|---|---|---|---|
| `plat_s` | Feuille ≤ 30 × 40 cm | Pergamine, carton de chaque côté, pochette rigide, « Ne pas plier » | Pochette rigide : 72,80 à 82,90 € les 100 [235] |
| `plat_l` | Feuille ≤ 50 × 70 cm | Deux plaques de carton, coins protégés ; colis d'environ 75 × 55 × 3 cm (L + l + h = 133 cm) | À chiffrer |
| `tube` | Au-delà de 50 × 70 cm | Tube de gros diamètre ; Colissimo accepte L + 2 × diamètre ≤ 200 cm, **avec supplément** [231] | Tube 50 × 640 mm : 1,95 € l'unité par 50 [235] |
| `caisse` | Encadré, contrecollé | Expédié par le laboratoire (V2) | — |

| Offre | Tarifs relevés | Limites | Indemnisation |
|---|---|---|---|
| Colissimo, tarif public 2026 [230] | France, domicile / point de retrait : 500 g 7,59 € / 6,89 € ; 1 kg 9,59 € / 8,89 € ; 2 kg 11,19 € / 10,49 €. UE et Suisse : 1 kg 19,39 €, 2 kg 22,19 €. Royaume-Uni : 1 kg 23,39 €, 2 kg 26,19 €. | L + l + h ≤ 150 cm, L ≤ 100 cm [231] | 23 € par kg (France métropolitaine) ; recommandation R1 50 €, R2 200 € ; ad valorem par tranches de 100 € jusqu'à 1 000 € ; seul l'expéditeur réclame [232] |
| Mondial Relay par Boxtal [233] | France : relais dès 3,04 € HT, domicile dès 5,10 € HT ; international : 3,55 € HT relais, 8,94 € HT domicile | L + l + h ≤ 150 cm, plus grand côté ≤ 120 cm, 30 kg | CGV de l'offre Start inaccessibles (403) [236] : à vérifier |
| Sendcloud [234] | Gratuit jusqu'à 600 étiquettes par an ; Lite 26 € par mois + 0,11 € par étiquette | — | Selon le transporteur |

- **V1** : étiquettes faites à la main (Boxtal ou La Poste), numéro de suivi saisi dans l'admin. Livraison à domicile seulement : choisir un point relais demande d'ordinaire un widget cartographique tiers, contraire à la CSP.
- **Risque du transport.** Il passe au consommateur quand il prend physiquement possession du bien [14], sauf s'il a choisi lui-même un autre transporteur [15]. Un tirage perdu ou abîmé est donc **à la charge du vendeur** : assurer au-delà du forfait (ad valorem [232]), photographier le colis fermé, garder la preuve de dépôt. Exemplaire perdu ou détruit : retirage **du même numéro**, signé de nouveau, noté dans l'historique.
- **Délai.** Sans date annoncée, livraison au plus tard 30 jours après le contrat [13]. Le site annonce une fourchette de dates.

| Destination | Règles | Proposition |
|---|---|---|
| Union européenne | Pas de douane. TVA : partie 6 (seuil de 10 000 €, guichet OSS). Le blocage géographique interdit de traiter différemment un client d'un autre pays de l'UE, sans obliger à livrer partout [28]. | **V1** |
| Suisse | CN23 électronique et facture commerciale [141] ; plus de droits sur les produits industriels depuis le 1/1/2024 [140] ; TVA à l'importation de 8,1 %, non perçue sous 5 CHF de taxe (environ 62 CHF de valeur), frais de dédouanement du transporteur [139] ; immatriculation du vendeur étranger au-delà de 100 000 CHF de petits envois par an [138] | Fermée au lancement (arbitrage 14) ; ensuite en DAP, taxes au destinataire, mention visible |
| Royaume-Uni | Jusqu'à 135 £, le vendeur étranger doit s'immatriculer à la TVA britannique et la percevoir [134] ; franchise de droits sous 135 £ supprimée au plus tard en octobre 2028 [136] | **Non servi** |
| Reste du monde, outre-mer | Régimes particuliers | Pas au lancement |

**Rétractation et retours** (règles détaillées dans l'annexe juridique)

| Point | Règle | Source |
|---|---|---|
| Délai | 14 jours sans motif, à compter du lendemain de la réception | [5], [12] |
| Fonction de rétractation en ligne, **depuis le 19 juin 2026** | Fonction gratuite, accessible pendant tout le délai, « renoncer au contrat ici » ou formule analogue, étape « confirmer la rétractation », accusé de réception sans délai sur support durable (contenu, date et heure). Amende administrative jusqu'à 15 000 € pour une personne physique (les deux vendeurs, entrepreneurs individuels) et 75 000 € pour une personne morale (art. L242-13, source secondaire [303] ; à confirmer sur Légifrance). | Art. L221-21 et D221-5 [6], [7] ; ordonnance n° 2026-2, décret n° 2026-3 [8], [9] |
| Bien « nettement personnalisé » | Un tirage choisi dans un catalogue ne l'est probablement pas ; une dédicace pourrait l'être. **À confirmer.** | L221-28, 3° [11] |
| Retour d'un exemplaire numéroté | Intact : de nouveau « libre » sous le même numéro. Abîmé : détruit, retiré, noté. | R |
| Frais de retour | À la charge du client s'il en a été informé avant la commande | CGV, partie 6 |

**Obligations liées aux emballages et aux produits**

- **Éco-organisme des emballages (REP).** Un vendeur qui expédie des colis à des particuliers met des emballages sur le marché et adhère à un éco-organisme, quel que soit le volume. Chez Citeo en 2026, sous 10 000 unités (un carton d'expédition = 1 unité), forfait de 110 € HT par an, qui couvre emballages et papiers graphiques. L'identifiant unique (IDU) figure dans les CGV [33], [34]. Une adhésion par vendeur : à confirmer.
- **Papiers graphiques** : imprimés de 224 g/m² au plus. Un Photo Rag de 308 g n'est sans doute pas concerné ; une carte postale ou un zine léger pourrait l'être (à confirmer) [34].
- **Sécurité générale des produits.** Une offre à distance indique le nom, l'adresse postale et électronique du fabricant, et les informations d'identification du produit (image, type) [29]. Vendre sous son nom un tirage fait par un laboratoire fait du vendeur le fabricant [30]. Application à une œuvre originale : à confirmer.
- **Allemagne.** « If you are distributing packaged goods in Germany, you have to be registered with the LUCID Packaging Register » [35]. Application à un petit vendeur étranger : à confirmer.

### 3.4 Panier et tunnel d'achat

**Ce que dit la recherche en ergonomie** (Baymard, 22 septembre 2025 [237]) : abandon moyen de 70,22 % sur 50 études ; motifs pendant le paiement : frais en plus (40 %), livraison lente (20 %), méfiance pour la carte (19 %), **compte obligatoire (18 %)**, tunnel long (17 %), erreurs (17 %), politique de retour (13 %), coût total introuvable (12 %) ; tunnel idéal de 12 à 14 éléments, contre 23,48 en moyenne. 64 % des utilisateurs cherchent les frais de port dès la page produit [239] ; l'achat sans compte doit être le plus visible [238] ; annoncer une date de livraison plutôt qu'une vitesse [240] ; création de compte après la confirmation seulement [241].

Conséquences : aucun compte client ; port et date de livraison dès la page de l'œuvre ; un formulaire court ; visages et contact des auteurs ; retours lisibles avant l'achat.

```
/boutique ─▶ /boutique/<slug> ─(POST ajouter)─▶ /panier ─▶ /commande?vendeur=<id> ─(POST « Commander avec obligation de paiement »)
    ─▶ 303 vers la page de paiement hébergée ─▶ /commande/<ref>/merci ─▶ e-mail ─▶ /suivi/<jeton>
                                              └─(retour)─▶ /commande/<ref>/interrompu ─▶ reprendre (GET /commande/<ref>/payer) ou annuler
pied de page ─▶ /renoncer (fonction de rétractation) · /conditions-de-vente
```

| Adresse | Où | Indexation | Cache |
|---|---|---|---|
| `/boutique`, `/boutique/<slug>` | `pages()`, trois langues | Indexée, sitemap | Comme les pages publiques |
| `/panier`, `/commande…`, `/renoncer` | `pages()`, trois langues | `noindex`, `Disallow` (avec `/en` et `/de`) | `private, no-store` |
| `/conditions-de-vente` | `pages()`, trois langues | Indexée | Comme les pages publiques |
| `/suivi/<jeton>` | Hors langue, comme `/pour-vous` ; langue de la commande | `noindex`, `Disallow` | `no-store`, `no-referrer` réel (SO3), jeton masqué (SO4) |
| Webhook de paiement | Hors `pages()` (partie 4) | — | — |

`/boutique/<slug>` reprend le slug de la photo. `/photo/<slug>` reste la visionneuse ; elle reçoit une ligne discrète sous les actions (« Tirage d'art, édition limitée, à partir de X € »).

**Page de l'œuvre**, dans l'ordre : l'image (`picture()`, filigrane du site), titre, auteur, lieu et date ; choix du format et du papier par **boutons radio** dans un `<fieldset>` avec `<legend>`, prix TTC en face de chaque option ; « Édition limitée à 30 exemplaires, tous formats confondus. Reste 12 exemplaires » (chiffre exact) ; prix TTC, port pour la France et lien « autre pays » (formulaire GET), date de réception estimée en fourchette (délai du laboratoire + acheminement + signature + transport) ; bouton « Ajouter au panier » (POST ; `Origin` présent et égal au site, seul contrôle au premier ajout, qui n'a pas encore de session ; jeton CSRF de la session visiteur ensuite) ; caractéristiques (papier, procédé, signature, certificat, entretien, informations GPSR) ; livraison et retours en clair ; les auteurs et un contact ; **le vendeur nommé**.

**Panier sans JavaScript.** Chaque action est un POST suivi d'un 303 vers `/panier` ; le choix du pays est un GET. Panier en base, rattaché à la session visiteur (SO2), cookie posé **au premier ajout** seulement (traceur exempté, information due [46], [47]). Prix, stock et port recalculés à chaque affichage, tout changement affiché. Lignes : vignette, titre, format, papier, « exemplaire numéroté (numéro communiqué après le paiement) », prix TTC, « Retirer ». **Un bloc par vendeur**, chacun avec son sous-total, son port, sa date et son bouton « Passer commande » (arbitrage 7).

**Coordonnées et récapitulatif** (une seule page, sans compte) :

| Champ | `autocomplete` | Obligatoire |
|---|---|---|
| Adresse e-mail | `email` | Oui |
| Nom complet | `name` | Oui |
| Adresse, ligne 1 | `address-line1` | Oui |
| Complément | `address-line2` | Non (« facultatif » écrit) |
| Code postal | `postal-code` | Oui |
| Ville | `address-level2` | Oui |
| Pays (zones servies) | `country` | Oui |
| Téléphone (pour le transporteur, à confirmer) | `tel` | Non |
| Facturation différente | `<details>` natif, replié | Non |

Neuf champs visibles. Avant le bouton final : lignes et caractéristiques, prix TTC, port, total, date, droit de rétractation et exceptions, moyens de paiement, restrictions de livraison, lien vers les CGV avec case d'acceptation (version enregistrée) [1], [4]. Bouton : **« Commander avec obligation de paiement »** [1] ; en allemand **« zahlungspflichtig bestellen »** (§ 312j (3) BGB [312]) ; en anglais « Order with obligation to pay » (formule de la directive 2011/83, à vérifier). Erreurs listées en tête et reliées à leur champ, saisies conservées (RGAA 11.10 à 11.13 [242]). Jeton de formulaire à usage unique.

**Réserver un exemplaire pendant le paiement**

1. À la création de la commande, dans une transaction SQLite : prendre pour chaque ligne l'exemplaire libre de plus petit numéro (ligne `edition_copies`), le passer à « réservé » avec `reserved_until`. Rien de libre : retour au panier avec un message. Le numéro n'est montré au client qu'après le paiement (arbitrage 21). `better-sqlite3` est synchrone et l'application tourne en une instance : deux requêtes ne s'entrelacent pas.
2. Échéance = session de paiement (30 min, minimum de Stripe [152] ; un paiement par carte Mollie expire aussi au bout de 30 min [171]) + 5 min.
3. À l'échéance, une minuterie **expire d'abord la session chez le prestataire** [153], [161], puis libère l'exemplaire, puis passe la commande en « expirée ». Si la création de la session avait échoué, la commande est annulée et l'exemplaire libéré dans la même requête, sans appel au prestataire.
4. Paiement confirmé après la libération (cas rare) : réattribuer si l'exemplaire est libre, sinon un autre numéro, sinon remboursement automatique, e-mail d'excuse et alerte.
5. Invariants testés : un exemplaire pour une ligne ; jamais plus d'exemplaires que le plafond ; une réservation a toujours une échéance.

**E-mails transactionnels** (langue de la commande, texte, sans pixel, pièces jointes par SO7). Ils passent par une **boîte d'envoi persistante** (table `outbox`, une ligne par commande et par type, écrite dans la transaction qui change l'état, réessayée par une minuterie, alerte après 24 h) : envoyés « au mieux », la confirmation et l'accusé de rétractation, obligatoires [3], [7], seraient perdus si le serveur s'arrêtait juste après la réponse au webhook ou si le SMTP était en panne. Sans `SMTP_URL`, ou sans relais sous contrat de sous-traitance avec SPF, DKIM et DMARC (J16), la boutique reste fermée.

| Événement | Contenu | Base |
|---|---|---|
| Commande payée | Confirmation du contrat : lignes, prix, port, total, date estimée, CGV, formulaire type de rétractation, lien de suivi | O, au plus tard à la livraison [3], [5] |
| Expédiée | Transporteur, numéro et lien de suivi, facture en pièce jointe (F2), marche à suivre si le colis est abîmé | R ; facture : partie 5 |
| Retard | Nouvelle date, possibilité d'annuler | R [13] |
| Rétractation reçue | Accusé : contenu, date et heure | O [7] |
| Remboursée | Montant, moyen, date ; avoir (partie 5) | Partie 4 |
| Commande expirée | Un seul message, facultatif, sans relance commerciale | C |

L'auteur concerné reçoit « nouvelle commande à préparer », envoyé au mieux (`review.js:23-27`), et une ligne dans « Aujourd'hui ».

**Suivi par lien.** `/suivi/<jeton>` : jeton de 24 octets, haché en base (SO1), comparé à temps constant, `noindex`, `no-store`, `no-referrer` réel, masqué dans les journaux, limité en débit. Contenu : état, historique simple, lignes et numéros d'exemplaire, suivi du transporteur (`rel="noreferrer"`), facture, bouton « **Renoncer au contrat ici** » pendant le délai. Valable jusqu'à la fin du délai de rétractation + 30 jours (C), puis 410. Nouveau lien par « référence + e-mail », réponse toujours identique, envoi à l'adresse enregistrée. La référence de commande (`C-` suivi de 11 caractères de `CODE_CHARS`, environ 54 bits) ne donne aucun accès à elle seule : `/commande/<ref>/merci`, `/payer`, `/interrompu` et `POST /annuler` ne répondent qu'à la session visiteur qui a passé la commande (404 sinon) ; `/renoncer` (référence et e-mail) répond toujours de la même façon (« si une commande correspond, un accusé a été envoyé à son adresse »), envoie l'accusé à l'adresse enregistrée et est limité en débit : il ne confirme jamais qu'une personne a acheté.

**Prix.** Toute information de prix est TTC en euros ; le port est inclus ou indiqué à part (arrêté du 3 décembre 1987 [20]). Une seule devise. Une annonce de réduction se réfère au plus bas prix des 30 jours précédents [21], d'où l'historique des prix. Un prix qui monte au fil de l'édition est possible s'il est annoncé (C).

### 3.5 Exigences

**Vendeurs et offre**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S1 | Chaque produit a un vendeur, le photographe auteur. Une commande n'a qu'un vendeur. Le panier s'affiche en un bloc par vendeur ; une commande et un paiement par bloc. Le vendeur est nommé sur la page de l'œuvre, la commande et la facture. | R | Arbitrages 6, 7 ; § 6.1 |
| S2 | Une œuvre n'est en vente que si sa photo est publiée ; dépublier suspend la vente. | R | `/media/` ne sert que le publié |
| S3 | Usage « vente » dans `readiness` (SO6) : une photo où l'on reconnaît quelqu'un n'est vendable qu'avec un accord explicite « vente de tirages et de fichiers ». Les accords « expositions et tirages » déjà recueillis ne suffisent pas, sauf avis contraire d'un juriste. | O en principe, portée à confirmer | `readiness.js:12`, `:47-60` (cas `site` et `instagram` codés en dur), `encounters.js:15` (portées `site`, `instagram`, `print`, `name`) ; art. 9 C. civ. [42] ; SO6 |
| S4 | Type de produit (tirage original, reproduction, fichier, objet), qui donne le taux de TVA, le seuil de franchise de rattachement et la mention « Reproduction ». | O | § 6.2 ; décret n° 81-255, art. 9 [39] |
| S5 | Édition limitée : au plus 30 exemplaires **par photo**, tous formats et supports confondus, EA comprises par prudence. Plafond non augmentable. Le registre compte aussi les tirages vendus hors du site (exposition). Mise en vente bloquée au-delà. | O pour le statut fiscal | [65], [66] |
| S6 | Pas d'édition ouverte d'une image vendue en édition limitée. | R (à confirmer) | — |
| S7 | Numéro unique (`n/N`, `EA n/m`) : l'exemplaire est réservé à la commande, son numéro montré et figé au paiement ; perdu ou abîmé : retirage du même numéro ; jamais réattribué à un autre acheteur. | R | § 3.3 ; arbitrage 21 |
| S8 | Formats limités par les pixels de l'original et une résolution minimale réglable ; tirage au rapport de l'image avec marge ; dimensions de la feuille et de l'image affichées. | R | § 3.1 |
| S9 | Prix en centimes entiers, TTC, en euros seulement. | O (TTC, euros) | [20] |
| S10 | `/boutique` et `/boutique/<slug>` en trois langues, dans `pages()`, au sitemap ; lien discret depuis `/photo/<slug>`. | R | Carte, § 5.1 |
| S11 | Caractéristiques essentielles complètes (papier, procédé, dimensions, signature, numérotation, certificat, entretien, délai) et informations GPSR (fabricant : nom, adresse postale et électronique ; image ; type ; référence). | O | [1], [4], [29] |
| S12 | Stock affiché exact ; ni compte à rebours ni rareté inventée. | O | Pratique commerciale trompeuse : déclarer faussement qu'un produit ne sera disponible que pendant une période très limitée (art. L121-4, 7°, du Code de la consommation, non lu : à vérifier) |
| S13 | Historique des prix gardé ; toute réduction se réfère au plus bas prix des 30 jours. | O en cas de promotion | [21] |

**Production**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S14 | Éditions limitées livrées à l'auteur, signées à la main, puis expédiées ; jamais d'envoi direct du laboratoire au client. | R (à confirmer, statut fiscal) | [66] |
| S15 | Fichier maître rendu une fois par ligne depuis l'original, hors `variants/`, effacé 30 jours après l'expédition. | R | Carte, § 6.5 |
| S16 | Fichier maître : téléchargement par l'admin (`boutique.commandes`, portée) ; pour un laboratoire (V2), jeton haché de 24 h, téléchargements limités, chemin masqué ; exception écrite dans `Sécurité.md`. | R | [216] ; SO1, SO4 |
| S17 | API de laboratoire (V2) : clé d'idempotence par ligne ; état relu par l'API avant toute transition. | R | [216] |
| S18 | Épreuve de contrôle validée avant d'ouvrir la vente d'un couple photo et papier. | R | — |
| S19 | Production dans l'UE pour les livraisons dans l'UE, l'auteur compris. | R | [137] |

**Panier**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S20 | Panier sans JavaScript : formulaires POST, redirection 303. Le script n'apporte qu'un confort. | I | Règle du projet |
| S21 | Cookie au premier ajout seulement ; session visiteur (SO2) ; `Origin` présent et égal au site (ou `Sec-Fetch-Site: same-origin`) sur tout POST, seul contrôle au premier ajout ; jeton CSRF dès que la session existe ; textes sur les cookies corrigés. | O (information) / I | [46], [47] ; G28, G75 |
| S22 | Toute page qui lit le panier répond `private, no-store` ; l'indicateur de panier n'apparaît que si le cookie existe. | I | Cache Cloudflare [270] |
| S23 | 20 lignes au plus ; quantité plafonnée par œuvre (C : 2) ; limite de débit sur les ajouts. | R | `ratelimit.js` |
| S24 | Prix, stock et port recalculés à chaque affichage ; tout changement signalé. | R | — |
| S25 | Port et fourchette de date sur la page de l'œuvre et dans le panier (France par défaut, pays changeable par GET). | R | [239], [240] |

**Commande**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S26 | Achat sans compte, aucune création de compte proposée. | R | [237], [238], [241] |
| S27 | Formulaire unique : 9 champs au plus, `autocomplete`, erreurs reliées aux champs, saisies conservées. | R | RGAA 11.10-11.13 [242] |
| S28 | Pays limités aux zones servies (France métropolitaine, Monaco, UE au lancement) ; message clair pour les autres. | R / C | [28] |
| S29 | Récapitulatif complet avant validation ; moyens de paiement et restrictions de livraison indiqués au plus tard au début de la commande ; CGV acceptées, version et date enregistrées. | O | [1], [4] |
| S30 | Bouton final « Commander avec obligation de paiement » ; en allemand « zahlungspflichtig bestellen » (§ 312j (3) BGB) ; en anglais « Order with obligation to pay » (à vérifier). Certificat et bon de livraison dans la langue de la commande. | O | [1], [312] |
| S31 | Jeton de formulaire à usage unique : un double envoi renvoie à la même commande. | R | — |
| S32 | Coordonnées scellées (`vault`), pays en clair ; boutique fermée sans `DATA_KEY` (SO9). | I | Carte, § 8.1 ; `vault.js:33-36` |
| S33 | Lignes figées à la commande : titre, auteur, format, papier, prix, taxe, numéro d'exemplaire. Rien ne dépend ensuite du catalogue. | I | — |
| S34 | Page `/conditions-de-vente` en trois langues, sur le modèle de `rights.js` : un texte commun avec une section par vendeur (identité, médiateur, IDU). Contenu au § 6.4. Lien en pied de page. Aucun lien vers la plateforme RLL. | O | [16], [17], [19], [22] |
| S35 | Mentions légales complétées pour chaque vendeur (nom, « EI », adresse, contact, SIRET), contrôlées par `legalMissing`. | O | [22], [37] ; `legal.js:56-63` |

**Stock et réservation**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S36 | Réservation dans la transaction de création de la commande ; une seule commande « à payer » **par vendeur** et par session visiteur (un panier mixte donne deux commandes, arbitrage 7) ; création limitée (par exemple 10 par heure et par adresse). | I | § 3.4 |
| S37 | Session de paiement de 30 min ; réservation de 35 min. | R | [152], [171] |
| S38 | Exemplaire libéré seulement après expiration confirmée chez le prestataire (`expire` réussi ou statut `expired`). | I | [153], [161] |
| S39 | Paiement reçu sur une commande expirée ou annulée : réattribuer si possible, sinon rembourser intégralement, prévenir le client, alerter. | I | — |
| S40 | Invariants testés : plafond jamais dépassé, un exemplaire pour une ligne, échéance sur chaque réservation. | R | — |

**Expédition**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S41 | Zones et tarifs paramétrables : zone × classe d'envoi, premier article, article suivant, seuil de port offert, délais. | R | — |
| S42 | Formats ≤ environ 50 × 70 cm expédiés à plat ; tube seulement au-delà. | R | [230], [231] |
| S43 | Envoi toujours suivi ; signature et assurance au-delà d'un seuil réglable (C : 150 €). | R (le vendeur porte le risque) | [14], [232] |
| S44 | Suisse, si elle est ouverte : DAP avec mention visible, CN23 et facture jointes. | O (CN23) / C | [141] |
| S45 | Plusieurs envois possibles par commande (envoi partiel, retirage) ; une facture par envoi, pour les lignes expédiées (F2). | R | — |
| S46 | Date promise enregistrée, alerte en cas de dépassement ; sans date annoncée, 30 jours au plus. | O (30 jours) | [13] |
| S47 | Pas de choix de point relais en V1 (widget tiers contraire à la CSP) ; plus tard, recherche par code postal côté serveur. | R | CSP |

**Rétractation, retours, e-mails, suivi**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S48 | Fonction « Renoncer au contrat ici » accessible pendant tout le délai (pied de page `/renoncer` et page de suivi), étape « Confirmer la rétractation », accusé de réception immédiat sur support durable (contenu, date, heure), envoyé par la boîte d'envoi. Libellés allemands « Vertrag widerrufen » puis « Widerruf bestätigen » (§ 356a BGB [313]) ; anglais, ceux de la directive (UE) 2023/2673 (« withdraw from contract here », « confirm withdrawal », à vérifier [9]). Accès sans compte : référence + e-mail (réponse uniforme, accusé à l'adresse enregistrée, limite de débit), ou lien de suivi. Sans date de livraison confirmée, la fonction reste ouverte jusqu'à expédition + transit maximal + 14 jours + marge (annexe paiement, § 2.2). | O depuis le 19/06/2026 | [6], [7], [8], [9], [313] |
| S49 | Exemplaire retourné intact : de nouveau libre sous le même numéro ; abîmé : détruit, retiré, noté. | R | — |
| S50 | Colis abîmé : photos demandées, réclamation au transporteur, retirage du même numéro. | R | [232] |
| S51 | Fichiers (V3) : case non cochée d'accord exprès et de renonciation à la rétractation, reprise dans la confirmation. | O pour perdre le droit | [11] |
| S52 | Confirmation de commande au paiement, sur support durable, avec CGV et formulaire type de rétractation, envoyée par la boîte d'envoi persistante (P33). | O | [3], [5] |
| S53 | E-mails dans la langue de la commande, en texte, sans pixel ; boîte d'envoi persistante ; boutique fermée sans SMTP ni relais sous contrat (J16). | I | SO7 |
| S54 | Suivi `/suivi/<jeton>` : jeton haché, `noindex`, `no-store`, `no-referrer` réel, chemin masqué, limite de débit, validité fin du délai + 30 jours (C) ; fin du délai calculée sans date de livraison selon la règle de S48 (test). | I | SO1, SO3, SO4 |
| S55 | Nouveau lien par « référence + e-mail » ; réponse uniforme ; envoi à l'adresse enregistrée seulement. `/commande/:ref/payer`, `/interrompu` et `POST /annuler` liés à la session visiteur qui a commandé ; référence d'au moins 50 bits (11 caractères de `CODE_CHARS`). | I | — |

**Admin et obligations annexes**

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| S56 | Permissions `boutique.*` avec portée « les miennes » (§ 7.5) ; remboursement réservé à `boutique.rembourser` ; portée limitée au vendeur lié, même pour un administrateur, si D16 le retient. | I | Carte, § 3 |
| S57 | Toute transition écrit `order_events` (ajout seul) ; routes d'admin par identifiant, jamais par jeton ni e-mail. | I | Constat C4 |
| S58 | « Aujourd'hui » : commandes payées à préparer, envois en retard, rétractations à traiter, éditions presque épuisées, envois sans suivi après 3 jours, paiements sans exemplaire (S39). | R | `todo.js` |
| S59 | Prix d'achat et marges visibles seulement dans l'admin. | R | — |
| S60 | Certificat d'authenticité et bon de préparation en HTML imprimable, sans dépendance ; certificat signé à la main (contenu au § 3.1). | R (O sur demande pour les mentions [39]) | Arbitrage 10 |
| S61 | Vérification publique d'un certificat (V2) : code imprimé de 12 caractères au moins, limite de débit, aucune donnée sur l'acheteur. | C | Constat C5 (code de 3 caractères trop court) |
| S62 | Adhésion à un éco-organisme (emballages) avant la première vente ; IDU dans les CGV. | O | [33], [34] |
| S63 | `privacy.js`, registre RGPD et information sur les cookies mis à jour dans la même PR : clients, paiements, factures, prestataire de paiement, transporteur, relais SMTP, durées. | O | `privacy.js:1-3` ; [44] |
| S64 | Purges : panier 30 jours sans activité ; données personnelles d'une commande non payée après 30 jours (montants gardés) ; e-mail, téléphone et adresses d'une commande payée 3 ans après la livraison (« durée de la relation » chiffrée, C), les factures gardant l'identité 10 ans ; fichiers maîtres 30 jours après l'expédition. Test de chaque purge. | C (à valider) | `app.js:184-196` ; [53] |
| S65 | Parcours d'achat et de rétractation conformes au RGAA ; aucun script, police ni carte tiers. | R | [31], [242] |
| S66 | Royaume-Uni non servi au lancement ; fichiers, quand ils viendront, vendus dans l'UE seulement. | R | [134], [135] |
| S67 | Tests de non-accès hors `/admin` (SO8) : jeton de suivi mal formé, expiré, autre commande ; panier sans CSRF ; `Origin` étranger **ou absent** ; `/commande/:ref/payer` depuis une autre session : 404 ; `noindex` et `no-store` ; jetons absents des journaux. | I | Carte, § 11 |
| S68 | Tests métier : réservation concurrente, échéance, paiement tardif, plafond, idempotence, prix figés, rétractation (accusé), faux prestataire et faux laboratoire injectés (modèle `test/oidc-provider.js`). | I | Carte, § 11 |
| S69 | Export et effacement des données d'un acheteur retrouvées par l'index de son e-mail (`orders.email_idx`), dans l'écran RGPD existant ; factures, avoirs et livre des recettes exclus de l'effacement (obligation légale, RGPD art. 17.3.b). | O | RGPD, art. 15, 17 et 17.3.b [44] ; `docs/wiki/Développer.md:27` |

### 3.6 Écrans d'administration

Branchés comme `voyages.js` dans `server/routes/boutique.js` (routes `P`/`W`, journal automatique, portée « les miennes »).

| Écran | Permission | Contenu |
|---|---|---|
| Fiche photo, onglet « Vente » | `boutique.catalogue` | Mettre en vente ou retirer, taille de l'édition et EA (≤ 30 contrôlé), formats permis par les pixels, prix TTC, coût et marge, épreuve validée, état de l'accord « vente », aperçu |
| Formats et papiers | `boutique.reglages` | Dimensions, laboratoire, coût, poids, classe d'envoi, délais |
| Commandes | `boutique.commandes` | Liste par état, auteur, période ; fiche : lignes figées, exemplaires, paiement (lecture), historique, envois, rétractation ; adresse descellée seulement sur la fiche |
| Préparation | `boutique.commandes` | File par état : à commander au laboratoire, attendu, reçu, à signer, à expédier ; actions en un clic (POST avec CSRF) ; bon de préparation et certificat imprimables ; fichier maître |
| Retours et rétractations | `boutique.commandes`, `boutique.rembourser` | Déclarations, retours attendus, état à réception, remise en stock ou destruction, remboursement |
| Réglages de la boutique | `boutique.reglages` | Ouverture ou fermeture, zones et tarifs, seuils, délais, textes, fabricant (GPSR), IDU, durées |
| Ventes | `boutique.commandes` | Ventes par œuvre, format et mois, sans données personnelles, séparées des statistiques de visite |
| Éditions | `boutique.catalogue` | Par photo : plafond, exemplaires attribués et restants, saisie d'un tirage vendu hors du site, certificat |

---

## Partie 4. Paiement

Comparatif complet, séquences, code de vérification de signature et modèle de données : [annexe Paiement et facturation](annexe-paiement-facturation.md).

### 4.1 Ce que le site impose

| Contrainte du projet | Conséquence |
|---|---|
| Rien n'est chargé d'un autre site (CSP `script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `app.js:47-58`) | Aucun formulaire de carte intégré (Stripe Elements, Mollie Components, iframes) : ils exigent d'ouvrir `script-src`, `frame-src` et `connect-src` [155]. Seule une **page hébergée chez le prestataire**, atteinte par redirection, convient. |
| Le site marche sans JavaScript | « Commander » en POST, réponse 303 vers le prestataire, retour par une URL GET. Pas de bouton PayPal en JavaScript. |
| `form-action 'self' <IdP>` (`app.js:55`) ; Chrome contrôle aussi la redirection qui suit un formulaire [255] | Ajouter l'origine de la page de paiement à `form-action`, par la liste déjà passée à `csp()` (`app.js:261`). Pour Stripe : `https://checkout.stripe.com` [152]. |
| Une instance, SQLite, serveur personnel derrière Cloudflare Tunnel | Le serveur peut être éteint pendant un paiement : webhooks rejoués et rattrapés. Les transactions `better-sqlite3` suffisent à réserver le stock. |
| Coût quasi nul | Pas d'abonnement au volume visé. |

### 4.2 Cadre réglementaire

| Sujet | Règle au 15/10/2026 | Effet | Niveau |
|---|---|---|---|
| Authentification forte (DSP2) | Exemption possible sous 30 € par opération (cumul de 100 € ou 5 opérations) [199]. DSP3 et règlement PSR : accord politique fin novembre 2025, application vers 2028 (à confirmer) [200]. | Un panier de 80 € passe par 3-D Secure 2, géré par la page hébergée. Rien à coder. | O (porté par le prestataire) |
| PCI DSS 4.0.1 | SAQ A pour qui externalise toute la page de paiement. Depuis le 31 mars 2025, le marchand confirme que son site « n'est pas exposé à des attaques par scripts » [198]. | La CSP actuelle est l'argument. Attestation chaque année. | O (contractuel : règles des réseaux de cartes, pas un texte de loi) |
| Bouton de commande, moyens de paiement | « Commande avec obligation de paiement » ; moyens de paiement indiqués au plus tard au début de la commande [1]. | S29, S30 | O |
| Remboursement après rétractation | Sous 14 jours, par le même moyen de paiement sauf accord exprès ; différé possible jusqu'à la récupération du bien ou la preuve de son expédition [10]. | Remboursements pilotés depuis l'admin ; Stripe ne rembourse que vers le moyen d'origine [149]. | O |
| Encaisser pour autrui | Encaisser pour reverser à un tiers est un service de paiement réservé aux prestataires agréés [93], [94] (à confirmer). | Un photographe n'encaisse jamais la vente de l'autre (§ 4.5). | O |

### 4.3 Prestataires comparés

Tarifs publics pour un vendeur établi en France, TTC sauf « HT ». « ? » : information non publiée ou illisible au 15/10/2026.

| Prestataire | Abonnement | Carte EEE courante | Autres cartes | Wallets, Wero | Litige | Versement | Webhook | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Stripe** [142] | Aucun | 1,5 % + 0,25 € | Premium EEE 2,8 % + 0,25 € ; hors EEE 3,15 % + 0,25 € ; Royaume-Uni 2,5 % + 0,25 € ; +2 % si conversion | Apple Pay, Google Pay au tarif carte ; **Wero 0,29 €** [143] | 20 €, +20 € pour contester (rendus si gagné) | 7 à 14 jours la première fois, puis 3 jours ouvrés [148] | Signé HMAC-SHA256, réessais 3 jours [150] | **Recommandé** |
| **Mollie** [163] | Aucun | Visa, Mastercard 1,80 % + 0,25 € ; **Cartes Bancaires 1,20 % + 0,25 €** | Commerciales 2,90 % + 0,25 € ; hors EEE 3,25 % + 0,25 € | Wero 0,90 % + 0,25 €, « bientôt » en France (second semestre 2026) [164] | 25 € par litige perdu (à confirmer [170]) | 5 versements par mois gratuits, puis 0,25 € | Identifiant seul, relu par l'API ; 10 envois sur environ 26 h [166] | **Alternative** |
| Payplug [172] (tous les tarifs de la page sont HT) | 10 € HT par mois (Starter) | 1,5 % + 0,25 € HT | Business 2,5 % + 0,25 € HT ; hors zone euro 2,9 % + 0,25 € HT | Wero en France sur devis ; « iDEAL \| Wero » 0,39 € HT aux Pays-Bas seulement | 18 € TTC [174] | 3 à 8 jours ouvrés [175] | Non signé, relecture obligatoire ; URL de paiement valable 15 min [176] | Abonnement pesant |
| SumUp [178] | Aucun (« Paiements Plus » 19 € par mois) | 2,50 % [179] | ? | Apple Pay, Google Pay | ? | Lendemain sur compte SumUp | Identifiant seul [181] | Cher en pourcentage |
| PayPal [183] | Aucun | 2,90 % + 0,35 € | +1,99 % hors EEE ; conversion 3,0 % | — | 14 € (28 € si volume élevé) | Solde PayPal | Signé ; 25 envois sur 3 jours [184] | Moyen de plus, pas principal |
| Stancer [186] | Aucun | **0,7 % + 0,15 € HT** | Au-delà, interchange à prix coûtant + 10 % ; hors EEE 2,5 % + 0,25 € HT | Non documentés | Forfait (montant non lu) [189] | **7 jours de cantonnement**, anticipé à 2 % [188] | « Synchrones », autorisation puis capture sous 7 jours [187] | À revoir si le volume monte |
| Lydia Pro [192] | Aucun | 1,90 % HT + 0,10 € HT | ? | — | ? | 2 à 3 jours ouvrés | API non documentée publiquement | Pensé pour encaisser une demande |
| Qonto [194] | Compte Qonto obligatoire (Basic 9 € HT par mois) | Dès 1,4 % + 0,25 € | ? | — | ? | Jour ouvré suivant [195] | Signature à confirmer [196] | Seulement si le compte pro y est déjà |

Les montants HT (Stancer, Lydia, Payplug, abonnements) coûtent la TVA en plus à un vendeur en franchise, qui ne la récupère pas, si elle est facturée : à vérifier sur la première facture.

### 4.4 Exemple chiffré : 20 commandes de 80 € par mois

Hypothèses : 1 600 € de ventes par mois, ni litige ni remboursement.

| Prestataire | Hypothèse | Par commande | Par mois | Par an |
|---|---|---|---|---|
| Stancer | Carte EEE (HT) | 0,71 € | 14,20 € | 170,40 € |
| Stripe | Wero, si le client paie ainsi | 0,29 € | 5,80 € | 69,60 € |
| Mollie | Carte routée sur le réseau CB | 1,21 € | 24,20 € | 290,40 € |
| **Stripe** | Carte EEE courante | 1,45 € | **29,00 €** | 348,00 € |
| Lydia Pro | Carte (HT) | 1,62 € | 32,40 € | 388,80 € |
| Mollie | Visa ou Mastercard | 1,69 € | 33,80 € | 405,60 € |
| Qonto | Lien de paiement + Basic 9 € HT | 1,37 € | 36,40 € | 436,80 € |
| Payplug Starter | Carte (HT) + abonnement 10 € HT | 1,45 € HT | 39,00 € HT | 468,00 € HT |
| SumUp | Tarif en ligne | 2,00 € | 40,00 € | 480,00 € |
| PayPal | Paiement PayPal EEE | 2,67 € | 53,40 € | 640,80 € |

Avec un mélange plausible (16 cartes courantes, 2 premium, 1 hors EEE, 1 Wero, ou une carte de plus là où Wero n'a pas de prix public) : Stancer 15,03 € HT (borne basse), Mollie 29,04 €, Stripe 31,24 €, Payplug 41,72 € HT par mois. **Hors PayPal et abonnements, l'écart reste sous 20 € par mois ; un seul litige perdu coûte plus.** Le choix porte donc sur la fiabilité de l'intégration et la prévention des litiges.

### 4.5 Deux photographes : un compte de paiement par vendeur

- **Retenu** : chacun vend ses œuvres (S1) et a **son propre compte** chez le prestataire, avec ses clés. Le panier se règle en un paiement par vendeur. Le site ne devient pas une plateforme de paiement.
- **Écarté au départ** : un paiement réparti entre deux comptes (Stripe Connect, Mollie Connect). Le compte « plateforme » encaisse et supporte remboursements, litiges et frais [158], alors que le vendeur légal est chaque photographe ; Connect coûte 2 € par compte actif et par mois + 0,25 % + 0,10 € par versement [147] ; obligations probables d'opérateur de plateforme (DAC7 [90], [91]). Seulement après avis juridique.
- **Interdit** : encaisser sur le compte de l'un la vente de l'autre pour la lui reverser [93], [94].
- Une colonne `seller_id` sur les produits et les commandes dès la première migration permet de changer de montage sans tout reprendre.

### 4.6 Recommandation : Stripe Checkout en page hébergée

| Critère | Pourquoi Stripe |
|---|---|
| CSP et site sans JavaScript | Page hébergée sur `checkout.stripe.com`, redirection 303, rien sur nos pages |
| Coût | Sans abonnement ; environ 29 à 31 € par mois au volume de l'exemple ; Radar Lite et 3DS inclus [142] |
| Sûreté | Webhooks signés HMAC-SHA256 avec horodatage anti-rejeu [150] ; clés d'idempotence sur tout POST [154] ; version d'API figée |
| Édition limitée | `expires_at` de 30 min à 24 h et API d'expiration d'une session [152], [153] ; cas documenté par Stripe (« Manage limited inventory ») [161] |
| Remboursements | Totaux ou partiels, plusieurs par paiement, vers le moyen d'origine [149] |
| Moyens | Cartes (dont CB), Apple Pay, Google Pay, Wero, PayPal, activés dans le tableau de bord [156] ; la session reçoit en plus une liste explicite (`payment_method_types`) : sans elle, Checkout montre tout ce qui est activé, y compris un moyen différé qui donnerait une session `complete` mais non payée (P15) |
| Ouverture | Compte « individual » possible : l'outil de Stripe pour la France demande identité, adresse, date de naissance, site et IBAN, sans SIREN à l'ouverture (outil prévu pour Connect ; à confirmer pour un compte direct) [159] |

Points de vigilance : prestataire non européen (entité contractante Stripe Payments Europe Ltd, Irlande ; services de paiement de l'EEE fournis par Stripe Technology Europe Ltd, établissement de monnaie électronique agréé en Irlande [302] ; Stripe responsable conjoint pour certaines finalités [160], [162]) ; litige à 20 € ; page aux couleurs de Stripe, portefeuille « Link » désactivable (C).

**Alternative : Mollie**, si les auteurs préfèrent un prestataire européen ou si la part de cartes CB est élevée. L'intégration reste la même : le webhook ne porte que l'identifiant, relu par `GET /v2/payments/:id`, ce qui tient lieu de signature [166]. À confirmer avant de choisir : frais de remboursement et de litige, ouverture de Wero en France, statut exigé à l'inscription.

**Wero.** Portefeuille paneuropéen d'EPI, paiement de compte à compte par virement instantané validé dans l'application bancaire, sans litige [156]. Premières transactions en France le 20 avril 2026 [197] ; disponibilité générale annoncée pour l'automne 2026 [177]. On y accède par le prestataire : Stripe (0,29 € [143] ; la documentation liste les comptes français et les clients en France, remboursements jusqu'à 730 jours, pas de litige [156] ; Wero y est interdit ou restreint pour certaines catégories, dont « économie des créateurs », à vérifier pour la vente de tirages), Payplug (sur devis en France), Mollie (bientôt). Avec une page hébergée, l'activer demande seulement de l'ajouter à la liste des moyens passée à la session ; vérifier en mode test qu'il vaut « payé » dès la fin de la session (TP12).

**Réversibilité.** Toute la logique passe par un adaptateur (`server/payments/stripe.js`, éventuellement `mollie.js`) à cinq opérations : `createCheckout(order)`, `getStatus(ref)`, `parseWebhook(rawBody, headers)`, `refund(paymentId, amount, key)`, `expire(ref)`. Changer de prestataire revient à écrire un fichier et à changer `PAYMENT_PROVIDER`.

### 4.7 Intégration, en résumé

```
Client                    Nicephos (Fastify + SQLite)                          Stripe
 | POST /commande ───────▶ transaction : prix et stock relus en base,
 |  (_csrf, Origin, CGV)    commande « a_payer », exemplaires réservés 35 min
 |                          POST /v1/checkout/sessions (Idempotency-Key, expires_at 30 min,
 |                          client_reference_id = référence aléatoire, locale) ─────────────▶
 |◀── 303 checkout.stripe.com ◀──────────────────────────────────────────── { id, url } ──|
 |──── carte, Apple Pay, Wero, 3-D Secure ────────────────────────────────────────────────▶|
 |                          ◀════ POST /paiement/webhook/stripe/<préfixe> (Stripe-Signature) ═|
 |                          signature vérifiée sur le corps brut avec le secret du vendeur ;
 |                          événement noté (fournisseur, compte, id), traité s'il ne l'a pas été ;
 |                          settle() : vendeur, statut payé, montant, devise, référence = commande ?
 |                          → « payee », exemplaires « vendu », e-mails en boîte d'envoi ── 200 ─▶|
 |◀── 303 /commande/<ref>/merci ◀──────────────────────────────────────────────────────────|
 | GET /merci ───────────▶ si encore « a_payer » : relecture de la session, settle()
```

- **Une seule fonction de règlement**, `settle(orderId)`, appelée par le webhook, par la page de retour et par une minuterie de rapprochement (toutes les 5 min et au démarrage). Elle relit l'état chez le prestataire et fait une mise à jour conditionnelle (`… WHERE pay_status = 'a_payer'`). L'ordre et les doublons d'événements n'importent pas [150], [151].
- **Webhook** : plugin encapsulé qui lit le corps brut (`addContentTypeParser('application/json', { parseAs: 'buffer' })`, Fastify 5.12.5 accepte de remplacer l'analyseur JSON dans un contexte encapsulé), hors `pages()`, sans CSRF ni statistiques. **Une adresse par vendeur** (`/paiement/webhook/stripe/<préfixe>`), dont la route choisit le secret ; `settle()` relit avec la clé du vendeur de la commande ; un événement signé par l'un ne règle jamais une commande de l'autre (`anomalie`). Signature `v1` seule, tolérance de 5 min, comparaison à temps constant, plusieurs secrets acceptés pour la rotation (24 h de recouvrement chez Stripe [150]). Clé d'unicité (fournisseur, compte, événement) et colonne `processed_at` : un événement reçu mais dont le traitement a échoué est retraité au réessai, au lieu d'être pris pour un doublon.
- **États de paiement** : `a_payer`, `payee`, `echouee`, `expiree`, `annulee`, `anomalie`, `remboursee_partiellement`, `remboursee`, `en_litige`, `litige_perdu`. **États de préparation**, séparés : `a_preparer`, `en_preparation`, `expediee`, `livree`, `retour_attendu`, `retournee`, `close`, `annulee_avant_envoi` (nom distinct de l'état de paiement `annulee`). La préparation ne bouge que si le paiement est `payee`. Sans date de livraison confirmée, `close` attend expédition + transit maximal + 14 jours + marge (S48).
- **Rapprochement** : la page de retour relit la session de façon synchrone ; sinon elle affiche « confirmation en cours » dans un message `role="status"` avec un lien « Actualiser », **sans rafraîchissement automatique** (`<meta http-equiv="refresh">` va contre le RGAA, critère 13.1 [242]) ; la minuterie règle les commandes restées « à payer » et retraite les événements non traités ; un rapprochement quotidien compare paiements, remboursements, litiges et frais aux commandes (un remboursement ou un litige dont le webhook est perdu au-delà des 3 jours de réessais est ainsi rattrapé) ; une alerte signale des commandes réglées sans webhook depuis 24 h (point d'entrée probablement bloqué).
- **Cloudflare** : le « Bot Fight Mode » peut défier le trafic d'API et ne se contourne par aucune règle [201]. Le vérifier désactivé ; sinon, le paiement tient sur le seul rapprochement. Aucune règle de cache sur `/paiement/` ni `/commande/`.
- **Remboursement** : ligne `refunds` écrite d'abord, puis `POST /v1/refunds` avec `Idempotency-Key: remboursement-<id>` [149], [154] ; somme des remboursements ≤ montant payé ; échec signalé dans « Aujourd'hui » ; date limite légale affichée ; avoir (partie 5).
- **Litige** : état `en_litige`, alerte, préparation suspendue ; preuves gardées dès la commande (CGV et version, adresse, suivi, échanges). Prévention : libellé de relevé qui nomme le vendeur (« NICEPHOS » suivi de son nom, dans la longueur permise par Stripe, à vérifier), confirmation immédiate.
- **E-mails** : jamais envoyés « au mieux » depuis le webhook ; écrits dans la boîte d'envoi persistante (`outbox`) dans la transaction de `settle()`, envoyés et réessayés par une minuterie.
- **Secrets** : `PAYMENT_PROVIDER`, `STRIPE_API_VERSION`, et pour chaque vendeur `STRIPE_SECRET_KEY_<préfixe>` (clé **restreinte** `rk_…`) et `STRIPE_WEBHOOK_SECRET_<préfixe>` (liste, pour la rotation). Clé `live` refusée hors production, clé `test` refusée en production sauf drapeau explicite.
- **Données** : journaux avec identifiants seulement ; rien de personnel dans `metadata` ; l'adresse de livraison reste chez nous, scellée ; aucune donnée de carte ne transite (la CNIL interdit de toute façon de garder le cryptogramme [54]).

### 4.8 Exigences

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| P1 | Moyen de paiement saisi uniquement sur la page hébergée du prestataire ; aucun script, iframe ni appel du prestataire sur nos pages. | I | SAQ A [198] ; [155] |
| P2 | Origine de la page hébergée ajoutée à `form-action` par la liste existante (`app.js:261`) ; aucune autre directive élargie. | I | [255] |
| P3 | Un compte de paiement par vendeur ; jamais d'encaissement pour l'autre ; paiement réparti seulement après avis juridique. | O | [93], [94] |
| P4 | Montant envoyé au prestataire calculé en base depuis les lignes figées (S33) ; aucun montant ne vient du formulaire. | I | — |
| P5 | Webhook hors `pages()`, plugin encapsulé à corps brut, taille limitée (256 Kio), sans CSRF, sans redirection, sans statistiques ; une route par vendeur (`/paiement/webhook/stripe/:prefixe`), secret choisi par la route. | I | [150] ; arbitrage 22 |
| P6 | Signature HMAC-SHA256 sur `t.corps`, schéma `v1` seul, tolérance 5 min, temps constant, plusieurs secrets. Prestataire sans signature : identifiant seul, relecture par l'API. | I | [150], [166], [176], [181] |
| P7 | Idempotence : clé (fournisseur, compte, événement) et `processed_at` (un événement non traité est retraité) ; toute transition par `settle()`, qui vérifie le vendeur, relit avec sa clé et fait une mise à jour conditionnelle. Tests : échec de `settle` puis réessai ; événement de A sur une commande de B (`anomalie`). | I | [150], [151] |
| P8 | Montant, devise et référence comparés à la commande ; toute différence : état `anomalie`, pas d'expédition, alerte. | I | — |
| P9 | La page de retour n'est pas une preuve : elle appelle `settle()` ; sinon « confirmation en cours » (`role="status"`) avec un lien « Actualiser », sans rafraîchissement automatique. | I | [151] ; RGAA 13.1 [242] |
| P10 | Rapprochement toutes les 5 min et au démarrage (commandes « à payer », événements non traités) ; rapprochement quotidien des versements, des remboursements et des litiges ; anomalies dans « Aujourd'hui ». | I | Serveur personnel ; [150] (3 jours de réessais) |
| P11 | Appels sortants : `fetch` injectable (comme `translate.js:10`), délai de 10 s, `Idempotency-Key` sur tout POST, version d'API figée. | R | [154] |
| P12 | États validés en JavaScript, sans `CHECK` ; `order_events` en ajout seul ; paiement et préparation séparés. | I | Arbitrage 12 |
| P13 | Remboursements totaux et partiels depuis l'admin (`boutique.rembourser`) : montant ≤ reste, clé = identifiant du remboursement, suivi par webhook, échéance légale affichée, même moyen de paiement. Après une rétractation : « la totalité des sommes versées, y compris les frais de livraison », sauf le supplément d'une livraison plus chère choisie par le client ; rétractation partielle : règle de l'annexe paiement, § 2.6 (part des frais de livraison à confirmer avec un juriste). | O | [10], [149] |
| P14 | Litiges : état, alerte, préparation suspendue, preuves gardées dès la commande. | R | [142] |
| P15 | Moyens au départ : cartes, Apple Pay, Google Pay, puis Wero ; pas de moyens différés ; PayPal au choix. Liste explicite passée à chaque session (`payment_method_types`), jamais le seul tableau de bord ; une session `complete` avec `payment_status = unpaid` est traitée (réservation prolongée, alerte, aucun appel à `expire`). | C (moyens) / I (liste, cas `unpaid`) | [152] |
| P16 | 3-D Secure 2 laissé au prestataire, sans option pour le contourner. | O | [199] |
| P17 | Secrets en variables d'environnement, un jeu par vendeur ; clé restreinte ; refus d'une clé `live` hors production et d'une clé `test` en production sauf drapeau. | I | — |
| P18 | Journaux : identifiants seulement ; ni corps de webhook, ni signature, ni e-mail, ni en-tête `Authorization`. | I | RGPD [44] |
| P19 | Rien de personnel dans `metadata` ni `client_reference_id` ; référence de commande aléatoire. Seul l'e-mail peut être prérempli chez le prestataire (C). | R | Minimisation |
| P20 | Aucune donnée de carte chez nous ; seuls l'identifiant de transaction et le type de moyen (`card`, `wero`…) sont gardés. | O | [54] |
| P21 | Faux prestataire local qui signe ses webhooks (modèle `test/oidc-provider.js`) et tests dans la PR ; recette en mode test avant la production. | I | Règle du projet |
| P22 | Adaptateur à cinq opérations ; aucune route ne parle directement au prestataire. | R | § 4.6 |
| P23 | Bot Fight Mode vérifié désactivé, ou paiement réglé par le seul rapprochement ; aucun cache sur `/paiement/` ni `/commande/`. | I (à vérifier) | [201] |
| P24 | Horloge du serveur synchronisée (NTP), sinon la tolérance de 5 min rejette les webhooks. | R | [150] |
| P25 | Libellé de relevé bancaire explicite, qui nomme le vendeur (« NICEPHOS » suivi de son nom ; longueur permise par Stripe à vérifier) : « NICEPHOS » seul effacerait le vendeur (§ 6.1, société de fait). | R | Prévention des litiges |
| P26 | La facture est émise par notre système (partie 5) ; le reçu du prestataire n'est qu'un complément, désactivable (C). | R | [146] |
| P27 | Attestation PCI SAQ A chaque année ; argument d'éligibilité (CSP `'self'`, aucun script tiers) écrit dans `Sécurité.md`. | O (contractuel) | [198] |
| P28 | E-mail « commande payée » mis une seule fois dans la boîte d'envoi, à la transition (unicité commande et type), envoyé après la réponse au webhook ; webhook servi en moins de 10 s. | I | [151] ; P33 |
| P29 | « Paiement interrompu » : reprendre (lien GET vers la même session ouverte) ou annuler (POST avec CSRF, expiration, libération). | R | Parcours sans JavaScript |
| P30 | Alerte quotidienne si des paiements ont été réglés sans webhook depuis 24 h. | R | — |
| P31 | Colonne `seller_id` sur les produits et les commandes dès la première migration. | I | § 4.5 |
| P32 | Si un vendeur devient redevable de la TVA : la dispense de logiciel de caisse est probable tant que Checkout n'accepte que des cartes (Apple Pay et Google Pay compris) et des virements bancaires (Wero), « y compris lorsqu'il recourt à un prestataire de services de paiement » ([88] § 37, exemple 1) ; elle tombe avec tout autre moyen (carte cadeau, solde de portefeuille). À confirmer avec l'expert-comptable pour Wero et PayPal ; sinon faire certifier le module (§ 6.6). | O | [88] |
| P33 | Boîte d'envoi persistante (`outbox`) : unicité (commande, type), écrite dans la transaction de la transition, réessais par minuterie à délai croissant, alerte dans « Aujourd'hui » après 24 h ; tests « SMTP en panne » et « arrêt après la réponse au webhook ». | I | [3], [7] (confirmation et accusé obligatoires) |
| P34 | Échec de création de la session de paiement : commande annulée et exemplaires libérés dans la même requête ; la minuterie libère sans appeler `expire` une commande restée sans session. | I | Annexe paiement, § 2.1 |

---

## Partie 5. Facturation et comptabilité

Détail des outils, modèle de données complet (factures figées, livre des recettes, e-reporting) : [annexe Paiement et facturation](annexe-paiement-facturation.md).

### 5.1 Faut-il une facture ?

| Cas | Facture obligatoire ? | Source |
|---|---|---|
| Tirage vendu à un particulier en France | Le CGI ne l'impose pas ; service-public la dit obligatoire « pour les ventes à distance » | [86], [132] |
| Le particulier la demande | Oui | [132] |
| Particulier d'un autre État de l'UE (vente à distance) | Oui, sauf si le vendeur passe par le guichet unique OSS | [78], [86] |
| Fichier vendu à un particulier (prestation, à confirmer) | « Note » obligatoire à partir de 25 € TTC, sinon sur demande | [85], [132] |
| Client professionnel ou personne morale | Oui | [78], [38] |
| Vente à distance à un consommateur | Confirmation du contrat sur support durable, au plus tard à la livraison, avec le formulaire de rétractation (ce n'est pas une facture) | [3] |

**Retenu (R)** : une facture pour **chaque envoi**, pour les lignes qu'il contient, émise à l'expédition (tirage) ou à la mise à disposition (fichier), jamais au paiement (arbitrage 9). Une commande en deux envois (S45) donne deux factures ; un avoir renvoie à la facture de l'envoi concerné ; l'e-reporting retient la date de chaque facture.

### 5.2 Mentions

| Mention | Vendeur en franchise, client particulier | TVA due | Client professionnel | Source |
|---|---|---|---|---|
| Date d'émission ; numéro unique, chronologique et continu | Oui | Oui | Oui | [79] |
| Nom, adresse et SIREN du vendeur ; « entrepreneur individuel » ou « EI » | Oui | Oui | Oui | [79], [37] |
| Nom et adresse du client | Oui | Oui | Oui | [79] |
| Date de livraison si elle diffère | Oui | Oui | Oui | [79] |
| Quantité, dénomination précise, prix unitaire HT | Oui | Oui | Oui | [79] |
| Taux, base et montant de TVA par taux | Non | Oui | Oui | [79] |
| « TVA non applicable, art. 293 B du CGI » jusqu'au 31/12/2026, puis « TVA non applicable, art. L. 233-3 du CIBS » | **Oui** | — | Si franchise | [56], [57], [131] |
| Numéros de TVA intracommunautaire | Non | Vendeur | Les deux | [79] |
| **Depuis la réforme** : SIREN du client (professionnel), adresse de livraison si différente, catégorie (biens, services ou les deux), option sur les débits | Recommandé dès la V1 (application aux particuliers à confirmer) | Idem | Obligatoire pour les factures d'une micro ou PME émises à partir du 1/9/2027 | [79], [103] |
| Date d'échéance ou « acquittée le … par carte », escompte, pénalités de retard, indemnité forfaitaire de recouvrement de 40 € (réclamable seulement à un client professionnel), bon de commande | — | — | Oui | Code de commerce, L441-9 [38] ; [131] |
| Tirage original : titre, « exemplaire 3/30 », format, papier, procédé, date du tirage | Recommandé | Idem | Idem | [39], [66] |

Les dispenses de certaines mentions sous 150 € HT [79] ne sont pas utilisées : le gain est nul pour un site.

### 5.3 Numérotation, avoirs, piste d'audit

- **Une série par vendeur et par année** : `S-2027-0001`, `J-2027-0001` (lettre reprise de `authors.card_prefix`, `015_rencontres.sql:3`). Plusieurs séries sont admises si chacune est chronologique et continue ; un mandataire qui facture au nom d'un vendeur garde une série propre au vendeur [87].
- **Les avoirs partagent la série des factures** (« AVOIR n° S-2027-0042 »). Aucun numéro réservé à l'avance, aucun brouillon numéroté. La commande a son propre numéro (`C-…`).
- **Une facture émise ne change jamais.** Une erreur se corrige par un avoir qui renvoie « de façon spécifique et non équivoque » à la facture d'origine, puis une nouvelle facture si besoin [78].
- **Piste d'audit** : « contrôles documentés et permanents » reliant la facture à la livraison qui la fonde [78]. Chaîne gardée : commande → paiement → expédition → facture → recette → versement → banque. Documentée dans `docs/wiki/Procédures.md`.
- **Qui émet ?** Le logiciel du site émet chaque facture au nom de son vendeur. Si l'un des deux exploite le site pour les deux, un mandat de facturation écrit clarifie la situation (art. 289 I-2 [78]) : à confirmer avec l'expert-comptable.
- **Ventes et recettes hors site** : un tirage vendu en exposition (canal `exposition` du registre des éditions), une licence sur devis ou une autre recette d'auteur entrent aussi dans le livre des recettes, qui doit être complet (art. 102 ter [76]), et dans les seuils. Un écran « facture ou recette hors site » les saisit dans la même série (F27) ; à défaut, l'export du site est déclaré partiel et les seuils de F19 sont sous-estimés.

### 5.4 Conservation et format

| Règle | Durée ou forme | Source |
|---|---|---|
| Conservation commerciale | 10 ans après la clôture de l'exercice (commerçant, société) | [130] |
| Conservation fiscale | 6 ans | [130] |
| Registres d'un micro-entrepreneur | 10 ans | [129] |
| Forme | Un document établi sous forme électronique se garde sous cette forme | [130] |
| Authenticité, intégrité, lisibilité | De l'émission à la fin de la conservation | [78] |
| Effacement demandé par un client | Refusé pour les factures (obligation légale) | RGPD, art. 17.3.b [44] |

Pour le code : factures, lignes, PDF et registres hors de toute purge ; `invoices` ajouté à `FILE_DIRS` (`server/db/backup.js:24`) ; une facture ne disparaît jamais des données, sinon la sauvegarde l'effacerait au bout de 90 jours (`server/db/backup.js:25`). `copyNew` et `pruneDeleted` (`server/db/backup.js:30-60`) ne copient que le **premier niveau** d'un dossier (contrôle `isFile()`) : les PDF vont donc dans un dossier plat, `storage/invoices/<numéro>.pdf`, ou la sauvegarde devient récursive ; dans les deux cas, un test vérifie qu'une facture se retrouve dans la copie. Le PDF porte l'identité du client en clair et n'est **pas** scellé par le coffre : perdre `DATA_KEY` ne doit pas rendre les factures illisibles. Disque du serveur chiffré : à confirmer. En base, les champs du client sont scellés. La sauvegarde est sur un autre disque du même serveur (`docs/wiki/RGPD.md`) : pour tenir 10 ans, une **copie annuelle hors du serveur** des factures, avoirs, livre des recettes et registres (choix C, D22 ; coût nul sur un disque externe chiffré déjà possédé et gardé ailleurs, sinon à chiffrer). **Retenu : 10 ans pour tout.**

### 5.5 Facturation électronique et e-reporting

| Date | Obligation | Qui | Source |
|---|---|---|---|
| **1er septembre 2026** (en vigueur) | **Recevoir** les factures électroniques par une plateforme agréée | Tout assujetti, « qu'[il] en soit redevable ou non », donc franchise comprise | [96], [97], [100] |
| 1er septembre 2026 | Émettre et transmettre les données | Grandes entreprises, ETI | [96] |
| 1er janvier 2027 | TVA recodifiée dans le CIBS, à droit constant (report décidé par l'ordonnance n° 2026-671) | Tous | [57], [58], [60] |
| **1er septembre 2027** | **Émettre** vers les professionnels établis en France ; **e-reporting** des ventes aux particuliers | PME et micro-entreprises | [96], [108] |

- **Franchisé, micro-entrepreneur.** « Oui, vous êtes concerné » (page modifiée le 28/09/2026) [97] ; la transmission des données « s'impose aux assujettis qui bénéficient de la franchise en base » [108]. Un artiste-auteur qui exerce à titre habituel est assujetti [97].
- **Factures aux particuliers** : la réforme ne les concerne pas [102]. Un PDF par e-mail reste valable pour eux.
- **Plateforme agréée obligatoire**, l'État n'en propose pas de gratuite [102]. Liste officielle du 13/10/2026 : 155 plateformes immatriculées, 11 en attente de l'immatriculation définitive (lignes de données des fichiers XLSX, recomptées le 16/10/2026) [101]. Changement de plateforme possible, l'ancienne assure au moins un an de service [83].
- **E-reporting des ventes aux particuliers** : livraisons en France et ventes à distance dans l'UE, **y compris celles déclarées par OSS** : l'exclusion du § 20 ne vise que les assujettis non établis en France qui utilisent le guichet unique, et le § 90 inclut les livraisons expédiées de France vers un autre État membre [109] ; **totaux par jour**, sans détail des lignes [110] ; données : SIREN, période, catégorie, base HT par taux, TVA, devise [110] ; aucune donnée personnelle [102] ; **franchisé : tous les bimestres civils** (« les données de transaction sont transmises tous les bimestres civils », [111] § 70), transmission entre le 25 et la fin du mois qui suit ([111] § 100). Données de paiement : seulement pour les prestations de services (fichiers, à confirmer), tous les deux mois aussi [112]. Première période : septembre-octobre 2027, transmise du 25 au 30 novembre 2027.
- **Formats** : Factur-X (PDF/A-3 avec XML), UBL, CII ; profils « EN16931 » et « EXTENDED-CTC-FR » [84], [202]. Factur-X 1.09.2 publié le 4 août 2026 [202]. Un PDF par e-mail n'est pas une facture électronique au sens de la réforme [102].

### 5.6 Outils : trois voies

| Voie | Principe | Coût | Limites | Verdict |
|---|---|---|---|---|
| **1. Factures produites par le site** | PDF/A-3 par pdfkit 0.20.2 (MIT, 30/08/2026 ; PDF/A-3b et 3a, pièces jointes `Alternative`, XMP, PDF balisé) [212] ; numérotation en base, factures figées par déclencheurs, chaînage d'empreintes, horodatage RFC 3161 par une file propre aux factures qui réutilise `requestTimestamp` (`timestamp.js:118`) ; la file de `proofs.js` ne traite que des photos (`proofs.js:21-41`) | 0 € | N'émet pas vers les professionnels et ne fait pas l'e-reporting sans plateforme | **Recommandée** pour les factures aux particuliers |
| 2. Outil externe (plateforme agréée) | Facturation et e-reporting chez un éditeur | 0 € à plusieurs dizaines d'euros par mois | Double saisie sans API | **Indispensable pour la réception** ; utile pour le B2B et l'e-reporting |
| 3. Facture du prestataire de paiement | Stripe Invoicing : 0,4 % (Starter) ou 0,5 % (Plus) par facture payée [145] | Environ 60 € par an pour 100 commandes de 150 € (calcul) | Stripe n'est pas une plateforme agréée [101] ; mentions françaises, numérotation et conservation hors de notre main (à vérifier) | Écartée |

| Outil | Plateforme agréée (date) [101] | Offre gratuite | API | Source |
|---|---|---|---|---|
| SUPER PDP | Oui (22/12/2025) | Compte web jusqu'à 1 000 factures par mois | Oui : REST, OpenAPI, webhooks, test, JSON, Factur-X, CII, UBL, e-reporting ; 0,01 € HT par facture, minimum 10 € HT par an ; en e-reporting, une journée compte pour une facture | [203] |
| Dougs | Oui (12/12/2025) | Oui ; e-reporting des ventes aux particuliers annoncé | Non mentionnée | [204] |
| Indy | Oui (09/01/2026) | « Essentiel » gratuit | Non mentionnée | [206] |
| Tiime | Oui (18/12/2025) | Offre à 0 € | Pas d'API publique | [207] |
| Abby | Oui (29/01/2026) | « Basique » gratuit | Documentation publique (périmètre à vérifier) | [205] |
| Pennylane | Oui (11/12/2025) | Non : 7 à 79 € HT par mois | Dès 24 € HT par mois | [208] |
| Axonaut | Oui (08/01/2026) | Non : dès 38 € par mois | Oui | [209] |
| Qonto | Oui (18/12/2025) | Non : banque dès 9 € HT par mois | Oui | [194] |
| Henrri | **Non** (passe par des partenaires) | Oui | Non détaillée | [210] |
| Freebe | **Absent de la liste** | Non : 12,50 € par mois | Non mentionnée | [211] |

**Recommandation** (vendeurs en franchise, faible volume) : voie 1 pour les factures aux particuliers ; chaque vendeur ouvre **dès maintenant**, s'il a un SIREN, un compte gratuit chez une plateforme agréée (réception) ; e-reporting bimestriel par export du site saisi sur cette plateforme, puis par l'API de SUPER PDP (environ 10 € HT par an) si le volume le justifie ; ventes aux professionnels traitées à la main sur la plateforme en V1.

### 5.7 Tenue comptable minimale

| Registre | Qui | Contenu | Source |
|---|---|---|---|
| Livre des recettes | Micro-entrepreneur (BIC et BNC) | Chronologique : montant, origine (client), mode de paiement, référence de la pièce (la commande `C-…`, connue au paiement ; la facture, émise à l'expédition, s'y rattache par la commande) ; écritures non modifiables ; recettes hors site comprises (F27) | [128], [129] |
| Détail journalier des recettes | BNC au régime spécial (artiste-auteur en micro-BNC) | « l'identité déclarée par le client ainsi que le montant, la date et la forme du versement » | Art. 102 ter CGI [76] |
| Registre des achats | Micro-entrepreneur qui vend des marchandises | Date, fournisseur, pièce, montant, mode | [129] |
| Registre des éditions | Tout vendeur de tirages limités | Photo, numéro, format, papier, date, canal, facture | [65] (preuve des 30 exemplaires) |
| FEC | Comptabilité informatisée contrôlée | Format normé ; une micro peut s'en tenir à une récapitulation au moins mensuelle (portée à confirmer) | [89] |

- **Recette = montant brut encaissé** auprès du client, pas le versement net du prestataire. Les frais du prestataire sont une dépense (couverte en micro par l'abattement forfaitaire : 71 % vente, 50 % services BIC, 34 % BNC [127]). Un remboursement est une recette négative à sa date.
- **Rapprochement** : chaque paiement confirmé devient une ligne du livre des recettes ; chaque versement du prestataire est pointé avec les opérations qu'il couvre (somme des paiements − frais − remboursements − litiges) puis avec le relevé bancaire ; écart signalé dans « Aujourd'hui ».
- **Exports** : livre des recettes et registre des achats en CSV (UTF-8, `;`, virgule décimale) ; ZIP des factures et avoirs d'une période avec un récapitulatif ; agrégats d'e-reporting par jour, catégorie et taux ; aide aux déclarations (chiffre d'affaires mensuel ou trimestriel, total annuel).
- **Déclarations** : chiffre d'affaires du micro-entrepreneur chaque mois ou trimestre à l'URSSAF (12,3 % en vente, 21,2 % en services BIC, 25,6 % en BNC non réglementé ; pénalité de 60,1 € par déclaration manquée) [126], [128] ; déclaration sociale annuelle de l'artiste-auteur (campagne 2026 du 27 avril au 19 juin ; en micro-BNC, assiette = chiffre d'affaires − 34 %, puis + 15 %) [120], [121] ; 2042-C-PRO pour l'impôt (cases à vérifier dans la notice). **Pas de versement libératoire sur les revenus d'artiste-auteur** : l'option de l'art. 151-0 du CGI est réservée aux contribuables du régime micro-social (art. L613-7 du code de la sécurité sociale) [314] ; il n'est possible que pour une micro-entreprise BIC (objets), 1 % en vente, si le revenu fiscal de référence de N-2 ne dépasse pas 29 579 € pour une part [127]. À confirmer avec l'expert-comptable.

### 5.8 Documents produits pour chaque commande

| Document | Quand | Obligatoire ? | Canal |
|---|---|---|---|
| Confirmation de commande | Au paiement | O pour un consommateur [3] | E-mail |
| Facture | À chaque envoi (lignes expédiées) ou à la mise à disposition | O pour un professionnel, une vente UE hors OSS, sur demande ; R sinon | PDF/A-3 joint, plus lien privé (30 jours, F11) |
| Avoir | Rétractation, retour, erreur, geste | O dès qu'une facture émise est corrigée [78] | PDF joint |
| Bon de livraison | À l'expédition | Non | HTML imprimable, glissé dans le colis, sans prix (option cadeau) |
| Certificat d'authenticité | Avec chaque tirage original | O sur demande pour les mentions [39] ; R toujours | Papier signé, copie PDF ensuite |
| Licence (fichier, V3) | À la mise à disposition | R (contrat écrit [40]) | PDF et métadonnées du fichier |
| Accusé de réception d'une rétractation | À la déclaration | O [7] | E-mail |

### 5.9 Sanctions

| Manquement | Sanction | Source |
|---|---|---|
| Facture obligatoire non délivrée et vente non comptabilisée | 50 % du montant, ramenée à 5 % (37 500 € au plus par exercice) si la vente est comptabilisée | Art. 1737 I-3 [80] |
| Mention omise ou inexacte | 15 € par omission, au plus le quart du montant | Art. 1737 II [80] |
| Facture non émise sous forme électronique alors qu'elle devait l'être | 50 € par facture, 15 000 € par an au plus (relevé de 15 à 50 € en 2026) | [80], [82] |
| Pas de plateforme agréée pour la réception | Mise en demeure (3 mois), puis 500 €, puis 1 000 € par période de 3 mois | [80], [82], [105] |
| Données d'e-reporting non transmises | 500 € par transmission, 15 000 € par an au plus | Art. 1788 D [81], [82] |
| Factures entre professionnels non conformes | Jusqu'à 75 000 € (personne physique), 375 000 € (morale) | [38] |
| Registres falsifiés (micro-entrepreneur) | Jusqu'à 3 ans de prison et 45 000 € | [128] |

Tolérances : pas d'amende pour une première infraction réparée spontanément ou dans les 30 jours suivant une demande [80] ; souplesse annoncée au démarrage pour les entreprises « engagées dans une trajectoire sérieuse de mise en conformité » [105].

### 5.10 Exigences

| Id | Exigence | Niveau | Appui |
|---|---|---|---|
| F1 | Une facture pour chaque envoi (lignes expédiées) ou chaque mise à disposition, particuliers compris. | R (O pour les cas du § 5.1) | [78], [132] |
| F2 | Facture émise à l'expédition de chaque envoi (tirage) ou à la mise à disposition (fichier), avec la date de livraison ; jamais au paiement. Plusieurs envois : une facture par envoi (`invoices.shipment_id`), avoirs rattachés à la facture de l'envoi, e-reporting à la date de chaque facture. | O (délai) / R (moment) | Art. 289 I-3 [78] |
| F3 | Numéro `<préfixe>-<AAAA>-<NNNN>`, une série par vendeur et par année, avoirs dans la même série ; aucun trou, aucune réutilisation, aucun numéro réservé. | O | [79], [87] |
| F4 | Numéro attribué dans la même transaction SQLite (`immediate`) que la facture, ses lignes et la série ; un échec annule tout. | I | — |
| F5 | Factures, lignes, fichiers et recettes figés par des déclencheurs `BEFORE UPDATE` et `BEFORE DELETE` ; corrections par avoir ou contre-écriture. | O | [78], [128] |
| F6 | Chaque facture est un instantané : vendeur, client, adresses, libellés, prix, taux et textes copiés ; aucun renvoi vers une table modifiable. | I | — |
| F7 | Mentions du § 5.2 selon le régime du vendeur ; mentions de la réforme dès la V1 ; mentions B2B quand un SIREN client est saisi. | O / R | [79], [38] |
| F8 | PDF/A-3 (pdfkit), polices du dépôt incorporées (SIL OFL 1.1, qui permet l'incorporation ; incorporation dans un PDF/A à tester), PDF balisé, intitulés dans la langue du client ; écrit une seule fois dans un dossier plat `storage/invoices/<numéro>.pdf` (la sauvegarde ne copie que le premier niveau, `server/db/backup.js:30-60`), SHA-256 noté ; `CreationDate` et `ModDate` fixées à `issued_at` pour qu'un PDF refait soit identique. | O (forme) / R (format) | [212] |
| F9 | Chaînage : `hash = SHA-256(hash précédent ∥ contenu canonique)` par série, sur les valeurs **telles que stockées** (champs du client chiffrés : la vérification ne demande pas `DATA_KEY`, et ces champs ne sont jamais rechiffrés) ; « Vérifier l'intégrité » refait la chaîne ; horodatage RFC 3161 de chaque empreinte par une file propre à `invoices.js` (`requestTimestamp`, `timestamp.js:118` ; jeton dans `invoice_files`, état dans `invoice_events`), jamais bloquant. | R | Piste d'audit [78] |
| F10 | Avoir total ou partiel : renvoi à la facture d'origine, montants négatifs, motif obligatoire, rattaché au remboursement ; jamais au-delà du reste à créditer. | O | [78] |
| F11 | Envoi du PDF en pièce jointe (SO7, boîte d'envoi) et lien privé de téléchargement valable 30 jours (C ; jeton haché, masqué, `no-store`, `noindex`, 410 après échéance) ; nouveau lien et renvoi depuis l'admin. | R | SO1, SO4 |
| F12 | Conservation 10 ans au moins, hors purge ; `invoices` dans `FILE_DIRS`, dossier plat (ou sauvegarde récursive), avec un test ; copie annuelle hors du serveur (D22) ; effacement refusé pour les factures, expliqué dans `privacy.js`. | O | [130], [44] |
| F13 | Identité du client en clair dans le PDF, scellée en base (`vault.seal`, recherche par `vault.index`) ; PDF hors coffre. Boutique fermée sans `DATA_KEY` : sans clé, rien n'est chiffré, `index()` renvoie `null` et des factures figées resteraient en clair à jamais (SO9). | I | Carte, § 8.1 ; `vault.js:33-36` |
| F14 | Livre des recettes produit automatiquement au paiement : date, pièce (référence de commande `C-…` ; la facture, émise plus tard, se retrouve par `invoices.order_id`), identité déclarée, montant brut, mode, référence du prestataire ; figé ; export CSV. | O | [76], [128], [129] |
| F15 | Registre des achats : saisie, justificatif joint (dont les factures reçues par la plateforme), verrouillage. | O (vente de marchandises) / R | [129] |
| F16 | Rapprochement des versements du prestataire et du relevé bancaire ; écart dans « Aujourd'hui ». | R | § 5.7 |
| F17 | Agrégats d'e-reporting par vendeur et par jour (heure de Paris) : catégorie, base par taux, TVA, devise ; paiements pour les services ; ventes à distance dans l'UE **comprises, même déclarées par OSS** (vendeur établi en France, [109] § 20 et § 90) ; export CSV et JSON par bimestre civil ou par mois ; suivi « transmis le … » ; envoi par API en V2. | O à partir du 01/09/2027 | [108]-[112] |
| F18 | Clients professionnels : case « Je commande pour une entreprise », SIREN et TVA contrôlés pour la forme ; avant le 01/09/2027, facture PDF ; ensuite, commande en ligne fermée ou facture émise par la plateforme (à la main, puis Factur-X et API). Client qui demande après coup une facture au nom de sa société (V1) : avoir de la facture d'origine, puis nouvelle facture, faits à la main depuis l'admin. | O (2027) / C | [96], [78] |
| F19 | Tableau des seuils par vendeur sur l'année civile, alertes à 80 % et 100 % : franchise de l'auteur (50 000 / 55 000 € ; 35 000 / 38 500 €), ventes UE (10 000 €), micro (83 600 € ; 203 100 €), compte dédié (10 000 € deux années de suite). Ventes et recettes hors site comprises (F27). | R | [56], [61], [73], [125], [128] |
| F20 | Permissions `factures.voir` (portée), `factures.avoir` (portée), `compta.voir` (portée), `compta.saisir` (portée), `vendeurs.gerer` ; actions notées dans `audit_log`, par identifiant. | I | Constat C4 |
| F21 | Boutique fermée tant que l'identité légale du vendeur est incomplète (nom, SIREN, adresse, régime, mention), tant que `DATA_KEY` manque (SO9) ou qu'aucun relais SMTP n'est configuré, sur le modèle de `legalMissing` (`legal.js:56-63`). | I | [79] |
| F22 | Montants en centimes entiers ; si la TVA est due, base et TVA par taux calculées au niveau de la facture selon EN 16931, arrondi au centime contrôlé. | O | [84] |
| F23 | Textes légaux (mention de franchise, exonérations) en réglages datés par vendeur ; la facture garde le texte imprimé. Prêt pour le CIBS au 01/01/2027. | O | [57] |
| F24 | Piste d'audit documentée (`Procédures.md`, `Sécurité.md`, `RGPD.md`). | O | [78] |
| F25 | Écritures de commande et de paiement en ajout seul, chaînées, avec clôtures périodiques (inaltérabilité, sécurisation, conservation, archivage) pour faciliter une certification si un vendeur devient redevable de la TVA. Ce n'est pas une certification. | R | [88] |
| F26 | Régime de TVA de chaque vendeur et date de son changement mémorisés. | O (pour la facture) | [56] |
| F27 | Écran « facture ou recette hors site » (vente en exposition, licence sur devis, autre recette d'auteur) : facture dans la même série (ou série déclarée à part), ligne du livre des recettes (`receipts.channel`), prise en compte dans F19 et dans les exports. À défaut, l'export du site est déclaré partiel. | O (livre complet) / C (écran) | Art. 102 ter [76] ; [128] |

---

## Partie 6. Cadre juridique et fiscal (résumé)

Détail sourcé, tableau des obligations par scénario et questions : [annexe Cadre juridique et fiscal](annexe-cadre-juridique-fiscal.md). Textes en vigueur au 15/10/2026 ; les numéros du CGI changent au 1er janvier 2027 (passage au CIBS, à droit constant [57], [58]).

### 6.1 Qui vend ?

| | A. Chacun vend ses œuvres, en son nom | B. Un seul vend tout et reverse | C. Structure commune (SAS, association) |
|---|---|---|---|
| Vendeur sur la facture | L'auteur de la photo | Le vendeur unique | La structure |
| Revenus de l'auteur | Artistiques, directs | Commerciaux pour le vendeur sur les œuvres de l'autre | Ventes ou dépôt auprès de la structure |
| Franchise de TVA | Une par auteur (50 000 € et 35 000 €) | Ventes cumulées chez le vendeur | Seuils généraux (85 000 €) pour une société |
| Diffuseur (contribution de 1 % + 0,1 % en 2025 [119], [122] ; assiette de 30 % du prix de vente pour les œuvres graphiques et plastiques, montant des droits versés pour les autres (art. R382-17 [118]) : application aux photographies à confirmer avec l'URSSAF) | Non | Oui | Oui |
| Paiement | Un compte par vendeur | Encaissement pour un tiers, service réglementé [93] | Un compte |
| Plateforme (DAC7) | **À confirmer** | Oui si mandataire | Selon le montage |
| Verdict | **Recommandé** | Déconseillé | Plus tard, si le volume le justifie |

- **DAC7.** Une « plateforme » est « tout logiciel, y compris tout ou partie d'un site Internet », qui connecte des vendeurs à des acheteurs ; l'« opérateur » est « une entité concluant un contrat avec des vendeurs » [90], [91]. Sans structure ni contrat de mise à disposition, on peut défendre qu'il n'y a pas d'opérateur. Une convention écrite entre les deux pourrait être lue comme un tel contrat : **à confirmer**. Exclusion des vendeurs sous 30 ventes et 2 000 € par an : texte non lu, à confirmer [92].
- **Société de fait.** Présenter la boutique comme celle de « Nicephos » sans dire qui vend pourrait faire croire à une société entre les deux (à confirmer). Chaque fiche, commande et facture nomme donc le vendeur.
- **Recommandé** : une convention écrite entre Sébastien et Julien (frais du site, usage du nom, sort des données et des commandes en cas de séparation), relue sous l'angle DAC7.

### 6.2 Statut de chaque auteur selon le produit

| Produit | Sécurité sociale | Impôt | TVA si redevable | Seuil de franchise |
|---|---|---|---|---|
| Tirage original (≤ 30, signé, numéroté, tiré par l'auteur ou sous son contrôle) | Artiste-auteur, « vente d'œuvres originales » [115], [116], [41] | BNC | 5,5 % [69] | 50 000 € / 55 000 € [61] |
| Licence de fichier vendue à un particulier | Artiste-auteur, droits d'auteur [115] | BNC | 20 % recommandé (§ 6.3) | 50 000 € / 55 000 € |
| Tirage non limité, non signé ou non numéroté | **Cas gris** : « auto-édition, auto-diffusion » pour l'URSSAF [115], et l'art. R382-1-1, 2°, du code de la sécurité sociale compte parmi les revenus artistiques « la vente d'exemplaires de son œuvre par l'artiste-auteur qui en assure lui-même la reproduction ou la diffusion » [116] ; mais « production en série […] impression à la demande » exclues par la sécurité sociale des artistes-auteurs [114]. **À confirmer avec l'URSSAF.** | BNC ou BIC | 20 % | 35 000 € / 38 500 € [61] |
| Objets (mugs, textiles ; cartes postales à confirmer) | Activité commerciale, micro-entreprise BIC [114] | BIC | 20 % | 35 000 € / 38 500 € (arbitrage 8) |

- **Formalités de l'artiste-auteur** : déclaration de début d'activité et SIRET ; déclaration annuelle à l'URSSAF ; provisions trimestrielles (15 janvier, avril, juillet, octobre) [115]. Taux 2026, identiques à 2025 : vieillesse plafonnée 6,90 % dont 0,75 % pris en charge par l'État, soit 6,15 % (dans la limite du plafond de la sécurité sociale, 48 060 € en 2026) ; déplafonnée 0,40 %, prise en charge, soit 0 % ; CSG 9,20 % ; CRDS 0,50 % ; formation 0,35 % [119], [306]. Retraite complémentaire (RAAP) : 8 % de l'assiette, ou 4 % sur demande avant le 30 novembre si l'assiette ne dépasse pas 32 076 € ; affiliation à partir de 10 692 € ; plafond de 144 180 € [307]. Revenus accessoires plafonnés à 1 200 fois le SMIC horaire [120], soit 14 424 € en 2026 (SMIC horaire de 12,02 € au 1/1/2026) [305].
- **Impôt** : micro-BNC jusqu'à 83 600 € de recettes en 2026, abattement de 34 % [123], [127].
- **Micro-entreprise BIC** seulement si l'on vend des objets : seuil 203 100 € en vente, cotisations 12,3 % du chiffre d'affaires [123], [126]. Une V1 limitée aux tirages originaux n'en a pas besoin (C).
- **Cumul avec un emploi** : relire le contrat de travail (exclusivité, loyauté) ; pour un agent public, « la production des œuvres de l'esprit […] s'exerce librement » [133], une activité commerciale annexe relève des règles de cumul (à confirmer).

### 6.3 TVA

- **Franchise en base.** La baisse du seuil à 25 000 € a été abandonnée (loi n° 2025-1044 du 3 novembre 2025) ; la loi de finances pour 2026 n'a pas modifié l'article 293 B [56]. Seuils de l'auteur : **50 000 €** l'année précédente et **55 000 €** l'année en cours pour ses œuvres et ses droits ; **35 000 € / 38 500 €** pour ses autres opérations [56], [61]. Le seuil général (85 000 € / 93 500 € en biens) ne s'applique pas aux auteurs [61], [63]. Dépasser le seuil de l'année en cours fait perdre la franchise à la date du dépassement [61]. Seuil proratisé la première année.
- **Mention** : « TVA non applicable, art. 293 B du CGI » jusqu'au 31/12/2026 ; « TVA non applicable, art. L. 233-3 du CIBS » ensuite [57], [59]. La page impots.gouv.fr consultée donne encore « L. 223-3 » et le 1/9/2026, antérieurs au report [62] ; Légifrance donne L. 233-3 au 1/1/2027 [57]. Tolérance de l'ancienne mention jusqu'au 30 juin 2028 selon la presse spécialisée [60] : **à confirmer**.
- **Taux, si un auteur devient redevable** : 5,5 % sur les tirages originaux livrés par l'auteur (taux déjà applicable à l'auteur avant 2025 ; étendu au 1er janvier 2025 aux autres vendeurs, hors régime de la marge, ce qui concerne les montages B et C) [69] ; 20 % sur les reproductions et objets [70] ; frais de port : même taux que le bien, ventilation d'une commande mixte à confirmer (arbitrage 20, [308]).
- **Fichiers numériques.** L'article 279 g soumet à 10 % les cessions de droits des auteurs [71], [72], mais le BOFiP range « tout téléchargement de photos, d'images » parmi les services fournis par voie électronique [73], et le droit européen y interdit les taux réduits (directive 2006/112, art. 98, non lu). **Recommandé : 20 %** pour un particulier, à confirmer.
- **UE** : ventes à distance et services électroniques à des particuliers des autres États s'additionnent ; au-delà de **10 000 €** par an, TVA du pays de l'acheteur dès la vente qui fait franchir le seuil, par le guichet OSS, **même en franchise** [73], [74]. Le site suit ce cumul par vendeur (F19).
- **Hors UE** : Royaume-Uni, immatriculation exigée sous 135 £ pour les biens [134] et sans seuil indiqué pour les services numériques [135] ; Suisse, voir § 3.3. Franchise européenne (100 000 € dans l'UE) : sans intérêt au début [64].

### 6.4 Droit de la consommation

| Contenu des CGV et du parcours | Niveau | Source |
|---|---|---|
| Identité du vendeur (nom, « EI », adresse, e-mail, téléphone, SIRET) | O | [22], [37] |
| Caractéristiques (original ou reproduction, nombre d'exemplaires, format, papier ; pour un fichier, définition et licence) | O | [4] |
| Prix final et frais de livraison avant la commande ; paiement, livraison, délai | O | [4], [22] |
| Rétractation : conditions, délai, formulaire type, frais de retour, fonction en ligne | O | [5], [6], [7], [12] |
| Garanties légales : textes encadrés des annexes aux articles D211-2 (biens) et D211-3 (contenus numériques) | O | [16] |
| Médiateur de la consommation (nom, site, coordonnées) : recours gratuit [17] ; amende jusqu'à 3 000 € pour une personne physique qui n'informe pas [17]. Exemple CM2C : 48 € pour 3 ans (jusqu'à 10 personnes), 36 € par médiation à distance ; la page n'indique ni HT ni TTC [18]. **Une adhésion par vendeur.** | O | [17], [18] |
| Plateforme européenne RLL fermée le 20 juillet 2025 : aucun lien vers elle | O | [19] |
| Pays livrés et restrictions ; licence des fichiers ; droit applicable sans priver le consommateur de la protection de son pays (règlement Rome I, art. 6, non lu) | O / R | — |
| Bouton « commande avec obligation de paiement » ; confirmation sur support durable ; renonciation expresse pour les fichiers | O | [1], [3], [11] |
| Livraison au plus tard 30 jours sans date convenue ; risque au vendeur jusqu'à la prise de possession | O | [13], [14] |

- CGV en allemand : à faire relire par quelqu'un qui connaît le droit allemand. Un site en allemand et en anglais « vise » ces pays (R).
- Mentions légales : nom, prénoms, domicile, téléphone de l'éditeur personne physique ; pour le commerce électronique, identité, adresse, contacts, immatriculation, numéro de TVA s'il existe [22]. Publier le domicile ou une domiciliation : à confirmer.

### 6.5 Accessibilité

L'acte européen sur l'accessibilité (directive (UE) 2019/882, transposée par le décret n° 2023-931, art. D412-49 à D412-62 du Code de la consommation, pour les services fournis après le 28 juin 2025 [31]) couvre le commerce électronique. Pour une entreprise de moins de 10 salariés dont le chiffre d'affaires annuel ou le total de bilan est inférieur à 2 M€, la DGCCRF indique qu'« aucune obligation en matière d'accessibilité ne s'impose aux prestataires de services » [309] (l'art. D412-60 II, qui dispense de documentation, vise les produits). Le seuil de 250 M€ de l'article 47 de la loi de 2005 ne les concerne pas [32]. Chaque auteur seul est une micro-entreprise : exempté. **Recommandé** : garder la cible RGAA 4.1.2 sur tout le parcours d'achat [242].

### 6.6 Logiciel de caisse sécurisé

| Question | Réponse | Source |
|---|---|---|
| Qui est concerné ? | Tout assujetti qui vend à des particuliers et enregistre leurs paiements dans un système doté d'une « fonctionnalité de caisse ». Un site de vente en ligne en fait partie. | [88] § 1, 30, 37, 40 |
| Franchise en base ? | **Exclue** : « Ne sont pas soumis […] : les assujettis à la TVA bénéficiant du régime de la franchise en base » | [88] § 25 |
| Dispense pour un redevable | Si **tous** les paiements passent par « l'intermédiation directe d'un établissement de crédit » ; l'exemple 1 dispense le site de commerce électronique « qui n'accepte que des paiements par carte bancaire ou virement » proposés par des établissements bancaires, « y compris lorsqu'il recourt à un prestataire de services de paiement pour gérer ses paiements en ligne » ; un autre moyen (carte cadeau, solde de portefeuille, espèces) la fait tomber | [88] § 35, 37 (exemple 1) |
| Logiciel maison | Pas d'auto-attestation, sauf si l'édition de logiciels est l'activité déclarée : certificat d'un organisme accrédité | [88] § 375 |
| Sanction | Art. 1770 duodecies ; 7 500 € par système selon une source secondaire [310] ; le BOFiP ne donne pas le montant : à confirmer sur Légifrance | [88] § 420, [310] |

Conséquence : rien à faire tant que chaque vendeur est en franchise. Si l'un devient redevable, la dispense est probable tant que Checkout n'accepte que des cartes (Apple Pay et Google Pay reposent sur des cartes) et des virements bancaires (Wero). Chez Stripe, les services de paiement de l'EEE sont fournis par Stripe Technology Europe Ltd, établissement de monnaie électronique agréé par la Banque centrale d'Irlande (réf. C187865), et non établissement de crédit ; Stripe Payments Europe Ltd est le cocontractant pour le reste [162], [302] ; l'exemple 1 vise justement le recours à un prestataire de services de paiement pour des paiements par carte. La dispense tombe dès qu'un autre moyen est accepté (carte cadeau, solde de portefeuille). À confirmer avec l'expert-comptable pour Wero et PayPal. Sinon, certification coûteuse. F25 prépare le terrain sans valoir certification.

### 6.7 Droit d'auteur, licences, certificat, droit à l'image

- **Licence de fichier** : contrat constaté par écrit [40] (l'acceptation électronique tient lieu d'écrit, art. 1366 C. civ. non lu) ; chaque droit cédé fait l'objet d'une mention distincte, domaine d'exploitation délimité en étendue, destination, lieu et durée (art. L131-3 CPI, non lu). Clauses : usage privé et non commercial, nombre de tirages personnels, lieu, durée, exclusions (revente, diffusion publique, réseaux sociaux à décider, modification, entraînement d'IA), licence non exclusive et non cessible, droit moral incessible. Licences professionnelles : sur devis.
- **Certificat et mentions** : sur demande de l'acheteur, facture ou bordereau précisant nature, composition, origine et ancienneté (décret n° 81-255, art. 1) ; toute « copie ou autre reproduction d'une œuvre d'art originale » porte « de manière visible et indélébile » la mention « Reproduction » (art. 9) [39]. Application à un tirage non limité d'une photo : à confirmer.
- **Personnes reconnaissables** : la vente met en jeu leur droit à l'image [42] ; la tolérance au nom de l'expression artistique s'apprécie au cas par cas (à confirmer). L'accord « expositions et tirages » (`encounters.js:15`) ne dit pas clairement s'il couvre la vente : usage « vente » bloquant (S3).

### 6.8 RGPD

| Point | Règle | Source |
|---|---|---|
| Bases légales | Contrat (commande, livraison, après-vente), obligation légale (factures), intérêt légitime (fraude, litiges), consentement (lettre) | [53] |
| Durées | Clients : durée de la relation ; prospection : 3 ans après la fin de la relation ; pièces comptables : durée légale, « par exemple, obligation comptable de 10 ans », en archivage intermédiaire séparé | [53], [55] |
| Cartes | Aucune donnée de carte chez nous ; cryptogramme jamais gardé ; garder une carte pour plus tard exige une case non cochée | [54] |
| Destinataires | Prestataire de paiement, transporteur, plateforme agréée, expert-comptable : dans `privacy.js` et le registre ; vérifier les transferts hors UE du prestataire | [160] |
| Cookies | Panier et session d'achat exemptés de consentement ; information due ; pas de bandeau sans traceur | [46], [47] |
| Prospection | Consentement, ou exception pour des produits analogues à des clients existants | [36] |

### 6.9 Autres points avant l'ouverture

| Point | Pourquoi | État |
|---|---|---|
| Éco-organisme des emballages (REP), IDU | Vente à distance de colis à des particuliers | Obligatoire [33], [34] |
| Registre LUCID (Allemagne) | Produits emballés livrés en Allemagne | À confirmer pour un petit vendeur étranger [35] |
| Sécurité générale des produits | Informations du fabricant en ligne | Obligatoire [29] ; œuvre originale à confirmer |
| Lutte contre le blanchiment | Commerce d'œuvres d'art à partir de 10 000 € par transaction (art. L561-2, 10°, du Code monétaire et financier) | Peu probable ici |
| CFE | Exonération des photographes auteurs pour l'activité artistique (art. 1460, 2° bis, du CGI ; BOFiP ACTU-2015-00177) ; la micro-entreprise BIC peut être imposable | Partie BIC à confirmer |
| Assurances | Responsabilité civile professionnelle, transport des tirages | Recommandé, coût à chiffrer |

### 6.10 Démarches hors code

| Id | Démarche | Qui | Quand | Niveau | Source |
|---|---|---|---|---|---|
| J1 | Choisir le montage (A recommandé) et le statut de chacun, avec l'expert-comptable et l'URSSAF | Les deux | Avant la phase 40 | C | § 6.1, 6.2 |
| J2 | Déclarer le début d'activité, obtenir un SIRET | Chaque vendeur | Avant l'ouverture | O | [115] |
| J3 | Ouvrir un compte chez une plateforme agréée de réception et s'inscrire à l'annuaire | Chaque vendeur, dès qu'il a un SIREN | **Dès maintenant** (obligatoire depuis le 1/9/2026) | O | [97], [101] |
| J4 | Adhérer à un médiateur de la consommation | Chaque vendeur | Avant l'ouverture | O | [17], [18] |
| J5 | Adhérer à un éco-organisme (emballages), noter l'IDU | Chaque vendeur (à confirmer) | Avant la première vente | O | [33], [34] |
| J6 | Rédiger les CGV (fr, en, de), les faire relire (droit allemand pour la version allemande) | Les deux | Avant la phase 41a | O / R | § 6.4 |
| J7 | Compléter les mentions légales de chaque vendeur | Chaque vendeur | Avant l'ouverture | O | [22] |
| J8 | Convention écrite entre les deux (frais, nom, séparation), relue sous l'angle DAC7 | Les deux | Avant l'ouverture | R | § 6.1 |
| J9 | Nouvel accord « vente de tirages et de fichiers » pour les personnes photographiées ; règle de l'usage « privé » | Les deux, avec un juriste | Avant les phases 37a et 40 | R | § 2.7, § 6.7 |
| J10 | Ouvrir un compte chez le prestataire de paiement (mode test, puis production) ; déclarer le webhook de son préfixe | Chaque vendeur | Phase 41a | C | § 4.6 |
| J11 | Attestation PCI SAQ A | Chaque vendeur | À l'activation, puis chaque année | O (contractuel) | [198] |
| J12 | Compte bancaire dédié (micro-entrepreneur, au-delà de 10 000 € deux années de suite) | Chaque vendeur concerné | Selon le chiffre d'affaires | O | [128] |
| J13 | Assurance (responsabilité civile, transport) | Chaque vendeur | Avant l'ouverture | R | — |
| J14 | Vérifier dans Cloudflare : Bot Fight Mode ; règles de cache « Bypass » sur `/g/*`, `/prive/*`, `/suivi/*`, `/facture/*`, `/paiement/*`, `/panier`, `/commande*`, `/renoncer` et leurs formes `/en/…` et `/de/…` (`/en/panier`, `/de/commande*`, `/en/renoncer`…) ; **Always Online désactivé** (il transmet à Internet Archive les adresses GET les plus demandées ayant répondu 200, dont `/g/<jeton>` [311]) ; Crawler Hints à vérifier | Administrateur | Avant les phases 37a et 41a | I | [201], [272], [311] |
| J15 | Laboratoire choisi, épreuves de contrôle faites | Les deux | Avant l'ouverture | R | § 3.2 |
| J16 | Relais SMTP sous contrat de sous-traitance (pas Gmail, `RGPD.md:24`), SPF, DKIM et DMARC sur le domaine | Administrateur | Avant les phases 37b et 41a | O (sous-traitant) / R (DNS) | [281] ; B93 |
| J17 | Jeton d'API Cloudflare limité à la purge du cache de la zone (G43), rangé comme les autres secrets (`.env`) | Administrateur | Avant la phase 37a | R | [274] |

---

## Partie 7. Architecture dans le code

Le code actuel fournit déjà : connexion Zitadel et sessions serveur hachées (`sessions.js`), CSRF, permissions déclarées par route et fermées par défaut (`permissions.js`, `admin.js:88-161`), portée « les miennes », journal d'audit, coffre chiffré (`vault.js`), limiteur (`ratelimit.js`), e-mails (`mailer.js`), purge quotidienne (`app.js:184-196`), minuteries (`app.js:240-258`), horodatage RFC 3161 (`timestamp.js`, `proofs.js`). Chaque nouveau service suit le schéma `createX({ db, … })`, décoré sur `app` dans `buildApp`, avec dépendances injectables pour les tests.

### 7.1 Socle commun et constats à corriger d'abord

| Id | Élément | Où | Corrige |
|---|---|---|---|
| SO1 | Magasin de jetons hachés : créer (24 octets, base64url), vérifier le format, comparer à temps constant (`sameToken`, `auth.js:29-33`), échéance, révocation, compteurs, purge | `server/tokens.js` | C2, si la photo offerte y migre |
| SO2 | Sessions visiteur : cookie `__Host-visiteur` ; identifiant interne stable et empreinte du jeton (`token_hash`) distincts, la rotation ne change que l'empreinte ; CSRF ; autorisations à échéance propre (`visitor_grants.expires_at`, `remember`), que la durée du cookie ne prolonge jamais ; coupure à la révocation ; « Quitter » retire les autorisations, pas le panier | `server/visitor-sessions.js` (sur le modèle de `sessions.js`, mais l'empreinte n'y sert pas d'identifiant) | — |
| SO3 | Exception de `Referrer-Policy` par route (`config.referrer`), sur le modèle de `config.geolocation` | `app.js:263-266` | C1 |
| SO4 | Masquage des jetons dans le journal : `/pour-vous/`, `/g/`, `/suivi/`, `/facture/`, `/lettre/…`, fichier maître, et paramètre `vers=` quand il contient l'un de ces chemins (sélecteur de langue) | `redactUrl`, `app.js:69-73` | C3 |
| SO5 | Mots de passe : génération, scrypt, sémaphore | `server/passwords.js` (Node seul) | — |
| SO6 | Usages d'accord `prive` et `vente` dans `USAGES`. `readiness` code en dur les cas `site` et `instagram` (`readiness.js:47-60`) et les portées d'accord sont `site`, `instagram`, `print`, `name` (`encounters.js:15`) : un accord « vente » touche aussi `SCOPES`, `SCOPE_LABELS` et `normalizeConsent`, le formulaire `/bonjour` et l'app Rencontre, les cartes imprimées, `privacy.js`, l'export et les traductions (phase 40) | `readiness.js:12`, `:47-60`, `gate` ; `encounters.js:15` | — |
| SO7 | E-mails : pièces jointes, en-têtes `List-*`, modèles par langue | `mailer.js:16-25` (option `attachments` de Nodemailer) | — |
| SO8 | Tests de non-accès pour les routes hors `/admin` | `test/hors-admin.test.js` | — |
| SO9 | `DATA_KEY` exigée par les galeries (e-mail des invitations, commentaires), la boutique et la lettre : sans elle, `seal()` ne chiffre rien et `index()` renvoie `null` (`vault.js:33-36`, `Configuration.md:94`), ce qui ferait échouer les colonnes d'index `NOT NULL` (`orders.email_idx`, `subscribers.email_index`) et laisserait en clair, à jamais, des factures et des recettes figées. Ces modules refusent de s'ouvrir sans clé et l'admin le dit. | `config.js`, contrôles d'ouverture (F21) | — |

| Id | Constat (carte du code) | Où | État |
|---|---|---|---|
| C1 | Le `Referrer-Policy: no-referrer` de la photo offerte est écrasé par l'`onSend` global ; la réponse porte `strict-origin-when-cross-origin`. Le même piège attend les galeries. | `public.js:59` contre `app.js:263-264` | Vérifié par exécution |
| C2 | Jetons de photo offerte stockés en clair : une copie de la base ouvre les liens valides. | `016_photos_offertes.sql:4`, `encounters.js:431-433` | Vérifié |
| C3 | URL `/pour-vous/<jeton>` non masquées dans le journal du serveur. | `app.js:69-73` | Vérifié |
| C4 | Retirer un lien met le jeton dans les paramètres de la route, donc dans `audit_log`. | `rencontres.js:116`, `admin.js:153-155` | Lecture du code |
| C5 | `GET /bonjour/<réf>-<code>` révèle si le code est bon, sans limite de débit ; le code fait 3 caractères sur 31 (29 791 possibilités) ; ensuite un `POST /bonjour` « vérifié » remplace l'accord, l'adresse et le nom d'une rencontre. | `public.js:467-474`, `encounters.js:21`, `:88-91`, `:162-177` | Différence de réponse vérifiée ; exploitation à confirmer par un test |
| C6 | La photo offerte est recalculée depuis l'original à chaque affichage et téléchargement, sans cache ni limite. | `public.js:56-58`, `:72-83` | Lecture du code |
| C7 | `/pour-vous/` est interdit dans `robots.txt` : un lien fuité pourrait être indexé avec son jeton visible, faute de voir `noindex`. | `public.js:110` ; [256] | À porter à l'audit de sécurité |
| C8 | L'aperçu d'un voyage non publié teste `request.can('sorties.voir')` sans portée : `can()` renvoie `'les miennes'`, qui vaut vrai, donc un photographe voit l'aperçu d'un voyage non publié de l'autre. Même défaut si les galeries ou le carnet copient ce modèle. | `public.js:301` ; `permissions.js:107-111` | Lecture du code ; à porter à l'audit de sécurité |

Migration de la photo offerte vers des jetons hachés : SQLite n'a pas de SHA-256 en SQL, et `migrate()` applique d'un coup toutes les migrations en attente, avant le démarrage (`server/db/index.js:17-31`) : un plan « copie au démarrage, puis suppression par une migration suivante » perdrait les liens lors d'une mise à jour qui saute une version. Deux voies : (a) **une seule migration** qui crée `encounter_links` (identifiant + `token_hash`), la remplit avec une fonction SQL `sha256` déclarée par `db.function` dans `openDb` (`server/db/index.js:7`), puis supprime l'ancienne table ; (b) laisser expirer les liens en clair (30 jours au plus) et n'écrire que des jetons hachés pour les nouveaux. Dans les deux cas, la fiche Rencontre ne peut plus recalculer le lien et le message « Envoyer » à chaque affichage (`routes/rencontres.js:93-103`, `views/admin/encounter.eta:122-129`, aide `docs/aide/15-rencontres.md:163-168`) : lien et message montrés une seule fois, à la création ; écran, aide et tests à changer. Les routes de retrait passent par l'identifiant (C4).

### 7.2 Nouveaux modules

| Fichier | Rôle | Phase |
|---|---|---|
| `server/tokens.js`, `server/passwords.js`, `server/visitor-sessions.js` | Socle SO1, SO5, SO2 | 34, 37a |
| `server/carnet.js` | Modèle des billets, circuit, `runDue()`, vérifications | 35-36 |
| `server/carnet-markdown.js` | Instance `Marked` dédiée, liste d'autorisation, `photo:ID` → `picture()` | 35 |
| `server/routes/carnet.js` | Admin du carnet (enregistré depuis `admin.js`, comme `voyages.js`) | 35-36 |
| `server/spaces.js` | `createSpaces({ db, vault, mailer, readiness, now })` : espaces, invitations, sélections, purge | 37a, 37b |
| `server/routes/prive.js` | Routes des invités (`/g/`, `/prive/`) | 37a |
| `server/routes/galeries.js` | Admin des galeries (portée sur le modèle de `voyages.js`) | 37a |
| `server/shop.js` | Vendeurs, catalogue, éditions, panier, commandes, transitions d'état (une table de transitions testée), boîte d'envoi (`outbox`) | 40-41b |
| `server/shipping.js` | Zones, tarifs, dates promises | 40 |
| `server/terms.js` | CGV par défaut en trois langues, sur le modèle de `rights.js` | 41a |
| `server/payments/index.js`, `server/payments/stripe.js` (`mollie.js` si choisi) | Adaptateur, `settle()`, rapprochement (commandes, événements non traités, remboursements et litiges) | 41a |
| `server/routes/paiement.js` | Webhook, une route par vendeur, plugin encapsulé à corps brut | 41a |
| `server/routes/boutique.js` | Admin de la boutique | 40-41b |
| `server/invoices.js` | `createInvoices({ db, vault, storageDir, outbox, requestTimestamp, now })` : séries, émission, PDF, avoirs, intégrité, file d'horodatage propre (la file de `proofs.js` ne traite que des photos) | 42 |
| `server/compta.js`, `server/routes/compta.js` | Recettes, achats, rapprochement, seuils, e-reporting | 42-43 |
| `server/lettre.js` | Abonnés, file d'envoi | 44 |
| Vues `views/carnet*.eta`, `views/prive/*.eta`, `views/boutique/*.eta`, `views/admin/…` | Gabarits ; aucun `style=`, `<%~ %>` réservé au HTML du serveur | — |

Dépendance nouvelle : **pdfkit** seulement (phase 42). `marked` est déjà installé ; `crypto.scrypt` et `fetch` sont dans Node 22.

### 7.3 Tables

Numéros de migration indicatifs (dernier fichier actuel : `039_descriptions.sql`). Conventions : dates en millisecondes, montants en centimes, traductions `_en` et `_de`, JSON dans un `TEXT`, états validés en JavaScript sans `CHECK`, commentaire de tête en français. `photos.status` n'est jamais touché (G2).

| Migration | Tables | SQL complet |
|---|---|---|
| `040_jetons_haches.sql` | `encounter_links` (photo offerte, jeton haché), remplie et ancienne table supprimée dans la même migration (fonction SQL `sha256` déclarée par `db.function`, § 7.1), ou liens en clair laissés expirer | — |
| `041_carnet.sql` | `posts`, `post_authors`, `post_refs`, `tags`, `post_tags`, `post_slugs`, `post_reviews` | Ci-dessous |
| `042_carnet_brouillons.sql` | `post_drafts`, `post_revisions`, `post_shares` ; `photos.listed` (choix B16) | Ci-dessous |
| `043_espaces_prives.sql` | `visitor_sessions` (identifiant interne, `token_hash`), `private_spaces`, `space_items`, `space_invites`, `visitor_grants` (`expires_at`, `remember`), `space_lists`, `space_list_items`, `space_comments`, `space_events` ; `photos.variant_salt` (G43) ; `invite_spaces` si G78 (a) | [Annexe galeries](annexe-galeries-privees-securite.md) |
| `044_billets_prives.sql` | `posts.visibility`, `private_spaces.post_id` | Ci-dessous |
| `045_boutique.sql` | `sellers`, `shop_papers`, `shop_formats`, `shop_products`, `shop_variants`, `shop_price_history`, `edition_copies`, `edition_events`, `carts`, `cart_items`, `shipping_zones`, `shipping_rates`, `terms_versions` | [Annexe paiement et facturation](annexe-paiement-facturation.md) |
| `046_commandes.sql` | `orders`, `order_items`, `order_events`, `payments`, `payment_events` (compte, `processed_at`), `outbox`, `refunds`, `withdrawals`, `lab_orders`, `lab_order_items`, `shipments`, `shipment_items` | Idem |
| `047_factures.sql` | `invoice_series`, `invoices`, `invoice_lines`, `invoice_files`, `invoice_events`, `receipts`, `payouts`, `purchases`, `ereporting_periods`, déclencheurs de figeage | Idem |
| `048_lettre.sql` | `subscribers`, `mailings` | Ci-dessous |

Contraintes qui pèsent sur la conception :

- Reconstruire `photos` pour un nouvel état déclencherait les `ON DELETE CASCADE` des quinze tables qui la référencent, et `PRAGMA foreign_keys` est sans effet dans la transaction de chaque migration [279] : jamais de nouvel état dans `photos.status`.
- Les ventes tiennent les photos par `ON DELETE RESTRICT` (`shop_products.photo_id`) : l'admin doit refuser proprement la suppression d'une photo vendue et proposer de la retirer de la vente, au lieu d'afficher une erreur SQL.
- Les lignes de facture ne référencent pas `photos` par clé étrangère : `SET NULL` modifierait une ligne figée (refusé par le déclencheur), `CASCADE` la supprimerait.
- `ALTER TABLE … ADD COLUMN … REFERENCES …` est permis quand la valeur par défaut est NULL [280].

```sql
-- 041_carnet.sql
-- Carnet (blog) des photographes : billets en trois langues, en Markdown restreint, avec des photos de la photothèque
-- citées par leur identifiant (photo:123). Une ou deux signatures (post_authors). États validés dans le code (pas de
-- CHECK : SQLite ne sait pas le modifier). Dates en millisecondes. Le billet en ligne ne change qu'à l'enregistrement.
CREATE TABLE posts (
  id                INTEGER PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  state             TEXT NOT NULL DEFAULT 'brouillon',  -- brouillon | propose | a_reprendre | programme | publie | retire
  title             TEXT NOT NULL,
  title_en          TEXT NOT NULL DEFAULT '',
  title_de          TEXT NOT NULL DEFAULT '',
  dek               TEXT NOT NULL DEFAULT '',            -- chapô
  dek_en            TEXT NOT NULL DEFAULT '',
  dek_de            TEXT NOT NULL DEFAULT '',
  body              TEXT NOT NULL DEFAULT '',            -- Markdown restreint
  body_en           TEXT NOT NULL DEFAULT '',
  body_de           TEXT NOT NULL DEFAULT '',
  langs             TEXT NOT NULL DEFAULT '["fr"]',      -- langues publiées (traduction relue)
  cover_photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  share_photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  trip_id           INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  sponsored_note    TEXT NOT NULL DEFAULT '',            -- mention commerciale (LCEN, art. 20)
  sponsored_note_en TEXT NOT NULL DEFAULT '',
  sponsored_note_de TEXT NOT NULL DEFAULT '',
  reply_text        TEXT NOT NULL DEFAULT '',            -- droit de réponse, affiché après le billet
  reply_at          INTEGER,
  mail_replies      INTEGER NOT NULL DEFAULT 1,          -- « Écrire aux auteurs »
  publish_at        INTEGER,
  published_at      INTEGER,
  revised_at        INTEGER,
  retired_at        INTEGER,
  retire_reason     TEXT NOT NULL DEFAULT '',
  version           INTEGER NOT NULL DEFAULT 1,          -- verrou optimiste
  created_by        TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX posts_state ON posts (state, published_at);

CREATE TABLE post_authors (                -- signatures ; la portée « les miennes » regarde cette table
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, author_id)
);
CREATE INDEX post_authors_author ON post_authors (author_id);

CREATE TABLE post_refs (                   -- ce que cite le corps, recalculé à chaque enregistrement
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  kind       TEXT NOT NULL,                -- photo | serie | voyage | carnet (pas de clé étrangère : dépend de kind)
  target_id  INTEGER NOT NULL,
  PRIMARY KEY (post_id, lang, kind, target_id)
);
CREATE INDEX post_refs_target ON post_refs (kind, target_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', name_de TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '', intro_en TEXT NOT NULL DEFAULT '', intro_de TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE post_slugs (                  -- anciens slugs d'un billet publié : redirection 301 ; le code refuse un slug
                                           -- déjà présent dans posts ou post_slugs (B3)
  slug TEXT PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL
);

CREATE TABLE post_reviews (                -- décisions du circuit (modèle photo_reviews)
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                    -- proposee | retiree | publiee | programmee | deprogrammee | renvoyee | modifiee | retire
  by_sub TEXT, by_name TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '', publish_at INTEGER
);
CREATE INDEX post_reviews_post ON post_reviews (post_id, at);
```

```sql
-- 042_carnet_brouillons.sql
-- Brouillon enregistré automatiquement (un par billet) et révision proposée d'un billet publié : le billet en ligne
-- ne change qu'à l'enregistrement ou à la validation. Versions : les 30 dernières par billet.
CREATE TABLE post_drafts (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  data TEXT NOT NULL, base_version INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'auto',      -- auto | proposee
  by_sub TEXT, by_name TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL
);
CREATE TABLE post_revisions (
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  data TEXT NOT NULL, by_sub TEXT, by_name TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL
);
CREATE INDEX post_revisions_post ON post_revisions (post_id, at);
CREATE TABLE post_shares (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  via TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, via, day)
);
-- Choix B16 : photo publiée gardée hors de la galerie (« carnet seulement »).
-- ALTER TABLE photos ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
```

```sql
-- 044_billets_prives.sql
-- Un billet privé n'est jamais listé publiquement (visibility) ; il est servi par un espace privé de type billet.
ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';     -- public | prive
ALTER TABLE private_spaces ADD COLUMN post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;
```

```sql
-- 048_lettre.sql
-- Lettre d'information : double confirmation ; adresse scellée et index HMAC ; jeton de confirmation haché ;
-- jeton de désinscription recalculé par HMAC (rien à stocker). Aucune mesure d'ouverture.
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,                     -- vault.seal
  email_index TEXT NOT NULL UNIQUE,        -- vault.index
  lang TEXT NOT NULL DEFAULT 'fr',
  state TEXT NOT NULL DEFAULT 'en_attente',-- en_attente | actif
  confirm_hash TEXT, confirm_expires INTEGER,
  consent_version TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, confirmed_at INTEGER, last_contact_at INTEGER
);
CREATE TABLE mailings (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  lang TEXT NOT NULL, subject TEXT NOT NULL,
  created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
  cursor INTEGER NOT NULL DEFAULT 0,       -- dernier abonné servi (reprise après redémarrage)
  sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  UNIQUE (post_id, lang)
);
```

### 7.4 Routes

**Site public, dans le plugin `pages`** (trois langues, préfixes `''`, `/en`, `/de`) : `/carnet`, `/carnet/:slug`, `/carnet/etiquette/:slug`, `/carnet/:slug/partager`, `POST /carnet/:slug/partage` ; `/boutique`, `/boutique/:slug`, `/panier` et ses POST (`/panier/ajouter`, `/panier/retirer`, `/panier/quantite`), `/commande` (formulaire, `?vendeur=`), `POST /commande`, `GET /commande/:ref/payer`, `/commande/:ref/merci`, `/commande/:ref/interrompu`, `POST /commande/:ref/annuler`, `/renoncer` (GET et POST), `/conditions-de-vente`.

**Hors `pages`** (pas de redirection de langue) : `/carnet/flux.xml`, `/en/carnet/flux.xml`, `/de/carnet/flux.xml` ; `/g/:token` (GET, POST) ; `/prive/:pid`, `/prive/:pid/photo/:item`, `/prive/:pid/m/:name`, `/prive/:pid/telecharger/:item/:taille`, `POST /prive/:pid/archive` et `GET /prive/:pid/archive/:n`, `POST /prive/:pid/selection/:item`, `POST /prive/:pid/selection/terminer`, `POST /prive/:pid/commentaires/:item`, `POST /prive/:pid/langue`, `POST /prive/quitter` ; `/suivi/:token` ; `/facture/:token` (téléchargement privé) ; `POST /paiement/webhook/stripe/:prefixe` (une route par vendeur) ; lettre (`POST /lettre`, `/lettre/confirmer/:jeton`, `/lettre/desinscription/:jeton`, `POST /lettre/desinscription/:jeton/un-clic`).

**`robots.txt`** : ajouter `Disallow` pour `/prive/`, `/suivi/`, `/facture/`, `/panier`, `/commande`, `/renoncer` (et leurs formes `/en/…`, `/de/…`), `/paiement/`, `/lettre/`. **Ne pas** interdire `/g/` (G36).

**Admin** (enregistré depuis `admin.js`, routes `P()` et `W()`, portée par motif d'URL) :

| Préfixe | Permission principale | Portée (contrôle `admin.js:114-142` pour un objet à propriétaire unique ; sinon `load`, `sees`, `manages` propres, modèle `voyages.js`) |
|---|---|---|
| `/admin/carnet`, `/admin/carnet/:id/…`, `/admin/carnet/etiquettes`, `/admin/carnet/photos.json`, `/admin/carnet/lettre` | `carnet.*`, `lettre.gerer` | Modèle `voyages.js` : billet visible si l'un de ses auteurs (`post_authors`) est le photographe du compte (B42) |
| `/admin/galeries`, `/admin/galeries/:id/…` (photos, invitations `/:inv/…`, sélections, aperçu) | `galeries.*` | Modèle `voyages.js` : `request.owns(perm, space.author_id)`, espace commun réservé à la portée « tout » |
| `/admin/boutique/oeuvres/:id`, `/admin/boutique/commandes/:id/…`, `/admin/boutique/preparation`, `/admin/boutique/reglages` | `boutique.*` | `/admin/boutique/oeuvres/:id`, `/admin/boutique/commandes/:id` |
| `/admin/compta/factures/:id/…`, `/admin/compta/recettes`, `/admin/compta/achats`, `/admin/compta/rapprochement`, `/admin/compta/declarations`, `/admin/compta/integrite`, `/admin/reglages/vendeurs` | `factures.*`, `compta.*`, `vendeurs.gerer` | `/admin/compta/factures/:id` (vendeur) |

Aucune route d'admin ne prend un jeton, une adresse e-mail ni un identifiant du prestataire en paramètre (C4). Exceptions au journal d'audit : aperçu et brouillon automatique du carnet (B34).

### 7.5 Permissions

Ajoutées à `PERMISSIONS` (`permissions.js:10-50`) ; `test/roles.test.js` vérifie la cohérence du catalogue. La répartition est un **choix** des auteurs ; proposition conforme au cadrage du 15 octobre 2026 (le modérateur n'a pas accès aux données personnelles) :

| Permission | Portée | Administrateur | Photographe | Modérateur | Relecteur |
|---|---|---|---|---|---|
| `carnet.voir` | oui | oui | oui (les siens) | oui | oui |
| `carnet.ecrire` | oui | oui | oui (les siens) | — | — |
| `carnet.publier` | oui | oui | réglable (`ADJUSTABLE`) | oui | — |
| `carnet.publies.modifier` | oui | oui | réglable | — | — |
| `carnet.textes` | non | oui | — | — | oui |
| `carnet.etiquettes` | non | oui | — | oui | — |
| `lettre.gerer` | non | oui | — | — | — |
| `galeries.voir`, `galeries.gerer`, `galeries.partager` | oui | oui | oui (les siennes) | — | — |
| `boutique.catalogue`, `boutique.commandes`, `boutique.rembourser` | oui | oui | oui (ses ventes) | — | — |
| `boutique.reglages` | non | oui | — | — | — |
| `factures.voir`, `factures.avoir`, `compta.voir`, `compta.saisir` | oui | oui | oui (ses ventes) | — | — |
| `vendeurs.gerer` | non | oui | — | — | — |

Chaque photographe étant vendeur de ses œuvres, il gère ses commandes, ses remboursements et sa comptabilité. Les invités des galeries et les clients ne sont jamais dans `accounts`.

**Administrateur.** Le rôle a toutes les permissions, en portée « tout » (`permissions.js:56`). Si chacun des deux est administrateur, chacun peut rembourser, établir des avoirs et lire les clients de l'autre vendeur : cela contredit le montage A (§ 6.1), le mandat de facturation (§ 5.3) et « chaque vendeur responsable de ses ventes » (annexe juridique, § 11). À trancher dans D16 : (a) limiter `boutique.*`, `factures.*` et `compta.*` au vendeur lié au compte, même pour un administrateur ; ou (b) un mandat écrit entre les deux (J8) et le registre RGPD mis à jour. Proposition : (a).

**Modérateur et Relecteur** n'ont accès ni aux galeries privées ni à la boutique : c'est une décision, à écrire dans D16.

### 7.6 Langues

- **Site public** : objets `UI[lang].carnet`, `.prive`, `.boutique`, `.panier`, `.commande`, `.suivi`, `.renoncer`, `.cgv` et modèles d'e-mails par langue (sur le modèle de `UI[lang].gift.mail`, `i18n.js:106-112`). Montants formatés selon la langue. Billets : langues publiées explicites (B7), pas de `pick`.
- **Admin** : `server/admin-i18n/NN-carnet.json`, `NN-galeries.json`, `NN-boutique.json`, `NN-compta.json` ; `test/langues-admin.test.js` exige l'anglais et l'allemand de chaque `t('…')`.
- **Textes juridiques** : CGV, mentions et page de rétractation par défaut dans le code, en trois langues, réglables dans l'admin (modèle `rights.js`) ; relecture juridique de l'allemand recommandée.
- **Traduction proposée** : LibreTranslate local, découpé à 10 000 caractères (`translate.js:6`), jamais publié sans relecture.

### 7.7 Sécurité

| Réponse | `Cache-Control` | Autres en-têtes |
|---|---|---|
| Pages publiques du carnet et de la boutique | Inchangé | `og:type` réglable |
| Flux Atom | `public, max-age=900`, `ETag`, `Last-Modified` | — |
| `/g/<jeton>`, `/prive/…` (pages), billet privé | `no-store` | `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (SO3) |
| `/prive/…/m/…` (images) | `private, no-cache` + ETag ; option stricte `private, no-store` | `noindex`, `Cross-Origin-Resource-Policy: same-origin` |
| Téléchargements privés, factures (`/facture/<jeton>`) | `private, no-store` | `Content-Disposition: attachment`, `noindex`, CORP, `no-referrer` |
| `/panier`, `/commande/…`, `/renoncer` | `private, no-store` | `noindex` |
| `/suivi/<jeton>` | `no-store` | `noindex`, `no-referrer` |
| Webhook de paiement | — | Pas de statistiques, pas de redirection |

| Cookie | Usage | Attributs |
|---|---|---|
| `langue` | Existant | Inchangé |
| `__Host-session` | Admin, existant | Inchangé |
| `__Host-visiteur` | Galeries privées et panier (SO2) | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` ; posé au premier mot de passe accepté ou au premier ajout au panier ; cookie de session, ou 30 jours (« se souvenir », panier) ; la durée du cookie ne prolonge aucune autorisation de galerie |

- **CSRF** : sur tout POST d'invité ou de panier, `Origin` **présent** et égal au site, ou `Sec-Fetch-Site: same-origin` ; et le jeton de la session visiteur dès qu'une session existe. `sameSite` (`public.js:382`) ne se réutilise pas tel quel : il accepte une requête sans `Origin`. `POST /g/:token` et le premier « Ajouter au panier » n'ont pas encore de session : le contrôle d'`Origin` est leur seule protection (CSRF de connexion). Webhook et désinscription « un clic » : sans CSRF par construction (signature, RFC 8058).
- **Limiteurs** (`createRateLimiter`, en mémoire, une instance) : `/g/` (60 GET par heure, 20 essais par 15 min et par adresse) et compteur par invitation **en base** ; `POST /commande` (10 par heure) ; ajouts au panier ; `/suivi/` et « nouveau lien » ; `/renoncer` ; lettre ; formulaire « Écrire aux auteurs » s'il est retenu.
- **Journaux** : SO4 ; identifiants seulement pour les objets du prestataire ; jamais de mot de passe, de jeton, d'e-mail ni de corps de webhook.
- **Fichiers** : `storage/invoices/` (dossier plat, sauvegardé, jamais purgé) ; `storage/private/` et `storage/private/archives/` (non sauvegardés, purgés ; pas `storage/tmp/`, vidé à chaque démarrage, `admin.js:64-67`) ; fichiers maîtres d'impression (purgés 30 jours après l'expédition).

### 7.8 CSP

Une seule modification : l'origine de la page de paiement hébergée ajoutée à `form-action`, par la liste passée à `csp()` (`app.js:261`), comme l'origine de l'IdP. Pour Stripe : `https://checkout.stripe.com`. Ni `script-src`, ni `frame-src`, ni `connect-src` ne changent. Le JSON-LD du carnet n'exige rien (bloc de données, B68 : à confirmer par un test navigateur). La recherche de point relais et les formulaires de carte intégrés sont écartés pour cette raison.

### 7.9 RGPD dans le code

Règle du projet : tout nouveau champ personnel passe par le coffre, a une durée et une purge, figure dans l'export et sur `/confidentialite` (`privacy.js:1-3`, date `UPDATED` en `privacy.js:6`). Lignes à ajouter au registre (`docs/wiki/RGPD.md`, § 1) :

| Traitement | Personnes | Données | Base légale | Durée | Destinataires |
|---|---|---|---|---|---|
| Galeries privées | Clients, personnes qu'ils désignent, professionnels invités | Étiquette, e-mail facultatif (chiffrés), langue, journal des accès (IP tronquée, pays), sélections, commentaires (chiffrés) | Contrat ; intérêt légitime | Fin de l'invitation + 6 mois | Les deux auteurs ; Cloudflare ; messagerie |
| Cookie de session visiteur | Invités, acheteurs | Jeton aléatoire (empreinte en base) | Nécessaire au service (exempté) | Cookie : session du navigateur, ou 30 jours (« se souvenir », panier) ; autorisations de galerie : 7 ou 30 jours au plus, chacune avec son échéance | — |
| Commandes et clients | Acheteurs | Nom, e-mail, téléphone, adresses (chiffrés), commandes, rétractations | Contrat ; obligation légale | Durée de la relation, chiffrée (C) : e-mail, téléphone et adresses effacés 3 ans après la livraison, les factures gardant l'identité 10 ans ; commande non payée : 30 jours ; purge testée | Vendeur ; transporteur ; prestataire de paiement ; relais SMTP |
| Paiements | Acheteurs | Identifiants de transaction, type de moyen, montants ; aucune donnée de carte | Contrat ; intérêt légitime (fraude, litiges) | Avec la commande, puis la pièce comptable | Prestataire de paiement (responsable conjoint pour certaines finalités chez Stripe [160]) |
| Factures et comptabilité | Acheteurs | Identité et adresse sur la facture, montants | Obligation légale | 10 ans | Expert-comptable, administration, plateforme agréée |
| Lettre d'information | Abonnés | E-mail (chiffré), langue, preuve du consentement | Consentement | Jusqu'à désinscription ; relance après 3 ans d'inactivité | Relais SMTP |

### 7.10 Tests

| Fichier | Couvre |
|---|---|
| `test/hors-admin.test.js` | SO8 : jetons mal formés, expirés, révoqués ; en-têtes `no-store`, `noindex`, `no-referrer` réellement présents ; `robots.txt` ; jetons absents des journaux capturés |
| `test/passwords.test.js` | Génération, saisie tolérante, format scrypt, re-hachage, sémaphore (faux scrypt injecté) |
| `test/carnet-rendu.test.js`, `carnet-admin.test.js`, `carnet-public.test.js`, `carnet-flux.test.js`, `carnet-prive.test.js` | Corpus XSS, `photo:ID`, portée à deux signatures, conflit 409, aucune ligne d'audit pour l'aperçu, publication refusée sans photos publiées, langue non publiée sans boucle de redirection, `hreflang`, JSON-LD, flux Atom valide et sans redirection de langue |
| `test/prive.test.js`, `prive-images.test.js`, `prive-admin.test.js` | T1 à T29 de l'annexe galeries : 404 et 410 uniformes, verrouillage avec horloge injectée, rotation de session, images hors espace refusées, téléchargement sans GPS, mot de passe absent de la base et de l'audit |
| `test/boutique.test.js` | Panier sans JavaScript, CSRF et `Origin`, recalcul, un bloc par vendeur, plafond d'édition (31e refusé), réservation concurrente, échéance, invariants |
| `test/paiement.test.js` | Faux prestataire qui signe ; signature invalide, horodatage hors tolérance, `v0` seul ; doublons et désordre ; échec de `settle()` puis réessai ; événement d'un vendeur sur la commande de l'autre ; `settle()` concurrent ; anomalie de montant ; session `complete` non payée ; échec de création de session ; paiement tardif ; rapprochement sans webhook (commandes, remboursements, litiges) ; boîte d'envoi (SMTP en panne, arrêt après le webhook) ; remboursements (rétractation avec frais de livraison) ; litiges ; clé `live` refusée hors production |
| `test/factures.test.js`, `compta.test.js` | 1 000 factures sans trou ; erreur forcée au milieu ; changement d'année à l'heure de Paris ; déclencheurs de figeage ; avoirs bornés ; mentions avant et après le 1/1/2027 ; intégrité ; agrégats d'e-reporting ; rapprochement |
| `test/lettre.test.js` | Confirmation par POST seulement ; en-têtes `List-*` ; désinscription un clic sans cookie ni redirection ; aucune adresse d'image propre à un destinataire |
| Tests existants | `roles.test.js`, `revue.test.js` (toutes les routes `/admin`), `langues-admin.test.js`, `nouveautes.test.js`, `aide.test.js`, `app.test.js` (en-têtes, `form-action`) |
| e2e | `carnet.spec.js`, `prive.spec.js`, `boutique.spec.js`, lancés par les projets `desktop` et `mobile` ; parcours **sans JavaScript** ; absence de violation CSP ; contrôle axe-core des nouvelles pages dans ces fichiers ; budget de poids de B63 dans `public.spec.js` ; écritures seulement avec `E2E_ALLOW_WRITES=1` et un serveur jetable. Les projets `iphone` et `audit` ne lancent que `iphone.spec.js` et `audit.spec.js` (`e2e/playwright.config.js:17-22`) : les cas iPhone s'ajoutent à `iphone.spec.js` ; `audit` rejoue les parcours d'ergonomie de l'admin J1 à J5 (`E2E_AUDIT=1`) et ne mesure aucun poids de page |
| Hors `npm test` | Validation PDF/A des factures par veraPDF (outil Java), facultative |

### 7.11 Documentation à livrer avec chaque PR

Règle du dépôt : code, tests et documentation dans la même PR, un paragraphe « Sécurité », une entrée dans `server/nouveautes.json` et la version `1.<n° de PR>.0`.

| Document | À ajouter |
|---|---|
| `docs/aide/` (fr, en, de) | Carnet, galeries privées, boutique, comptabilité |
| `docs/wiki/Spécifications.md`, `docs/aide/10-site-public.md` | Nouvelles pages publiques |
| `docs/wiki/Sécurité.md` | Jetons hachés, sessions visiteur, mots de passe, en-têtes, exception « fichier maître », SAQ A, correction du « seul cookie » (aussi `privacy.js:106` et `:159`, `Spécifications.md:31`, `docs/aide/10-site-public.md:14` et ses traductions, G75) |
| `docs/wiki/RGPD.md`, `server/privacy.js` | Registre, durées, cookies, destinataires |
| `docs/wiki/Configuration.md`, `.env.example`, `deploy/unraid/env.example` | `PAYMENT_PROVIDER`, clés Stripe et secrets de webhook par vendeur, jeton d'API Cloudflare (purge, G43), `DATA_KEY` exigée par les galeries, la boutique et la lettre (SO9), réglages de la boutique (règle de `docs/wiki/Développer.md` : toute variable figure dans les deux fichiers d'exemple) |
| `docs/wiki/Déploiement.md`, `Exploitation.md` | Règles Cloudflare (liste « Bypass » de J14, Always Online désactivé), Bot Fight Mode, NTP, contrôle `cf-cache-status`, vérification d'intégrité des factures, copie annuelle hors du serveur (D22) |
| `docs/wiki/Procédures.md` | Droit de réponse, rétractation, colis abîmé, litige, piste d'audit, e-reporting |
| `docs/wiki/Tests.md`, `PLAN.md` | Nouveaux tests ; phases 34 et suivantes |

---

## Partie 8. Plan de réalisation

Les phases suivent celles de `PLAN.md` (la dernière est la 33). Une PR par lot, sur une branche `feat/…`, avec un audit (sécurité, ergonomie) avant le lot suivant. Effort relatif : **S** petit, **M** moyen, **L** grand, **XL** très grand (comparés entre eux, pas en jours).

```
34 Socle ──┬── 35 Carnet 1 ── 36 Carnet 2 ──────────────┬── 39 Billets privés      44 Lettre (facultatif, après 35)
           └── 37a Galeries 1a ── 37b Galeries 1b ── 38 ┘
                     └── 40 Boutique 1 ── 41a Commande et paiement ── 41b Expédition et après-vente
                              ── 42 Factures, ouverture ── 43 E-reporting ── 45 V2 ── 46 V3
Démarches hors code (J1 à J17) : en parallèle, J3 dès maintenant
```

| Phase | Contenu | Exigences | Prérequis | Effort |
|---|---|---|---|---|
| **34. Socle commun et corrections de sécurité** | Jetons hachés et photo offerte migrée en une seule migration, ou liens en clair laissés expirer (C2, § 7.1), avec l'écran Rencontre, l'aide et les tests qui en découlent ; `Referrer-Policy` par route (C1) ; masquage des jetons, `vers=` compris (C3) ; retrait par identifiant (C4) ; limite de débit et réponse uniforme sur `GET /bonjour/<réf>-<code>` (C5) ; rendu de la photo offerte gardé (C6) ; décision sur `/pour-vous/` dans `robots.txt` (C7) ; portée de l'aperçu des voyages (C8) ; `passwords.js` ; conception de la session visiteur (identifiant interne, autorisations à échéance propre, SO2) ; `DATA_KEY` exigée par les nouveaux modules (SO9) ; `TRUST_PROXY` du `compose.yaml` générique fixé à l'adresse du tunnel (point 4 de la feuille de route de `PLAN.md`), dont dépendent les limites par adresse (G20, S36) ; tests hors `/admin` | SO1, SO3, SO4, SO5, SO8, SO9 | Aucun ; réglages Cloudflare (J14) et jeton d'API (J17) préparés | M |
| **35. Carnet, lot 1 : billets publics** | Migration `041` ; modèle, rendu sûr, vérifications ; admin sans JavaScript avec aperçu serveur ; publier ou proposer simplement ; pages publiques, flux, sitemap, `og:type`, `hreflang`, JSON-LD ; statistiques, menu, permissions ; `mailto` ; droit de réponse | B1-B14, B17-B27, B37, B39, B41-B44, B49, B52-B56, B58-B62, B65-B73, B78, B79, B82, B83 | 34 conseillé (non bloquant) | L |
| **36. Carnet, lot 2 : éditeur et circuit** | Migration `042` ; aperçu à côté, barre d'outils, sélecteur de photos, enregistrement automatique, copie locale, verrou, exemption du journal ; traductions ; historique ; programmation, renvoi, révision proposée, « Aujourd'hui », e-mails ; « Dans le carnet » ; comptage des partages ; photos « carnet seulement » si choisies | B16, B28-B36, B38, B40, B45-B48, B50, B51, B57, B63, B64 | 35 | L |
| **37a. Galeries privées V1, accès** | Sessions visiteur ; migration `043` ; permissions et portée ; admin (créer, photos, invitations sans e-mail, prolonger, révoquer, activité) ; page du lien neutre, galerie, page photo, images avec le filigrane du site (et sans GPS) ; sélection et « J'ai terminé » ; usage « privé » ; RGPD sans e-mail (registre, `/confidentialite`, purge) ; aide, Sécurité, Déploiement | SO2, SO6 (privé), G1-G30, G32-G41, G43, G45, G47, G48, G50, G53, G55-G57, G59-G63, G71, G72, G74-G77 | 34 ; règle Cloudflare (J14) et jeton d'API (J17) ; règle d'accord « privé » (J9), à défaut la règle prudente du § 2.7 | L |
| **37b. Galeries privées V1, e-mail et téléchargement** | E-mail d'invitation (adresse scellée) ; téléchargement web ; export et effacement par e-mail d'invité ; page `/prive` des accès si G78 (b) | G44 (web), G58, G70, G73, G78 | 37a ; relais SMTP sous contrat (J16) ; `DATA_KEY` (SO9) | M |
| **38. Galeries privées V2** | Commentaires, limite de sélection, listes nommées, grande taille et option sans filigrane (`storage/private/`), archive (`storage/private/archives/`), alerte d'appareils, option stricte, rappels d'échéance | G31, G42, G44 (grande), G46, G49, G51, G52, G54 | 37b | M |
| **39. Billets privés** | Migration `044` ; billet servi par un espace de type billet | B15, B74-B77, G64-G66 | 36, 37a | S |
| **40. Boutique 1 : vendeurs, catalogue, panier** (boutique fermée) | Migration `045` ; vendeurs ; papiers, formats, œuvres, éditions, exemplaires ; usage « vente » et accord « vente » (`SCOPES`, `SCOPE_LABELS`, `normalizeConsent`, `/bonjour`, app Rencontre, cartes imprimées, `privacy.js`, export, traductions) ; pages `/boutique` ; panier sans JavaScript, un bloc par vendeur ; zones et tarifs ; onglet « Vente », écrans Formats, Éditions ; certificat imprimable | SO6 (vente), S1-S13, S18, S20-S25, S41, S42, S47, S56, S59, S60 | 37a (sessions visiteur) ; J1, J9 ; décisions D1 à D9 | L |
| **41a. Boutique 2a : commande et paiement** | Migration `046` ; formulaire de commande, récapitulatif, bouton final (trois langues) ; CGV ; réservation ; Stripe Checkout (adaptateur, webhook par vendeur, `settle()`, `processed_at`, rapprochement), CSP ; boîte d'envoi (confirmation) ; faux prestataire et tests | SO7, S19, S26-S40, S52, S53, S55, S57, S62, S63, S65-S68, P1-P34 | 40 ; J6, J10 (mode test), J14, J16 | L |
| **41b. Boutique 2b : expédition et après-vente** | Préparation, expédition, suivi ; fonction de rétractation (libellés fr, en, de ; fin du délai sans date de livraison) ; remboursements (frais de livraison compris), litiges ; e-mails avec pièces jointes par la boîte d'envoi ; export et effacement des acheteurs ; purges | S14, S15, S16 (admin), S43, S45, S46, S48-S50, S54, S58, S64, S69 | 41a | L |
| **42. Factures, comptabilité, ouverture** | Migration `047` ; pdfkit ; séries, émission par envoi, avoirs, intégrité, file d'horodatage propre ; livre des recettes, recettes hors site, achats, rapprochement, seuils, aide aux déclarations ; sauvegarde des factures testée ; **ouverture de la boutique** quand les démarches sont faites | F1-F16, F19-F27 | 41b ; J2-J5, J7, J11, J13, J15, J16 | L |
| **43. E-reporting et clients professionnels** (avant le 1er septembre 2027) | Agrégats par jour, exports, suivi des transmissions ; clients professionnels ; API de plateforme si le volume le justifie | F17, F18 | 42 ; J3 | M |
| **44. Lettre d'information** (facultative) | Migration `048` ; inscription, double confirmation, désinscription un clic, file d'envoi ; formulaire et courrier des lecteurs si choisis | B80, B81, B84-B94 | 35 ; SO7 | M |
| **45. Boutique V2** | Tirages depuis une galerie ; cartes cadeaux ; API de laboratoire ; vérification publique des certificats ; Suisse en DAP ; recherche de point relais côté serveur ; encadrement | G67-G69, S16 (laboratoire), S17, S44, S61 | 42 ; avis de l'expert-comptable (Suisse, cartes cadeaux) | L |
| **46. Boutique V3** | Fichiers numériques (UE seulement, licence, renonciation) ; livres et zines ; cartes postales vendues | S51, S66 | Statut validé (URSSAF, expert-comptable) | L |

**Calendrier.** La réception des factures électroniques est déjà due (J3). Si la boutique ouvre avant le 1er septembre 2027, la phase 43 doit être livrée avant cette date ; si elle ouvre après, la phase 43 rejoint la phase 42. Si la boutique doit passer avant le carnet, l'ordre devient 34, 37a (au moins les sessions visiteur), 40, 41a, 41b, 42, puis 35 et la suite. Les phases 37 et 41, trop grosses pour « une PR par phase, audit avant de continuer », sont coupées en deux (37a, 37b ; 41a, 41b).

---

## Partie 9. Coûts

### 9.1 Coûts fixes

| Poste | Montant | Par | Source |
|---|---|---|---|
| Carnet, galeries privées | 0 € (aucune dépendance, aucun service) | — | — |
| Comptes de l'équipe (Zitadel) | 0 € tant que moins de 100 utilisateurs actifs par jour | Site | [278] |
| Cloudflare (Tunnel, cache, purge par URL) | 0 € (offre actuelle) | Site | [274] |
| Bibliothèque PDF (pdfkit) | 0 € (MIT) | Site | [212] |
| Prestataire de paiement (Stripe ou Mollie) | 0 € d'abonnement | Vendeur | [142], [163] |
| Plateforme agréée de réception | 0 € (offres gratuites : Dougs, Indy, Tiime, Abby, SUPER PDP) | Vendeur | [101], [203]-[207] |
| API d'e-reporting (facultative) | Minimum 10 € HT par an (SUPER PDP) | Vendeur | [203] |
| Médiateur de la consommation | 48 € pour 3 ans, soit 16 € par an (CM2C), + 36 € par médiation ; HT ou TTC non précisé sur la page | Vendeur | [18] |
| Éco-organisme des emballages | 110 € HT par an sous 10 000 unités (Citeo) | Vendeur (à confirmer) | [34] |
| Relais SMTP (galeries, boutique, lettre), sous contrat de sous-traitance | 0 € dans les offres gratuites (Mailjet, Brevo), à valider pour les e-mails transactionnels | Site | [285], [286] |
| Copie annuelle hors du serveur (factures, registres, D22) | 0 € sur un disque externe chiffré déjà possédé ; sinon à chiffrer | Vendeur | — |
| Expert-comptable, assurance, compte bancaire dédié, épreuves de contrôle, certificats de marque | **À confirmer** (devis à demander) | Vendeur | — |
| Abonnement d'expédition (Sendcloud) | 0 € : non nécessaire en V1 | — | [234] |

**Total connu** : environ 126 € par vendeur et par an (110 € HT pour l'éco-organisme, 16 € pour le médiateur, HT ou TTC non précisé), soit environ 252 € pour les deux si chacun adhère séparément, hors postes à confirmer.

### 9.2 Coûts par vente

| Poste | Montant relevé | Source |
|---|---|---|
| Paiement par carte EEE courante (Stripe) | 1,5 % + 0,25 € | [142] |
| Paiement Wero (Stripe) | 0,29 € | [143] |
| Litige | 20 € (Stripe), en plus de la perte | [142] |
| Tirage | Jet d'encre 30 × 40 cm « à partir de 12,44 € HT » (PictoOnline, papier non précisé) ; giclée A3 22,30 $ HT, A2 43,05 $ HT (theprintspace) | [222], [219] |
| Port du laboratoire vers l'auteur | À confirmer | — |
| Emballage | Pochette rigide 0,73 à 0,83 € HT ; tube 1,95 € HT | [235] |
| Expédition France, 1 kg, domicile | 9,59 € (Colissimo, tarif public) ; dès 5,10 € HT (Mondial Relay par Boxtal) | [230], [233] |
| Expédition UE, 1 kg | 19,39 € (Colissimo) | [230] |
| Assurance au-delà de 23 € par kg | Ad valorem par tranches de 100 € : tarif à confirmer | [232] |

### 9.3 Exemple : un tirage A3 vendu 150 €, livré en France, port offert

Hypothèses : prix de 150 € TTC choisi pour l'exemple (le prix est une décision des auteurs) ; vendeur en franchise (pas de TVA collectée, TVA des achats non récupérée) ; tirage chez PictoOnline au prix d'appel, TVA de 20 % supposée sur cet achat ; carte EEE courante.

| Ligne | Montant |
|---|---|
| Prix payé par le client | 150,00 € |
| Paiement (1,5 % × 150 + 0,25) | − 2,50 € |
| Tirage (12,44 € HT × 1,2) | − 14,93 € |
| Emballage (pochette rigide, TTC) | − 0,87 à − 1,00 € |
| Expédition Colissimo France 1 kg | − 9,59 € |
| **Reste avant les postes à confirmer** | **≈ 122 €** |
| À déduire ensuite | Port du laboratoire, assurance, carte postale, part des coûts fixes, cotisations sociales (taux 2026 au § 6.2, sur l'assiette micro-BNC) et impôt (pas de versement libératoire pour l'artiste-auteur, § 5.7) |

Sur un mois de 20 commandes de 80 €, les frais de paiement vont de 24 € (Mollie, cartes CB) à 53 € (PayPal), 29 € chez Stripe (§ 4.4).

---

## Partie 10. Risques

| Id | Risque | Impact | Mesures | Reste |
|---|---|---|---|---|
| RQ1 | Montage requalifié (diffuseur, opérateur de plateforme, société de fait) | Cotisations, déclarations, responsabilité commune | Avis de l'expert-comptable avant la phase 40 ; convention écrite (J8) ; vendeur nommé partout (S1) | Moyen tant que DAC7 n'est pas confirmé |
| RQ2 | Perte du statut d'œuvre d'art (31e exemplaire, tirage non signé, EA comptées autrement) | Taux de TVA, régime social | Registre par photo, ventes hors site comprises (S5) ; livraison à l'auteur et signature (S14) | Faible |
| RQ3 | Seuil de franchise dépassé sans le voir | TVA due dès le dépassement, factures à refaire, logiciel de caisse | Tableau des seuils et alertes (F19) ; mentions datées (F23, F26) | Faible |
| RQ4 | Logiciel de caisse exigé après passage à la TVA | Certification coûteuse ou changement de prestataire | Cartes et virements bancaires seulement, ce que vise la dispense ([88] § 37, exemple 1) ; aucun autre moyen (carte cadeau, solde de portefeuille) ; avis de l'expert-comptable pour Wero et PayPal ; F25 | Faible |
| RQ5 | Galerie privée vue par des tiers (lien et mot de passe transférés) | Atteinte à la vie privée, violation de données | Lien personnel, autre canal, échéance, révocation, appareils comptés, téléchargement coupé | Moyen : on le voit, on ne l'empêche pas |
| RQ6 | Image privée servie par le cache de Cloudflare | Fuite | `private`, règle « Bypass », jamais `/media/`, contrôle `cf-cache-status` (G38-G41) | Faible si le contrôle est fait |
| RQ7 | XSS par le Markdown d'un billet | Vol de session d'admin | Renderers dédiés, liste d'autorisation, corpus de tests, CSP (B17-B19) | Faible |
| RQ8 | Survente d'un exemplaire, double règlement | Remboursement, image | Réservation en transaction, expiration chez le prestataire d'abord, `settle()` idempotent (S36-S40, P7) | Faible |
| RQ9 | Webhook perdu (serveur éteint, Bot Fight Mode) | Commande payée non traitée | Rapprochement toutes les 5 min, page de retour, alerte (P9, P10, P23, P30) | Faible |
| RQ10 | Litige ou fraude | 20 € de frais, perte du tirage | 3-D Secure, expédition après confirmation, preuves, libellé clair (P14, P25) | Moyen |
| RQ11 | Tirage perdu ou abîmé en transport | À la charge du vendeur [14] | Emballage rigide, suivi, assurance, retirage du même numéro (S43, S50) | Moyen |
| RQ12 | Photo vendue ou montée en privé sans l'accord adéquat | Atteinte au droit à l'image | Usages « vente » et « privé » bloquants (SO6), nouvel accord (J9), avis d'un juriste | Faible après avis |
| RQ13 | Perte ou absence de `DATA_KEY` | Coordonnées des clients illisibles ; ou, sans clé, données jamais chiffrées | Factures en PDF hors coffre (F13) ; procédure de sauvegarde de la clé déjà prévue ; modules fermés sans clé (SO9) | Faible |
| RQ14 | Facture effacée ou modifiée | Amendes, piste d'audit rompue | Déclencheurs (F5), `FILE_DIRS`, chaînage et horodatage (F9) | Faible |
| RQ15 | Réception ou e-reporting non tenus | 500 € par transmission manquante ; mise en demeure pour la réception | J3 dès maintenant ; phase 43 avant le 1/9/2027 | Faible |
| RQ16 | Fonction de rétractation non conforme | Amende administrative jusqu'à 15 000 € par vendeur (personne physique ; 75 000 € pour une personne morale) [303] | S48, tests, accusé horodaté par la boîte d'envoi | Faible |
| RQ17 | Charge de travail (préparation, signature, expédition, après-vente, comptabilité) | Retards, abandon | Offre V1 réduite, file « Aujourd'hui », dates promises réalistes | Moyen |
| RQ18 | Dépendance au prestataire (non européen, fermeture de compte) | Paiements bloqués | Adaptateur (P22), Mollie prêt en alternative | Faible |
| RQ19 | Textes qui changent (CIBS 2027, DSP3 vers 2028, Royaume-Uni 2028) | Mentions et parcours à revoir | Textes en réglages datés, veille annuelle | Faible |
| RQ20 | Confirmation de commande ou accusé de rétractation jamais envoyés (SMTP en panne, arrêt du serveur après la réponse au webhook) | Obligation non tenue [3], [7] ; litiges | Boîte d'envoi persistante, réessais, alerte (P33) ; relais sous contrat (J16) | Faible |
| RQ21 | Paiement mal attribué entre les deux vendeurs, ou événement de paiement perdu | Commande réglée sur le mauvais compte ; remboursement ou litige non vu | Webhook par vendeur, contrôle du vendeur dans `settle()`, `processed_at`, rapprochement quotidien des remboursements et litiges (P5, P7, P10) | Faible |

---

## Partie 11. Décisions et questions

### 11.1 Décisions des auteurs

| Id | Décision | Recommandation |
|---|---|---|
| **D1** | Qui vend, sous quel statut | **Chacun ses œuvres, en son nom** ; artiste-auteur pour les tirages originaux ; micro-entreprise BIC seulement si des objets sont vendus |
| **D2** | Offre de départ | **Éditions limitées seules** : 8 à 15 photos, 2 formats, 1 papier (Photo Rag), carte postale offerte |
| D3 | Plafond global ou par format ; EA | Plafond global de 30, EA comprises |
| D4 | Numéro d'exemplaire | Le plus petit libre, réservé à la commande, montré et figé au paiement (arbitrage 21) |
| D5 | Laboratoire V1 | Production dans l'UE, commande manuelle, livraison à l'auteur (PictoOnline, ou Prodigi / creativehub depuis l'UE) |
| D6 | Zones servies | France métropolitaine, Monaco, UE ; Suisse plus tard ; pas le Royaume-Uni |
| D7 | Seuil de signature et d'assurance ; port offert | 150 € ; port : au choix |
| D8 | Prix ; prix croissant au fil de l'édition | Aux auteurs |
| **D9** | Prestataire de paiement | **Stripe Checkout** ; Mollie si un prestataire européen est préféré |
| D10 | Moyens de paiement ; « Link » ; reçu du prestataire | Cartes, Apple Pay, Google Pay, puis Wero ; Link et reçu désactivés |
| D11 | Plateforme agréée de chacun | Une offre gratuite de la liste officielle |
| D12 | Clients professionnels en ligne | Pas en V1 ; un client qui demande après coup une facture au nom de sa société : avoir puis nouvelle facture, faits à la main (F18) |
| D13 | Horodater chaque facture ou une fois par jour | Chaque facture (volume faible) |
| **D14** | Règle d'accord pour le privé et la vente | Usages « privé » et « vente » bloquants, nouvel accord « vente », règle validée par un juriste |
| D15 | Galeries : durées, appareils, mot de passe dans l'e-mail, pleine définition, filigrane | 6 mois après la fin, 30 jours de lien, 12 h et 7 jours de session ; alerte à 3 appareils ; jamais le mot de passe dans l'e-mail ; 4000 px au plus ; filigrane du site |
| D16 | Répartition des permissions ; portée de l'administrateur sur les ventes de l'autre ; accès du Modérateur et du Relecteur | Tableau du § 7.5 ; `boutique.*`, `factures.*` et `compta.*` limités au vendeur lié, même pour un administrateur (sinon mandat écrit, J8, et registre mis à jour) ; Modérateur et Relecteur sans accès aux galeries privées ni à la boutique |
| D17 | Carnet : libellé en/de, qui publie sans validation, flux, grandes vignettes, étiquettes, réactions, rythme | « Journal » ; modérateur, photographe réglable ; flux intégral ; `max-image-preview:large` si le filigrane suffit ; étiquettes indexées à 3 billets ; `mailto:` d'abord, courrier des lecteurs au cas par cas ; deux billets par mois annoncés |
| D18 | Lettre d'information | Pas avant un rythme tenu ; ensuite maison, relais Mailjet ou Brevo |
| **D19** | Ordre des phases | Socle, carnet, galeries, boutique (§ 8) |
| D20 | « Section » privée : invitation qui couvre plusieurs espaces, ou page `/prive` qui liste les accès de la session (G78) | Page `/prive` en V1 ; invitation multi-espaces si le besoin se confirme |
| D21 | Durée de la relation client (RGPD) | E-mail, téléphone et adresses d'une commande effacés 3 ans après la livraison ; factures gardées 10 ans (S64) |
| D22 | Copie annuelle hors du serveur des factures, avoirs et registres | Oui, sur un disque externe chiffré gardé ailleurs (coût nul si le disque existe) |
| D23 | Rétractation partielle : part des frais de livraison remboursée | Au prorata du prix des lignes rendues, à confirmer avec un juriste (annexe paiement, § 2.6) |

### 11.2 Questions pour l'expert-comptable

1. Montage « chacun vend » : le site commun fait-il de l'un l'opérateur de plateforme des ventes de l'autre (DAC7, art. 1649 ter A et suivants) ? Et avec une convention écrite ?
2. Seuil de franchise de la partie commerciale d'un auteur : 35 000 € (BOFiP des auteurs) ou 85 000 € ?
3. Fichier vendu à un particulier : 20 % (service électronique) ou 10 % (art. 279 g) ? Bien ou service pour la facture et l'e-reporting ?
4. Les épreuves d'artiste comptent-elles dans les 30 ? La signature doit-elle être sur le tirage ? Une signature numérique imprimée vaut-elle « authentification » ?
5. Un tirage fait par un laboratoire, livré à l'auteur et signé par lui reste-t-il un original ? Et en impression à la demande ?
6. Frais de port d'une commande mixte (5,5 % et 20 %) : ventilation selon la répartition par taux des autres recettes ? (Le principe du même taux que le bien est établi [308] § 70.)
7. Mention de franchise après le 1/1/2027 ; tolérance de l'ancienne référence jusqu'au 30/06/2028 ?
8. Quelle plateforme agréée, à quel coût ? (Le découpage de l'e-reporting en bimestres civils et la première période, septembre-octobre 2027, sont établis [111].)
9. Les quatre nouvelles mentions s'imposent-elles aux factures destinées à des particuliers ?
10. Faut-il un mandat de facturation si l'un exploite le site pour les deux ?
11. Frais d'un prestataire de paiement établi dans un autre État de l'UE : autoliquidation de la TVA en franchise (art. 283-2 [75]) ? Entrent-ils dans l'e-reporting ?
12. Si l'un devient redevable : la dispense de logiciel de caisse de l'exemple 1 ([88] § 37) couvre-t-elle Wero (virement compte à compte) et PayPal chez Stripe ?
13. Faut-il une micro-entreprise pour les cartes postales et les tirages non limités ?
14. Conservation : 6 ou 10 ans selon le régime ; FEC en micro.
15. Royaume-Uni, Suisse : conditions pour les ouvrir plus tard. TVA d'un tirage produit dans un autre pays de l'UE et livré sur place.
16. Structure commune (SAS, association) : coût annuel complet, seuil de rentabilité, TVA d'une association (recettes lucratives accessoires plafonnées à 81 051 €, art. 206-1 bis [77]).
17. Version de l'art. L441-9 au 1/1/2027 ; régularisation de TVA sur un avoir ; régime des cartes cadeaux.
18. Versement libératoire : confirmer qu'il est fermé aux revenus d'artiste-auteur (art. 151-0 du CGI, régime micro-social) et ouvert à la seule micro-entreprise BIC.
19. Ventes en exposition et licences sur devis : même série de factures que le site, ou série déclarée à part (F27) ?

### 11.3 Questions pour l'URSSAF (artistes-auteurs)

1. Tirages non limités, non signés ou en impression à la demande, vendus par l'auteur sur son site : revenus artistiques ou commerciaux ?
2. Cartes postales et affiches ?
3. Licence de fichier payée par un particulier : « droits d'auteurs hors droits versés par un organisme de gestion collective » ?
4. Taux 2026 relevés au § 6.2 (source secondaire [306]) : à confirmer, ainsi que la retraite complémentaire (RAAP) la première année (seuil d'affiliation de 10 692 € [307]) et les provisions trimestrielles.
5. Œuvre signée par les deux et vendue par l'un : comment déclarer la part de l'autre ?
6. Contribution du diffuseur (montages B et C) : l'assiette de 30 % du prix de vente (art. R382-17, œuvres graphiques et plastiques) s'applique-t-elle aux photographies ?

### 11.4 Questions pour un juriste

1. Usage « privé » : peut-on montrer à des tiers choisis une photo où l'on reconnaît quelqu'un sans son accord explicite, et dans quels cas (séance commandée, éditeur, jury) ?
2. L'accord « expositions et tirages » déjà recueilli couvre-t-il la vente ? Rédaction du nouvel accord. Exception si l'acheteur est la personne photographiée ?
3. Un tirage choisi au catalogue et tiré à la commande échappe-t-il à la rétractation ? Une dédicace le rend-elle « nettement personnalisé » ?
4. CGV en allemand pour des clients allemands ; droit applicable.
5. Domicile ou domiciliation dans les mentions légales.
6. Mention « Reproduction » (décret n° 81-255, art. 9) pour un tirage non limité d'une photo.
7. Personnes nommées dans un billet : quelle règle ?
8. Risque de société de fait avec une vitrine commune « Nicephos ».
9. Sécurité générale des produits pour une œuvre originale ; registre LUCID pour un petit vendeur étranger ; une adhésion à l'éco-organisme par vendeur ?
10. Validité minimale des cartes cadeaux.
11. Rétractation partielle : quelle part des frais de livraison standard rembourser (D23) ?
12. Amende pour une fonction de rétractation absente ou non conforme : texte en vigueur (art. L242-13 selon [303]) et montant pour une personne physique.

### 11.5 À vérifier soi-même

| Où | Quoi |
|---|---|
| Tableau de bord Cloudflare | Règles de cache, « Browser Cache TTL », « Origin Cache Control », Bot Fight Mode, Always Online, Crawler Hints (J14) ; jeton d'API de purge (J17) |
| Stripe | Ouverture d'un compte direct « individual » sans SIREN ; Wero en mode test et en production (« payé » dès la fin de la session ; catégories restreintes) ; désactivation de Link et des reçus ; longueur du libellé de relevé (P25) |
| Mollie (si choisi) | Frais de remboursement et de litige, ouverture de Wero en France, statut exigé |
| Serveur Unraid | Temps de scrypt (cible 0,25 à 1 s) ; synchronisation NTP ; chiffrement du disque des factures |
| Navigateurs | JSON-LD sans violation CSP ; annulation après insertion sur Safari iOS ; champ « nom d'utilisateur » caché pour les gestionnaires de mots de passe |
| Polices du dépôt | Incorporation dans un PDF/A produit par pdfkit (la licence SIL OFL 1.1 la permet : réglé) ; couverture du sous-ensemble latin pour les noms de clients |
| urssaf.fr (injoignable lors des relectures) | Provisions trimestrielles des artistes-auteurs ; traitement d'une cession de droits payée par un particulier |

---

## Sources

Consultées le **15 octobre 2026**, sauf les sources [302] à [314] et les mentions « relu le 16/10/2026 », consultées le **16 octobre 2026** lors des relectures. Les mentions « non lu », « résultat de recherche » ou « 403 » signalent un texte qui n'a pas pu être ouvert : le point qui en dépend est « à confirmer ».

**Droit de la consommation, commerce en ligne, publication**

- [1] Code de la consommation, art. L221-14 (« commande avec obligation de paiement ») : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226854
- [2] Code de la consommation, art. L221-15 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226852
- [3] Code de la consommation, art. L221-13 (confirmation sur support durable) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563210
- [4] Code de la consommation, art. L221-5 (version du 19/06/2026) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053310511
- [5] Code de la consommation, annexe à l'art. R221-3 (modèle d'information sur la rétractation, version du 19/06/2026) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053303407
- [6] Code de la consommation, art. L221-21 (version en vigueur au 19/06/2026) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226834
- [7] Code de la consommation, section contenant l'art. D221-5 (fonction de rétractation, en vigueur depuis le 19/06/2026) : https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032807234
- [8] Rapport au Président relatif à l'ordonnance n° 2026-2 du 5 janvier 2026 : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053298834
- [9] Fonction de rétractation, analyses : CCI Paris Île-de-France https://www.entreprises.cci-paris-idf.fr/actualites/e-commerce-et-droit-de-retractation-une-nouvelle-obligation-pour-les-professionnels ; HLC https://hlc.com/fr/publications/transposition-under-french-law-of-the-eu-mandatory-withdrawal-button-for-online-sales ; directive (UE) 2023/2673 https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32023L2673
- [10] Code de la consommation, art. L221-24 (remboursement) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226828
- [11] Code de la consommation, art. L221-28 (exceptions à la rétractation) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563170
- [12] Service-public.fr, « Droit de rétractation », F10485 (vérifié le 01/01/2026) : https://www.service-public.gouv.fr/particuliers/vosdroits/F10485
- [13] Code de la consommation, art. L216-1 (délai de 30 jours) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142498
- [14] Code de la consommation, art. L216-2 (transfert des risques) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142491
- [15] Code de la consommation, art. L216-3 (transporteur choisi par le consommateur) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142485
- [16] Code de la consommation, annexe à l'art. D211-3 (garanties, en vigueur depuis le 01/10/2022) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045981318
- [17] Code de la consommation, art. L612-1 et L641-1 (médiation ; lus dans les résultats de recherche) : https://www.legifrance.gouv.fr
- [18] CM2C, tarifs : https://www.cm2c.net/tarifs.php
- [19] Commission européenne, fermeture de la plateforme RLL au 20/07/2025 : https://consumer-redress.ec.europa.eu/site-relocation_en
- [20] Arrêté du 3 décembre 1987 relatif à l'information du consommateur sur les prix : https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006057893/
- [21] Code de la consommation, art. L112-1-1 (annonces de réduction de prix) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044549592
- [22] Loi n° 2004-575 (LCEN), art. 1-1 et 19 : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164
- [23] LCEN, art. 1-1, III, droit de réponse (en vigueur depuis le 23/05/2024) : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049568614
- [24] LCEN, art. 20, publicité identifiable : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000018048180
- [25] Décret n° 2007-1527 du 24 octobre 2007 (droit de réponse en ligne) : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000428279
- [26] Loi n° 82-652 du 29 juillet 1982, art. 93-3 (en vigueur depuis le 14/06/2009) : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000020740559
- [27] Règlement (UE) 2022/2065 (DSA), non lu (accès automatisé refusé) : https://eur-lex.europa.eu/eli/reg/2022/2065/oj ; analyses : https://www.utopiaanalytics.com/article/dsa-scope-in-focus-i-have-a-comments-section-does-the-dsa-apply-to-me et https://www.logora.com/guides/dsa-compliance-for-comment-sections/
- [28] Règlement (UE) 2018/302 (blocage géographique) : https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32018R0302 ; questions-réponses : https://digital-strategy.ec.europa.eu/en/news/geo-blocking-regulation-questions-and-answers
- [29] Règlement (UE) 2023/988 (sécurité générale des produits), art. 19 : https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32023R0988
- [30] Prodigi, « GPSR Requirements » : https://www.prodigi.com/gpsr/
- [31] Décret n° 2023-931 du 9 octobre 2023 (accessibilité des produits et services) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000048178349
- [32] accessibilite.numerique.gouv.fr, champ d'application : https://accessibilite.numerique.gouv.fr/obligations/champ-application/
- [33] Citeo, « Why join Citeo » : https://www.citeo.com/en/why-join-citeo/
- [34] Citeo, guide du tarif des emballages ménagers 2026 (forfait de 110 € HT sous 10 000 unités) : https://ecd-bo.citeo.com/ecd2/medias/citeo/public/fr/guide-du-tarif-des-emballages-menagers-2026.pdf
- [35] Stiftung Zentrale Stelle Verpackungsregister (LUCID) : https://www.verpackungsregister.org/en/
- [36] Code des postes et des communications électroniques, art. L34-5 (version en vigueur depuis le 26/07/2020) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042155961/
- [37] Code de commerce, art. R526-27 (mention « EI » ; résultat de recherche, version du 15/05/2022) : https://www.legifrance.gouv.fr
- [38] Code de commerce, art. L441-9 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414397

**Œuvres d'art, droit d'auteur, droit à l'image**

- [39] Décret n° 81-255 du 3 mars 1981 (« Marcus »), art. 1 et 9 : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000684875 ; art. 1 : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006589343
- [40] Code de la propriété intellectuelle, art. L131-2 (résultat de recherche, version du 01/10/2016) : https://www.legifrance.gouv.fr
- [41] Code de la propriété intellectuelle, art. R122-3 (extrait vu dans les résultats de recherche) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045961575/
- [42] Code civil, art. 9 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006419288
- [43] Service-public.fr, « Droit à l'image et au respect de la vie privée », F32103 (vérifié le 06/05/2022) : https://www.service-public.gouv.fr/particuliers/vosdroits/F32103

**Données personnelles**

- [44] RGPD : https://eur-lex.europa.eu/eli/reg/2016/679/oj ; chapitre III (CNIL) : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3
- [45] Loi n° 78-17, art. 80 (expression artistique) : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000037813972
- [46] CNIL, lignes directrices « cookies et autres traceurs », délibération n° 2020-091, art. 5 : https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf
- [47] CNIL, FAQ cookies : https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ
- [48] CNIL, recommandation « mots de passe » (délibération n° 2022-100 : 80 bits en cas 1, 50 bits en cas 2) : https://www.cnil.fr/fr/mots-de-passe-recommandations-pour-maitriser-sa-securite
- [49] CNIL, recommandation « journalisation » (délibération n° 2021-122 : de 6 mois à 1 an) : https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation
- [50] CNIL, « La prospection commerciale par courrier électronique » (mise à jour le 10/06/2026) : https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- [51] CNIL, « RGPD en pratique : maîtrisez votre relation client » : https://www.cnil.fr/fr/rgpd-en-pratique-maitrisez-votre-relation-client
- [52] CNIL, recommandation sur les pixels de suivi (publiée le 14/04/2026) : https://www.cnil.fr/fr/recommandation-pixel-suivi-courriels ; délibération n° 2026-042 du 12 mars 2026 : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053876850
- [53] CNIL, délibération n° 2021-131 (gestion des activités commerciales) : https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000045543374
- [54] CNIL, délibération n° 2018-303 (cartes de paiement) : https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000037481613
- [55] CNIL, « Les durées de conservation des données » (02/04/2026) : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees

**TVA, impôt, facturation : textes et doctrine**

- [56] CGI, art. 293 B (modifié par les lois n° 2025-127 et 2025-1044 ; abrogé au 01/01/2027) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045035275 ; version du 01/03/2025 au 01/01/2027 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051215135
- [57] CIBS, art. L. 233-3 (en vigueur au 01/01/2027, créé par l'ordonnance n° 2026-671) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054524584
- [58] Élysée, compte rendu du Conseil des ministres du 27/07/2026 (report du CIBS au 01/01/2027) : https://www.elysee.fr/emmanuel-macron/2026/07/27/compte-rendu-du-conseil-des-ministres-du-lundi-27-juillet-2026
- [59] Bpifrance Création, « Entrepreneurs : petite mise à jour à prévoir sur vos factures » (26/08/2026) : https://bpifrance-creation.fr/entrepreneur/actualites/entrepreneurs-petite-mise-a-jour-a-prevoir-vos-factures
- [60] WebLex, « TVA et CIBS : rendez-vous en 2027 » (09/09/2026) : https://www.weblex.fr/weblex-actualite/tva-et-cibs-rendez-vous-en-2027
- [61] BOFiP, BOI-TVA-DECLA-40-30-20260701 (franchise des auteurs, § 150-250) : https://bofip.impots.gouv.fr/bofip/148-PGP.html/identifiant=BOI-TVA-DECLA-40-30-20260701
- [62] impots.gouv.fr, « Les régimes d'imposition à la TVA » (modifiée le 21/05/2026) : https://www.impots.gouv.fr/professionnel/les-regimes-dimposition-la-tva
- [63] Entreprendre.service-public.fr, « Franchise en base de TVA », F21746 (vérifiée le 01/01/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F21746
- [64] impots.gouv.fr, franchise en base TVA européenne (modifiée le 23/04/2026) : https://www.impots.gouv.fr/je-souhaite-adherer-la-franchise-en-base-tva-europeenne
- [65] CGI, annexe III, art. 98 A (7° : photographies) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006298775
- [66] BOFiP, BOI-TVA-SECT-90-10-20240320 (photographies œuvres d'art, § 280-290) : https://bofip.impots.gouv.fr/bofip/1279-PGP.html/identifiant=BOI-TVA-SECT-90-10-20240320
- [67] BOFiP, ACTU-2024-00067 (CJUE, 5 septembre 2019, C-145/18) : https://bofip.impots.gouv.fr/bofip/14178-PGP.html/ACTU-2024-00067
- [68] Legifiscal, sur CJUE C-145/18 (source secondaire) : https://www.legifiscal.fr/jurisprudences-fiscales/455-taux-reduit-tva-photographie-art-legislation-francaise-illegale.html
- [69] BOFiP, BOI-TVA-SECT-90-40-20250514 (œuvres d'art, 5,5 %) : https://bofip.impots.gouv.fr/bofip/1285-PGP.html/identifiant=BOI-TVA-SECT-90-40-20250514
- [70] CGI, art. 278 (taux normal de 20 %) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000026950057
- [71] CGI, art. 279 (g), version du 01/03/2026 au 01/01/2027 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053562872
- [72] BOFiP, BOI-TVA-LIQ-30-20-100-20250903 (droits d'auteur, § 200-220) : https://bofip.impots.gouv.fr/bofip/1013-PGP.html/identifiant=BOI-TVA-LIQ-30-20-100-20250903
- [73] BOFiP, BOI-TVA-CHAMP-20-50-40-20-20211222 (services électroniques, seuil de 10 000 €, § 180) : https://bofip.impots.gouv.fr/bofip/11964-PGP.html/identifiant=BOI-TVA-CHAMP-20-50-40-20-20211222
- [74] CGI, art. 259 D (seuil de 10 000 €) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048835152
- [75] CGI, art. 283 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051214570
- [76] CGI, art. 102 ter (régime déclaratif spécial BNC) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054373747
- [77] CGI, art. 206 (associations, 1 bis) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054373514
- [78] CGI, art. 289 (en vigueur jusqu'au 01/01/2027) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048827413
- [79] CGI, annexe II, art. 242 nonies A (mentions) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276
- [80] CGI, art. 1737 (version du 21/02/2026) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006313721/
- [81] Cabinet Kohen Avocats, sanctions de la loi de finances 2026 (art. 1737 et 1788 D, source secondaire) : https://kohenavocats.com/sanctions-facturation-electronique-2026-lf-1737-1788d-cgi/
- [82] Loi n° 2026-103 du 19 février 2026 de finances pour 2026, art. 123 : https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000053508878
- [83] Décret n° 2026-677 du 27 juillet 2026 (plateformes agréées) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054499487
- [84] Arrêté du 27 juillet 2026 relatif à la généralisation de la facturation électronique : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054499535
- [85] Arrêté n° 83-50/A du 3 octobre 1983 : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000494187/
- [86] BOFiP, BOI-TVA-DECLA-30-20-10-10 (opérations à facturer) : https://bofip.impots.gouv.fr/bofip/13242-PGP.html/identifiant=BOI-TVA-DECLA-30-20-10-10-20210813
- [87] BOFiP, BOI-TVA-DECLA-30-20-20-10 (numérotation, § 70-130) : https://bofip.impots.gouv.fr/bofip/140-PGP.html
- [88] BOFiP, BOI-TVA-DECLA-30-10-30-20260325 (logiciels de caisse) : https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325
- [89] BOFiP, BOI-CF-IOR-60-40-20 (FEC, § 63) : https://bofip.impots.gouv.fr/bofip/9028-PGP
- [90] BOFiP, BOI-INT-AEA-30-20231213 (opérateurs de plateforme, DAC7) : https://bofip.impots.gouv.fr/bofip/13742-PGP.html/identifiant=BOI-INT-AEA-30-20231213
- [91] CGI, art. 1649 ter A : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044936377
- [92] Stripe, « DAC7 en France » (seuils des vendeurs exclus, source secondaire) : https://stripe.com/fr/resources/more/dac7-ruling-france
- [93] ACPR, DSP2 et places de marché (non ouvert) : https://acpr.banque-france.fr/system/files/import/acpr/medias/documents/201809_1_articledsp2revueacpr.pdf
- [94] Journal du Net, places de marché et ACPR (source secondaire) : https://www.journaldunet.com/retail/1146067-les-marketplaces-francaises-mises-en-peril-par-les-autorites-bancaires/

**Facturation électronique (administration fiscale)**

- [95] impots.gouv.fr, « Je passe à la facturation électronique » (modifiée le 01/09/2026) : https://www.impots.gouv.fr/professionnel/je-passe-la-facturation-electronique
- [96] impots.gouv.fr, « À partir de quand suis-je concerné par la réforme ? » (modifiée le 16/01/2026) : https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation
- [97] impots.gouv.fr, « Franchisé en base, micro-entrepreneur ou auto-entrepreneur, suis-je concerné ? » (modifiée le 28/09/2026) : https://www.impots.gouv.fr/professionnel/questions/franchise-en-base-micro-entrepreneur-ou-auto-entrepreneur-suis-je-concerne
- [98] impots.gouv.fr, « Je n'émets pas de facture, ou je facture sans TVA… » : https://www.impots.gouv.fr/professionnel/questions/je-nemets-pas-de-facture-ou-je-facture-sans-tva-suis-je-concerne-par-la
- [99] impots.gouv.fr, « Mes clients sont à la fois des entreprises et des particuliers… » : https://www.impots.gouv.fr/professionnel/questions/mes-clients-sont-la-fois-des-entreprises-et-des-particuliers-par-quel
- [100] impots.gouv.fr, « Comment devrais-je émettre et recevoir mes factures… » : https://www.impots.gouv.fr/professionnel/questions/dans-le-cadre-de-la-reforme-de-la-facturation-electronique-comment-devrais
- [101] impots.gouv.fr, « Je consulte la liste des plateformes agréées » (modifiée le 13/10/2026, fichiers XLSX) : https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees
- [102] DGFiP, FAQ « Tout savoir sur la facturation électronique » (PDF, août 2026) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/faq_tout_savoir_facturation-electronique.pdf
- [103] DGFiP, FAQ « Je découvre la facturation électronique » (PDF, version du 01/09/2026) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/faq---fe_je-decouvre-la-facturation-electronique.pdf
- [104] impots.gouv.fr, « Je découvre la facturation électronique » (modifiée le 26/05/2026) : https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique
- [105] DGFiP, « Guide pratique de la facturation électronique » (juillet 2026) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_pratique_facturation_electronique.pdf
- [106] DGFiP, « Documentation juridique » (PDF) : https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/facturation-electronique_documentation-juridique.pdf
- [107] impots.gouv.fr, « Facturation électronique et plateformes agréées » : https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- [108] BOFiP, BOI-TVA-DECLA-20-30-50-20260930 (données de transaction, cadre) : https://bofip.impots.gouv.fr/bofip/13897-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-20260930
- [109] BOFiP, BOI-TVA-DECLA-20-30-50-10-20260930 (champ d'application) : https://bofip.impots.gouv.fr/bofip/13898-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-10-20260930
- [110] BOFiP, BOI-TVA-DECLA-20-30-50-20-20260930 (données à transmettre) : https://bofip.impots.gouv.fr/bofip/13899-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-20-20260930
- [111] BOFiP, BOI-TVA-DECLA-20-30-50-30-20260930 (modalités et fréquences) : https://bofip.impots.gouv.fr/bofip/13900-PGP.html/identifiant=BOI-TVA-DECLA-20-30-50-30-20260930
- [112] BOFiP, BOI-TVA-DECLA-20-30-60-20260930 (données de paiement) : https://bofip.impots.gouv.fr/bofip/13901-PGP.html/identifiant=BOI-TVA-DECLA-20-30-60-20260930

**Statut social, micro-entreprise, conservation**

- [113] Sécurité sociale des artistes-auteurs, « Les photographes » : https://www.secu-artistes-auteurs.fr/artiste-auteur/le-regime-social/affiliation/activites-artistiques-eligibles/les-photographes
- [114] Sécurité sociale des artistes-auteurs, « Autoédition d'une œuvre originale » (02/07/2025) : https://www.secu-artistes-auteurs.fr/autoedition-dune-oeuvre-originale
- [115] urssaf.fr, « Artiste-auteur, vos modalités de déclaration et de paiement » : https://www.urssaf.fr/accueil/artiste-auteur-diffuseur/artiste-auteur/modalites-declaration-paiement.html
- [116] Code de la sécurité sociale, art. R382-1-1 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042285880
- [117] Code de la sécurité sociale, art. R382-1 (branche photographie) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042287067
- [118] Code de la sécurité sociale, art. R382-17 (assiette des diffuseurs) : https://www.legifrance.gouv.fr/codes/id/LEGIARTI000042287114/2020-08-30
- [119] Sécurité sociale des artistes-auteurs, taux de cotisations et contributions (mis à jour le 13/01/2025) : https://www.secu-artistes-auteurs.fr/diffuseur/taux-de-cotisations-et-de-contributions-des-diffuseurs
- [120] Sécurité sociale des artistes-auteurs, « Assiette sociale » : https://www.secu-artistes-auteurs.fr/artiste-auteur/mon-activite-artistique/cotisations-et-contributions-sociales/assiette-sociale
- [121] Sécurité sociale des artistes-auteurs, « Déclaration sociale des revenus 2025 » (campagne 2026) : https://www.secu-artistes-auteurs.fr/actu-declaration-sociale-des-revenus-2025
- [122] Urssaf, « Diffuseur commerçant d'art, vos cotisations » (site indisponible ce jour-là, extrait du moteur de recherche, à relire) : https://www.urssaf.fr/accueil/artiste-auteur-diffuseur/diffuseur-commercant-art/cotisation-contribution-sociale.html ; https://www.secu-artistes-auteurs.fr/diffuseur/les-obligations-sociales-des-diffuseurs
- [123] autoentrepreneur.urssaf.fr, « 2026 : modification des seuils » (résultat de recherche) : https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/toutes-les-actualites/2026--modification-des-seuils-de.html
- [124] urssaf.fr, taux des auto-entrepreneurs (résultat de recherche, page non ouverte) : https://www.urssaf.fr/accueil/actualites/taux-cotisations-autoentrepeneur.html
- [125] Entreprendre.service-public.fr, « Seuils de la micro-entreprise », F32353 (vérifiée le 21/02/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F32353
- [126] Entreprendre.service-public.fr, « Cotisations du micro-entrepreneur », F36232 (vérifiée le 01/01/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F36232
- [127] Entreprendre.service-public.fr, « Régime fiscal de la micro-entreprise », F23267 : https://entreprendre.service-public.gouv.fr/vosdroits/F23267
- [128] Entreprendre.service-public.fr, « Obligations comptables du micro-entrepreneur », F23266 : https://entreprendre.service-public.gouv.fr/vosdroits/F23266
- [129] Entreprendre.service-public.fr, « Registres obligatoires du micro-entrepreneur », F36018 (vérifiée le 21/02/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F36018
- [130] Entreprendre.service-public.fr, « Durée de conservation des documents », F10029 : https://entreprendre.service-public.gouv.fr/vosdroits/F10029
- [131] Entreprendre.service-public.fr, « Mentions obligatoires sur une facture », F31808 (vérifiée le 11/08/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F31808
- [132] Entreprendre.service-public.fr, « Tout savoir sur la facturation », F23208 (vérifiée le 07/08/2026) : https://entreprendre.service-public.gouv.fr/vosdroits/F23208
- [133] Code général de la fonction publique, art. L123-2 (résultat de recherche) : https://www.legifrance.gouv.fr

**International**

- [134] GOV.UK, « VAT and overseas goods sold directly to customers in the UK » : https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk
- [135] GOV.UK, « The VAT rules if you supply digital services to private consumers » : https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers
- [136] GOV.UK, réforme des importations de faible valeur : https://www.gov.uk/government/news/government-backs-high-street-with-acceleration-of-cheap-import-reforms-and-crackdown-on-dodgy-online-sellers ; https://www.gov.uk/government/publications/reforming-customs-rules-for-low-value-imports
- [137] Règlement (UE) 2026/382 du Conseil du 11 février 2026 : https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202600382 ; communiqué du Conseil : https://www.consilium.europa.eu/en/press/press-releases/2025/12/12/customs-council-agrees-to-levy-customs-duty-on-small-parcels-as-of-1-july-2026/
- [138] AFC (Suisse), « Vente par correspondance et imposition des plateformes » : https://www.estv.admin.ch/fr/tva-vente-par-correspondance-et-imposition-des-plateformes
- [139] OFDF (Suisse), « Réception de lettres et de paquets » : https://www.bazg.admin.ch/fr/reception-de-lettres-et-paquets
- [140] SECO (Suisse), suppression des droits de douane sur les produits industriels : https://www.seco.admin.ch/fr/suppression-droits-de-douane-produits-industriels
- [141] La Poste, déclaration en douane CN23 : https://aide.laposte.fr/contenu/comment-remplir-et-joindre-ma-declaration-en-douane-cn23 ; Colissimo, formalités : https://www.colissimo.entreprise.laposte.fr/fr/spec-inter

**Paiement**

- [142] Stripe, tarifs France : https://stripe.com/fr/pricing
- [143] Stripe, tarifs des moyens de paiement locaux (Wero, PayPal, SEPA) : https://stripe.com/fr/pricing/local-payment-methods
- [144] Stripe Tax, tarifs : https://stripe.com/fr/tax/pricing
- [145] Stripe Invoicing, tarifs : https://stripe.com/fr/invoicing/pricing
- [146] Stripe, factures après paiement de Checkout : https://support.stripe.com/questions/pricing-for-post-payment-invoices-for-one-time-purchases-via-checkout-and-payment-links ; reçus : https://docs.stripe.com/receipts?payment-ui=checkout
- [147] Stripe Connect, tarifs : https://stripe.com/fr/connect/pricing
- [148] Stripe, virements : https://docs.stripe.com/payouts
- [149] Stripe, remboursements : https://docs.stripe.com/refunds
- [150] Stripe, webhooks (signature, tolérance, réessais, ordre, doublons, rotation) : https://docs.stripe.com/webhooks
- [151] Stripe, exécution des commandes (page hébergée) : https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted
- [152] Stripe API, création d'une session Checkout : https://docs.stripe.com/api/checkout/sessions/create
- [153] Stripe API, expirer une session : https://docs.stripe.com/api/checkout/sessions/expire
- [154] Stripe API, requêtes idempotentes : https://docs.stripe.com/api/idempotent_requests
- [155] Stripe, guide de sécurité (PCI, CSP) : https://docs.stripe.com/security/guide
- [156] Stripe, paiements Wero : https://docs.stripe.com/payments/wero
- [157] Stripe, guide Wero pour la France (mis à jour le 06/04/2026) : https://stripe.com/resources/more/wero-guide-france
- [158] Stripe Connect, types de paiement : https://docs.stripe.com/connect/charges
- [159] Stripe, informations de vérification requises (France, « individual ») : https://docs.stripe.com/connect/required-verification-information?country=FR ; outil : https://docs.stripe.com/_endpoint/get-requirements-for-setups
- [160] Stripe, centre de confidentialité (entités, responsables de traitement) : https://stripe.com/legal/privacy-center
- [161] Stripe, « Manage limited inventory with Checkout » : https://docs.stripe.com/payments/checkout/managing-limited-inventory
- [162] Stripe, conditions générales (entité pour l'EEE) : https://stripe.com/fr/legal/ssa
- [163] Mollie, tarifs France : https://www.mollie.com/fr/pricing
- [164] Mollie, Wero : https://www.mollie.com/fr/payments/wero
- [165] Mollie, adhésion à EPI (08/01/2026) : https://www.mollie.com/news/mollie-epi-principal-member-wero
- [166] Mollie, webhooks : https://docs.mollie.com/reference/webhooks
- [167] Mollie, webhooks « next-gen » : https://docs.mollie.com/reference/webhooks-new
- [168] Mollie, webhooks de l'API Payments : https://docs.mollie.com/reference/payments-api-webhooks
- [169] Mollie Connect, répartition des paiements : https://docs.mollie.com/docs/connect-splitting-payments
- [170] Mollie, frais de litige (page en 403, montant tiré d'un résultat de recherche) : https://help.mollie.com/hc/en-us/articles/35795203499154-What-fees-do-I-pay-for-disputes
- [171] Mollie, « Handling payment status » : https://docs.mollie.com/docs/handling-payment-status
- [172] Payplug, tarifs : https://www.payplug.com/fr/tarifs
- [173] Payplug, qui peut utiliser Payplug : https://support.payplug.com/hc/en-gb/articles/360021353311-Who-can-use-PayPlug
- [174] Payplug, frais de rétrofacturation : https://support.payplug.com/hc/en-gb/articles/360021319572
- [175] Payplug, délais de virement : https://support.payplug.com/hc/en-gb/articles/360021325211
- [176] Payplug, référence de l'API : https://docs.payplug.com/api/apiref.html
- [177] Payplug, Wero (24/09/2025 ; premier paiement Wero en ligne en France en avril 2026) : https://www.payplug.com/blog/payment-wero/
- [178] SumUp, tarifs France : https://www.sumup.com/fr-fr/tarifs/
- [179] SumUp, paiement par lien : https://www.sumup.com/fr-fr/paiement-par-lien/
- [180] SumUp, Hosted Checkout : https://developer.sumup.com/online-payments/checkouts/hosted-checkout/
- [181] SumUp, webhooks : https://developer.sumup.com/online-payments/webhooks/
- [182] SumUp, documentation abrégée (3DS) : https://developer.sumup.com/llms-small.txt
- [183] PayPal, frais marchands France (mis à jour le 15/07/2026) : https://www.paypal.com/fr/business/paypal-business-fees ; https://www.paypal.com/fr/webapps/mpp/merchant-fees
- [184] PayPal, webhooks : https://developer.paypal.com/api/rest/webhooks/rest/
- [185] PayPal, API Orders v2 : https://docs.paypal.ai/reference/api/rest/orders/create-order.md
- [186] Stancer, tarifs (page dynamique ; valeurs lues dans https://www.stancer.com/assets/transaction-B7_Yi4TM.js et https://www.stancer.com/assets/fr-gvV2KjTK.js) : https://www.stancer.com/fr/tarifs
- [187] Stancer, documentation de l'API v2 : https://docs.stancer.com/fr/API.html
- [188] Stancer, reversements : https://docs.stancer.com/fr/Concepts/Payouts.html
- [189] Stancer, contestations : https://docs.stancer.com/fr/Concepts/Disputes.html
- [190] Stancer, remboursements : https://docs.stancer.com/fr/Concepts/Refunds.html
- [191] Stancer, introduction et souscription : https://docs.stancer.com/fr/Introduction.html ; https://docs.stancer.com/fr/Subscribe.html
- [192] Moneyvox, Lydia Pro (mise à jour le 10/03/2026, source secondaire) : https://www.moneyvox.fr/banque-en-ligne/lydia-pro
- [193] Lydia Pro, aide : https://supportpro.lydia-app.com/l/fr/category/x3bmx5e7xz-a-propos-de-lydia-pro
- [194] Qonto, tarifs : https://qonto.com/fr/pricing
- [195] Qonto, paiements en ligne : https://qonto.com/fr/get-paid/online
- [196] Qonto, API des liens de paiement : https://docs.qonto.com/api-reference/business-api/payments-transfers/payment-links/introduction
- [197] Groupe BPCE, communiqué du 20/04/2026 (premières transactions Wero en ligne en France) : https://newsroom.groupebpce.fr/download-pdf/69e5d022e4a0acb5eb0029e6
- [198] PCI Security Standards Council, mise à jour de la SAQ A : https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a
- [199] Règlement délégué (UE) 2018/389, art. 16 : https://eur-lex.europa.eu/eli/reg_del/2018/389/oj (inaccessible à l'outil ; texte lu sur https://www.legislation.gov.uk/eur/2018/389/chapter/III)
- [200] Worldline, calendrier DSP3 et PSR (10/03/2026) : https://worldline.com/en/home/main-navigation/resources/blogs/2026/the-scope-and-timeline-are-locked-in-for-psd3-and-psr-what-should-psps-know
- [201] Cloudflare, Bot Fight Mode : https://developers.cloudflare.com/bots/get-started/bot-fight-mode/

**Facturation : normes, éditeurs, bibliothèques**

- [202] FNFE-MPE, Factur-X 1.09.2 (04/08/2026) : https://fnfe-mpe.org/factur-x/
- [203] SUPER PDP : https://www.superpdp.tech/tarifs ; https://www.superpdp.tech/fonctionnalites ; https://www.superpdp.tech/documentation
- [204] Dougs, facturation gratuite : https://www.dougs.fr/logiciel-facturation-gratuit/
- [205] Abby : https://abby.fr/tarifs ; https://docs.abby.fr
- [206] Indy, tarifs : https://www.indy.fr/tarifs/
- [207] Tiime, tarifs : https://www.tiime.fr/tarifs
- [208] Pennylane, tarifs : https://www.pennylane.com/fr/tarifs
- [209] Axonaut, prix : https://axonaut.com/content/prix
- [210] Henrri, facturation électronique : https://www.henrri.com/mes-questions-dentrepreneurs/facturation-electronique-b2b/
- [211] Freebe, tarifs : https://www.freebe.me/tarifs
- [212] pdfkit 0.20.2 : https://registry.npmjs.org/pdfkit ; https://github.com/foliojs/pdfkit (`docs/getting_started.md`, `docs/attachments.md`)
- [213] Autres bibliothèques : https://registry.npmjs.org/@stafyniaksacha%2Ffacturx ; https://registry.npmjs.org/@e-invoice-eu%2Fcore ; https://registry.npmjs.org/node-zugferd

**Laboratoires, emballage, transport**

- [214] Prodigi, Hahnemühle Photo Rag : https://www.prodigi.com/products/prints-and-posters/photo-prints/hahnemuhle-photo-rag/
- [215] Prodigi, « Product portfolio 2026 » (PDF) : https://www.prodigi.com/download/product-range/prodigi-portfolio.pdf
- [216] Prodigi, API v4 : https://www.prodigi.com/print-api/docs/reference/
- [217] creativehub, « Fulfilment » : https://creativehub.io/fulfilment ; https://creativehub.io/help/about-theprintspace-fulfillment/
- [218] theprintspace, expédition directe : https://theprintspace.co.uk/dropship-art-prints ; https://www.theprintspace.com/art-printing-on-demand/
- [219] theprintspace, tarifs : https://www.theprintspace.com/photo-art-printing-prices/
- [220] Gelato : https://support.gelato.com/en/articles/8996200-start-selling-posters-and-framed-posters ; https://gelato.com/products/posters-frames ; https://developers.gelato.com/docs/webhooks
- [221] WhiteWall : https://www.whitewall.com/b2b/resellers ; https://www.whitewall.com/sell-your-photos/shopify ; https://www.photodeck.com/partners/whitewall/
- [222] PICTO Online : https://www.pictoonline.com/
- [223] Phototrend, « LabKorner » (octobre 2025) : https://phototrend.fr/2025/10/labkorner-un-laboratoire-pour-tirer-vos-photos-en-qualite-galerie/
- [224] Groupe CEWE : https://www.cewe-group.com/en/about-us.html ; https://printweek.com/content/news/peecho-adds-cewe-to-boost-european-photobook-production-network
- [225] Saal Digital : https://saal-digital.com/about-saal-digital/about-saal-digital ; article sponsorisé : https://www.photographynews.co.uk/inspiration/saal-digital-premium-photo-printing-for-professionals/
- [226] Lulu : https://help.api.lulu.com/en/support/solutions/articles/64000254631-are-there-fees-to-use-lulu-s-print-api- ; https://blog.lulu.com/international-book-shipping/
- [227] Peecho : https://peecho.com/
- [228] Hahnemühle, certificat d'authenticité : https://www.hahnemuehle.com/en/digital-papers/protect-authenticate/p/Product/show/189/945.html ; https://blog.hahnemuehle.com/en/certificateofauthenticity/
- [229] Digigraphie (Epson) : https://www.digigraphie.com/en/digigraphie-explained/certified-authenticity.htm
- [230] La Poste, tarifs Colissimo 2026 : https://www.laposte.fr/tarif-colissimo
- [231] La Poste, dimensions autorisées (tubes compris) : https://aide.laposte.fr/professionnel/contenu/quelles-sont-les-dimensions-autorisees-pour-un-colis
- [232] La Poste, garanties et indemnisations Colissimo : https://aide.laposte.fr/professionnel/contenu/quelles-sont-les-garanties-et-indemnisations-pour-un-envoi-avec-colissimo
- [233] Boxtal, Mondial Relay : https://www.boxtal.com/fr/fr/preuves/transporteurs/mondial-relay
- [234] Sendcloud, tarifs : https://www.sendcloud.com/fr/tarifs/
- [235] RAJA : tube https://www.raja.fr/enveloppes-pochettes-tubes/boites-postales-etuis-et-tubes/tubes-ronds-carres-triangulaires/tube-carton-rond-postal-brun-RAJA-50x640-mm_skuTUBN504.html ; pochettes https://www.raja.fr/enveloppes-pochettes-tubes/enveloppe-et-pochette-papier-carton/pochettes-carton_C121210.html
- [236] Mondial Relay, CGV de l'offre Start (7 janvier 2026), réponse 403 : https://www.mondialrelay.fr/media/126216/20260107-france-offre-start-conditions-generales-de-vente-fr-2.pdf

**Ergonomie, accessibilité, sobriété**

- [237] Baymard Institute, « Cart Abandonment Rate » (22/09/2025) : https://baymard.com/lists/cart-abandonment-rate
- [238] Baymard Institute, « Make Guest Checkout Prominent » : https://baymard.com/research-articles/make-guest-checkout-prominent
- [239] Baymard Institute, « Product Pages Need to Show Estimated Shipping Costs » : https://baymard.com/research-articles/show-shipping-costs-on-product-pages
- [240] Baymard Institute, « Use Delivery Date Not Shipping Speed » : https://baymard.com/research-articles/shipping-speed-vs-delivery-date
- [241] Baymard Institute, « Save Account Creation for the Confirmation Step » : https://baymard.com/research-articles/delayed-account-creation
- [242] RGAA 4.1.2, critères et tests : https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/
- [243] W3C, ATAG 2.0 (24 septembre 2015) : https://www.w3.org/TR/ATAG20/
- [244] W3C, WCAG 2.2 (édition du 12 décembre 2024) : https://www.w3.org/TR/WCAG22/
- [245] RGESN 2024 (Arcep, Arcom, ADEME) : https://ecoresponsable.numerique.gouv.fr/publications/referentiel-general-ecoconception/

**Web, sécurité, référencement**

- [246] OWASP, « Password Storage Cheat Sheet » : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- [247] Node.js 22, module `crypto` : https://nodejs.org/docs/latest-v22.x/api/crypto.html ; version courante (`crypto.argon2`) : https://nodejs.org/api/crypto.html
- [248] Node.js 22, `UV_THREADPOOL_SIZE` : https://nodejs.org/docs/latest-v22.x/api/cli.html
- [249] NIST SP 800-63B, révision 4 (26 août 2025) : https://pages.nist.gov/800-63-4/sp800-63b.html
- [250] W3C, « Good Practices for Capability URLs » (18 février 2014) : https://www.w3.org/TR/capability-urls/
- [251] MDN, `Set-Cookie` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- [252] MDN, `Referrer-Policy` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
- [253] MDN, `Cross-Origin-Resource-Policy` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy
- [254] MDN, `Clear-Site-Data` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data
- [255] MDN, CSP `form-action` (redirections) : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
- [256] Google Search Central, « Block search indexing with noindex » (10/12/2025) : https://developers.google.com/search/docs/crawling-indexing/block-indexing
- [257] Google Search Central, données structurées « Article » (08/09/2026) : https://developers.google.com/search/docs/appearance/structured-data/article
- [258] Google Search Central, pagination (10/12/2025) : https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- [259] Google Search Central, versions localisées et `hreflang` (21/09/2026) : https://developers.google.com/search/docs/specialty/international/localized-versions
- [260] Google Search Central, Discover (09/03/2026) : https://developers.google.com/search/docs/appearance/google-discover
- [261] Google Search Central, sitemap (08/07/2026) : https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- [262] Google Search Central, images (02/03/2026) : https://developers.google.com/search/docs/appearance/google-images
- [263] Google Search Central, liens sortants (10/12/2025) : https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links
- [264] The Open Graph protocol : https://ogp.me/
- [265] WHATWG, élément `script` (« data block ») : https://html.spec.whatwg.org/multipage/scripting.html#the-script-element
- [266] RFC 4287, Atom : https://www.rfc-editor.org/rfc/rfc4287
- [267] RFC 4151, URI `tag:` : https://www.rfc-editor.org/rfc/rfc4151
- [268] Marked, documentation : https://marked.js.org/
- [269] W3C, Webmention (12 janvier 2017) : https://www.w3.org/TR/webmention/
- [270] Cloudflare, cache par défaut : https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- [271] Cloudflare, `Cache-Control` : https://developers.cloudflare.com/cache/concepts/cache-control/
- [272] Cloudflare, réglages des règles de cache : https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
- [273] Cloudflare, valeurs de `cf-cache-status` : https://developers.cloudflare.com/cache/concepts/cache-responses/
- [274] Cloudflare, purge du cache : https://developers.cloudflare.com/cache/how-to/purge-cache/
- [275] Cloudflare Access, offres et prix : https://www.cloudflare.com/zero-trust/products/access/
- [276] Cloudflare Access, code à usage unique : https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- [277] Cloudflare, gestion des places : https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/
- [278] Zitadel, tarifs : https://zitadel.com/pricing
- [279] SQLite, clés étrangères (sections 2 et 5) : https://www.sqlite.org/foreignkeys.html
- [280] SQLite, `ALTER TABLE` : https://www.sqlite.org/lang_altertable.html

**E-mail**

- [281] Google, exigences pour les expéditeurs vers Gmail : https://support.google.com/a/answer/81126
- [282] Google, limites d'envoi de Gmail : https://support.google.com/mail/answer/22839
- [283] RFC 8058, désinscription en un clic : https://www.rfc-editor.org/rfc/rfc8058
- [284] Nodemailer, en-têtes `List-*` : https://nodemailer.com/message/list-headers
- [285] Brevo, tarifs : https://www.brevo.com/pricing/
- [286] Mailjet, tarifs : https://www.mailjet.com/pricing/
- [287] Amazon SES, tarifs : https://aws.amazon.com/ses/pricing/
- [288] Scaleway, Transactional Email : https://www.scaleway.com/en/transactional-email-tem/
- [289] listmonk : https://listmonk.app/

**Observations : galeries clients et blogs de photographes**

- [290] Pixieset : https://pixieset.com/client-gallery/ ; guides de photographes (source secondaire) : https://thislittlelight.mypixieset.com/blog/pixieset-gallery-guide/ et https://jaygrubbphotography.mypixieset.com/blog/how-to-create-a-favorites-list-in-your-online-photo-gallery-in-pixieset/
- [291] Pic-Time : https://help.pic-time.com/en/articles/7905685-how-do-i-set-the-expiration-date-for-my-client-galleries ; https://help.pic-time.com/en/articles/7923134-user-login-access-password-creation-and-management
- [292] SmugMug (pages refusées à l'outil, contenu tiré des extraits de recherche, à confirmer) : https://www.smugmughelp.com/hc/en-us/articles/18212671622292-Share-photos-privately-with-only-people-I-choose ; https://www.smugmughelp.com/hc/en-us/articles/18212288553620-Available-privacy-options
- [293] ShootProof (même réserve) : https://help.shootproof.com/hc/en-us/articles/1500008380182-Client-Gallery-Security-Best-Practices ; https://help.shootproof.com/hc/en-us/articles/115008322868-What-is-a-Linked-Contact-
- [294] Zenfolio : https://success.zenfolio.com/hc/en-us/articles/7430771222419-Accessing-Your-Shared-Gallery ; https://zenfolio.com/blog/maximize-client-galleries-features/
- [295] Bruce Percy, blog : https://www.brucepercy.co.uk/blog
- [296] David duChemin : https://davidduchemin.com/
- [297] Craig Mod : https://craigmod.com/
- [298] Magnum Photos, Theory & Practice : https://www.magnumphotos.com/theory-and-practice/
- [299] Johan Lolos, Journal : https://johanlolos.com/journal/
- [300] The Online Photographer (redirection 301 vers https://www.patreon.com/theonlinephotographer) : https://www.theonlinephotographer.com/
- [301] Steve McCurry, blog WordPress.com (« This site is currently private ») : https://stevemccurry.wordpress.com/

**Ajouts des relectures (consultés le 16 octobre 2026)**

- [302] Stripe, « Stripe Technology Europe Limited » (établissement de monnaie électronique agréé par la Banque centrale d'Irlande, réf. C187865 ; Stripe Payments Europe Ltd pour le reste des services) : https://stripe.com/fr/legal/stel
- [303] Lettre des réseaux, « Implémentation de la fonctionnalité de rétractation et sanctions » (art. L221-21 et L242-13 : 15 000 € et 75 000 € ; source secondaire) : https://www.lettredesreseaux.com/implementation-de-la-fonctionnalite-de-retractation-et-sanctions.html
- [304] Entreprendre.service-public.fr, actualité A18985 sur le droit de douane de 3 € (publiée le 01/07/2026, mise à jour le 06/07/2026) : https://entreprendre.service-public.gouv.fr/actualites/A18985
- [305] Décret n° 2025-1228 du 17 décembre 2025 (SMIC horaire de 12,02 € au 1/1/2026) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053042520 ; montant de 14 424 € : Bpifrance Création, « Artiste-auteur » (source secondaire) : https://bpifrance-creation.fr/encyclopedie/structures-juridiques/statuts-particuliers/artiste-auteur
- [306] WebLex, « Tableau des cotisations sociales dues par les artistes-auteurs : année 2026 » (13/04/2026, source secondaire) : https://www.weblex.fr/chiffres-cles/tableau-des-cotisations-sociales-dues-par-les-artistes-auteurs-annee-2026
- [307] Ircec, calcul et taux des cotisations RAAP (mise à jour le 24/02/2026) : https://www.ircec.fr/vos-regimes/raap/cotisations/calcul-taux-cotisations-raap/
- [308] BOFiP, BOI-TVA-LIQ-10-20250514 (taux, généralités ; § 60 ventilation des sommes perçues globalement, § 70 frais de transport) : https://bofip.impots.gouv.fr/bofip/1380-PGP.html/identifiant=BOI-TVA-LIQ-10-20250514
- [309] DGCCRF, fiche d'information sur la directive (UE) 2019/882 (juillet 2025 ; exemption des micro-entreprises de services) : https://handicap.gouv.fr/sites/handicap/files/2025-07/Fiche-conso-DGCCRF.pdf
- [310] Legifiscal, « Logiciels de caisse sécurisés » (amende de 7 500 €, source secondaire) : https://www.legifiscal.fr/infos-conseils/logiciels-caisse-securises.html
- [311] Cloudflare, Always Online (envoi à Internet Archive des URL GET les plus demandées ayant répondu 200) : https://developers.cloudflare.com/cache/how-to/always-online/
- [312] Allemagne, BGB, § 312j (bouton « zahlungspflichtig bestellen ») : https://www.gesetze-im-internet.de/bgb/__312j.html
- [313] Allemagne, BGB, § 356a (fonction électronique de rétractation : « Vertrag widerrufen », « Widerruf bestätigen ») : https://www.gesetze-im-internet.de/bgb/__356a.html
- [314] CGI, art. 151-0 (option réservée aux contribuables relevant de l'art. L613-7 du code de la sécurité sociale ; lu dans les résultats de recherche) ; BOFiP, BOI-BIC-DECLA-10-40-10-20120912 (conditions du versement libératoire, version ancienne) : https://bofip.impots.gouv.fr/export/pdf/8866

**Code lu** (lecture seule) : `/home/claudecode/dr-work/etude`, commit `7f3727f`, et `node_modules/fastify/lib/content-type-parser.js` (Fastify 5.12.5, lignes 58-117) ; références à `server/routes/admin.js` recalées sur `main` à `c88632d`. Mesures locales (Node 22.23.1, machine de l'étude) : scrypt N = 2¹⁷, r = 8, p = 1 refusé avec le `maxmem` par défaut, environ 0,76 s avec 256 Mio ; N = 2¹⁵, r = 8, p = 3 environ 0,45 s ; huit calculs simultanés retardent un `fs.stat` d'environ 0,87 s ; `crypto.argon2` absent de Node 22.
