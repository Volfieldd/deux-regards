# Grille RGESN 2024 — Nicephos (www.nicephos.art et administration)

Audit d’écoconception du 16 octobre 2026, par Camille Arnaud (référente écoconception). Référentiel : RGESN 2024
(Arcep/Arcom, 78 critères, 9 familles). Code audité : `dr-work/ux` (commit 4042eaa) ; écarts avec `main` (c88632d)
signalés quand ils changent un statut.

## Sources

- Sondes RGESN de la collecte du 15/10 (`rgesn/RESUME.md`, `rgesn/<jeu>--<page>.json`) : 68 pages, démo locale et
  production. **Démo** (`127.0.0.1:3091`, Node seul) : ni compression ni HTTP/2, images de synthèse légères : ses
  échecs 6.3 et 6.7 ne disent rien du code, ses poids ne sont pas comparables. **Production** (Cloudflare, thème
  « Nicephos — nuit ») : seule référence pour les poids, la compression, le protocole et le cache.
- Mesures complémentaires (16/10) : `rgesn/mesures-camille/mesures.json` (démo : accueil sans JavaScript, page photo
  et accueil à 512 kbit/s ; script `outils/camille-rgesn.mjs`) et `rgesn/mesures-camille/serveur.json` (coût
  processeur des traitements d’une photo, des modèles d’IA, du contrôle de santé ; scripts
  `outils/camille-ml-mesure.mjs`, `outils/camille-petites-variantes.mjs`).
- Production, en simple visiteur : 1 page (`/mentions-legales`, en-têtes) et 3 requêtes HEAD (cache Cloudflare d’une
  photo et de la feuille de style, redirection HTTP), plus DNS et poignée de main TLS. Aucune autre page chargée.
- Lecture du code, de `Dockerfile`, `compose.yaml`, `deploy/unraid/compose.yaml`, de la documentation (`docs/`).

## Règles de statut

- **S — satisfait** : la mise en œuvre est prouvée par une mesure ou par le code (fichier:ligne). Plusieurs contrôles
  officiels demandent en plus une mention dans la *déclaration d’écoconception* : elle n’existe pas encore ; je le
  signale « (à déclarer) » sans retirer le statut, et j’en fais un constat à part (gouvernance).
- **NS — non satisfait** : défaut mesuré ou constaté, ou absence du document qui *est* l’objet du critère
  (stratégie, objectifs, référent…). Chaque NS est repris dans un constat.
- **NA — non applicable** : l’objet du critère n’existe pas (pas de vidéo, pas d’entraînement…).
- **NE — non évalué** : il faut des éléments que je n’ai pas (matériel, contrat d’électricité, test sur un vieux
  terminal). Jamais deviné.

Aucun score, aucun taux, aucune déclaration d’écoconception : ce document est une grille d’audit.

## Bilan par statut (décompte, pas un score)

| Famille | S | NS | NA | NE |
|---|---|---|---|---|
| 1 Stratégie | 3 | 6 | 1 | 0 |
| 2 Spécifications | 1 | 6 | 1 | 2 |
| 3 Architecture | 3 | 2 | 1 | 1 |
| 4 UX/UI | 9 | 6 | 0 | 0 |
| 5 Contenus | 4 | 0 | 4 | 0 |
| 6 Frontend | 3 | 4 | 0 | 0 |
| 7 Backend | 3 | 0 | 1 | 0 |
| 8 Hébergement | 2 | 2 | 0 | 6 |
| 9 Algorithmie | 3 | 0 | 4 | 0 |
| **Total (78)** | **31** | **26** | **12** | **9** |

Renvois « C1… C18 » : constats du rapport (même numérotation que la liste des constats rendue).

## 1. Stratégie

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 1.1 | Utilité évaluée au regard des impacts | Prioritaire | NS | Aucune étude d’utilité ni d’impact (dépôt, `docs/`, wiki, site). C11. |
| 1.2 | Cibles, besoins et attentes définis | Prioritaire | NS (partiel) | Admin : persona « Auteur » et 5 parcours (`docs/audit-ergonomie-2026-10/README.md:46-141`). Site public : cibles (visiteurs, personnes photographiées, futurs acheteurs de tirages) non décrites. C11. |
| 1.3 | Référent écoconception identifié | Recommandé | NS | Aucun référent nommé. C11. |
| 1.4 | Revues régulières de la démarche | Prioritaire | NS | Audits d’octobre (ergonomie, iPhone, design, revue de code) sans volet RGESN ; la présente grille peut servir de première revue datée. C11. |
| 1.5 | Objectifs de réduction fixés | Prioritaire | NS | Ni empreinte évaluée ni objectif chiffré. C10, C11. |
| 1.6 | Collecte de données raisonnée | Recommandé | S | Audience sans cookie ni IP, compteurs journaliers effacés à 25 mois (`server/stats.js:4-11`, `:66-76`) ; préchargements non comptés (`:83`) ; IP tronquée dans les journaux (`server/app.js:75-90`) ; champs facultatifs des signalements chiffrés et effacés à 12 mois (`server/feedback.js:7-10`). |
| 1.7 | Chiffrement proportionné | Modéré | S (à déclarer) | TLS 1.3 (`TLS_AES_256_GCM_SHA384`, mesuré le 16/10) ; chiffrement applicatif limité aux données personnelles (`DATA_KEY`, `deploy/unraid/README.md:207`) ; antériorité par horodatage RFC 3161, pas de chaîne de blocs. |
| 1.8 | Efforts d’open source | Recommandé | NS | Dépôt public (`gh repo view` : PUBLIC) mais **sans licence** : ni open source au sens juridique, ni justification. C11. |
| 1.9 | Technologies standard interopérables | Prioritaire | S | HTML rendu serveur, CSS et JS sans framework, site public utilisable sans JavaScript, AVIF + repli WebP, SVG. Liste des terminaux à écrire (2.1). |
| 1.10 | API ouvertes pour le matériel | Recommandé | NA | Aucun matériel piloté ; position et appareil photo passent par les API standard du navigateur. |

## 2. Spécifications

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 2.1 | Profils de matériel définis | Prioritaire | NS | Aucun profil minimal (site, admin, app de terrain). C11. |
| 2.2 | Utilisable sur terminaux anciens | Prioritaire | NE | Pas de test sur un portable à processeur de 2016 ni sur un téléphone de 2019. Présomption favorable : site public sans JS possible, 30 ko de JS (11 ko compressés), 43 ko de CSS, 200 à 700 nœuds DOM. À tester (ex. iPhone 7 sous iOS 15). |
| 2.3 | Utilisable en bas débit | Recommandé | S | Démo à 512 kbit/s / 100 ms, cache vide (`mesures-camille/mesures.json`) : accueil 1er affichage 3,0 s ; page photo 1er affichage 3,7 s, navigation et textes utilisables. Réserve : la photo n’arrive qu’à 7,0 s, concurrencée par le fond de carte (C3) ; débit minimal à déclarer. |
| 2.4 | Anciens OS et navigateurs | Prioritaire | NE | Pas de test sur des navigateurs de 2 ans. Favorable : repli WebP (Safari 15 sans AVIF), amélioration progressive. À vérifier : `<dialog>`, `mask-image`, `aspect-ratio`. |
| 2.5 | Adapté aux types d’écrans | Prioritaire | NS | Mise en page adaptée en 1440 et 412 px, mais sur téléphone la liste des langues sort de l’écran de 105 px (`/`, `/a-propos`) : `public/css/site.css:93` (`.lang-pick ul { right: 0 }`), `INDEX.md` observation 1. C16. |
| 2.6 | Empreinte dans la conception et la revue de code | Recommandé | NS | Exigence T3 « Sobriété » (`docs/specs/README.md:106`) mais aucune revue de conception ou de code orientée empreinte. C11. |
| 2.7 | Stratégie de maintenance et de décommissionnement | Prioritaire | NS | Rien d’écrit. Bon point à reprendre : les modèles d’IA s’éteignent en effaçant fichiers et empreintes (`server/series-suggest.js:157-165`, `server/describe.js` `remove()`). C11. |
| 2.8 | Démarche imposée aux fournisseurs | Prioritaire | NS | Cloudflare, Meta (Instagram), Zitadel, GitHub, Hugging Face, messagerie : aucun critère environnemental documenté. C11. |
| 2.9 | Composants d’interface prêts à l’emploi | Modéré | NA | Aucun : CSS et JS maison (`docs/specs/README.md:106`). |
| 2.10 | Services tiers choisis selon leurs impacts | Prioritaire | NS | Non évalués (1.4/1.5 des tiers) ; Instagram, réseau social, ne valide pas 4.1 ; Cloudflare injecte un script dans les pages (C12). C11. |

## 3. Architecture

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 3.1 | Architecture et composants sobres | Prioritaire | S (à déclarer) | Node/Fastify, SQLite, gabarits serveur, pas de framework front ni de build ; IA locale désactivée par défaut, modèles quantifiés. Réserve corrigée dans `main` (f8fd6d7) : à 4042eaa, Florence-2 « Précis » (large) était le défaut (`server/describe.js:16`), soit ×3,2 de processeur et ×2,2 de mémoire par photo par rapport à « Léger » (`serveur.json`). |
| 3.2 | Ressources adaptées à l’usage réel | Recommandé | NS | Contrôle de santé Docker toutes les 30 s = un processus Node complet (0,16 s CPU, 57 Mo) 2 880 fois par jour (`Dockerfile:47-48`) ; LibreTranslate permanent (`mem_limit: 2g`) pour un usage ponctuel (`deploy/unraid/compose.yaml`, service `libretranslate`) ; session CLIP jamais libérée (`server/series-suggest.js:71`). Bon : Florence-2 déchargé 2 min après usage. C9. |
| 3.3 | Évolutif avec les protocoles | Modéré | S | Mesuré le 16/10 : HTTP → HTTPS (301), TLS 1.3, IPv6 (AAAA `2a06:98c1:3120::2`), HTTP/2 et HTTP/3 (`alt-svc: h3`). |
| 3.4 | Mises à jour de sécurité sur la durée de vie | Prioritaire | NS | Durée de maintenance non déclarée ; versions figées sans veille automatique (pas de Dependabot/Renovate dans `.github/`) ; Node 22 hors support fin avril 2027, migration non planifiée. C11. |
| 3.5 | Correctifs indépendants des évolutions | Modéré | NA | Service web : rien à installer chez le visiteur. |
| 3.6 | Mises à jour incrémentielles | Modéré | S | Fichiers statiques nommés par empreinte (`server/app.js:91-100`) et cache d’un an : seul un fichier modifié est re-téléchargé ; image Docker en couches (dépendances séparées du code, cache GitHub Actions). |
| 3.7 | Environnements de dev, préprod, test optimisés | Modéré | NE | Serveur de test, instances de démonstration, CI à la demande avec cache de couches ; plages d’allumage du serveur de test inconnues. |

## 4. Expérience et interface utilisateur

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 4.1 | Pas de lecture automatique non contrôlée | Prioritaire | S | Ni vidéo ni son. Diaporama d’ouverture automatique (6 s) mais contrôlable : bouton « Pause » visible, arrêt au survol, au focus, onglet caché, et aucun défilement si le mouvement est réduit (`public/js/site.js:47-79`). Réserve : il précharge toutes les diapositives (C1). |
| 4.2 | Pas de défilement infini | Prioritaire | S | Sonde : hauteur stable ; grille finie à images différées. À surveiller : photothèque de l’admin sans pagination (`server/routes/admin.js:301-345`). |
| 4.3 | Parcours optimisés et suivis | Recommandé | NS | Parcours de l’admin travaillés (audits d’octobre), statistiques de pages ; aucun indicateur technique par parcours. C10. |
| 4.4 | Services tiers au choix de l’utilisateur | Recommandé | S | Aucun service tiers côté navigateur (CSP `'self'`, sonde : aucun hôte tiers) ; partages = simples liens. |
| 4.5 | Composants natifs | Modéré | S | `<dialog>`, `<details>`, formulaires, `<picture>`, SVG. |
| 4.6 | Animations limitées aux contenus porteurs d’information | Recommandé | NS (partiel) | Zoom lent décoratif des photos d’ouverture (`scale(1.04)` → 1 en 7 s, `public/css/site.css:76-77`) et apparition animée des vignettes (`:175`, `:182`) ; coupés si mouvement réduit (`:322-323`). C1. |
| 4.7 | Option la plus légère entre texte, image, son, vidéo | Modéré | S | Ni vidéo ni son ; cartes en SVG ; textes en HTML. |
| 4.8 | Polices téléchargées limitées | Modéré | S | Condition « ≤ 400 ko » : 57 ko (production, 4 fichiers) à 118 ko (démo, 7 fichiers) par page ; 3 familles, 9 `@font-face` (`public/css/site.css:5-13`). Réserve : Cormorant italique préchargée mais inutilisée en production (C7). |
| 4.9 | Requêtes limitées pendant la saisie | Modéré | NS | Champ Ville de l’admin : requête dès 2 caractères après 150 ms (`public/admin/admin.js:1162-1170`) ; RGESN : ≥ 3 caractères, ≥ 500 ms, désactivable. Bon : palette ⌘K sur index chargé une fois (`:1728`). C13. |
| 4.10 | Format de saisie annoncé, contrôle côté client | Modéré | NS | Formats annoncés (code de carte, `type=email`, `type=date`) mais `novalidate` sans contrôle côté client (`views/bonjour.eta:24`, `views/report.eta:17`, `views/admin/photo.eta:39`) : chaque erreur = un aller-retour. C13. |
| 4.11 | Formats et poids annoncés avant transfert | Modéré | NS (partiel) | Envoi : formats, 90 Mo, 120 Mpx annoncés (`views/admin/_import.eta:30`). Téléchargement : bouton « Original » sans poids ni format (`views/admin/photo.eta:349`), jusqu’à 90 Mo (`server/media.js:12`). C13. |
| 4.12 | Fonctions à fort impact signalées | Recommandé | S | Poids des modèles et mémoire nécessaire affichés avant activation (`views/admin/series.eta:90`, `:117`), recalcul des images annoncé (`views/admin/images.eta:4`). |
| 4.13 | Notifications limitées et désactivables | Prioritaire | S | Pas de notification poussée ; récapitulatif e-mail réglable (jamais, quotidien, hebdomadaire ; au plus un par jour, seulement s’il y a quelque chose) ; relances RGPD légales (`server/reminders.js:4-11`). |
| 4.14 | Pas de procédé manipulatoire | Recommandé | S | Aucun relevé (pas de bandeau, pas d’urgence artificielle ; refus aussi simple que l’accord sur `/bonjour`). |
| 4.15 | Contrôle de l’utilisateur sur ses impacts | Recommandé | NS | Ni information sur l’empreinte ni mode sobre (`Save-Data`, `prefers-reduced-data` ignorés). C14. |

## 5. Contenus

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 5.1 | Format d’image adapté | Recommandé | S | Photos en AVIF avec repli WebP (`server/picture.js`) ; 96 à 100 % des images matricielles des pages de galerie (sondes). Réserve : sur les pages sans photo, les seules images sont les PNG de marque (C6). |
| 5.2 | Compression adaptée | Recommandé | S (à déclarer) | AVIF qualité 55, effort 4 ; WebP 78 (`server/images.js:149`, wiki `Images-et-variantes.md:24`) ; 0,38 bit/pixel sur une 2000 px réelle (125 ko). Les « REVUE » de la sonde (44 à 91 bits/pixel) sont des fichiers de 640 px affichés en 64 px : défaut de dimensions (6.4), pas de compression. Effort 4 justifié : −21 % d’octets face à l’effort 2 pour 14 s de calcul une fois par photo (`serveur.json`). |
| 5.3 | Définition vidéo adaptée | Prioritaire | NA | Aucune vidéo. |
| 5.4 | Compression vidéo adaptée | Prioritaire | NA | Aucune vidéo. |
| 5.5 | Mode « écoute seule » | Prioritaire | NA | Aucune vidéo. |
| 5.6 | Compression audio adaptée | Modéré | NA | Aucun son. |
| 5.7 | Format de document adapté | Modéré | S | Export ZIP des données d’une personne (JSON et JPEG déjà compressés, `server/zip.js`), preuves texte de quelques ko, photo offerte en JPEG 2048 px (format universel pour le destinataire). |
| 5.8 | Archivage et suppression des contenus obsolètes | Recommandé | S | Variantes orphelines et logos remplacés balayés (`server/variants.js` `sweep`), anciennes variantes effacées à chaque changement de réglage, modèles effacés à l’extinction, fichiers supprimés gardés 90 j en sauvegarde (`server/db/backup.js:9-12`). |

## 6. Frontend

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 6.1 | Poids et requêtes maximum par écran | Recommandé | NS | Aucun budget. Production à froid : accueil 1 953 ko / 44 req., carte 2 522 ko / 67 req., séries 1 286 à 1 567 ko, photographes 1 493 à 1 735 ko ; admin démo : photothèque 41 req. C10. |
| 6.2 | Cache pour tous les contenus maîtrisés | Recommandé | NS | Public : statiques et photos en cache d’un an immuable, et cache Cloudflare (`cf-cache-status: HIT`, mesuré) ; HTML sans validateur (ni ETag ni Last-Modified). Admin : `/admin/media` en `no-store` (`server/routes/media.js:31`) : 31 images re-téléchargées à chaque rechargement de la photothèque (300 ko en démo), vignettes de séries à chaque page. C8. |
| 6.3 | Compression des ressources | Modéré | S (production) | Production : zstd/brotli par Cloudflare sur HTML, CSS, JS, SVG ; `.br`/`.gz` précalculés des fonds de carte (`server/app.js:143-147`). Démo sans compression : environnement. |
| 6.4 | Dimensions d’image adaptées | Recommandé | NS | Aucune variante sous 640 px (`server/images.js:9`) : bandeau 64 px, épingles de la carte ≈ 34 px, carte de partage 92 px, barre latérale admin 18 px ; visionneuse en `sizes="100vw"` alors que l’image est limitée à 70 % de la hauteur (`views/photo.eta:9`) ; emblème PNG 1 600 px pour 44 px (`server/brand.js:56`) ; portraits recadrés dans l’ouverture. C1 à C6, C8. |
| 6.5 | Pas de ressource inutilisée | Recommandé | NS | Diapositives cachées (820 ko sur bureau, 417 ko sur mobile, téléchargées même sans JS) ; épingles regroupées de la carte (15 vignettes invisibles sur 19) ; fond de carte 1:50m (230 ko) en plus des tuiles sur chaque page photo ; police préchargée inutilisée (23,6 ko) ; script Cloudflare. C1, C2, C3, C7, C12. |
| 6.6 | Capteurs au strict nécessaire | Modéré | S | Position demandée une fois, précision réduite, refus géré (`public/admin/app.js:21-33`) ; appareil photo au geste (`capture`) ; `Permissions-Policy` ferme caméra, micro et position ailleurs (`server/app.js:60-65`, `:266`). |
| 6.7 | Ressources statiques sur un même domaine | Modéré | S (production) | Tout sur `www.nicephos.art`, HTTP/2 et HTTP/3 (sondes : aucun hôte hors HTTP/2, un seul hôte statique). |

## 7. Backend

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 7.1 | Cache serveur des données les plus utilisées | Recommandé | S (à déclarer) | Cloudflare garde `/media` et `/static` (`HIT`, `age` 330 583 s mesuré) ; gabarits compilés en mémoire en production (`server/app.js:121`) ; requêtes SQLite préparées ; villes en mémoire. HTML non mis en cache (`Vary: Cookie, Accept-Language, CF-IPCountry`) : contenu dynamique (j’aime, langue). |
| 7.2 | Durées de conservation appliquées | Recommandé | S | Purge quotidienne (`server/app.js:184-196`) : statistiques 25 mois, rencontres sans réponse 12 mois, signalements 12 mois, journal 13 mois (`server/accounts.js:143-155`), liens offerts 30 j ; sauvegardes : 14 instantanés, fichiers supprimés 90 j ; journaux Docker 3 × 10 Mo. |
| 7.3 | Traitement en arrière-plan signalé | Modéré | S | Import suivi photo par photo, téléchargement et analyse des modèles avec barre de progression, description demandée suivie, publication Instagram suivie, boutons désactivés (`public/admin/admin.js:1795-1810`). |
| 7.4 | Consensus minimal (chaîne de blocs) | Prioritaire | NA | Pas de chaîne de blocs : horodatage RFC 3161 (`server/timestamp.js`), le choix sobre. |

## 8. Hébergement

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 8.1 | Hébergeur engagé dans la réduction de son empreinte | Prioritaire | NE | Auto-hébergé (serveur Unraid des éditeurs, en France) derrière Cloudflare. À fournir : puissance mesurée à la prise, autres usages du serveur, engagements de Cloudflare. |
| 8.2 | Gestion durable des équipements | Prioritaire | NE | Âge, durée de vie prévue, réemploi du serveur et des disques : inconnus. |
| 8.3 | PUE minimisé | Prioritaire | NE | Serveur domestique probablement sans climatisation (PUE proche de 1 par construction) : à confirmer. |
| 8.4 | WUE minimisé | Recommandé | NE | Pas de refroidissement à eau présumé : à confirmer. |
| 8.5 | Électricité renouvelable documentée | Recommandé | NE | Contrat d’électricité inconnu. |
| 8.6 | Localisation cohérente avec les usages | Recommandé | S | Hébergement en France annoncé (`server/legal.js:16`) ; électricité française nettement sous le seuil de 100 g CO₂e/kWh ; cache Cloudflare servi depuis Paris (`cf-ray …-CDG`). |
| 8.7 | Chaleur valorisée | Recommandé | NE | Le serveur chauffe-t-il une pièce habitée l’hiver ? À documenter. |
| 8.8 | Données chaudes et froides séparées | Modéré | NS | Un seul dossier `/data` : originaux (froids, jusqu’à 90 Mo) avec base et variantes (chaudes), proposé sur le pool SSD (`deploy/unraid/compose.yaml:13`). C17. |
| 8.9 | Duplication seulement si nécessaire | Modéré | S | Sauvegarde proportionnée : variantes exclues (recalculables), originaux copiés une fois, 14 instantanés de base, purge à 90 j (`server/db/backup.js:1-12`). |
| 8.10 | Calculs asynchrones planifiés selon les contraintes externes | Recommandé | NS (partiel) | Descriptions Florence-2 la nuit, sur un cœur (`server/describe.js:9-11`) ; mais analyse CLIP de tout le fonds, recalcul de toutes les variantes après un changement de filigrane et sauvegarde quotidienne partent à l’heure du clic ou du démarrage. C15. |

## 9. Algorithmie

| N° | Critère (abrégé) | Prio. | Statut | Preuve, commentaire |
|---|---|---|---|---|
| 9.1 | Nécessité d’un entraînement évaluée | Prioritaire | S | Aucun entraînement : modèles pré-entraînés (YuNet, CLIP ViT-B/32, Florence-2) ; vocabulaire de mots-clés calculé une fois (`server/keywords-suggest.js:4-8`) ; choix argumenté dans le code (`server/describe.js:6-12`). |
| 9.2 | Apprentissage de complexité minimale | Prioritaire | NA | Pas de phase d’apprentissage. |
| 9.3 | Quantité d’entraînement limitée | Prioritaire | NA | Pas d’entraînement. |
| 9.4 | Données d’apprentissage au strict nécessaire | Prioritaire | NA | Pas d’entraînement. |
| 9.5 | Fréquence de réentraînement optimisée | Prioritaire | NA | Jamais réentraînés ; modèles figés par révision et empreinte SHA-256 (`server/series-suggest.js:13-19`, `server/describe.js:13-15`). |
| 9.6 | Modèles compressés | Recommandé | S | CLIP vision quantifié (89 Mo), Florence-2 en q8, YuNet 230 ko. |
| 9.7 | Inférence optimisée | Prioritaire | S (à déclarer) | Désactivée par défaut, une fois par photo et mémorisée (l’empreinte CLIP sert aussi aux mots-clés), entrée réduite (224/640/1024 px), un fil, file de nuit, déchargement après 2 min. Mesuré (CPU par photo) : YuNet 0,18 s ; CLIP 0,26 s ; Florence-2 base 12 s (1,9 Go) ; large 39 s (4,0 Go). Réserves : « large » par défaut à 4042eaa (corrigé dans `main`) ; aucun indicateur de suivi (temps par photo, part des suggestions retenues). |

## Hors grille : questions pour Sébastien et Julien (hébergement)

1. Le serveur Unraid est-il allumé en permanence pour d’autres usages (NAS, sauvegardes, médias) ? Si oui, la part du
   site dans sa consommation est faible et le levier principal reste le poids des pages chez les visiteurs.
2. Puissance mesurée à la prise (wattmètre), au repos et pendant un import : 2 relevés suffisent pour une première
   déclaration.
3. Âge du matériel, disques (SSD/HDD), mise en veille des disques du tableau, contrat d’électricité.
