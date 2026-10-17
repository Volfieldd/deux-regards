# Étude : journalisation de sécurité et détection d'incidents

| | |
|---|---|
| Statut | Étude, rien n'est développé. Le code n'a pas été modifié. Décisions D1 à D7 **validées** le 17 octobre 2026. |
| Architecture | **Révisée le 17 octobre 2026** : événements, alertes et écran vivent dans un composant isolé, la Vigie (conteneur, base et console à part). Voir [Architecture de la Vigie](annexe-vigie-architecture.md), qui prime sur les sections 4 à 6 et 8 ci-dessous, et [Cloudflare : configuration gratuite](annexe-vigie-cloudflare.md). Le vocabulaire des événements (section 2) et les cas de détection (section 3) restent valables. |
| Date | 17 octobre 2026. |
| Base lue | `main` à `096e8c8` (version 1.90.0). |
| Demande | « Je veux être en mesure de détecter les incidents de sécurité avec les logs du back office. Cloudflare et son WAF ne sont pas infaillibles. […] Tentative d'intrusion via la saisie, réutilisation de jeton d'authentification, voyage impossible, injections, élévation de privilèges sans qu'un admin ait donné le droit, siphonage du site public et de l'admin, accès inhabituel aux données personnelles… Un écran spécifique, des alertes par e-mail et/ou une notification interne. » |
| Périmètre | Ce que le site doit journaliser, les cas de détection, le moteur de règles, l'écran **Sécurité**, les alertes (e-mail, notification dans l'admin), la protection du journal, le RGPD, le plan en phases. Pas un SIEM : tout tient dans le serveur Node et sa base SQLite. |
| Références | `fichier:ligne` depuis la racine du dépôt. Sources externes : `[n]`, liste en fin de document. |

**Niveaux** : **I** impératif (sans lui, la détection est contournable ou le journal devient lui-même un risque), **R** recommandé, **C** choix des auteurs (une valeur par défaut est proposée).

**Identifiants** : `E` événements à journaliser, `DS` cas de détection, `J` exigences sur le journal, `EC` écran, `AL` alertes, `D` décisions.

---

## En bref

- **Le point de départ est bon.** Le site a déjà un journal d'audit en base (`audit_log`, 13 mois) qui note toute écriture de l'admin et les lectures les plus sensibles (`server/routes/admin.js:157`), des IP tronquées dans les journaux, des jetons masqués dans les URL, des permissions fermées par défaut. Ce qui manque : **les signaux d'attaque** (refus, valeurs impossibles, jetons rejoués, rafales), **le contexte** (adresse, pays, appareil de chaque session), **la corrélation** (règles qui transforment des événements en alertes), **l'intégrité** du journal et **la remontée** (écran, e-mail).
- **Principe.** Un second journal, `security_events`, dédié aux faits de sécurité, au vocabulaire OWASP [1] ; un petit moteur de règles en mémoire (fenêtres glissantes) et en SQL (règles périodiques) qui ouvre des **alertes** ; un écran **Sécurité** réservé aux administrateurs ; un e-mail immédiat pour les alertes hautes et critiques, le badge et « Aujourd'hui » pour le reste. On s'inspire des points de détection d'OWASP AppSensor [2] : l'application voit ce qu'aucun WAF ne voit (qui est connecté, ce qu'un formulaire peut légitimement envoyer, à quelles données un compte accède).
- **24 cas de détection** (section 3), dont ceux demandés : saisie malveillante, jeton rejoué, voyage impossible, injections, élévation de privilèges hors application, siphonage public et admin, accès inhabituel aux données personnelles. Chaque cas dit sa source, sa règle, sa gravité et la réponse.
- **Limites dites franchement** (section 7) : les tentatives de mot de passe ont lieu chez Zitadel et Google, pas ici ; les images servies depuis le cache de Cloudflare n'arrivent jamais au serveur ; SQLite ne sait pas journaliser une lecture directe du fichier de base. Le chiffrement des données personnelles (`DATA_KEY`) et Cloudflare restent les défenses de ces angles morts.
- **Prérequis** (**I**) : `TRUST_PROXY` fixé à l'adresse du tunnel (feuille de route, point 4), sinon l'adresse d'un attaquant est falsifiable et toutes les règles par adresse avec elle.
- **Plan** : quatre phases, une PR chacune (section 8) : socle de journalisation, détections et alertes, écran et réponses, compléments (Cloudflare, Zitadel, jeu d'attaques).

---

## 1. Ce qui existe déjà

| Élément | Où | Utile pour la détection | Manque |
|---|---|---|---|
| Journal d'audit en base, 13 mois | `server/accounts.js:173`, table `audit_log` (`server/db/migrations/029_comptes.sql`) | qui a fait quoi, statut « fait » / « refusé » | ni adresse, ni pays, ni appareil, ni session ; pas de gravité ; modifiable sans trace |
| Hook `onResponse` de l'admin | `server/routes/admin.js:157` | toute écriture, lectures marquées `config.audit` | les 403/404 de portée et les échecs CSRF ne sont pas distingués ; les lectures de fiches personnes ne sont pas notées |
| Connexions | `server/auth.js:200-262` | connexion, refus (compte désactivé), compte en attente, `ADMIN_SUBS` | échecs OIDC (`state`, `nonce`, signature), adresse et pays de la connexion |
| Sessions côté serveur | `server/sessions.js` | empreinte du jeton, 8 h / 24 h | ni adresse, ni pays, ni navigateur à la création ; un jeton détruit ne laisse pas de trace (impossible de distinguer « inconnu » et « rejoué après déconnexion ») |
| Limite de débit | `server/ratelimit.js` | connexions par adresse | le dépassement n'est pas journalisé comme un événement |
| Codes de carte faux | `card_code_failures` (migration 047) | blocage d'une référence 24 h | pas remonté en alerte |
| Journaux du serveur (pino) | `server/app.js:86` | erreurs 5xx, URL masquées, IP tronquées | non consultables dans l'admin ; IP tronquée inutilisable pour bloquer |
| Chiffrement des données personnelles | `server/vault.js` | un chiffré illisible remplace la donnée par un avertissement | l'échec de déchiffrement n'est pas un événement |

Conséquence : la base de l'existant se garde (le **Journal** reste la page « qui a fait quoi »), on lui ajoute un journal de sécurité séparé plutôt que d'alourdir `audit_log`. Les deux portent le même identifiant de requête (`request.id` de Fastify) pour être recoupés.

---

## 2. Ce qu'il faut journaliser

### 2.1 Format d'un événement (`J1`, **I**)

Une table `security_events`, une ligne par fait de sécurité :

| Champ | Contenu | Remarque |
|---|---|---|
| `at` | horodatage UTC en ms | horloge du conteneur synchronisée (NTP de l'hôte) |
| `type` | code du vocabulaire, ex. `authn_login_success`, `session_use_after_expire`, `input_validation_fail` | vocabulaire OWASP [1], liste fermée dans le code (une valeur inconnue empêche le démarrage, comme les permissions) |
| `severity` | `info`, `bas`, `moyen`, `haut`, `critique` | |
| `sub`, `account_id` | compte, si connecté | |
| `session` | 12 premiers caractères de l'empreinte de session | jamais le jeton |
| `ip` | adresse complète | **seulement dans cette table**, pas dans les journaux pino (qui restent tronqués) |
| `ip_net` | /24 ou /48 | pour les règles par réseau |
| `country`, `city`, `lat`, `lon` | en-têtes de Cloudflare, crus seulement derrière `TRUST_PROXY` | position arrondie à 0,1° (~10 km), suffisant pour le voyage impossible |
| `ua` | navigateur tronqué à 200 caractères, et `ua_family` (« Safari iOS 18 ») | |
| `method`, `route` | gabarit de route (`/admin/personnes/:id`), pas l'URL brute | l'URL brute passe par `redactUrl()` si elle est gardée |
| `status` | statut HTTP rendu | |
| `detail` | JSON borné à 2 ko | jamais de données personnelles (voir `J3`) |
| `req_id` | identifiant de la requête | lien avec `audit_log` et les journaux pino |
| `chain` | HMAC de la ligne et du `chain` précédent | voir `J5` |

### 2.2 Événements (`E`)

Vocabulaire repris d'OWASP [1], adapté au site. Les colonnes « Où » désignent le point du code qui l'émet.

| Id | Type | Quand | Où | Gravité de base |
|---|---|---|---|---|
| E1 | `authn_login_success` / `authn_login_fail` | fin du rappel OIDC ; échec de `state`, `nonce`, PKCE, signature, émetteur, audience, code déjà utilisé | `server/auth.js` (rappel `/auth/callback`) | info / moyen |
| E2 | `authn_login_pending`, `authn_login_disabled` | compte sans rôle, compte désactivé | `server/auth.js:207-213` | bas / moyen |
| E3 | `authn_local_attempt` | tout accès à la connexion de test quand elle est désactivée | route de connexion locale | moyen (piège) |
| E4 | `session_created`, `session_destroyed`, `session_expired` | création, déconnexion, expiration | `server/sessions.js` | info |
| E5 | `session_use_after_expire` | un cookie présente l'empreinte d'une session **détruite ou expirée** (gardée 48 h dans `sessions_revoked`) | chargement de session | haut |
| E6 | `session_context_change` | une session valide arrive d'un autre navigateur, d'un autre pays ou d'un autre réseau que celui de sa création | chargement de session | moyen à haut (`DS2`) |
| E7 | `authz_fail` | 403 (`app.forbid`) et 404 de portée (`reply.callNotFound()` d'une ressource qui existe mais n'est pas visible du compte) | `server/routes/admin.js:148-149` | bas |
| E8 | `authz_csrf_fail` | jeton CSRF absent ou faux sur une session valide | `app.verifyCsrf` | moyen |
| E9 | `privilege_permissions_changed` | rôles, statut ou photographe lié d'un compte modifiés, par l'application **ou** hors d'elle (déclencheur SQLite, `DS8`) | `server/accounts.js:150`, déclencheur | haut si `admin` est donné |
| E10 | `user_created` (`admin` par amorce), `user_deleted`, `user_rescued` | amorce par le rôle Zitadel, `ADMIN_SUBS` | `server/auth.js:205` | haut |
| E11 | `sensitive_read` | lecture d'une fiche personne, d'une rencontre, d'une signature, d'une photo de carte, d'un original, d'un export | routes concernées (`config.sensitive`) | info |
| E12 | `sensitive_export` | export ZIP RGPD, téléchargement d'original | déjà dans `audit_log`, recopié ici | bas |
| E13 | `input_validation_fail` | valeur impossible pour l'interface : clé hors table, `__proto__`, énumération inconnue, identifiant non numérique, champ multipart au nom refusé, méthode HTTP inattendue | validations existantes (elles refusent déjà, elles ne disent rien) | moyen |
| E14 | `malicious_input` | motif d'injection reconnu dans une saisie (`DS11`) | crochet `preValidation` commun au public et à l'admin | moyen |
| E15 | `upload_rejected` | fichier refusé au décodage (polyglotte, bombe de décompression, EXIF piégé, SVG déguisé) | `server/imports.js`, `server/brand.js`, `server/watermark.js` | moyen (haut si répété) |
| E16 | `excess_rate_limit_exceeded` | toute limite de débit atteinte (connexion, `/bonjour`, signalements, descriptions, aperçus Instagram) | `server/ratelimit.js` et limites locales | bas |
| E17 | `malicious_excess_404` | rafale de 404 par adresse | compteur en mémoire | bas → moyen |
| E18 | `malicious_honeypot` | chemin piège (`/.env`, `/.git/config`, `/wp-login.php`, lien caché interdit par `robots.txt`), champ piège de `/bonjour` rempli | route dédiée | bas à moyen |
| E19 | `token_guess` | jeton faux sur `/pour-vous/…`, `/partage/instagram/…`, code de carte faux, référence `/bonjour/…` inconnue | routes publiques | bas |
| E20 | `crypto_decrypt_fail` | un chiffré `enc1:` ne se déchiffre pas (mauvaise clé, donnée altérée, sauvegarde volée réinjectée) | `server/vault.js` | haut |
| E21 | `sys_startup`, `sys_config_changed` | démarrage ; empreinte de la configuration de sécurité différente du démarrage précédent (`DS19`) | `server/index.js` | info / haut |
| E22 | `sys_restore` | une restauration a eu lieu depuis le dernier démarrage | `server/db/restore.js` | haut |
| E23 | `sys_crash`, `sys_error_burst` | 5xx | crochet `onError` (`server/app.js:286`) | bas → moyen |
| E24 | `log_integrity_fail` | chaîne du journal rompue, trou dans les identifiants | vérification quotidienne (`J5`) | critique |

### 2.3 Volume (`J2`, **I**)

- **Admin** : chaque requête authentifiée produit déjà une écriture d'audit ; `security_events` n'ajoute une ligne que pour les types ci-dessus. Deux utilisateurs : quelques centaines de lignes par jour.
- **Public** : on **n'écrit pas une ligne par visite** (SQLite et l'écoconception y perdraient). Les compteurs par adresse (404, pages, images, jetons faux) vivent en mémoire, en fenêtres glissantes bornées comme `server/ratelimit.js` ; seul le **franchissement d'un seuil** devient un événement. Un afflux d'événements d'une même adresse est résumé (« 1 240 requêtes en 10 min ») au lieu d'être écrit 1 240 fois : au plus 60 lignes par adresse et par heure, puis une ligne de synthèse.

### 2.4 Ce qu'on ne journalise jamais (`J3`, **I**)

Jetons de session, cookies, jetons CSRF, code et `state` OIDC, `id_token`, jetons de photo offerte et d'image Instagram, `DATA_KEY`, secrets, corps de requête complets, et **aucune donnée personnelle des personnes photographiées** (nom, e-mail, message) : un événement sur une fiche porte son identifiant, jamais son contenu.

Une saisie suspecte (`E14`) n'est gardée que sur 200 caractères, **neutralisée** (caractères de contrôle et retours à la ligne remplacés, pour que le journal ne puisse pas être falsifié par une saisie [3]) et toujours affichée échappée. L'écran Sécurité est lui-même une cible : une charge XSS déposée dans un formulaire public ne doit pas s'exécuter chez l'administrateur qui la lit (la CSP stricte actuelle tient, mais l'échappement reste la première barrière).

### 2.5 Durées (`J4`, **C**)

| Données | Durée proposée | Raison |
|---|---|---|
| `security_events` | 6 mois | recommandation de la CNIL pour les journaux de sécurité : 6 mois à 1 an [4] |
| Alertes et leur traitement | 13 mois | comme le **Journal** (`audit_log`) |
| Sessions révoquées (`sessions_revoked`) | 48 h | au-delà de la durée maximale d'une session (24 h) |
| Compteurs en mémoire | 24 h au plus | perdus au redémarrage, sans gravité |
| Adresses bloquées | 24 h par défaut, 30 jours au plus | |

### 2.6 Intégrité du journal (`J5`, **I**)

Un attaquant qui a pris la main cherche d'abord à effacer ses traces.

- **Chaîne** : chaque ligne de `security_events` et d'`audit_log` porte `chain = HMAC(clé, ligne ‖ chain précédent)`, avec une clé `LOG_KEY` du `.env` (ou dérivée de `COOKIE_SECRET` par HKDF), jamais dans la base. Une vérification quotidienne (et à la demande depuis l'écran) recalcule la chaîne : une ligne modifiée, supprimée ou insérée hors de l'application rompt la chaîne (`E24`, critique). La purge des lignes anciennes garde l'ancre (`chain` de la dernière ligne purgée) dans `settings`.
- **Copie hors d'atteinte** : chaque alerte haute ou critique part par e-mail au moment où elle naît, et chaque événement est aussi écrit en JSON sur la sortie standard (journaux Docker d'Unraid). Effacer la base ne fait pas disparaître ces copies.
- **Aucune route ne supprime** un événement ; seule la purge de rétention le fait.

### 2.7 RGPD (`J6`, **I**)

Garder l'adresse complète d'un visiteur sort du cadre actuel (« le site ne conserve pas l'adresse »). Base légale : l'intérêt légitime de sécuriser le site (RGPD art. 6-1-f et art. 32 [5]), dans la limite de 6 mois [4]. Conditions :

- l'adresse d'un **visiteur** n'est écrite qu'à la survenue d'un événement suspect (seuil franchi, piège, saisie malveillante), jamais pour une visite normale ; la mesure d'audience reste inchangée et sans donnée personnelle ;
- l'adresse et la position des **comptes de l'admin** sont gardées à chaque connexion (ils en sont informés dans l'aide et dans **Mes sessions**) ;
- `/confidentialite` (`server/privacy.js`) et le registre ([RGPD](../wiki/RGPD.md)) sont mis à jour dans la même PR que le socle (règle du projet) ;
- l'écran Sécurité est réservé aux administrateurs, et sa consultation est elle-même journalisée.

---

## 3. Cas de détection

Pour chaque cas : le signal, la règle (valeurs par défaut réglables), la gravité, la réponse. « Auto » désigne une réponse automatique, toujours réversible depuis l'écran. Les seuils sont pensés pour deux photographes et un site public modeste : ils seront recalés après un mois de mesure en mode « observer seulement » (`D3`).

### 3.1 Authentification et sessions

**DS1 — Jeton de session rejoué après sa fin.** Un cookie dont l'empreinte figure dans `sessions_revoked` (déconnexion, expiration, fermeture par un admin, compte désactivé) est présenté. Un navigateur normal a perdu ce cookie ; sa réapparition signe une copie du cookie (vol par un logiciel espion, sauvegarde du navigateur, poste partagé). Règle : une occurrence. Gravité : **haut** ; critique si la session avait été fermée pour suspicion. Réponse : alerte, e-mail ; auto : fermeture de toutes les sessions du compte si l'adresse n'est pas celle de la session d'origine. AppSensor SE6 [2].

**DS2 — Session reprise ailleurs (vol de cookie).** Une session valide change de contexte en cours de vie : famille de navigateur ou système différents (Safari iOS → Chrome Windows), pays différent, ou réseau très éloigné. Un changement d'adresse dans le même pays et le même opérateur (téléphone qui passe du Wi-Fi à la 4G) est normal : il est noté, pas alerté. Règle : navigateur différent = **haut** ; pays différent avec le même navigateur = **moyen** (VPN, roaming) ; les deux = **critique**. Réponse : alerte ; auto pour « critique » : session fermée, l'utilisateur légitime se reconnecte par Zitadel. Nécessite de garder adresse, pays, position et navigateur à la création de la session (migration de `sessions`). AppSensor SE5 [2].

**DS3 — Voyage impossible.** Deux événements d'un même compte (connexions, ou activité de deux sessions) depuis deux positions dont la vitesse apparente dépasse 900 km/h, distance supérieure à 500 km (pour ignorer les écarts de géolocalisation d'un même pays). Position : en-têtes de localisation de Cloudflare (`cf-iplatitude`, `cf-iplongitude`, à activer, `D2`) ; à défaut, centre du pays (`server/pays-centres.json`, déjà dans le dépôt) avec un seuil plus prudent (pays non limitrophes en moins de 2 h). Gravité : **haut**. Réponse : alerte et e-mail au compte concerné et aux administrateurs ; rien d'automatique (un VPN d'entreprise suffit à le provoquer). Exception réglable : adresses ou pays connus (VPN de l'un des auteurs).

**DS4 — Connexion depuis un nouvel appareil ou un nouveau pays.** Première connexion d'un compte depuis une famille de navigateur ou un pays jamais vus en 90 jours. Gravité : **bas**. Réponse : e-mail **au titulaire du compte** (« Nouvelle connexion : Safari sur iPhone, Lisbonne, 14 h 02 ; ce n'est pas vous ? fermez la session ») — c'est la détection la plus efficace contre la prise de compte, parce que seul le titulaire sait si c'était lui.

**DS5 — Attaque du parcours OIDC.** Échecs `state`, `nonce`, signature, émetteur ou audience, et codes rejoués (`E1`) : 3 en 10 minutes par adresse, ou 10 par heure tous confondus. Un utilisateur normal n'en produit presque jamais (au plus un `state` expiré après un onglet oublié). Gravité : **moyen**, haut au-delà de 10. Réponse : alerte ; auto : adresse bloquée 1 h sur `/auth/*`.

**DS6 — Sollicitation de la connexion de test en production.** Tout accès à la route de connexion locale alors qu'elle est désactivée (`E3`) : personne de légitime ne la connaît en production. Gravité : **moyen**, et l'adresse prend un score élevé (`DS22`).

**DS7 — Comptes « en attente » en rafale.** Plus de 3 nouveaux `sub` inconnus en 24 h (`E2`) : quelqu'un a obtenu de se connecter chez Zitadel (inscription libre réactivée, IdP externe mal réglé) et frappe à la porte. Gravité : **moyen**. Réponse : alerte, rappel de vérifier l'inscription libre dans Zitadel (`PLAN.md`, « Côté Zitadel », point 4).

### 3.2 Droits et élévation de privilèges

**DS8 — Rôle changé hors de l'application.** C'est le cas cité : « un utilisateur passe tout à coup admin sans qu'un admin ait explicitement donné le droit ». Deux mécanismes complémentaires :

1. **Déclencheur SQLite** sur `accounts` (`AFTER INSERT`, `AFTER UPDATE OF roles, status, author_id, adjust`, `AFTER DELETE`) : il écrit l'ancien et le nouvel état dans `account_changes`, **quel que soit l'auteur de la modification** — l'application, un `sqlite3` lancé sur le serveur, une restauration, une injection SQL. Un déclencheur se contourne seulement en le supprimant, ce que détecte le point 3.
2. **Rapprochement** : l'application, quand elle modifie un compte (`server/accounts.js:150`, `remove`, amorce de `server/auth.js`), écrit d'abord, dans la même transaction, un « ticket » (`account_change_tickets` : identifiant de requête, `sub` de l'auteur, action). Le déclencheur relie la ligne au ticket ouvert. Une ligne de `account_changes` **sans ticket** = changement hors application.
3. **Contrôle d'état** au démarrage et toutes les heures : liste des administrateurs actifs comparée à la dernière liste connue, présence des déclencheurs (`sqlite_master`), empreinte du schéma.

Gravité : **critique** (sans ticket, ou déclencheur disparu) ; **haut** pour tout `admin` donné par l'application (normal mais rare : on veut le savoir). Réponse : e-mail immédiat à tous les administrateurs ; auto (réglable, activé par défaut) : le compte promu hors application est remis à son état précédent et ses sessions fermées.

**DS9 — Configuration de sécurité changée.** Au démarrage, une empreinte de `ADMIN_SUBS`, `OIDC_ALLOWED_SUBS`, `OIDC_ORG_ID`, `OIDC_ISSUER`, `TRUST_PROXY`, la présence de `DATA_KEY` (son empreinte, pas sa valeur) et le mode EXIF est comparée à celle du démarrage précédent (`settings`). Un sub ajouté à `ADMIN_SUBS` crée un administrateur sans passer par **Comptes et rôles** : c'est l'autre porte d'élévation. Gravité : **haut**. Réponse : alerte qui liste ce qui a changé (noms des variables, sub ajoutés), e-mail.

**DS10 — Exploration des droits (IDOR).** Un compte enchaîne les 403 et les 404 de portée (`E7`) : 10 en 10 minutes, ou des identifiants qui se suivent (`/admin/personnes/41`, `/42`, `/43`…). Un photographe qui clique dans l'interface ne rencontre jamais une ressource hors de sa portée : l'interface ne la lui montre pas. Gravité : **moyen**, haut si identifiants consécutifs. Réponse : alerte. AppSensor ACE3 [2].

### 3.3 Saisies et injections

**DS11 — Saisie malveillante.** Un crochet commun inspecte les paramètres de chemin, la requête, les champs de formulaire (pas les fichiers), les noms de champs multipart, et les en-têtes `User-Agent` et `Referer`, avec une liste courte de motifs **à faible taux de faux positifs** :

| Famille | Exemples de motifs | Remarque |
|---|---|---|
| SQL | `union select`, `' or 1=1`, `sleep(`, `benchmark(`, `; drop table`, `sqlite_master` | une apostrophe seule ne suffit jamais (« l'aube », « aujourd'hui ») |
| XSS | `<script`, `javascript:`, `onerror=`, `onload=`, `<svg/onload`, `srcdoc=` | |
| Gabarits | `<%`, `${`, `{{7*7}}`, `#{` | Eta utilise `<%` : à surveiller en priorité |
| Chemins | `../`, `..\`, `%2e%2e`, `/etc/passwd`, `file://` | |
| Commandes | `$(`, `` `id` ``, `; cat `, `| nc ` | |
| SSRF | `169.254.169.254`, `localhost:`, `gopher://` | champs d'URL (Instagram, liens) |
| Prototype | `__proto__`, `constructor[prototype]` | déjà refusés (`server/routes/admin.js`), désormais signalés |
| Journal | `%0d%0a`, retour à la ligne dans un champ d'une ligne | |
| Outils | `sqlmap`, `nikto`, `nuclei`, `acunetix`, `wpscan` dans le navigateur | AppSensor RE7 |

Les requêtes préparées et l'échappement font qu'une tentative **n'est pas une réussite** : l'événement dit « tentative », pas « incident ». Règle : 1 occurrence = événement `moyen` ; 3 familles différentes ou 5 occurrences par adresse en 1 h = alerte **haut** (c'est un scanner) ; une occurrence **depuis une session de l'admin** = alerte **haut** immédiate (un compte de l'admin qui tape `union select` est un compte volé ou un test : dans les deux cas on veut le savoir). Réponse : score de l'adresse (`DS22`).

**DS12 — Valeur impossible pour l'interface.** Le meilleur signal, parce qu'un navigateur qui suit l'interface ne peut pas le produire : option de liste hors de ses valeurs, clé de table inconnue, identifiant non numérique, champ caché modifié, méthode HTTP inattendue (`PUT`, `TRACE`, `DELETE` sur le site public), en-tête `Origin` étranger sur `/bonjour`, liste d'identifiants au-delà de 5 000. Le site les refuse déjà ; il les **signale** désormais (`E13`). Règle : 2 en 10 minutes par session ou par adresse. Gravité : **moyen** (public), **haut** (admin). AppSensor IE2, RE3, RE4 [2].

**DS13 — Fichier piégé.** Fichier refusé au décodage réel (`E15`) : polyglotte, bombe de décompression, EXIF piégé, SVG sous une extension d'image. Seuls des comptes de l'admin envoient des fichiers : le HEIC d'iPhone, refusé mais légitime, est exclu. Règle : 1 occurrence hors HEIC. Gravité : **haut**.

**DS14 — Échec CSRF sur une session valide.** Un formulaire sans le bon jeton, alors que la session est bonne (`E8`) : page tierce qui tente une écriture au nom de l'administrateur, ou jeton périmé après une longue absence. Règle : 3 en 1 h pour un compte. Gravité : **moyen**.

### 3.4 Siphonage

**DS15 — Aspiration du site public.** Par adresse et par réseau (/24, /48), en mémoire :

- pages HTML (`/photo/…`, `/auteur/…`, séries) : plus de 120 en 10 minutes ;
- images servies par le site lui-même (`/media/…`, celles qui manquent au cache de Cloudflare) : plus de 300 en 10 minutes, ou toutes les tailles d'une même photo ;
- parcours systématique : identifiants ou slugs dans l'ordre, sans `Accept-Language`, sans ressources de la page (CSS) ;
- **lien piège** : un lien invisible dans les pages (masqué en CSS, `rel="nofollow"`, interdit par `robots.txt`, inaccessible au clavier et aux lecteurs d'écran par `aria-hidden` et `tabindex="-1"`) ; un robot qui ignore `robots.txt` le suit, un humain jamais. AppSensor HT [2].

Gravité : **bas** (seuil), **moyen** (lien piège ou parcours systématique). Réponse : auto : réponse 429 pour cette adresse pendant 1 h ; alerte seulement au-delà de 3 adresses d'un même réseau (aspiration distribuée). Les robots déclarés et vérifiés (moteurs de recherche) sont exclus par leur nom **et** par la vérification de Cloudflare (`cf-verified-bot` si disponible, `D2`).

**DS16 — Énumération des jetons et références.** Jetons faux sur `/pour-vous/…` et `/partage/instagram/…`, références `/bonjour/…` inconnues, codes de carte faux (`E19`) : 10 en 1 h par adresse. Les jetons ont 192 bits : l'attaque ne peut pas réussir, mais elle désigne un acteur qui cherche. Gravité : **bas**, moyen au-delà de 50.

**DS17 — Aspiration depuis l'admin.** Un compte authentifié lit beaucoup plus que d'habitude : plus de 200 photos ou 50 originaux en 1 h, `/admin/photos/donnees?ids=` sur de très longues listes, export de la photothèque en boucle. Seuils relatifs : 5 fois la moyenne du compte sur 30 jours, avec un minimum absolu. Gravité : **moyen** ; **haut** pour les originaux (ils portent le GPS).

### 3.5 Données personnelles

**DS18 — Accès inhabituel aux données personnelles.** Les fiches personnes, les rencontres, signatures, photos de carte et exports deviennent des lectures journalisées (`E11`). Règles :

| Règle | Seuil par défaut | Gravité |
|---|---|---|
| Fiches différentes lues par un compte | 30 en 1 h, ou 5 fois sa moyenne sur 30 jours | moyen |
| Exports ZIP RGPD | plus de 3 par jour, ou un export sans demande RGPD ouverte sur la personne | moyen / haut |
| Lecture depuis un appareil ou un pays nouveaux dans les 24 h suivant `DS4` | 1 | haut |
| Lecture de nuit (0 h – 6 h, heure de Paris), si le compte n'en a jamais fait | 1 | bas |
| Échec de déchiffrement (`E20`) | 1 | haut (critique si plus de 10) |

Un échec de déchiffrement signale soit une `DATA_KEY` perdue, soit une donnée altérée ou réinjectée depuis une sauvegarde volée : dans tous les cas, quelqu'un doit regarder. Réponse : alerte, e-mail ; pas de blocage automatique (un administrateur qui traite une demande d'accès doit pouvoir travailler).

### 3.6 Système et intégrité

**DS19 — Configuration et démarrage.** Voir `DS9` pour la configuration. S'y ajoutent : restauration de la base depuis le dernier démarrage (`E22`, **haut** : une restauration peut ramener un rôle retiré) ; démarrage avec `DATA_KEY` absente alors qu'elle existait (**critique**).

**DS20 — Journal altéré.** Chaîne rompue ou identifiants manquants (`E24`). Gravité : **critique**. Réponse : e-mail immédiat ; l'écran affiche un bandeau rouge jusqu'à acquittement.

**DS21 — Rafale d'erreurs.** Plus de 10 réponses 5xx en 10 minutes pour une adresse (fuzzing qui trouve un cas non prévu), ou plus de 50 au total (panne ou attaque de déni de service applicatif). Gravité : **moyen**.

### 3.7 Corrélation

**DS22 — Score d'une adresse.** Chaque événement donne des points à son adresse et à son réseau (piège : 20, saisie malveillante : 15, valeur impossible : 10, 404 en rafale : 5, jeton faux : 3), qui décroissent de moitié toutes les heures, à la manière de fail2ban. Au-delà de 50 : alerte **moyen** et, auto, blocage 24 h (réponse 403 sobre, sans détail) ; au-delà de 100 : **haut**. Une adresse déjà vue sur une session de l'admin n'est **jamais** bloquée automatiquement (on ne s'enferme pas dehors) : l'alerte suffit.

**DS23 — Chaîne d'attaque.** Une même adresse ou un même compte cumule, en 24 h, des événements de trois familles (reconnaissance : 404, pièges ; tentative : injections, valeurs impossibles ; accès : connexion réussie, lecture sensible). Gravité : **critique** : c'est le scénario « scan, puis faille, puis exploitation ».

**DS24 — Silence anormal.** Plus aucun événement de démarrage, de purge ou de vérification de chaîne depuis 26 h (`sys_monitor_disabled` [1]) : le moteur de détection a été arrêté ou contourné. Contrôlé de l'extérieur par le conteneur de sauvegarde, qui tourne déjà chaque jour et peut lire la date du dernier contrôle. Gravité : **haut**.

### 3.8 Tableau récapitulatif

| Cas | Demandé | Gravité max | Réponse auto | AppSensor [2] |
|---|---|---|---|---|
| DS1 Jeton rejoué | oui | critique | sessions fermées | SE6 |
| DS2 Session reprise ailleurs | oui | critique | session fermée | SE5 |
| DS3 Voyage impossible | oui | haut | — | AE (tendance) |
| DS4 Nouvel appareil | — | bas | e-mail au titulaire | UT |
| DS5 Parcours OIDC | — | haut | blocage 1 h | AE |
| DS6 Connexion de test | — | moyen | score | HT |
| DS7 Comptes en attente | — | moyen | — | AE |
| DS8 Rôle hors application | oui | critique | rôle remis, sessions fermées | ACE |
| DS9 Configuration changée | oui | haut | — | — |
| DS10 IDOR | oui | haut | — | ACE3 |
| DS11 Saisie malveillante | oui | haut | score | IE, CIE |
| DS12 Valeur impossible | oui | haut | score | IE2, RE |
| DS13 Fichier piégé | oui | haut | — | FIO |
| DS14 CSRF | — | moyen | — | — |
| DS15 Aspiration publique | oui | moyen | 429 1 h | RE, HT |
| DS16 Énumération de jetons | — | moyen | score | — |
| DS17 Aspiration admin | oui | haut | — | UT |
| DS18 Données personnelles | oui | critique | — | UT |
| DS19 Démarrage, restauration | — | critique | — | STE |
| DS20 Journal altéré | — | critique | — | — |
| DS21 Rafale d'erreurs | — | moyen | — | STE |
| DS22 Score d'adresse | — | haut | blocage 24 h | RP |
| DS23 Chaîne d'attaque | — | critique | — | — |
| DS24 Silence anormal | — | haut | — | — |

---

## 4. Moteur de règles

- **Règles en temps réel** (`DS1`, `DS2`, `DS5`, `DS8`, `DS11`, `DS12`, `DS15`, `DS22`) : évaluées à l'écriture de l'événement, sur des compteurs en mémoire (fenêtres glissantes bornées, mêmes garde-fous que `server/ratelimit.js` : mémoire plafonnée, IPv6 par /64).
- **Règles périodiques** (`DS3`, `DS4`, `DS7`, `DS10`, `DS17`, `DS18`, `DS23`, `DS24`) : requêtes SQL toutes les 5 minutes sur `security_events`, indexé par `at`, `sub`, `ip_net`, `type`.
- **Règles déclarées dans le code**, une par fichier ou une table : identifiant, description, seuils par défaut, gravité, réponse. Les seuils se règlent dans l'écran (`EC5`) ; une règle peut passer en « observer seulement » (elle ouvre l'alerte, sans réponse automatique ni e-mail).
- **Alerte** = règle + entité (compte, adresse, réseau, session) + fenêtre. Une alerte ouverte absorbe les événements suivants de la même règle et de la même entité au lieu d'en ouvrir une autre (compteur et dernière occurrence mis à jour) : jamais 300 alertes pour un scan.
- **Exceptions** : une alerte classée « faux positif » peut créer une exception (règle + entité, durée), visible et révocable dans l'écran.

Tables : `security_events`, `security_alerts` (règle, entité, gravité, statut, compteur, première et dernière occurrence, traité par, note), `security_alert_events` (lien), `security_blocks` (adresse ou réseau, motif, fin), `security_exceptions`, `sessions_revoked`, `account_changes`, `account_change_tickets`.

---

## 5. Écran « Sécurité »

Nouvelle entrée de menu de l'admin, sous **Journal**. Permissions nouvelles : `securite.voir` et `securite.traiter`, données au seul rôle Administrateur (fermé par défaut, comme les autres). Même gabarit et mêmes composants que le reste de l'admin, utilisable sur iPhone ; une maquette passera par le jury habituel avant le code (`audit-ux-maquettes`).

**EC1 — Vue d'ensemble.** En tête, l'état en une phrase (« Aucune alerte ouverte » ou « 2 alertes hautes à traiter »), puis les alertes ouvertes triées par gravité puis date : gravité (pastille **et** mot, jamais la couleur seule), règle en clair (« Session reprise depuis un autre navigateur »), entité, nombre d'occurrences, dernière occurrence. Sous la liste, trois indicateurs sur 7 jours : connexions, adresses bloquées, tentatives repoussées ; et l'état de l'intégrité (« Journal vérifié il y a 3 h, intact »).

**EC2 — Fiche d'une alerte.** Ce qui s'est passé en une phrase, la chronologie des événements liés (date, adresse, pays, navigateur, route, statut), les autres alertes de la même entité, et les actions :

- fermer la session, fermer toutes les sessions du compte ;
- désactiver le compte (renvoie à **Comptes et rôles**, avec confirmation) ;
- bloquer l'adresse ou le réseau (1 h, 24 h, 7 jours, 30 jours) ; débloquer ;
- classer : « Incident confirmé », « Faux positif » (avec exception éventuelle), « Test » ; note libre ;
- chaque action est elle-même journalisée (`audit_log` et `security_events`).

**EC3 — Événements.** La liste brute, filtrable par type, gravité, compte, adresse, période ; chaque saisie suspecte est affichée échappée, en police à chasse fixe, tronquée. Export CSV pour une analyse extérieure ou un dépôt de plainte.

**EC4 — Connexions et sessions.** Par compte : sessions ouvertes (appareil, pays, ville, début, dernière activité) avec « Fermer » ; connexions des 90 derniers jours ; pays et appareils connus. **Mes sessions** (pour chaque compte, sans permission particulière, dans le menu du compte) : ses propres sessions, avec « Fermer les autres sessions ». Bonne pratique : l'utilisateur légitime est le meilleur détecteur d'une session qui n'est pas la sienne.

**EC5 — Réglages et intégrité.** Seuils et mode de chaque règle, destinataires des e-mails, durée des blocages, adresses de confiance (jamais bloquées), exceptions en cours ; liste des administrateurs avec, pour chacun, qui lui a donné le rôle et quand (lue dans `account_changes`) ; état des déclencheurs et de la chaîne, bouton « Vérifier maintenant ».

---

## 6. Alertes et notifications

| Gravité | Écran | Badge du menu et « Aujourd'hui » | E-mail |
|---|---|---|---|
| info, bas | événement seulement (pas d'alerte, sauf `DS4` au titulaire) | — | — |
| moyen | alerte | « bientôt » | dans le récapitulatif quotidien de sécurité (8 h, s'il y a quelque chose) |
| haut | alerte | « urgent » | immédiat |
| critique | alerte, bandeau rouge sur toutes les pages de l'admin des administrateurs | « urgent » | immédiat, à tous les administrateurs, objet préfixé `[Critique]` |

- **AL1 — Réutiliser l'existant.** Les alertes entrent dans « Aujourd'hui » (`server/todo.js`, niveaux `urgent` et `bientot`) et dans le badge ; les e-mails passent par le mailer existant (`server/mailer.js`, `SMTP_URL`), avec le même principe que les relances RGPD (`server/reminders.js`) : **ni nom ni adresse d'une personne dans l'e-mail**, la règle, l'entité technique et un lien vers la fiche de l'alerte.
- **AL2 — Pas de bombardement.** Un e-mail par alerte à son ouverture, puis au plus un rappel par heure tant qu'elle grossit ; au plus 20 e-mails de sécurité par heure au total, au-delà un seul e-mail de synthèse (« 46 alertes en une heure, voir l'écran »). Un attaquant ne doit pas pouvoir épuiser le quota du serveur de messagerie ni noyer la vraie alerte.
- **AL3 — Le canal ne dépend pas que du site.** Si le serveur de messagerie refuse, l'échec est un événement et l'alerte reste à l'écran. Plus tard (phase D) : un canal de secours par webhook (ntfy auto-hébergé, ou application de messagerie), pour une notification sur le téléphone même quand l'e-mail est en panne.
- **AL4 — Lien de l'e-mail.** Il mène à `/admin/securite/alertes/:id`, derrière la connexion Zitadel : l'e-mail ne contient rien qui permette d'agir sans se connecter (un e-mail intercepté n'ouvre rien).

---

## 7. Limites et défenses complémentaires

| Angle mort | Pourquoi | Ce qui couvre |
|---|---|---|
| Mots de passe et double authentification | Le site ne voit aucun mot de passe : les essais ont lieu chez Zitadel et Google | Activer la double authentification obligatoire dans Zitadel pour les comptes de l'admin ; consulter ses événements (Zitadel les garde) ; phase D : lire l'API des événements de Zitadel (échecs de connexion, MFA ajoutée ou retirée) |
| Images servies par le cache de Cloudflare | `CDN-Cache-Control: max-age=86400` : une aspiration des images déjà en cache n'atteint jamais le serveur | Règles de Cloudflare : Bot Fight Mode, une règle de limite de débit sur `/media/` (offre gratuite : une règle) ; `DS15` ne voit que les pages HTML et les images hors cache |
| Lecture directe du fichier de base | SQLite ne déclenche rien sur une lecture | Chiffrement des données personnelles (`DATA_KEY`, hors base et hors sauvegardes) ; droits du fichier ; sur Unraid, surveillance de l'hôte (hors du site) |
| Prise de contrôle du serveur | Un attaquant qui contrôle le processus peut couper la détection | Chaîne du journal (`J5`), copie des alertes par e-mail et dans les journaux Docker, `DS24` contrôlé par un autre conteneur |
| Attaques volumétriques | Le site n'est pas fait pour les absorber | Cloudflare ; `DS21` ne fait que constater |
| Adresse falsifiée | `X-Forwarded-For` accepté de toute adresse privée tant que `TRUST_PROXY` n'est pas fixé (`server/app.js:110`) | **Prérequis** : fixer `TRUST_PROXY` (feuille de route, point 4) |

Du côté de Cloudflare (**R**, hors code) : activer « Add visitor location headers » (en-têtes de position, `DS3`) ; garder les événements de sécurité du WAF pour recouper (offre gratuite : historique court) ; phase D : bloquer une adresse aussi chez Cloudflare par l'API (jeton limité aux règles d'accès IP, qui servirait aussi à la purge du cache déjà prévue dans la feuille de route).

---

## 8. Plan

Une branche et une PR par phase, revue et audit avant la suivante.

| Phase | Contenu | Tests |
|---|---|---|
| **A. Socle** | Tables (`security_events`, `sessions_revoked`, `account_changes`, `account_change_tickets`, contexte des sessions) ; vocabulaire fermé ; émission des événements E1 à E24 aux points du code cités ; adresse et position derrière `TRUST_PROXY` ; chaîne HMAC et vérification quotidienne ; empreinte de configuration au démarrage ; déclencheurs SQLite ; purge à 6 mois ; `/confidentialite`, registre RGPD, page [Sécurité](../wiki/Sécurité.md) | un test par événement (il est émis, il ne contient ni jeton ni donnée personnelle) ; chaîne rompue détectée ; déclencheur qui note une modification faite en SQL direct |
| **B. Détections** | Moteur (temps réel et périodique), règles DS1 à DS24 en mode « observer seulement » par défaut, alertes et regroupement, score d'adresse, blocages, lien piège et chemins pièges | un test par règle : le scénario d'attaque ouvre l'alerte, le parcours normal correspondant (changement de Wi-Fi, apostrophe dans une légende, robot de recherche vérifié) n'en ouvre pas |
| **C. Écran et alertes** | Écran **Sécurité** (EC1 à EC5) après maquettes et jury ; **Mes sessions** ; « Aujourd'hui » et badge ; e-mails immédiats et récapitulatif ; actions de réponse ; aide intégrée | e2e : parcours d'un administrateur qui reçoit une alerte, l'ouvre, ferme la session, la classe ; un relecteur n'a pas accès (403) |
| **D. Compléments** | Après un mois d'observation : seuils recalés, réponses automatiques activées règle par règle ; blocage chez Cloudflare par l'API ; webhook (ntfy) ; événements de Zitadel ; **jeu d'attaques** rejouable (`scripts/`, contre l'instance de démonstration seulement) qui déclenche chaque règle et vérifie l'alerte | le jeu d'attaques lui-même |

Ordre de grandeur : A et B sont le gros du travail (migrations, une trentaine de points d'émission, une vingtaine de règles et leurs tests) ; C suit le cycle habituel maquettes → jury → code.

---

## 9. Décisions

Validées le 17 octobre 2026 telles que proposées. Décisions suivantes (D8 à D15) : annexes [architecture](annexe-vigie-architecture.md) et [Cloudflare](annexe-vigie-cloudflare.md).

| Id | Question | Décision |
|---|---|---|
| D1 | Durée de conservation des événements de sécurité | 6 mois (bas de la fourchette de la CNIL [4]) |
| D2 | Activer les en-têtes de position de Cloudflare (ville, latitude, longitude) | Oui : sans eux, `DS3` ne raisonne qu'au pays |
| D3 | Réponses automatiques dès la mise en ligne, ou un mois d'observation d'abord | Un mois d'observation, sauf `DS1` et `DS8` (fermeture de sessions, rôle remis) actives tout de suite |
| D4 | Destinataires des e-mails de sécurité | Tous les administrateurs ; `DS4` au seul titulaire du compte |
| D5 | Canal de secours (ntfy ou autre) | En phase D, si l'e-mail seul ne suffit pas à l'usage |
| D6 | Clé de la chaîne du journal | `LOG_KEY` à part dans le `.env` (pas dérivée de `COOKIE_SECRET`, pour pouvoir changer l'un sans casser l'autre) |
| D7 | Double authentification obligatoire chez Zitadel pour les comptes de l'admin | Oui, avant la phase A : c'est la protection la plus efficace contre la prise de compte, que les journaux ne font que constater |

---

## Sources

1. OWASP, *Logging Vocabulary Cheat Sheet* (noms d'événements `authn_*`, `authz_*`, `session_*`, `input_validation_fail`, `malicious_*`, `privilege_permissions_changed`, `sensitive_*`, `sys_*`). https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html
2. OWASP, *AppSensor* : points de détection applicatifs (familles RE, AE, SE, ACE, IE, CIE, FIO, HT, UT, STE, RP) et réponses. https://owasp.org/www-project-appsensor/
3. OWASP, *Logging Cheat Sheet* (ce qu'il faut journaliser, ce qu'il ne faut jamais journaliser, injection dans les journaux, protection des journaux). https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
4. CNIL, délibération n° 2021-122 du 14 octobre 2021 portant adoption d'une recommandation relative à la journalisation (durée de 6 mois à 1 an). https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation
5. Règlement (UE) 2016/679 (RGPD), articles 5-1-c (minimisation), 6-1-f (intérêt légitime), 32 (sécurité du traitement). https://eur-lex.europa.eu/eli/reg/2016/679/oj
6. ANSSI, *Recommandations de sécurité pour la mise en œuvre d'un système de journalisation* (horodatage, centralisation, protection et conservation des journaux). https://cyber.gouv.fr/publications/recommandations-de-securite-pour-la-mise-en-oeuvre-dun-systeme-de-journalisation
7. OWASP, *Application Security Verification Standard* 4.0.3, chapitre V7 « Error Handling and Logging ». https://owasp.org/www-project-application-security-verification-standard/
8. Cloudflare, *Managed Transforms* : « Add visitor location headers » (`cf-ipcity`, `cf-iplatitude`, `cf-iplongitude`…). https://developers.cloudflare.com/rules/transform/managed-transforms/reference/
