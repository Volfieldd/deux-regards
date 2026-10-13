# Spécifications

| Document | Contenu |
|---|---|
| [Vue d'ensemble](#vue-densemble) (ci-dessous) | ce que fait le site, fonction par fonction |
| [`filigrane-et-exif.md`](filigrane-et-exif.md) | filigrane (texte, logo, mosaïque) et niveaux de métadonnées EXIF |
| [`preuves-et-droits.md`](preuves-et-droits.md) | preuve d'antériorité (empreinte, horodatage RFC 3161) et mentions de droits IPTC, page `/droits` |
| [`../../PLAN.md`](../../PLAN.md) | plan de réalisation par phases, choix techniques |

## Vue d'ensemble

### Site public

| Id | Fonction |
|---|---|
| P1 | **Ouverture** plein cadre : diaporama en fondu des photos choisies dans les réglages (8 au plus, dans l'ordre choisi ; à défaut les 5 premières), vignettes, glissé sur mobile, bouton pause (WCAG 2.2.2), arrêt si l'animation est réduite. |
| P2 | **Filtre « deux regards »** : les deux, Sébastien ou Julien, avec le nombre de photos de chacun. |
| P3 | **Index des séries** en grand, avec aperçu au survol ; une série vide n'est pas cliquable. |
| P4 | **Grille** en quinconce, numérotation `N°04 · Rue · J`. |
| P5 | Filtres combinables, URL partageables (`/auteur/julien`, `/serie/rue`, `/?regard=…&serie=…`), sans rechargement avec JS, et fonctionnels sans JS. |
| P5b | **Ordre de la galerie** : « Sélection » (ordre de la photothèque, défaut) ou « Plus récentes » (`?ordre=recentes`, date de première publication décroissante, colonne `published_at` posée par déclencheur SQLite) ; se cumule avec les filtres, suivi par la visionneuse (précédente, suivante, retour) ; URL canonique sans l'ordre. Photos publiées avant la migration 009 : date d'import. |
| P6 | **Visionneuse** `/photo/<adresse>` : fond noir, précédente et suivante dans le filtre actif, clavier (← → Échap), glissé, légende, lieu et date. ; légende longue repliée à 3 lignes avec « Lire la suite » (la page défile, aucun défilement intérieur), titres longs coupés à la ligne. |
| P7 | **Retour à la série à l'endroit quitté** : Fermer et Échap font un vrai retour arrière quand on vient de la galerie (le navigateur rend la position) ; précédente et suivante remplacent l'entrée d'historique (`location.replace`), si bien qu'un seul Retour ramène à la galerie ; la dernière photo vue est ramenée à l'écran. Mémoire de l'onglet (`sessionStorage`, 3 h) ; sans elle, liens simples. |
| P8 | Pages **À propos** (accroche, texte, auteurs) et **404**. |
| P9 | **Droits d'utilisation** en français (`/droits`), anglais (`/droits/en`) et allemand (`/droits/de`) : langue déclarée, sélecteur de langue, liens `hreflang`, présence dans `sitemap.xml` ; lien en pied de page de tout le site. |
| P10 | **Mesure d'audience anonyme** : pages et photos vues, visiteurs par jour, provenance (nom de domaine seul) ; sans cookie, sans script, sans service tiers, sans IP conservée ; robots, admins connectés, `DNT` / `Sec-GPC`, préchargements et 404 non comptés ; compteurs effacés après 25 mois. |
| P11 | Open Graph et URL canonique absolus ; `robots.txt` et `sitemap.xml` ; polices auto-hébergées ; aucune ressource tierce. |

### Administration

| Id | Fonction |
|---|---|
| A1 | **Connexion OIDC** (Zitadel), rôle `admin`, déconnexion côté site et IdP ; connexion locale de test hors production. |
| A2 | **Aujourd'hui** (tableau de bord) : photos à finir, ouverture, chiffres, rythme d'import, preuves, compte connecté et son `sub`. |
| A3 | **Photothèque** : planche contact, inspecteur (une photo modifiée champ par champ, plusieurs photos classées, datées ou publiées d'un coup), sélection multiple, loupe, palette ⌘K, classement par glisser vers une série, annulation (⌘Z), recherche et filtres, suppression confirmée ; mode clair / sombre de l'admin. |
| A4 | **Import** : envoi photo par photo avec suivi du traitement, photos en brouillon, date de prise de vue reprise de l'EXIF, titre provisoire tiré du nom de fichier ; puis **Compléter et publier** le lot (champ par champ ou d'un coup, sans JS aussi). |
| A5 | **Fiche photo** : édition validée, publication, ordre, filigrane par photo, preuve d'antériorité, Instagram, audience de la photo. |
| A6 | **Séries** : cartes avec couverture, création en tête, renommage, adresse, ordre (glisser ou clavier) ; supprimer une série non vide déplace ses photos vers une autre. |
| A7 | **Auteurs** : nom, adresse, bio, lien avec le compte de connexion. |
| A8 | **Réglages** : nom du site, accroche, textes, à propos ; textes des droits en FR / EN / DE (le texte par défaut est affiché, « Rétablir le texte par défaut », un texte inchangé reste « par défaut ») et contact ; photos de l'ouverture (ordre, 8 au plus, vignettes en cadre 3:2, photo entière). |
| A9 | **Filigrane et EXIF** : voir [`filigrane-et-exif.md`](filigrane-et-exif.md). |
| A10 | **Preuves d'antériorité** : empreinte et horodatage de chaque original, téléchargement et vérification de la preuve. |
| A11 | **Apparence** : thèmes (Atelier, Nicephos nuit et jour), aperçu réservé aux admins, emblème, icône et logo complet transformés en masque coloré par le thème, image de partage, sous-titre, favicon. |
| A12 | **Statistiques** : fréquentation (pages vues, visiteurs), photos les plus vues, pages, provenance. |
| A13 | **Instagram** : connexion d'un compte professionnel (API officielle de Meta), file d'attente publiée à heures fixes, légende tirée d'un modèle, cadre et filigrane par photo. Mise en file automatique **par série**, désactivée par défaut ; rien ne part sans `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` et `PUBLIC_URL` en HTTPS. ; **limites de l'API** réglables (Prudent par défaut : 25 publications / 24 h, 60 min d'écart, 100 appels / h ; Limites de Meta ; Personnalisé), quota réel lu avant chaque envoi, pause sans essai consommé quand Meta signale une limite, consommation affichée, « Publier maintenant » refusé hors budget avec explication. |
| A14 | **Téléphone (iPhone, Android)** : barre d'onglets, inspecteur en feuille ; « Compléter et publier » en cartes (une par photo) ; dans la photothèque, une photo touchée s'ouvre en un toucher (titre ou « Ouvrir la fiche ») ; cibles tactiles d'au moins 44 px. |
| A15 | Messages de confirmation ou d'erreur après chaque action, annulation des actions groupées ; aide en ligne avec un lien « Aide sur cette page » sur chaque écran ; toutes les pages sont utilisables sans JS et au clavier. |

### Images

| Id | Règle |
|---|---|
| I1 | Originaux jamais servis ; variantes AVIF et WebP en 640, 1280 et 2000 px, sans agrandissement. |
| I2 | Orientation EXIF appliquée aux pixels et aux dimensions. |
| I3 | Aucune métadonnée par défaut ; mentions IPTC (XMP) dans les modes signés. |
| I4 | Variantes servies seulement pour les photos publiées, en cache long ; leur nom porte l'empreinte des réglages. |
| I5 | Empreinte SHA-256 de chaque original, horodatée RFC 3161 et vérifiable sans le site. |

### Exigences transverses

| Id | Exigence |
|---|---|
| T1 | Sécurité : voir le wiki, page Sécurité (sessions, CSRF, CSP, limites d'import, configuration en ligne). |
| T2 | Accessibilité : focus visible, `prefers-reduced-motion`, textes alternatifs, alternatives clavier au glisser-déposer, erreurs de formulaire annoncées ; audit axe-core sans violation sur l'admin (clair et sombre, ordinateur et téléphone). |
| T3 | Sobriété : pas de framework front ni de build, images au format et à la taille adaptés, chargement à la demande. |
| T4 | Données : tout l'état dans `STORAGE_DIR` ; refus de démarrer sans montage en conteneur ; sauvegarde quotidienne de la base et des originaux. |
