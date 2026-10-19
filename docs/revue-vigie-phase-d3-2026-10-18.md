# Revue de code et de sécurité : Vigie, phase D3, la console (18 octobre 2026)

| | |
|---|---|
| Objet | PR #138 (socle de la console), #141 (écrans de lecture), #142 (actions), #143 (la Vigie dans l'admin du site). |
| Méthode | Quatre relectures indépendantes, en lecture seule sur main (`af7c47d`) : authentification et sessions (A) ; actions et droits (B) ; injection et exposition des données (C) ; justesse, robustesse, déploiement et coût (D, avec image Docker construite et démarrée, base de 450 000 événements, mesures dans le conteneur limité à 256 Mo). Chaque constat retenu a été reproduit par un script (console montée avec `test/console-env.js`, ou HTTP réel) ou une mesure. |
| Bilan | Aucun contournement des trois verrous : personne sans rôle `vigie.*`, ni personne avec un rôle trop bas, n'a pu lire ou agir au-delà de son droit ; aucune XSS, aucune injection SQL ni CSV. Une gravité haute (B1) et une moyenne remontée en haute (D7, justifiée ci-dessous) sont corrigées. Le reste est listé pour arbitrage. |

Gravité : **H** haute, **M** moyenne, **B** basse, **I** information.

## Corrigé

| Id | Gravité | Constat | Correction |
|---|---|---|---|
| D3-B1 | H | Une règle arrêtée valait « arret », le mode le plus bas : la passer ensuite en Observer était vue comme une hausse (sans motif, sans avis de surveillance réduite), et l'abaissement restait pour toujours ; un second arrêt sans motif était accepté et perdait le mode à reprendre. Commun à la console et à la ligne de commande. | Pendant un arrêt, le mode de référence est celui que la règle reprendra (`avant`, ou son mode de départ) : descendre ou prolonger l'arrêt demande un motif et émet `vigie_surveillance_reduite` ; le mode d'avant le premier arrêt est gardé. Test de non-régression dans `test/vigie-moteur.test.js`. |
| D3-D7 | M → **H** | La console, facultative, faisait tomber tout le service si elle ne pouvait pas écouter (adresse absente du conteneur, port pris) : `startVigie` rejeté, processus arrêté, redémarrage en boucle sans réception, sans moteur, sans décisions ni résumé servis au site. **Remontée en haute** : une erreur de réglage d'une option éteint la surveillance elle-même. | L'échec d'écoute de la console est rattrapé : écrit dans le journal du conteneur, événement `vigie_console_indisponible` et alerte haute (règle `console_indisponible`, mode alerter) ; réception, moteur et décisions continuent. Test dans `test/vigie-service.test.js`. |

## Arbitrage du 18 octobre 2026

Toutes les moyennes et les basses peu coûteuses sont corrigées (PR de suite), avec une précision pour D3-B2 : l'auteur d'un geste garde aussi son nom lisible (« console · Sébastien (sub) », `par_sub` dans le détail). Écart volontaire à une correction proposée : pas de `Clear-Site-Data: "cookies"` à la sortie (il effacerait les cookies de tout `nicephos.art`, donc la session de l'admin du site). Restent ouverts : D3-D12 fait (banc), D3-A7 (annexe à corriger), et les écrans « exceptions » et « destinataires des canaux » de l'annexe § 5.4, qui n'existent pas encore.

## Constats arbitrés (tous corrigés, sauf mention)

Regroupés par sujet ; les doublons entre relecteurs sont fusionnés.

### Lecteur : adresses complètes visibles (règle « /24, /48 » de l'annexe § 5.4)

| Id | Gravité | Constat | Correction proposée |
|---|---|---|---|
| D3-C1 | M | Une adresse écrite avec un suffixe court (`198.51.100.7/24`, cible naturelle d'un blocage de réseau) reste entière pour un Lecteur : vue d'ensemble, décisions, événements, fiche d'alerte. | Mettre à zéro les bits d'hôte au-delà du préfixe montré (`198.51.100.0/24`) ; stocker la cible d'un blocage sous la forme de son réseau. |
| D3-C2 | M | Notes d'alerte et motifs (décisions, interrupteurs, adresses de confiance, règles) affichés sans masque : « attaquant 192.0.2.63 » lu en entier par un Lecteur. | Une seule fonction `masquer(texte, rôle)` dans `format.js` (aujourd'hui en double), appliquée à tout texte d'opérateur. |
| D3-C3 | M | Adresse de confiance entière dans la clé de l'alerte « surveillance réduite » (`confiance:198.51.100.44`), vue par tout Lecteur. | Masquer la clé des entités `vigie` selon le rôle, ou ne pas y mettre l'adresse. |
| D3-C4 / D3-D5 | M | Réseau IPv6 mal calculé quand `::` tombe dans les trois premiers groupes (`netOf` de la Vigie, `truncateIp` du site) : `2a01::bad:5` donne `2a01::bad:5::` (adresse entière pour un Lecteur), `2606:4700::1a` donne `2606:4700:::` (clé invalide) ; le filtre et la fiche du réseau de la console (forme correcte) ne trouvent alors rien. | Une seule fonction /48 canonique (adresse développée, trois groupes), partagée par le site et la Vigie ; migration qui réécrit `ip_net` et les entités `reseau`, ou recherche des deux formes. |
| D3-C5 | B | Erreur d'un canal de notification (e-mail, numéro de téléphone) lisible par tous sur `/sante` et dans l'événement `vigie_canal_echec`. | Masquer à l'écriture de l'événement, comme l'essai de canal le fait déjà. |

### Garde-fous des actions

| Id | Gravité | Constat | Correction proposée |
|---|---|---|---|
| D3-B3 | M | La confirmation « adresse d'un administrateur » ne voit que /32, /128, /24 et /48 écrits sous une forme donnée : `/64` (taille employée par le moteur), `/28`, `/16`, `/32` IPv6 et les écritures non canoniques passent sans confirmation. | Lire les adresses des administrateurs sur 30 jours et les tester contre un `BlockList` de la cible, comme la vérification de sa propre adresse. |
| D3-B4 | M | Lever une décision (verrouillage d'urgence ou décision automatique compris) se fait sans motif et sans avertir personne. | Motif obligatoire ; `vigie_surveillance_reduite` à la levée d'un verrouillage, d'une décision automatique ou d'une décision prise par quelqu'un d'autre. |
| D3-B5 | B | Geler ou fermer les sessions de son propre compte (ou d'un compte de l'amorce) se fait sans confirmation. | `confirme=oui` exigé pour ces cibles. |
| D3-B6 | B | « Accepter la référence » sans sauvegarde lisible efface la liste des administrateurs : plus aucun blocage automatique d'adresse (ni confirmation B3) jusqu'à la prochaine sauvegarde propre. | Contrôler l'instantané d'abord, n'effacer la référence que s'il est lisible ; refuser sinon. |
| D3-B7 | B | Seuils écrits à moitié (une baisse appliquée avant le refus d'une hausse sans motif) ; minimum serveur différent de celui de l'écran (0,5). | Tout vérifier avant d'écrire, dans une transaction ; minimum 0,5. |
| D3-B8 | B | Motif obligatoire contourné par un faux numéro d'alerte (`alerte=987654`). | Vérifier que l'alerte existe. |
| D3-B9 | B | Adresses de confiance IPv6 comparées comme des chaînes : `2001:0db8::7` ne retire pas `2001:db8::7`. | Forme canonique à l'entrée ; « adresse absente » si rien n'est retiré. |
| D3-B10 | B | Ligne de commande moins stricte que la console (motif et portée facultatifs, alerte close reprise ou reclassée, aide de `confiance` incomplète). | Mêmes contrôles des deux côtés. |
| D3-B11 | B | « Vérifier la chaîne » depuis la console n'est pas attribué dans le journal. | Événement `vigie_interrupteur` avec l'auteur, comme l'essai de canal. |

### Session, Access, Zitadel

| Id | Gravité | Constat | Correction proposée |
|---|---|---|---|
| D3-A1 | M | `www.nicephos.art` et `vigie.nicephos.art` sont du même site au sens des cookies : un site compromis peut faire charger des adresses GET de la console par le navigateur d'un administrateur (`<img src=…/evenements.csv>`). Rien n'est lu (CORP), mais l'export est fait et noté au nom de l'Analyste, la session est prolongée (la fermeture après 15 min d'inactivité ne tient plus), Zitadel est appelé à chaque chargement. | Règle de provenance (Fetch Metadata) pour toute route en session : refuser `Sec-Fetch-Site` autre que `same-origin` ou `none`, sauf une navigation de document ; export exigé `same-origin` (ou en POST avec jeton) ; ne pas prolonger la session sur une requête refusée. Corriger l'annexe (MV4 annonce `SameSite=Strict`, le code met Lax, nécessaire au retour de Zitadel, et Strict ne protégerait pas d'un site frère). |
| D3-A2 / D3-D1 | M | Clés Access de plus d'une heure : chaque requête les relit, sans lecture partagée ni frein ; si la relecture échoue (incident réseau), tout le monde est refusé alors que les clés en mémoire sont bonnes. Un jeton forgé suffit à déclencher une relecture. | Relecture en tâche de fond, une seule à la fois ; clés connues gardées 24 h en cas d'échec ; refus seulement sur une clé inconnue. |
| D3-D6 | M | Zitadel lent pendant la période de grâce : chaque page relance la relecture du plafond (jusqu'à 2 × 15 s d'attente). | Noter l'heure du dernier échec, ne pas retenter avant une minute, servir le dernier plafond lu dans la limite de la grâce. |
| D3-A3 | B | Ré-authentification tenue pour fraîche si `auth_time` manque ; `max_age` n'est pas vérifié par la bibliothèque. | `maxAge: 300` à la vérification ; refuser une ré-authentification sans `auth_time` ; à la connexion, `auth_a = 0` sans lui. |
| D3-A4 | B | Jeton CSRF en caractères multi-octets : erreur 500 au lieu d'un 403 noté (DS30). | Vérifier le format du jeton avant la comparaison. |
| D3-A5 | B | Effacement des cookies `__Host-` sans `Secure` : ignoré par le navigateur (la session est fermée côté serveur, le jeton resté ne vaut rien). | `secure: true` à l'effacement ; `Clear-Site-Data: "cookies"` à la sortie. |
| D3-A6 | B | Compte supprimé chez Zitadel (404) traité comme une panne : 15 min de lecture encore (actions refusées). | 404 sur le compte : aucun plafond, sessions fermées, DS29. |
| D3-B2 | M | L'auteur d'un geste n'est connu que par son nom affiché Zitadel (modifiable par la personne, à vérifier sur l'instance) ; les événements des gestes n'ont pas le `sub`. | `sub` de l'auteur dans chaque événement d'un geste ; `par` sous la forme « console · Nom (sub) ». |

### Coût : boucle d'événements bloquée (la console partage le processus de la réception et du moteur)

| Id | Gravité | Constat | Correction proposée |
|---|---|---|---|
| D3-D2 / D3-C7 | M | `/entites` : toutes les entités des 7 jours lues, une requête par entité, tri en mémoire : 0,4 à 0,7 s bloquées pour 20 000 entités, environ 2 s pour 100 000 (balayage IPv6). | Une requête avec présélection en SQL (score décru), 50 lignes. |
| D3-D3 | M | Décisions cherchées par `motif` sans index, dans une table jamais purgée : 238 ms par vue d'ensemble pour 200 000 décisions (rafraîchie chaque minute). | Colonne `alerte_id` indexée (reprise depuis `motif`) ; conservation des décisions levées ou échues (13 mois). |
| D3-D4 | M | `/flux` (provenances, 50 000 événements relus) et export CSV : 0,5 et 0,8 s bloquées. | Provenances gardées une minute ou agrégées ; CSV lu par tranches en rendant la main. |
| D3-C6 | B | `MIN(seq), MAX(seq)` de `/sante` et du badge : lecture complète d'un index (107 ms par million de lignes). | Deux sous-requêtes (0,1 ms). |
| D3-D9 | B | « Vérifier la chaîne » sans exclusion : vérifications empilées. | Une seule à la fois, en tâche de fond. |

### Justesse et maintenance

| Id | Gravité | Constat | Correction proposée |
|---|---|---|---|
| D3-D10 | M | Lexique (détecteurs, classements, entités, modes, portées), aides de format et règles de santé recopiés de module en module, déjà différents (« sans suite », arrondis, `typo`) ; gravité et points des détecteurs recopiés dans les réglages. | Un module `console/lexique.js` ; détecteurs exportés par `detecteurs.js` ; une seule fonction de santé. |
| D3-D8 | B | « Aujourd'hui » des événements faux d'une heure les jours de changement d'heure. | Minuit de Paris par `Intl`. |
| D3-D11 | B | Code mort : page d'attente (tous les écrans existent), `sessions.setCeiling`, `rights.isSeed`, `format.role()`, classement `sans_suite` refusé par la base. | À retirer. |
| D3-D12 | B | `banc.js` n'ouvre aucune alerte : il ne mesure pas les déclencheurs de 009 (mesurés à part : +13,5 µs par lien, au plus +2 %). | Rafale sur une adresse dans le banc. |
| D3-D13 | B | Tests : `premier` de `alert_flux` comparé à une autre définition (l'ordre des numéros) ; clés Access périmées et changement d'heure non couverts ; environnement de test en analyse synchrone. | Tests à compléter. |
| D3-D14 | B | Alertes gardées 13 mois, événements 6 : une vieille fiche annonce « N événements » et n'en liste aucun. | Compter avec la jointure, ou purger les liens avec les événements ; le dire sur la fiche. |
| D3-D15 | B | Conservation affichée en dur (183 jours) sur `/sante`. | `store.retentionDays`. |
| D3-D16 | B | Minuteries de démarrage non annulées par `close()` (antérieur à D3). | Les garder et les annuler. |
| D3-D17 | B | Chemins des gabarits par `new URL(…).pathname` (espace ou accent dans le chemin d'installation). | `fileURLToPath`. |
| D3-A7 | I | (corrigé dans oidc.js ; annexe à reprendre) Annexe (MV4) : `SameSite=Strict` annoncé, Lax en vrai ; commentaire de `oidc.js` qui dit la signature du jeton d'identité vérifiée (elle ne l'est pas, ce que la norme admet sous TLS avec authentification du client). | Textes à corriger. |

## Vérifié et écarté (extraits)

Algorithmes et clés du jeton Access, en-tête dupliqué, accès direct depuis le réseau Docker, `/static/../`, state/nonce/PKCE et rejeu, fixation de session, redirection ouverte, types de contenu et méthodes, journalisation de secrets, pages d'erreur, en-têtes ; toutes les routes d'action passent par `guard()` et une liste fermée de valeurs ; ré-authentification exigée là où l'annexe le dit ; droits (soi-même, amorce, mode à une clé, « au moins un Administrateur » par construction) ; XSS sur 22 pages avec des événements piégés, SVG du flux, `console.js`, CSV ; SQL paramétré ; toutes les autres requêtes sur `events` passent par un index ; mémoire stable dans le conteneur (168 Mo au plus pour 256) ; migrations 006 à 010 rejouables (910 ms sur 450 000 événements) ; image construite et console démarrée avec la configuration de `vigie.env.example` ; tests de la console stables (trois passages).
