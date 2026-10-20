# Le site vu par les visiteurs

Ce que vos visiteurs peuvent faire, pour savoir ce que vos réglages changent.

## Thèmes par rubrique

L’apparence peut varier selon la rubrique : accueil, galeries, photos, carte, voyages, Carnets, regards, contact ou informations. Les trois présentations historiques et six chambres noires sont disponibles. Le choix se règle dans [Apparence → Thèmes et rubriques](apparence#thèmes-et-rubriques) ; installer la mise à jour ne change pas le site publié.

Dans une chambre noire, les images d’ouverture se choisissent manuellement, sans défilement automatique. **Mode calme**, en pied de page, réduit les mouvements facultatifs ; le réglage de réduction des animations de l’appareil est toujours respecté. La photo conserve ses connexes et sa mini-carte lorsqu’un lieu est publié. Les voyages et les Carnets gardent leurs fonctions. Les galeries privées conservent leur présentation dédiée.

Quand les thèmes par rubrique sont activés, le menu Galerie ouvre `/galerie`, avec son propre thème. Les Carnets restent accessibles même avec un thème général V1 ; ils utilisent alors la présentation V2. Les descriptions des accueils ci-dessous concernent les présentations historiques V1 et V2.

## Langues

Le site existe en **français** (adresses habituelles, `/photo/…`), **anglais** (`/en/…`) et **allemand** (`/de/…`).

- **Ce qui est traduit :** menus, titres de sections, boutons, pied de page, dates (« oct. 2024 », « Oct 2024 », « Okt. 2024 »), noms de pays sur la carte. Ces textes sont fournis par le site, sans traduction automatique.
- **Vos textes** (accroche, introduction, À propos, biographies, noms des séries, titres, légendes et lieux des photos) : leur version anglaise et allemande est **facultative** ; vous la remplissez dans l'admin (repliée sous chaque champ, « en anglais et en allemand »). Si elle manque, on affiche une autre langue :
  - page en allemand : allemand, sinon français, sinon anglais ;
  - page en anglais : anglais, sinon français, sinon allemand ;
  - page en français : français, sinon anglais, sinon allemand.
- **Sélecteur :** au bout du menu (et en haut de la page d'une photo), le drapeau et le code de la langue (🇫🇷 FR). Il ouvre la **même page** dans une autre langue, filtres compris. Le choix est retenu (le cookie de langue, posé seulement à ce moment-là ; le seul autre cookie du site public est celui d'une galerie privée ouverte avec son mot de passe).
- **Langue à l'arrivée** sur une page française, si le visiteur n'a rien choisi :
  - pays de langue française (France, Monaco, outre-mer, Afrique francophone…) : français ;
  - Allemagne, Autriche, Liechtenstein : allemand ;
  - Belgique, Suisse, Luxembourg, Canada : la langue du navigateur départage (une Zurichoise a l'allemand, un Belge néerlandophone l'anglais) ;
  - ailleurs : anglais ; pays inconnu (réseau local) : la langue du navigateur.
- **Jamais redirigés :** les robots des moteurs de recherche (chaque langue est indexée à sa propre adresse, liées entre elles), les aperçus de liens, et toute adresse en `/en/` ou `/de/` (un lien partagé s'ouvre dans la langue choisie par celui qui le partage).

## Accueil

- **Ouverture :**
  - photos plein écran qui défilent toutes les 6 secondes ;
  - vignettes pour choisir une photo ;
  - bouton **Pause** pour arrêter le défilement (il devient **Lecture** pour le relancer) ;
  - le défilement s'interrompt aussi quand la souris ou le clavier est sur l'ouverture.
- **Deux regards :** « Les deux », ou un photographe. La galerie se filtre **sans recharger la page**, et l'adresse change (`/auteur/julien`) : elle se partage.
- **Séries :** l'index en grand. Le survol montre une photo de la série ; un clic filtre, un second clic retire le filtre. Les filtres se combinent avec les regards.
- **Ordre :** au-dessus de la grille, **Sélection** (l'ordre que vous avez choisi dans la photothèque, par défaut) ou **Plus récentes** (par date de publication, la dernière publiée d'abord). L'ordre se cumule avec les filtres, garde son adresse (`?ordre=recentes`) et vaut aussi pour la photo précédente et suivante. La date retenue est celle de la **première** publication : une photo dépubliée puis republiée garde sa place.
- **Galerie :** toutes les photos publiées, dans l'ordre de l'admin.

## Accueil, galerie et séries en v2

Quand la **v2** est appliquée (Apparence → Site public : v1 ou v2), ces pages changent ainsi :

- **Ouverture :** la photo **entière**, à la hauteur de l'écran, sans voile ni texte posé dessus ; dessous, votre accroche en titre et son cartel (titre, auteur, lieu, date, **Voir la photo**). Le diaporama est **à l'arrêt** : les points choisissent une photo, **Lire** le lance (une photo toutes les 6 secondes), **Pause** l'arrête ; il attend sous la souris, s'arrête dès que le clavier entre dans l'ouverture et ne tourne pas si le visiteur a demandé moins d'animations. Seule la première photo est chargée avec la page. Le cadre prend le format le plus large de vos photos d'ouverture : une verticale parmi des horizontales y tient entière, plus étroite.
- **Deux regards :** « Les deux » mène à la galerie de l'accueil, un photographe à sa galerie (`/auteur/julien`).
- **Séries :** une rangée de couvertures (la première photo de chaque série), chacune vers la page de sa série.
- **Galerie :** en bas de l'accueil (`/#galerie`). Une barre de **filtres** (le regard, l'**Ordre** dans un menu, les séries avec leur couverture et leur nombre de photos) ; chaque choix ouvre une page qui a sa propre adresse, à partager, sans script. Au-delà du téléphone, la barre reste en haut de l'écran pendant qu'on fait défiler.
- **Rangées :** chaque photo garde son format (une verticale reste verticale), à hauteur commune, et **dans l'ordre de la photothèque** : la première rangée se lit de gauche à droite, puis la suivante ; le clavier suit le même ordre. Au téléphone, deux photos au plus par rangée.
- **Deux filtres sans photo commune** (une adresse partagée, par exemple « Voyage, par Julien ») : la page le dit et propose la série entière ou toutes les photos du photographe ; chaque filtre se retire d'un geste (**✕**).
- **Page d'une série** (`/serie/rue`) : son nom en titre, le nombre de photos, les photographes et les années, puis les photos dès le premier écran (sans grande couverture), « La même série, un seul regard » et les autres séries.

## Formulaires en v2 (« Je vous ai photographié », Signaler, Partager)

Quand la **v2** est appliquée, la page « Je vous ai photographié » (`/bonjour`), « Signaler cette photo » et la page **Partager** (celle qui s'ouvre sans script, ou dans un nouvel onglet) prennent le dessin de la v2. Les champs ne changent pas : ce que la personne envoie, et ce que vous recevez, est le même qu'en v1.

- **Une seule règle** en tête : tous les champs sont obligatoires, sauf ceux marqués « facultatif » ; l'aide de chaque champ est écrite sous son nom (« Nécessaire si vous acceptez une publication »).
- **Après un envoi incomplet**, la saisie est gardée et chaque erreur est écrite sous son champ (sous le titre du groupe pour des cases), « ⚠ Erreur : » puis comment corriger ; le titre de l'onglet commence par « Erreur ». Dès deux points à corriger, un **résumé** en tête reçoit le focus, avec un lien vers chaque champ ; un seul point : le curseur est déjà dans le champ.
- **Trop d'envois depuis la même connexion** (8 par heure sur `/bonjour`, 5 sur Signaler) : un message à part, qui n'est pas une erreur de saisie, demande de réessayer dans une heure ; rien de ce qui a été saisi n'est perdu.
- **Après l'envoi**, le titre « Merci, c'est noté. » (ou le message de Signaler) reçoit le focus ; la référence de la carte est rappelée.
- **Partager** : la fenêtre de la visionneuse, en page, sous un retour vers la photo ; avec le script, **Copier le lien** y marche aussi.
- La **photo offerte** (`/pour-vous/…`) garde son en-tête réduit au nom du site, sans menu ni langue.

## Visionneuse (page d'une photo)

| Geste | Effet |
|---|---|
| **→** ou glissé vers la gauche | photo suivante |
| **←** ou glissé vers la droite | photo précédente |
| **Échap**, « Fermer » ou le bouton Retour du navigateur | retour à la série (ou à la galerie), au même filtre et à l'endroit quitté |
| pincement (téléphone) | zoom sur la photo |
| **Lire la suite** | déplie une légende longue (3 lignes sinon) ; on la lit en faisant défiler la page, **Réduire** la replie |

Le premier écran montre la photo, son titre et le début de la légende ; une légende courte s'affiche en entier. Sur téléphone, les flèches ‹ › sont sous le texte.

La photo suivante dépend du filtre actif : dans « Rue, par Julien », on reste dans cette sélection.

**Retour à la série :** passer d'une photo à la précédente ou à la suivante ne s'empile pas dans l'historique du navigateur. Après avoir vu dix photos, **un seul** Retour (ou **Fermer**, ou **Échap**) ramène à la série, à la hauteur où on l'avait quittée, et la dernière photo vue est remise à l'écran.

**J'aime et Signaler** : sous le texte de chaque photo, un cœur **J'aime** (anonyme : ni compte ni cookie ; le visiteur peut retirer son « j'aime », et le compteur s'affiche à côté ; deux personnes derrière la même connexion, une même box par exemple, comptent un seul « j'aime » par photo pendant 12 h) et un lien **Signaler** : photo qui ne devrait pas être en ligne, suggestion pour le texte, autre chose, avec un message et une adresse facultative. Une personne qui se reconnaît est renvoyée vers `/bonjour`. Les signalements arrivent dans « Aujourd'hui » et dans la page **Signalements des visiteurs**, ouverte depuis **Signalements** dans la barre latérale (avec le nombre de nouveaux), même une fois tout traité (l'adresse laissée n'y est visible que des administrateurs ; le modérateur lit le message) ; le nombre de « j'aime » s'affiche dans la rubrique Audience de la fiche.

**Partager** : à côté du cœur. Sur téléphone, il ouvre le menu de partage du téléphone (Instagram, Signal, Messages, WhatsApp…). Sur ordinateur, une fenêtre montre l'aperçu (image, titre, photographe, site), les boutons WhatsApp, Facebook, Bluesky, X, Pinterest et E-mail, **Voir sur Instagram** si la photo a été postée depuis le site, le lien à copier et un QR pour ouvrir la photo sur un téléphone. On partage la page, jamais le fichier. Ce sont de simples liens : aucun script de ces services n'est chargé, aucun cookie n'est posé. Sans JavaScript, le bouton mène à une page qui contient les mêmes liens. Les partages sont comptés anonymement (voir [Statistiques](statistiques)).

**Où et à proximité** : si la fiche de la photo coche **Afficher sur la carte du monde**, une petite carte est affichée à côté du texte, cadrée sur sa ville. La vignette de la photo y apparaît dans un cercle, et les autres photos prises à moins de 250 km en pastilles, avec le nom de leur ville ; chaque pastille mène à sa photo. Sous la photo, la rangée **À proximité** montre les plus proches, avec leur ville et leur distance. Seules les photos cochées « sur la carte » apparaissent, et seule la ville est connue, jamais la position exacte. Le lien **Voir la carte du monde** apparaît si la page Carte est publiée.

**Date et heure** : la date de la photo telle que vous l'avez saisie (au mois ou au jour). L'heure de prise de vue n'apparaît que si la fiche coche **Montrer l'heure sur le site** et que la date est au jour : « 1 mai 2025, 14 h 32 » (« 2:32 pm », « 14:32 Uhr »), dans le cartel et la ligne « Lieu, date et heure ». Elle n'est montrée que sur la page de la photo, jamais dans la galerie, À proximité, la carte ni les aperçus de partage.

**Prise de vue** : le boîtier, l'objectif, la focale, la vitesse, l'ouverture et la sensibilité lus dans l'EXIF de l'original, dans l'ordre du lexique : « Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160 » (« 18,3 mm » en français et en allemand, « 18.3 mm » en anglais). En v2 et en v3, c'est la ligne **Prise de vue** des données de la visionneuse, après le photographe ; en v1, une seconde ligne sous la ligne du numéro, de la série et du lieu. Montrée par défaut ; la case **Montrer la prise de vue sur le site** de la fiche la cache. Jamais l'heure à cet endroit (elle suit sa propre case), ni le lieu exact, ni le numéro de série.

## Signalements des visiteurs

La page **Signalements des visiteurs** (barre latérale, groupe Personnes ; administrateurs et modérateurs) reçoit ce que les visiteurs envoient par le lien **Signaler** d'une photo : le type (ne devrait pas être en ligne, suggestion pour le texte, autre chose), le message, la langue du visiteur, et l'adresse qu'il a laissée pour une réponse (visible des seuls administrateurs ; le modérateur sait seulement qu'une adresse a été laissée). Message et adresse sont chiffrés et effacés au bout de 12 mois. Un signalement ne dépublie rien tout seul : ouvrez la photo et décidez.

- **Marquer comme traité** range le signalement parmi les traités ; le compteur de la barre latérale baisse.
- **Supprimer…** efface le message et l'adresse ; en admin v2, un dialogue le demande d'abord (Annuler en premier).
- En admin v2, les filtres **Nouveaux** et **Traités** trient la liste ; chaque carte nomme la photo, dit le type par une pastille à symbole et montre le message dans sa langue.

## Messages et demandes

La page **Messages et demandes** (barre latérale, groupe Personnes ; administrateurs, et photographes pour les leurs) reçoit ce que les visiteurs envoient par la page **Contact** (`/contact`) et par une **demande de licence** (`/droits/demande`, ouverte par « Demander une licence » sous chaque photo en v2 et sur la page Droits).

- **La liste** (50 messages par page) ne montre aucune donnée personnelle : la nature (message ou demande de licence), la date, à qui il est adressé, la photo et l'usage prévu d'une demande, la langue, l'état. Un photographe voit les messages qui lui sont adressés (une demande de licence va au photographe de la photo) et ceux adressés aux deux.
- **Lire** ouvre le message : nom, société, adresse e-mail, diffusion et texte. Cette lecture est notée au journal (« Message lu »). Le texte s'affiche tel quel : un lien n'y est jamais cliquable (prudence avec un lien ou une adresse qui imite un éditeur ou un média).
- **Répondre par e-mail** ouvre votre messagerie vers l'adresse du visiteur. Le site, lui, n'envoie rien au visiteur : pas d'accusé de réception.
- **Marquer comme traité** range le message parmi les traités ; **Supprimer…** l'efface pour de bon (dans un dépliant en admin v1, un dialogue en admin v2).
- Nom, adresse et message sont chiffrés et effacés 12 mois après l'envoi. « Aujourd'hui » compte les messages à lire. Si la messagerie du site est réglée, chaque photographe concerné reçoit « Un nouveau message vous attend » et le lien vers cette page, sans rien du message (30 e-mails par jour au plus ; au-delà, les messages attendent ici).

## Autres pages

- **À propos :** logo complet, accroche, texte, biographies des auteurs.
- **Voyages** (dès qu’un voyage est publié, voir [Personnes photographiées](rencontres#les-voyages)) : la liste des voyages, puis une page par voyage. En tête, une grande photo, le nom, les dates, les photographes, puis le texte. Ensuite, une **carte cadrée sur le voyage** : l’itinéraire en pointillé, une pastille numérotée par étape (deux jours de suite au même endroit n’en font qu’une), et un encart « J1 · 1 sept. · Lisbonne » relié à chaque étape ; un clic sur une étape mène à son jour. Enfin, le récit **jour après jour**, avec les photos publiées de chaque journée, dans l’ordre de prise de vue (la grande photo est la première, comme dans l’admin). Seules les photos publiées apparaissent, et la carte ne place que celles qui sont cochées « Afficher sur la carte du monde » (sans elles, pas de carte). Sur téléphone, la carte glisse du doigt.
- **Rechercher** (si elle est proposée, voir [Site public](reglages#recherche)) : un champ, puis les photos trouvées, la plus pertinente d'abord. Chaque mot doit être trouvé ; un début de mot suffit (« brum » trouve « brume ») ; sans accents ni majuscules ; ß, œ, æ, ø valent ss, oe, ae, o (« strasse » trouve « Straße »). À pertinence égale, l'ordre de la galerie. Un mot d'une seule lettre ne suffit pas : la page demande d'en taper au moins deux. Les pages de résultats ne sont pas indexées par les moteurs de recherche.
- **Droits d'utilisation :** conditions, contact et information sur la mesure d'audience, en trois langues : `/droits` (français), `/en/droits` (anglais), `/de/droits` (allemand). Le sélecteur de langue du menu passe de l'une à l'autre (les anciennes adresses `/droits/en` et `/droits/de` mènent aux nouvelles). Les textes se règlent dans [Droits & confidentialité](reglages#droits-et-confidentialité).
- **Carte** (si vous l'avez publiée dans [Site public](reglages#carte-du-monde)) : une mappemonde aux couleurs du thème, avec la vignette ronde d'une photo sur chaque ville et, en pastille, le nombre de photos de cette ville. Les villes trop proches pour être distinguées se regroupent (nombre cumulé) ; un clic sur le groupe agrandit la carte jusqu'à les séparer. Sous la carte, la liste des lieux avec leurs photos ; un clic sur une vignette de la carte y mène.

  | Geste | Effet |
  |---|---|
  | **+**, **−**, **Monde** | zoom avant, arrière, retour au monde entier |
  | pincement (téléphone), **Ctrl + molette** ou pincement du pavé tactile | zoom à l'endroit visé |
  | glisser (carte agrandie) | se déplacer |

  En zoomant, le fond devient plus détaillé (côtes, frontières, petites îles) : seule la zone affichée est chargée. La molette seule et le glissé vertical sur la carte au monde entier font défiler la page, comme ailleurs. Sans JavaScript, la carte est fixe et la liste des lieux reste complète.
- **« Je vous ai photographié »** (`/bonjour`) : la page du QR des cartes d’accord et des vêtements (`/bonjour/J` : avec le nom du photographe), sans lien dans le menu (voir [Rencontres](rencontres)).
- **Mentions légales** (`/mentions-legales`, « Impressum » en allemand, lien en pied de chaque page) : éditeurs, adresse, contact (e-mail en lien, téléphone), directeur de la publication, hébergement (voir [Droits & confidentialité](reglages#mentions-légales-impressum)).
- **Confidentialité** (`/confidentialite`, en trois langues, lien en pied de page) : qui est responsable, ce que le site collecte et pourquoi, combien de temps, qui le reçoit, et comment exercer ses droits (voir [Droits & confidentialité](reglages#droits-et-confidentialité)).
- **Contact** (`/contact`, lien en pied de chaque page et depuis À propos, partie « Nous écrire ») : « Écrire à Sébastien, à Julien, ou aux deux » : le destinataire, le message, le nom et l'adresse e-mail du visiteur. **Demander une licence** (`/droits/demande`, préremplie avec la photo depuis la visionneuse v2 et la page Droits) : la photo, l'usage prévu (livre ou presse, site ou réseaux, publicité, autre), la diffusion et la durée, le message, le nom, la société, l'adresse. Les deux arrivent dans [Messages et demandes](site-public#messages-et-demandes) ; sans JavaScript, avec les mêmes protections que `/bonjour` (champ caché anti-robots, envoi depuis un autre site refusé, 8 envois par heure et par connexion, 50 messages par jour en tout : au-delà, le visiteur est invité à revenir le lendemain). Rien n'est envoyé au visiteur.
- **Page introuvable :** pour une adresse inconnue ou une photo dépubliée.

## Autres pages en v2

Quand la **v2** est appliquée, les autres pages du site prennent la même présentation (en-tête, pied de page complet, mêmes boutons) :

- **Confidentialité, Mentions légales :** le même texte qu'en v1, avec un sommaire **Sur cette page** : un clic mène à la partie choisie. Au bureau, le sommaire reste à gauche du texte ; au téléphone, il ouvre la page et chaque partie se termine par **↑ Sommaire**. Lignes courtes, faciles à lire ; à l'impression, noir sur blanc, sans menu.
- **Droits d'utilisation, À propos :** le même texte, en lignes courtes ; À propos montre vos photographes, leur biographie et **Voir les photos de…** (sans le logo en tête : la marque est dans l'en-tête).
- **Rechercher :** le même champ, avec son libellé et son aide au-dessus ; les photos trouvées en rangées. Sans résultat (ou avant de chercher), les séries à parcourir.
- **Carte :** elle s'ouvre **cadrée sur vos lieux** (avec ou sans JavaScript) ; **Monde** montre le monde entier. Le nom de chaque ville s'écrit à côté de sa vignette quand il a la place. Chaque lieu de la liste a son **↑ Carte**.

  | Geste | Effet |
  |---|---|
  | **+**, **−**, **Monde** | zoom avant, arrière, monde entier |
  | les quatre boutons fléchés, ou **← → ↑ ↓** au clavier (sur une vignette ou un bouton de la carte) | déplacer la carte |
  | **+** et **−** au clavier | zoom avant, arrière |

  Une vignette sortie du cadre n'est plus atteinte au clavier.
- **Voyages :** chaque voyage avec sa couverture à son format ; la page d'un voyage montre la photo entière à côté du titre (plus de titre posé sur la photo), le sommaire des jours, la carte de l'itinéraire (sans défilement de côté au téléphone : les étapes y sont numérotées, les encarts n'apparaissent qu'au bureau), puis les jours en rangées.
- **Page introuvable :** un champ pour chercher une photo, la galerie, les séries, À propos ; le sélecteur de langue mène à l'accueil de chaque langue.

## Toujours

- **Sans JavaScript, au clavier, avec un lecteur d'écran :** le site fonctionne.
- **Images :** elles s'adaptent à l'écran (format AVIF ou WebP, taille juste).
- **Protection :**
  - le clic droit et le glisser des images sont désactivés ;
  - les originaux ne sont jamais accessibles ;
  - les photos en brouillon ne sont visibles que dans l'admin.
