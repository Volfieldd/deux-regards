# Contrôle des exigences d’authentification, d’administration et de Vigie

Contrôle statique du **24 octobre 2026**, sur le commit **`994a899c8fe1ac663f90671894e5d843d847eb48`**, version **1.226.0**. Périmètre : T01, T02, T03, T07, T08, T13 et T14 du [registre des exigences](../exigences-techniques.md). Aucun code produit modifié, aucune donnée réelle, base, sauvegarde ou configuration secrète consultée. Aucun test ni navigateur lancé par ce contrôle ; leur exécution est centralisée par l’agent principal.

**Conclusion : le premier lot de correctifs techniques est intégré au code ; le programme de chiffrement et de reprise complète reste à réaliser.** Les anciens constats du diagnostic de `f44cdf3` ne décrivent plus correctement l’expiration OIDC ni les purges de sessions admin et de récapitulatifs. Les constats de stockage privé lisible restent applicables aux objets détaillés ci-dessous.

## Sens des statuts

- **Appliqué** : mécanisme présent dans le code courant examiné ; la preuve d’exécution et le déploiement sont indiqués séparément.
- **Partiel** : une partie identifiable est présente, avec des résultats attendus encore absents ou hors du périmètre de cette lecture.
- **Non appliqué** : le résultat nouveau attendu n’est pas mis en œuvre dans les chemins examinés ; une étude ou un comportement préexistant limité ne suffit pas à clôturer l’exigence.
- **Non vérifié** : la lecture ne permet pas de conclure, notamment sur les services réels, les supports et l’exécution.

| Référence | État au code | Résultat constaté et limite principale |
|---|---|---|
| T01 | **Appliqué** pour les contrats d’authentification examinés | Échéances serveur, révocation et rotations existantes préservées ; âge OIDC site désormais contrôlé localement. Parcours réels et configuration effective non vérifiés ici |
| T02 | **Partiel** | Coffre authentifié existant pour certains champs ; couverture globale, clés obligatoires, cookies chiffrés et absence de fallback clair non livrés |
| T03 | **Partiel** pour l’exigence entière | Sessions admin et récapitulatifs : correctifs appliqués. Audience hors de cette lecture ; sauvegardes et autres états gardent leurs mécanismes propres |
| T07 | **Partiel** | Récapitulatif à usage unique et purge autonome ; toast résiste au stockage refusé. Flash/toast ne disposent pas du chiffrement et du rattachement privé demandés |
| T08 | **Non appliqué** | Secours Carnets encore en localStorage lisible, sans TTL ni compte dans sa clé |
| T13 | **Partiel** | Contrats existants de chaîne, clés, contrôle NC2 et reprise présents ; adaptation au chiffrement intégral encore au stade de proposition |
| T14 | **Non appliqué** pour le programme global de nouveaux formats | Reprises limitées `enc1` existantes ; aucune migration générale `enc2`/cookies, reprise de toutes les copies et restauration du nouveau format livrées |

## Correctifs intégrés et portée exacte

### HTTPS public et HTTP derrière le tunnel

`NODE_ENV=production` exige `PUBLIC_URL`, puis refuse son protocole HTTP : [server/config.js](../../../server/config.js), lignes 62–65. Les cookies utilisent `secureCookies`, déduit du protocole de cette URL publique, ligne 161 ; la base des cookies d’authentification conserve `HttpOnly`, `SameSite=Lax` et le préfixe `__Host-` en HTTPS : [server/auth.js](../../../server/auth.js), 47–52.

**Appliqué : HTTPS de l’adresse destinée aux visiteurs.** Le listener de l’application peut rester en HTTP derrière Cloudflare Tunnel ou un proxy HTTPS : aucun certificat local n’est imposé par ce correctif. Le transport site → Vigie peut également être en HTTP sur les destinations internes admises par [server/config.js](../../../server/config.js), 115–129. Il faut donc décrire chaque liaison et son isolement, sans annoncer « HTTPS obligatoire sur tous les segments ».

**Non vérifié :** réglages Cloudflare, accessibilité directe de l’origine, confiance effective dans le proxy, TLS public et topologie réellement déployée. Une URL déclarée en HTTPS n’est pas une inspection du tunnel.

### T01 — Sessions et transactions

La connexion normale inscrit désormais `at: Date.now()` dans la transaction signée ; la vérification d’identité fait de même : [server/auth.js](../../../server/auth.js), 289–291 et 315–317. Le callback refuse date absente, non entière, future ou âgée d’au moins dix minutes avant `oidc.finish()` : 332–346. Une ancienne transaction sans date doit être recommencée. State, nonce et PKCE restent vérifiés ; le nouveau contrôle ne remplace pas la vérification du code par l’IdP.

Les sessions admin gardent leurs bornes serveur de 8 h d’inactivité et 24 h absolues : [server/sessions.js](../../../server/sessions.js), 3–5 et 40–53. Les décisions de révocation sont contrôlées au chargement ; l’ouverture remplace l’ancienne session : [server/auth.js](../../../server/auth.js), 158–181 et 409–412. Les transactions par state restent bornées à trois, 289–291.

Le visiteur conserve un bearer haché, une expiration serveur, la rotation lors de l’entrée et de la sortie : [server/visitor-sessions.js](../../../server/visitor-sessions.js), 40–75 ; [server/routes/prive.js](../../../server/routes/prive.js), 252–259 et 566–575. Les droits d’accès demeurent des contrôles distincts de la durée du cookie.

La console garde l’identité Access, 15 min d’inactivité/1 h absolue et les contrôles de provenance/CSRF : [vigie/console/server.js](../../../vigie/console/server.js), 176–210. Sa transaction a déjà une échéance serveur et un usage unique : [vigie/console/sessions.js](../../../vigie/console/sessions.js), 66–76. **Le durcissement distinct de rotation après réauthentification console reste non appliqué** : `setAuth()` actualise la date sans changer bearer ni CSRF, [vigie/console/server.js](../../../vigie/console/server.js), 295–304.

### T03 — Suppression autonome des sessions et récapitulatifs

Le SQL retire désormais les lignes expirées selon l’échéance glissante **ou** la borne absolue : [server/sessions.js](../../../server/sessions.js), 19 et 63–64. Une purge s’exécute au démarrage puis chaque heure ; le timer est annulé à l’arrêt : [server/app.js](../../../server/app.js), 274–279. La suppression physique intervient au passage suivant, avec retard possible si le processus est arrêté ou la tâche échoue. Elle n’est pas annoncée à la milliseconde de fin d’accès.

Le déclencheur existant reste en place : empreintes des sessions supprimées conservées selon les 48 h prévues, [server/securite/site.js](../../../server/securite/site.js), 114–120. La console conserve sa purge horaire des lignes de plus de 7 jours : [vigie/console/server.js](../../../vigie/console/server.js), 350–352 ; [sessions.js console](../../../vigie/console/sessions.js), 78–79.

Pour Bonjour, un timer unique suit la plus ancienne entrée et se reprogramme après dépôt ou consommation. La mémoire est vidée et le timer annulé à l’arrêt : [server/routes/public.js](../../../server/routes/public.js), 74–108. Les 15 min, le plafond de 500, l’usage unique et l’absence de disque sont conservés. Le callback est soumis au fonctionnement de la boucle d’événements ; aucun engagement de temps réel n’est déduit de cette lecture.

### T07 — Messages et robustesse des stockages

Le toast protège maintenant lecture, suppression et écriture de sessionStorage : [public/admin/admin.js](../../../public/admin/admin.js), 300–315. Le traitement courant peut continuer lorsque le stockage est refusé ; une reprise entre rechargements ne peut alors être garantie. La densité des vignettes bénéficie également de cette protection en v1 et v2 : même fichier, 1323–1342 ; [photos-v2.js](../../../public/admin/v2/photos-v2.js), 39–56.

**Résultats encore absents :** le flash reste un JSON signé lisible, 60 s, sans compte/session dans l’enveloppe, [server/routes/admin.js](../../../server/routes/admin.js), 270–289. Le toast conserve texte, annulation, erreur et date en JSON clair, avec seuil d’affichage de 15 s mais retrait lors de la prochaine lecture. La robustesse du stockage ne constitue ni chiffrement, ni isolation entre comptes, ni purge autonome. Le récapitulatif Bonjour reste un objet lisible en mémoire associé à un jeton opaque ; la conception de son éventuelle enveloppe relève de T02.

## Exigences larges non terminées

### T02 — Chiffrement authentifié de tous les états privés

Le coffre courant reste `enc1`/`NCE1`, avec AES-256-GCM conditionné à la clé. `seal()` et `sealBuf()` renvoient l’entrée sans chiffrement lorsqu’elle manque : [server/vault.js](../../../server/vault.js), 27–62. `DATA_KEY` demeure facultative, longueur minimale vérifiée seulement si présente : [server/config.js](../../../server/config.js), 87–90. Le lancement en production avertit et continue : [server/index.js](../../../server/index.js), 22–23.

Les comptes et l’audit sont toujours écrits sans coffre : [server/accounts.js](../../../server/accounts.js), 13–20 et 212–224. Les lignes de session admin contiennent identité, nom, e-mail, ID token et CSRF sans chiffrement de ces colonnes : [server/sessions.js](../../../server/sessions.js), 13–35. Les sessions et transactions console suivent le même principe pour leurs données annexes : [vigie/console/sessions.js](../../../vigie/console/sessions.js), 18–42. Le bearer haché protège son secret ; il ne chiffre pas les autres valeurs.

La chaîne Vigie est un HMAC sur les champs lisibles : [vigie/store.js](../../../vigie/store.js), 19–24 et 56–66. Le tampon écrit le corps JSON brut puis le signe au transport : [server/securite/index.js](../../../server/securite/index.js), 212–223 et 247–249. Le cache de décisions conserve le payload lisible avec sa signature : [server/securite/decisions.js](../../../server/securite/decisions.js), 88–94 et 160–165. **Intégrité et confidentialité restent distinctes.** Aucun chiffrement effectif des supports réels n’a été contrôlé.

### T08 — Secours Carnets

Le code garde `carnet-${id}-${lang}`, puis les champs et la date en JSON localStorage après échec ; la reprise ne contrôle ni compte ni échéance : [public/admin/carnet.js](../../../public/admin/carnet.js), 41–78. Le retrait reste lié à un succès, à la soumission ou au refus de reprise, 60, 78 et 96. La fonction est préservée, mais le résultat de confidentialité/isolation/expiration demandé n’est pas appliqué. Aucun nouveau parcours hors ligne ou appareil partagé n’a été exécuté ici.

### T13 — D6, NC2 et chaîne préservés ; adaptation cryptographique à faire

La configuration impose encore des clés distinctes pour transport et chaîne ainsi que les sauvegardes servant au contrôle indépendant : [vigie/config.js](../../../vigie/config.js), 24–32. Le contrôle lit directement comptes actifs, rôles, ajustements, accès et schéma de l’instantané : [vigie/controle-roles.js](../../../vigie/controle-roles.js), 75–94. La présence du tampon et du cache signé conserve la reprise en panne dans le code ; aucun exercice de panne n’a été lancé ici.

L’[étude de chiffrement](../../etudes/chiffrement-etats-cookies.md), sections 6–7, décrit les adaptations NC2 et les représentations historiques possibles ; son en-tête indique **« non appliquée »**. Elle ne fournit pas une migration livrée. Aucune distribution de DATA_KEY à la Vigie, nouvelle durée D38 ou réécriture de chaîne ne doit être déduite de l’étude. D38 reste partiellement ouverte selon le dossier légal.

### T14 — Anciennes valeurs, formats et copies

Des reprises limitées existent pour rencontres, signalements et messages : [server/encounters.js](../../../server/encounters.js), 682–705 ; [server/feedback.js](../../../server/feedback.js), 66–75 ; [server/messages.js](../../../server/messages.js), 153–158. Elles ne migrent pas tous les comptes, sessions, cookies et projections vers le nouveau format proposé et ne remplacent pas les anciennes sauvegardes.

La sauvegarde site utilise encore `VACUUM INTO` et copie directe des fichiers ; la Vigie produit aussi un instantané SQLite : [server/db/backup.js](../../../server/db/backup.js), 112–142 ; [vigie/backup.js](../../../vigie/backup.js), 7–20. Aucun manifeste chiffré/signé de restauration du nouveau format n’est produit par ces chemins. La restauration existante ferme les sessions et enregistre le retour d’instantané, [server/db/restore.js](../../../server/db/restore.js), 67–79 ; elle ne prouve pas la reprise `enc2`, la rotation ou la réapplication exhaustive des effacements antérieurs. Ces scénarios restent non vérifiés.

## Documentation examinée et vérifications à centraliser

Le document [premier lot de corrections](../../etudes/cookies-correctifs-techniques.md) correspond aux mécanismes nouvellement présents : HTTPS public, échéance OIDC, purges et robustesse. Le document [chiffrement des états](../../etudes/chiffrement-etats-cookies.md) présente une conception, avec formats, domaines de clés, migrations et arbitrages ; sa rédaction ne clôt pas T02/T08/T13/T14.

Tests ciblés présents dans le dépôt, **non exécutés par ce contrôle** : [app.test.js](../../../test/app.test.js), notamment 39–44 ; [auth.test.js](../../../test/auth.test.js), cas nouveaux à partir de 250 et 284 ; [sessions-purge.test.js](../../../test/sessions-purge.test.js) ; [bonjour-recap-purge.test.js](../../../test/bonjour-recap-purge.test.js) ; [stockages-navigateur.test.js](../../../test/stockages-navigateur.test.js). Les suites auth, privé et console complètent les contrats déjà présents. Les nombres et résultats d’exécution doivent provenir du journal central de cette nouvelle vérification ; les résultats de l’audit initial ne sont pas réattribués au commit courant.

Les vérifications centralisées ont depuis été exécutées : [résultats et journaux du suivi](../suivi-exigences.md). La lecture ne confirme ni le déploiement de `994a899`, ni le chiffrement des disques, ni les paramètres des comptes Cloudflare/Zitadel gratuits. Ces services réels, leurs cookies et leurs garanties sont à traiter dans le suivi fournisseurs, avec preuves expurgées et sans exposition de secrets.
