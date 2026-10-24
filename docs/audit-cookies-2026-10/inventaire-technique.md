# Diagnostic complet des cookies et des stockages du navigateur

Date : **24 octobre 2026**. Site Nicephos, dépôt `deux-regards`.

Cette annexe conserve le diagnostic initial et ses preuves. Le [rapport principal révisé](README.md) distingue désormais conformité, sécurité et technique, ainsi que site public, administration et Vigie. Il prévaut pour les propositions selon la nouvelle politique : aucune copie privée persistante en clair et suppression des caches évitables. Les propositions antérieures de conserver certaines copies ne valent pas décision de mise en œuvre.

**Le code contient douze familles de cookies applicatifs : dix pour le site et son administration, deux pour la console Vigie.** Leur usage concerne des services demandés par l’utilisateur : connexion, accès privé, langue, apparence et messages après une action. Aucun cookie publicitaire ni SDK de suivi social n’a été trouvé dans les sources applicatives. Les mécanismes d’authentification examinés ont des protections solides. Les principaux écarts concernent la configuration HTTPS, la conservation locale des brouillons, l’effacement effectif des données et la précision de l’information publiée.

**135 tests ciblés passent, sans échec ni test ignoré.** Des contrôles complémentaires et un parcours Chromium sur une instance jetable sont détaillés dans la section « Vérifications et preuves ». Aucune prise de compte ni faille critique n’a été démontrée. Ce diagnostic ne certifie pas les cookies ajoutés par les services réellement déployés : Cloudflare et Zitadel nécessitent une observation de leurs propres parcours.

## 1. Périmètre et méthode

Version examinée : **1.217.0**, commit **`f44cdf31f8c8c8893071e9350962cdf1370202ee`**, dernier `origin/main` récupéré au début du diagnostic. L’arbre principal de la machine était sur `c611862` ; les vérifications ont été réalisées dans un worktree séparé. Cela identifie le code audité, sans présumer la version actuellement servie au public.

Le recensement couvre :

- toutes les créations, lectures et suppressions de cookies dans `server/`, les gabarits, les scripts publics et `vigie/console/` ;
- les sessions, transactions OIDC et Instagram, contrôles CSRF, rotations, expirations et révocations ;
- les stockages `localStorage` et `sessionStorage`, la mesure d’audience et les points d’entrée des services extérieurs ;
- les textes français, anglais et allemands, le registre RGPD, la configuration, l’aide et les tests existants.

Les recherches ont porté notamment sur `cookie`, `setCookie`, `clearCookie`, `document.cookie`, `cookieStore`, `localStorage`, `sessionStorage`, `indexedDB`, `serviceWorker` et les en-têtes HTTP correspondants. Les dépendances serveur sont utilisées pour analyser le comportement de l’application ; ce travail n’est pas un audit de vulnérabilités de toutes les dépendances.

**Aucune base réelle, sauvegarde, configuration secrète ou donnée de production n’a été consultée.** Les seules écritures métier ont eu lieu dans des bases neuves créées par les helpers de test du dépôt, avec des données fictives. Aucun changement du fonctionnement du site ni déploiement n’a été effectué.

Dans les tableaux, une « famille » regroupe les variantes HTTP/HTTPS et les noms dynamiques. `oidc-<state>` représente ainsi plusieurs cookies possibles, sans constituer plusieurs finalités. Le nombre de cookies présents dans un navigateur dépend des actions effectuées et des chemins parcourus.

## 2. Inventaire exhaustif des cookies du site

### 2.1. Attributs communs

Les **dix familles du site** sont créées côté serveur avec **`HttpOnly`** et **`SameSite=Lax`**. Aucun attribut **`Domain`** n’est défini : les cookies sont liés à l’hôte qui les pose. **`Secure` dépend du protocole de `PUBLIC_URL`**, pas du seul `NODE_ENV` ni du protocole constaté entre le tunnel et le serveur.

Les familles `session`, `oidc-<state>` et `visiteur` prennent le préfixe **`__Host-` en HTTPS**, avec `Path=/`. Les sept autres familles restent sans préfixe. L’absence de préfixe sur une préférence n’est pas en elle-même une faille ; elle doit simplement être décrite correctement.

Le plugin est enregistré dans [server/app.js](../../server/app.js), ligne 137. Une signature vérifie l’intégrité d’une valeur ; elle ne la chiffre pas. Les jetons de session opaques sont vérifiés par leur empreinte en base et n’ont pas besoin d’une signature supplémentaire. `HttpOnly` empêche la lecture par les scripts de la page, mais pas l’utilisation automatique du cookie lors d’un `fetch` authentifié. `Path` limite son envoi ; il ne crée pas une frontière d’autorisation entre pages. Voir la [référence technique Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

### 2.2. Tableau des dix familles

Tous les attributs communs ci-dessus s’appliquent aux lignes suivantes.

| Nom | Fonction et déclenchement | Contenu | Chemin et durée navigateur | Lecture et fin |
|---|---|---|---|---|
| `langue` | Choix explicite par `GET /langue/:lang` | `fr`, `en` ou `de`, valeur contrôlée | `/` ; **365 jours**, remis à jour lors d’un nouveau choix | Lu pour l’orientation linguistique à l’arrivée. Pas de commande dédiée pour le supprimer ; nouveau choix ou effacement navigateur. |
| `bonjour_recap` | Envoi accepté du formulaire `/bonjour`, dans les trois langues | Jeton aléatoire de **16 octets**, 22 caractères ; aucun nom, e-mail ou parent dans le cookie | `/bonjour`, `/en/bonjour` ou `/de/bonjour` ; **900 secondes** | Lu une seule fois sur la page de remerciement, puis récapitulatif retiré du magasin serveur et cookie effacé. Un récapitulatif trop ancien n’est plus affiché. |
| `__Host-visiteur` ; `visiteur` en HTTP | Mot de passe d’une galerie privée accepté | Jeton aléatoire de **32 octets**, 43 caractères ; empreinte SHA-256 seule en base | `/` ; **session navigateur**, ou **30 jours** si « Se souvenir » | Vérifié côté serveur. Rotation après une nouvelle entrée et après « Quitter ». Le cookie n’est pas simplement effacé à la sortie : voir § 4. |
| `__Host-session` ; `session` en HTTP | Connexion OIDC réussie, ou connexion locale de test | Jeton aléatoire de **32 octets** ; empreinte SHA-256 seule en base | `/` ; **8 heures à l’ouverture**, renouvelées dans les parcours admin ; borne serveur de **24 heures** | Expiration, fermeture ou révocation vérifiées côté serveur. Cookie effacé à la déconnexion et lors de plusieurs refus de session. Nouvelle connexion : nouvelle session. |
| `__Host-oidc-<state>` ; `oidc-<state>` en HTTP | Début de connexion ou de vérification d’identité | JSON **signé**, non chiffré : state, nonce, verifier PKCE, destination ; sub et date pour la vérification d’identité | `/` ; **600 secondes** ; **3 transactions au plus** conservées simultanément | Signature et state contrôlés avant l’échange OIDC. Cookie correspondant effacé au callback. Une quatrième ouverture efface les transactions antérieures. |
| `flash` | Message d’administration après une opération suivie d’une redirection | JSON **signé**, non chiffré : type, texte et détails ; certaines valeurs peuvent concerner une personne | `/admin` ; **60 secondes** | Lu au rendu admin, vérifié puis cookie effacé. Le message n’est pas lié à un compte ou à une session particulière. |
| `admin_langue` | `POST /admin/langue`, **seulement sans photographe lié au compte** | `fr`, `en` ou `de` | `/admin` ; **365 jours** | Repli derrière la langue enregistrée sur le photographe. Persiste après déconnexion. |
| `admin_theme` | `POST /admin/theme` | `dark` ou `light` | `/admin` ; **365 jours** | Lu pour rendre l’admin ; supprimé au retour au thème système. Persiste après déconnexion. |
| `ig_state` | Ouverture de la connexion Instagram de l’administration | State aléatoire de **24 octets**, **signé** | `/admin/instagram` ; **600 secondes** | Signature et state comparés au callback, puis cookie effacé. Un seul cookie, donc une nouvelle tentative remplace la précédente. |
| `apercu_theme` | Paramètre `?theme=<thème connu>`, pour un compte ayant `site.apparence` | Identifiant de thème contrôlé | `/` ; **3 600 secondes** | Pris en compte uniquement avec la permission requise ; supprimé par `?theme=off`. Persiste temporairement après déconnexion mais ne confère aucun droit. |

Références du tableau :

| Familles | Sources et lignes |
|---|---|
| Langue et récapitulatif | [server/routes/public.js](../../server/routes/public.js), 33–34, 66–94, 106–113, 259–269, 693–702, 755–759 |
| Visiteur | [server/routes/prive.js](../../server/routes/prive.js), 75–106, 252–265, 564–575 ; [server/visitor-sessions.js](../../server/visitor-sessions.js), 12–75 |
| Session et OIDC | [server/auth.js](../../server/auth.js), 9–16, 46–51, 157–212, 272–338, 394–408, 462–481 ; [server/sessions.js](../../server/sessions.js), 3–60 |
| Messages et préférences admin | [server/routes/admin.js](../../server/routes/admin.js), 108–116, 267–294, 1280–1285, 1314–1319 |
| Instagram | [server/routes/admin.js](../../server/routes/admin.js), 772–791 |
| Aperçu de thème | [server/routes/brand.js](../../server/routes/brand.js), 4–29 |

### 2.3. Ce qu’une simple visite anonyme dépose

Dans un navigateur neuf, l’accueil testé ne dépose **aucun cookie applicatif**. Le choix d’une langue ajoute `langue`. Une connexion à une galerie ajoute le cookie visiteur. Un envoi réussi de `/bonjour` ajoute temporairement `bonjour_recap`.

Les cookies d’admin supposent les parcours correspondants. Une préférence d’administration laissée sur le même hôte peut néanmoins continuer à être envoyée sur les chemins auxquels elle s’applique. Le navigateur ne supprime pas automatiquement les préférences quand le compte se déconnecte.

La langue est commune aux pages du site. Le cookie récapitulatif peut exister sur plusieurs chemins linguistiques : ce sont des entrées distinctes au sens du navigateur, sous un même nom. Il ne contient aucune donnée métier directement lisible.

## 3. Console Vigie

La console est un service séparé, protégé d’abord par Cloudflare Access, puis par l’authentification Zitadel et les droits propres à la Vigie.

| Nom | Contenu et fonction | Attributs | Durée et suppression |
|---|---|---|---|
| `__Host-vigie` | Jeton aléatoire de 32 octets ; seule son empreinte SHA-256 identifie la session en base | Toujours **Secure**, **HttpOnly**, **SameSite=Lax**, **Path=/** ; aucun Domain | Cookie de **session navigateur**, sans Max-Age. Serveur : **15 minutes d’inactivité**, **1 heure absolue**. Sortie, expiration et changement d’identité Access ferment la session et effacent le cookie. |
| `__Host-vigie-tx` | State de la tentative OIDC ; verifier PKCE, nonce, date et retour conservés en base | Même ensemble d’attributs | **600 secondes**, avec **contrôle serveur de dix minutes** et consommation unique de la transaction. Le callback efface le cookie correspondant ; un ancien retour ne doit pas détruire une tentative plus récente. |

Sources : [vigie/console/server.js](../../vigie/console/server.js), 27–30, 176–211, 248–319 ; [vigie/console/sessions.js](../../vigie/console/sessions.js), 7–79.

La console exige une identité Access valide avant les routes et les fichiers statiques. Le cookie de session doit correspondre à l’identité Access de son ouverture. Un cookie Vigie isolé ne suffit donc pas à franchir ce verrou. Les formulaires vérifient CSRF et provenance ; le rafraîchissement automatique ne prolonge pas l’inactivité. Le plafond de droits Zitadel est relu périodiquement et avant les actions admises localement. Les actions sensibles exigent une authentification récente.

La console impose HTTPS dans sa configuration. Ses sessions anciennes sont purgées par une tâche horaire, avec une conservation de sept jours pour les lignes concernées. La durée du cookie, la validité d’accès et la conservation physique d’une ligne sont trois notions distinctes.

La vérification d’identité console actualise `auth_a` sans remplacer le jeton ni le CSRF. Une rotation après cette étape renforcerait la protection d’une session dont une copie existe déjà, sous réserve que cette copie satisfasse aussi Access. Ce point n’est pas un contournement autonome du second facteur.

## 4. Galerie privée : distinguer cookie, session et droit d’accès

**Le cookie ne contient ni mot de passe, ni titre de galerie, ni liste de droits.** Il identifie une session visiteur. Cette session reçoit des autorisations distinctes pour les galeries.

| Élément | Durée ou règle |
|---|---|
| Cookie sans « Se souvenir » | Session navigateur ; aucun Max-Age |
| Cookie avec « Se souvenir » | 30 jours au moment où il est posé |
| Session technique serveur | 30 jours après création ou rotation |
| Autorisation sans souvenir | 12 heures d’inactivité et 7 jours absolus au plus |
| Autorisation avec souvenir | 30 jours au plus |
| Borne supplémentaire des autorisations | Fin de l’invitation et fermeture de la galerie ; suspension et révocation prises en compte à chaque accès |
| Ancien jeton remplacé ou fermé | Empreinte conservée 48 heures pour détecter les rejeux |

Sources : [server/spaces.js](../../server/spaces.js), 21–31, 457–509 ; [server/visitor-sessions.js](../../server/visitor-sessions.js), 12–75.

**« Quitter » retire toutes les autorisations de la session visiteur**, journalise le départ, change le jeton et le CSRF, puis pose un nouveau cookie de session navigateur. La réponse demande l’effacement du cache avec `Clear-Site-Data: "cache"`. Elle ne demande pas l’effacement de tous les cookies ni du stockage local. L’ancien jeton n’ouvre plus la galerie.

Conséquences pratiques :

- un cookie peut encore exister après la fin d’un accès sans autoriser sa consultation ;
- le registre doit distinguer la borne du droit de celle du cookie : « jamais au-delà de l’accès » est exact pour l’autorisation, pas pour le Max-Age constant de 30 jours ;
- un seul cookie dessert plusieurs galeries : entrer dans une seconde galerie sans « Se souvenir » remplace le cookie persistant précédent par un cookie de session, même si un autre accès avait été mémorisé ;
- un cookie inconnu ou expiré n’est pas systématiquement retiré dans le hook privé ; son maintien ne donne pas de droits ;
- les sessions visiteur expirées sont purgées au démarrage puis toutes les heures ; le commentaire « quotidiennes » des routes privées est dépassé.

La fermeture d’un navigateur n’est pas une garantie universelle d’effacement d’un cookie de session : certains navigateurs restaurent leurs sessions. Les bornes serveur restent donc déterminantes. Voir la [description des cookies de session](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

## 5. Autres stockages du navigateur

Ces mécanismes ne sont pas des cookies HTTP : leur contenu n’est pas joint automatiquement à toutes les requêtes. Ils doivent néanmoins entrer dans un diagnostic des stockages du terminal. Aucun usage applicatif d’IndexedDB, de Cookie Store, de Service Worker ou de Cache Storage n’a été trouvé dans les sources examinées.

| Zone | Stockage et clé | Contenu | Durée réellement programmée |
|---|---|---|---|
| Public v1/v2 | localStorage `aime:<slug>` | `1` pour une photo aimée | **Aucun TTL** ; supprimé au retrait du J’aime ou à l’effacement du stockage par l’utilisateur |
| Public Chambre noire | localStorage `nicephos-calm` | Préférence de mouvement `1` ou `0` | **Aucun TTL** |
| Public v1/v2 | sessionStorage `retour-galerie` | Adresse de galerie, contexte de retour, photo et date | Utilisé pendant **3 heures** ; l’entrée périmée n’est pas matériellement purgée par ce contrôle, puis disparaît avec la session de l’onglet |
| Visionneuse v2 | sessionStorage `plein-ecran` | `1`, souhait de conserver le plein écran entre photos | Session de l’onglet ; plusieurs gestes de sortie retirent explicitement l’entrée |
| Admin v1/v2 | localStorage `planche-taille` | Densité des vignettes | **Aucun TTL** ; commun aux comptes utilisant ce navigateur |
| Admin Carnets | localStorage `carnet-<id>-<lang>` | Champs complets d’un brouillon après échec de sauvegarde, avec date | **Aucun TTL** malgré la date ; supprimé après enregistrement réussi, soumission du formulaire ou refus de reprise |
| Admin v1 | sessionStorage `toast` | Message, erreur éventuelle, données pour défaire et date | Lu puis effacé à l’initialisation suivante ; affiché seulement si moins de **15 secondes** ; sinon reste jusqu’à cette lecture ou la fin de l’onglet |
| Console Vigie | localStorage `vigie-theme` | Thème clair ou sombre | **Aucun TTL** |

Sources : [public/js/site.js](../../public/js/site.js), 155–162 et 473–493 ; [public/js/v2/site.js](../../public/js/v2/site.js), 48–53, 89–159 et 181–199 ; [public/js/chambre-noire.js](../../public/js/chambre-noire.js), 7–16 ; [public/admin/admin.js](../../public/admin/admin.js), 300–313 et 1324–1338 ; [public/admin/v2/photos-v2.js](../../public/admin/v2/photos-v2.js), 41–54 ; [public/admin/carnet.js](../../public/admin/carnet.js), 41–96 ; [vigie/console/public/theme.js](../../vigie/console/public/theme.js), 9 ; [vigie/console/public/console.js](../../vigie/console/public/console.js), 25.

### 5.1. Brouillons et appareils partagés

La copie de secours Carnets peut contenir un texte non publié et des données personnelles saisies dans ce texte. Elle est stockée en clair dans le profil du navigateur. Sa clé ne comporte ni compte ni session et aucune purge au logout n’a été trouvée. Le champ `at` est écrit, mais ne limite pas la reprise dans le temps.

Le scénario à couvrir est : échec de sauvegarde → copie locale → déconnexion → autre compte autorisé ouvrant le même billet → proposition de reprendre cette copie. Les vérifications navigateur jointes reproduisent ce parcours avec un billet fictif. Cela ne démontre pas un accès serveur sans permission ; cela confirme un défaut de durée et de séparation des copies locales.

### 5.2. Stockage refusé

Les usages publics et ceux du thème Vigie sont généralement entourés de `try/catch`. Plusieurs accès à `toast` et à `planche-taille` ne le sont pas. Si un navigateur lève une `SecurityError` sur ces API, le script admin concerné peut être interrompu. C’est un point de robustesse identifié dans le code, non un échec reproduit pendant cette campagne.

## 6. Mesure d’audience et services extérieurs

### 6.1. Audience sans cookie, avec identifiant temporaire en mémoire

[server/stats.js](../../server/stats.js) ne dépose pas de cookie. Il calcule néanmoins une **empreinte quotidienne en mémoire** à partir de l’IP, du navigateur et d’une clé aléatoire du jour. Une seconde empreinte sert à borner les appels par adresse. Seuls des agrégats sont enregistrés en base, conservés 25 mois.

Les empreintes et la clé du jour sont renouvelées au premier événement de la nouvelle journée ; l’effacement n’est donc pas exécuté par un minuteur exactement à minuit. Les administrateurs, robots, requêtes DNT et GPC sont exclus selon les contrôles du module. Le référent est réduit à son domaine. Le pays fourni par Cloudflare est accepté seulement derrière le proxy de confiance.

Références : lignes 4–11, 58–74, 82, 96–105. La phrase « aucun identifiant n’est conservé » doit être précisée en **« aucun identifiant visiteur n’est enregistré en base ; une empreinte technique quotidienne reste temporairement en mémoire »**. L’absence de cookie ne suffit pas, à elle seule, à prouver une exemption de consentement ou l’absence de données personnelles pendant le traitement.

### 6.2. Ressources sociales et Instagram

Les pages examinées ne chargent pas de SDK Facebook, Instagram ou autre réseau social. Le partage utilise des liens simples ou le partage du navigateur. Les cookies d’une plateforme ouverte après un clic relèvent alors de cette navigation extérieure. La connexion Instagram de l’admin utilise le cookie applicatif `ig_state`, puis un échange serveur ; elle ne constitue pas un widget de suivi inclus dans la galerie.

Sources : [server/share.js](../../server/share.js), [server/app.js](../../server/app.js), 58–71, et [test/partager.test.js](../../test/partager.test.js), 18–24. La CSP limite les ressources et connexions à l’origine, avec l’exception nécessaire pour la cible de formulaire IdP. Elle n’empêche pas un proxy d’ajouter un en-tête Set-Cookie.

### 6.3. Cookies possibles de l’infrastructure, à inventorier sur le service déployé

Le code seul ne permet pas d’énumérer les cookies de Cloudflare ou de Zitadel. Un cookie posé par un prestataire peut apparaître sur le domaine du site : « fourni par un tiers » et « cookie tiers » au sens du navigateur ne sont pas synonymes.

| Service | Exemples à rechercher | Statut dans ce diagnostic |
|---|---|---|
| Protection Cloudflare | `__cf_bm`, `cf_clearance` ; autres noms selon fonctions activées | **Non observés sur la production** ; leur présence ne doit pas être déduite du seul hébergement |
| Cloudflare Access | `CF_Authorization`, cookies auxiliaires de connexion et éventuellement `CF_Binding` | Console conçue pour Access ; noms effectivement reçus, domaines, durées et options à relever sur le parcours réel |
| Zitadel | Cookies de connexion et de session de l’IdP | Fournisseur et domaine distincts ; inventaire et durées non vérifiés ici |
| Instagram/Meta | Cookies de la plateforme pendant son autorisation OAuth | Parcours extérieur à l’origine ; non observé dans ce diagnostic |

Cloudflare documente notamment `__cf_bm` avec une expiration après trente minutes d’inactivité, et des cookies de challenge selon les fonctions utilisées. Cette description générale ne prouve pas leur activation sur Nicephos. Voir les [cookies Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/). Les cookies Access et leurs paramètres dépendent de la configuration d’application ; voir la [documentation Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).

Pour terminer l’inventaire de l’installation, relever dans un profil navigateur neuf les en-têtes Set-Cookie, la liste des cookies et les origines successives pendant : accueil, choix de langue, galerie, `/bonjour`, connexion admin, console puis déconnexion. Inclure un scénario de challenge Cloudflare s’il est activé. Conserver uniquement noms, finalités, attributs, domaines et durées ; masquer les valeurs des jetons, JWT, codes et paramètres OIDC avant de partager une trace.

## 7. Protection des sessions et des échanges

| Contrôle | État constaté |
|---|---|
| Secret de signature | COOKIE_SECRET requis hors contexte local de développement ; longueur minimale 32 caractères |
| Authentification site | OIDC avec PKCE S256, state, nonce, signature, issuer et audience vérifiés |
| Fixation de session site | Nouvelle connexion et vérification d’identité réussies détruisent l’ancienne session et créent un nouveau jeton et CSRF |
| Données du cookie session | Jeton opaque ; pas de nom, d’e-mail, de mot de passe ou de rôle dans le cookie |
| Autorisations admin | Rôles courants relus ; désactivation et suppression du compte ferment ses sessions |
| CSRF admin et privé | Jeton synchronisé serveur ; protections supplémentaires à SameSite ; déconnexion par POST |
| Révocations et rejeux | Contrôles locaux et, si configurée, événements/décisions Vigie ; empreintes révoquées et délais prévus |
| Cache | Admin et pages privées no-store ; pages publiques personnalisées pour une session d’équipe private, no-store |
| Journaux du site | Sérialiseur de requête sans en-tête Cookie ; paramètres code/state masqués, IP tronquées dans les logs techniques ordinaires |
| Console | Access + Zitadel avec second facteur, contrôle de provenance, droits et authentification récente |
| Connexion locale de test | Refusée si NODE_ENV=production ou PUBLIC_URL en HTTPS |

Sources : [server/config.js](../../server/config.js), 40–64 ; [server/auth.js](../../server/auth.js), 108–227 et 394–458 ; [server/oidc.js](../../server/oidc.js), 57–92 ; [server/accounts.js](../../server/accounts.js), 191–205 ; [server/app.js](../../server/app.js), 80–99 et 357–377 ; [vigie/console/server.js](../../vigie/console/server.js), 107–237.

`SameSite=Lax` est cohérent avec les retours OIDC par navigation. Passer arbitrairement tous les cookies à Strict risquerait de casser ces retours. L’isolement par hôte des cookies `__Host-` est utile ; il ne remplace pas le CSRF, les droits serveur ou la vérification de provenance entre services d’un même site.

## 8. Constats classés et actions proposées

P1 : à traiter en premier compte tenu de l’effet potentiel, avec les conditions indiquées. P2 : correction de conservation, minimisation, cohérence ou défense supplémentaire. P3 : amélioration fonctionnelle ou robustesse. Ces priorités organisent les travaux ; elles ne sont pas des scores de vulnérabilité ni la preuve d’une exploitation.

### C01 — Une configuration de production peut émettre des cookies sans Secure

**P1, conditionnel, reproduit.** `NODE_ENV=production` exige PUBLIC_URL, mais accepte une URL explicitement HTTP. `secureCookies` vaut alors false ; session et transactions n’ont ni Secure ni préfixe `__Host-`, et HSTS n’est pas posé.

Preuves : [server/config.js](../../server/config.js), 32–64 et 159–160 ; [server/auth.js](../../server/auth.js), 46–51 ; [server/app.js](../../server/app.js), 377. Le contrôle complémentaire appelle le parseur avec une configuration fictive de production en HTTP et constate son acceptation.

**Action :** refuser PUBLIC_URL en HTTP en production ; prévoir une exception seulement si le propriétaire décide qu’elle est nécessaire. Vérifier les attributs réellement reçus sur l’URL publique. Ce diagnostic ne dit pas que l’installation actuelle est en HTTP.

### C02 — La copie locale d’un brouillon ne suit ni le compte ni une durée

**P2, confidentialité sur navigateur partagé, reproduit avec deux comptes autorisés.** Le secours Carnets conserve le texte et les champs en clair, sans TTL, dans une clé limitée à l’ID du billet et sa langue. La déconnexion ne retire pas cette copie ; un autre compte ouvrant le même billet peut se la voir proposer.

Preuves : [public/admin/carnet.js](../../public/admin/carnet.js), 41–78 et 96 ; [contrôles navigateur](preuves/controles.json). Aucun accès serveur sans autorisation n’a été démontré.

**Action :** décider une durée de secours, lier la clé au compte, informer du stockage local et proposer son effacement. Définir explicitement le comportement au logout pour préserver un brouillon utile sans le laisser indéfiniment sur un appareil partagé. Tester ensuite échec, expiration, changement de compte et suppression.

### C03 — Les lignes de session admin expirées n’ont pas de purge périodique

**P2, confirmé par code et contrôle sur base jetable.** L’accès expire correctement à 8 h d’inactivité ou 24 h absolues. La suppression globale de `sessions` n’a lieu qu’à une nouvelle création de session ; une lecture du cookie expiré retire aussi sa propre ligne. Sans ces événements, nom, e-mail, ID token, CSRF et contexte d’une ancienne session peuvent rester en base.

Preuves : [server/sessions.js](../../server/sessions.js), 13–28 et 41–49 ; tâche quotidienne dans [server/app.js](../../server/app.js), 239–244. Le contrôle ne confond pas une ligne conservée avec un accès encore valide.

**Action :** ajouter une purge périodique de ces lignes, avec test de suppression sans reconnexion. Vérifier le traitement des empreintes révoquées quand la Vigie est activée. Documenter la durée physique distinctement de la validité d’accès.

### C04 — Le récapitulatif expire à quinze minutes, mais son effacement est différé

**P2, confirmé statiquement.** Le magasin mémoire ne purge qu’à un dépôt ou une lecture. Un récapitulatif trop ancien n’est plus affiché, mais peut rester en mémoire jusqu’au prochain usage du magasin ou au redémarrage. Le magasin est borné à 500 entrées. Les noms et e-mails en sont exclus, mais référence, date, lieu, tranche d’âge et choix peuvent concerner une personne.

Preuves : [server/routes/public.js](../../server/routes/public.js), 66–94. La promesse d’effacement à quinze minutes apparaît dans [server/privacy.js](../../server/privacy.js), 74, 148, 222 et [docs/wiki/RGPD.md](../wiki/RGPD.md), 23.

**Action :** assurer une purge périodique bornée, ou préciser honnêtement l’expiration d’affichage et le nettoyage différé. Aucun récapitulatif expiré lisible n’a été établi.

### C05 — Le message flash peut transporter une donnée personnelle lisible

**P2, contenu et absence de chiffrement confirmés.** Certains textes de flash incluent le destinataire d’un test e-mail, le nom d’un compte ou le libellé d’un invité. Le JSON est signé, HttpOnly et limité à une minute, mais n’est pas chiffré ni lié à la session qui l’a produit. Un autre compte sur le même profil peut consommer un message laissé pendant sa durée de vie.

Preuves : [server/routes/admin.js](../../server/routes/admin.js), 267–285, 1210–1221 et 1239–1254 ; [server/routes/galeries.js](../../server/routes/galeries.js), 468–471. Le contrôle complémentaire vérifie la lisibilité d’une valeur fictive après validation de signature ; le changement de compte pour ce flash précis n’a pas été exécuté.

**Action :** minimiser les valeurs personnelles dans les messages, ou transporter un jeton vers un message serveur associé à la session. Nettoyer le message au logout si le comportement retenu le prévoit. Aucune fuite à distance ni lecture JavaScript malgré HttpOnly n’a été démontrée.

### C06 — Le délai de transaction OIDC du site repose sur le navigateur

**P2, défense supplémentaire, reproduit avec client OIDC factice.** Max-Age=600 fait expirer le cookie dans un navigateur respectant ses règles. La transaction normale du site ne porte cependant aucune échéance vérifiée localement par le serveur. Une copie manuelle présentée après onze minutes arrive encore à l’appel `oidc.finish`.

PKCE, nonce, signature, durée et unicité du code chez l’IdP restent contrôlés. Le test factice isole l’absence d’expiration locale ; il ne démontre pas qu’un ancien code serait accepté par Zitadel. La console Vigie applique déjà une expiration serveur et une consommation unique.

Preuves : [server/auth.js](../../server/auth.js), 290 et 331–342 ; [server/oidc.js](../../server/oidc.js), 57–92 ; comparaison [vigie/console/sessions.js](../../vigie/console/sessions.js), 66–76. Le state Instagram est également signé sans échéance serveur propre dans [server/routes/admin.js](../../server/routes/admin.js), 777–786 ; ce second cas est seulement constaté dans le code.

**Action :** ajouter une date signée vérifiée ou une transaction éphémère serveur. Tester une copie tardive avant tout appel externe et un rejeu déjà consommé, selon la solution retenue.

### C07 — L’information publiée ne couvre pas uniformément tous les usages

**P2, documentaire, confirmé dans les trois langues.** La page Confidentialité décrit bien les trois finalités publiques, mais les Droits n’en décrivent que deux. Les autres cookies et stockages ne disposent pas d’un inventaire complet avec noms, portées et durées. La conservation d’empreintes d’audience en mémoire et certaines purges différées demandent une formulation plus précise.

| Écart | Sources |
|---|---|
| Droits : absence du récapitulatif `/bonjour` | [server/rights.js](../../server/rights.js), 18, 31, 44 ; comparaison [server/privacy.js](../../server/privacy.js), 74, 148, 222 |
| Nom et durée du cookie langue absents de la page publique | Confidentialité ci-dessus ; durée d’un an présente dans [RGPD](../wiki/RGPD.md), 22 |
| Configuration : formulation généralisant le préfixe `__Host-` à tous les cookies | [Configuration](../wiki/Configuration.md), 106 |
| Sécurité : quatre cookies OIDC annoncés, contre trois actifs dans le code | [Sécurité](../wiki/Sécurité.md), 13 ; [server/auth.js](../../server/auth.js), 13 et 288–290 |
| Cookie privé présenté comme ne dépassant pas la fin d’accès | [RGPD](../wiki/RGPD.md), 24 ; distinguer cookie et autorisation (§ 4) |
| Stockage local partiellement couvert | J’aime décrit dans [server/privacy.js](../../server/privacy.js), 39, 113, 187 ; autres clés du § 5 à ajouter |

**Action :** publier une table unique des finalités et durées, distinguant visiteur, équipe et console, et l’utiliser pour harmoniser les textes FR/EN/DE. Une préférence « du compte » stockée sans identifiant doit être décrite comme une préférence de ce navigateur.

### C08 — Réauthentifier la console ne remplace pas le jeton existant

**P2, durcissement, confirmé statiquement.** La console actualise la date d’authentification fraîche sans faire tourner son cookie et son CSRF. Une copie de la même session bénéficie de cette fraîcheur, si elle satisfait également les contrôles Access.

Preuves : [vigie/console/server.js](../../vigie/console/server.js), 295–304 ; [vigie/console/sessions.js](../../vigie/console/sessions.js), 25 et 52.

**Action :** envisager rotation et révocation de l’ancien jeton après vérification d’identité, en préservant la borne absolue décidée pour la session. Ce choix de sécurité demande un arbitrage du propriétaire avant modification.

### C09 — Plusieurs préférences persistent entre comptes

**P3, comportement et information.** `admin_theme`, le repli `admin_langue`, `apercu_theme` et plusieurs clés de stockage local appartiennent au navigateur. Le logout ne les efface pas. Le maintien d’une préférence non personnelle peut être souhaitable ; il doit être explicite. L’aperçu reste soumis à permission.

Les boutons « Se souvenir » des galeries partagent un seul cookie et sa persistance dépend de la dernière entrée (§ 4). La connexion Instagram conserve un seul `ig_state` : une tentative dans un autre onglet remplace la précédente et provoque un refus sûr au premier retour.

**Action :** préciser la portée navigateur/compte et le comportement multi-galeries ; adapter seulement si cette expérience n’est pas celle souhaitée. Le choix d’une durée ou d’un stockage de compte ne doit pas être fait silencieusement.

### C10 — Activité publique et renouvellement navigateur ne coïncident pas toujours

**P3, confirmé statiquement.** Charger une session sur une page publique peut prolonger son échéance serveur. Le Set-Cookie alignant l’expiration navigateur se trouve dans `requireAdmin`. Une utilisation durable du seul site public peut donc laisser expirer le cookie malgré une session serveur prolongée.

Preuves : [server/sessions.js](../../server/sessions.js), 40–53 ; [server/auth.js](../../server/auth.js), 157–161 et 193–212.

**Action :** définir si « activité » signifie activité dans l’admin ou partout, puis aligner les deux échéances. Aucun scénario de huit heures réelles n’a été exécuté.

### C11 — Certains accès au stockage ne gèrent pas son refus

**P3, à reproduire.** Les appels non protégés à `toast` et `planche-taille` peuvent interrompre le script si l’accès est bloqué (§ 5.2).

**Action :** protéger ces usages facultatifs et vérifier le résultat visible avec un stockage indisponible. Ce point ne justifie pas la création d’un nouveau framework de tests.

## 9. Consentement et information

Le principe de consentement vise les lectures et écritures sur le terminal ; il ne se limite pas aux cookies HTTP. La CNIL distingue notamment les usages nécessaires à l’authentification et à certaines personnalisations attendues. La finalité réelle et le service demandé déterminent l’exemption : le simple nom « technique » ne suffit pas. Voir [Cookies et traceurs : que dit la loi ?](https://cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi).

La [recommandation CNIL consolidée du 16 janvier 2026, section 5](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf) recommande aussi d’informer sur les traceurs exemptés. Elle distingue cette recommandation de transparence des obligations applicables aux traceurs soumis à consentement. Les durées de treize mois pour certains traceurs d’audience et vingt-cinq mois pour leurs informations ne sont pas une durée légale universelle applicable à tout cookie.

**Appréciation du diagnostic, à valider par les responsables selon les fonctions réellement actives :**

| Usage | Qualification de travail |
|---|---|
| Connexion admin, console, transaction d’authentification, accès à une galerie | Finalité nécessaire à un service demandé ; exemption cohérente avec cet usage exclusif |
| Langue, thème, mouvement réduit, retour et plein écran | Personnalisation demandée ou fonctionnement de navigation ; vérifier le caractère intrinsèque et proportionné |
| Récapitulatif d’envoi, notification et sauvegarde de secours | Fonction au service de l’action demandée ; minimiser le contenu, fixer la conservation et informer |
| J’aime conservé localement | Mémorisation d’un geste explicite ; documenter la finalité, la durée et le retrait |
| Mesure d’audience | Aucune écriture de cookie ; vérifier les conditions de l’exemption et le traitement temporaire d’empreintes, sans déduire la conclusion du seul « sans cookie » |
| Protection et authentification chez Cloudflare/Zitadel | Vérifier les fonctions actives, les paramètres et leurs finalités exactes sur l’installation |

**Le code examiné ne justifie pas l’ajout automatique d’un bandeau publicitaire de consentement.** L’absence de bandeau peut être cohérente avec des finalités exclusivement exemptées. La conclusion pour l’installation complète reste conditionnée à l’inventaire des services déployés et à la validation des finalités. L’information et les durées doivent être corrigées indépendamment de cette décision.

## 10. Impact sur la Vigie

Les préférences non personnelles ne justifient pas de journaliser chaque changement. Pour les sessions, le dispositif existant peut consommer les échecs de connexion, fermetures, changements de contexte et rejeux, avec des identifiants techniques plutôt que les valeurs des cookies. Les galeries conservent l’empreinte des anciens jetons pendant 48 heures et utilisent une référence dérivée de l’identifiant interne.

Sources : [server/securite/site.js](../../server/securite/site.js), 114–120 ; [server/auth.js](../../server/auth.js), 108–175 et 331–346 ; [server/visitor-sessions.js](../../server/visitor-sessions.js), 18–23 et 53–72. Les types doivent rester ceux du [vocabulaire fermé](../../server/securite/vocabulaire.js).

Pour les corrections proposées :

- le rejet d’une transaction trop ancienne peut utiliser le chemin existant d’échec d’authentification, avec une raison bornée ;
- une purge régulière de sessions doit préserver la cohérence des traces de révocation et ne pas transformer une expiration normale en vol de cookie présumé ;
- une rotation console doit préserver les droits et contrôles Access et rendre l’ancien jeton inutilisable ;
- une purge de brouillon local ne doit envoyer ni texte ni clé de stockage contenant une donnée personnelle dans un événement de sécurité ;
- aucun cookie brut, verifier PKCE, JWT ou CSRF ne doit être ajouté aux journaux ou aux preuves partagées.

Ce rapport ne crée ni événement nouveau, ni règle Sigma, ni besoin BV supplémentaire : l’analyse de leur nécessité appartient aux corrections retenues.

## 11. Vérifications et preuves

### 11.1. Tests existants exécutés

Commande, depuis le worktree isolé :

```sh
AVIF_EFFORT=0 node --test --test-concurrency=2 \
  test/auth.test.js test/revue-2026-10-16-auth.test.js \
  test/langues.test.js test/langues-admin.test.js test/apparence.test.js \
  test/prive.test.js test/bonjour-mineurs.test.js \
  test/confidentialite.test.js test/vigie-console.test.js
```

**Résultat : 135 tests, 135 réussis, 0 échec, 0 annulé, 0 ignoré, 0 todo.** Environ 60 secondes. Dépendances installées selon le verrou, Node 22.23.1, Fastify 5.12.7 et `@fastify/cookie` 11.1.2.

Ces tests couvrent notamment les cookies HTTPS et leur préfixe, signature/state incorrects, rejeu de code OIDC, rotation, expiration et révocation, CSRF, accès privés et sortie, récapitulatif unique et borné, langues, confidentialité et contrôles Access/MFA de la console. Les échanges IdP, Access et envois de la Vigie concernés sont simulés par les outils existants ; ils ne valident pas les services réels.

Preuve : [sortie des 135 tests](preuves/tests-cibles.txt).

### 11.2. Contrôles complémentaires

Le [script ponctuel](preuves/controle.mjs) réutilise les helpers et des bases jetables ; il ne modifie ni le code produit ni la CI. Les cookies sont examinés en mémoire, leurs valeurs ne sont pas enregistrées dans le bilan. Les noms OIDC dynamiques sont masqués.

Les résultats détaillés figurent dans [controles.json](preuves/controles.json) : **13 contrôles terminés**, une erreur console 503 volontairement provoquée, aucune erreur navigateur inattendue. Les contrôles isolent : acceptation d’une configuration de production HTTP, attributs des transactions HTTPS, absence de contrôle local du délai OIDC avant appel au client factice, contenu signé lisible du flash, maintien d’une ligne admin expirée sans nouvel événement de purge, puis les parcours navigateur ci-dessous.

| Parcours Chromium | Résultat attendu et observé |
|---|---|
| Profil neuf → accueil | Page affichée, aucun cookie applicatif, aucun appel à une origine externe sur cette instance locale |
| Choix allemand | Page allemande ; cookie langue HttpOnly/Lax ; `document.cookie` ne révèle pas le cookie |
| J’aime → rechargement | État aimé visible et conservé en localStorage ; aucun cookie supplémentaire |
| Connexion locale → choix thème → déconnexion | Session supprimée ; préférence de thème conservée |
| Brouillon → erreur de sauvegarde 503 simulée → déconnexion | Copie locale réellement créée par le script et conservée après la sortie |
| Second compte autorisé → même billet | Proposition de reprendre la copie laissée par le premier compte |
| JavaScript désactivé → choix anglais | Page anglaise et cookie de langue effectifs |

Preuve visuelle limitée à des données de démonstration : [accueil du profil neuf](preuves/visite-anonyme.png). L’inspection des cookies et des états persistés est la preuve principale de ces parcours.

Le lancement Chromium natif a d’abord échoué faute de `libatk-1.0.so.0` ; le conteneur Playwright 1.64.0 déjà présent fournit le navigateur fonctionnel. Cet échec d’outillage est distinct du produit. Les erreurs réseau 503 du scénario de brouillon sont volontairement provoquées et identifiées dans le bilan. Les bases et serveurs jetables sont fermés à la fin des contrôles.

### 11.3. Couverture restante

Les suites complètes `npm test` et `npm run test:vigie` n’ont pas été lancées : le site n’a pas été modifié, et les suites ciblées répondent aux risques de ce diagnostic. La commande imposée pour la documentation, `node --test test/liens-internes.test.js`, passe : **4 tests, 4 réussis, aucun échec ni test ignoré**. Elle vérifie les parcours de liens de l’application ; voir sa [sortie](preuves/liens-internes.txt). Les cibles locales des liens du rapport sont contrôlées séparément dans le [bilan des références](preuves/liens-rapport.txt).

Ne sont pas couverts par une observation réelle : production, configuration Cloudflare, tunnel, cookies Zitadel/Meta, retours externes réels, Safari/WebKit, fermeture et restauration effective du navigateur, blocage des stockages, délais de plusieurs heures ou jours. Les écarts de purge et les scénarios temporels signalent explicitement leur preuve statique ou leur simulation.

## 12. Ordre de traitement conseillé

1. **Fermer le risque de mauvaise configuration HTTPS** et vérifier les attributs réellement reçus sur l’URL publique.
2. **Décider et corriger la conservation des brouillons locaux**, en particulier sur les appareils partagés.
3. **Rendre les effacements effectifs et prévisibles** : sessions admin expirées et récapitulatifs non consommés.
4. **Minimiser le flash et renforcer l’expiration des transactions**, puis décider la rotation console.
5. **Harmoniser la documentation et l’information FR/EN/DE**, avec les noms, finalités, portées et durées exactes.
6. **Compléter l’inventaire des services déployés**, puis traiter les détails de préférences, multi-onglets et stockage refusé.

Chaque correction de comportement devra avoir le test ciblé qui aurait détecté l’écart. Les choix de durée, de conservation, de compte et de sécurité restent des décisions du propriétaire. Ce diagnostic prépare ces décisions ; il n’en applique aucune.
