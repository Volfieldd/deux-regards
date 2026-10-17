# Revue de code et de sécurité : Vigie, phase A (17 octobre 2026)

| | |
|---|---|
| Objet | Commit `6fabfe2` (PR #100) : émission des événements de sécurité par le site vers la Vigie. |
| Méthode | Deux relectures indépendantes (sécurité ; justesse du code), plus une relecture directe. Chaque constat retenu a été reproduit (script ou test) ou lu dans le code. |
| Décision | La gravité haute est corrigée dans la PR de cette revue (migration 049, tests de non-régression dans `test/vigie-emission.test.js`, section « revue »). Le reste est noté ci-dessous, à arbitrer. |

Gravité : **H** haute, **M** moyenne, **B** basse, **I** information. « Remontée » : classée plus bas par une relecture, remontée parce qu'elle neutralise la détection phare (DS8) ou contredit le RGPD.

## Corrigé

| Id | Gravité | Constat | Correction |
|---|---|---|---|
| A1 | H | Tampon : un fichier par seconde de panne, dossier relu et chaque fichier mesuré à chaque passage ; avec 60 000 à 100 000 fichiers, 0,5 à 1,7 s de blocage du site par seconde. Un message d'avertissement par seconde. | Segments de 1 Mo en ajout, liste tenue en mémoire (dossier lu au démarrage seulement), attente doublée entre deux essais (5 min au plus), pendant l'attente la file va sur le disque sans réseau, un seul message au passage en panne et au retour. Test « tampon en panne prolongée » : 3 000 s de panne → au plus 3 fichiers, moins de 40 essais. |
| A2 | H | Un lot refusé par la Vigie (4xx : type inconnu, lot trop gros) bloquait la file d'attente pour toujours. | Refus (4xx sauf 408 et 429) : lot écarté, compté dans `sys_events_dropped`. Lots bornés à 256 ko. |
| A3 | H | `stop()` perdait la file quand la Vigie était injoignable (1 000 en file → 800 perdus). | À l'arrêt : un dernier envoi si la Vigie répond, le reste part sur le disque ; tampon relu au démarrage suivant. |
| A4 | H | Budget par adresse commun à tous les types : 60 requêtes sur `/.env` faisaient taire ensuite la connexion, les lectures et les exports du même réseau ; synthèse tardive ou jamais envoyée. | Budget par réseau **et** par type ; jamais pour un événement d'un compte connecté, de connexion, de session, de données sensibles, de comptes, du système ; ligne `malicious_excess_events` dès le premier événement retenu, puis le compte à la fin de l'heure (balayage chaque minute, synthèse avant éviction). |
| A5 | H (remontée) | Faux ticket : qui écrit dans la base ouvrait un ticket avant de se donner le rôle admin, le changement passait pour un changement de l'application. | Tickets signés (HMAC, clé dérivée de `COOKIE_SECRET`, hors de la base) ; ticket sans signature valide → critique, `ticket_falsifie` ; ticket resté ouvert signalé dans l'état. |
| A6 | H (remontée) | Changement de `sub` non vu : prendre l'identité d'un administrateur sans aucune trace ; e-mail et adresse de notification non surveillés. | Déclencheur étendu : `sub` (ancien gardé), e-mail, adresse de notification, décision d'un administrateur ; colonne `champs` ; l'application ouvre un ticket pour l'e-mail changé à la connexion et pour le choix des e-mails. Aucune adresse n'est envoyée, seulement le nom du champ. |
| A7 | H (remontée) | Traces effaçables : lignes du journal modifiables ou supprimables, déclencheur vidé sous le même nom invisible. | Journal en ajout seul (ni modification, ni effacement avant 13 mois, pour le journal comme pour les tickets) ; texte de chaque déclencheur comparé à celui d'origine (`declencheurs_modifies`) ; l'état est envoyé aussi après chaque changement de compte. |
| A8 | H (remontée) | Numéros du journal réutilisés après la purge à 13 mois : les changements suivants (critiques compris) étaient sautés. | La purge garde toujours la dernière ligne ; curseur remis à zéro si les numéros reculent (base restaurée, journal vidé). |
| A9 | H (remontée) | Données personnelles dans les extraits : un message `/bonjour` (nom, adresse) partait en clair vers la Vigie et le tampon, alors qu'il est chiffré en base. | Pour un formulaire : seulement la famille, le champ et la longueur ; extrait gardé pour le chemin, l'adresse et le navigateur. Champs secrets (`_csrf`, `token`, `code`, `state`…) jamais examinés. |

Corrigé aussi, parce que peu coûteux ou parce que cela changeait le comportement du site (interdit pour un composant facultatif) :

| Id | Gravité | Constat | Correction |
|---|---|---|---|
| A10 | B | Pièges en routes : `POST /xmlrpc.php` en `text/xml` répondait 415 (et rien n'était signalé) ; le leurre `/auth/local` consommait la limite de connexion de l'adresse. | Pièges et leurre reconnus au chemin dans un crochet : la requête suit son cours, même 404 que le site, aucune limite consommée. |
| A11 | M | Une erreur au démarrage de la Vigie (compte au rôle mal formé, `package.json` illisible) empêchait le site de démarrer ; curseur sauvé par paquet de 500 (rejeu en boucle après une erreur). | Chaque étape du démarrage protégée ; rôles mal formés lus comme vides ; curseur sauvé à chaque ligne. |
| A12 | B | Retirer puis remettre la Vigie effaçait ses repères : changements de configuration et de comptes faits entre-temps jamais signalés ; une ancienne restauration ressignalée. | Repères (sans donnée personnelle) gardés au retrait ; à la première mise en route, une restauration passée sert de point de départ. |
| A13 | B | Adresse complète gardée dans la session (`ctx_ip`) sans usage, et donc dans les sauvegardes. | Plus gardée : réseau, pays et navigateur suffisent. |
| A14 | B | Pas d'identifiant d'événement (doublons impossibles à écarter après un renvoi) ; marque « retard » hors de la signature. | Identifiant unique par événement ; `retard` dans le corps signé. |
| A15 | B | Formulaires énormes : chaque champ examiné (+150 à 220 ms pour 110 000 champs). | 200 champs et 16 ko examinés au plus par requête. |
| A16 | I | Caractères de direction du texte (U+202A–U+202E, U+2066–U+2069) non neutralisés ; demi-caractère possible en fin d'extrait. | Neutralisés ; extrait coupé proprement. |
| A17 | I | Empreinte de `DATA_KEY` : SHA-256 tronqué sans clé. | HMAC avec une clé dérivée de `COOKIE_SECRET`. |
| A18 | B | Faux positifs : refus ordinaires à l'import (16 bits, format non pris en charge) et pannes internes signalés comme fichiers piégés ; cookie rejoué signalé à chaque requête. | Seuls les refus de fichiers douteux sont signalés, sans message interne ; un cookie rejoué une fois par session et par réseau. |
| A19 | M | Session écrite directement dans la base : aucun contexte, donc aucun contrôle, et aucun `session_created`. | Session sans contexte créée après le démarrage : signalée « haut ». |
| A20 | I | Date de la page Confidentialité : la plus ancienne des deux pouvait s'afficher. | La plus récente des deux. |

## Noté, à arbitrer

| Id | Gravité | Constat | Proposition |
|---|---|---|---|
| N1 | B | Vol de cookie peu détecté si l'attaquant copie la famille de navigateur ou est sur le même réseau ; changement de réseau seul en « info ». | Empreinte plus fine (navigateur complet, `Accept-Language`) ; « moyen » quand le pays ou l'opérateur change (l'opérateur demanderait l'ASN, absent de l'offre gratuite de Cloudflare). |
| N2 | B | `VIGIE_URL` accepte `http://` : sur un réseau partagé, adresses complètes et `sub` lisibles. | Réseau Docker interne obligatoire (prévu en phase B) ; ou exiger HTTPS hors réseau privé. |
| N3 | I | Textes d'attaquants (navigateur, ville de Cloudflare, provenance, erreurs de l'IdP) arrivent tels quels dans la future console. | Console : échappement strict, CSP sans `unsafe-inline` (prévu, phase D). |
| N4 | I | Avec `TRUST_PROXY` par défaut ou en nombre de proxys, un poste du réseau local peut fausser adresse, pays et ville (même exposition que la limite de connexion aujourd'hui). | Sur Unraid, `TRUST_PROXY` = adresse du tunnel : sans effet. |
| N5 | I | La page Confidentialité dit « une visite ordinaire n'y laisse rien » ; un lien de photo offerte mal tapé ou une page aux images cassées (rafale de 404) laisse une trace. | Nuancer la phrase (« une visite ordinaire n'y laisse en général rien »), ou relever le seuil des 404. |
| N6 | B | Une restauration remplit `sessions_revoked` (la base restaurée garde le déclencheur) : faux « cookie rejoué » à la reconnexion. | `restore.js` vide `sessions_revoked` après avoir fermé les sessions. |
| N7 | B | Faux positifs `authz_fail` « hors portée » pour un photographe ou une personne qui n'existe pas (rôle à portée). | Distinguer « introuvable » de « hors portée » dans le crochet de portée. |
| N8 | I | Saisie de « \`…\` » ou « ${…} » dans un texte de l'admin : `malicious_input` « haut ». | À observer pendant le mois d'observation ; abaisser pour les champs de texte libre si cela gêne. |
| N9 | I | Suppression de la table `accounts_removed` (« pierre tombale ») non surveillée. | Sans effet seul : un compte qui revient est créé par l'application, avec ticket (événement `user_created`, « haut » s'il est administrateur). |
| N10 | I | Un attaquant maître du processus du site (clé de ticket comprise) ou qui supprime puis recrée les déclencheurs entre deux contrôles reste hors de portée du site seul. | Contrôle indépendant sur les sauvegardes par la Vigie (phase B, annexe 4.4). |
