# Tests

## Tests unitaires et d'intégration

```bash
npm test
```

Ils utilisent `node:test`, sans dépendance supplémentaire, et prennent environ 40 s. Chaque test travaille dans un dossier temporaire avec sa propre base. Le jeu de démonstration n'est généré qu'une fois par fichier, puis recopié pour chaque test.

| Fichier | Couvre |
|---|---|
| `test/app.test.js` | en-têtes de sécurité, configuration « en ligne », versionnage CSS/JS |
| `test/public.test.js` | pages publiques, filtres, ordre « Plus récentes » (tri, filtres cumulés, navigation, canonique) et date de première publication (déclencheur), visionneuse (navigation en boucle dans le filtre), Open Graph, bouton pause de l'ouverture, polices, isolement des originaux et des brouillons |
| `test/auth.test.js` | flux OIDC de bout en bout contre un faux fournisseur, sessions, CSRF, redirections, limite de débit |
| `test/admin.test.js` | connexion locale de test, toutes les actions de l'admin, import et ses refus, réglages (ouverture, textes des droits par défaut affichés et gardés « par défaut » s'ils ne changent pas) |
| `test/watermark.test.js` | règles du filigrane et des EXIF, rendu (positions, mosaïque, logo, opacité), modes EXIF, recalcul et bascule des URL |
| `test/proofs.test.js` | requête RFC 3161, jetons FreeTSA réels (analyse, signature, chaîne, altération), reprise après erreur, téléchargements, vérification, page `/droits` en français, anglais et allemand (langue déclarée, `hreflang`, sélecteur, textes réglables et échappés) |
| `test/import-perf.test.js` | performance de l'import : file de traitement concurrente (limite, ordre, une erreur ne bloque pas), threads de libvips, rendu à décodage unique identique à un rendu direct (dimensions, orientation, image) |
| `test/revue.test.js` | non-régression des constats de la revue d'octobre 2026 : redirections, erreurs génériques, protection de **toutes** les routes d'admin (liste des routes parcourue), configuration, jetons mal formés, suppressions pendant un rendu ou un horodatage, fichiers temporaires, filigrane sur petites images |
| `test/deploiement.test.js` | garde-fou de persistance des données, sauvegarde (instantané, rotation, copie des originaux), `sitemap.xml`, `robots.txt` |
| `test/apparence.test.js` | thèmes, aperçu réservé aux admins, emblème, icône, logo complet, image de partage, favicon |
| `test/ergonomie.test.js` | écrans revus après l'audit d'ergonomie : envoi photo par photo et suivi du traitement, lot complété champ par champ ou d'un coup (sans JavaScript), dates en langage courant, actions groupées et leur annulation, suppression groupée confirmée, séries (cartes, ordre JSON, création en tête, suppression qui déplace les photos), ouverture ordonnée |
| `test/statistiques.test.js` | mesure d’audience : pays (code de Cloudflare, ignoré hors proxy de confiance, par visiteur unique), carte et liste dans l’admin, mention publique FR/EN/DE ; comptage des pages et des photos, visiteur unique par jour, aucune IP stockée, exclusions (robots, admins, DNT/GPC, préchargement, 404, HEAD), changement de jour, purge à 25 mois, suppression d’une photo, pages d’admin |
| `test/instagram-accords.test.js` | Instagram suit les accords : Instagram sans le site refusé (`/bonjour`, carte) et ancien accord lu sans Instagram ; personne de la session sans Instagram (file refusée, fiche « Instagram bloqué », levé par « Pas sur cette photo ») ; refus ou accord sans Instagram après la mise en file (photo en échec expliqué, « Réessayer » refusé, levé par un accord avec Instagram) |
| `test/instagram-likes.test.js` | relevé des likes et commentaires : après 6 h, une fois par jour, posts du site seulement, pages suivies, historique, échec (motif sans jeton, nouvel essai une heure après), fiche (courbe), classement, relevé à la demande limité |
| `test/rencontres.test.js` | accord par session (photos du jour couvertes, exclusion, date de session corrigée, fiche photo « Personnes rencontrées », visage sur carte papier et vignette) ; références et codes de contrôle, page `/bonjour` (langues, `noindex`, carte reconnue), validations, champ piège, choix successifs et historique, limite par adresse ; admin : liste, fiche, photos liées, refus bloquant la publication (fiche, action groupée) puis appliqué (brouillon, file Instagram), carte signée en multipart (photo privée, CSRF), effacement, purge à 12 mois |
| `test/cartes.test.js` | planches de cartes (paires numérotées, QR, codes acceptés par la page, numéros retenus, génériques, validation, réservé aux admins) ; QR générique d'un photographe (`/bonjour/J`, demande attribuée, fichiers SVG en tracés et PNG transparent, réservés aux admins) ; photo offerte (photo liée exigée, lien dans la langue de la personne, aperçu et téléchargement en JPEG réduit avec mention « usage personnel », compteurs, expiration en 410, retrait) |
| `test/app-rencontre.test.js` | app Rencontre : écran installable, position autorisée seulement ici, validations (signature, majorité, parent), rencontre numérotée (position arrondie, ville, photo, signature), fiche, écran « Merci » dans la langue de la personne (QR, mailto), refus sans signature, récapitulatif envoyé par SMTP ou bouton de renvoi après échec, configuration SMTP vérifiée |
| `test/confidentialite.test.js` | page Confidentialité (trois langues, responsables conjoints, contact par défaut et réglable, durées, CNIL, mentions de sécurité seulement une fois cochées, liens partout, sitemap), information dans l'app, durées de conservation (photo de repère, accords et refus) |
| `test/rgpd.test.js` | droits : demande depuis `/bonjour` (copie ou effacement, échéance, référence non vérifiée signalée), export ZIP (données, signature, photos liées ; réservé aux admins ; journalisé), effacement (simple, refus gardé sans identité et publication toujours bloquée, photos supprimées avec leurs originaux, rappel Instagram) |
| `test/chiffrement.test.js` | coffre (aller-retour, mauvaise clé, clé absente, anciennes valeurs en clair), données des rencontres chiffrées dans la base et lisibles dans l'admin (liste, fiche, image, export), données existantes chiffrées une fois, état dans Réglages et sur `/confidentialite`, sans clé rien n'est chiffré |
| `test/langues.test.js` | détection de la langue (pays, pays à plusieurs langues, navigateur), repli des traductions, pages `/en` et `/de` (langue déclarée, menu, liens, `hreflang`, dates, 404), redirection d'arrivée (choix, pays, robots, adresses préfixées), sélecteur et cookie, traductions saisies dans l'admin et gardées par les modifications partielles |
| `test/traduction.test.js` | propositions de traduction avec un faux LibreTranslate : boutons absents sans `TRANSLATE_URL`, demande transmise (langues, clé), erreurs (texte vide, langues inconnues, refus, serveur arrêté), réservé aux auteurs avec CSRF |
| `test/localisation.test.js` | page « Carte » (404 tant qu’elle n’est pas publiée, aperçu des auteurs, menu, `sitemap.xml`, photos publiées et cochées seulement, groupées par ville, placées par la projection, fonds détaillés et tuiles servies compressées, crédit GeoNames, aucun style en ligne, vue comptée) ; ville des photos : recherche (petites communes, noms français, homonymes moins peuplés après, arrondissements écartés), ville d’une position GPS, lecture du GPS ; import avec GPS (ville seulement, pas sur la carte), photos existantes (une seule lecture, choix manuel gardé), fiche (ville choisie, tapée, inconnue ; carte exige une ville), panneau champ par champ, actions groupées et annulation, propositions réservées aux admins |
| `test/instagram-limits.test.js` | limites de l’API Instagram : budget (24 h glissantes, écart, appels par heure, pause, quota de Meta), préréglages et bornes, erreurs de limite de Meta (codes, `Retry-After`, `X-Business-Use-Case-Usage`, paliers) ; contre un faux Meta : « Publier maintenant » refusé hors budget sans essai compté, pause puis reprise au créneau suivant, quota atteint à la publication, quota réel lu, budget d’appels, vérifications espacées ; admin (réglage, consommation, reprise) |
| `test/instagram.test.js` | Instagram : légendes (variables, lignes vides, hashtags), réglages, jeton chiffré, créneaux à l’heure de Paris, images (passe-partout, recadrage, JPEG sans métadonnées, filigrane), envoi complet contre un faux service Meta (image servie le temps de l’envoi seulement), échecs et nouveaux essais, créneaux, renouvellement du jeton, routes d’admin (mise en file automatique par série, désactivée par défaut, fiche, aperçu, actions, OAuth `state`, CSRF) |
| `test/aide.test.js` | aide en ligne : toutes les sections, **aucun lien interne cassé**, lien « Aide sur cette page » de chaque écran |
| `test/db.test.js` | migrations, seed (12 photos, rien d'orphelin en cas d'échec), slugs |

Outils partagés : `test/helpers.js` (base, dossier et application de test), `test/oidc-provider.js` (faux fournisseur OIDC), `test/fixtures/` (jetons FreeTSA réels).

L'encodage AVIF est mis au plus rapide pendant les tests (`AVIF_EFFORT=0`, dans le script `npm test`). L'horodatage y est désactivé (`TSA_URL=off`) : les tests qui en ont besoin utilisent un faux service, qui renvoie des jetons FreeTSA réels enregistrés dans `test/fixtures/`.

## Tests navigateur (Playwright)

Ils tournent dans le **conteneur officiel Playwright** (`mcr.microsoft.com/playwright`, même version que `@playwright/test` dans `e2e/package.json`), contre un serveur **déjà démarré**, et n'installent rien sur la machine (il faut Docker).

```bash
# lecture seule : site public et écrans de l'admin
BASE_URL=http://<hôte>:<port> E2E_LOCAL_AUTH=<LOCAL_AUTH_TOKEN du serveur> npm run e2e
# avec les parcours qui modifient les données (serveur de test jetable)
BASE_URL=… E2E_LOCAL_AUTH=… E2E_ALLOW_WRITES=1 npm run e2e
# un seul projet, ou un seul test (options passées à « playwright test »)
BASE_URL=… E2E_LOCAL_AUTH=… npm run e2e -- --project=iphone
BASE_URL=… E2E_LOCAL_AUTH=… npm run e2e -- -g "statistiques"
```

`npm run e2e` appelle [`e2e/run.sh`](https://github.com/Volfieldd/deux-regards/blob/main/e2e/run.sh), qui lance le conteneur (`--network host`, sous votre utilisateur), y fait `npm install` dans `e2e/`, puis `npx playwright test` avec les options reçues.

| Variable | Défaut | Effet |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | serveur testé |
| `E2E_LOCAL_AUTH` | — | jeton de la connexion locale de test du serveur (`LOCAL_AUTH_TOKEN`). Sans lui, tous les tests de l'admin sont ignorés. |
| `E2E_ALLOW_WRITES` | — | `1` : active les tests qui **modifient les données** (projet `parcours`, captures d'import, changement de série sur iPhone) |
| `E2E_CAPTURES` | — | `1` : active les projets `captures-*` |
| `E2E_AUDIT` | — | `1` : active le projet `audit` |

Le serveur testé doit avoir le jeu de démonstration (`npm run seed`) et `LOCAL_AUTH_TOKEN` défini, donc être en HTTP et hors production.

### Projets (`e2e/playwright.config.js`)

Tous les tests tournent en parallèle (`fullyParallel`). Chaque projet sauf `setup` dépend de `setup`.

| Projet | Appareil | Fichiers | Contenu |
|---|---|---|---|
| `setup` | — | `auth.setup.js` | connexion locale de test (auteur « julien ») ; la session est enregistrée dans `e2e/results/.auth/` et réutilisée |
| `desktop` | Desktop Chrome | `public.spec.js`, `admin.spec.js` | site public et écrans de l'admin, en lecture seule |
| `mobile` | Pixel 7 (Chromium) | `public.spec.js`, `admin.spec.js` | idem sur téléphone (certains tests propres à la souris ou au clavier sont ignorés) |
| `iphone` | iPhone 15 (**WebKit**, moteur de Safari) | `iphone.spec.js` | admin au toucher ([audit iPhone](https://github.com/Volfieldd/deux-regards/blob/main/docs/audit-iphone-2026-10/README.md)) |
| `audit` | Desktop Chrome | `audit.spec.js` | seulement avec `E2E_AUDIT=1` |
| `captures-bureau` (1440 × 900), `captures-mobile` (Pixel 7) | | `captures.spec.js` | seulement avec `E2E_CAPTURES=1` |
| `parcours` | Desktop Chrome | `parcours.spec.js` | seulement avec `E2E_ALLOW_WRITES=1` ; lancé **après** `desktop` et `mobile`, qui supposent le jeu de démonstration intact |

### Fichiers

| Fichier | Couvre |
|---|---|
| `e2e/tests/auth.setup.js` | connexion de test par le formulaire, bandeau « Connexion locale de test » |
| `e2e/tests/public.spec.js` | accueil (ouverture, regards, séries, images chargées) ; diaporama (défilement, vignettes, pause, suspension sous le focus, horloge simulée) ; filtre sans rechargement, URL et historique ; visionneuse au clavier et retour à la galerie filtrée ; glissé sur mobile ; clic droit et glisser bloqués ; à propos, 404 et en-têtes de sécurité ; admin renvoyée vers la connexion ; site sans JavaScript ; page des droits et lien en pied de page ; axe-core (WCAG 2.2 A/AA, aucune violation sérieuse) ; filtre au clavier (focus, annonce) ; retour arrière depuis une ancre ; **retour à la série après une photo, position conservée même après avoir parcouru des photos** |
| `e2e/tests/admin.spec.js` | rendu de chaque page de l'admin ; preuve d'antériorité affichée et vérifiée (ignoré si `TSA_URL=off`) ; axe-core sans aucune violation, en mode sombre et clair ; aide (lien contextuel, sommaire, recherche) ; photothèque (sélection, inspecteur, loupe, palette ⌘K, clair / sombre ; bureau seulement) ; **statistiques** (une visite publique comptée et visible dans l'admin ; bureau seulement) ; Réglages (vignettes de l'ouverture en cadre 3:2, photo entière ; pied de la barre latérale dans son cadre) |
| `e2e/tests/iphone.spec.js` | « Compléter et publier » : chaque champ de chaque carte touchable ; série changée depuis une carte (avec `E2E_ALLOW_WRITES=1`, puis remise en état) ; photothèque : une photo touchée s'ouvre en un toucher (« Ouvrir la fiche ») ; cibles d'au moins 44 px |
| `e2e/tests/parcours.spec.js` | import, édition, publication, réordonnancement (glisser-déposer, y compris en dernière place, et menu ⋯) et suppression d'une photo ; séries (création en tête, ordre au clavier, suppression qui déplace les photos) ; photothèque (modification dans l'inspecteur, ⌘Z, classement par glisser vers une série puis Annuler) ; filigrane (aperçu, application, retour) ; déconnexion |
| `e2e/tests/captures.spec.js` | captures de la [Visite de l'admin](Visite-de-l-admin) (`docs/wiki/captures/`), bureau et mobile ; avec `E2E_ALLOW_WRITES=1`, aussi l'import suivi puis le lot, la sélection multiple, la loupe, la palette, le mode clair et la suppression d'une série (instance jetable) |
| `e2e/tests/audit.spec.js` | les cinq parcours de l'audit d'ergonomie (J1 à J5 : importer, compléter et publier, séries, classer, ouverture), mesurés (actions, tabulations, positions, temps d'import) et capturés dans `e2e/audit/apres/`, plus un audit axe-core sans tolérance des écrans revus ; nettoie ensuite ce qu'il a créé |

- **Données :** `parcours` **modifie les données**. Il ne suppose rien du contenu, nettoie les restes d'un passage interrompu, puis restaure à l'identique les réglages d'images trouvés (même en cas d'échec). À réserver à un serveur de test.
- **Accessibilité :** axe-core (WCAG 2.2 A/AA) sur les pages publiques ; pour l'admin, **aucune violation tolérée**, en mode sombre **et** en mode clair, sur ordinateur et sur téléphone.
- **Temps :** le diaporama est testé avec l'horloge simulée de Playwright (pas d'attente réelle).
- **Erreurs :** toute erreur JavaScript, toute violation de la politique de sécurité du contenu et toute ressource en échec fait échouer le test.
- **Résultats :** captures et traces (conservées en cas d'échec) dans `e2e/results/`, rapport HTML dans `e2e/report/`.

### Limites connues

- **Droits sur `e2e/` :** le conteneur tourne sous l'utilisateur qui lance `run.sh` et fait `npm install` dans `e2e/` (monté en `/e2e`), puis y écrit `results/` et `report/`. Si cet utilisateur ne peut pas écrire dans `e2e/` (dépôt cloné par un autre compte, `e2e/node_modules` créé par un autre utilisateur), l'installation échoue avant le premier test. Donnez-lui les droits d'écriture (`chown` ou groupe commun), ou lancez depuis votre propre clone.
- **Test `statistiques` en parallèle :** il compte les visites publiques avant et après sa propre visite. Quand tous les projets tournent en même temps, d'autres tests visitent le site public au même moment et faussent le compte : il peut échouer, alors qu'il passe seul (`npm run e2e -- --project=desktop -g statistiques`). À rendre indépendant des visites parallèles (voir la feuille de route de `PLAN.md`).
