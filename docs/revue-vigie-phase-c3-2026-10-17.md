# Revue de code et de sécurité : Vigie, phase C3 et suites de la revue C (17 octobre 2026)

| | |
|---|---|
| Objet | PR #109 (suites de l'arbitrage de la revue C) et PR #110 (C3 : capteur en bordure Cloudflare). |
| Méthode | Deux relectures indépendantes (sécurité ; justesse et coût), plus une relecture directe. Chaque constat retenu a été reproduit (script, mesure de calcul, test) ou lu dans le code. |
| Décision | Gravité haute corrigée, ainsi que les points moyens et bas peu coûteux ; tests de non-régression dans `test/vigie-bordure.test.js` et `test/vigie-moteur.test.js`. Le reste est noté ci-dessous. |

Gravité : **H** haute, **M** moyenne, **B** basse, **I** information.

## Corrigé

| Id | Gravité | Constat | Correction |
|---|---|---|---|
| D1 | H | Worker : chaque instance revérifiait et relisait toute la liste une fois par minute, pendant une requête de visiteur (calculs BigInt par entrée) : 12,5 ms pour 1 000 entrées, 90 ms pour 10 000, au-delà des 10 ms de l'offre gratuite (erreur 1102 pour le visiteur, liste jamais rafraîchie). Un scan réparti en mode « bloquer » gonflait la liste d'une adresse IPv6 par requête. | IPv4 en nombres ordinaires, adresses seules dans un ensemble, chemin rapide pour l'IPv4 ; liste inchangée jamais revérifiée ; 1 000 entrées au plus en bordure (décisions manuelles d'abord, puis les plus récentes ; le site applique toute la liste) : 3,8 ms mesurés pour 1 000 entrées, recherche sous 0,01 ms. Blocage automatique d'une IPv6 : son /64. |
| D2 | M | Portées « admin » et « connexion » contournées en bordure par un chemin encodé (`/%61dmin`, `/a%75th/login`), classé « page » dans Analytics Engine. | Chemin décodé comme le routeur du site (`routePath`, mêmes règles des deux côtés) pour décider, classer et signer ; testé sur `/%61dmin/photos`, `//admin`, `/a%75th/login`. |
| D3 | M | Une seule entrée que le Worker lit autrement que la Vigie (identifiant de zone `%eth0`, forme `::ffff:…` non IPv4) faisait refuser toute la liste, sans que personne le sache (erreur gardée en mémoire du Worker). | Entrée illisible écartée seule et comptée ; liste refusée ou en partie écartée : point « liste_refusee » / « liste_partielle » dans Analytics Engine, lu par la Vigie (alerte « bordure muette ») ; la Vigie refuse les identifiants de zone. |
| D4 | M | Lecture d'Analytics Engine : minute lue 60 s après sa fin (et non 2 min) puis jamais relue ; requête sans borne sur le curseur (réponse tronquée en charge, minute en partie lue marquée lue) ; Vigie arrêtée plus de 10 min : période perdue sans signal ; événements et curseur écrits séparément. | Curseur fondé sur l'heure : minute lue quand elle est close depuis 2 min, requête bornée `[curseur, borne[` (une heure au plus), curseur avancé même sans point ; période non lue et réponse tronquée signalées ; événements, opérateurs appris et curseur dans une seule transaction. |
| D5 | M | Signature des en-têtes : le Worker signait le chemin WHATWG, le site le chemin brut reçu après cloudflared (qui réencode `|`, `^`) : signatures refusées pour des requêtes légitimes, alertes `edge_signature_invalid` sur des adresses honnêtes. Impossible de savoir, en cas d'échec, si c'est l'adresse qui diffère. | Chemin décodé et normalisé des deux côtés ; le Worker transmet l'adresse signée (`x-bordure-ip`) : signature bonne mais adresse différente de celle que voit le site → motif « adresse différente » (réglage `TRUST_PROXY` ou rejeu), distinct de « signature fausse ». |
| D6 | M | Dernier recours : `VIGIE_APPLIQUER=0` n'arrête pas la bordure ; une levée met jusqu'à 4 à 5 minutes à s'y appliquer. | Variable `DESACTIVE = "1"` du Worker (effet au déploiement) ; délais et sortie de secours documentés. |
| D7 | B | Liste de bordure rejouable dans KV (sans contrôle d'âge ni de version) : un blocage levé revenait. | Liste de plus de 24 h refusée (la Vigie la republie toutes les 6 h), version plus ancienne que celle en place refusée. |
| D8 | B | Le site acceptait encore une liste sans `usage`. | Seulement celle gardée sur le disque avant ce changement ; une liste reçue doit dire `usage: site`. |
| D9 | B | « Opérateur jamais vu » apprenable d'avance (une visite de `/auth/login` suffisait), apprentissage du premier ASN seulement au premier relevé, 500 derniers ajoutés gardés (l'opérateur légitime le plus ancien finissait par sortir). | Seules les pages de l'admin servies (200, session ouverte) comptent et apprennent ; tout le premier relevé apprend ; les 500 vus le plus récemment sont gardés. |
| D10 | B | En-têtes de bordure faux : une alerte par minute et par raison pour tout le site (un visiteur masquait une vraie désynchronisation). | Une par minute, par raison et par adresse ; clés bornées. |
| D11 | B | Avant le premier contrôle des rôles réussi, les adresses des administrateurs sont inconnues : blocage automatique possible de l'une d'elles (appliqué aussi en bordure). | Aucun blocage automatique d'adresse tant qu'aucun contrôle des rôles n'a réussi. |
| D12 | B | Curseur du moteur enregistré hors de la transaction du lot (lot analysé deux fois après un arrêt brutal ; deux écritures forcées par lot). | Curseur dans la même transaction (une écriture forcée par lot, comme l'annoncent les abaques). |
| D13 | B | Signal « liste changée » émis avant la validation de la transaction du moteur : liste calculée sur une décision qu'un point de sauvegarde annulait ensuite ; copie dans KV sautée jusqu'à 6 h. | Signal émis après la validation ; la copie dans KV compare le contenu (empreinte), plus la version. |
| D14 | B | `parseIp` : `1:2:3:4:5:6:7:8::` accepté, `1:2:3:4:5:6:7:8:9::` levait une exception. | Bornes vérifiées. |
| D15 | B | Empreinte TLS brute : un événement « info » à chaque nouvelle valeur (elle change avec la reprise de session TLS). | Gardée avec la session pour l'enquête, plus suivie dans les changements de contexte. |
| D16 | I | Journaux du Worker (observability) : ils garderaient l'adresse complète des pages, jetons compris. | Coupés dans le modèle `wrangler.toml`. |

## Noté, à arbitrer

| Id | Gravité | Constat | Proposition |
|---|---|---|---|
| NC3-1 | M | Quorum : les mêmes réponses 404 produisent l'événement du site (rafale de 404) et `bordure_erreurs` : une seule action fournit deux « sources » (risque de blocage automatique d'une adresse partagée en mode « bloquer »). `bordure_rafale` et `bordure_nouvel_operateur` apportent, eux, ce que le site ne voit pas. | `bordure_erreurs` en contexte seulement (points sans compter comme une source, comme les listes de menaces), le quorum venant de la bordure par ses constats propres. |
| NC3-2 | B | Quota épuisable à dessein : 100 000 requêtes par jour (y compris celles d'une adresse bloquée) font passer la route en « laisser passer » ; l'alerte de silence n'arrive qu'après 6 h. | Règle de limite de débit Cloudflare (gratuite) placée avant le Worker sur les pages, notification Cloudflare sur l'usage du Worker, silence ramené à 1 h. |
| NC3-3 | B | La mention de la bordure dans la page de confidentialité dépend de `VIGIE_BORDURE_KEY` ; un Worker déployé sans clé écrirait quand même dans Analytics Engine. | Réglage explicite côté site (`VIGIE_BORDURE=1`) ou garder la clé comme condition (le guide l'impose). |
| NC3-4 | I | Retard d'analyse de plus de 100 000 événements : le moteur saute les plus anciens (le début d'une attaque pourrait échapper). Irréaliste au débit prévu (abaques). | Accepter. |
| NC3-5 | I | `delai_re_ms` borne chaque essai, pas l'événement entier ; aucune règle livrée n'utilise `re`. | Accepter. |
| NC3-6 | I | Le jeton Cloudflare « Workers KV Storage Edit » porte sur tous les espaces KV du compte (Cloudflare ne permet pas mieux). | Accepter, documenté. |

## À vérifier sur l'instance de test

Ce que ni le code ni les tests ne peuvent établir :
- l'adresse que voit le site derrière Worker → cloudflared (`X-Forwarded-For` lu par `TRUST_PROXY`) : motif « adresse différente » dans `edge_signature_invalid` si elle diffère ;
- la forme du chemin reçue par le Worker (normalisation des URL de la zone) ;
- le calcul réel du Worker (tableau de bord : CPU time) ;
- le délai d'arrivée des points dans Analytics Engine (2 minutes de marge prévues) ;
- la stabilité des empreintes TLS (part des sessions ordinaires dont `tls_change` apparaît).

## Arbitrage du 17 octobre 2026

| Id | Décision | Fait |
|---|---|---|
| NC3-1 | erreurs vues en bordure en contexte | Bloc `vigie` des règles : `contexte: true` (points dans le score, jamais une source du quorum) ; `bordure_erreurs` passe en contexte (2 points). La bordure fait le quorum par ses constats propres (rafales de pages, opérateurs). |
| NC3-2 | protéger contre l'épuisement du quota | Battement du Worker (tâche planifiée gratuite, toutes les 5 minutes, avec l'état de sa liste) ; alerte « bordure muette » s'il manque depuis 20 minutes, ou si aucune requête n'est vue depuis 6 h (Cloudflare ne dit pas si un quota épuisé arrête les tâches planifiées). La seule règle gratuite de limite de débit reste sur les images ; la recopie de la liste `vigie_bloquees` (phase E) arrêtera les adresses connues avant le Worker. |
| NC3-3 | condition gardée | La page de confidentialité décrit la bordure quand `VIGIE_BORDURE_KEY` est réglée ; le guide l'impose avant tout déploiement du Worker. |
| NC3-4 à NC3-6 | acceptés | — |
