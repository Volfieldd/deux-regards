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
| P1 | **Ouverture** plein cadre : diaporama en fondu des photos choisies dans les réglages (5 premières à défaut), vignettes, glissé sur mobile, bouton pause (WCAG 2.2.2), arrêt si l'animation est réduite. |
| P2 | **Filtre « deux regards »** : les deux, Sébastien ou Julien, avec le nombre de photos de chacun. |
| P3 | **Index des séries** en grand, avec aperçu au survol ; une série vide n'est pas cliquable. |
| P4 | **Grille** en quinconce, numérotation `N°04 · Rue · J`. |
| P5 | Filtres combinables, URL partageables (`/auteur/julien`, `/serie/rue`, `/?regard=…&serie=…`), sans rechargement avec JS, et fonctionnels sans JS. |
| P6 | **Visionneuse** `/photo/<adresse>` : fond noir, précédente et suivante dans le filtre actif, clavier (← → Échap), glissé, légende, lieu et date. |
| P7 | Pages **À propos** (accroche, texte, auteurs), **Droits d'utilisation** (`/droits`) et **404**. |
| P8 | Open Graph et URL canonique absolus ; polices auto-hébergées ; aucune ressource tierce. |

### Administration

| Id | Fonction |
|---|---|
| A1 | **Connexion OIDC** (Zitadel), rôle `admin`, déconnexion côté site et IdP ; connexion locale de test hors production. |
| A2 | **Photos** : import multiple en brouillon, édition validée, publication, ordre (glisser-déposer ou ↑ ↓), recherche et filtres, suppression confirmée. |
| A3 | **Séries** : création, renommage, adresse, ordre, suppression si vide. |
| A4 | **Auteurs** : nom, adresse, bio, lien avec le compte de connexion. |
| A5 | **Réglages** : nom du site, accroche, introduction, à propos, photos de l'ouverture. |
| A6 | **Filigrane et EXIF** : voir [Filigrane et EXIF](Filigrane-et-EXIF). |
| A7 | **Preuves d'antériorité** : empreinte et horodatage de chaque original, téléchargement et vérification de la preuve ; texte et contact de la page des droits. |
| A8 | Messages de confirmation ou d'erreur après chaque action ; toutes les pages sont utilisables sans JS et au clavier. |

### Images

| Id | Règle |
|---|---|
| I1 | Originaux jamais servis ; variantes AVIF et WebP en 640, 1280 et 2000 px, sans agrandissement. |
| I2 | Orientation EXIF appliquée aux pixels et aux dimensions. |
| I3 | Aucune métadonnée par défaut ; mentions IPTC (XMP) dans les modes signés. |
| I5 | Empreinte SHA-256 de chaque original, horodatée RFC 3161 et vérifiable sans le site. |
| I4 | Variantes servies seulement pour les photos publiées, en cache long ; leur nom porte l'empreinte des réglages. |

### Exigences transverses

| Id | Exigence |
|---|---|
| T1 | Sécurité : voir [Sécurité](Sécurité) (sessions, CSRF, CSP, limites d'import, configuration en ligne). |
| T2 | Accessibilité : focus visible, `prefers-reduced-motion`, textes alternatifs, alternatives clavier au glisser-déposer, erreurs de formulaire annoncées. |
| T3 | Sobriété : pas de framework front ni de build, images au format et à la taille adaptés, chargement à la demande. |
