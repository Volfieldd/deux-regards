# Visite de l'admin

Captures d’une instance de test avec le seul jeu de démonstration, faites le 11/10/2026 : admin « Chambre noire » (police Jost), en mode sombre ; il existe aussi un mode clair (bouton soleil / lune, ou réglage du système). Elles se régénèrent sur une instance jetable (jeu de démonstration, sans logo) avec `E2E_CAPTURES=1 E2E_ALLOW_WRITES=1 npm run e2e -- --project=captures-bureau --project=captures-mobile` : les écrans d'import créent des photos. Pour l'usage pas à pas, voir l'[Aide de l'administration](Aide), également disponible dans l'admin (menu « Aide »).

À gauche, une **barre latérale** rangée par intention : recherche ⌘K et **Aujourd’hui** ; « Travailler » : **Sorties · Photothèque · Personnes** ; « Publier » : **Site public · Séries** (avec la liste des séries, où l’on dépose des photos pour les classer) **· Instagram · Statistiques · Signalements** (signalements des visiteurs, avec le nombre de nouveaux) ; « Sur le terrain » : **App, cartes, QR** ; « Réglages » : **Photographes · Apparence · Filigrane & EXIF · Droits & confidentialité · Aide · Voir le site** ; en bas le mode clair / sombre et la déconnexion. Au bout du menu, le sélecteur de langue (français, anglais, allemand), gardé sur la fiche du photographe. Les états (accords, contrôles) se lisent par une forme et un mot (✓, ▲, ✕), dans des couleurs choisies pour les daltoniens. Sur téléphone : une barre d’onglets en bas (**Aujourd’hui · Photos · Importer · Terrain · Menu**) ; l’onglet Terrain, comme l’icône de l’app installée, ouvre l’accueil Terrain (nouvelle rencontre, mon QR, ma sortie du jour).

Les captures datent d’avant les écrans Statistiques, Instagram et Rencontres, la mise en page iPhone (lot en cartes, « Ouvrir la fiche »), les traductions et les réglages de confidentialité : ces écrans sont décrits ci-dessous sans capture. Le bandeau rouge « Connexion locale de test » n'apparaît qu'avec la connexion de test.

## Connexion

En ligne, la connexion passe par Zitadel. Sur un serveur de test, ce formulaire la remplace : on choisit l'auteur à incarner et on saisit le jeton de test.

![Connexion de test](captures/admin/00-connexion-de-test-bureau.webp)

## Aujourd’hui (tableau de bord)

**À faire**, trié par urgence (✕ urgent, ▲ bientôt, ○ plus tard) avec un bouton vers l’écran qui règle chaque ligne, puis ce qui reste à finir (avec le geste direct), le site tel qu’il est (l’ouverture), les chiffres, le rythme d’import, les dernières modifications, les preuves d’antériorité et le compte connecté.

![Aujourd’hui, en mode clair](captures/admin/01b-aujourdhui-clair-bureau.webp)

![Tableau de bord](captures/admin/01-tableau-de-bord-bureau.webp)

## Photothèque

Une **planche contact** (chaque vignette garde le format de sa photo) et, à droite, l’**inspecteur** : une photo sélectionnée s’y modifie champ par champ ; plusieurs photos s’y classent, se datent, se publient d’un coup. Tout est annulable (⌘Z).

![Photothèque](captures/admin/02-photos-bureau.webp)

**Import :** « Importer des photos » ouvre le choix des fichiers, l'envoi part aussitôt et se suit photo par photo (les fichiers invalides sont écartés avant envoi).

![Import en cours](captures/admin/02b-import-progression-bureau.webp)

**Compléter et publier :** tout le lot sur une page ; la date vient de l'appareil, le lieu se saisit une fois pour le lot. Sur téléphone, le tableau devient une carte par photo (titre, série, lieu, date les uns sous les autres) et les réglages communs se replient derrière un bouton.

![Compléter et publier](captures/admin/02c-completer-le-lot-bureau.webp)

**Sélection multiple :** Maj + clic, ⌘ + clic ; l’inspecteur s’adapte.

![Sélection multiple](captures/admin/02d-selection-bureau.webp)

**Loupe** (touche L) : la photo en grand, pellicule en bas, l’inspecteur suit.

![Loupe](captures/admin/02e-loupe-bureau.webp)

**Palette ⌘K** : une photo, une série, une page ou une action, au clavier.

![Palette de commandes](captures/admin/02f-palette-bureau.webp)

**Sur téléphone :** toucher une photo la sélectionne ; son titre, ou le bouton **Ouvrir la fiche**, ouvre sa fiche en un toucher.

**Mode clair :**

![Photothèque en mode clair](captures/admin/02g-phototheque-clair-bureau.webp)

## Fiche d'une photo

On y trouve :

- **l'édition** : titre, adresse, série, auteur, lieu, date, légende, statut, filigrane ;
- **la preuve d'antériorité** : empreinte, date certifiée, téléchargements, vérification ;
- **Instagram** : état de la photo dans la file, ajout manuel ;
- **l'audience** de la photo ;
- **la suppression**, confirmée dans la page.

![Fiche d'une photo](captures/admin/03-fiche-photo-bureau.webp)

## Séries

Des planches de trois photos : créer (en tête), renommer, ordonner par glisser ou au clavier. Supprimer une série non vide déplace ses photos vers une autre série.

![Séries](captures/admin/04-series-bureau.webp)

![Suppression d'une série](captures/admin/04b-series-suppression-bureau.webp)

## Photographes

Nom, adresse, biographie et lien avec le compte de connexion.

![Auteurs](captures/admin/05-auteurs-bureau.webp)

## Statistiques

Fréquentation jour par jour (pages vues, visiteurs), photos les plus vues, pages, provenance, et ce qui est mesuré. Pas de capture pour l'instant.

## Instagram

Compte connecté, rythme (créneaux), file d’attente, historique, puis réglages : mise en file automatique par série (aucune par défaut), cadre et filigrane par défaut, modèle de légende, hashtags par série. Voir [Instagram](Instagram). Pas de capture pour l'instant.

## Filigrane et EXIF

Le filigrane (texte ou logo, position, opacité, taille), le niveau de métadonnées des images servies, et un aperçu, avec ou sans enregistrement.

![Filigrane et EXIF](captures/admin/06-filigrane-exif-bureau.webp)

## Apparence

Thème du site public, avec aperçu réservé aux admins, emblème et sous-titre : voir [Apparence et thèmes](Apparence-et-thèmes).

## Site public, droits et confidentialité

Nom du site, accroche, textes (et leur version anglaise et allemande, repliée sous chaque champ, avec « Proposer une traduction ») ; page « Droits d'utilisation » en français, anglais et allemand (chaque champ montre le texte lu par les visiteurs, pastille « Texte par défaut » ou « Texte personnalisé », bouton « Rétablir le texte par défaut ») et contact ; **Confidentialité** (contact des responsables, deux facteurs et disques chiffrés à cocher quand c'est vrai, état du chiffrement `DATA_KEY`) ; page **Carte** ; photos de l'ouverture (ordre, 8 au plus, vignettes en cadre 3:2). La capture montre encore l'ancien champ unique des droits.

![Réglages](captures/admin/07-reglages-bureau.webp)

## Personnes et Sur le terrain

Les personnes photographiées : demandes reçues sur `/bonjour` (nouvelles en tête, compteur dans la barre latérale, badge rouge pour une demande RGPD avec son échéance), fiche d'une rencontre (personne, historique, photos liées, carte signée, photo offerte par lien privé, droits : export et effacement), **Nouvelle rencontre** (l'app de l'iPhone : position, photo de repère, consentement en trois langues, signature au doigt, écran « Merci » avec QR). **Sur le terrain** réunit l'app, les cartes d'accord à imprimer et le QR des vêtements (une composition, avec le logo), avec une liste de contrôle avant de partir. Pas encore de capture : voir [Aide → Rencontres](Aide-Rencontres).

## Sur mobile

Toutes les pages s'adaptent au téléphone ; les boutons, champs et liens y font au moins 44 px de haut.

Barre d’onglets en bas (Importer au centre) ; l’inspecteur s’ouvre comme une feuille depuis le bas.

| Photos | Sélection | Séries | Fiche |
|---|---|---|---|
| ![Photos sur mobile](captures/admin/02-photos-mobile.webp) | ![Sélection sur mobile](captures/admin/02d-selection-mobile.webp) | ![Séries sur mobile](captures/admin/04-series-mobile.webp) | ![Fiche sur mobile](captures/admin/03-fiche-photo-mobile.webp) |
