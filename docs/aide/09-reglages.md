# Site public, droits et confidentialité

Deux pages du groupe **Publier** et **Réglages** de la barre latérale ; chacune n'enregistre que ses propres champs.

## Site public

Ce que voient les visiteurs. Accroche, introduction et « À propos » ont chacun leur version **anglaise et allemande**, facultative, repliée sous le champ français (« … en anglais et en allemand » ; l'état indique *facultatif*, *1 langue sur 2* ou *traduit*). Vide : les visiteurs anglais et allemands lisent le texte français (voir [Le site vu par les visiteurs](site-public)). Le bouton **Proposer une traduction** pré-remplit un champ (voir [Photos](photos), « La fiche d'une photo »).

| Champ | Où il apparaît |
|---|---|
| **Nom du site** | logo texte, titre des pages, variable `{site}` du filigrane. Vide : nom par défaut du serveur. |
| **Accroche** | titre de la section « regards » de l'accueil, titre de « À propos », description pour les moteurs de recherche |
| **Introduction** | texte sous l'accroche, à l'accueil |
| **À propos** | page « À propos ». Séparez les paragraphes par une ligne vide. |
| **Carte du monde** | voir ci-dessous |
| **Recherche** | voir ci-dessous |
| **Photos de l'ouverture** | le diaporama plein écran de l'accueil, dans l'ordre choisi (voir ci-dessous) |

### Carte du monde

Case **Publier la carte du monde**, décochée par défaut. Cochée : la page `/carte` est ouverte aux visiteurs, un lien **Carte** apparaît dans le menu du site, et la page entre dans `sitemap.xml`. Décochée : les visiteurs reçoivent « page introuvable » ; connecté, vous la voyez en **aperçu** (bandeau en tête). Le panneau indique combien de photos sont sur la carte. Seules les photos **publiées** dont la fiche coche **Afficher sur la carte du monde** y figurent (voir [Photos](photos)).

### Recherche

Case **Proposer la recherche**, cochée par défaut : un lien **Rechercher** (une loupe sur téléphone) apparaît dans le menu du site et ouvre `/recherche`. Les visiteurs y cherchent parmi les photos publiées par mots-clés, dans les titres, légendes, lieux, villes et régions, séries, photographes et **mots-clés** des fiches, dans les trois langues. Décochée : la page n'existe plus pour les visiteurs.

Case **Afficher les mots-clés sur la page de la photo**, décochée par défaut. Cochée : les mots-clés s'affichent sous la légende, et chacun mène à la recherche. Sinon, ils servent seulement à la recherche.

### Photos de l'ouverture

Le diaporama plein écran de l'accueil, **dans l'ordre que vous choisissez**.

- **Ajouter :** cochez une photo publiée dans « Ajouter des photos publiées ». Elle s'ajoute en fin de diaporama.
- **Vignettes :** chacune montre la photo **entière**, sans la déformer ni la couper, dans un cadre au format 3:2 (des bandes neutres complètent les photos en hauteur).
- **Ordonner :** dans « Ordre du diaporama », glissez une vignette, ou utilisez **←** et **→** sous chaque vignette.
- **Retirer :** **✕** sous la vignette.
- **Limite :** 8 photos. Le compteur (« 5 / 8 choisies ») l'indique ; à 8, les autres cases se désactivent et un message le dit.
- **Sans choix :** les 5 premières photos publiées de la galerie.
- **Photo dépubliée ou supprimée :** elle sort de l'ouverture. **Adresse modifiée :** elle y reste.

Cliquez sur **Enregistrer l'ouverture** (ou **Enregistrer le site public** en bas de page). Sans JavaScript, les boutons ← → ✕ enregistrent aussitôt.

## Droits et confidentialité

### Mentions légales (Impressum)

Obligatoires en France (LCEN) comme en Allemagne (Impressum, § 5 DDG) : la page `/mentions-legales`, liée en bas de **chaque page** du site (« Mentions légales », « Legal notice », « Impressum » selon la langue ; `/impressum` y mène aussi). Le texte est rédigé par le site, en trois langues ; vous donnez seulement :

- **Éditeurs** : vos prénoms et noms ;
- **Adresse postale** : une adresse où l'on peut vous joindre (une ligne par ligne d'adresse) ;
- **E-mail** (vide : celui de la confidentialité) et **téléphone** (facultatif) ;
- **Responsable de la publication** : une personne (en Allemagne, « Verantwortlich nach § 18 MStV »).

Tant qu'il manque l'essentiel (noms, adresse, e-mail, responsable), « Aujourd'hui » le signale et la page n'affiche que ce qui est rempli. L'hébergement (votre serveur, en France ; acheminement par Cloudflare) et les renvois vers les droits d'utilisation et la confidentialité sont ajoutés tout seuls.

| Champ | Où il apparaît |
|---|---|
| **Droits d'utilisation : Français** | page publique `/droits`. Le champ affiche le texte publié, avec un badge **Texte par défaut** ou **Texte personnalisé**. Laissé tel quel, le texte par défaut suit les noms des photographes ; **Rétablir le texte par défaut** le remet (puis enregistrez). |
| **Droits d'utilisation : English, Deutsch** | pages `/en/droits` (anglais) et `/de/droits` (allemand), proposées aux visiteurs par le sélecteur de langue en haut de la page (Français, English, Deutsch). Mêmes badges et même bouton. Si le texte français est personnalisé et pas une traduction, un avertissement le signale : adaptez-la, sinon les visiteurs étrangers lisent la traduction du texte par défaut. |
| **Droits d'utilisation : contact** | adresse e-mail ou lien `https://`, affiché comme lien sur `/droits` |
| **Confidentialité** | le **contact** des responsables affiché sur la page `/confidentialite` (RGPD, en trois langues) et deux cases à cocher **seulement quand c'est vrai** : l'authentification à deux facteurs pour tous les comptes de l'admin, et des disques chiffrés pour les données et les sauvegardes (la page les annonce alors). La page indique aussi si le chiffrement des données personnelles dans la base (`DATA_KEY`) est actif. Le reste de la page suit le site tout seul. |

## Comptes et rôles

**Comptes et rôles** (groupe Réglages, administrateurs seulement) liste les comptes qui se sont connectés.

- **Première connexion :** le compte est créé. Si Zitadel lui donne le rôle « admin », il est administrateur ; sinon il reste **en attente**, sans accès, et « Aujourd'hui » l'indique. Un compte jamais traité, resté en attente 90 jours, est effacé (un compte dont un administrateur a retiré les rôles est gardé, et l’IdP ne peut pas lui redonner le rôle « admin »).
- **Donner un rôle :** cochez-le, puis **Donner ce rôle** (ou **Enregistrer**). Il s'applique tout de suite, sans nouvelle connexion ; le retirer aussi.
  - **Administrateur** : tout, y compris les comptes et le journal.
  - **Modérateur** : valide, programme, publie et dépublie (site et Instagram), traite les signalements, renvoie au photographe ou lui adresse une remarque, règle le circuit de publication ; il ne retouche pas les photos et ne voit jamais les données personnelles.
  - **Relecteur** : relit et traduit les textes.
  - **Photographe** : seulement **ses** photos, ses sorties et les personnes qu'il a rencontrées (l'accord est donné par sortie et par photographe). Il importe, modifie et supprime ses photos (elles restent sa propriété), voit les demandes RGPD qui le concernent, utilise l'app Terrain et ses cartes ; il ne publie pas (il propose, sur le site comme pour Instagram), et ne voit ni la file Instagram, ni les réglages, ni la fréquentation du site (ses Statistiques ne montrent que ses photos). Ce qui est à l'autre photographe n'existe pas pour lui, même en tapant l'adresse. Une personne rencontrée par les deux ne lui apparaît qu'avec ses propres rencontres ; la rapprocher, la séparer, l'exporter ou l'effacer reste à l'administrateur.
- **Photographe lié :** sert aux valeurs par défaut (import, app Terrain) et décide de ce que voit un compte Photographe ; sans photographe lié, un compte Photographe ne voit rien. Un photographe ne peut être lié qu'à un seul compte.
- **Désactivé :** le compte ne peut plus se connecter, et sa session en cours perd l'accès aussitôt.
- **Supprimer ce compte :** un clic déplie la confirmation, puis **Supprimer le compte « … »** : le compte et ses sessions sont effacés, avec ses rôles, son photographe lié et ses réglages ; s'il se reconnecte, il repart « en attente ».
- **Garde-fous :** il reste toujours au moins un administrateur actif ; on ne peut ni se désactiver ni se supprimer soi-même ; les comptes listés dans `ADMIN_SUBS` (configuration du serveur, marqués « protégé ») restent administrateurs quoi qu'il arrive. L'**identifiant (sub)** affiché sous chaque compte est celui à recopier dans `ADMIN_SUBS` (il se sélectionne d'un clic).
- **E-mails** (en bas de la page) : indique si le serveur sait envoyer des e-mails (`SMTP_URL`, `MAIL_FROM`) et depuis quelle adresse. **Envoyer le test** envoie un e-mail à l'adresse choisie (la vôtre par défaut). En cas de refus, la raison s'affiche, par exemple des identifiants refusés ou un serveur injoignable.

Le menu ne montre que les pages que le compte peut ouvrir.

## Journal

**Journal** (administrateurs) : qui a fait quoi dans l'admin, les plus récents d'abord : connexions (réussies, en attente, refusées), modifications, publications, actions sur plusieurs photos, comptes modifiés (avec le détail : rôles, état, photographe lié). Filtrez par compte ou par mot. Le choix de la langue et du thème n'y figure pas. **Résultat** : « fait », ou « refusé » quand le serveur a refusé l'action (droit manquant, ou refus annoncé par un message d'erreur en haut de la page). Le journal est gardé 13 mois.
