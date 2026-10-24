# Chiffrement des états serveur et des cookies

**Proposition du 24 octobre 2026, non appliquée**, issue du diagnostic de la version 1.217.0 (`f44cdf3`). Le propriétaire a confirmé le chiffrement en base et dans les cookies, avec maintien des fonctionnalités. Ce choix est acquis ; restent à arrêter les formats, les migrations et les frontières de confiance. Aucun secret, changement de données réelles ou nouveau composant n’est introduit par cette étude.

## 1. Périmètre et résultat attendu

| Périmètre | Objets à protéger |
|---|---|
| Public | Champs métier déjà confiés au coffre, métadonnées personnelles corrélables, invités, sessions visiteur, états nécessaires de récapitulatif et de reprise |
| Administration | Comptes, préférences associées, sessions et ID tokens, CSRF, journaux de changements, messages après redirection, transactions OIDC/Instagram |
| Vigie | Événements, projections, dossiers, notes, habilitations et sessions console, transactions, tampons d’envoi et décisions conservées localement |
| Copies | Sauvegardes, instantanés, WAL, exports temporaires, anciens formats et copies locales de secours |

La lecture autorisée nécessite temporairement du clair en mémoire. La cible exclut les copies privées persistantes en clair et conserve les contrôles d’accès. Un identifiant ou index pseudonyme reste une donnée personnelle lorsqu’il permet un rapprochement. Chiffrer ne change ni finalité ni durée nécessaire.

## 2. Deux architectures à comparer

**Option recommandée pour revue : champs/payloads chiffrés et index dédiés.** Elle prolonge le coffre actuel, permet des clés par usage et limite les capacités confiées aux composants. Elle exige d’adapter les requêtes : égalité par index HMAC séparé, tris/recherches textuelles autorisés après déchiffrement borné ou index spécialement conçus. Les fréquences et liens d’index restent observables ; aucun index personnel ne sera qualifié d’anonyme.

**Option alternative : fichier SQLite chiffré, par exemple SQLCipher.** Elle protège globalement les pages du fichier lorsque la clé est absente, mais le processus qui ouvre la base voit l’ensemble. Elle impose de vérifier la compatibilité du pilote, des migrations, WAL, sauvegardes et lecteurs indépendants. Elle ajoute une dépendance et un travail d’exploitation ; cette étude ne les autorise pas. Elle ne protège ni cookies ni fichiers d’attente et ne résout pas seule le contrôle NC2.

Le chiffrement des supports complète ces options, avec une protection différente contre le vol d’un disque. Il ne remplace pas la séparation des clés ou la protection d’une copie de base exportée.

## 3. Formats et rattachement authentifié

Proposer une enveloppe texte `enc2:` suivie d’un encodage base64url borné contenant `v`, `kid`, `nonce`, `chiffre`, `tag`. Le binaire reçoit une magie/version distincte. AES-256-GCM conserve un nonce aléatoire de 96 bits et une étiquette de 128 bits. La politique d’usage prévient la réutilisation du nonce et borne le nombre de chiffrements sous une même clé, toutes instances et restaurations comprises. Avec cette génération aléatoire, la limite globale du NIST est de 2³² invocations par clé ; le budget opérationnel et la rotation doivent intervenir avant cette borne. Voir [NIST SP 800-38D, sections 8 et 8.3](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf).

L’AAD est une sérialisation canonique UTF-8, spécifiée et testée, de `version`, `application`, `usage`, `table`, `champ`, `identifiant_stable`, `kid`. Ces valeurs viennent du contexte attendu par le serveur, jamais des seuls attributs de l’enveloppe reçue. L’identifiant existe avant chiffrement, dans la transaction d’insertion ; le changement d’un contexte authentifié impose un nouveau chiffrement.

Un déplacement entre comptes, lignes, colonnes ou usages doit échouer. Un `kid` inconnu est refusé, sans essayer silencieusement toutes les clés. Version, algorithme, tailles et encodage sont validés avant allocation. L’AAD ne doit pas transporter des noms ou adresses en clair.

L’enveloppe cookie `c2` ajoute au contexte attendu le nom complet, l’hôte configuré et le chemin. Le contenu chiffré porte échéance, émission et référence de transaction/session utiles. Secure, HttpOnly pour les cookies réservés au serveur, SameSite et les règles `__Host-` restent nécessaires ; taille encodée bornée et erreurs lisibles sont vérifiées. La durée est contrôlée au serveur, pas seulement par Max-Age. Les attributs et les contraintes du préfixe sont décrits par [MDN, Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Le cookie de session contient toujours un bearer aléatoire. **La base conserve son empreinte, jamais sa valeur réversible.** Le chiffrement du cookie ne supprime pas le risque de rejeu : existence de session, révocation, rotation et unicité des transactions continuent à faire foi.

Les états exploités par JavaScript (toast, préférences, brouillons, secours hors ligne et cookies front) ont un contrat distinct : pas de passage silencieux à HttpOnly. Un état opaque peut être chiffré et déchiffré par le serveur, avec une représentation temporaire en mémoire pour les interactions. Aucun secret de déchiffrement durable n’est placé à côté du contenu dans le navigateur. Une clé limitée peut rester en mémoire pendant la session ; cela permet le travail hors ligne déjà ouvert, sans promettre sa reprise après fermeture. La reprise totalement hors ligne après redémarrage demande une capacité de déverrouillage indépendante, à choisir avec le propriétaire ; à défaut, la restauration attend le réseau. Vérifier édition, rechargement, reconnexion, changement de compte et refus de stockage. Aucune fonction ne sera supprimée pour contourner ce choix.

## 4. Séparation des clés

Prévoir des domaines de clés indépendants : données privées du site, cookies du site, confidentialité Vigie, cookies console, sauvegardes/restauration. À l’intérieur d’un domaine, HKDF peut séparer usages et index avec des contextes versionnés. Le `kid` identifie une version autorisée, sans contenir de secret.

Maintenir séparément les clés existantes de transport, chaîne du journal et signature Ed25519 des décisions. D6 interdit de dériver la clé de chaîne de COOKIE_SECRET ; le site ne doit pas obtenir la capacité de refaire le journal Vigie. La clé de confidentialité du site n’est pas distribuée à la Vigie. Les droits fichiers et montages restent restrictifs.

Un témoin authentifié lie chaque domaine persistant à sa clé et à la version attendue. En production, le démarrage refuse un domaine obligatoire absent ou incompatible. Avant toute écriture privée : vérifier configuration, témoin, clés de lecture anciennes requises et compatibilité du schéma. Échec : arrêt explicite des écritures concernées, sans retour au clair ni remplacement des données par un avertissement enregistré.

## 5. Migration et rotation

1. Ajouter une migration numérotée et des marqueurs de format ; ne modifier aucune migration fusionnée. Distinguer une ancienne valeur de base d’une saisie utilisateur ressemblant à `enc1:` ou `enc2:`.
2. Livrer une lecture des formats autorisés, avec écritures nouvelles exclusivement `enc2`. Le double accès aux formats est transitoire et observable, pas une permission permanente d’écrire en clair.
3. Reprendre les données par lots transactionnels, avec progression reprenable, contrôles d’effectifs et aucune valeur dans les logs. Inclure anciens libellés d’invités, comptes/sessions, projections et copies ; ne pas supposer que `sealExisting()` couvre tout.
4. Vérifier les données et fonctions avant de fermer la lecture des anciens formats. Traiter WAL, anciens instantanés et exports par une procédure de reprise/effacement documentée.

Une rotation écrit avec le nouveau `kid`, garde temporairement les clés de lecture utiles, puis rechiffre par lots. Leur retrait suit l’inventaire des sauvegardes encore restaurables. Les cookies anciens disposent d’une fenêtre bornée ou d’une reconnexion annoncée ; aucun nouvel état métier n’est perdu. La migration ne prolonge pas les durées de conservation.

## 6. Préserver le contrôle indépendant NC2

Aujourd’hui, la Vigie ouvre l’instantané et compare comptes actifs, rôles, ajustements, photographe, accès ouverts et empreintes des déclencheurs aux déclarations du site et à l’instantané précédent. **Une auto-attestation signée par le site ne remplace pas ce contrôle : un site compromis pourrait aussi la fabriquer.**

Proposition minimale : le service de sauvegarde indépendant lit un instantané cohérent, déchiffre seulement un compartiment de contrôle aux capacités limitées, puis produit une projection minimale. Elle exclut noms, e-mails et ID tokens, mais conserve les références nécessaires aux comparaisons. Elle est chiffrée pour son destinataire et signée par une clé inaccessible au conteneur du site.

La preuve lie projection, version, date, empreinte de l’instantané et prédécesseur. La Vigie vérifie provenance, fraîcheur et continuité ; absence, incohérence ou rejet ne deviennent jamais « aucun écart ». Le lecteur indépendant inspecte lui-même schéma et états : il ne signe pas un export fourni par l’application.

Alternative : donner à la Vigie une capacité de lecture du seul compartiment de contrôle dans l’instantané. Son périmètre et ses clés exigent un arbitrage explicite. Dans les deux cas, aucun accès à DATA_KEY générale ; le contrôle doit encore détecter une modification de rôle hors application.

## 7. Conserver la chaîne historique Vigie

Ne pas recalculer les anciens HMAC ni modifier leurs ancres. Une voie à instruire est l’encapsulation chiffrée des octets canoniques historiques, avec conservation de leurs séquences, maillons et ancres d’origine. Le vérificateur déchiffre la représentation exacte avant l’ancienne vérification ; les projections de recherche restent séparées et protégées. Transformer le stockage physique ne doit pas réinventer l’événement.

Une autre voie est un segment nouveau de format versionné, relié explicitement à la tête historique vérifiée ; l’ancien segment devient une archive chiffrée encore consultable et vérifiable. La continuité des requêtes, les preuves externes de tête, les purges et ancres doivent fonctionner à travers les segments. MV18/MV23 décrivent l’objectif antérieur : ce changement de confidentialité demande une décision d’architecture, pas une réécriture silencieuse.

## 8. Sauvegardes et retour arrière

Créer un instantané cohérent puis une enveloppe chiffrée pour la clé de restauration conservée à part. Un manifeste signé par le producteur indépendant lie versions, identifiants, date, liste et empreintes des fichiers, ainsi que prédécesseur. Le manifeste et ses noms révélateurs sont eux-mêmes protégés. Conserver la signature Ed25519 des décisions à l’intérieur de leur enveloppe locale ; authentifier aussi les métadonnées du tampon avant réémission.

Un chiffrement valide n’empêche pas de rejouer un ancien fichier entier : vérifier aussi fraîcheur, progression et référence externe attendue. Une restauration ancienne est un geste autorisé distinct, avec réapplication des effacements et décisions nécessaires.

Le retour arrière exige soit une version précédente capable de lire `enc2`, soit une restauration contrôlée avec les bonnes clés et prise en compte des écritures intervenues depuis. Pas de déchiffrement général en place pour faciliter un recul. Exercer cette procédure avant le déploiement.

## 9. Vérifications et décisions restantes

Tester nominal, clé absente/incorrecte, altération, `kid` inconnu, déplacement de champ/ligne/usage, transaction et fichier rejoués, rotation interrompue, ancienne sauvegarde, restauration et purge. Vérifier les cookies au navigateur, brouillons isolés par compte, préférences, J’aime, visiteurs uniques, exports et révocations. Mesurer requêtes et volumes ; pour le moteur/dossiers Vigie, appliquer le banc avant/après existant.

Les arbitrages portent sur **NC2**, la représentation historique, les index nécessaires et le déverrouillage de la reprise entièrement hors ligne, pas sur l’opportunité de chiffrer. Le stream CNIL fournit finalités, durées justifiées et choix contextuels éventuels ; il ne bloque pas les premiers correctifs HTTPS, échéances et purges aux durées existantes. D38 reste ouvert selon son périmètre : aucune durée nouvelle n’est décidée ici.

Références de code : [coffre](../../server/vault.js), [contrôle des rôles](../../vigie/controle-roles.js), [chaîne Vigie](../../vigie/store.js), [sauvegarde site](../../server/db/backup.js), [sauvegarde Vigie](../../vigie/backup.js). Décisions : [D6](journalisation-securite.md), [MV18/MV23](annexe-vigie-architecture.md), [D38](vigie-dossiers.md), [AAD/enc2](../../PLAN.md).
