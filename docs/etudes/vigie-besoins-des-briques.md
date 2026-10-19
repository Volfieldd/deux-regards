# Ce que les nouvelles briques demandent à la Vigie

Registre tenu à chaque PR qui ajoute une brique au site (v2, Carnets, galeries privées, boutique…). Pour chaque surface
nouvelle ou modifiée, on se demande trois choses :

1. **Ce qu'un attaquant ou un abus pourrait y faire.**
2. **Si la Vigie le voit déjà** : quel événement le site émet (vocabulaire fermé de `server/securite/vocabulaire.js`,
   E1 à E24 de [l'étude](journalisation-securite.md) § 2.2) et à quel cas de détection il se rattache (DS1 à DS32,
   [§ 3](journalisation-securite.md#3-cas-de-détection) et `vigie/regles/`).
3. **Sinon, le besoin à verser à la Vigie** : un nouveau cas d'usage (numéroté ici `BV-n`, à renuméroter en `DS` par la
   Vigie quand elle le prend), avec l'événement à émettre, la règle, le seuil et la gravité proposés.

Ce registre ne code rien dans `vigie/` ni `server/securite/` : il liste. La Vigie décide, numérote et implémente ; elle
coche ici ce qu'elle a pris (colonne « Pris »).

Relevé du 18 octobre 2026, sur main après les PR #114, #115, #117, #119, #122 et #127, complété par la PR #129 (pages v2 sans formulaire).

Complété le même jour par deux besoins qui ne viennent pas d'une brique mais du déploiement (BV-10, BV-11), retenus
après examen d'une sonde réseau Suricata (décisions D24 à D26 de l'[étude de recadrage](recadrage-vigie-edge-wake.md#7-décisions)).

Partage convenu le 18 octobre 2026 avec la session de la Vigie : elle prend BV-1, BV-2, BV-4 et BV-6 (`server/securite/`, `vigie/`, point d'émission dans `app.audit.log`) ; le site prend BV-3, BV-5 et BV-7 (et l'émission du partage par QR de BV-6), dans la PR `fix/vigie-bv3-bv5-bv7`.

### Suivi (colonne « Pris »)

| Besoin | Rattaché à | Pris | Où | État |
|---|---|---|---|---|
| BV-1 Réglage public sensible changé | DS9 (contact ou directeur de la publication), DS23 (après une session reprise) | ✓ Vigie | `feat/vigie-actions-admin` : point d'émission unique dans `server/securite/site.js`, événement `config_public_changed`, règles `vigie/regles/80-admin.yml` | fait |
| BV-2 Donnée personnelle rendue publique | DS18 | ✓ Vigie | même PR : `privacy_exposure_changed` (heure visible, EXIF complet), règles `exif_complet` et `heures_visibles_en_masse` | fait |
| BV-3 Valeurs de filtre impossibles | DS12 | ✓ site | PR #133 : `input_validation_fail` (émetteurs `· filtres`, `· partage`), exception de 30 jours lue dans `stats_pages` | fait |
| BV-4 Seuils DS15 face à la v2 | DS15 | ✓ Vigie | recalage sur le trafic de l'aperçu (phase D), sans changement avant d'avoir des chiffres | à faire |
| BV-5 Aucun lien interne vers une 404 | prérequis de DS15 | ✓ site | PR #133 : `test/liens-internes.test.js` (v1 et v2, 3 langues ; lien piège jamais suivi) | fait |
| BV-6 Statistiques gonflées | DS22 | ✓ Vigie et site | déjà couvert par `excess_rate_limit_exceeded` (1 point sur l'adresse) ; partage par QR : PR #133 (émetteur `· partage QR`) | fait |
| BV-7 Referer de la photo offerte | durcissement | ✓ site | PR #133 : `no-referrer` gardé dans `onSend` pour les adresses à jeton ou à code (`redactUrl`) | fait |
| BV-8 Saisie de recherche impossible | DS12 | ✓ site | `fix/vigie-bv8-bv9-recherche` : `input_validation_fail` (émetteur `· recherche`, détail `raison`, `longueur`, `nombre_q`, jamais la saisie) | fait |
| BV-9 Recherches en rafale | DS15, DS22 | ✓ site | `fix/vigie-bv8-bv9-recherche` : 60 recherches en 10 min par adresse, puis 429 et `excess_rate_limit_exceeded` (`limite: 'recherche'`) | fait |
| BV-10 Sorties du site par liste autorisée | MV11, DS23 ; nouvelle source « réseau » du quorum | ✓ Vigie (phase E4) | `feat/vigie-e4` : mandataire `deploy/unraid/reseau/mandataire.js` (service `sortie`, profil « sortie », `SORTIE_MANDATAIRE`) ; site : `HTTPS_PROXY` et `NODE_USE_ENV_PROXY=1` (`server/config.js`), option `proxy` de nodemailer (`server/mailer.js`) ; règles de l'hôte `deploy/unraid/reseau/regles.sh` (`NICEPHOS-SORTIE`) ; Vigie : `vigie/reseau.js`, `vigie/regles/75-reseau.yml` (`reseau_sortie_refusee`, `reseau_sortie_directe`, `vigie_reseau_silence`, chaîne DS23), carte « Réseau » de la santé, `cli.js reseau` | fait côté code, à appliquer sur l'instance de test |
| BV-11 Flux entre conteneurs hors liste | MV11, MV16 ; source « réseau » | ✓ Vigie (phase E4) | `feat/vigie-e4`, avec BV-10 : matrice des flux dans `regles.sh` (`NICEPHOS-FLUX`), adresses fixes du site et du traducteur, réseau interne `nicephos-sortie` ; Vigie : `reseau_flux_hors_liste` (règles `reseau_flux_site`, `reseau_flux_repetes`) ; découpage complet de `nicephos` : étape suivante, proposé dans `deploy/unraid/reseau/README.md` | fait côté code, à appliquer sur l'instance de test |
| BV-12 Construction active neutralisée dans un billet | DS11, DS23 | ✓ site (émission) ; règle et option du crochet : Vigie ; ✓ Vigie | `feat/carnets` : `malicious_input` émis par le rendu (émetteur `server/carnet-markdown.js · billet`, composant `site · admin`, détail `objet`, `billet`, `champ`, `langue`, `familles`, `constructions` en nombres, `longueur`), « moyen » pour une construction active, « bas » pour du HTML inoffensif ou une image externe, une fois par champ, langue et contenu, à l'enregistrement, la proposition, la publication et au rétablissement d'une version, jamais à l'aperçu ni à l'enregistrement automatique ; routes de l'aperçu et du brouillon déclarées `config.vigie.corps = 'rendu'` (à lire par `server/securite/site.js`) ; règle `billet_construction_active` et corrélation `billet_apres_session_reprise` : Vigie ; Vigie (phase E1) : règles `billet_construction_active`, `billet_apres_session_reprise` (`vigie/regles/85-galeries-carnets.yml`) ; option de route `config.vigie.corps` à lire dans `server/securite/site.js` | fait |
| BV-13 Filtres et contexte du carnet hors liste | DS12 | ✓ site | `feat/carnets` : `input_validation_fail` (émetteur `server/routes/public.js · carnet`, raison « valeur de filtre hors liste », `champ`, `valeur` à 60 signes) par la fonction `ignored()` de BV-3, pour `?rubrique=`, `?par=` (photographe vu depuis moins de 30 jours : rien), `?page=` (non entière ou inférieure à 1 ; au-delà de la dernière : 404), `?carnet=` de la visionneuse (billet retiré ou ancienne adresse : rien) ; `via` du partage d'un billet : raison « valeur hors liste » ; la règle DS12 s'applique telle quelle | fait |
| BV-14 Hors portée signalé pour les objets à plusieurs auteurs | DS10 | ✓ site (voyages, galeries privées, Carnets) ; règle : Vigie ; ✓ Vigie | voyages fait (`fix/vigie-bv14-voyages`) ; galeries privées fait (`feat/galeries-privees` : `authz_fail` « hors portée », émetteurs `server/routes/galeries.js · portée` et `server/routes/prive.js · portée`, détail `{ objet: 'galerie' \ ; Vigie (phase E1) : règle `ecriture_hors_portee` (`85-galeries-carnets.yml`, `detail.ecriture: true`) ; voyages : `objet`, `id` et `ecriture` ajoutés à l'émission | fait | 'photo', id, ecriture }`) ; Carnets fait (`feat/carnets` : `authz_fail` « hors portée », émetteur `server/routes/carnet.js · portée`, détail `permission`, `objet: 'billet'`, `id`, `ecriture` ; aperçu public d'un billet non publié demandé par une session de l'admin hors portée : émetteur `server/routes/public.js · carnet`) ; règle `ecriture_hors_portee` | fait côté site |
| BV-15 Lettre d'information | DS9, DS10, DS16, DS21, DS22 |  | phase 44, si la lettre est retenue | proposé |
| BV-16 Force brute du mot de passe d'un accès | DS16, DS21, DS31 | ✓ site ; types et règles : Vigie ; ✓ Vigie | `feat/galeries-privees` : `authn_login_fail` (`site · public`, `bas`, `portail: galerie_privee`) ; palier posé en `authn_login_disabled` avec `type_attendu: authn_login_lock` (type absent du vocabulaire, à ajouter par la Vigie) ; `excess_rate_limit_exceeded` (`galerie_mot_de_passe`, `mot_de_passe_global`) ; Vigie (phase E1) : type `authn_login_lock` (`site · public`) ; règles `galerie_echecs_adresse`, `galerie_essais_repartis`, `galerie_suspendue` (deux formes, dont `authn_login_disabled` avec `type_attendu`), `galerie_scrypt_sature` | fait |
| BV-17 Énumération des liens et des espaces | DS16 | ✓ site ; ✓ Vigie | `feat/galeries-privees` : `token_guess` (`lien de galerie privée`, `espace privé`, `image privée`), limite `galerie_lien` (61e ouverture en 1 h) ; Vigie (phase E1) : `enumeration_jetons` (DS16) telle quelle | fait |
| BV-18 Accès qui fuit (nombreux réseaux ou pays) | DS18, DS3 | ✓ site (émission) ; règles et décision : Vigie ; ✓ Vigie | `feat/galeries-privees` : `session_created` (`site · public`, réseau seul, pays dans `detail.pays`) ; suspension applicable par le site (`spaces.suspend`) ; décision `suspendre_acces` à créer par la Vigie (Tranché 5) ; Vigie (phase E1) : règles `acces_reseaux_multiples` (4 en 7 j ; 10 pour un lien de groupe), `acces_pays_multiples` (3 en 24 h ; 5 pour un groupe) ; décision `suspendre_acces` (appliquée par le site avec `app.spaces.suspend`), réponse de `acces_pays_multiples` en mode Bloquer seulement | fait |
| BV-19 Téléchargement en masse | DS15, DS18 | ✓ site ; règles : Vigie ; ✓ Vigie | `feat/galeries-privees` : `excess_rate_limit_exceeded` (`telechargements` 50/h, `archives` 3/jour), `sensitive_export` (`site · public`, archive) ; Vigie (phase E1) : règles `telechargements_en_masse`, `acces_nouvel_appareil_puis_siphonage` | fait |
| BV-20 Texte publié qui gagne un lien, un e-mail ou un téléphone | DS9 | ✓ Vigie | `watchWrites` (`server/securite/site.js`), `config_public_changed` (`objet: 'texte_public'`) ; billets compris : côté site (`feat/carnets`), chaque écriture d'un billet passe par `app.audit.log` avec les noms des champs (`champs : body_de, title`), jamais leurs valeurs ; la version en ligne ne change que par l'enregistrement d'un billet publié, la publication, la republication, le rétablissement d'une version ou **`app.carnet.runDue()`** (server/carnet.js), seule fonction de la publication programmée (sans session : `sub` nul, « publication programmée », notée au journal) à brancher sur `watchWrites` ; réglage `carnet_contact` (adresse de « Écrire aux auteurs ») à ajouter à `WATCHED` et `CONTACT` ; fin de D ou phase E ; Vigie (phase E1) : `server/securite/textes-publics.js` (photos publiées avec leurs lieux et mots-clés, séries, photographes, billets publiés ; textes des réglages affichés sur le site : nom, accroche, introduction, « À propos », droits, sous-titre de la marque), publication programmée comprise (sub nul), règle `texte_public_contact` | fait |
| BV-21 Textes publiés modifiés en masse (défacement) | DS9 | ✓ Vigie | corrélation sur le modèle de `heures_visibles_en_masse` ; billets : corrélation sœur `billets_modifies_en_masse` (3 billets publiés modifiés ou retirés par un même compte en 1 h, décision 10), à partir des lignes du journal d'audit des Carnets (`POST /admin/carnet/:id`, `/retirer`, `/republier`, `/versions/:rev/retablir`, `carnet · publication programmée`) ; Vigie (phase E1) : `textes_publics_geste_massif` (50 textes d'un geste), `textes_publics_en_serie` (20 gestes en 10 min), `billets_modifies_en_masse` (3 en 1 h) | fait |
| BV-22 Accès gardé après révocation | DS1 | ✓ site ; règle : Vigie ; ✓ Vigie | `feat/galeries-privees` : `session_use_after_expire` (`site · public`, `portail: galerie_privee`, `jeton: lien \ ; Vigie (phase E1) : règle `acces_apres_revocation` | fait | site fait |
| BV-23 Accès donnés, élargis ou retirés dans l'admin | DS18, DS23, DS10, DS8 | ✓ site (émission, journal d'audit) ; règles, `sys_state` : Vigie ; ✓ Vigie | `feat/galeries-privees` : `privacy_exposure_changed` (`objet: 'acces_prive'`, un seul point : `server/spaces.js`) ; `audit_log` « galerie privée : … » ; Vigie (phase E1) : règles `acces_crees_en_masse`, `acces_debloque_apres_suspension`, `acces_apres_session_reprise`, `acces_longue_echeance` (> 90 j) ; `role_incoherent` étendu ; contrôle des rôles : accès ouvert apparu sans événement | fait |
| BV-24 Données des invités lues ou exportées dans l'admin | DS18 | ✓ site ; `SENSITIVE` : Vigie | `feat/galeries-privees` : `sensitive_read` émis par la route (fiche d'un accès, activité, sélections ; `detail.id` : l'accès), lecture notée au journal ; export CSV en `config.audit` ; Vigie : `SENSITIVE` laissé tel quel (la route émet déjà `sensitive_read` : l'étendre compterait chaque lecture deux fois) | fait |
| BV-25 Gestes d'invité impossibles pour l'interface | DS12, DS14 | ✓ site ; corrélation : Vigie ; ✓ Vigie | `feat/galeries-privees` : `input_validation_fail` (provenance, photo hors galerie, taille hors liste ou non permise, vue ou langue inconnue), `authz_csrf_fail` (`site · public`) ; Vigie (phase E1) : corrélation `csrf_repetes_invite` (par session visiteur) ; DS12 telle quelle | fait |
| BV-26 Réponse privée servie par le cache de Cloudflare | DS18 | ✓ Vigie | bordure (phase C3), avant l'ouverture de la phase 37a ; Vigie (phase E1) : point `cache_prive` du Worker, événement `bordure_cache_prive`, règle (`70-bordure.yml`, haute) | fait |

---

## Constat transversal : la Vigie ne voit pas les changements faits dans l'admin

Le journal d'audit de l'admin (`app.audit.log`, table `audit_log`) n'est lu ni par `server/securite/` ni par `vigie/`.
La Vigie voit les connexions, les sessions, les refus de droits et de CSRF, les saisies et les pièges, mais pas **ce
qu'un compte légitime fait une fois entré**. Or les briques récentes ajoutent des réglages qui changent ce que voient
tous les visiteurs ou ce qui est publié d'une personne. Un compte volé (session reprise, DS2 ; nouvel appareil, DS4) qui
s'en sert ne déclenche rien aujourd'hui.

**BV-1 — Réglage public sensible changé.** Émettre un événement (proposition : `config_public_changed`, gravité `bas`,
composant `site · admin`) quand change un réglage qui touche tous les visiteurs ou qui sert de point de contact :
version du site public (`public_version`, PR #115), mentions légales et hébergement (`legal_*`, PR #114), adresse de
contact de la confidentialité, accroche et ouverture de l'accueil, thème publié. Détail : clé du réglage, ancienne et
nouvelle valeur **sauf** si elle contient une donnée personnelle (alors seulement « modifiée »). Règle : alerte `moyen`
si l'adresse de contact ou le directeur de la publication change (une adresse de contact remplacée sert à hameçonner les
personnes photographiées qui exercent leurs droits) ; `haut` si le changement vient d'une session marquée par DS2, DS3
ou DS4 dans l'heure (corrélation DS23). Se rattache à DS9, qui ne couvre aujourd'hui que l'empreinte des variables
d'environnement.

**BV-2 — Donnée personnelle rendue publique.** Émettre un événement (proposition : `privacy_exposure_changed`, gravité
`info`, composant `site · admin`) quand un compte rend publique une donnée qui dit où était une personne et quand :
case « Montrer l'heure sur le site » cochée (`photos.show_time`, PR #117), mode EXIF passé à « Tout l'EXIF » (GPS et
heure dans les images servies), photo d'une personne liée à une rencontre publiée. Règle : plus de 20 photos rendues
« heure visible » en 10 minutes par un compte, ou « Tout l'EXIF » activé : alerte `moyen` (`haut` avec DS2/DS4). Se
rattache à DS18 (accès inhabituel aux données personnelles), qui ne couvre aujourd'hui que les **lectures** et exports.

Implémentation suggérée pour les deux : un seul point d'émission dans `app.audit.log` (une liste des actions qui
intéressent la Vigie), plutôt qu'un `emit` à chaque route.

**Les textes publiés (convenu le 18 octobre 2026 avec la session de la Vigie).** L'intention d'une série, la
description d'un photographe, un texte de remplacement et, plus tard, le contenu des billets des Carnets sont du
contenu : hors Vigie, aucun événement à chaque modification. Deux exceptions, au même point d'émission que BV-1
(`watchWrites`, `server/securite/site.js:296`) :

**BV-20 — Un texte publié gagne un lien externe, une adresse e-mail ou un numéro de téléphone.** Même logique que
DS9 : un contact remplacé est un vecteur d'hameçonnage. Événement `config_public_changed`, détail
`{ objet: 'texte_public', champ, ajout: 'lien' | 'email' | 'telephone', domaine }`, jamais le texte. Pris par la
Vigie, en phase E ou à la fin de D. Application aux billets : [section Carnets](#bv-20-et-bv-21-appliqués-aux-billets).

**BV-21 — Modification en masse de textes publiés par un même compte (défacement).** Corrélation sur le modèle de
`heures_visibles_en_masse` (`vigie/regles/80-admin.yml`), seuil à caler (proposition : 20 en 10 minutes). Pris par
la Vigie. Le numéro d'inventaire n'intéresse pas la Vigie.

**Exigence d'implémentation commune à BV-20 et BV-21 (publication programmée).** Aujourd'hui `runDue` ne publie que des
photos et ne touche à rien de ce que surveille `watchWrites` (`server/securite/site.js`) : rien à brancher. Dès qu'un
texte publié peut l'être par programmation (un billet de Carnet programmé, par exemple), la comparaison se fait **à la
publication**, dans `runDue` ou son équivalent pour les billets, avec `sub = null` et l'émetteur « publication
programmée » : l'écart ne doit pas être attribué au prochain compte qui écrit dans l'admin. Pris par la Vigie, à
l'implémentation de la brique (précision de la session de la Vigie, 18 octobre 2026).

---

## Par brique

| PR | Surface | Abus possible | Déjà vu par la Vigie | Besoin |
|---|---|---|---|---|
| #114 correctifs | Formulaire Droits et confidentialité : 4 champs d'hébergement, téléphone et e-mail exigés | compte volé qui remplace l'adresse de contact ou l'hébergeur | CSRF (`authz_csrf_fail`, DS14), droit `reglages.droits` (`authz_fail`, DS10) | **BV-1** |
| #114 correctifs | Menu de l'admin sans script (`#admin-nav`) | — (ancre locale, aucune requête) | — | aucun |
| #115 v2 | `POST /admin/apparence/apercu-v2` | ouverture par une page tierce ; aperçu par un compte sans droit | `authz_csrf_fail` (DS14), `authz_fail` (DS10) | aucun (l'aperçu ne touche que la session) |
| #115 v2 | Réglage `public_version` | bascule de tout le site public par un compte volé | rien | **BV-1** |
| #115 v2 | Pages publiques en `private, no-store` pendant l'aperçu | — | — | aucun |
| #117 heure | Case `show_time` de la fiche photo | publication en masse de l'heure et du lieu (localiser des personnes) | `authz_fail` hors portée (DS10), CSRF (DS14) | **BV-2** |
| #117 heure | Images servies recalculées au changement de la case | — | `upload_rejected` ne s'applique pas | aucun |
| #119 test | Galerie sans animation au retour | — | — | aucun |
| #122 v2 | Filtres de galerie `?regard=`, `?serie=`, `?ordre=` | valeurs forgées (sondage, injection) | DS11 (crochet commun sur la requête) pour les motifs d'injection | **BV-3** |
| #122 v2 | Galerie en rangées, `sizes` par plage, diaporama | — | DS15 (aspiration), règle bordure `bordure_rafale` | **BV-4** (faux positifs) |
| #122 v2 | Menu v2 vers `/#galerie`, `/#series` ; `/galerie` et `/series` en 404 | lien interne cassé qui ferait compter des 404 à des visiteurs | `malicious_excess_404` (E17, DS15 exploration lente) | **BV-5** (faux positifs) |
| #127 v2 | `/bonjour` (mêmes champs, champ piège `website`) | robot, envoi depuis un autre site, rafale, code de carte deviné | `malicious_honeypot`, `input_validation_fail` (DS12, « Origin étranger sur /bonjour »), `excess_rate_limit_exceeded`, `token_guess` (DS16) | aucun |
| #127 v2 | Signaler | idem | idem | aucun |
| #127 v2 | Partager sans script : « Copier le lien » désormais compté par `POST /photo/<slug>/partage` | gonfler les statistiques de partage | `gate()` : `input_validation_fail` (autre site), `excess_rate_limit_exceeded` | **BV-6** (seuils) |
| #127 v2 | Photo offerte `/pour-vous/<jeton>` | jeton deviné ; fuite du jeton par le Referer | `token_guess` (DS16) | **BV-7** (durcissement, hors Vigie) |
| #129 v2 | Recherche `?q=` (formulaire GET, 100 caractères) | injection, sondage | `malicious_input` (E14) par le crochet commun, DS11, DS22, DS23 ; identique en v1 et v2 | **BV-8**, **BV-9** |
| #129 v2 | Carte, voyages, 404 v2 | parcours systématique, scanners | `malicious_excess_404` (E17, DS15/DS16), piège (E18), règle `bordure_rafale` | aucun |
| #129 v2 | Pages légales et confidentialité | — (texte identique à la v1, journal de sécurité compris) | — | aucun |
| #147 v2 | Texte de remplacement dans « Compléter et publier » (champ par champ et tableau sans script) et dans l'inspecteur | défacement par un compte volé ; écriture sur la photo d'un autre photographe | `app.audit.log` avec le **nom** du champ (`champs : alt_text`, « photo 12 : alt_text » pour le lot), jamais sa valeur ; `authz_fail` hors portée (DS10), CSRF (DS14) | **BV-20**, **BV-21** (mêmes signaux que la fiche) |
| #147 v2 | Migration 054 : déclencheurs du numéro d'inventaire recréés (année de Paris) | — | référence des déclencheurs reprise après la migration (`vigie_declencheurs`) ; ni ceux des comptes ni celui des sessions ne changent | aucun |
| #147 v2 | Liste de contrôle de la bascule (`docs/wiki/Bascule-v2.md`) | faux positifs d'aspiration et de 404 après la bascule | DS15, `malicious_excess_404` | **BV-4** (recalage avant la bascule, à confirmer par la Vigie), **BV-5** (test des liens internes) |
| v2 bouton | `POST /admin/apparence/apercu-v2` étendue (`vue=v1\|v2\|suivre`) : vue de la session d'un administrateur, bouton « Voir en v1 / Voir en v2 » des pages publiques | vue posée par une page tierce ; par un compte sans droit | `authz_csrf_fail` (DS14), `authz_fail` (DS10) ; journal d'audit « vue de la session : v2 (visiteurs : v1) » | aucun : préférence d'affichage de la session, pas un réglage public (pas de `config_public_changed`) |
| v2 bouton | Pages publiques d'une session en `private, no-store` (304 compris, sans `CDN-Cache-Control`) | page portant le bouton ou le jeton CSRF d'un administrateur gardée par Cloudflare | — | aucun |

### BV-3 — Valeurs de filtre impossibles

`server/routes/public.js` (`readFilter`, ~l. 213) **ignore** sans rien dire un `regard`, une `serie` ou un `ordre`
inconnus. Un navigateur qui suit l'interface ne produit jamais ces valeurs (les filtres sont des liens) : c'est
exactement le signal de DS12. Proposition : émettre `input_validation_fail` (raison « valeur de filtre hors liste »,
paramètre, valeur tronquée à 60 caractères et échappée) quand l'un d'eux est présent et inconnu ; la règle DS12
existante (2 en 10 minutes par adresse) s'applique telle quelle. Exception à prévoir : une série ou un photographe
**supprimé** depuis moins de 30 jours (liens anciens, moteurs de recherche) n'émet pas.

### BV-4 — La galerie v2 et l'aspiration (DS15)

La v2 charge plus d'images par page (rangées, plus de vignettes au premier écran, diaporama de l'accueil qui charge une photo
à chaque pas quand on le lance) et des tailles qui dépendent de l'écran. Deux règles de DS15 risquent des faux
positifs :

- « **toutes les tailles d'une même photo** » : faire pivoter un iPad, redimensionner une fenêtre ou passer en plein
  écran dans la visionneuse demande légitimement deux ou trois tailles de la même photo ;
- « plus de **300 images** en 10 minutes » : une visite attentive de la galerie complète en v2, au bureau, en demande
  environ une par photo publiée, plus les tailles de la visionneuse.

Proposition : à la bascule de la v2 pour tous (et dès l'aperçu, sur les sessions d'administrateurs), relever les seuils
sur le trafic réel d'une semaine d'aperçu ; ne compter « toutes les tailles » que si elles arrivent **sans** la page HTML
correspondante ni la feuille de style ; garder le parcours systématique (slugs dans l'ordre, sans `Accept-Language`)
comme signal principal. À faire avec le recalage des seuils prévu en phase D.

### BV-5 — Aucun lien interne vers une 404

`malicious_excess_404` compte les pages introuvables par adresse. Un lien cassé dans la v2 ferait monter le score
d'adresse (DS22) de visiteurs ordinaires. Pas d'événement nouveau : un **prérequis** côté site, un test qui parcourt tous
les liens internes des pages v2 (fr, en, de) et exige zéro 404, à lancer avant la bascule de la v2. Les adresses
`/galerie` et `/series` restent des 404 voulues tant qu'aucun lien n'y mène (testé par la PR #122).

### BV-6 — Statistiques gonflées (J'aime, partages)

Les J'aime et partages sont comptés par adresse et limités (`gate()`). La v2 ajoute le compte des « Copier le lien »
depuis la page sans script. Aucun événement nouveau ; proposition : que la Vigie suive le rapport
`excess_rate_limit_exceeded` / envois acceptés sur `partage` et `aime` pour recaler la limite (phase D), et rattache une
rafale sur ces deux routes au score d'adresse (DS22) plutôt qu'à DS15.

### BV-7 — Referer de la photo offerte (durcissement, pas un cas de détection)

La page `/pour-vous/<jeton>` pose `Referrer-Policy: no-referrer`, mais le crochet `onSend` de `server/app.js` (~l. 290)
réécrit tous les en-têtes de sécurité à la fin et le remplace par `strict-origin-when-cross-origin`. Les autres sites ne
reçoivent que l'origine, jamais le jeton : risque faible. Correctif : ne pas réécrire `referrer-policy` quand la route
l'a déjà posé. Même question pour `/partage/instagram/<jeton>` et `/bonjour/<réf>-<code>`. Rien à détecter ; noté ici
parce que le fichier est partagé avec la Vigie.

### BV-8 — Saisie de recherche impossible pour le formulaire

Le champ de recherche est limité à 100 caractères et n'existe qu'une fois. Le serveur coupe une saisie plus longue et
garde un seul `q` sans rien dire. Une saisie plus longue, ou un `q` répété, ne vient donc pas de l'interface : c'est le
signal de DS12. Proposition : `input_validation_fail` (raison « saisie de recherche hors formulaire », longueur, nombre
de `q`), gravité `moyen` ; la règle DS12 existante s'applique.

### BV-9 — Recherches en rafale

Aujourd'hui, ni limite ni signal côté site sur `/recherche` (seule la règle `bordure_rafale` le voit, si le Worker
Cloudflare est installé). Proposition : une limite par adresse (60 en 10 minutes) qui, une fois atteinte, répond 429 et
émet `excess_rate_limit_exceeded` (détail : `limite: 'recherche'`), gravité `bas`, rattachée à DS15 et au score
d'adresse (DS22).

---

## Déploiement : sorties réseau et flux entre conteneurs

Question posée le 18 octobre 2026 : une sonde Suricata sur le trafic entrant et entre les composants apporterait-elle à
la Vigie ? Sur l'**entrant**, non : aucun port n'est ouvert, tout passe par le tunnel, chiffré jusqu'à `cloudflared` ;
le seul tronçon en clair (`cloudflared` → `site:3000`) montre les requêtes que le site journalise déjà, sans compte ni
session, et l'empreinte TLS du visiteur y est perdue (le TLS s'arrête chez Cloudflare), alors que le Worker de la
phase C3 la voit. Le vrai angle mort est ailleurs :

- **La sortie du site est libre.** Le site est sur le réseau `nicephos`, routé vers Internet. Compromis (MV11 : fichier
  image piégé, modèle, dépendance npm), il peut ouvrir un shell inversé, joindre un serveur de commande ou envoyer la
  base et `DATA_KEY` dehors. Aucune source de la Vigie ne le voit : elle ne connaît du site que ce qu'il lui envoie.
- **Les conteneurs partagent un même réseau.** `site`, `backup`, `cloudflared`, `libretranslate` et `vigie` sont tous
  sur `nicephos` : chacun peut joindre les autres, alors que les flux voulus tiennent en quelques lignes.

Les deux besoins ci-dessous ajoutent une **source « réseau »** au quorum (3.2 de l'étude de recadrage), constatée hors du
site : un site compromis ne la contrôle pas. Ils empêchent d'abord, puis signalent chaque tentative.

### BV-10 — Sorties du site par une liste autorisée

**Empêcher.** Le site ne sort plus que par un **mandataire de sortie** (un petit conteneur HTTP `CONNECT`, par exemple
Squid ou tinyproxy) qui n'accepte que les noms de la liste ; tout autre nom est refusé et journalisé. Sorties relevées
dans le code le 18 octobre 2026 :

| Destination | Pour quoi | Où dans le code |
|---|---|---|
| `<instance>.zitadel.cloud` (`OIDC_ISSUER`) | connexion OIDC | `server/oidc.js` |
| `graph.instagram.com`, `api.instagram.com` | publication Instagram | `server/instagram.js` |
| `freetsa.org` (`TSA_URL`) | horodatage des preuves | `server/config.js` |
| hôte de `SMTP_URL` | e-mails | `server/mailer.js` |
| `huggingface.co` et ses serveurs de fichiers (noms exacts à relever pendant un téléchargement sur l'instance de test) | modèles de description et de suggestion de séries, au premier usage seulement | `server/describe-worker.js`, `server/series-suggest.js` |

À vérifier à l'implémentation : `fetch` de Node 22 ne suit `HTTPS_PROXY` qu'avec `NODE_USE_ENV_PROXY=1` (selon la
version mineure de l'image) ; nodemailer prend son mandataire par l'option `proxy` ; les modèles peuvent aussi être
téléchargés une fois puis Hugging Face retiré de la liste.

**Forcer le passage.** Une règle de l'hôte (chaîne `DOCKER-USER`) n'autorise depuis l'adresse du site, hors des réseaux
internes, que le mandataire, et **rejette et journalise** tout le reste. Un site sain, réglé pour le mandataire, ne sort
jamais en direct : une tentative directe prouve qu'un code qui n'est pas le nôtre tourne.

**Signaler.** La Vigie lit, en lecture seule, le journal du mandataire et celui des rejets de l'hôte (comme elle lit
déjà les sauvegardes), sans passer par le site. Événements proposés (source « réseau », confiance « constaté ») :

| Événement | Quand | Gravité proposée |
|---|---|---|
| `reseau_sortie_refusee` | nom hors liste demandé au mandataire | `moyen` ; `haut` au-delà de 3 noms différents en 1 h |
| `reseau_sortie_directe` | connexion du site vers Internet sans le mandataire, rejetée par l'hôte | `haut`, **exception à source unique** (comme le cookie rejoué) |
| `vigie_reseau_silence` | journal du mandataire ou des rejets illisible ou muet au-delà de 24 h alors que le site tourne | `moyen` (comme `vigie_bordure_silence`) |

Rattachement : MV11 (le site ne peut plus confirmer ni masquer seul), DS23 (une sortie refusée qui suit une saisie
malveillante ou un fichier piégé, DS11 ou DS13, de la même heure fait une chaîne d'attaque).

Limite connue : le résolveur DNS intégré de Docker relaie les noms externes depuis le démon, hors de la chaîne
`DOCKER-USER` ; une fuite par requêtes DNS resterait possible. Parade en second temps : `dns:` du site vers un petit
résolveur à liste autorisée qui journalise les noms refusés (le mandataire résout les noms autorisés, le site n'a plus
besoin d'en résoudre d'autres que ceux des conteneurs).

### BV-11 — Flux entre conteneurs hors de la liste

**Empêcher.** Découper `nicephos` pour que chaque flux voulu ait son réseau, et rien d'autre :

| De | Vers | Pourquoi |
|---|---|---|
| `cloudflared` | `site:3000` ; plus tard `vigie:4200` (console) | tunnel |
| `site` | `vigie-reception:4100` (`nicephos-vigie-ingest`, déjà interne) | événements, décisions |
| `site` | `libretranslate:5000` (profil « traduction ») | propositions de traduction |
| `site` | mandataire de sortie (BV-10) | Internet, liste autorisée |
| `vigie` | `signal:8080` (`nicephos-vigie-signal`, déjà interne) | notifications |
| `vigie` | Internet : Zitadel, SMTP, API Cloudflare, listes de menaces | lecture, notifications |
| `backup`, `vigie-backup` | aucun | sauvegardes locales (`network_mode: none` à vérifier pour `backup`) |

**Signaler.** Ce qu'un découpage ne peut pas interdire (deux conteneurs qui partagent légitimement un réseau) passe par
la même chaîne `DOCKER-USER` : tout paquet entre deux adresses des réseaux Nicephos qui n'est pas dans la liste est
rejeté et journalisé. Événement proposé : `reseau_flux_hors_liste` (source, destination, port), gravité `haut`,
exception à source unique quand la source est le site (mouvement latéral : MV16, le site qui sonde la console ou la
passerelle). Les refus déjà vus par les services eux-mêmes restent comptés à part (`vigie_ingestion_refusee`, DS30).

À valider sur l'instance de test avant Unraid : lancement des règles au démarrage de la grappe (script « User Scripts »),
écriture des rejets dans un fichier dédié (préfixe de journal filtré par rsyslog), monté en lecture seule dans la Vigie
seul ; volume borné.

**État (19 octobre 2026, phase E4, `feat/vigie-e4`) : fait côté code, à appliquer sur l'instance de test.** Mandataire écrit
dans le dépôt (`deploy/unraid/reseau/mandataire.js`, lancé avec l'image du site) plutôt que Squid ou tinyproxy : contrôle des
adresses résolues (un nom autorisé qui mène au réseau local est refusé), journal JSON sans chemin par construction,
battement horaire, liste tirée du `.env` au démarrage. Relevé du code : toutes les sorties du site passent par `fetch`
(openid-client, Instagram, horodatage, modèles), sauf nodemailer ; Hugging Face sert les modèles depuis `*.hf.co`
(`us.aws.cdn.hf.co` à l'essai). Règles de l'hôte : `deploy/unraid/reseau/regles.sh` (`--afficher`, `--retirer`,
`--battement`, `--rsyslog`), chaînes `NICEPHOS*` appelées en tête de `DOCKER-USER`, posées d'un coup, sur des
sous-réseaux et des adresses fixes (le site et le traducteur ont désormais la leur). Essai en conteneurs (sans iptables) :
sortie autorisée réussie (FreeTSA, Hugging Face), noms refusés journalisés, journal lu par la Vigie en lecture seule,
alertes ouvertes. Guide : [`deploy/unraid/reseau/README.md`](../../deploy/unraid/reseau/README.md). Restent à valider
sur l'instance de test : les règles posées pour de bon (rejets réels dans `hote.log`, filtre rsyslog), le passage de chaque
fonction du site par le mandataire, et le découpage complet du réseau `nicephos` (étape suivante, proposé dans le guide).

### Perspective : Suricata, seulement en sortie

Non retenu pour l'instant (D26). Si BV-10 et BV-11 montrent un besoin, une sonde Suricata **sur le seul pont de sortie
du site** ajouterait ce qu'une liste ne voit pas : balises régulières vers un serveur de commande, tunnels DNS, client
TLS qui n'est pas Node (empreinte JA3/JA4 de l'outil d'un attaquant), réputation des destinations (listes abuse.ch).
Réglage à garder : `eve.json` limité aux flux, au DNS et au SNI, **sans** contenu HTTP ni capture de paquets (cookies et
formulaires ne doivent jamais être gardés) ; règles ET Open restreintes aux familles malware et commande à distance.
Coût : `NET_RAW` et `NET_ADMIN` (le conteneur le plus privilégié de la pile, qui analyse un trafic hostile), 0,5 à 1 Go
de mémoire, des règles à suivre. Sur l'entrant, il n'apporterait rien que le Worker et les événements du site ne donnent
déjà mieux.

---

## Pour les briques à venir (à compléter à leur étude)

| Brique | Surfaces prévues | Besoins pressentis pour la Vigie |
|---|---|---|
| Admin v2 (MQ-07 à MQ-10) | choix v1/v2 par compte, nouveaux écrans | le choix par compte n'intéresse pas la Vigie ; garder le bandeau critique et les badges de la phase C sur les gabarits v2 |
| Boutique (plus tard) | panier, paiement, commandes, factures | à étudier à part : fraude au paiement, énumération de commandes, données de facturation (DS18) |

Les Carnets et les galeries privées, évalués avant tout code, ont désormais leur section ci-dessous.

---

## Brique à venir : les Carnets

Évaluation du 18 octobre 2026, avant tout code, pour que l'implémentation démarre dès la fin de la phase D de la
Vigie. Sources : [étude](blog-galeries-boutique.md), partie 1 (§ 1.3 à 1.11) et partie 7 (§ 7.4 à 7.8) ; maquettes
[MQ-11](../audit-ergonomie-2026-10-16/maquettes/MQ-11-carnets-liste.html),
[MQ-12](../audit-ergonomie-2026-10-16/maquettes/MQ-12-carnet-billet.html) et
[MQ-20](../audit-ergonomie-2026-10-16/maquettes/MQ-20-admin-editeur-billet.html) (encarts « Ce qui change ») ;
[lexique](../audit-ergonomie-2026-10-16/maquettes/LEXIQUE-ET-DONNEES.md), § 4.3 et § 4.10. Phases 35 et 36 de
l'étude ; 39 pour les billets privés (servis par un espace privé, B74 : traités avec les galeries) ; 44 pour la lettre,
facultative.

### Surfaces prévues

- **Routes publiques** (plugin `pages`, trois langues ; étude § 1.7) : `/carnet` et `?page=` ; `/carnet/:slug`
  (ancien slug : 301 par `post_slugs` ; retiré : 410 ; inconnu ou jamais publié : 404) ; `/carnet/:slug/partager` et
  `POST /carnet/:slug/partage` ; `/carnet/flux.xml` (et `/en/…`, `/de/…`), **hors** `pages` (B58) ; contexte
  `?carnet=<slug>` de la visionneuse `/photo/:slug` (MQ-12, repères 7 et 16). **Choix ouvert** : l'étude filtre par
  étiquettes (`/carnet/etiquette/:slug`, B10, B70), MQ-11 par `?rubrique=` et `?par=` (repères 3 et 9).
- **Admin** (`server/routes/carnet.js`, enregistré depuis `admin.js` comme `voyages.js`) : `/admin/carnet`,
  `/admin/carnet/:id` et, d'après MQ-20 (« Écarts avec l'étude »), `/apercu` (POST JSON, une demande toutes les
  1,5 s au plus, B28), `/apercu/photo/:slug`, `/photos/:n`, `/supprimer`, `/renvoyer`, `/publier` (publier ou
  programmer) ; étiquettes, `photos.json`, `/admin/carnet/lettre`. Enregistrement automatique dans `post_drafts`
  (B31) ; aperçu et brouillon automatique **hors du journal d'audit** (B34).
- **Formulaire du billet** : titre (fr, en, de ; 120 signes, B2), chapô (300, B4), corps en Markdown restreint (60 000
  signes par langue, B5), slug (figé à la publication, B3), signatures (`post_authors`), rubrique ou étiquettes, voyage
  lié, couverture et image de partage, visibilité (`public`, `prive`), mention commerciale (B14), réponse (droit de
  réponse, B82), case « mise à jour signalée » (B48), date de programmation (B45). Une photo s'écrit `photo:<slug>` sur
  une ligne (MQ-20), gardée `photo:ID` en base (B9, lexique § 4.10).
- **Réglage** : `carnet_contact`, adresse de « Écrire aux auteurs » (B79 ; par défaut `legal_email`).
- **Permissions** (B41, § 7.5) : `carnet.voir`, `carnet.ecrire`, `carnet.publier`, `carnet.publies.modifier` (avec
  portée), `carnet.textes`, `carnet.etiquettes`, `lettre.gerer` ; `carnet.publier` et `carnet.publies.modifier` dans
  `ADJUSTABLE` (`server/permissions.js:82-86`).
- **Cookies, sessions, jetons, fichiers** : aucun cookie ni script public de plus (B62) ; aucun fichier envoyé (les
  photos viennent de la photothèque ; une image externe est retirée du rendu, § 1.4). Lettre seulement : jeton de
  confirmation haché et jeton de désinscription recalculé par HMAC (B86 à B88).
- **Données personnelles** : personnes nommées dans un billet (B83 : du contenu) ; « Écrire aux auteurs » en `mailto:`,
  rien de stocké (B79), **ou** formulaire scellé (B80, choix ouvert) ; lettre : e-mail des abonnés scellé (B87).
- **E-mails** : « au mieux » aux modérateurs et aux auteurs pendant le circuit (§ 1.6) ; lettre (B90).
- **Tâches de fond** : `carnet.runDue()` dans la minuterie d'une minute (B45) publie les billets programmés, **sans
  requête ni session** ; file d'envoi de la lettre (B90) ; traduction proposée par LibreTranslate local (B36).

### Abus possibles et ce que la Vigie voit déjà

| Surface | Abus possible | Déjà vu par la Vigie | Besoin |
|---|---|---|---|
| Corps, titre, chapô d'un billet | XSS stocké (`<svg onload>`, `[x](jav&#x09;ascript:…)`, `data:`) déposé par un compte volé, ou par une traduction collée | le crochet commun (`server/securite/site.js:249-274`) voit `malicious_input` (E14) dans `body.*`, mais en `bas` pour un compte connecté (l. 267) : aucune alerte (`saisie_compte_admin`, `10-preuves.yml`, ne prend que `haut`) ; il le revoit à chaque aperçu (1,5 s) et à chaque enregistrement automatique ; il ne voit pas les formes encodées que seul le rendu reconnaît (B18) | **BV-12** |
| Billet publié modifié | lien d'hameçonnage, adresse e-mail ou téléphone ajoutés à un billet en ligne (compte volé, révision acceptée) | rien : `watchWrites` ne compare que des réglages (l. 287-312) | **BV-20** |
| Plusieurs billets | défacement : billets réécrits ou retirés (410) en série | rien | **BV-21** |
| Billet publié par la minuterie | publication programmée pour la nuit par un compte volé | rien : `watchWrites` ne tourne qu'après une écriture avec session (l. 339) | BV-20, BV-21 (émission depuis `runDue`) |
| Réglage `carnet_contact` | adresse de « Écrire aux auteurs » remplacée | rien : clé absente de `WATCHED` et de `CONTACT` (l. 287-288) | BV-20 (même point que BV-1) |
| `/admin/carnet/:id` et ses actions | photographe qui ouvre, modifie ou publie le billet de l'autre ; identifiants essayés à la suite | `authz_fail` (E7) seulement par `app.forbid` (`server/permissions.js:116`) ; le modèle `load` et `sees` de `voyages.js`, que l'étude demande de reprendre (B42), répond 404 **sans rien émettre** (`server/routes/voyages.js:14`, `:51-52`) : `exploration_droits` (DS10) aveugle | **BV-14** |
| Aperçu public d'un billet non publié (B55) | voir le brouillon de l'autre photographe | rien ; l'aperçu des voyages, corrigé (`server/routes/public.js:388-389`), sert de modèle de portée | BV-14 |
| POST de l'éditeur, aperçu JSON | écriture forcée depuis une page tierce | `authz_csrf_fail` (E8), `csrf_repetes` (DS14) | aucun |
| `?rubrique=`, `?par=`, `?page=`, `?carnet=`, `via` du partage | valeurs forgées, sondage | `malicious_input` pour les motifs d'injection (DS11) ; une valeur inconnue serait ignorée sans rien dire | **BV-13** |
| `/carnet/:slug` | énumération des brouillons et des billets retirés | `malicious_excess_404` (E17, DS15) ; un 410 n'est pas compté (`site.js:323`), ce qui est voulu | aucun |
| `POST /carnet/:slug/partage` | statistiques gonflées | `gate()` (`public.js:492-502`), s'il est repris : `input_validation_fail`, `excess_rate_limit_exceeded` | aucun (BV-6) |
| `/carnet/flux.xml` | aspiration ; à l'inverse, faux positif : agrégateurs qui relisent le flux toutes les 15 minutes depuis une même adresse | DS15 (pages HTML, `bordure_rafale`) | prérequis (BV-4) |
| « Écrire aux auteurs » en formulaire (B80) | robot, envoi depuis un autre site, rafale | `trapped()` et `gate()` (`public.js:492-507`), s'ils sont repris : `malicious_honeypot`, `input_validation_fail`, `excess_rate_limit_exceeded` | aucun |
| Lettre (B84 à B94) | inscriptions en rafale d'adresses de tiers (bombardement de confirmations, quota et réputation du relais), jetons devinés, hameçonnage envoyé à tous les abonnés par un compte volé | rien | **BV-15** |
| Traduction proposée | — (LibreTranslate local, sans tiers) | — | aucun |

### BV-12 — Construction active neutralisée dans un billet

Seul le rendu (`server/carnet-markdown.js`, B17, B18) sait qu'il a neutralisé quelque chose : lien au schéma refusé
après décodage des entités, HTML brut affiché comme texte, image externe retirée. C'est lui qui émet.

- **Événement** : `malicious_input` (E14), existant ; émetteur `server/carnet-markdown.js · billet`, composant
  `site · admin`.
- **Quand** : à « Enregistrer », « Proposer », « Publier » et à l'acceptation d'une révision (B47), une fois par billet,
  champ et langue et par contenu (le même texte réenregistré n'émet pas deux fois) ; **jamais** à l'aperçu ni à
  l'enregistrement automatique.
- **Détail** : `{ objet: 'billet', billet: <id>, champ: 'corps' | 'titre' | 'chapo' | 'reponse' | 'mention', langue,
  familles: ['xss'], constructions: { script, attribut_evenement, schema_refuse, data_url, html_brut, image_externe },
  longueur }` (des nombres) ; jamais le texte ni un extrait : un billet peut nommer des personnes.
- **Gravité** : `moyen` dès qu'une construction active est neutralisée (`<script`, attribut `on…=`, schéma
  `javascript:`, `vbscript:`, `data:`) ; `bas` pour du HTML brut inoffensif ou une image externe (gardé pour l'enquête,
  sans alerte). Le contenu d'un bloc de code n'est jamais compté : un billet « Atelier » peut citer du HTML.
- **Règle** (Vigie, `vigie/regles/80-admin.yml`) : `billet_construction_active`, `type: malicious_input`,
  `detail.objet: billet`, `severity: moyen` ; `level: medium`, entité compte, `source_unique: true`, mode `alerter`,
  cas DS11 ; et une corrélation sœur de `reglage_apres_session_reprise` : `billet_apres_session_reprise` (`temporal`,
  `session_autre_appareil` puis `billet_construction_active`, groupe `sub`, 1 h, `high`, DS23).
- **Crochet commun** : l'aperçu et l'enregistrement automatique ne passent plus le corps à `scanInputs`
  (`server/securite/site.js:253-260`), par une option de route (`config.vigie: { corps: 'rendu' }`) ; chemin,
  paramètres et navigateur restent inspectés. Sans cela, une ligne `bas` toutes les 1,5 s pendant qu'on écrit un
  billet sur le HTML.
- **Réponse automatique** : aucune ; le rendu et la CSP restent les barrières (prérequis plus bas).
- **Qui** : le site (émission par le rendu, option de route) ; la Vigie (prise en compte de l'option dans
  `server/securite/site.js`, règle).

### BV-20 et BV-21 appliqués aux billets

Un billet est un texte publié : BV-20 et BV-21 (définis plus haut, pris par la Vigie) s'y appliquent.

- **Point d'émission** : celui de BV-1 (`watchWrites`, `server/securite/site.js:296`), appelé aussi par
  `carnet.runDue()` pour une publication programmée : sans requête, avec le `sub` de qui l'a programmée (lu dans
  `post_reviews`).
- **Quand** : à chaque changement de la version **en ligne** : publication, republication, modification d'un billet
  publié (`carnet.publies.modifier`), révision proposée acceptée (B47), publication programmée. Le rendu donne déjà les
  liens (B18) : on compare liens externes, adresses e-mail (`mailto:` compris) et numéros de téléphone (`tel:` compris)
  de la version en ligne d'avant et d'après, par champ et par langue ; les références internes (`photo:`, `serie:`,
  `voyage:`, `carnet:`) ne comptent pas.
- **Détail (BV-20)** : `{ objet: 'texte_public', champ: 'billet.corps_de' (ou `billet.titre`, `.chapo`, `.reponse`,
  `.mention`), billet: <id>, ajout: 'lien' | 'email' | 'telephone', domaine, sponsorise: true }` (`sponsorise` pour un
  lien `rel="sponsored"`, B72) ; pour une adresse e-mail, son domaine seul ; pour un téléphone, l'indicatif du pays
  seul.
- **Première publication** : un billet neuf cite souvent des sources. Proposition à la Vigie : alerter sur un ajout à un
  billet **déjà en ligne** ; à la première publication, ne signaler (`bas`) qu'une adresse e-mail, un téléphone, ou un
  domaine jamais vu dans les textes publiés du site (première apparition, comme DS4).
- **BV-21** : une publication, une modification en ligne, un retrait (410) ou un changement de slug d'un billet publié
  compte pour un texte publié modifié. Le seuil commun (20 en 10 minutes) vise des textes courts ; deux billets par
  mois sont annoncés (D17). Proposition : une corrélation sœur `billets_modifies_en_masse`, 3 billets publiés modifiés
  ou retirés par un même compte en 1 h, `medium`, DS9.
- **Réglage `carnet_contact`** : ajouté à `WATCHED` et à `CONTACT` (`site.js:287-288`) : `config_public_changed` avec
  `contact_change: true`, et la règle `contact_public_change` (DS9) s'applique telle quelle.

### BV-13 — Filtres et contexte du carnet hors liste (BV-3 étendu)

- **Événement** : `input_validation_fail` (E13), existant, émetteur `server/routes/public.js · carnet`, détail
  `{ raison: 'valeur de filtre hors liste', champ, valeur }` (60 signes, échappée), par la fonction `ignored()` de
  BV-3 (`public.js:224-233`), reprise telle quelle.
- **Paramètres** : `rubrique` hors de la liste fermée, `par` (regard inconnu), `page` non entière ou inférieure à 1
  (au-delà de la dernière page : la 404 de B53, déjà comptée par E17), `carnet` de la visionneuse (slug inconnu), `via`
  du partage (comme `public.js:537`) ; ou étiquette inconnue si l'étude l'emporte sur la maquette.
- **Exceptions** (aucune émission) : billet retiré ou ancien slug de `post_slugs` (liens anciens, moteurs de
  recherche) ; rubrique ou étiquette supprimée depuis moins de 30 jours, lue dans `stats_pages` comme `seenLately`
  (`public.js:222-223`), si les pages `carnet:<slug>` y sont comptées (B61). Un billet privé passé en `?carnet=` est
  traité comme inconnu (il n'existe pas en public, B76).
- **Règle** : `valeurs_impossibles_repetees` (DS12, 2 en 10 minutes par adresse), telle quelle.
- **Qui** : le site.

### BV-14 — Hors portée signalé pour les objets à plusieurs auteurs (Carnets et galeries privées)

L'étude demande, pour les billets à deux signatures (B42) et les espaces privés (G56), le modèle de `voyages.js`
(`load`, `sees`, `manages`) plutôt que le contrôle de `routes/admin.js`, qui suppose un seul propriétaire. Or
`load` (`server/routes/voyages.js:14`) renvoie `null` pour un objet hors portée, et la route répond 404 sans rien
émettre (l. 51-52, 84-85, 111-112, 121-122, 143-144), alors que `routes/admin.js:154` émet `authz_fail` pour les objets
à un seul propriétaire. Repris tel quel, le modèle rendrait DS10 aveugle sur les billets et les galeries ; il l'est
déjà sur les voyages.

- **Événement** : `authz_fail` (E7), existant, détail `{ raison: 'hors portée', permission, objet: 'billet' |
  'galerie' | 'acces' | 'voyage', id, ecriture: true | false }` (identifiants numériques).
- **Où** : dans un `load` commun (par exemple `server/routes/portee.js`), quand l'objet existe mais que `sees` est
  faux ; dans l'aperçu public d'un billet non publié (B55) demandé par une session de l'admin hors portée ; sur
  `/prive/:pid` en vue équipe quand `request.owns('galeries.voir', space.author_id)` est faux pour une session de
  l'admin ; et dans `voyages.js` dès maintenant.
- **Règles** : `exploration_droits` (DS10, 10 en 10 minutes par compte), telle quelle ; nouvelle règle
  `ecriture_hors_portee` : `authz_fail`, `detail.raison: hors portée`, `detail.ecriture: true` → `level: medium`,
  entité compte, `source_unique: true`, mode `alerter`, DS10. L'interface ne montre jamais l'objet de l'autre : une
  écriture hors portée ne vient pas d'un clic (logique de DS12). Exemple : un photographe qui crée un accès sur la
  galerie de l'autre (`POST /admin/galeries/:id/acces`).
- **Qui** : le site (émission) ; la Vigie (règle).

### BV-15 — Lettre d'information (si elle est retenue, phase 44)

- **Inscription** `POST /lettre` : comme `/bonjour`, `trapped()` (`malicious_honeypot`), contrôle d'`Origin`
  (`input_validation_fail`) et limite par adresse (`excess_rate_limit_exceeded`, `limite: 'lettre'`) ; **en plus**,
  une limite globale des e-mails de confirmation (proposition : 30 par heure) qui, atteinte, suspend ces envois et émet
  `excess_rate_limit_exceeded` (`limite: 'lettre_global'`, gravité `moyen`) : quelqu'un inscrit des adresses de tiers,
  et le quota comme la réputation du relais (B93) sont en jeu.
- **Jetons faux** sur `/lettre/confirmer/:jeton` et `/lettre/desinscription/:jeton` : `token_guess` (E19,
  `nature: 'jeton de lettre'`) ; `enumeration_jetons` (DS16) telle quelle.
- **Envoi d'une lettre** (`lettre.gerer`, Administrateur seul) : `config_public_changed` (`objet: 'lettre'`, `billet`,
  `langue`, `destinataires` : un nombre), gravité `moyen` : un compte volé y écrit à tous les abonnés d'un coup, comme
  avec une adresse de contact remplacée ; BV-20 s'applique aux liens du message.
- **Règles** (Vigie) : `lettre_envoyee` (source unique, `medium`, mode `alerter`, DS9) ; `lettre_confirmations_saturees`
  (`excess_rate_limit_exceeded`, `detail.limite: lettre_global` ; source unique sur l'entité `site` `lettre`, `medium`,
  DS21) ; détecteur `role_incoherent` (`vigie/detecteurs.js:124-131`) étendu à l'envoi d'une lettre par un compte absent
  des administrateurs déclarés (preuve, critique, DS10), comme pour l'export.
- **Qui** : le site (émission) ; la Vigie (règles, détecteur).

### Prérequis côté site (Carnets)

- **Rendu et CSP** : instance `Marked` dédiée, liste d'autorisation des schémas après décodage, corpus de tests XSS
  (B17 à B19) ; CSP inchangée (`server/app.js:51-62`, étude § 7.8) : ni `style=`, ni script, ni ressource tierce (B62) ;
  JSON-LD avec `<` échappé, inséré par `<%~ %>` (B68), vérifié sans violation en navigateur. BV-12 dit qu'on a essayé ;
  il ne remplace pas ces barrières.
- **Aperçu et brouillon** : hors du journal d'audit (B34, exceptions de `server/routes/admin.js:173-182`) et hors de
  l'inspection du corps (BV-12), toujours sous CSRF (`x-csrf-token`, DS14).
- **BV-5 étendu** : `test/liens-internes.test.js` parcourt aussi `/carnet` (filtres et `?page=`), chaque billet publié,
  les pages de rubrique ou d'étiquette, « Dans le carnet » (B64), billets précédent et suivant, liens `?carnet=` de la
  visionneuse, dans les trois langues : zéro 404. Un billet retiré sort des listes, du flux et du sitemap (B49), une
  photo dépubliée sort du rendu (B21).
- **BV-4 étendu** : les lectures du flux (`/carnet/flux.xml`, réponses 304 comprises) ne comptent pas comme pages HTML
  pour DS15 ; un billet charge jusqu'à 10 figures et une galerie de 12 photos (MQ-12, B63) : à mesurer au recalage de
  la phase D.
- **Partage et formulaires** : `POST /carnet/:slug/partage` et, s'il est retenu, le formulaire « Écrire aux auteurs »
  passent par `gate()` et `trapped()` (`public.js:490-507`), avec leurs émissions.
- **Jetons de la lettre** : `redactUrl` (`app.js:75-80`) masque `/lettre/confirmer/<jeton>` et
  `/lettre/desinscription/<jeton>` (SO4) ; l'`onSend` (`app.js:290-295`) pose alors `Referrer-Policy: no-referrer` de
  lui-même (BV-7) ; jetons de 192 bits au moins, gardés hachés (B87), comparés à temps constant (`sameToken`,
  `server/auth.js:35`).
- **Permissions** : voir « Permissions et contrôle des rôles », plus bas.

---

## Brique à venir : les galeries privées

Évaluation du même jour. Sources : [étude](blog-galeries-boutique.md), partie 2 (§ 2.3 à 2.8) et partie 7 (socle SO1
à SO9 et constats C1 à C8, § 7.1 ; § 7.4 à 7.7) ; [annexe de sécurité](annexe-galeries-privees-securite.md)
(menaces M1 à M20, § 3, routes § 5, tests § 6) ; maquettes
[MQ-16](../audit-ergonomie-2026-10-16/maquettes/MQ-16-galerie-privee-acces.html),
[MQ-17](../audit-ergonomie-2026-10-16/maquettes/MQ-17-galerie-privee.html) et
[MQ-18](../audit-ergonomie-2026-10-16/maquettes/MQ-18-admin-acces-prive.html) ; lexique, § 4.6, § 4.9 et § 4.10.
Phases 37a, 37b et 38 de l'étude ; 39 pour les billets privés, servis par un espace de type billet (B74) et donc
couverts ici.

### Surfaces prévues

- **Routes des invités** (hors `pages`, annexe § 5) : `GET` et `POST /g/:token` (page du mot de passe ; 404 ou 410 ;
  403 au refus ; 429 ; 503) ; `/prive/:pid` (`?vue=favoris`, MQ-17), `/prive/:pid/photo/:item`, images
  `/prive/:pid/m/:name`, `/prive/:pid/telecharger/:item/:taille`, `POST /prive/:pid/archive` et
  `GET /prive/:pid/archive/:n`, `POST /prive/:pid/selection/:item`, `…/selection/terminer`, `…/selection/reprendre`
  (MQ-17, lexique § 4.10 : à ajouter à l'annexe), `POST /prive/:pid/commentaires/:item` (V2), `POST /prive/:pid/langue`,
  `POST /prive/quitter` ; `GET /prive` si la page des accès est retenue (G78).
- **Admin** (`server/routes/galeries.js`) : liste, fiche et onglets ; réglages, ouverture, fermeture, suppression ;
  photos (ajout, retrait, confirmation de l'usage « privé », ordre ; action groupée de la photothèque) ; accès :
  création (jeton de formulaire à usage unique, G57), page des secrets (`no-store`, lue une fois), envoi, prolonger,
  nouveau lien, nouveau mot de passe, débloquer, révoquer, effacer ; sélections (rouvrir, export) ; aperçu en vue
  équipe. **Écart** : l'annexe écrit `/admin/galeries/:id/invitations/:inv/…`, MQ-18 `/admin/galeries/:id/acces/:id/…`
  (« Accès », lexique § 4.10) ; sans effet sur la Vigie tant que l'identifiant reste numérique (C4).
- **Formulaires** : invité : mot de passe (un champ, « se souvenir de cet appareil »), favori, langue, quitter ; équipe :
  étiquette, e-mail facultatif, langue, échéance, droits (favoris et limite, téléchargement web ou grand, filigrane,
  commentaires, tirages), lien de groupe, nombre d'appareils.
- **Jetons et secrets** : lien de 192 bits (`crypto.randomBytes(24)`, empreinte SHA-256 seule, G6, G7) ; mot de passe
  généré de 12 signes (environ 59 bits ; scrypt N = 2¹⁵, G14, G17) ; identifiant public d'espace de 12 signes, **pas un
  secret** (annexe § 3.6).
- **Session et cookie** : session visiteur commune avec le futur panier, cookie `__Host-visiteur` (G25, SO2) ;
  autorisations `visitor_grants` à échéance propre (12 h d'inactivité et 7 jours, 30 jours avec « se souvenir »).
- **Permissions** : `galeries.voir`, `galeries.gerer`, `galeries.partager`, avec portée, contrôlées par
  `request.owns()` (G55) ; Modérateur et Relecteur sans accès (D16) ; espaces communs réservés à la portée « tout » (G1).
- **Fichiers** : aucun envoi par l'invité ; rendus et archives dans `storage/private/` (G42, G44, G46), hors sauvegarde
  (G76).
- **Données personnelles** : étiquette et e-mail des invités (scellés, index HMAC), journal `space_events` (IP tronquée,
  pays), sélections, commentaires (scellés) ; photos de personnes reconnaissables, parfois de mineurs (annexe § 1).
- **E-mails** : invitation (le lien, jamais le mot de passe, G22, G58) ; sélection envoyée (G50) ; rappels d'échéance
  (V2).
- **Tâches de fond** : fermeture à l'échéance (G3, G63) ; purge 6 mois après la fin (G71) ; archives effacées après
  24 h (G46) ; purge Cloudflare d'une photo passée en privé (G43, jeton d'API).
- **Choix ouverts** : mot de passe obligatoire (étude : oui) ; durées, appareils et essais (D15, annexe § 9) ; lien de
  groupe (G5) ; pleine définition (annexe § 9.2) ; page `/prive` des accès (G78). Voir « Tranché ».

### Abus possibles et ce que la Vigie voit déjà

| Surface | Abus possible | Déjà vu par la Vigie | Besoin |
|---|---|---|---|
| `POST /g/:token` | force brute du mot de passe d'un lien obtenu, requêtes en parallèle (M3) | rien : aucun type pour un invité ; un `authn_login_fail` tel quel tomberait dans `oidc_echec` (DS5, `20-connexion.yml`) | **BV-16** |
| `POST /g/:token` | essais répartis sur de nombreuses adresses contre un même accès | rien : `cible_commune` (DS31) groupe par `sub`, un invité n'en a pas | BV-16 |
| Sémaphore scrypt (G18) | déni de service par calculs de mot de passe (M16) | rien : le 503 n'émet rien | BV-16 |
| `GET /g/:token` | énumération des liens (M4) | rien ; le modèle existe : `token_guess` de la photo offerte (`public.js:95`), règle `enumeration_jetons` (DS16) | **BV-17** |
| `/prive/:pid`, `/prive/:pid/m/:name` | énumération des espaces ; adresse d'image copiée et envoyée (M8) | `malicious_excess_404` (E17) au-delà de 20 pages introuvables en 10 minutes | BV-17 |
| Accès accepté | lien **et** mot de passe qui fuient ou sont transférés, servis depuis de nombreux appareils, réseaux ou pays (M1, M2) | rien ; le site compte les appareils (signal dans « Aujourd'hui » à 3, G31, G62), sans réseau ni pays | **BV-18** |
| Téléchargements, archives | téléchargement en masse, archives en boucle (M2, M16) | rien | **BV-19** |
| Lien révoqué ou remplacé ; cookie après révocation ou « Quitter » | accès gardé après révocation (cookie copié, ancien lien conservé) | rien : `session_use_after_expire` (E5) ne vaut que pour les sessions de l'admin (`sessions_revoked`, `site.js:82-88`) | **BV-22** |
| Admin, création et réglage des accès | compte volé qui ouvre des accès à des tiers, élargit les droits (grande taille, sans filigrane), prolonge, débloque après une suspension | `audit_log`, que la Vigie ne lit pas ; `authz_csrf_fail` (DS14) | **BV-23** |
| Admin, accès sur la galerie d'un autre | photographe qui donne accès à la galerie de l'autre, ou à un espace commun | `authz_fail` par `app.forbid` si `manages` est faux ; rien si `load` cache l'objet (`voyages.js:14`) | **BV-14**, BV-23 (rôle incohérent) |
| Admin, fiche d'un accès, export des sélections | lecture en masse des étiquettes, e-mails et activités des invités | rien : `SENSITIVE` (`site.js:28`) ne couvre que `/admin/personnes` et `/admin/rencontres` | **BV-24** |
| POST des invités (`/g/`, favoris, langue, quitter) | CSRF de connexion (M11), envoi sans `Origin`, photo hors espace, taille de téléchargement non permise | rien ; `sameSite` (`public.js:490`) accepte une requête **sans** `Origin` : à ne pas reprendre (G28) | **BV-25** |
| Pages et images privées | réponse gardée et resservie par le cache de Cloudflare (M6), ou archivée par Always Online (M20) | rien : le site ne voit pas ce que le cache sert | **BV-26** |
| Mot de passe, commentaires | injection | `malicious_input` (E14) par le crochet commun ; un champ de formulaire n'est gardé que par son nom et sa longueur (`site.js:272`) | aucun (prérequis : champ du mot de passe exclu) |
| Photo d'une personne qui a refusé, ajoutée à un espace | exposition malgré un refus (M17) | `readiness` la bloque (G61) ; une photo « à vérifier » exige une confirmation gardée | BV-23 (confirmations comptées) |
| Réglage « Tout l'EXIF » | GPS dans les variantes (M19) | `privacy_exposure_changed`, règle `exif_complet` (DS18) | aucun |

### BV-16 — Force brute du mot de passe d'un accès

Le site compte déjà, en base et avant le calcul scrypt (G19, annexe § 3.3) : la Vigie doit voir l'acharnement, sa
répartition et son auteur, pas refaire le compte (le sien ne survit pas à un redémarrage).

- **Événements** :
  - `authn_login_fail` (E1), existant, à chaque refus, émis avec `composant: 'site · public'` et la gravité `bas`
    (l'émission le permet, `server/securite/index.js:140-151`) ; détail `{ portail: 'galerie_privee', acces: <id>,
    espace: <id>, echecs_consecutifs, echecs_total, pendant_pause: true }` ; jamais le mot de passe, sa longueur ni le
    jeton. Préféré à un type neuf : c'est un échec d'authentification ; sans `sub`, ni le pivot d'identifiants (DS25)
    ni `cible_commune` (DS31) ne le confondent avec un compte de l'admin ;
  - `authn_login_lock`, **nouveau** (nom du vocabulaire d'OWASP), gravité `moyen`, composant `site · public`, quand un
    palier est posé : `{ portail, acces, espace, palier: 'pause_1min' | 'pause_15min' | 'suspension', adresses_24h,
    reseaux_24h, pays_24h }` (nombres lus dans `space_events`) ; `haut` pour la suspension ;
  - `excess_rate_limit_exceeded` (E16), existant, pour la limite par adresse (20 essais en 15 minutes, G20 :
    `limite: 'galerie_mot_de_passe'`) et pour le sémaphore saturé (503, G18 : `limite: 'mot_de_passe_global'`, une fois
    par minute au plus).
- **Règles** (Vigie) :
  - `oidc_echec` et `echec_authentification` (`vigie/regles/20-connexion.yml`) limitées à `composant: site · connexion` :
    sinon trois fautes de frappe d'une invitée (Lucie, MQ-16) font des points DS5 ;
  - `galerie_echecs_adresse` : `event_count` des refus d'invités, groupe `ip`, 15 min, ≥ 10 → 3 points sur l'adresse
    (DS16 étendu, comme `enumeration_jetons`) ;
  - `galerie_essais_repartis` : `value_count` des refus, groupe `detail.acces`, champ `ip`, 1 h, ≥ 3 → `high`, source
    unique sur `{ kind: site, champ: detail.acces }` (DS31 : cible commune ; le lien a fui) ;
  - `galerie_suspendue` : `authn_login_lock`, `detail.palier: suspension` → `medium`, source unique, mode `alerter`
    (DS16) ; une pause seule reste un contexte, sans alerte ;
  - `galerie_scrypt_sature` : `excess_rate_limit_exceeded`, `detail.limite: mot_de_passe_global`, ≥ 5 en 10 min →
    `medium`, source unique sur l'entité `site` (DS21).
- **Poids** (`vigie/poids.js`) : `authn_login_lock` à 0 (ses règles le notent, jamais deux fois).
- **Réponse automatique** : celle du site (pause, suspension, G19). Côté Vigie, rien de neuf : le score de l'adresse
  (DS22) et son blocage de 24 h en mode `bloquer` ; l'adresse d'un administrateur reste protégée.
- **Qui** : le site (émission dans `server/routes/prive.js` et `server/passwords.js`) ; la Vigie (type dans
  `server/securite/vocabulaire.js`, poids, règles).

### BV-17 — Énumération des liens et des espaces

- **Événement** : `token_guess` (E19), existant, émetteur `server/routes/prive.js`, avec `nature` :
  `'lien de galerie privée'` pour `/g/<jeton>` mal formé ou inconnu (format contrôlé avant la base, G6 ; l'événement
  aussi) ; `'espace privé'` pour `/prive/<pid>` inexistant ou sans autorisation ; `'image privée'` pour
  `/prive/<pid>/m/<nom>` hors espace ou d'une ancienne clé (M8). **Exception** : une session visiteur qui a eu une
  autorisation sur cet espace (échéance passée, « Quitter ») ne fait pas de `token_guess` : c'est le retour ordinaire
  de MQ-17 (repère 14). Jamais le jeton : la route est envoyée par son gabarit (`server/securite/index.js:159`).
- **Limite** : `excess_rate_limit_exceeded` (`limite: 'galerie_lien'`) à la 61e ouverture de `/g/` en une heure par
  adresse (G20).
- **Règle** : `enumeration_jetons` (DS16, 10 en 1 h par adresse), telle quelle ; résumés de 5 minutes du site
  (`AGGREGATED`, `server/securite/index.js:39`) inchangés.
- **Qui** : le site.

### BV-18 — Accès qui fuit : ouvert depuis de nombreux réseaux ou pays

- **Événement** : `session_created` (E4), existant, à chaque mot de passe accepté (nouvelle autorisation), composant
  `site · public`, détail `{ portail: 'galerie_privee', acces, espace, appareil_n, se_souvenir, groupe }`
  (`appareil_n` : rang de l'appareil pour cet accès, G31). Adresse **réduite au réseau** (/24, /48) et au pays, comme
  `space_events` : une entrée normale n'est pas un événement suspect (étude de journalisation, J6). Il faut à `build`
  (`server/securite/index.js:140-156`) une option qui n'envoie que `ip_net` et `country`.
- **Règles** (Vigie) :
  - `acces_reseaux_multiples` : `value_count` des entrées, groupe `detail.acces`, champ `ip_net`, 7 j, ≥ 4 →
    `medium`, source unique sur `{ kind: site, champ: detail.acces }`, mode `alerter`, DS18 (des tiers qui voient une
    galerie où l'on reconnaît des personnes : violation possible, étude § 2.7) ; accès de groupe
    (`detail.groupe: true`) : seuil relevé (proposition : 10) ;
  - `acces_pays_multiples` : même groupe, champ `country`, 24 h, ≥ 3 → `high` (DS3, le voyage impossible d'un accès) ;
  - corrélation `temporal` avec BV-19 : entrée depuis un nouveau réseau puis téléchargement en masse dans l'heure,
    même `detail.acces` → `high`.
- **Réponse automatique proposée** (à trancher) : une décision nouvelle `suspendre_acces` (`KINDS` de
  `vigie/decisions.js:10` ; application par `server/securite/decisions.js`), que le site applique comme la suspension
  après 30 refus (G19 : l'équipe débloque ; un nouveau mot de passe garde le lien, G10) ; mode `alerter` le premier mois.
- **Qui** : le site (émission, option « réseau seul », application de la décision) ; la Vigie (règles, décision).

### BV-19 — Téléchargement en masse

Une ligne par photo téléchargée ferait du volume (J2) et des points sur l'adresse d'une invitée légitime (une
galerie de 48 photos, plus une rafale vue en bordure, ferait le quorum). Seuls les seuils et les archives émettent.

- **Événements** : `excess_rate_limit_exceeded` (E16), existant, quand un accès passe 50 téléchargements unitaires en
  1 h (`limite: 'telechargements'`, proposition) ou la limite de 3 archives par jour (G46, `limite: 'archives'`), avec
  `{ portail: 'galerie_privee', acces, espace, taille: 'web' | 'grande' }` ; `sensitive_export` (E12), existant,
  composant `site · public`, à chaque archive préparée (`{ portail, acces, espace, nature: 'archive', photos, octets,
  taille }`), donc 3 par jour et par accès au plus. Un `HEAD` n'est pas un téléchargement (comme `/pour-vous`,
  `public.js:112`).
- **Règles** (Vigie) : `telechargements_en_masse` (`excess_rate_limit_exceeded` avec `detail.portail: galerie_privee` →
  `medium`, source unique sur `{ kind: site, champ: detail.acces }`, DS15 transposé : siphonage) ; la corrélation de
  BV-18 (nouveau réseau puis archive, DS18). `exports_nombreux` et `role_incoherent` groupent par `sub` : ils ne voient
  pas les invités, ce qui est voulu.
- **Qui** : le site (émission) ; la Vigie (règles).

### BV-22 — Accès gardé après révocation

Révoquer supprime les autorisations dans la même transaction (G9) ; « Quitter » change le jeton (G29). Le site ne
distingue alors plus un cookie copié avant la révocation d'un visiteur qui n'a jamais eu accès.

- **Prérequis** : garder 48 h les empreintes des jetons visiteur remplacés ou fermés et les autorisations révoquées
  (une table `visitor_sessions_revoked`, comme `sessions_revoked` pour l'admin, `site.js:82-88`) ; garder l'empreinte
  d'un lien remplacé par « Nouveau lien » jusqu'à la purge de l'accès (`space_invites` garde déjà `token_hash` et
  `revoked_at` ; l'ancien lien d'un accès prolongé ou renouvelé, non).
- **Événement** : `session_use_after_expire` (E5), existant, composant `site · public`, gravité `moyen` (`haut` si
  réseau et navigateur diffèrent de l'entrée d'origine, comme `meme_reseau_et_navigateur` de DS1), détail
  `{ portail: 'galerie_privee', jeton: 'cookie_visiteur' | 'lien', raison: 'acces_revoque' | 'lien_remplace' |
  'quitte' | 'acces_efface', acces, espace, meme_reseau_et_navigateur }`. Pas pour une échéance passée : le 410 et la
  404 sont alors attendus (l'invité revient après la date).
- **Règle** : `acces_apres_revocation` : `session_use_after_expire`, `detail.portail: galerie_privee` → `medium`,
  source unique sur `{ kind: site, champ: detail.acces }`, DS1. `cookie_rejoue` (`10-preuves.yml`) ne se déclenche pas :
  elle exige un `sub`.
- **Réponse** : aucune de plus (le site refuse déjà) ; l'alerte dit à l'équipe que l'accès retiré est encore tenté,
  souvent signe d'une fuite à instruire (procédure de violation, `docs/wiki/RGPD.md` § 4).
- **Qui** : le site (empreintes gardées, émission) ; la Vigie (règle).

### BV-23 — Accès donnés, élargis ou retirés dans l'admin

Même logique que BV-2 : un compte volé qui ouvre la galerie d'une séance à un tiers expose des personnes ; la Vigie
n'en voit aujourd'hui que le journal d'audit, qu'elle ne lit pas.

- **Événement** : `privacy_exposure_changed` (existant, BV-2), émis par le service `server/spaces.js` (un seul point,
  qui sert aussi à l'action groupée de la photothèque), détail `{ objet: 'acces_prive', action: 'cree' | 'prolonge' |
  'nouveau_lien' | 'nouveau_mot_de_passe' | 'debloque' | 'droits_elargis' | 'revoque' | 'efface' | 'espace_ouvert',
  espace, acces, auteur_espace: <id du photographe> | null, groupe, telechargement: 'non' | 'web' | 'grande',
  sans_filigrane, echeance_jours, appareils_max, photos_a_verifier_confirmees }` ; jamais l'étiquette, l'e-mail, le
  lien ni le mot de passe. Gravité `info` ; `bas` pour des droits élargis à la grande taille ou sans filigrane, et pour
  le déblocage d'un accès suspendu.
- **Règles** (Vigie, `80-admin.yml`) : `acces_crees_en_masse` (5 créations ou nouveaux liens en 1 h par compte →
  `medium`, DS18) ; `acces_debloque_apres_suspension` (`action: debloque` dans les 24 h d'un `authn_login_lock`
  `suspension` du même accès → `medium`, DS16 et DS23) ; `acces_apres_session_reprise`, corrélation sœur de
  `reglage_apres_session_reprise` (`temporal`, session reprise puis accès créé ou élargi, groupe `sub`, 1 h, `high`,
  DS23) ;
  détecteur `role_incoherent` (`vigie/detecteurs.js:124-131`) étendu : accès créé sur un espace commun
  (`auteur_espace: null`) ou sur l'espace d'un autre photographe par un compte absent des administrateurs déclarés →
  preuve, critique, DS10 (la portée « les miennes » l'interdit, G1, G55).
- **Second temps** (contrôle des rôles, Vigie) : `vigie/controle-roles.js` compte dans l'instantané les accès ouverts
  (`space_invites` ni révoqués ni échus) et les rapproche des créations annoncées : un accès apparu sans événement a été
  écrit hors de l'application (critique, DS8 transposé). Le site ajoute le nombre d'accès ouverts à `sys_state`
  (`site.js:156-160`).
- **Qui** : le site (émission, `sys_state`) ; la Vigie (règles, détecteur, contrôle).

### BV-24 — Données des invités lues ou exportées dans l'admin

- **Lectures** : `sensitive_read` (E11) sur la fiche d'un accès (étiquette et e-mail déchiffrés) et sur l'onglet
  Activité (réseau et pays des visites) : motif ajouté à `SENSITIVE` (`server/securite/site.js:28`), avec l'identifiant
  de l'accès dans `detail.id` (et non celui de la galerie) pour que `lectures_massives` (DS18, 30 fiches différentes en
  1 h) compte des personnes.
- **Exports** : `GET /admin/galeries/:id/selections/:list/export` et l'export RGPD par e-mail d'invité (G73) déclarent
  `config.audit` (comme l'original, `server/routes/admin.js:1448`) : `sensitive_export`, `exports_nombreux` (DS18).
- **Qui** : la Vigie (`SENSITIVE`) ; le site (`config.audit` sur ses routes).

### BV-25 — Gestes d'invité impossibles pour l'interface (BV-3 étendu)

- **Événement** : `input_validation_fail` (E13), existant, émetteur `server/routes/prive.js` : POST d'invité sans
  `Origin` ni `Sec-Fetch-Site: same-origin`, ou `Origin` étranger (G28 : `raison: 'provenance absente'` ou
  `'formulaire envoyé depuis un autre site'`, `formulaire: 'galerie_mot_de_passe' | 'favori' | 'selection' | 'langue'
  | 'quitter'`) ; photo hors espace dans `selection/:item`, `commentaires/:item` ou `telecharger/:item/:taille` ;
  `taille` hors liste ou non ouverte par les droits ; `?vue=` inconnue ; langue inconnue.
- **CSRF** : `authz_csrf_fail` (E8), existant, composant `site · public`, quand une session visiteur existe et que son
  jeton manque ou est faux. `csrf_repetes` (DS14) groupe par `sub` : corrélation sœur groupée par `session` (identité
  technique de l'invité, prérequis plus bas ; l'entité `session` du moteur existe déjà, seuil 5).
- **Règles** : `valeurs_impossibles_repetees` (DS12), telle quelle ; la corrélation sœur de DS14.
- **Qui** : le site ; la Vigie (corrélation).

### BV-26 — Réponse privée servie par le cache de Cloudflare

Ce que le site ne verra jamais : une page ou une image de `/g/` ou `/prive/` gardée par Cloudflare (règle « Ignore
cache-control », Always Online, M6, M20) et resservie sans passer par lui.

- **Événement** : le Worker de la bordure (phase C3, `bordure/worker.js`), ajouté sur `/g/*` et `/prive/*`, note toute
  réponse dont `cf-cache-status` n'est ni `DYNAMIC` ni `BYPASS` : nouvel événement de bordure `bordure_cache_prive`
  (gravité `critique`, composant `bordure`), détail `{ classe: 'lien' | 'page' | 'image', statut_cache }`, sans chemin
  (le jeton y est).
- **Règle** (`70-bordure.yml`) : source unique, `critical`, mode `alerter`, DS18 (violation probable : notification à la
  CNIL sous 72 h si un risque existe, étude § 2.7). Complète le contrôle manuel de l'annexe, § 8.
- **Qui** : la Vigie (Worker, règle).

### Prérequis côté site (galeries privées)

- **Jetons et mots de passe** : lien de 192 bits (`crypto.randomBytes(24)`, format vérifié avant la base, empreinte
  SHA-256 seule ; G6, G7, SO1), comme `/pour-vous` ; mot de passe généré, scrypt et `timingSafeEqual` (G14, G17) ;
  comparaison à temps constant (`sameToken`, `server/auth.js:35`) partout où un secret n'est pas cherché par son
  empreinte ; empreintes des liens remplacés gardées (BV-22).
- **Journal du serveur et Referer** : `redactUrl` (`server/app.js:75-80`) masque `/g/<jeton>` et le paramètre `vers=`
  quand il contient un chemin masqué (SO4, M14) ; l'`onSend` de la PR #133 (`app.js:290-295`) pose alors
  `Referrer-Policy: no-referrer` de lui-même : le piège C1 est levé. Les pages `/prive/…`, sans jeton dans l'adresse,
  posent `no-referrer` par la route, que l'`onSend` garde (`reply.getHeader('referrer-policy') === 'no-referrer'`).
- **En-têtes** (G32, G39, G40, annexe § 3.5) : pages `/g/` et `/prive/` en `no-store` et `X-Robots-Tag: noindex` ;
  images en `private, no-cache` avec ETag (option stricte : `no-store`) et `Cross-Origin-Resource-Policy: same-origin` ;
  téléchargements en `private, no-store`, `Content-Disposition: attachment` ; page du lien sans Open Graph, `canonical`
  ni `hreflang` (`it.neutral`, G33) ; aucun sélecteur `/langue/` (G37). `robots.txt` (`public.js:145-146`) :
  `Disallow: /prive/`, **pas** `/g/` (G36 ; même question pour `/pour-vous/`, C7). Tests T14 à T16, T18, T35.
- **Cloudflare** (J14) : « Bypass cache » sur `/g/*` et `/prive/*`, Always Online désactivé, `cf-cache-status` contrôlé
  après la mise en ligne (annexe § 8), puis surveillé (BV-26).
- **`TRUST_PROXY`** fixé à l'adresse du tunnel (phase 34) : les limites par adresse (G20) et l'adresse des événements en
  dépendent.
- **Ce que la Vigie reçoit d'un invité** : une identité technique seulement : `session` = 12 signes d'une empreinte de
  l'identifiant interne de la session visiteur (jamais l'empreinte du cookie, J3), `acces` et `espace` par leurs
  numéros ; ni étiquette, ni e-mail, ni jeton, ni mot de passe (champ exclu de `scanInputs` par défense,
  `site.js:253-260`), ni commentaire ; l'adresse complète seulement sur un événement suspect (refus, verrou, jeton faux,
  réutilisation), réseau et pays pour une entrée normale (J6). Registre RGPD et texte de la page du lien (étude § 2.7) :
  le journal de sécurité y figure comme destinataire.
- **Journal d'audit des accès donnés et retirés** : chaque action de l'équipe passe par `audit_log`
  (`server/routes/admin.js:173-182`), avec des identifiants numériques seulement (C4, G13, G56) ; la page des secrets
  n'est jamais journalisée avec son contenu (G57) ; tests T23 et T24.
- **BV-5 étendu** : un test parcourt, avec une session d'invité, les liens des pages `/prive/` (vues, photos, langue,
  quitter, téléchargements permis) et de la page du lien : zéro 404 ; aucune page publique ne pointe vers `/g/` ni
  `/prive/` (G35).
- **BV-3 étendu** : BV-25.

---

## Permissions et contrôle des rôles (Carnets et galeries privées)

- **Côté site** : déclarer `carnet.*`, `lettre.gerer` et `galeries.*` dans `PERMISSIONS` (`server/permissions.js:10-50`)
  avec leur portée ; les répartir dans `ROLES` (`:55-77`) selon le tableau de l'étude (§ 7.5) et la décision D16
  (Modérateur et Relecteur sans galeries) ; ajouter `carnet.publier` et `carnet.publies.modifier` à `ADJUSTABLE`
  (`:82-86`) ; contrôler la portée par `request.owns()`, jamais par `request.can()` seul (G55, C8) ; tests
  `test/roles.test.js` et `test/portee.test.js`.
- **Ce que la Vigie en voit déjà** : un changement d'`adjust` passe par le déclencheur `account_changes_update`
  (migration `048_vigie_comptes.sql`) et devient `privilege_permissions_changed` avec `circuit`
  (`server/securite/site.js:120`). Aucune permission ne vit en base : le catalogue est dans le code.
- **Proposé à la Vigie** :
  - règle `circuit_elargi` : `privilege_permissions_changed` dont `detail.circuit.apres` ajoute `carnet.publier` ou
    `carnet.publies.modifier` → `low`, contexte de DS23 (publier sans validation, puis modifier un billet en ligne) ;
  - `vigie/controle-roles.js`, qui ne lit que les administrateurs (l. 74-75), lit aussi `adjust` dans l'instantané :
    une permission hors de la liste `ADJUSTABLE` (écrite à la main dans la base) est un écart (`haut`) ;
  - `role_incoherent` étendu (BV-15, BV-23) : envoi d'une lettre ; accès sur un espace commun ou d'un autre
    photographe par un compte qui n'est pas administrateur ;
  - les invités ne sont jamais des comptes (G4) : aucune règle par `sub` ne les voit ; leurs règles groupent par
    `detail.acces`, `session` ou `ip`.

---

## Tranché (Carnets et galeries privées)

Le propriétaire a validé les dix recommandations le 18 octobre 2026 : elles valent décision pour l'implémentation. L'étude (`blog-galeries-boutique.md`, `annexe-galeries-privees-securite.md`) n'est pas réécrite, et ce tableau l'emporte sur elle (par exemple, la durée du lien est de 6 mois au plus, et non 12).

| # | Décision | Retenu |
|---|---|---|
| 1 | Mot de passe d'une galerie : obligatoire ou facultatif | **Obligatoire** (méthode C de l'étude, § 2.3). Avec un lien seul, le jeton devient le seul secret : BV-18 devrait alerter dès le 2e réseau, et l'échéance passer à 7 jours. |
| 2 | Durée du lien : 30 jours par défaut, 12 mois au plus (G8, D15) | 30 jours par défaut, **6 mois au plus** ; BV-23 transmet `echeance_jours`, la Vigie signale en `bas` au-delà de 90 jours. |
| 3 | Nombre d'essais : 5 → 1 min, 10 → 15 min, 30 → suspension (G19) | **Garder** ; la Vigie n'alerte qu'à la suspension et sur les essais répartis (BV-16). |
| 4 | Appareils : signal à 3, refus au-delà (G31, annexe § 9.7) | Signal du site à 3, **pas de refus** ; la Vigie alerte à 4 réseaux en 7 jours (BV-18). |
| 5 | Réponse automatique à un accès qui fuit (BV-18) | Créer la décision `suspendre_acces`, en mode `alerter` le premier mois, puis `bloquer` pour les seuls 3 pays en 24 h. |
| 6 | Lien de groupe (G5) | Permis, signalé dans la liste (MQ-18), avec les seuils de BV-18 relevés (10 réseaux). |
| 7 | Pleine définition au téléchargement (annexe § 9.2) | 4 000 px au plus (D15) ; la taille « grande » suffit à BV-19 et BV-23. |
| 8 | Carnets : étiquettes (étude B10, B70) ou rubrique et regard (MQ-11) | **Rubrique et regard** (`?rubrique=`, `?par=`), le vocabulaire de la galerie ; fixe la liste de BV-13. |
| 9 | « Écrire aux auteurs » : `mailto:` (B79) ou formulaire (B80) | **`mailto:`** : rien à stocker ni à surveiller. |
| 10 | Seuil de BV-21 pour les billets | Une corrélation à part (3 billets en 1 h) plutôt que le seuil commun de 20 en 10 minutes. |
