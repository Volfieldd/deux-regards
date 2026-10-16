# Grille RGAA 4.1.2 complétée — administration de Nicephos

- **Date** : 16 octobre 2026 — **Auditrice** : Camille Arnaud (méthode DINUM, tests manuels outillés)  
- **Périmètre** : Nicephos — administration /admin et app de terrain, copie privée de la démo (http://127.0.0.1:3097, mêmes données que http://127.0.0.1:3091), bureau 1440 × 900 et Pixel 7 (412 × 915), modes clair et sombre, connecté en Administrateur  
- **Point de départ** : grille automatique du 15 octobre (`ux-data/grilles/rgaa-admin.md` : 6 C, 6 NC, 13 NA, 81 NT), complétée par des tests clavier, l’arbre d’accessibilité de Chromium, des mesures au rendu (contrastes, cibles, reflow, espacement) et la lecture du code. Scripts : `outils/rgaa-admin/t*.mjs` ; résultats : `ux-data/rgaa-admin/*.json` ; captures : `ux-data/rgaa-admin/captures/`.  
- **Limites** : pas de lecteur d’écran réel (NVDA, VoiceOver) : la restitution vocale est déduite de l’arbre d’accessibilité ; pas de validation W3C ; tests d’écriture faits sur une **copie privée** de la démo (port 3097), jamais sur la démo partagée.  
- **Ce n’est pas une déclaration d’accessibilité.** Taux de conformité non calculable tant qu’il reste des NT.

## Synthèse

| | C | NC | NA | NT |
|---|---|---|---|---|
| Grille automatique (15/10) | 6 | 6 | 13 | 81 |
| **Grille complétée (16/10)** | **48** | **27** | **29** | **2** |

Taux de conformité **non calculable** : 2 critères restent non testés (8.2, 10.5) ; seuls les effectifs sont donnés.

Statuts changés par rapport à la grille automatique : 81 critères.

## Échantillon

| Écran | Adresse | Ce qui a été testé |
|---|---|---|
| Aujourd’hui | `/admin` | fenêtre « Nouveau depuis… », lien d’évitement, ordre de tabulation |
| Photothèque | `/admin/photos, ?vue=liste, ?statut=draft` | planche, liste, sélection clavier, raccourcis, inspecteur (une / plusieurs photos), loupe, import, filtres |
| Fiche photo | `/admin/photos/20, /admin/photos/24` | erreurs à l’envoi, champ obligatoire, rechargement automatique |
| Compléter et publier | `/admin/photos/lot?ids=24,25,26` | barre d’actions au clavier, libellés |
| Sorties | `/admin/sorties, /admin/sorties/julien/2026-10-10` | grille automatique, cibles |
| À valider | `/admin/a-valider` | grille automatique |
| Séries | `/admin/series` | poignée au clavier, menu ⋯, fenêtre de suppression |
| Personnes | `/admin/personnes, /admin/personnes/1, /admin/rencontres/1` | liens, cibles |
| Site public | `/admin/site` | cibles, liens |
| Voyage | `/admin/voyages/1` | grille automatique, cibles |
| App de terrain | `/admin/rencontre, /admin/rencontre/accueil, /admin/rencontre/qr` | téléphone : langue, regroupements, focus, erreurs |
| Terrain et cartes | `/admin/terrain, /admin/rencontres/cartes/planche?auteur=2` | structure |
| Pages de réglages | `/admin/aide, /admin/journal, /admin/nouveautes, /admin/droits, /admin/statistiques, /admin/images, /admin/apparence` | contrôles ciblés (axe, liens, cibles, reflow) |
| Transversal | `palette ⌘K, barre d’onglets, menu mobile, messages (toast)` | clavier, annonces |

## Non-conformités

| Critère | Niv. | Intitulé | Constat | Preuve |
|---|---|---|---|---|
| **1.9** | A | Chaque légende d’image est-elle, si nécessaire, correctement reliée à l’image correspondante ? | Images légendées en <figure>/<figcaption> sans role="figure" ni aria-label reprenant la légende : aperçu de la fiche photo, aperçu Instagram, aperçu du filigrane, QR (Terrain), photo de repère (Rencontre). | t13-divers.json ; views/admin/encounter.eta:37 ; views/admin/photo.eta:34 |
| **3.2** | AA | Dans chaque page web, le contraste entre la couleur du texte et la couleur de son arrière-plan est-il suffisamment élevé (hors cas particuliers) ? | Numéro de version du menu sur l’entrée active « Nouveautés » : #6B665D sur #E8E4DC = 4,49:1 en 10 px. Légendes posées sur les photos mesurées sur le rendu : 10,2 à 17,3:1 (conformes). | demo-admin-bureau/admin-nouveautes.json (axe color-contrast) ; t7-contraste-vignettes.json |
| **3.3** | AA | Dans chaque page web, les couleurs utilisées dans les composants d’interface ou les éléments graphiques porteurs d’informations sont-elles suffisamment contrastées (hors cas particuliers) ? | Mode clair : l’indicateur de focus des champs (anneau #F0A94C de 1,5 px, contour natif supprimé) n’a que 1,73:1 avec le fond du champ et 2,0:1 avec le fond autour (3:1 exigé pour l’état « focus » d’un composant). Mode sombre conforme (8,9:1). Bordures des champs : 3,2:1 (conforme). | t12-focus-contraste.json ; captures/t12-focus-champ-light.png ; admin.css:139 |
| **5.6** | A | Pour chaque tableau de données, chaque en-tête de colonne et chaque en-tête de ligne sont-ils correctement déclarés ? | Aide, rubrique Photos : tableau des entrées du menu dont les deux premiers en-têtes de colonne sont vides (<th></th>). Ailleurs (Compléter le lot, Journal, Statistiques) : th scope="col" corrects. | demo-admin-bureau/admin-aide.json (axe empty-table-header) ; docs/aide/01-premiers-pas.md:18 |
| **6.2** | A | Dans chaque page web, chaque lien a-t-il un intitulé ? | Liens sans intitulé : vignette de photo (image alt="" seule) dans « Photos de la personne » (fiche Personne, 1 lien) et dans « Photos de la sortie » / « Photos liées » (fiche Rencontre, 3 à 5 liens). | demo-admin-bureau/admin-personne-1.json, admin-rencontre-1-ines.json (axe link-name) ; views/admin/person.eta:64 ; views/admin/encounter.eta:103,116 |
| **7.1** | A | Chaque script est-il, si nécessaire, compatible avec les technologies d’assistance ? | Palette ⌘K : combobox toujours aria-expanded="true", liste (listbox) sans aucune option quand rien ne correspond (« Aucun résultat » en role="presentation"), aria-activedescendant vide. Les autres composants scriptés (loupe en role="dialog" aria-modal, pastilles aria-pressed, combobox des villes, menus details/summary, poignée des séries avec aide aria-describedby) exposent nom, rôle et état. Restitution réelle par NVDA / VoiceOver non testée. | t3-dialogues.json ; layout.eta:187-188 ; admin.js:1749 ; axe aria-required-children |
| **7.3** | AA | Chaque script est-il contrôlable par le clavier et par tout dispositif de pointage (hors cas particuliers) ? | Un script retire le focus de l’élément qui l’a (7.3.2) : (1) message « Annuler » qui disparaît après 10 s alors que le focus est sur son bouton → focus sur <body> ; (2) liste de l’import réécrite (innerHTML) à chaque progression : focus sur « Retirer faux.jpg » perdu en moins de 100 ms ; (3) fenêtre « Supprimer la série » fermée par Échap : focus sur <body>. Tout le reste se pilote au clavier (sélection, loupe, poignées, menus). | t2-phototheque.json (afterExpiry) ; t10-import.json ; t3-dialogues.json (delAfterEsc) ; admin.js:248, 487, 1001-1021 |
| **7.4** | A | Pour chaque script qui initie un changement de contexte, l’utilisateur est-il averti ou en a-t-il le contrôle ? | Photothèque : les listes « Photographe » et « Série » soumettent le formulaire dès qu’elles changent ; une flèche ↓ au clavier recharge la page (/admin/photos?q=&auteur=sebastien&serie=), sans avertissement ni bouton (le bouton « Filtrer » n’existe que sans JavaScript). | t2-phototheque.json (filterSelect) ; admin.js:318 |
| **7.5** | AA | Dans chaque page web, les messages de statut sont-ils correctement restitués par les technologies d’assistance ? | 7.5.1 : le résultat « Aucun résultat » de la palette n’est dans aucune région live. 7.5.2 : les messages d’erreur (« Date non comprise… », « Cochez au moins une photo. », « L’ordre n’a pas pu être enregistré… ») passent par la même région role="status" que les confirmations, au lieu de role="alert". Confirmations (toast, compteur de sélection, état de l’import) en role="status" : conformes ; région du toast masquée (hidden) entre deux messages : annonce à confirmer au lecteur d’écran. | t3-dialogues.json ; t2-phototheque.json (inspError.toastRole) ; admin.js:228-248 |
| **8.7** | AA | Dans chaque page web, chaque changement de langue est-il indiqué dans le code source (hors cas particuliers) ? | App de terrain : quand la personne choisit l’anglais ou l’allemand, les libellés visibles (« I agree, for: », « First and last name », « Sign here with your finger »…) restent dans une page lang="fr" sans attribut lang (12 libellés relevés) ; seul le paragraphe d’accord a son lang. Légendes « Langue », « Décision », « Âge » codées en français. | t8-noms.txt (appLang) ; views/admin/app.eta:53-86 |
| **8.9** | A | Dans chaque page web, les balises ne doivent pas être utilisées uniquement à des fins de présentation. Cette règle est-elle respectée ? | Import : « choisissez des fichiers » en <u> pour un simple soulignement. | views/admin/_import.eta:30 ; sonde presentation_tags |
| **9.1** | AA | Dans chaque page web, l’information est-elle structurée par l’utilisation appropriée de titres ? | App de terrain : /admin/rencontre sans h1 (titre « Nouvelle rencontre » en <strong>), /admin/rencontre/accueil sans h1, /admin/rencontre/qr sans aucun titre ; planche de cartes à imprimer : h2 avant h1 et cinq h1 « Merci ! ». Inspecteur de la photothèque : son titre h2 est le statut (« Publiée ») et non la photo. | t8-noms.txt ; t9-bureau-noms.txt ; axe page-has-heading-one |
| **9.2** | A | Dans chaque page web, la structure du document est-elle cohérente (hors cas particuliers) ? | Pas de <main> sur /admin/rencontre ni sur la planche de cartes ; le reste de l’admin : aside + nav + main. | t8-noms.txt ; t9-bureau-noms.txt ; axe landmark-one-main |
| **10.1** | A | Dans le site web, des feuilles de styles sont-elles utilisées pour contrôler la présentation de l’information ? | Même cas que 8.9 (<u>). | views/admin/_import.eta:30 |
| **10.6** | A | Dans chaque page web, chaque lien dont la nature n’est pas évidente est-il visible par rapport au texte environnant ? | Liens dans un texte de même couleur que lui et non soulignés (règle a { color: inherit; text-decoration: none }) : « voir sur le site » et « GeoNames » (fiche photo), « Site public » (Apparence), « Apparence » ×2 (Filigrane & EXIF), « réglages » (Filigrane de la fiche). | t13-divers.json ; captures/t14-lien-apparence.png ; admin.css:46 |
| **10.7** | AA | Dans chaque page web, pour chaque élément recevant le focus, la prise de focus est-elle visible ? | Méthodologie 10.7.1 : indicateur présent et contrasté à 3:1. (1) Mode clair : anneau de focus des champs (contour natif supprimé, anneau #F0A94C) à 1,73:1 sur le fond du champ et 2,0:1 autour ; boutons et liens conformes (contour 2 px #9A5B0C). (2) Au téléphone, l’élément qui a le focus est entièrement caché : par la barre d’onglets fixe (7 arrêts sur 60 sur la fiche photo, 10 sur 45 sur Séries, 2 sur 45 sur Aujourd’hui), par la barre « Enregistrer » de l’app de terrain (5 sur 30), par la feuille de l’inspecteur (12 vignettes sur 12 après une sélection), par le menu ouvert (la tabulation en sort sans le fermer). | t12-focus-contraste.json ; admin.css:139 ; t4-mobile.json ; t11-app.json ; captures/t4-mobile-feuille-focus.png |
| **10.11** | AA | Pour chaque page web, les contenus peuvent-ils être présentés sans perte d’information ou de fonctionnalité et sans avoir recours soit à un défilement vertical pour une fenêtre ayant une hauteur de 256 px, soit à un défilement horizontal pour une fenêtre ayant une largeur de 320 px (hors cas particuliers) ? | À 320 px, deux débordements horizontaux de 7 px : bouton « Série, lieu ou date pour toutes les cochées… » de Compléter le lot (texte coupé), formulaire de l’app de terrain. 19 autres pages sans défilement horizontal (tableaux du Journal et de l’Aide défilent dans leur conteneur : admis). | t6-reflow.json ; captures/t6-320-admin-photos-lot-ids-24-25-26.png, t6-320-admin-rencontre.png |
| **11.2** | AA | Chaque étiquette associée à un champ de formulaire est-elle pertinente (hors cas particuliers) ? | Compléter le lot : « Titre de la photo 24 », « Série de la photo 24 », « Lieu de la photo 24 » : le numéro interne n’apparaît nulle part à l’écran et n’identifie pas la photo. | t3-dialogues.json (batch.fieldNames) ; views/admin/batch.eta:60-68 |
| **11.5** | A | Dans chaque formulaire, les champs de même nature sont-ils regroupés, si nécessaire ? | App de terrain : les quatre cases d’usage (« sur le site », « sur Instagram », « en exposition et en tirage », « avec mon prénom ») ne sont pas regroupées sous « J’accepte, pour : » ; elles sont mêlées aux boutons radio de la décision. | t8-noms.txt (appEn) ; views/admin/app.eta:63-71 |
| **11.7** | A | Dans chaque formulaire, chaque légende associée à un regroupement de champs de même nature est-elle pertinente ? | App de terrain : légende « Âge » sur un groupe qui contient aussi « Nom du parent » ; légendes en français quand le formulaire est affiché en anglais ou en allemand. | views/admin/app.eta:54,64,76 |
| **11.10** | A | Dans chaque formulaire, le contrôle de saisie est-il utilisé de manière pertinente (hors cas particuliers) ? | 11.10.2 : champs obligatoires (required) sans indication visible : « Titre » de la fiche photo (formulaire d’une quinzaine de champs, les facultatifs non signalés), « Nom » des photographes. 11.10.7 : date invalide dans l’inspecteur : aria-invalid posé, mais le format attendu n’est que dans le placeholder (masqué par la saisie) et le message d’erreur dans un toast à 710 px du champ, effacé après 6 s ; « compris : avr. 2023 » reste affiché à côté de la saisie refusée. Fiche complète : erreurs reliées (aria-describedby) et annoncées (role="alert") : conformes. | t2-phototheque.json (inspError) ; t3-dialogues.json (fiche) ; captures/t2-erreur-inspecteur.png ; views/admin/photo.eta:46 ; photos.eta:153 |
| **11.13** | AA | La finalité d’un champ de saisie peut-elle être déduite pour faciliter le remplissage automatique des champs avec les données de l’utilisateur ? | App de terrain : « Prénom et nom » et « E-mail » de la personne qui remplit le formulaire en autocomplete="off". Les champs signalés par la sonde dans l’admin (noms de séries, lieux, voyages) ne concernent pas l’utilisateur : faux positifs. | views/admin/app.eta:72-73 ; t8-noms.txt |
| **12.6** | A | Les zones de regroupement de contenus présentes dans plusieurs pages web (zones d’en-tête, de navigation principale, de contenu principal, de pied de page et de moteur de recherche) peuvent-elles être atteintes ou évitées ? | App de terrain /admin/rencontre et planche de cartes : pas de zone de contenu principal (main). | axe landmark-one-main ; t8-noms.txt |
| **12.7** | AA | Dans chaque page web, un lien d’évitement ou d’accès rapide à la zone de contenu principal est-il présent (hors cas particuliers) ? | Admin : lien « Aller au contenu » conforme (1re tabulation, Entrée → main ; 20 tabulations jusqu’à la 1re vignette au lieu de 50). App de terrain (/admin/rencontre, /accueil, /qr) : aucun lien d’évitement. | t1-global.json ; sonde skip_link |
| **12.8** | A | Dans chaque page web, l’ordre de tabulation est-il cohérent ? | Téléphone : avec le menu ouvert (panneau de 280 px), la tabulation passe du menu au contenu caché dessous sans le fermer (« ＋ Importer des photos », filtres…) ; avec une photo choisie, la tabulation parcourt les vignettes cachées sous la feuille de l’inspecteur avant d’atteindre la feuille. | t4-mobile.json (menu, inspectorSheet) ; captures/t4-mobile-menu-tab.png |
| **12.10** | A | Dans chaque page web, les raccourcis clavier n’utilisant qu’une seule touche (lettre minuscule ou majuscule, ponctuation, chiffre ou symbole) sont-ils contrôlables par l’utilisateur ? | Photothèque : raccourcis d’une seule touche actifs dès que le focus n’est pas dans un champ texte (y compris sur une case à cocher) : P publie la sélection (vérifié : la photo n°23 publiée par la seule touche P), I ouvre l’import, L et Espace ouvrent la loupe. Aucun moyen de les désactiver ni de les remapper. | t2-phototheque.json (keyP) ; admin.js:1545-1565 ; photos.eta:133-139 |
| **13.1** | A | Pour chaque page web, l’utilisateur a-t-il le contrôle de chaque limite de temps modifiant le contenu (hors cas particuliers) ? | Rechargement automatique de la page par un script, sans avertissement ni moyen de l’arrêter (traité comme une redirection automatique par script, test 13.1.3 ; WCAG 2.2.1, technique d’échec F41) : fiche photo dès que la description suggérée arrive (la légende en cours de saisie est perdue, vérifié par interception), Séries quand l’état des propositions change, Instagram 2,5 s après un envoi. Session limitée à 24 h (≥ 20 h : conforme). | t3-dialogues.json (autoReload) ; admin.js:934, 1802, 2031-2044 ; server/sessions.js:4 |

## Critères WCAG 2.2 hors RGAA 4.1.2 (demandés)

| Critère WCAG 2.2 | Statut | Constat |
|---|---|---|
| 2.4.11 Focus non masqué (AA) | NC | Voir 10.7 : barre d’onglets, barre « Enregistrer » de l’app, feuille de l’inspecteur, menu ouvert (t4-mobile.json, t11-app.json). |
| 2.5.7 Mouvements de glissement (AA) | C | Chaque glisser a une alternative à un seul pointeur (voir 13.10). |
| 2.5.8 Taille des cibles minimale (AA) | NC | Téléphone, photothèque en liste : 25 cibles sur 199 trop petites et trop proches (cases 18 × 18, titres de 23 px de haut) ; cases de 18 px avec libellé de 21 px sur Droits & confidentialité, Site public, fiche Personne (t5-cibles.json ; axe target-size). |
| 3.2.6 Aide cohérente (A) | C | « Aide » au même rang du menu sur toutes les pages, « Aide sur cette page » en tête du contenu ; l’app de terrain n’a pas d’aide (admis). |
| 3.3.7 Saisie redondante (A) | NC | App de terrain : après une erreur de validation, la signature et la photo de repère sont perdues et doivent être refaites (server/routes/rencontres.js:222, values: { ...body, signature: '' } ; portrait non conservé). |
| 3.3.8 Authentification accessible (AA) | NT | Connexion déléguée à Zitadel (OIDC) : page hors du site, non auditée ; vérifier clés d’accès (passkeys), collage et gestionnaires de mots de passe. |
| 2.1.4 Raccourcis clavier (A) | NC | Voir 12.10. |
| 2.2.1 Réglage du délai (A) | NC | Message « Annuler » de 10 s sans prolongation ; rechargements automatiques (voir 13.1). |
| 4.1.3 Messages d’état (AA) | NC | Voir 7.5. |

## Grille complète (106 critères)

| Critère | Niv. | Auto 15/10 | **Statut** | Constat | Preuve |
|---|---|---|---|---|---|
| 1.1 | A | C | **C** | Images porteuses d’information pourvues d’une alternative : aperçu de l’inspecteur et loupe (alt = titre), QR (« QR de Julien, vers …/bonjour/J »), photo de repère, carte signée, aperçus Instagram et filigrane. Graphiques SVG masqués (aria-hidden) mais doublés d’une légende et d’un tableau (Statistiques). | sonde ; t8-noms.txt ; t9-bureau-noms.txt ; views/admin/stats.eta:32-37 |
| 1.2 | A | NT | **C** ✎ | Vignettes décoratives en alt="" sans title (contrôle sur 29 pages : aucune img alt="" avec title) ; liens images doublons masqués (aria-hidden + tabindex=-1) dans la photothèque. Les vignettes des fiches Personne et Rencontre ne sont pas décoratives : voir 6.2. | t13-divers.json |
| 1.3 | A | NT | **C** ✎ | Alternatives pertinentes sur l’échantillon (titres de photo, QR avec destination, « Photo de la carte signée »). | t9-bureau-noms.txt |
| 1.4 | A | NT | **NA** ✎ | Pas de CAPTCHA ni d’image-test dans l’admin. |  |
| 1.5 | A | NT | **NA** ✎ | Pas de CAPTCHA. |  |
| 1.6 | A | NT | **C** ✎ | Seule image complexe : la courbe de fréquentation (Statistiques), décrite par une légende et un tableau de données. | views/admin/stats.eta:32-37 |
| 1.7 | A | NT | **C** ✎ | Le tableau reprend toutes les valeurs du graphique. | views/admin/stats.eta:37 |
| 1.8 | AA | NT | **C** ✎ | Pas d’image texte (logotype en masque CSS décoratif, nom du site en texte). |  |
| 1.9 | A | NT | **NC** ✎ | Images légendées en <figure>/<figcaption> sans role="figure" ni aria-label reprenant la légende : aperçu de la fiche photo, aperçu Instagram, aperçu du filigrane, QR (Terrain), photo de repère (Rencontre). | t13-divers.json ; views/admin/encounter.eta:37 ; views/admin/photo.eta:34 |
| 2.1 | A | NA | **NA** | Aucun cadre. |  |
| 2.2 | A | NA | **NA** | Aucun cadre. |  |
| 3.1 | A | NT | **C** ✎ | États doublés d’un glyphe et d’un texte (○ Brouillon, ● Publiée, ▲ À vérifier, ✕ Bloquée) ; traductions manquantes barrées ; légende du graphique par forme (barre / ligne). | views/admin/photos.eta:67,86 ; admin.css:976 |
| 3.2 | AA | NT | **NC** ✎ | Numéro de version du menu sur l’entrée active « Nouveautés » : #6B665D sur #E8E4DC = 4,49:1 en 10 px. Légendes posées sur les photos mesurées sur le rendu : 10,2 à 17,3:1 (conformes). | demo-admin-bureau/admin-nouveautes.json (axe color-contrast) ; t7-contraste-vignettes.json |
| 3.3 | AA | NT | **NC** ✎ | Mode clair : l’indicateur de focus des champs (anneau #F0A94C de 1,5 px, contour natif supprimé) n’a que 1,73:1 avec le fond du champ et 2,0:1 avec le fond autour (3:1 exigé pour l’état « focus » d’un composant). Mode sombre conforme (8,9:1). Bordures des champs : 3,2:1 (conforme). | t12-focus-contraste.json ; captures/t12-focus-champ-light.png ; admin.css:139 |
| 4.1 | A | NA | **NA** | Aucun média temporel. |  |
| 4.2 | A | NA | **NA** | Aucun média temporel. |  |
| 4.3 | A | NA | **NA** | Aucun média temporel. |  |
| 4.4 | A | NT | **NA** ✎ | Aucun média temporel. |  |
| 4.5 | AA | NA | **NA** | Aucun média temporel. |  |
| 4.6 | AA | NT | **NA** ✎ | Aucun média temporel. |  |
| 4.7 | A | NT | **NA** ✎ | Aucun média temporel. |  |
| 4.8 | A | NA | **NA** | Aucun média non temporel. |  |
| 4.9 | A | NT | **NA** ✎ | Aucun média non temporel. |  |
| 4.10 | A | NA | **NA** | Aucun son déclenché automatiquement. |  |
| 4.11 | A | NA | **NA** | Aucun média. |  |
| 4.12 | A | NT | **NA** ✎ | Aucun média non temporel. |  |
| 4.13 | A | NT | **NA** ✎ | Aucun média. |  |
| 5.1 | A | NT | **NA** ✎ | Aucun tableau de données complexe. |  |
| 5.2 | A | NT | **NA** ✎ | Aucun tableau de données complexe. |  |
| 5.3 | A | NT | **NA** ✎ | Pas de tableau de mise en forme. |  |
| 5.4 | A | NA | **NA** | Pas de tableau de données titré. |  |
| 5.5 | A | NT | **NA** ✎ | Pas de tableau de données titré. |  |
| 5.6 | A | NA | **NC** ✎ | Aide, rubrique Photos : tableau des entrées du menu dont les deux premiers en-têtes de colonne sont vides (<th></th>). Ailleurs (Compléter le lot, Journal, Statistiques) : th scope="col" corrects. | demo-admin-bureau/admin-aide.json (axe empty-table-header) ; docs/aide/01-premiers-pas.md:18 |
| 5.7 | A | NT | **C** ✎ | Tableaux simples : en-têtes de colonne avec scope="col". | views/admin/batch.eta:50-53 |
| 5.8 | A | NA | **NA** | Pas de tableau de mise en forme. |  |
| 6.1 | A | NT | **C** ✎ | Liens explicites seuls ou par leur contexte (« Photos › » dans la carte de la série nommée par son h2 ; « Écrire », « sortie » dans leur ligne). | t9-bureau-noms.txt |
| 6.2 | A | C | **NC** ✎ | Liens sans intitulé : vignette de photo (image alt="" seule) dans « Photos de la personne » (fiche Personne, 1 lien) et dans « Photos de la sortie » / « Photos liées » (fiche Rencontre, 3 à 5 liens). | demo-admin-bureau/admin-personne-1.json, admin-rencontre-1-ines.json (axe link-name) ; views/admin/person.eta:64 ; views/admin/encounter.eta:103,116 |
| 7.1 | A | NT | **NC** ✎ | Palette ⌘K : combobox toujours aria-expanded="true", liste (listbox) sans aucune option quand rien ne correspond (« Aucun résultat » en role="presentation"), aria-activedescendant vide. Les autres composants scriptés (loupe en role="dialog" aria-modal, pastilles aria-pressed, combobox des villes, menus details/summary, poignée des séries avec aide aria-describedby) exposent nom, rôle et état. Restitution réelle par NVDA / VoiceOver non testée. | t3-dialogues.json ; layout.eta:187-188 ; admin.js:1749 ; axe aria-required-children |
| 7.2 | A | NT | **C** ✎ | Chaque fonction scriptée a son équivalent sans JavaScript (formulaires classiques, boutons data-nojs). | views/admin/photos.eta, batch.eta |
| 7.3 | AA | NT | **NC** ✎ | Un script retire le focus de l’élément qui l’a (7.3.2) : (1) message « Annuler » qui disparaît après 10 s alors que le focus est sur son bouton → focus sur <body> ; (2) liste de l’import réécrite (innerHTML) à chaque progression : focus sur « Retirer faux.jpg » perdu en moins de 100 ms ; (3) fenêtre « Supprimer la série » fermée par Échap : focus sur <body>. Tout le reste se pilote au clavier (sélection, loupe, poignées, menus). | t2-phototheque.json (afterExpiry) ; t10-import.json ; t3-dialogues.json (delAfterEsc) ; admin.js:248, 487, 1001-1021 |
| 7.4 | A | NT | **NC** ✎ | Photothèque : les listes « Photographe » et « Série » soumettent le formulaire dès qu’elles changent ; une flèche ↓ au clavier recharge la page (/admin/photos?q=&auteur=sebastien&serie=), sans avertissement ni bouton (le bouton « Filtrer » n’existe que sans JavaScript). | t2-phototheque.json (filterSelect) ; admin.js:318 |
| 7.5 | AA | NT | **NC** ✎ | 7.5.1 : le résultat « Aucun résultat » de la palette n’est dans aucune région live. 7.5.2 : les messages d’erreur (« Date non comprise… », « Cochez au moins une photo. », « L’ordre n’a pas pu être enregistré… ») passent par la même région role="status" que les confirmations, au lieu de role="alert". Confirmations (toast, compteur de sélection, état de l’import) en role="status" : conformes ; région du toast masquée (hidden) entre deux messages : annonce à confirmer au lecteur d’écran. | t3-dialogues.json ; t2-phototheque.json (inspError.toastRole) ; admin.js:228-248 |
| 8.1 | A | C | **C** | Doctype présent (sonde). | rgaa-admin.md |
| 8.2 | A | NT | **NT** | Pas d’id en double sur 29 pages ; validation W3C complète non faite. | t13-divers.json |
| 8.3 | A | C | **C** | lang présent (sonde). | rgaa-admin.md |
| 8.4 | A | C | **C** | Codes de langue valides (sonde). | rgaa-admin.md |
| 8.5 | A | C | **C** | Titre présent (sonde). | rgaa-admin.md |
| 8.6 | A | NT | **C** ✎ | Titres pertinents et uniques sur 29 pages (« Inês, rua dos Remédios · Administration · Nicephos », « Sortie du samedi 10 octobre 2026 · … »). | t13-divers.json |
| 8.7 | AA | NT | **NC** ✎ | App de terrain : quand la personne choisit l’anglais ou l’allemand, les libellés visibles (« I agree, for: », « First and last name », « Sign here with your finger »…) restent dans une page lang="fr" sans attribut lang (12 libellés relevés) ; seul le paragraphe d’accord a son lang. Légendes « Langue », « Décision », « Âge » codées en français. | t8-noms.txt (appLang) ; views/admin/app.eta:53-86 |
| 8.8 | AA | NT | **C** ✎ | Codes fr, en, de valides. |  |
| 8.9 | A | NC | **NC** | Import : « choisissez des fichiers » en <u> pour un simple soulignement. | views/admin/_import.eta:30 ; sonde presentation_tags |
| 8.10 | A | NT | **NA** ✎ | Pas de changement de sens de lecture. |  |
| 9.1 | AA | NC | **NC** | App de terrain : /admin/rencontre sans h1 (titre « Nouvelle rencontre » en <strong>), /admin/rencontre/accueil sans h1, /admin/rencontre/qr sans aucun titre ; planche de cartes à imprimer : h2 avant h1 et cinq h1 « Merci ! ». Inspecteur de la photothèque : son titre h2 est le statut (« Publiée ») et non la photo. | t8-noms.txt ; t9-bureau-noms.txt ; axe page-has-heading-one |
| 9.2 | A | NT | **NC** ✎ | Pas de <main> sur /admin/rencontre ni sur la planche de cartes ; le reste de l’admin : aside + nav + main. | t8-noms.txt ; t9-bureau-noms.txt ; axe landmark-one-main |
| 9.3 | A | NT | **C** ✎ | Listes balisées (ul/ol) pour les photos, séries, fichiers, étapes. Menus en <nav> sans liste : admis, structurer en liste reste une bonne pratique. |  |
| 9.4 | A | NT | **C** ✎ | Citation du message du photographe en <q> (À valider). | sonde quotes |
| 10.1 | A | NC | **NC** | Même cas que 8.9 (<u>). | views/admin/_import.eta:30 |
| 10.2 | A | NT | **C** ✎ | Seul contenu généré par CSS : les libellés « Titre / Série / Lieu / Date » des cartes de « Compléter le lot » sur téléphone, doublés par les en-têtes du tableau et les aria-label. | t15-css.json |
| 10.3 | A | NT | **C** ✎ | Ordre du code logique (lien d’évitement, menu, contenu, inspecteur, barre d’onglets, message). | t1-global.json |
| 10.4 | AA | NT | **C** ✎ | Agrandi à l’équivalent de 400 % (320 px), le contenu reste lisible ; voir 10.11 pour deux débordements de 7 px. | t6-reflow.json |
| 10.5 | AA | NT | **NT** | Couples couleur de texte / couleur de fond non vérifiés déclaration par déclaration. |  |
| 10.6 | A | NT | **NC** ✎ | Liens dans un texte de même couleur que lui et non soulignés (règle a { color: inherit; text-decoration: none }) : « voir sur le site » et « GeoNames » (fiche photo), « Site public » (Apparence), « Apparence » ×2 (Filigrane & EXIF), « réglages » (Filigrane de la fiche). | t13-divers.json ; captures/t14-lien-apparence.png ; admin.css:46 |
| 10.7 | AA | NT | **NC** ✎ | Méthodologie 10.7.1 : indicateur présent et contrasté à 3:1. (1) Mode clair : anneau de focus des champs (contour natif supprimé, anneau #F0A94C) à 1,73:1 sur le fond du champ et 2,0:1 autour ; boutons et liens conformes (contour 2 px #9A5B0C). (2) Au téléphone, l’élément qui a le focus est entièrement caché : par la barre d’onglets fixe (7 arrêts sur 60 sur la fiche photo, 10 sur 45 sur Séries, 2 sur 45 sur Aujourd’hui), par la barre « Enregistrer » de l’app de terrain (5 sur 30), par la feuille de l’inspecteur (12 vignettes sur 12 après une sélection), par le menu ouvert (la tabulation en sort sans le fermer). | t12-focus-contraste.json ; admin.css:139 ; t4-mobile.json ; t11-app.json ; captures/t4-mobile-feuille-focus.png |
| 10.8 | A | NT | **C** ✎ | Contenus masqués réellement masqués (hidden, visibility:hidden du menu fermé). |  |
| 10.9 | A | NT | **C** ✎ | Pas d’information donnée par la seule forme ou position (la consigne « panneau de droite » ne s’affiche que sans JavaScript, où le panneau est titré). |  |
| 10.10 | A | NT | **C** ✎ | Idem 10.9. |  |
| 10.11 | AA | NT | **NC** ✎ | À 320 px, deux débordements horizontaux de 7 px : bouton « Série, lieu ou date pour toutes les cochées… » de Compléter le lot (texte coupé), formulaire de l’app de terrain. 19 autres pages sans défilement horizontal (tableaux du Journal et de l’Aide défilent dans leur conteneur : admis). | t6-reflow.json ; captures/t6-320-admin-photos-lot-ids-24-25-26.png, t6-320-admin-rencontre.png |
| 10.12 | AA | NT | **C** ✎ | Interlignage 1,5, paragraphes 2 em, lettres 0,12 em, mots 0,16 em : aucun texte nouvellement tronqué sur 21 pages. | t6-reflow.json (spacing) |
| 10.13 | AA | NT | **C** ✎ | Légendes des vignettes visibles au survol et au focus, dans la vignette, sans masquer d’autre texte ni de commande ; infobulles natives (title) hors champ. |  |
| 10.14 | A | NT | **C** ✎ | Légendes des vignettes aussi visibles au focus (:focus-within). | admin.css:217-219 |
| 11.1 | AA | NT | **C** ✎ | Chaque champ a une étiquette (label ou aria-label doublé d’un texte visible adjacent). | sonde ; t9-bureau-noms.txt |
| 11.2 | AA | NT | **NC** ✎ | Compléter le lot : « Titre de la photo 24 », « Série de la photo 24 », « Lieu de la photo 24 » : le numéro interne n’apparaît nulle part à l’écran et n’identifie pas la photo. | t3-dialogues.json (batch.fieldNames) ; views/admin/batch.eta:60-68 |
| 11.3 | AA | NT | **C** ✎ | Étiquettes cohérentes d’une page à l’autre (Titre, Série, Lieu, Date, Photographe). |  |
| 11.4 | A | NT | **C** ✎ | Étiquettes accolées aux champs. |  |
| 11.5 | A | NT | **NC** ✎ | App de terrain : les quatre cases d’usage (« sur le site », « sur Instagram », « en exposition et en tirage », « avec mon prénom ») ne sont pas regroupées sous « J’accepte, pour : » ; elles sont mêlées aux boutons radio de la décision. | t8-noms.txt (appEn) ; views/admin/app.eta:63-71 |
| 11.6 | A | NT | **C** ✎ | Les regroupements existants ont une légende (Statut, Filigrane, Langue, Décision, Âge). |  |
| 11.7 | A | NT | **NC** ✎ | App de terrain : légende « Âge » sur un groupe qui contient aussi « Nom du parent » ; légendes en français quand le formulaire est affiché en anglais ou en allemand. | views/admin/app.eta:54,64,76 |
| 11.8 | A | NT | **C** ✎ | Listes courtes, sans regroupement d’options nécessaire. |  |
| 11.9 | A | NT | **C** ✎ | Intitulés de boutons pertinents (« Publier les 3 », « Supprimer « Rue » », « Classer dans « Rue » »). |  |
| 11.10 | A | NT | **NC** ✎ | 11.10.2 : champs obligatoires (required) sans indication visible : « Titre » de la fiche photo (formulaire d’une quinzaine de champs, les facultatifs non signalés), « Nom » des photographes. 11.10.7 : date invalide dans l’inspecteur : aria-invalid posé, mais le format attendu n’est que dans le placeholder (masqué par la saisie) et le message d’erreur dans un toast à 710 px du champ, effacé après 6 s ; « compris : avr. 2023 » reste affiché à côté de la saisie refusée. Fiche complète : erreurs reliées (aria-describedby) et annoncées (role="alert") : conformes. | t2-phototheque.json (inspError) ; t3-dialogues.json (fiche) ; captures/t2-erreur-inspecteur.png ; views/admin/photo.eta:46 ; photos.eta:153 |
| 11.11 | AA | NT | **C** ✎ | Messages avec exemples : « Date non comprise : essayez « oct. 2026 », « 10/2026 » ou « 2026-10 ». » | t3-dialogues.json |
| 11.12 | AA | NT | **C** ✎ | Suppressions confirmées par une fenêtre ; actions groupées annulables (« Annuler » 10 s, ⌘Z) ; publication réversible (Dépublier). |  |
| 11.13 | AA | NC | **NC** | App de terrain : « Prénom et nom » et « E-mail » de la personne qui remplit le formulaire en autocomplete="off". Les champs signalés par la sonde dans l’admin (noms de séries, lieux, voyages) ne concernent pas l’utilisateur : faux positifs. | views/admin/app.eta:72-73 ; t8-noms.txt |
| 12.1 | AA | NT | **C** ✎ | Deux systèmes : menu et palette de recherche ⌘K (accessible aussi au toucher par « Rechercher, agir… »). |  |
| 12.2 | AA | NT | **C** ✎ | Menu et barre d’onglets identiques sur toutes les pages. |  |
| 12.3 | AA | NT | **NA** ✎ | Pas de plan du site (12.1 satisfait autrement). |  |
| 12.4 | AA | NT | **NA** ✎ | Pas de plan du site. |  |
| 12.5 | AA | NT | **C** ✎ | Palette atteignable au même endroit (barre latérale, menu mobile). |  |
| 12.6 | A | NC | **NC** | App de terrain /admin/rencontre et planche de cartes : pas de zone de contenu principal (main). | axe landmark-one-main ; t8-noms.txt |
| 12.7 | AA | NC | **NC** | Admin : lien « Aller au contenu » conforme (1re tabulation, Entrée → main ; 20 tabulations jusqu’à la 1re vignette au lieu de 50). App de terrain (/admin/rencontre, /accueil, /qr) : aucun lien d’évitement. | t1-global.json ; sonde skip_link |
| 12.8 | A | NT | **NC** ✎ | Téléphone : avec le menu ouvert (panneau de 280 px), la tabulation passe du menu au contenu caché dessous sans le fermer (« ＋ Importer des photos », filtres…) ; avec une photo choisie, la tabulation parcourt les vignettes cachées sous la feuille de l’inspecteur avant d’atteindre la feuille. | t4-mobile.json (menu, inspectorSheet) ; captures/t4-mobile-menu-tab.png |
| 12.9 | A | NT | **C** ✎ | Aucun piège : loupe et fenêtres se ferment par Échap. | t2-phototheque.json (keyL) |
| 12.10 | A | NT | **NC** ✎ | Photothèque : raccourcis d’une seule touche actifs dès que le focus n’est pas dans un champ texte (y compris sur une case à cocher) : P publie la sélection (vérifié : la photo n°23 publiée par la seule touche P), I ouvre l’import, L et Espace ouvrent la loupe. Aucun moyen de les désactiver ni de les remapper. | t2-phototheque.json (keyP) ; admin.js:1545-1565 ; photos.eta:133-139 |
| 12.11 | A | NT | **C** ✎ | Menus « ⋯ », langue, renommer : atteignables et utilisables au clavier. | t3-dialogues.json (menuTabs) |
| 13.1 | A | NT | **NC** ✎ | Rechargement automatique de la page par un script, sans avertissement ni moyen de l’arrêter (traité comme une redirection automatique par script, test 13.1.3 ; WCAG 2.2.1, technique d’échec F41) : fiche photo dès que la description suggérée arrive (la légende en cours de saisie est perdue, vérifié par interception), Séries quand l’état des propositions change, Instagram 2,5 s après un envoi. Session limitée à 24 h (≥ 20 h : conforme). | t3-dialogues.json (autoReload) ; admin.js:934, 1802, 2031-2044 ; server/sessions.js:4 |
| 13.2 | A | NT | **C** ✎ | Aucune fenêtre ouverte sans action (la fenêtre « Nouveau depuis… » est une boîte de dialogue modale dans la page, fermable par Échap). | t1b-news.json |
| 13.3 | A | NA | **NA** | Pas de document bureautique en téléchargement (export .zip de données JSON et images). |  |
| 13.4 | A | NT | **NA** ✎ | Idem 13.3. |  |
| 13.5 | A | NT | **C** ✎ | Glyphes (✦ ▲ ⏲ ↩ ⠿) masqués aux lecteurs d’écran et doublés d’un texte. |  |
| 13.6 | A | NT | **C** ✎ | Idem 13.5. |  |
| 13.7 | A | NT | **C** ✎ | Aucun flash. |  |
| 13.8 | A | NT | **C** ✎ | Seul mouvement automatique : l’indicateur de traitement, arrêté par prefers-reduced-motion. | admin.css:535-537 |
| 13.9 | AA | NT | **C** ✎ | Aucune orientation imposée (manifeste de l’app sans « orientation »). | server/routes/public.js:86-92 |
| 13.10 | A | NT | **C** ✎ | Glisser-déposer toujours doublé (menu ⋯ Monter/Descendre, poignée au clavier, ← → de l’ouverture, pastilles de série, choix de fichiers) ; la signature au doigt est un tracé essentiel, et « Je ne décide pas maintenant » laisse décider plus tard sur son propre appareil. |  |
| 13.11 | A | NT | **C** ✎ | Actions déclenchées au relâchement (clic) ; dépôt annulable. |  |
| 13.12 | A | NT | **NA** ✎ | Aucune fonction déclenchée par le mouvement de l’appareil. |  |

✎ : statut modifié par rapport à la grille automatique.

## Suivi des audits précédents (accessibilité de l’admin)

- **F-M08 lien d’évitement** (audit du 10/10) : fait et fonctionnel (1re tabulation, Entrée → `main`) ; 20 tabulations jusqu’à la première vignette au lieu de 50.
- **Cibles de 44 px au téléphone** (F-m03, audit iPhone M3) : fait pour la planche, la fiche, Séries ; **pas** pour la photothèque en vue Liste (cases de 18 px) ni pour quelques liens de la fiche.
- **« 0 violation axe sur chaque écran revu »** (cible/README) : vrai pour les écrans revus alors ; sur les écrans ajoutés depuis (Personnes, Rencontres, app de terrain, planche, palette, Aide, Nouveautés, Droits) axe relève 7 règles (link-name, page-has-heading-one, landmark-one-main, aria-required-children, color-contrast, target-size, empty-table-header).
- **Revue d’octobre, « focus invisible sur les boutons pleins »** : corrigé (contour 2 px #9A5B0C) ; l’anneau des **champs** en mode clair reste à 1,7:1.
- **Audit iPhone, lots 4 à 6** (mode « Sélectionner », Séries ↑ ↓ au toucher, Enregistrer collant) : non faits à ce jour.
