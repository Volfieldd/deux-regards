# Vigie : CrowdSec en option et Actions v2 de Zitadel

| | |
|---|---|
| Statut | Étude, rien n'est codé. Deux pistes de la phase E ([annexe architecture](annexe-vigie-architecture.md), § 7 et § 10 : « Actions v2 de Zitadel ; CrowdSec en option »). Décisions proposées : D27 à D30. |
| Date | 19 octobre 2026. |
| Fiabilité des sources | Rédigée sur la connaissance des documentations officielles, **sans relecture en ligne complète ce jour-là** (la recherche web lancée n'avait pas rendu ses résultats à la rédaction). Chaque chiffre de quota, chaque condition d'offre gratuite et chaque nom d'API est donc marqué **à vérifier**, avec la page où le contrôler (section « Sources »). Les recommandations ne reposent pas sur ces chiffres : elles tiennent même si un quota double ou diminue de moitié. |
| Base | [`annexe-vigie-architecture.md`](annexe-vigie-architecture.md) § 7.1 et § 10 ; [`recadrage-vigie-edge-wake.md`](recadrage-vigie-edge-wake.md) § 3.4 et D22 ; [`annexe-vigie-cloudflare.md`](annexe-vigie-cloudflare.md) § 1, 3 et 8 ; code : `vigie/zitadel.js`, `vigie/menaces.js`, `vigie/bordure.js`, `vigie/cloudflare-liste.js`, `bordure/worker.js`, `server/auth.js`. |

---

## En bref

- **CrowdSec : non.** (Vérifié le 19 octobre 2026 dans la documentation officielle : la liste communautaire n'existe qu'avec l'agent, et sa version complète exige de contribuer des signaux.)
  - L'**agent** (Security Engine) n'a presque rien à lire chez nous : pas de journal nginx (le tunnel), et les journaux du site sont déjà transformés en événements par la Vigie, qui fait mieux que les scénarios génériques (quorum, comptes, sessions, bordure). Ce serait un deuxième moteur de détection à tenir, pour les mêmes faits.
  - La **liste communautaire** est la seule vraie nouveauté (des centaines de milliers de capteurs, des adresses qui attaquent *maintenant* des services web). Mais, en offre gratuite, elle s'obtient en **contribuant** : l'agent envoie à CrowdSec les adresses qu'il bloque. Ce sont des adresses de visiteurs de Nicephos, envoyées à un tiers : contraire à la règle posée en D22 (« aucune adresse de visiteur n'est envoyée à un tiers »).
  - Le **bouncer Cloudflare** se heurte à ce qui existe : une seule liste d'adresses en offre gratuite (déjà prise par `vigie_bloquees`, E3), un seul Worker par route (déjà pris par la bordure), et le défi Turnstile (script tiers, écarté par le site).
  - Condition pour rouvrir (D27) : une liste CrowdSec téléchargeable **sans contribution** et **sans agent** (comme Spamhaus ou Feodo), dont la licence permet l'usage sur un site qui vend. **Vérifié : ce n'est pas le cas aujourd'hui** (« The Community Blocklist is only available when using the Security Engine » ; sans contribution régulière, seule la version « Lite » ; la version « Premium » est payante). La piste reste fermée tant que CrowdSec ne change pas ses conditions.
- **Actions v2 de Zitadel : non pour le blocage ; plus tard, en complément, pour les événements.**
  - **Bloquer une connexion** chez Zitadel à partir des décisions de la Vigie (exécution « request » sur l'API des sessions, cible bloquante) : **non**. Le gain est faible (le site refuse déjà un compte gelé au retour de Zitadel, `server/auth.js`), et le risque est grand : si la Vigie ou son point d'entrée ne répond pas, **plus personne ne se connecte**, administrateurs compris, console de la Vigie comprise. De plus, cela ne couvre que la connexion « Login V2 » (API des sessions), à vérifier pour notre instance.
  - **Recevoir les événements** par Actions v2 : utile seulement pour gagner moins d'une minute sur les alertes Zitadel critiques (DS27, DS28). La lecture par l'API **reste indispensable** (rattrapage, trous, un jour d'historique gratuit). À faire plus tard, si l'on veut l'alerte « administrateur ajouté » en quelques secondes, **par le Worker de bordure** (qui reçoit, vérifie la signature et range ; la Vigie relit), sans ouvrir la Vigie sur Internet (D28, D29).
  - À faire **tout de suite, sans code** : régler chez Zitadel la **politique de verrouillage** (nombre d'essais de mot de passe et de code), qui arrête la force brute là où elle a lieu, et garder la surveillance déjà en place des événements `target.*` et `execution.*` (une Action ajoutée par un intrus détournerait les connexions).

---

## 1. Ce que la Vigie a déjà

| Brique | Ce qu'elle fait | Où |
|---|---|---|
| Listes de menaces (D22) | Spamhaus DROP, Feodo Tracker, sorties Tor, téléchargées chaque jour ; points sur l'adresse (3, 3, 1), hors quorum ; aucune adresse envoyée | `vigie/menaces.js` |
| Moteur, quorum (C1, C2) | 34 règles Sigma, 13 corrélations, détecteurs comportementaux ; alerte « moyen » ou « haut » seulement avec deux sources | `vigie/moteur.js`, `vigie/regles/` |
| Bordure (C3) | Worker sur l'admin, la connexion et les pages : bloque avant le site (liste signée dans KV), en-têtes signés, un point par requête dans Analytics Engine | `bordure/worker.js`, `vigie/bordure.js` |
| Liste Cloudflare (E3) | blocages de tout le site de 24 h et plus recopiés dans `vigie_bloquees`, règle R1 du pare-feu ; épargne le quota du Worker | `vigie/cloudflare-liste.js` |
| Zitadel | 210 types d'événements lus toutes les minutes (compte `IAM_OWNER_VIEWER`), trou signalé au-delà de 20 h ; événements `target.*`, `execution.*`, `action.*` déjà suivis | `vigie/zitadel.js`, `vigie/zitadel/types-suivis.json` |
| Gel d'un compte | appliqué par le site au retour OIDC et à chaque requête | `server/auth.js` (lignes 156, 298, 362) |

Ce qui manque vraiment, et que ces pistes pourraient donner : (1) savoir qu'une adresse attaque **d'autres** sites avant qu'elle n'attaque le nôtre ; (2) voir un événement Zitadel critique en secondes plutôt qu'en une à deux minutes ; (3) arrêter chez Zitadel une force brute que le site ne voit pas (la page de connexion de Zitadel n'est pas derrière notre Cloudflare).

---

## 2. CrowdSec

CrowdSec est un logiciel libre (licence MIT pour l'agent) d'une société française. Trois pièces : l'**agent** (Security Engine : lit des journaux, les analyse, applique des scénarios, décide), les **bouncers** (appliquent les décisions : pare-feu, nginx, Cloudflare…), la **console** et la **liste communautaire** (adresses signalées par tous les agents qui contribuent) [1][2].

### 2.1 (a) Consommer la liste communautaire

| Point | Ce qu'on sait | Fiabilité |
|---|---|---|
| Comment l'obtenir | un agent inscrit, qui **partage ses signaux** (« community blocklist » en échange de la contribution) ; les agents qui ne partagent pas n'ont pas la liste communautaire | sûr sur le principe ; à vérifier : conditions exactes 2026 [3] |
| Taille | version « lite » pour l'offre gratuite, version complète (plus d'adresses) pour l'offre payante ; ordre de grandeur : quelques dizaines de milliers d'adresses en gratuit | **à vérifier** [3][4] |
| Listes de tiers par la console | abonnement à quelques listes thématiques en gratuit, plus en payant ; usage « sans agent » (intégration directe à un pare-feu ou à Cloudflare, *Blocklist as a Service*) : offre payante, ou très limitée en gratuit | **à vérifier** [4][5] |
| Ce qui est envoyé (signal) | adresse de l'attaquant, nom et version du scénario, horodatages, nombre d'événements, identifiant de l'agent ; **pas** les lignes de journal ; le « contexte » (chemin, navigateur…) n'est envoyé que si on l'active | sûr sur le principe ; détail à vérifier [6] |
| CTI (interrogation d'une adresse) | API gratuite avec petit quota quotidien | **à vérifier** [7] ; écartée de toute façon : chaque appel envoie l'adresse d'un visiteur |
| Licence des données | usage pour protéger ses propres services ; redistribution interdite ; usage commercial à préciser (la boutique fera du site un site marchand) | **à vérifier** dans les conditions générales [8] |
| RGPD | société française, données dans l'Union (à vérifier) ; une adresse IP est une donnée personnelle ; CrowdSec invoque l'intérêt légitime | [9] |

**Ce que ça apporterait de neuf.** C'est la seule pièce sans équivalent : Spamhaus DROP liste des réseaux détournés (rares sur un site photo), Feodo des serveurs de botnets (qui ne visitent pas les sites), Tor des sorties (contexte). La liste communautaire contient au contraire les **scanners et forceurs de mots de passe actifs** contre des services web, ce que voit justement notre bordure. Gain réaliste : quelques points de plus sur une adresse avant sa première requête suspecte ; jamais une alerte seule (hors quorum, comme les autres listes).

**Ce que ça coûte.** Un agent qui tourne (il faut de quoi contribuer, section 2.2), et surtout **la contribution** : chaque adresse que notre agent jugerait malveillante partirait chez CrowdSec. C'est un nouveau sous-traitant ou destinataire à déclarer au registre (`docs/wiki/RGPD.md`), une mention dans la politique de confidentialité, et une entorse à D22. Le risque de faux positif est réel dans les deux sens : nos visiteurs mal classés (un photographe derrière un VPN partagé) seraient signalés au monde entier.

**Garde-fous si un jour on la prend** (comme les autres listes) : points seulement, hors quorum ; 20 000 entrées au plus, ou relever ce plafond en le disant ; mise à jour refusée si la liste triple ; jamais un blocage automatique sur la seule liste.

### 2.2 (b) Faire tourner un agent (Security Engine)

| Journal possible | Disponible ici ? | Ce que CrowdSec en ferait |
|---|---|---|
| nginx, Apache, Traefik | **non** : aucun mandataire HTTP local, le tunnel arrive directement sur le site | — |
| `cloudflared` | oui, mais il ne journalise pas chaque requête par défaut ; pas de collection CrowdSec connue | rien d'utile (**à vérifier** [10]) |
| Journaux de Cloudflare | Logpush : **Enterprise** (payant) ; Analytics Engine : déjà lu par la Vigie | — |
| Journaux du site (Pino, JSON) | oui | analyseur et scénarios **à écrire** nous-mêmes ; les collections existantes (`base-http-scenarios`, `http-cve`) attendent un format de journal d'accès type nginx [11] |
| Événements de la Vigie | oui (base SQLite, ou un fichier qu'on écrirait) | redite : la Vigie a déjà décidé |
| Composant AppSec (pare-feu applicatif de CrowdSec) | il faut un bouncer compatible devant le site (nginx, Traefik…) ; pas de bouncer AppSec pour un Worker Cloudflare connu | **à vérifier** [12] |

**Ce que ça apporterait de neuf.** Presque rien. Les scénarios génériques (balayage de chemins, force brute HTTP, CVE connues) recoupent ce que la Vigie détecte déjà par ses pièges, ses règles DS15, DS16, DS25 et la bordure, avec moins de contexte (ni compte, ni session, ni quorum). Le seul intérêt serait **la contribution**, donc l'accès à la liste (2.1).

**Ce que ça coûte.** Un conteneur de plus (de l'ordre de 100 à 250 Mo de mémoire, **à vérifier** sur l'image officielle), sa base, ses mises à jour de collections (chaîne d'approvisionnement : des scénarios téléchargés depuis le hub), un accès en lecture aux journaux du site, une sortie vers l'API de CrowdSec à ajouter à la liste autorisée (BV-10), et une API locale (LAPI) à protéger.

**Variante « la Vigie nourrit CrowdSec ».** La Vigie pourrait pousser ses blocages dans l'API locale d'un agent (machine inscrite, `cscli decisions add` ou appel d'API) [13], qui les signalerait à la communauté. Techniquement simple, mais ce n'est pas un signal de scénario : CrowdSec ne compte en principe comme contribution que les alertes issues de scénarios (**à vérifier**). Et c'est précisément l'envoi d'adresses de visiteurs que D22 refuse.

### 2.3 (c) Bouncer Cloudflare

| Bouncer | Fonctionnement | Conflit avec l'existant |
|---|---|---|
| `cs-cloudflare-bouncer` (ancien, déprécié) | remplit des **listes d'adresses** du compte et des règles du pare-feu | l'offre gratuite n'a **qu'une** liste, déjà prise par `vigie_bloquees` (E3) ; 5 règles personnalisées, déjà toutes affectées (annexe Cloudflare § 3) |
| `crowdsec-cloudflare-worker-bouncer` | déploie **son propre Worker** et un espace KV, y pousse les décisions de l'API locale, bloque ou présente un défi Turnstile [14] | une route ne porte qu'**un** Worker : `nicephos.art/*` est déjà à `vigie-bordure` ; Turnstile est écarté (script tiers dans la page) ; écritures KV gratuites limitées à 1 000 par jour, déjà partagées avec la bordure ; exige un agent (LAPI) qui tourne |

**Ce que ça apporterait de neuf.** Rien que la bordure ne fasse déjà : bloquer avant le site, depuis KV, une liste d'adresses. La seule différence serait la **source** des adresses (la liste communautaire, 2.1), qu'on peut tout aussi bien faire entrer dans la Vigie et donc dans la liste signée du Worker existant.

**Risques.** Deux Workers et deux listes qui se contredisent (une levée par la Vigie qui ne lève rien chez CrowdSec), une source de blocage qui échappe à la console et à la chaîne de la Vigie, un jeton Cloudflare de plus avec droit d'écrire des Workers.

### 2.4 Recommandation CrowdSec

| Pièce | Verdict | Condition pour rouvrir |
|---|---|---|
| (a) liste communautaire | **non** (vérifié : agent obligatoire, contribution pour la liste complète) | CrowdSec publie une liste sans agent ni contribution, sous une licence compatible avec un site marchand ; alors 4ᵉ liste de `vigie/menaces.js`, en points, hors quorum |
| (b) agent | **non** | un mandataire HTTP local apparaît dans la pile (par exemple pour autre chose), et l'on accepte la contribution |
| (c) bouncer Cloudflare | **non** | jamais tant que la bordure existe : elle fait la même chose, sous le contrôle de la Vigie |

---

## 3. Actions v2 de Zitadel

### 3.1 Ce que c'est

Les Actions v2 remplacent les anciennes Actions (scripts JavaScript exécutés chez Zitadel) par des **appels HTTP** vers un service à soi [15][16] :

- une **cible** (*target*) : une adresse HTTPS, un délai, un type, et « interrompre en cas d'erreur » (`interruptOnError`) ; types : `webhook` (appel dont seul le statut compte), `call` (la réponse remplace la requête ou la réponse de Zitadel), `async` (envoi sans attendre) ;
- une **exécution** (*execution*) : la condition qui déclenche la cible :
  - `request` ou `response` : une méthode d'API (ex. `/zitadel.session.v2.SessionService/CreateSession`), un service entier, ou toutes ;
  - `function` : un point du flux de jetons (`preuserinfo`, `preaccesstoken`, `presamlresponse`) pour ajouter des revendications ;
  - `event` : un type d'événement (`user.human.added`), un groupe (`user.human`), ou tous.
- chaque appel sortant est **signé** : en-tête `ZITADEL-Signature` de la forme `t=<horodatage>,v1=<HMAC-SHA256>`, sur l'horodatage et le corps, avec la clé de signature rendue à la création de la cible (même principe que Stripe) [17].

Gérées par l'API `zitadel.action.v2` (bêta en v3, stable en v4 : **à vérifier** [16]) et dans la console de Zitadel (« Actions »). Une version antérieure exigeait d'activer l'option `actions` dans les fonctions de l'instance (**à vérifier** pour Zitadel Cloud aujourd'hui).

**Disponibilité en offre gratuite de Zitadel Cloud.** Notre annexe architecture (§ 7.1) les donne incluses ; la page de tarifs de Zitadel les liste dans les fonctions de base. **À vérifier** sur la page des tarifs [18] et, plus sûrement, en créant une cible de test dans l'instance (si la console le refuse, la réponse est claire). Rétention des événements en gratuit : un jour (déjà pris en compte par `vigie/zitadel.js`), **à revérifier** [18].

### 3.2 Remplacer ou compléter la lecture par minute ?

| Critère | Lecture de l'API (actuelle) | Actions v2, exécution `event` |
|---|---|---|
| Délai | 1 à 2 minutes | quelques secondes |
| Perte | aucune tant que la Vigie lit dans les 23 h ; reprise par date, doublons écartés, trou signalé | possible : la Vigie ou son point d'entrée injoignable, appel perdu ; nouvelles tentatives et garanties de livraison **non documentées clairement** (à vérifier [15]) |
| Ordre | par date (`asc`) | non garanti |
| Charge | 7 lots de 30 types par minute | un appel par événement (pics lors d'une attaque) |
| Exposition | aucune route entrante | une adresse publique à ouvrir |
| Compte de service | `IAM_OWNER_VIEWER` (lecture large) | aucun pour recevoir ; la clé de signature à garder |

**Conclusion : compléter, jamais remplacer.** La lecture reste la référence (rattrapage, trous, preuve). Les Actions ne serviraient qu'à **avancer** les alertes à source unique de Zitadel (DS27 administrateur ou rôle donné, DS28 politique affaiblie, emprunt d'identité), pour lesquelles une minute compte peut-être. Pour DS25 (rafale d'échecs), une minute ne change rien.

### 3.3 Bloquer une connexion en temps réel ?

Mécanisme : exécution `request` sur `SessionService/CreateSession` et `SetSession` (vérification du mot de passe, du second facteur), cible `webhook` avec `interruptOnError: true`. La cible répond 200 pour laisser passer, une erreur pour refuser ; Zitadel rejette alors l'appel et la connexion échoue [15][19].

| Question | Réponse |
|---|---|
| Quelle connexion est couverte ? | **Login V2** (l'interface de connexion qui s'appuie sur l'API des sessions). L'ancienne interface hébergée (Login V1) ne passe pas par cette API : non couverte. **À vérifier** : laquelle sert notre instance (console Zitadel → réglages de connexion ; ou l'adresse de la page : `/ui/v2/login` pour V2, `/ui/login` pour V1) |
| Que sait la cible ? | le corps de la requête (identifiant ou nom d'utilisateur, vérifications demandées), l'agent utilisateur et, selon la version, l'adresse IP transmise par l'interface de connexion. **À vérifier** sur un appel réel : sans adresse IP fiable, « adresse bloquée » est inapplicable |
| Que gagne-t-on ? | compte gelé : **peu**, le site refuse déjà le compte au retour OIDC ; adresse bloquée : arrêter chez Zitadel une force brute que la bordure ne voit pas (la page de connexion de Zitadel n'est pas derrière notre Cloudflare) |
| Que risque-t-on ? | **une panne bloque tout le monde** : Vigie arrêtée, tunnel coupé, Worker au-delà de son quota, délai dépassé → aucune connexion, y compris celle qui permettrait de réparer (console Zitadel de l'instance, console de la Vigie). Avec `interruptOnError: false`, plus de panne, mais plus de blocage non plus |
| Un intrus maître de la Vigie ? | il pourrait refuser toutes les connexions (déni de service) ; il ne pourrait pas en ouvrir une de plus (la cible ne peut que refuser, pas accorder, avec un `webhook`) |

**Meilleure réponse au même besoin, sans code** : la **politique de verrouillage** de Zitadel (*Lockout policy* : nombre maximal d'essais de mot de passe et de code, `maxPasswordAttempts`, `maxOTPAttempts`, déjà lus par la Vigie dans `minimize`) [20]. Elle arrête la force brute sur un compte là où elle a lieu, sans dépendance à la Vigie. Revers : un attaquant peut verrouiller un compte exprès (déni de service sur un compte) ; d'où un seuil raisonnable (10) et la clé d'accès (passkey) pour les administrateurs, qui n'a pas de mot de passe à deviner.

### 3.4 Sécurité du point d'entrée, si l'on reçoit les événements

La Vigie n'est pas joignable d'Internet (sauf la console, derrière Cloudflare Access, qui refuserait Zitadel). Trois emplacements possibles :

| Option | Comment | Pour | Contre |
|---|---|---|---|
| A. Route dans la console | `vigie.nicephos.art/entree/zitadel`, exemptée d'Access (règle *Bypass* sur ce seul chemin) | simple | perce le seul verrou réseau de la Vigie ; le serveur de la console devient joignable de tout Internet, pour toute faille de son analyse HTTP |
| B. Nom à part dans le tunnel | `entree-vigie.nicephos.art` vers un **petit service à part** (un processus, une route, aucune autre fonction) | isolement | un service et un nom de plus ; la Vigie reste exposée indirectement |
| **C. Le Worker de bordure** | une route `entree-vigie.nicephos.art/zitadel` sur le Worker existant : il vérifie la signature et l'horodatage, puis écrit l'événement réduit dans Analytics Engine ou KV ; la Vigie le relit à sa minute… ou plus souvent | **aucune ouverture** vers l'hôte ; même modèle que la bordure (« aucune route d'entrée publique à ouvrir ») | le gain de délai fond : la Vigie relit Analytics Engine avec 2 minutes de retard (minute close). KV relu toutes les 10 s : quelques secondes, mais écritures KV limitées à 1 000 par jour en gratuit |

Dans tous les cas :

- vérifier `ZITADEL-Signature` en temps constant, refuser un horodatage de plus de 5 minutes (rejeu), garder les empreintes des appels reçus 10 minutes ;
- corps borné (64 Ko), JSON seulement, `POST` seulement ; règle du pare-feu de Cloudflare pour n'accepter que ce chemin et cette méthode ; limite de débit ;
- clé de signature dans le seul coffre du récepteur (secret du Worker, ou `VIGIE_SECRETS_DIR`), changée chaque année ;
- les événements reçus sont **confirmés par la lecture de l'API** (même identifiant agrégat et séquence) : un événement poussé et jamais retrouvé à la lecture est signalé (signature volée, ou erreur) ;
- les adresses IP de Zitadel Cloud ne sont pas publiées de façon stable (**à vérifier**) : pas de filtrage par adresse source, la signature fait foi.

**Délai réel gagné.** Avec l'option C et Analytics Engine, presque rien (2 à 3 minutes, comme la lecture). Avec KV, quelques secondes, au prix du quota. Avec A ou B, quelques secondes, au prix d'une ouverture. **Le gain ne justifie aujourd'hui aucune des trois.**

### 3.5 Recommandation Actions v2

| Usage | Verdict | Condition pour rouvrir |
|---|---|---|
| Remplacer la lecture par minute | **non** | — (la lecture reste la référence) |
| Événements critiques poussés (DS27, DS28) | **plus tard** | si une minute de délai pose un vrai problème (incident constaté, ou passage d'Access à une admin plus exposée) ; alors option C avec KV, sur une dizaine de types seulement |
| Bloquer une connexion (exécution `request`, `interruptOnError`) | **non** | Zitadel documente un mode « échec ouvert » au-delà d'un délai et une adresse IP fiable dans l'appel ; et la connexion d'urgence (compte de secours hors Login V2) est prouvée |
| Politique de verrouillage de Zitadel | **oui, maintenant** (réglage, pas de code) | — |
| Surveiller la création de cibles et d'exécutions | **déjà fait** (types `target.*`, `execution.*` suivis) ; à passer en **source unique** si ce n'est pas le cas (D30) | — |

Pourquoi la dernière ligne compte : un intrus administrateur de l'instance Zitadel pourrait poser une exécution `function` (`preaccesstoken`) qui ajoute un rôle `admin` dans les jetons, sans jamais toucher aux attributions de rôles (DS27 ne verrait rien). L'apparition d'une cible ou d'une exécution doit donc être une alerte immédiate.

---

## 4. Ce qu'il faudrait coder si c'est retenu

Une branche et une PR par ligne, revue avant la suivante.

| PR | Contenu | Prérequis |
|---|---|---|
| **E5a** (petite, recommandée dès maintenant) | règle Sigma à source unique « cible ou exécution Actions v2 ajoutée, changée ou retirée » (`target.added`, `target.changed`, `execution.set`, `execution.removed`, `action.*`, `org.flow.trigger_actions.set`), gravité haute, critique pour une exécution `function` ; un test ; ligne au wiki | aucun |
| E5b | CrowdSec, liste sans agent : entrée `crowdsec` dans `LISTS` de `vigie/menaces.js` (format, adresse de téléchargement, clé d'API dans `VIGIE_SECRETS_DIR` si exigée), plafond d'entrées revu, points (2 ?) ; mention au registre RGPD (aucun envoi) ; sortie ajoutée à la liste autorisée (BV-10) | D27 rouverte : liste gratuite sans contribution, licence vérifiée |
| E6a | Worker : route `entree-vigie.nicephos.art/zitadel`, vérification de `ZITADEL-Signature`, anti-rejeu, réduction du corps (mêmes champs que `minimize`), écriture dans KV (file courte, 100 entrées) ; tests | D28 : oui ; cible créée dans Zitadel (type `async`, `interruptOnError: false`) |
| E6b | Vigie : lecture de la file KV toutes les 10 s, événements `zitadel_*` avec l'origine « zitadel · Actions v2 », rapprochement avec la lecture de l'API (même identifiant, doublon écarté ; poussé jamais lu : alerte) ; page Santé | E6a |
| — | Blocage par exécution `request` | **non prévu** (D29) |

---

## 5. Questions à trancher par le propriétaire

| Id | Question | Proposition |
|---|---|---|
| D27 | CrowdSec : agent, contribution, bouncer | **non** ; la liste seule, plus tard, si elle s'obtient sans rien envoyer et que la licence le permet |
| D28 | Recevoir les événements de Zitadel par Actions v2 | **plus tard**, par le Worker (option C), seulement pour les types critiques ; la lecture par minute reste |
| D29 | Bloquer les connexions chez Zitadel depuis la Vigie | **non** ; régler à la place la politique de verrouillage de Zitadel (10 essais de mot de passe, 5 de code) |
| D30 | Alerte immédiate sur toute cible ou exécution Actions v2 (PR E5a) | **oui**, maintenant |
| Q1 | Quelle interface de connexion sert notre instance (Login V1 ou V2) ? | à relever dans la console Zitadel ; utile même hors de cette étude (CVE-2026-85056 visait Login V2) |
| Q2 | Accepter qu'une adresse de visiteur parte chez un tiers en échange d'une liste ? | non (D22) ; à revoir seulement avec un avis sur le registre RGPD |

---

## 6. Ce qui reste à vérifier, et comment

| Point | Comment le vérifier |
|---|---|
| Conditions de la liste communautaire CrowdSec en 2026 (contribution obligatoire, version « lite », taille) | page « Community Blocklist » de la documentation [3] et page des offres [4] ; créer un compte console gratuit et regarder ce qui est proposé sans agent |
| Liste CrowdSec sans agent (intégrations, *Blocklist as a Service*) en offre gratuite | [5], ou la console : « Blocklists » → « Integrations » |
| Licence des données de la liste (usage commercial, redistribution) | conditions générales de CrowdSec [8] |
| Contenu exact d'un signal | documentation « Data sharing » [6] ; en essai, `cscli console status` et le trafic sortant de l'agent |
| Empreinte mémoire de l'agent | `docker stats` sur l'image officielle, une heure, sans collection |
| Actions v2 incluses dans Zitadel Cloud gratuit | page des tarifs [18] ; créer une cible de test (console → Actions) |
| Forme de la signature, de la charge d'un événement, nouvelles tentatives | documentation Actions v2 [15][17] ; cible de test vers un service d'essai (instance de test, jamais l'instance de production) |
| Adresse IP présente dans l'appel `CreateSession` | même cible de test, exécution `request` en `interruptOnError: false`, sur l'instance de test |
| Rétention des événements en gratuit (un jour) | page des tarifs [18] ; `events/_search` sans date de début, date du plus ancien rendu |

---

## Vérifié le 19 octobre 2026

- CrowdSec, liste communautaire : disponible seulement avec l'agent (Security Engine) ; utilisateurs gratuits qui ne contribuent pas régulièrement : version « Lite » ; qui contribuent (signaux de scénarios officiels non modifiés) : liste complète ; payants : « Premium ». Source : [docs.crowdsec.net, Community Blocklist](https://docs.crowdsec.net/docs/central_api/community_blocklist).
- CrowdSec, listes « intégrations » (Blocklist as a Service) : un point d'accès HTTPS sans agent existe, mais en gratuit une lecture par 24 h, 10 000 adresses, 3 listes au plus ; elles portent sur des listes tierces ou gratuites (la liste communautaire elle-même paraît réservée à l'agent) : rien de plus que les listes Spamhaus, Feodo et Tor déjà lues par la Vigie. Liste communautaire : « Lite » 3 000 adresses, « Community » 15 000 (contribution de scénarios officiels non modifiés), « Premium » 60 000 (payante). Ancien bouncer Cloudflare par listes : abandonné par CrowdSec ; bouncer Worker : un seul Worker par route (conflit avec la bordure), 1 000 écritures KV par jour en gratuit. Sources : [listes](https://docs.crowdsec.net/u/blocklists/intro), [intégrations](https://docs.crowdsec.net/u/integrations/intro), [bouncer Cloudflare abandonné](https://docs.crowdsec.net/u/bouncers/cloudflare-deprecated), [bouncer Worker](https://github.com/crowdsecurity/cs-cloudflare-worker-bouncer), [routes des Workers](https://developers.cloudflare.com/workers/configuration/routing/routes/).
- Zitadel, Actions v2 : chaque appel porte l'en-tête `ZITADEL-Signature` (HMAC SHA-256 du corps et d'un horodatage, `t=…,v1=…`), clé de signature propre à chaque cible, générée à sa création et renouvelable. Sources : [Actions V2, introduction](https://zitadel.com/docs/apis/actionsv2/introduction), [vérifier la signature](https://zitadel.com/docs/guides/integrate/actions/testing-request-signature), [concepts](https://zitadel.com/docs/concepts/features/actions_v2).
- Restent à vérifier (section 6) : disponibilité des Actions v2 dans l'offre gratuite de Zitadel Cloud, garanties de livraison des exécutions « event », interface de connexion de notre instance (V1 ou V2).

## Sources

Adresses des pages officielles à consulter ; non relues en ligne le 19 octobre 2026 (voir l'en-tête) : chaque point marqué « à vérifier » se contrôle sur la page indiquée.

1. CrowdSec, documentation, présentation (agent, bouncers, console). https://docs.crowdsec.net/docs/intro
2. CrowdSec, dépôt de l'agent, licence MIT. https://github.com/crowdsecurity/crowdsec
3. CrowdSec, *Community Blocklist* (conditions d'accès, contribution). https://docs.crowdsec.net/docs/next/central_api/community_blocklist
4. CrowdSec, offres et tarifs (Community, Premium). https://www.crowdsec.net/pricing
5. CrowdSec, intégrations de listes sans agent (*Blocklist integrations*). https://docs.crowdsec.net/u/integrations/intro
6. CrowdSec, données partagées par l'agent (*Data sharing*, signaux, contexte). https://docs.crowdsec.net/docs/next/central_api/intro
7. CrowdSec, CTI API (quotas). https://docs.crowdsec.net/u/cti_api/intro
8. CrowdSec, conditions générales d'utilisation. https://www.crowdsec.net/terms-of-use
9. CrowdSec, politique de confidentialité. https://www.crowdsec.net/privacy-policy
10. CrowdSec Hub, collections et analyseurs. https://app.crowdsec.net/hub
11. CrowdSec Hub, `crowdsecurity/base-http-scenarios`. https://app.crowdsec.net/hub/author/crowdsecurity/collections/base-http-scenarios
12. CrowdSec, composant AppSec. https://docs.crowdsec.net/docs/next/appsec/intro
13. CrowdSec, API locale et `cscli decisions`. https://docs.crowdsec.net/docs/next/local_api/intro
14. CrowdSec, bouncer Cloudflare Worker. https://docs.crowdsec.net/u/bouncers/cloudflare-workers
15. Zitadel, *Actions V2* (cibles, exécutions, conditions). https://zitadel.com/docs/concepts/features/actions_v2
16. Zitadel, API `ActionService` v2. https://zitadel.com/docs/apis/resources/action_service_v2
17. Zitadel, *Using Actions* (signature `ZITADEL-Signature`, exemples). https://zitadel.com/docs/guides/integrate/actions/usage
18. Zitadel, tarifs de Zitadel Cloud. https://zitadel.com/pricing
19. Zitadel, API des sessions v2 (`CreateSession`, `SetSession`). https://zitadel.com/docs/apis/resources/session_service_v2
20. Zitadel, politique de verrouillage (*Lockout policy*). https://zitadel.com/docs/guides/manage/console/default-settings#lockout
