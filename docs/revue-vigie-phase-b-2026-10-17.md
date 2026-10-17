# Revue de code et de sécurité : Vigie, phase B (17 octobre 2026)

| | |
|---|---|
| Objet | Commit `3bd05ac` (PR #103) : conteneur de la Vigie, décisions signées appliquées par le site. |
| Méthode | Deux relectures indépendantes (sécurité ; justesse du code), plus une relecture directe. Chaque constat retenu a été reproduit (script, test, conteneur lancé sous l'utilisateur 99) ou lu dans le code. |
| Décision | Gravité haute corrigée, ainsi que les points peu coûteux ou liés à une obligation (rétention) ; tests de non-régression « revue B » dans `test/vigie-service.test.js`. Le reste est noté ci-dessous. |

Gravité : **H** haute, **M** moyenne, **B** basse, **I** information. « Remontée » : classée plus bas par une relecture, remontée parce qu'elle contredit une promesse de sécurité de la Vigie.

## Corrigé

| Id | Gravité | Constat | Correction |
|---|---|---|---|
| B1 | H | Verrouillage de l'admin et blocages de portée « admin » ou « connexion » contournés par une adresse encodée : `/%61dmin` (page de l'admin servie pendant un verrouillage), `/%61uth/local` (connexion depuis une adresse bloquée). Les sessions ouvertes avant un verrouillage restaient valides. | Décision prise sur le gabarit de la route (ou le chemin décodé et normalisé), jamais sur l'adresse brute ; un verrouillage ferme les sessions des comptes non autorisés, sur toute route ; `/healthz` jamais bloqué. |
| B2 | H | Ligne de commande de secours inutilisable dans le conteneur déployé (utilisateur 99 sans nom : `os.userInfo()` échoue) : impossible de lever une mauvaise décision. | Nom de l'utilisateur lu sans jamais échouer ; essayé dans le conteneur sous l'utilisateur 99 (bloquer, lever, vérifier). |
| B3 | H (remontée) | Qui écrit dans la base de la Vigie sans `VIGIE_LOG_KEY` pouvait : effacer le début du journal et recopier l'ancre (vérification « intacte ») ; effacer la fin et remettre le compteur en arrière ; insérer une décision que la Vigie signait ensuite pour le site. | Ancre signée (HMAC, date de la dernière ligne purgée, purge impossible avant la durée de conservation) ; chaque purge est un événement chaîné ; tête de la chaîne signée, gardée et écrite chaque nuit dans le journal du conteneur (hors de la base) ; chaque décision signée (HMAC, migration 002) : une décision écrite ou modifiée à la main n'est jamais envoyée au site et elle est signalée. |
| B4 | H (remontée) | « Jamais tout le monde » contournable : `::ffff:0:0/96` ou `::/32` bloquaient tout l'IPv4 ; 224 entrées `/8` couvraient tout l'IPv4 ; une empreinte de session vide fermait toutes les sessions ; la boucle locale bloquable (vérification de santé en échec). | Refusé des deux côtés : plages IPv6 qui recouvrent l'IPv4 (IPv4 dans IPv6, NAT64, 6to4), boucle locale, plus de l'équivalent d'un /8 au total, empreinte de session de moins de 12 caractères ; `ADMIN_SUBS` jamais gelé ni tenu dehors par un verrouillage. |
| B5 | H (remontée) | Un demi-caractère UTF-16 dans un événement (site compromis, réponse de Zitadel) cassait la vérification de la chaîne pour toujours, et la première rupture cachait toutes les suivantes. | Valeurs normalisées au type de leur colonne avant le calcul (texte bien formé, nombres) ; la vérification continue après une rupture et les liste toutes (20 au plus). |
| B6 | M | Purge à 6 mois et vérification nocturne seulement après 24 h sans redémarrage (rétention CNIL non tenue en pratique). | Tâche quotidienne programmée depuis sa dernière exécution enregistrée, première une minute après le démarrage ; vérification avant la purge. |
| B7 | M | Horloge de la Vigie revenue en arrière : toute nouvelle liste refusée, même après redémarrage du site ; liste datée dans le futur : canal bloqué. | Liste acceptée si elle est fraîche à l'horloge du site (5 min) ; liste datée de plus de 5 min dans le futur ou au numéro invalide, refusée. |
| B8 | M | Zitadel injoignable plus de 20 h : une alerte « haut » à chaque essai (1 440 par jour). | Trou signalé une fois. |
| B9 | B | Exceptions non rattrapées (tâches périodiques, erreur de base dans la lecture de Zitadel) : arrêt de la Vigie ; lecture de Zitadel relancée après l'arrêt ; arrêt du service jusqu'à 25 s (au-delà des 10 s de Docker). | Tâches protégées ; transactions immédiates ; arrêt de la lecture effectif ; attentes longues libérées à l'arrêt. |
| B10 | B | Valeur mal typée dans un lot signé (tableau au lieu d'un texte) : erreur 500, lot renvoyé sans fin. | Types vérifiés champ par champ ; l'événement fautif est écarté, le reste gardé. |
| B11 | B | Deux décisions sur la même cible : la dernière l'emportait (un gel de 30 jours levé au bout d'une heure, Vigie arrêtée). | La plus longue l'emporte. |
| B12 | B | Réception joignable depuis le réseau du tunnel et des autres conteneurs ; les envois du site passaient par ce réseau partagé. | Réception liée à une adresse fixe du réseau interne `nicephos-vigie-ingest`, nom `vigie-reception` sur ce réseau seul (`VIGIE_URL=http://vigie-reception:4100`) ; vérifié dans un conteneur : rien n'écoute ailleurs. |
| B13 | B | Réponses lues en entier avant le contrôle de taille (liste de décisions, Zitadel, réponse aux lots) : une Vigie malveillante pouvait remplir la mémoire du site. | Lecture par morceaux, abandonnée au-delà de la limite ; corps de la réponse aux lots jamais lu. |
| B14 | B | Zitadel : curseur illisible ou futur bloquant la lecture pour toujours ; type `constructor` relu sans fin ; page de 500 événements à la même milliseconde ; jeton refusé gardé. | Curseur contrôlé et ramené au présent ; types lus par `Object.hasOwn` ; avance garantie ; jeton redemandé après un 401. |
| B15 | B | `vigie.env` (clé privée des décisions) ni dans `.gitignore` ni dans `.dockerignore` : risque de le publier dans le dépôt public. | Ignoré par Git et Docker, comme les clés JSON de Zitadel. |
| B16 | B | Règle « `http` seulement en interne » contournable par un nom (`10.evil.com`, `192.168.0.1.nip.io`, `evil.lan`). | Seulement une adresse privée écrite telle quelle, ou un nom de service sans point. |
| B17 | I | Retrait de la Vigie : la liste de décisions (adresses, comptes) restait sur le disque du site. | Effacée au retrait. |
| B18 | I | Interrupteur éteint sans durée : éteint pour toujours. | Toujours pour une durée, 7 jours au plus. |
| B19 | I | `VIGIE_LOG_KEY` pouvait être égale à `VIGIE_INGEST_KEY` (le site aurait pu refaire la chaîne). | Refusé au démarrage. |
| B20 | I | Sauvegarde : premier essai en échec (base pas encore créée), suivant 24 h plus tard. | Nouvel essai une heure après un échec. |
| B21 | I | Avertissement de Fastify à chaque démarrage (`disableRequestLogging`). | Journal par requête coupé route par route. |

## Noté, à arbitrer

| Id | Gravité | Constat | Proposition |
|---|---|---|---|
| NB1 | M | Restaurer une ancienne sauvegarde de la Vigie est un retour en arrière silencieux pour la chaîne ; la tête publiée dans le journal du conteneur permet de le voir, mais à la main. | Phase D : envoyer la tête de la chaîne chaque nuit sur un canal extérieur (e-mail, Signal), et la console compare. |
| NB2 | B | Le conteneur de sauvegarde monte les données en écriture (nécessaire pour lire une base en WAL) : compromis, il pourrait modifier la base. | Accepté : sans réseau ni secret ; ses modifications seraient vues par la chaîne et les signatures. |
| NB3 | B | `VIGIE_DECISIONS_PUBKEY` est obligatoire avec `VIGIE_URL` : une installation de la phase A (aucune à ce jour) refuserait de démarrer après la mise à jour. | Accepté (aucune installation concernée) ; le guide le dit. |
| NB4 | B | Le dossier `vigie-secrets` doit exister même sans Zitadel (montage obligatoire). | Accepté : le guide le fait créer ; ou rendre le montage facultatif. |
| NB5 | I | Vérification nocturne de la chaîne synchrone : quelques secondes de pause de la Vigie (jamais du site) sur 6 mois d'événements. | À mesurer ; découper si besoin. |
| NB6 | I | Plus de 100 attentes longues simultanées : avertissement de Node (seulement avec la clé). | Sans effet. |
| NB7 | I | Le motif d'une décision est affiché tel quel dans le terminal. | Phase D : échappé dans la console. |
