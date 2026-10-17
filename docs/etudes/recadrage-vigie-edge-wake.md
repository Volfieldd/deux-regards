# Recadrage de la Vigie : détection en bordure et concepts de marlinOS (pipeline WAKE)

| | |
|---|---|
| Statut | Étude de recadrage, rien n'est développé. Phases A et B faites et fusionnées (#100 à #104) ; la phase C est suspendue en attendant ce recadrage. |
| Date | 17 octobre 2026. Sources consultées ce jour-là. |
| Demande | « J'aimerais introduire de nouveaux concepts, notamment : Detection at the edge et les concepts introduits par marlinOS, est-il possible de reprendre des composants, en particulier le pipeline Wake. Ça demande un recadrage je pense. » Source indiquée : marlinos.io. |
| Base | [`journalisation-securite.md`](journalisation-securite.md), [`annexe-vigie-architecture.md`](annexe-vigie-architecture.md), [`annexe-vigie-cloudflare.md`](annexe-vigie-cloudflare.md), revues des phases A et B. |

---

## En bref

- **marlinOS** est un SOC décentralisé (FreeBSD, Linux) : chaque machine analyse ses propres journaux avant de les écrire (« Detection at the edge »), les machines échangent leurs signaux sur les entités (adresses, comptes, sessions), et une alerte n'existe que si **au moins deux sources indépendantes** concordent (« Quorum across the mesh »). Le pipeline **WAKE** enchaîne, dans rsyslog : analyse, enrichissement (menaces connues, géolocalisation), score par entité avec décroissance, règles Sigma corrélées, seize détecteurs comportementaux, consensus [1][2][3].
- **Reprendre ses composants : non, pas en l'état.** Le site ne publie ni licence ni code source, et rien n'est trouvable sur GitHub sous ces noms (vérifié le 17 octobre 2026) : sans licence, aucun droit de reprendre le code. Et l'outil est fait pour une flotte de machines, avec des modules C pour rsyslog : notre site est une seule application Node qui produit déjà des événements structurés. Un quorum « deux machines au moins » n'a pas de sens sur une seule machine. Si vous tenez au produit lui-même, la voie est d'écrire à l'éditeur (contact@marlinos.io) pour connaître la licence (décision `D17`).
- **Reprendre ses concepts : oui, et ils améliorent nettement la Vigie.** Les idées ne sont pas protégées ; elles répondent même à vos demandes (moins de fausses alertes, détection plus fine du vol de session, voir le trafic que le site ne voit pas). Six concepts sont retenus :
  1. **Entités et score composite** avec décroissance (« phéromone ») : on suit des entités (adresse, réseau, compte, session, empreinte de navigateur), pas des événements isolés ; les petits signaux s'additionnent et s'effacent avec le temps.
  2. **Quorum entre sources indépendantes** : chez nous, les sources sont le site, la **bordure Cloudflare** (nouveau capteur), Zitadel et les contrôles de la Vigie. Une alerte « moyen » ou « haut » demande deux sources ; les constats sûrs d'une seule source (rôle donné hors de l'application, chaîne rompue, cookie rejoué) restent des alertes immédiates.
  3. **Détection en bordure** : un **Cloudflare Worker** (gratuit, 100 000 requêtes par jour) devant l'admin, la connexion et les pages, qui voit ce que le site ne voit pas (empreinte TLS, opérateur réseau, requêtes arrêtées par Cloudflare), applique les blocages **avant** le site, et transmet ses constats signés.
  4. **Règles au format Sigma**, avec ses corrélations (comptage, valeurs distinctes, suite temporelle), étiquetées MITRE ATT&CK : un format standard, lisible, versionné, au lieu de règles écrites en code.
  5. **Détecteurs comportementaux** inspirés de `waked` : première apparition, heure inhabituelle, vitesse (moyenne + k écarts-types), voyage impossible, pivot d'identifiants (échecs puis succès), exploration lente, chaîne d'attaque, rôle incohérent, cible commune.
  6. **La boucle de l'analyste plutôt que le tableau de bord** : la console classe les **entités** par concordance des sources ; les décisions de l'analyste repartent vers la détection (liste blanche d'une entité, étiquette de contexte, mise en sourdine par profil) en plus des blocages déjà faits.
- **Ce qui ne change pas** : les phases A et B (événements du site, Vigie isolée, chaîne, décisions signées, Zitadel) sont la base de ce recadrage ; rien n'est à refaire.
- **Plan révisé** : phase C coupée en trois (C1 moteur d'entités et quorum, C2 règles Sigma et détecteurs, C3 capteur en bordure), puis D (console centrée sur les entités) et E (compléments). Tout reste gratuit, les limites sont dites.

---

## 1. Ce qu'est marlinOS (d'après ses pages)

| Élément | Ce qu'en dit le site | Source |
|---|---|---|
| Principe | « Detection at the edge. Quorum across the mesh. » ; « No box has to see everything. » ; la machine qui produit un journal l'analyse, l'enrichit, le compare aux règles et note l'entité « avant que la ligne soit écrite sur le disque » | [1][2] |
| Quorum | « an alert requires at least two distinct sources » ; une source ne peut pas se confirmer elle-même (seuls les renforts venus d'autres sources comptent) | [2][4] |
| Signaux faibles | exemple : quatre sources voient la même adresse, contributions +1,8, +1,6, +1,9, +2,3 : total 7,6 au-dessus d'un seuil de 7,0 qu'aucune n'atteignait seule | [2] |
| Ce qui circule | des verdicts et des métadonnées de corrélation, pas les journaux bruts (« forwarding raw logs becomes a policy choice ») | [2] |
| Autonomie | la détection continue hors ligne ; seule la remise des verdicts attend | [2] |
| WAKE, étapes | 1. analyse SIMD (TurboVM, C) ; 2. `mmenrich` : menaces connues (adresses, domaines, empreintes) et GeoIP/ASN, sans état ; 3. `mmwake` : compteurs par entité, score composite, dépôt dans une table partagée (« phéromone ») ; 4. `immesh` : diffusion des scores aux pairs (SWIM, PlumTree), décroissance globale ; 5. `mmsigma` : règles Sigma compilées, corrélations `event_count`, `value_count`, `temporal`, balises (beaconing), réduction chez un « propriétaire » choisi par hachage ; 6. `waked` (Python) : 16 détecteurs comportementaux sur un magasin DuckDB/Parquet, verdicts projetés en OCSF 1.8.0 | [3] |
| Détecteurs | 12 par entité (profil, première apparition, heure, vitesse k·σ, mouvement latéral, exfiltration lente, voyage impossible 900 km/h, tunnels DNS et ICMP, catégories croisées, pivot d'identifiants, exploration lente), 3 de corrélation (rôle incohérent, chaîne d'attaque MITRE, séquence ordonnée), 1 par destination (cible commune, relève après compromission) ; même forme de signal pour tous ; signaux gardés 7 jours, 30 jours pour haut et critique | [5] |
| Console | classement par concordance ; boucle en cinq temps (signal, tri, contexte, verdict, politique) ; trois décisions repartent vers la détection : liste blanche d'une entité, étiquette de contexte, mise en sourdine par profil | [4] |
| Plates-formes | FreeBSD 16 ; Debian 13, Ubuntu 26.04, Alpine 3.24 et Flatcar (« rsyslog + WAKE only ») ; flotte (`fleetd`, `fleetserver`), réseau WireGuard | [6][7] |
| Licence, code source | **non indiqués** sur les pages consultées ; aucun dépôt public trouvé | [6][7] |

---

## 2. Reprendre des composants ?

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **A. Code de WAKE (modules rsyslog, `waked`)** | moteur éprouvé, rapide | aucune licence publiée : aucun droit de copier ni de modifier ; modules C pour rsyslog, alors que nos événements sont déjà structurés (JSON) ; conçu pour une flotte | **écartée** tant qu'il n'y a pas de licence |
| **B. Paquets marlinOS « rsyslog + WAKE » en conteneur** (Debian, Alpine, image OCI) à côté de la pile, lisant les journaux du site et du tunnel | produit tel quel | licence et conditions inconnues ; une seule machine : le quorum à deux sources n'est jamais atteint sans tricher ; duplique la Vigie ; journaux du site à reformater pour rsyslog | à reconsidérer seulement après réponse de l'éditeur (`D17`) |
| **C. Concepts repris dans la Vigie** (Node, déjà en place), capteur en bordure Cloudflare | aucune question de licence ; garde l'isolement, la chaîne, les décisions signées des phases A et B ; adapté à un site et quelques sources | à écrire nous-mêmes (sans le code de marlinOS) | **retenue** |

Règles Sigma : le format est ouvert, et les règles publiques de SigmaHQ sont sous **Detection Rule License** (usage libre, privé comme commercial, à condition de citer l'auteur dans la règle et dans ce qui affiche une correspondance) [8][9]. Les nôtres seront écrites pour le site (ses événements) ; une règle reprise de SigmaHQ garderait sa mention d'auteur.

---

## 3. Les concepts transposés à la Vigie

### 3.1 Entités et score composite (`mmwake`)

| Entité | Clé | Sources possibles |
|---|---|---|
| Adresse | IP complète | site, bordure, Zitadel (adresse de l'agent) |
| Réseau | /24 ou /48, opérateur (ASN, fourni par la bordure) | site, bordure |
| Compte | `sub` | site, Zitadel |
| Session | empreinte de session (12 caractères) | site |
| Appareil | empreinte du navigateur (phase A, N1) et empreinte TLS (bordure) | site, bordure |

- Chaque événement ou signal **dépose** des points sur une ou plusieurs entités (poids par type, réglable) ; le score **décroît** avec le temps (demi-vie réglable, une heure par défaut) ; il est tenu en mémoire et recalculable depuis la chaîne.
- **Seuil** : par classe d'entité, fixe au départ ; plus tard, ajusté sur l'habitude (moyenne glissante par tranche horaire de la semaine, comme `waked`).
- Les **liens** entre entités (cette adresse a utilisé ce compte, cette session, cette empreinte) permettent de remonter d'un signal à tout ce qui s'y rattache.

### 3.2 Quorum entre sources (`immesh`, « mesh consensus »)

Chez nous, pas de flotte de machines : les **sources indépendantes** sont celles que la Vigie distingue déjà (origine du signal, phase A) :

| Source | Confiance (phase A) | Exemples |
|---|---|---|
| Site | rapporté | saisies, pièges, sessions, droits |
| Bordure Cloudflare (nouveau) | constaté (signé par le Worker) | empreinte TLS, opérateur, requêtes bloquées en bordure, débit sur les images en cache |
| Zitadel | constaté | mots de passe faux, facteurs, rôles |
| Contrôles de la Vigie | constaté | chaîne, sauvegardes, battement |

Règle proposée (`D18`) :

- alerte **« moyen » ou « haut »** : score de l'entité au-dessus du seuil **et** au moins **deux sources** distinctes y ont contribué ; une source seule peut faire monter le score, pas déclencher (contre la fatigue d'alerte, votre demande N8) ;
- **exceptions à source unique**, parce qu'une seule observation suffit à prouver l'incident : rôle donné hors de l'application, ticket falsifié, déclencheur supprimé, chaîne rompue, cookie rejoué depuis un autre appareil, emprunt d'identité ou politique de connexion affaiblie dans Zitadel ;
- un site compromis (MV11) ne peut plus déclencher seul une alerte « moyen » ou « haut » par de faux événements, ni en masquer une que la bordure et Zitadel confirment.

### 3.3 Détection en bordure : un Cloudflare Worker (`mmenrich` et « at the edge »)

Un **Worker** est un petit programme qui s'exécute chez Cloudflare avant que la requête n'atteigne le site. Ce qu'il voit, sur toutes les offres [10] :

| Donnée (`request.cf`) | Usage |
|---|---|
| `asn`, `asOrganization` | opérateur réseau : changement d'opérateur pendant une session, réseaux d'hébergeurs |
| `tlsClientCiphersSha1`, `tlsClientExtensionsSha1`, `tlsClientHelloLength`, `tlsVersion` | **empreinte TLS** du client (même famille que JA3/JA4) : un cookie volé utilisé depuis un autre logiciel se voit même si le navigateur annoncé est le même |
| `country`, `city`, `latitude`, `longitude`, `clientTcpRtt`, `httpProtocol` | position, distance réseau, protocole |
| `botManagement` (score, JA3/JA4 tout faits) | **payant** (Bot Management, Enterprise) : non retenu |

Ce que ferait le Worker :

1. **Enrichir et signer** : il ajoute à la requête transmise au site des en-têtes `x-bordure-*` (empreinte TLS, opérateur, score de bordure) signés HMAC avec une clé connue du Worker et du site seulement ; le site les met dans ses événements (origine « bordure », confiance « constaté ») et refuse des en-têtes non signés (un visiteur ne peut pas les fabriquer).
2. **Appliquer les décisions avant le site** : la liste des adresses bloquées (déjà signée par la Vigie) est copiée dans Workers KV ; le Worker répond 403 lui-même. C'est le « décisions poussées vers les bords » de marlinOS.
3. **Compter ce que le site ne voit pas** : requêtes bloquées en bordure, débit par adresse sur les pages ; un résumé par minute écrit dans Workers Analytics Engine (gratuit : 100 000 points par jour [11]) et lu par la Vigie (API, jeton en lecture seule) — aucune route d'entrée publique à ouvrir.
4. **Limites** : 100 000 requêtes par jour, 10 ms de calcul par requête [12] ; le Worker n'est donc posé que sur `/admin*`, `/auth/*` et les pages HTML, **jamais sur `/media/*`** (images : règle de limite de débit de Cloudflare, déjà en place). Au-delà du quota, Cloudflare laisse passer (mode « fail open » de la route, à vérifier) : le site garde ses propres protections.

### 3.4 Enrichissement par des listes de menaces gratuites (`mmenrich`)

| Liste | Contenu | Conditions | Usage |
|---|---|---|---|
| Spamhaus DROP / EDROP | réseaux détournés ou entièrement malveillants | gratuite, citer Spamhaus si redistribuée [13] | étiquette « réseau malveillant », poids fort |
| abuse.ch Feodo Tracker | serveurs de commande de botnets | gratuite, usage commercial et non commercial [14] | étiquette |
| Liste des sorties Tor | nœuds de sortie Tor | publique | étiquette (pas un blocage : contexte) |
| CrowdSec (liste communautaire) | adresses signalées par la communauté | compte gratuit (à vérifier) | phase E, en option |

Téléchargées une fois par jour **par la Vigie** (sortie vers Internet déjà prévue pour Zitadel), gardées dans sa base, consultées à la réception des événements ; aucune adresse de visiteur n'est envoyée à un tiers (pas d'interrogation en ligne).

### 3.5 Règles Sigma et détecteurs comportementaux (`mmsigma`, `waked`)

- Les cas **DS1 à DS30** deviennent des **règles Sigma** sur les événements de la Vigie (champs : `type`, `severity`, `composant`, `sub`, `ip`, `route`, `detail.*`), avec leurs corrélations (`event_count` : 3 échecs OIDC en 10 min ; `value_count` : 10 identifiants différents en 10 min ; `temporal` : repérage puis tentative puis accès, DS23), une gravité, une étiquette MITRE ATT&CK, et le mode de l'interrupteur de règle (arrêt, observer, alerter, bloquer). Moteur d'évaluation : un sous-ensemble de Sigma écrit pour la Vigie, testé règle par règle.
- **Détecteurs comportementaux** (code, parce qu'ils raisonnent sur un historique) :

| Détecteur (inspiré de `waked`) | Chez nous | Cas |
|---|---|---|
| première apparition | appareil, pays, opérateur jamais vus pour ce compte en 90 jours | DS4 |
| heure inhabituelle | activité d'un compte dans une tranche horaire calme pour lui | DS18 |
| vitesse (moyenne + k·σ) | lectures de fiches, téléchargements, pages vues par compte ou adresse | DS17, DS18 |
| voyage impossible (900 km/h) | site, bordure et Zitadel ensemble | DS3 |
| pivot d'identifiants | échecs (Zitadel, OIDC) puis succès, sur des heures | DS25 |
| exploration lente | quelques requêtes par heure sur des jours (pièges, 404, jetons faux) | DS15, DS16 |
| chaîne d'attaque | tactiques MITRE successives sur une entité | DS23 |
| rôle incohérent | un compte fait ce que son rôle ne fait jamais (relecteur qui exporte, photographe hors de sa portée) | DS10 |
| cible commune | plusieurs adresses contre un même compte (essais d'identifiants répartis) | nouveau, DS31 |

- Même forme de **signal** pour tous (détecteur, entité, type, confiance, gravité, preuve, tactique et technique MITRE), déposé sur l'entité et gardé dans la chaîne.

### 3.6 La boucle de l'analyste (console, phase D)

- **Vue Entités** classée par score et par nombre de sources concordantes ; fiche d'une entité : tous ses signaux avec leur origine, ses liens (comptes, sessions, appareils, réseaux), son profil horaire.
- **Boucle en cinq temps** : signal, tri (acquitter, écarter, escalader), contexte, verdict, politique.
- **Décisions qui repartent vers la détection**, en plus des blocages et révocations déjà faits : **liste blanche** d'une entité (son score plafonné, toujours observée), **étiquette de contexte** (« VPN de Sébastien », « photographe en voyage »), **mise en sourdine par profil** (une règle ramenée à « info » pour un rôle). Elles sont signées et poussées au site et à la bordure comme les autres décisions.
- **Santé de la détection** : règles trop bruyantes et règles muettes (repris de `waked`).

### 3.7 Ce qui circule : des verdicts plutôt que des journaux

marlinOS fait voyager des verdicts, pas les journaux bruts. Chez nous, le site envoie déjà des **événements** (faits de sécurité, jamais les journaux) ; on va plus loin sur le public : pour les familles à fort volume (404, pièges, jetons faux), le site envoie un **verdict par entité et par fenêtre** (adresse, compte, nombre, score) au lieu de chaque événement. Moins de données personnelles transmises et gardées (RGPD, minimisation), moins de volume.

### 3.8 Format d'échange : OCSF

Les verdicts et signaux peuvent être projetés en **OCSF 1.8.0** (classes Détection, Authentification, HTTP), comme `waked` : un format ouvert pour brancher plus tard un autre outil (SIEM, CrowdSec) sans rien réécrire. Proposé en phase E (`D21`).

---

## 4. Ce qui change dans ce qui est déjà fait

| Élément | Changement |
|---|---|
| Événements du site (phase A) | inchangés ; ajout des en-têtes signés de la bordure dans le contexte ; verdicts agrégés pour les familles à fort volume (3.7) |
| Vigie (phase B) | inchangée ; s'ajoutent le moteur d'entités, les règles, les listes de menaces, la lecture de la bordure |
| Décisions signées | trois types en plus (liste blanche, étiquette, sourdine) ; copie des blocages dans Workers KV pour la bordure |
| Étude principale, cas DS1 à DS30 | deviennent des règles Sigma ou des détecteurs ; DS31 (cible commune) ajouté ; seuils exprimés en points sur les entités |
| Annexe Cloudflare | le Worker s'ajoute aux réglages gratuits ; la règle R1 (liste `vigie_bloquees`) reste, la bordure la complète |

---

## 5. Plan révisé

| Phase | Contenu | Gratuit ? |
|---|---|---|
| **C1. Moteur d'entités et quorum** | entités, dépôts, décroissance, liens ; quorum entre sources et exceptions à source unique ; alertes (ouverture, regroupement, statut) ; interrupteurs et modes par règle | oui |
| **C2. Règles et détecteurs** | sous-ensemble de Sigma (sélection, `event_count`, `value_count`, `temporal`), DS1 à DS31 écrits en Sigma ; détecteurs comportementaux (3.5) ; listes de menaces (3.4) ; contrôle des rôles sur les sauvegardes du site (annexe architecture 4.4) ; un test par règle (attaque détectée, parcours normal silencieux, textes allemands et français compris) ; un mois en « observer » | oui |
| **C3. Capteur en bordure** | Cloudflare Worker (en-têtes signés, blocage en bordure depuis KV, résumés dans Analytics Engine), routes limitées à l'admin, la connexion et les pages ; lecture par la Vigie ; essai sur l'instance de test d'abord | oui (100 000 requêtes par jour) |
| **D. Console et notifications** | console `vigie.nicephos.art` (Access + Zitadel, quatre rôles) centrée sur les entités et la boucle en cinq temps ; décisions qui repartent vers la détection ; notifications (admin, e-mail, Signal) ; tête de la chaîne envoyée chaque nuit (NB1) | oui |
| **E. Compléments** | recopie des blocages dans la liste Cloudflare par l'API ; export OCSF ; CrowdSec en option ; jeu d'attaques rejouable | oui |

---

## 6. Risques et limites

- **Sans le code de marlinOS**, tout est écrit pour la Vigie : plus de travail, mais aucune dépendance à une licence inconnue.
- **Quorum** : moins de fausses alertes, mais une attaque visible d'une seule source et sans exception prévue reste sous le seuil d'alerte (elle reste dans les signaux et le score). La liste des exceptions à source unique (3.2) est le point à surveiller pendant le mois d'observation.
- **Bordure** : un Worker est du code chez Cloudflare (sous-traitant déjà déclaré) ; il traite les mêmes données que Cloudflare aujourd'hui. Quota gratuit : au-delà, la bordure se tait et le site continue seul.
- **Empreinte TLS** : change avec une mise à jour du navigateur ; c'est un signal, pas une preuve (poids modéré, jamais une exception à source unique).
- **Listes de menaces** : faux positifs possibles (adresses réattribuées) : étiquettes et points, jamais un blocage automatique seul.

---

## 7. Décisions à prendre

| Id | Question | Proposition |
|---|---|---|
| D17 | Écrire à l'éditeur de marlinOS pour connaître la licence et la disponibilité des paquets | facultatif ; le plan n'en dépend pas |
| D18 | Quorum : deux sources pour « moyen » et « haut », exceptions à source unique (3.2) | oui |
| D19 | Capteur en bordure (Cloudflare Worker) sur l'admin, la connexion et les pages, jamais sur les images | oui, essai sur l'instance de test d'abord |
| D20 | Règles au format Sigma (sous-ensemble) plutôt qu'en code | oui |
| D21 | Export OCSF des verdicts | phase E, si un autre outil doit s'y brancher |
| D22 | Listes de menaces gratuites (Spamhaus DROP, Feodo Tracker, sorties Tor) | oui ; CrowdSec plus tard |
| D23 | Verdicts agrégés au lieu d'événements unitaires pour les familles publiques à fort volume | oui |

---

## Sources

1. marlinOS, page d'accueil (« Detection at the edge. Quorum across the mesh. »). https://marlinos.io
2. marlinOS, *Concept* (localité, quorum, autonomie, signaux faibles, ce qui circule). https://marlinos.io/concept.html
3. marlinOS, *WAKE pipeline* (étapes, modules, corrélations Sigma, gossip, magasin, OCSF). https://marlinos.io/wake.html
4. marlinOS, *Console* (concordance, boucle en cinq temps, décisions poussées). https://marlinos.io/console.html
5. marlinOS, *Behavioral detectors* (16 détecteurs, seuils, forme des signaux). https://marlinos.io/detectors.html
6. marlinOS, *Get* (paquets, systèmes) ; aucune licence indiquée. https://marlinos.io/get.html
7. marlinOS, *Fleet* et *Platform* ; aucune licence ni dépôt indiqués. https://marlinos.io/fleet.html · https://marlinos.io/platform.html
8. SigmaHQ, règles et spécification (corrélations `event_count`, `value_count`, `temporal`). https://github.com/SigmaHQ/sigma
9. Detection Rule License 1.1. https://github.com/SigmaHQ/Detection-Rule-License
10. Cloudflare Workers, propriétés `request.cf` (toutes offres, sauf `botManagement`). https://developers.cloudflare.com/workers/runtime-apis/request/
11. Cloudflare, Workers Analytics Engine, tarifs (offre gratuite : 100 000 points écrits par jour). https://developers.cloudflare.com/analytics/analytics-engine/pricing/
12. Cloudflare Workers, limites (offre gratuite : 100 000 requêtes par jour, 10 ms de calcul). https://developers.cloudflare.com/workers/platform/limits/
13. Spamhaus, conditions des listes DROP. https://www.spamhaus.org/drop/terms/
14. abuse.ch, Feodo Tracker, *About*. https://feodotracker.abuse.ch/about/
