# Spécifications

| Document | Contenu |
|---|---|
| [Vue d'ensemble](#vue-densemble) (ci-dessous) | ce que fait le site, fonction par fonction |
| [Filigrane et EXIF](https://github.com/Volfieldd/deux-regards/blob/main/docs/specs/filigrane-et-exif.md) | spécification détaillée : exigences, conception, critères d'acceptation |
| [Preuves et droits](https://github.com/Volfieldd/deux-regards/blob/main/docs/specs/preuves-et-droits.md) | preuve d'antériorité (empreinte, horodatage RFC 3161) et mentions de droits IPTC, page `/droits` |
| [PLAN.md](https://github.com/Volfieldd/deux-regards/blob/main/PLAN.md) | plan de réalisation par phases, choix techniques |

Source : [`docs/specs/`](https://github.com/Volfieldd/deux-regards/tree/main/docs/specs) dans le dépôt (cette page en est une copie).

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
| P9 | **Droits d'utilisation** en français (`/droits`), anglais (`/en/droits`) et allemand (`/de/droits`) : langue déclarée, sélecteur de langue, liens `hreflang`, présence dans `sitemap.xml` ; lien en pied de page de tout le site. |
| P10 | **Mesure d'audience anonyme** : pages et photos vues, visiteurs par jour, provenance (nom de domaine seul) ; sans cookie, sans script, sans service tiers, sans IP conservée ; robots, admins connectés, `DNT` / `Sec-GPC`, préchargements et 404 non comptés ; compteurs effacés après 25 mois ; **pays** (code transmis par Cloudflare, en-tête `CF-IPCountry`, cru seulement derrière le proxy de confiance ; « XX » sinon), compté par visiteur unique du jour. |
| P11 | Open Graph et URL canonique absolus ; `robots.txt` et `sitemap.xml` ; polices auto-hébergées ; aucune ressource tierce. |
| P12 | **Page « Carte »** (facultative, **désactivée par défaut**, case dans Réglages) : mappemonde aux couleurs du thème (fond Natural Earth embarqué, sans service de carte : 1:110m pour le monde entier, 1:50m au premier zoom, puis tuiles 1:10m de la zone visible au-delà de × 8, jusqu'à × 40 ; frontières), vignette ronde de la photo à l'emplacement de sa ville, nombre de photos par ville, vignettes proches regroupées ; zoom (boutons, pincement, Ctrl + molette) et déplacement ; liste des lieux sous la carte ; seulement les photos publiées cochées « Afficher sur la carte » ; non publiée : introuvable (404) pour les visiteurs, aperçu pour les auteurs connectés, absente du menu et de `sitemap.xml` ; crédit GeoNames sur la page. |
| P13 | **Trois langues** : français à la racine, anglais à `/en/…`, allemand à `/de/…` ; textes de l'interface traduits dans le code (aucune traduction automatique), dates et noms de pays localisés ; textes des auteurs traduisibles (accroche, introduction, À propos, biographies, séries, titres, légendes et lieux des photos), repli de-fr-en, en-fr-de, fr-en-de ; sélecteur (drapeau et code) au bout du menu et sur la page photo, qui ouvre la même page dans l'autre langue et retient le choix (cookie `langue`, seul cookie du site, posé seulement à ce moment-là) ; arrivée sur une page française : langue choisie, sinon pays (Cloudflare) puis langue du navigateur (pays francophones : français ; Allemagne, Autriche, Liechtenstein : allemand ; Belgique, Suisse, Luxembourg, Canada : navigateur ; ailleurs : anglais) ; robots, aperçus de liens et adresses `/en`, `/de` jamais redirigés ; `hreflang` et `x-default`, `sitemap.xml` avec les trois langues. |
| P14 | **« Je vous ai photographié »** (`/bonjour`, `/bonjour/<réf>`, trois langues, `noindex`, hors menu) : référence de la carte (préremplie par le QR ; code de contrôle HMAC à 3 caractères = carte vérifiée) ou date, lieu et détail ; recevoir la photo, accepter (site, Instagram, expositions et tirages, prénom ; nom et e-mail exigés) ou refuser la publication (anonyme possible), message ; dernier choix gagnant, historique gardé ; `/bonjour/<lettre>` : QR générique d'un photographe (vêtements), demande attribuée à l'auteur ; 8 demandes par heure et par adresse, champ piège ; aucun e-mail envoyé. **Photo offerte** (`/pour-vous/<jeton>`) : lien privé de 30 jours, page dans la langue de la personne, JPEG 2048 px (jamais l'original), `noindex`, `no-store`, page « expiré » (410). |
| P15 | **Confidentialité** (`/confidentialite`, trois langues, pied de page, `sitemap.xml`) : responsables conjoints et contact réglable, traitements, durées, destinataires, cookies, sécurité (deux facteurs, disques chiffrés : annoncés une fois cochés), droits, CNIL ; durées automatisées (photo de repère 6 mois, accords et refus 5 ans après la dernière photo liée, originaux supprimés effacés des sauvegardes après 90 jours). |
| P17 | **Chiffrement des données personnelles** (`DATA_KEY`) : champs des rencontres chiffrés dans la base (AES-256-GCM), données existantes chiffrées au démarrage, état affiché ; documents RGPD dans le wiki. |
| P16 | **Droits des personnes** : sur `/bonjour`, demande de copie ou d'effacement de ses données (adresse exigée pour une copie), échéance d'un mois dans l'admin ; export ZIP (données lisibles, historique, signature, images, photos liées en JPEG 2048 px, mode d'emploi dans sa langue) ; effacement (photos comprises sur demande ; refus gardé sans identité si des photos liées restent) ; rappel des posts Instagram à retirer. |

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
| A9 | **Filigrane et EXIF** : voir [Filigrane et EXIF](Filigrane-et-EXIF). |
| A10 | **Preuves d'antériorité** : empreinte et horodatage de chaque original, téléchargement et vérification de la preuve. |
| A11 | **Apparence** : thèmes (Atelier, Nicephos nuit et jour), aperçu réservé aux admins, emblème, icône et logo complet transformés en masque coloré par le thème, image de partage, sous-titre, favicon. |
| A12 | **Statistiques** : fréquentation (pages vues, visiteurs), photos les plus vues, pages, provenance ; **carte des visiteurs par pays** : mappemonde Natural Earth embarquée (aucun service de carte), une bulle par pays (surface proportionnelle), liste des 10 premiers. |
| A13 | **Instagram** : connexion d'un compte professionnel (API officielle de Meta), file d'attente publiée à heures fixes, légende tirée d'un modèle, cadre et filigrane par photo. Mise en file automatique **par série**, désactivée par défaut ; rien ne part sans `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` et `PUBLIC_URL` en HTTPS. ; **limites de l'API** réglables (Prudent par défaut : 25 publications / 24 h, 60 min d'écart, 100 appels / h ; Limites de Meta ; Personnalisé), quota réel lu avant chaque envoi, pause sans essai consommé quand Meta signale une limite, consommation affichée, « Publier maintenant » refusé hors budget avec explication ; **likes et commentaires** des posts publiés depuis le site relevés chaque matin (historique par jour, même autorisation que la publication), affichés dans la fiche (courbe) et en classement sur la page Instagram, relevé à la demande. |
| A14 | **Téléphone (iPhone, Android)** : barre d'onglets, inspecteur en feuille ; « Compléter et publier » en cartes (une par photo) ; dans la photothèque, une photo touchée s'ouvre en un toucher (titre ou « Ouvrir la fiche ») ; cibles tactiles d'au moins 44 px. |
| A15 | **Ville des photos** (pour la carte du site) : champ Ville avec propositions au fil de la frappe (GeoNames embarqué : toutes les communes de France, localités de plus de 500 habitants ailleurs, noms français des villes de plus de 30 000 habitants), ville proposée d'après le GPS de l'original à l'import et pour les photos existantes (jamais d'écrasement d'un choix manuel) ; seule la ville est gardée, jamais la position exacte ; case « Afficher sur la carte » décochée par défaut, actions groupées annulables. |
| A17 | **Traductions** : sous les champs concernés (Réglages, fiche photo, séries, auteurs), version anglaise et allemande repliée et facultative, avec son état (facultatif, 1 langue sur 2, traduit) ; gardées lors des modifications partielles (photothèque, lot) ; **Proposer une traduction** : serveur LibreTranslate de la pile (`TRANSLATE_URL`, aucun texte ne quitte le serveur, 0 €), proposition insérée dans le champ, à relire, annulable ; sans `TRANSLATE_URL`, pas de bouton. |
| A19 | **Accord par session** : un accord couvre les photos du photographe prises le jour de la session (date EXIF, date de session corrigeable), exclusions photo par photo ; fiche photo « Personnes rencontrées » (même session ou liées, visage, usages acceptés) ; refus ciblé sur les photos liées ; **visage** de la personne (app ou fiche), gardé avec l'accord. |
| A20 | **Instagram suit les accords** : Instagram suppose le site (formulaires `/bonjour`, app, carte : refusé sans le site ; ancien accord lu sans Instagram) ; une photo dont une personne liée, ou de la session non exclue, refuse ou n'a pas accepté Instagram est **bloquée** pour Instagram, sans confirmation possible : ajout à la file refusé, file vidée à chaque changement d'accord et avant chaque créneau (échec expliqué, « Réessayer » refusé), contrôle juste avant l'envoi ; fiche photo « Instagram bloqué » et « Pas sur cette photo » (exclusion de la session). |
| A18 | **Rencontres** : liste (nouvelles en tête, compteur dans la barre latérale), fiche (personne, historique, photos liées avec propositions du jour, carte signée et sa photo gardée dans la base, statut, « Écrire » par la messagerie), saisie d'une carte papier, lettre des cartes par auteur ; **refus** : publication impossible (fiche, actions groupées), « Appliquer le refus » dépublie et retire de la file Instagram ; effacement à la demande, purge des demandes sans accord ni refus après 12 mois ; **cartes à imprimer** (planches A4, paires numérotées avec QR et code de contrôle, ou génériques ; numéros retenus) ; **offrir la photo** (lien privé, compteurs, message prêt dans la langue de la personne, retrait) ; **app Rencontre** sur le téléphone (web app installable : position arrondie, photo de repère, consentement en trois langues signé au doigt, majorité ou parent, numéro suivant, écran « Merci » avec QR, récapitulatif envoyé par SMTP ou préparé dans Mail) ; **QR des vêtements** dans Auteurs (compositions verticale avec le logo, logo seul, écusson, QR seul ; encre noire ou blanche ; SVG en tracés ou PNG 300 dpi). |
| A16 | Messages de confirmation ou d'erreur après chaque action, annulation des actions groupées ; aide en ligne avec un lien « Aide sur cette page » sur chaque écran ; toutes les pages sont utilisables sans JS et au clavier. |

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
| T1 | Sécurité : voir [Sécurité](Sécurité) (sessions, CSRF, CSP, limites d'import, configuration en ligne). |
| T2 | Accessibilité : focus visible, `prefers-reduced-motion`, textes alternatifs, alternatives clavier au glisser-déposer, erreurs de formulaire annoncées ; audit axe-core sans violation sur l'admin (clair et sombre, ordinateur et téléphone). |
| T3 | Sobriété : pas de framework front ni de build, images au format et à la taille adaptés, chargement à la demande. |
| T4 | Données : tout l'état dans `STORAGE_DIR` ; refus de démarrer sans montage en conteneur ; sauvegarde quotidienne de la base et des originaux. |
