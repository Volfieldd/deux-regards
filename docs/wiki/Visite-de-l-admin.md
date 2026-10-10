# Visite de l'admin

Captures d'une instance de test avec le seul jeu de démonstration, faites le 10/10/2026 après la refonte ergonomique. Elles se régénèrent sur une instance jetable (jeu de démonstration, sans logo) avec `E2E_CAPTURES=1 E2E_ALLOW_WRITES=1 npm run e2e -- --project=captures-bureau --project=captures-mobile` : les écrans d'import créent des photos. Pour l'usage pas à pas, voir l'[Aide de l'administration](Aide), également disponible dans l'admin (menu « Aide »).

En haut de chaque page : **Tableau de bord · Photos · Séries · Auteurs · Filigrane & EXIF · Apparence · Réglages · Voir le site**, et **Se déconnecter**. Le bandeau rouge « Connexion locale de test » n'apparaît qu'avec la connexion de test.

## Connexion

En ligne, la connexion passe par Zitadel. Sur un serveur de test, ce formulaire la remplace : on choisit l'auteur à incarner et on saisit le jeton de test.

![Connexion de test](captures/admin/00-connexion-de-test-bureau.webp)

## Tableau de bord

Il montre le nombre de photos publiées et de brouillons, de séries et d'auteurs, l'état des preuves d'antériorité, et le compte connecté avec l'auteur auquel il est lié.

![Tableau de bord](captures/admin/01-tableau-de-bord-bureau.webp)

## Photos

La page réunit :

- **l'import** en trois étapes : choisir et vérifier, envoi et traitement suivis photo par photo, compléter et publier le lot sur une seule page ;
- **la recherche et les filtres** ;
- **la liste dans l'ordre du site** : glisser une ligne pour la déplacer, ou menu ⋯ ; cases à cocher et barre d'actions groupées (publier, changer de série, supprimer), annulables.

![Liste des photos](captures/admin/02-photos-bureau.webp)

**Import :** « Importer des photos » ouvre le choix des fichiers, l'envoi part aussitôt et se suit photo par photo (les fichiers invalides sont écartés avant envoi).

![Import en cours](captures/admin/02b-import-progression-bureau.webp)

**Compléter et publier :** tout le lot sur une page ; la date vient de l'appareil, le lieu se saisit une fois pour le lot.

![Compléter et publier](captures/admin/02c-completer-le-lot-bureau.webp)

**Sélection multiple :** cases à cocher (Maj + clic pour une plage) et barre d'actions.

![Sélection multiple](captures/admin/02d-selection-bureau.webp)

## Fiche d'une photo

On y trouve :

- **l'édition** : titre, adresse, série, auteur, lieu, date, légende, statut, filigrane ;
- **la preuve d'antériorité** : empreinte, date certifiée, téléchargements, vérification ;
- **la suppression**, confirmée dans la page.

![Fiche d'une photo](captures/admin/03-fiche-photo-bureau.webp)

## Séries

Des cartes avec couverture et nombre de photos : créer (en tête), renommer, ordonner par glisser ou au clavier. Supprimer une série non vide déplace ses photos vers une autre série.

![Séries](captures/admin/04-series-bureau.webp)

![Suppression d'une série](captures/admin/04b-series-suppression-bureau.webp)

## Auteurs

Nom, adresse, biographie et lien avec le compte de connexion.

![Auteurs](captures/admin/05-auteurs-bureau.webp)

## Filigrane et EXIF

Le filigrane (texte ou logo, position, opacité, taille), le niveau de métadonnées des images servies, et un aperçu, avec ou sans enregistrement.

![Filigrane et EXIF](captures/admin/06-filigrane-exif-bureau.webp)

## Apparence

Thème du site public, avec aperçu réservé aux admins, emblème et sous-titre : voir [Apparence et thèmes](Apparence-et-thèmes).

## Réglages

Nom du site, accroche, textes, page « Droits d'utilisation », photos de l'ouverture.

![Réglages](captures/admin/07-reglages-bureau.webp)

## Sur mobile

Toutes les pages s'adaptent au téléphone.

Le menu se replie derrière **☰ Menu** ; la barre de sélection passe en bas de l'écran.

| Photos | Sélection | Séries | Fiche |
|---|---|---|---|
| ![Photos sur mobile](captures/admin/02-photos-mobile.webp) | ![Sélection sur mobile](captures/admin/02d-selection-mobile.webp) | ![Séries sur mobile](captures/admin/04-series-mobile.webp) | ![Fiche sur mobile](captures/admin/03-fiche-photo-mobile.webp) |
