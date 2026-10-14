# Plan et historique de réalisation

Ce document dit **pourquoi** le site est construit ainsi et **dans quel ordre** il l'a été. Pour l'utiliser ou le reprendre, partir du [README](README.md) ; pour le détail fonction par fonction, [Spécifications](docs/wiki/Spécifications.md).

Nicephos, site photo de Sébastien et Julien. Le nom est défini à un seul endroit (`SITE_NAME`, ou Réglages dans l'admin) ; « Deux Regards » était le nom provisoire.

Références de design (artefacts claude.ai) :
- Mix retenu : https://claude.ai/artifact/41G7RSWC6zQQh1gsoXtGRG
- Prototype des 4 directions : https://claude.ai/artifact/WAfffW6sWdDvLWLDPRPAq5
- Maquettes (pages photo, mobile, admin) : https://claude.ai/artifact/WDgwfg3Nn9GYXnaQszKnKc

## Principes

- Front simple : HTML/CSS/JS sans framework ni build, rendu côté serveur, dans l'esprit du prototype.
- Backend unique : tout s'administre après authentification.
- Authentification exclusivement OIDC. Aucun mot de passe stocké ni géré par l'application.
- Les originaux ne sont jamais exposés : seules des variantes redimensionnées, sans EXIF, sont servies.

## Stack

| Rôle | Choix |
|---|---|
| Serveur | Node.js LTS + Fastify |
| Données | SQLite (`better-sqlite3`), migrations SQL versionnées |
| Images | `sharp` (resize, AVIF/WebP, suppression EXIF) |
| QR des cartes de rencontre | `qrcode` (SVG, sans dépendance native) |
| Texte en tracés (QR des vêtements) | `opentype.js` (lit les polices WOFF du site) |
| E-mails (facultatif) | `nodemailer` (SMTP de votre boîte) |
| Gabarits | Eta |
| Auth | `openid-client` (Authorization Code + PKCE) |
| Identité | Zitadel Cloud, Google en IdP externe dans Zitadel |
| Déploiement | image Docker publiée sur `ghcr.io/volfieldd/deux-regards` à chaque fusion sur `main`, hébergée sur Unraid, exposée par Cloudflare Tunnel ; sauvegarde quotidienne de `STORAGE_DIR` |

## Authentification OIDC

Flux : `/auth/login` → Zitadel (connexion locale ou « Continuer avec Google ») → `/auth/callback` → session.

- Client OIDC de type « Web », Authorization Code + PKCE, `state` et `nonce` vérifiés.
- Scopes : `openid profile email` + `urn:zitadel:iam:org:project:id:{projectId}:aud` pour recevoir les rôles.
- Autorisation : rôle de projet Zitadel `admin`, lu dans le claim `urn:zitadel:iam:org:project:roles`. Sans ce rôle : 403, même authentifié.
- Repli sans Zitadel (Google en direct) : même code, autorisation par liste blanche de `sub` avec `email_verified` à vrai.
- Session côté serveur (table `sessions`), cookie `httpOnly` + `Secure` + `SameSite=Lax`, ID régénéré à la connexion, expiration glissante.
- CSRF : jeton synchronisé sur toutes les routes d'écriture de l'admin.
- Déconnexion : suppression de la session + RP-initiated logout (`end_session_endpoint`).
- Config par variables d'environnement : `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID`, `OIDC_ORG_ID`, `OIDC_REDIRECT_URI`, `OIDC_ADMIN_ROLE`, `OIDC_ALLOWED_SUBS` (repli).
- La double authentification et la politique de connexion se règlent dans Zitadel, pas dans l'application.

## Modèle de données

Schéma dans `server/db/migrations/` (fichiers `NNN_*.sql` appliqués dans l'ordre, jamais modifiés après coup).

| Table | Contenu |
|---|---|
| `authors` | nom, adresse (slug), bio, `oidc_sub` (lien avec le compte) |
| `categories` | séries : nom, adresse, ordre |
| `photos` | titre, adresse, série, auteur, lieu, date, légende, statut (brouillon / publiée), ordre, original, dimensions, nom du fichier d'origine, empreinte SHA-256, clé de variantes, exclusion du filigrane, date de première publication, ville (nom, pays, centre ; origine GPS ou manuelle), présence sur la carte |
| `settings` | réglages clé → JSON : textes, droits (FR, EN, DE), ouverture, thème, filigrane et EXIF, Instagram |
| `sessions` | empreinte du jeton, `sub`, nom, rôles, CSRF, expirations |
| `timestamps` | preuves d'antériorité RFC 3161 |
| `stats_days`, `stats_pages`, `stats_photos`, `stats_sources` | statistiques anonymes agrégées par jour |
| `instagram_account`, `instagram_posts` | compte connecté (jeton chiffré), file et historique des publications |

## Arborescence

```
server/            serveur Fastify
  app.js           assemblage : plugins, CSP et en-têtes, rendu Eta, fichiers statiques
  config.js        variables d'environnement (voir docs/wiki/Configuration.md)
  routes/          public.js (site), admin.js (admin), media.js (images), brand.js (emblème, favicon)
  auth.js, oidc.js, sessions.js, ratelimit.js   connexion OIDC, sessions, CSRF, limites
  repo.js, admin-repo.js                         accès aux données (lecture publique, admin)
  images.js, media.js, variants.js, watermark.js import, variantes, filigrane, EXIF
  proofs.js, timestamp.js                        preuves d'antériorité
  stats.js, charts.js                            statistiques anonymes
  instagram.js                                   publication sur Instagram
  rights.js                                      textes de la page Droits d'utilisation (FR, EN, DE)
  themes.js, brand.js, help.js                   thèmes, identité, aide intégrée
  db/              migrations SQL, seed de démonstration, CLI (migrate, seed, variants)
views/             gabarits Eta du site ; views/admin/ pour l'admin
public/            CSS et JS du site (css/, js/), de l'admin (admin/), thèmes (themes/)
assets/            polices, certificats de l'autorité d'horodatage
seed/              12 photos et données de démonstration
docs/              aide intégrée (aide/), sources du wiki (wiki/), spécifications, audits
e2e/               tests navigateur (Playwright, conteneur officiel)
test/              tests node:test
deploy/unraid/     paquet de déploiement Unraid
storage/           données (hors Git) : base SQLite, originals/ (jamais servi), variants/
```

## Phases

### 0. Socle (fait)
- Projet Node, Fastify, SQLite, migrations, scripts `dev` / `start` / `test`.
- Seed avec les 12 photos et les données du prototype.
- Fichier `.env.example`, `.gitignore` (dont `storage/` et la base).

### 1. Front public, d'après le mix (fait)
- Ouverture plein cadre avec fondu et vignettes (photos choisies dans les réglages).
- Filtre « deux regards » : les deux / Sébastien / Julien.
- Index des séries en grand avec aperçu au survol.
- Grille en quinconce, numérotation `N°04 · Rue · J`.
- Page photo `/photo/:slug` : visionneuse noire, précédente/suivante, clavier, swipe, légende.
- Pages `/serie/:slug`, `/auteur/:slug`, `/a-propos`.
- Le site reste lisible sans JS ; le JS ajoute le fondu, le swipe et le filtre sans rechargement.
- Polices auto-hébergées (@fontsource), CSP stricte sans ressource tierce.

### 2. Images (fait)
- Import : original vers `storage/originals/`, variantes générées, EXIF supprimé, rotation EXIF appliquée avant suppression.
- `srcset` + `sizes`, lazy-loading, dimensions explicites (pas de saut de mise en page).
- Dissuasion : clic droit et glisser désactivés sur les images, en-tête `Cache-Control` long sur les variantes.

### 3. Auth OIDC (fait)
- Routes `/auth/login`, `/auth/callback`, `/auth/logout` (POST + CSRF), préhandlers `requireAdmin` et `verifyCsrf`.
- Transaction (state, nonce, PKCE) dans un cookie signé de 10 min ; `next` limité aux chemins locaux.
- Rôles lus dans l'ID token, complétés par userinfo si Zitadel ne les y met pas.
- Session : jeton aléatoire dans le cookie (`__Host-` en HTTPS), seule son empreinte SHA-256 en base ; 8 h glissantes, 24 h au plus (un rôle retiré cesse de valoir le lendemain au plus tard).
- Rôle accepté seulement s'il vient de l'organisation `OIDC_ORG_ID` ; `next` normalisé par l'analyseur d'URL (pas de redirection ouverte) ; 30 passages par `/auth/*` et par IP sur 10 min ; code et state masqués dans les journaux.
- `/admin` minimal (identité + déconnexion) en attendant la phase 4.
- Tests de bout en bout contre un faux fournisseur OIDC : rôle absent → 403 sans session, `state` invalide → refus, code rejoué, session expirée → redirection, régénération, déconnexion.

### 4. Admin (fait)
- Photos : import multiple (glisser-déposer ou sélecteur), en brouillon ; édition avec validation ; publier / dépublier ; réordonnancement par glisser-déposer, avec boutons ↑ ↓ en alternative clavier et sans JS ; recherche et filtres ; suppression confirmée dans la page (original, variantes et entrée de l'ouverture).
- Séries : création, renommage, adresse, ordre, suppression bloquée tant qu'elles contiennent des photos.
- Auteurs : nom, adresse, bio, lien avec le compte OIDC (`sub` affiché sur le tableau de bord) ; l'auteur lié est proposé par défaut à l'import.
- Réglages : nom du site (repli sur `SITE_NAME`), accroche, introduction, à propos, photos de l'ouverture (publiées seulement).
- Import : 60 Mo (90 Mo depuis la phase 11) et 120 mégapixels au plus par fichier, 50 fichiers par envoi, format vérifié par décodage (JPEG, PNG, WebP, TIFF, HEIF), jeton CSRF exigé avant le premier fichier, orientation EXIF appliquée aux dimensions.
- Variantes : `/media/` ne sert que les photos publiées ; aperçu des brouillons sous `/admin/media/` (session admin).
- Connexion locale de test (`LOCAL_AUTH_TOKEN`), interdite en ligne.
- Tests navigateur (`e2e/`, conteneur Playwright) : rendu bureau et mobile, filtres, visionneuse, sans JS, admin et parcours complet d'une photo.

### 4 ter. Filigrane et métadonnées (fait)
- Filigrane texte (variables {auteur}, {annee}, {site}, {titre}, polices du site) ou logo, 9 positions ou mosaïque, opacité, taille, marge, tailles concernées ; exclusion par photo ; aperçu sans enregistrer.
- EXIF des images servies : aucune (défaut), droits, prise de vue (sans GPS), tout l'original.
- Empreinte des réglages dans le nom des variantes : cache long sans image périmée, bascule sans image cassée ; recalcul en arrière-plan avec progression.
- Spécification : [docs/specs/filigrane-et-exif.md](docs/specs/filigrane-et-exif.md). Wiki : [docs/wiki/](docs/wiki/).

### 4 quater. Preuves d'antériorité et droits (fait)
- Empreinte SHA-256 de chaque original, horodatée RFC 3161 (FreeTSA par défaut, autorité qualifiée eIDAS possible), reprise automatique ; téléchargement et vérification de la preuve, vérifiable avec OpenSSL sans le site.
- Mentions IPTC (XMP) dans les modes EXIF signés ; page publique `/droits`.
- Spécification : [docs/specs/preuves-et-droits.md](docs/specs/preuves-et-droits.md).

### 5. Mise en ligne (fait)
- Image Docker en deux étapes, conteneur en lecture seule, utilisateur sans droits ; exposition par Cloudflare Tunnel (`cloudflared`), sans Caddy.
- Données dans un dossier de l'hôte monté explicitement ; refus de démarrer sans montage ; `down -v` sans effet.
- Sauvegarde quotidienne (instantané SQLite contrôlé, originaux supprimés effacés des sauvegardes après 90 jours), restauration documentée.
- `sitemap.xml`, `robots.txt` ; Open Graph et passe d'accessibilité faits plus tôt.
- Guide : [docs/wiki/Déploiement.md](docs/wiki/Déploiement.md).

### 6. Apparence et identité (fait)
- Thèmes déclarés dans `server/themes.js`, feuilles de variables dans `public/themes/` ; Atelier (d'origine), Nicephos nuit et jour (d'après le logo).
- Admin → Apparence : choix du thème, aperçu réservé aux admins, emblème (masque coloré par le thème, favicon générée), sous-titre.
- Guide : [docs/wiki/Apparence-et-thèmes.md](docs/wiki/Apparence-et-thèmes.md).

### 7. Ergonomie de l'admin (fait)
- Audit d'ergonomie (PR #12, [docs/audit-ergonomie-2026-10/](docs/audit-ergonomie-2026-10/README.md)), puis import suivi photo par photo, lot complété sur une page, sélection multiple, séries en cartes (#13), envoi dès le choix des fichiers, date de l'appareil (#14).
- Refonte « Chambre noire » de l'admin : maquettes (#17, [docs/design-2026-10/](docs/design-2026-10/README.md)), police Jost, modes sombre et clair, photothèque avec inspecteur (#18).

### 8. Statistiques anonymes (fait)
- Pages et photos vues, visiteurs par jour, sites d'origine ; sans cookie, sans IP conservée, Do Not Track et GPC respectés, effacement à 25 mois (#19). Mention publique sur `/droits`.

### 9. Publication sur Instagram (fait)
- API officielle « Instagram API with Instagram Login » : file d'attente, créneaux horaires, modèles de légende, cadre et filigrane par photo, jeton chiffré (#20).
- Mise en file automatique **par série**, aucune par défaut (#21).

### 10. Admin sur iPhone, finitions (fait)
- Audit sur iPhone ([docs/audit-iphone-2026-10/](docs/audit-iphone-2026-10/README.md)) ; lot en cartes sur téléphone, « Ouvrir la fiche », cibles de 44 px, projet e2e `iphone` en WebKit (#22).
- Vignettes de l'ouverture en cadre 3:2, photo entière ; nom long dans la barre latérale (#23).
- Droits d'utilisation en français, anglais et allemand (`/droits`, `/en/droits`, `/de/droits`), textes par défaut affichés et rétablissables dans Réglages (#24).
- Site public : retour à la série à l'endroit quitté depuis une photo (#25).

### 11. Vitesse de l'import (fait)
- Mesure : une photo de 24 Mpx mettait ~6,5 s à calculer (original décodé six fois, sharp sur un seul thread sous glibc, une photo à la fois).
- Décodage unique de l'original puis variantes dérivées et encodées en parallèle ; `IMAGE_THREADS` (4) et jemalloc dans l'image ; `IMPORT_CONCURRENCY` (2 photos à la fois) : 1,5 s par photo, ×7 sur un lot.
- Envoi : 3 photos à la fois au plus et 100 Mo en cours d'envoi au plus ; 90 Mo par fichier (une requête par photo, sous le plafond de 100 Mo par requête de Cloudflare).

### 12. Galerie par ordre de publication (fait)
- Sélecteur « Ordre : Sélection · Plus récentes » au-dessus de la grille, cumulable avec les filtres, suivi par la visionneuse ; `?ordre=recentes`.
- Colonne `photos.published_at` (migration 009), posée par déclencheurs à la première publication ; photos déjà publiées : date d'import.

### 13. Visionneuse : légendes longues (fait)
- Plus d'ascenseur intérieur : légende repliée à 3 lignes avec « Lire la suite », la page défile ; image ajustée au premier écran ; titres longs coupés à la ligne ; flèches sous le texte sur téléphone.

### 14. Instagram dans les limites de l'API (fait)
- Pas d'offre payante de l'API : budget réglable (Prudent par défaut : 25 publications / 24 h, 60 min d'écart, 100 appels / h ; Limites de Meta ; Personnalisé), quota réel lu avant chaque envoi, pause sans essai consommé quand Meta signale une limite, consommation affichée, « Publier maintenant » refusé hors budget ; vérifications espacées (≈ 6 appels par publication au lieu de 32).
- Journal des appels `instagram_calls` (migration 010), dates et types seulement, 7 jours.

### 15. Statistiques : carte des visiteurs par pays (fait)
- Pays transmis par Cloudflare (`CF-IPCountry`, cru derrière le proxy de confiance seulement), compté par visiteur unique du jour (`stats_countries`, migration 011) ; aucune géolocalisation par le site, aucune IP conservée.
- Mappemonde Natural Earth embarquée (`public/admin/carte-monde.svg`, centres des pays dans `server/pays-centres.json`, générés par `scripts/carte-monde.mjs`), bulles proportionnelles, liste des 10 premiers ; mention publique « Mesure d'audience » complétée (FR/EN/DE).

### 16. Ville des photos, préparation de la carte (fait)
- Liste des villes GeoNames (CC BY 4.0) embarquée (`server/geo/villes.tsv`, `scripts/villes.mjs`) ; recherche au fil de la frappe et ville d'une position GPS (`server/geo/cities.js`).
- Champ Ville (fiche, photothèque), ville proposée d'après le GPS à l'import et pour les photos existantes (`server/geo/locate.js`) ; seule la ville est gardée ; case « Afficher sur la carte » décochée par défaut, actions groupées (migration 012).

### 17. Page publique « Carte » (fait)
- Réglage `map_page` (faux par défaut) : `/carte` en 404 pour les visiteurs tant qu'elle n'est pas publiée, aperçu pour les auteurs connectés ; lien « Carte » dans le menu (FR / EN / DE sur `/droits`) et entrée de `sitemap.xml` une fois publiée ; vue comptée dans les statistiques (`carte`).
- Fond `public/carte-terre.svg` (symboles sans couleur : le thème donne l'encre) et réglages de la projection (`server/geo/projection.json`, appliqués par `server/geo/projection.js`), générés par `scripts/carte-monde.mjs` ; villes placées côté serveur.
- Vignettes rondes dans le SVG (sans JS : carte fixe, liens vers la liste des lieux) ; `site.js` : zoom par le viewBox (× 40 au plus), taille des vignettes constante, regroupement des vignettes qui se chevauchent, pincement, Ctrl + molette, glisser.

### 18. Carte et villes plus précises (fait)
- Villes : toutes les communes de France (ADM4 du fichier FR de GeoNames) et les localités de plus de 500 habitants ailleurs (~250 000 lieux) ; noms français des villes de plus de 30 000 habitants ; classement pondéré par la population ; colonnes compactes et index des débuts de mots (~55 Mo, quelques ms par recherche), liste chargée au démarrage en production.
- Fond de carte en trois niveaux : 1:110m (monde, frontières), 1:50m chargé au premier zoom, tuiles 1:10m (`public/carte-tuiles/`, 157 fichiers) de la zone visible au-delà de × 8 ; zoom jusqu'à × 40 ; fichiers `.br` / `.gz` servis tels quels (`preCompressed`).

### 19. Site en trois langues (fait)
- `server/i18n.js` : textes de l'interface FR / EN / DE, repli des textes des auteurs (`pick`), détection de la langue (pays Cloudflare, `Accept-Language`), adresses préfixées (`/en`, `/de`).
- Pages publiques enregistrées trois fois (préfixe vide, `/en`, `/de`) ; arrivée sur une page française redirigée selon le choix (cookie `langue`, posé par `/langue/:lang`) ou la détection, jamais pour les robots ; `/droits/en` et `/droits/de` redirigées vers `/en/droits`, `/de/droits` ; `hreflang`, `x-default`, `og:locale`, sitemap avec les trois langues.
- Traductions facultatives (migration 013) : photos (titre, légende, lieu), séries, biographies ; réglages `tagline_en`, `intro_de`… ; champs repliés dans l'admin (`views/admin/_tr.eta`) ; sélecteur à drapeaux (`views/langs.eta`, `public/flags/`).

### 20. Propositions de traduction (fait)
- `server/translate.js` : client LibreTranslate (`TRANSLATE_URL`, `TRANSLATE_API_KEY` facultative), délai borné, erreurs expliquées ; `POST /admin/traduction`.
- Bouton « Proposer une traduction » sous chaque champ anglais et allemand (texte français, sinon l'autre traduction), proposition à relire, « Annuler ».
- Conteneur `libretranslate/libretranslate:v1.9.6` dans la pile Unraid (réseau interne, modèles fr / en / de dans un volume) et en profil `traduction` dans `compose.yaml`.

### 21. Likes Instagram dans l'admin (fait)
- Relevé quotidien des likes et commentaires des posts publiés depuis le site (`syncEngagement`, après 6 h à Paris, 1 à 3 appels, dans le budget), historique par jour (migration 014, `instagram_engagement`).
- Fiche photo : chiffres et courbe ; page Instagram : « Les plus aimées sur Instagram », « Relever maintenant » (10 minutes au moins entre deux relevés).

### 22. Rencontres : « je vous ai photographié » (fait)
- Page `/bonjour` (trois langues) : référence de carte (code de contrôle HMAC), ou date et lieu ; recevoir la photo, accord ou refus, message ; anti-abus (limite par adresse, champ piège) ; migration 015 (`encounters`, `encounter_events`, `encounter_photos`, lettre des cartes `authors.card_prefix`).
- Admin « Rencontres » : liste, fiche, photos liées, carte signée (photo gardée dans la base), refus qui bloque la publication et « Appliquer le refus » (brouillon, file Instagram) ; purge à 12 mois.

### 23. Cartes à imprimer et photo offerte (fait)
- Planches A4 (`/admin/rencontres/cartes`) : paires « pour nous » / « pour eux » au format carte de visite, cinq par feuille, d'un seul côté ; numérotées (QR et code de contrôle uniques, numéros réservés dans `settings.cards_printed`) ou génériques (QR vers `/bonjour`, numéro au tampon) ; textes dans `server/cards.js`.
- Photo offerte : lien privé `/pour-vous/<jeton>` (30 jours, révocable, compteurs ; migration 016), page dans la langue de la personne, JPEG 2048 px (jamais l'original, EXIF « usage personnel »), message prêt à envoyer (mailto) dans sa langue.

### 24. QR des vêtements (fait)
- `/bonjour/J` : QR générique d'un photographe (sans numéro), demande attribuée à l'auteur ; la date et le lieu restent demandés.
- Auteurs → « QR pour les vêtements » : compositions vectorielles (`server/textile.js`, texte converti en tracés, logo d'Apparence intégré à la couleur de l'encre) verticale (dos, sac), logo seul (poitrine, casquette), écusson et QR seul, encre noire (textile clair) ou blanche (textile foncé, carré blanc évidé), en SVG ou PNG transparent ; QR en correction H avec sa marge.

### 25. App Rencontre sur le téléphone (fait)
- `/admin/rencontre` : web app installable (manifeste, plein écran) ; position arrondie (Permissions-Policy limitée à cette route), photo de repère, consentement en trois langues, signature au doigt, majorité ou parent ; numéro suivant du photographe (partagé avec les cartes) ; écran « Merci » avec le QR de la page de la personne ; récapitulatif par SMTP (`server/mailer.js`, `SMTP_URL`, `MAIL_FROM`) ou mailto ; migration 017.
- Suite possible : mode hors ligne (enregistrement différé).

### 26. Confidentialité (RGPD), premier volet (fait)
- Page `/confidentialite` en trois langues (`server/privacy.js`) : responsables conjoints, données par traitement, durées, destinataires (Cloudflare, Instagram si accepté, messagerie), cookies, sécurité (deux facteurs et disque chiffré annoncés seulement une fois cochés dans Réglages), droits et CNIL ; liens en pied de page, sur `/bonjour`, dans l'app et sur les cartes (via le QR).
- Durées automatisées : photo de repère 6 mois ; accord ou refus tant qu'une photo liée existe puis 5 ans ; originaux supprimés effacés des sauvegardes après 90 jours (`BACKUP_DELETED_DAYS`, garde-fou si le dossier est vide).
- Suite : export des données d'une personne et effacement complet (photos comprises), chiffrement des champs sensibles, registre des traitements, analyse d'impact, procédure de violation, accord entre responsables conjoints.

### 27. Confidentialité (RGPD), deuxième volet : droits (fait)
- `/bonjour` : « Vos données » (copie ou effacement) ; migration 019 (`rights_request`, `rights_requested_at`, `rights_done_at`, `anonymized`) ; badge avec échéance d'un mois.
- Export ZIP (`server/zip.js`, sans dépendance) ; effacement avec suppression des photos sur demande, refus gardé sans identité, rappel des posts Instagram.

### 28. Confidentialité (RGPD), troisième volet : chiffrement et documents (fait)
- `server/vault.js` : AES-256-GCM, clé `DATA_KEY` (HKDF) ; champs des rencontres (textes, position, historique, images) chiffrés à l'écriture, déchiffrés à la lecture ; données existantes chiffrées au démarrage ; état dans Réglages et sur `/confidentialite`.
- Wiki [RGPD](docs/wiki/RGPD.md) : registre des traitements, accord entre responsables conjoints, analyse d'impact simplifiée, procédure de violation, liste des actions restantes.

### 29. Accord par session, visage sur le nom (fait)
- Un accord couvre les photos de son photographe prises le jour de la session (date EXIF ; `session_day` corrige une horloge décalée), sauf exclusions (`encounter_exclusions`, migration 020) ; fiche d'une photo : « Personnes rencontrées » (même session ou liées) ; un refus reste ciblé sur les photos liées ; durée de conservation de l'accord tant qu'une photo de la session ou liée existe.
- Photo de la personne (visage) : dans l'app ou ajoutée à la fiche, vignette ronde dans la liste, la fiche et la fiche photo ; gardée avec l'accord (sinon 6 mois) ; consentement, page Confidentialité et registre mis à jour.

### 30. Instagram suit les accords (fait)
- Instagram suppose le site : refuser le site, c'est refuser Instagram (formulaires `/bonjour`, app, carte ; anciens accords lus sans Instagram).
- Photo bloquée pour Instagram, sans confirmation possible, si une personne liée ou de la session (non exclue) refuse ou n'a pas accepté Instagram : entrée dans la file refusée, file vidée à chaque changement d'accord et avant chaque créneau, contrôle juste avant l'envoi ; fiche photo « Instagram bloqué » et « Pas sur cette photo ».

### 31. Parcours de l'admin autour de la sortie (maquettes validées le 14 octobre 2026)
1. (fait) Mots (Sortie, Personne, Accord, Carte d'accord, Carte du monde, « Où »), menu en quatre groupes (Travailler, Publier, Sur le terrain, Réglages), page « Sur le terrain » (app, cartes d'accord, QR des vêtements avec logo, une seule composition), états lisibles par un daltonien (forme + mot, palette bleu / jaune / vermillon).
2. « Aujourd'hui » en liste de choses à faire, triée par urgence.
3. Sorties (une par photographe et par jour, découpables par une heure de coupure), détection des visages locale (sans reconnaissance), état par usage « prête / à vérifier / bloquée » ; « à vérifier » demande une confirmation explicite, gardée dans l'historique ; une fiche Personne pour plusieurs rencontres (un accord par sortie, un refus vaut pour tout, rapprochement par e-mail confirmé à la main).
4. Fiche photo en rubriques, accueil « Terrain » sur le téléphone (nouvelle rencontre, montrer mon QR, ma sortie du jour).

## Côté Zitadel (à faire une fois)

1. Créer une organisation et un projet « site photo » avec un rôle `admin`.
2. Créer une application OIDC « Web », méthode d'authentification « Code » (client_secret_basic ; l'application envoie aussi PKCE), redirect `https://<domaine>/auth/callback` (et `http://localhost:3000/auth/callback` en dev), post-logout redirect vers le site.
3. Ajouter Google comme IdP externe (client OAuth Google à créer dans Google Cloud).
4. Donner le rôle `admin` à Sébastien et Julien ; désactiver l'inscription libre.
5. Reporter l'ID de l'organisation dans `OIDC_ORG_ID`.
6. Une fois le domaine choisi : ajouter `includeSubDomains` à HSTS si tous les sous-domaines sont en HTTPS.

## Feuille de route

Fait côté nom et domaine : **Nicephos**, en ligne sur `https://www.nicephos.art` (toutes les autres adresses y sont redirigées par Cloudflare, voir [Déploiement](docs/wiki/Déploiement.md)).

À faire, par ordre de priorité :
1. Essai de l'admin sur un vrai iPhone (clavier ouvert, barres de Safari), après le déploiement de #22.
2. Audit iPhone, lots restants : mode « Sélectionner » dans la photothèque (4), page Séries au toucher (5), fiche photo raccourcie avec « Enregistrer » collant (6).
3. Test e2e `statistiques` : le rendre indépendant des visites faites en parallèle par les autres projets (il passe seul).
4. HSTS : ajouter `includeSubDomains` si tous les sous-domaines restent en HTTPS.
5. `compose.yaml` générique : avec `TRUST_PROXY` par défaut (adresses privées) et le port ouvert sur le réseau local, un poste du réseau peut fausser `X-Forwarded-For` ; fixer `TRUST_PROXY` à l'adresse du tunnel comme sur Unraid (documenté dans Déploiement).
6. Petites incohérences relevées lors de la relecture de l'aide (octobre 2026) :
   - fiche photo : l'indication du champ Date (« AAAA-MM ou AAAA-MM-JJ ») ne dit pas que « oct. 2026 » ou « 10/2026 » sont aussi compris ;
   - Instagram : jeton expiré mais lisible, la page affiche « Connecté » sans bouton pour se reconnecter directement ;
   - Instagram : un seul libellé pour le lien vers le post (« voir le post ↗ » sur la fiche, « Voir sur Instagram ↗ » dans l'historique) ;
   - photothèque : deux liens d'aide (« Aide sur cette page » et « Aide »).

Écarté pour l'instant : suggestions de titres et légendes par IA (contrainte de coût nul ; l'offre gratuite de Gemini exige le payant pour des utilisateurs dans l'EEE ; piste possible : modèle local via Ollama).
