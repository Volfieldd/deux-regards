# Exigences transmises au stream technique

**Suivi du 24 octobre 2026 :** [état d’application T01–T15 sur 1.226.0](suivi-exigences.md), avec correctifs intégrés, preuves et résultats encore attendus. Le tableau ci-dessous reste le contrat de résultat ; son existence ne signifie pas que toutes ses lignes sont livrées.

Ces exigences proviennent des [fiches](fiches-public.md), des [fiches admin/Vigie](fiches-admin-vigie.md) et de l’[analyse d’audience](audience.md). Elles ne modifient aucun code. La ligne directrice est de conserver les fonctions et de protéger leurs états, sans assimiler tout stockage à un cache supprimable.

Les qualificatifs sont distincts : **exigence de résultat RGPD**, **critère d’exemption à démontrer**, **mesure technique proposée**, **politique de chiffrement du propriétaire**. Une proposition d’implémentation n’est pas présentée comme une prescription universelle de la CNIL.

| Référence | Fonctions concernées | Résultat attendu | Preuve de clôture proportionnée |
|---|---|---|---|
| T01 | Sessions admin, visiteur et console | Maintenir connexion, droits, sortie, révocation et onglets. Vérifier les échéances côté serveur ; ne pas confondre durée du cookie et durée d’autorisation | Cas nominal, expiré, révoqué, reconnexion et rejeu ; aucun accès prolongé par un ancien cookie |
| T02 | Tous états privés nécessaires | Politique confirmée de chiffrement authentifié en base/cookies et sur leurs copies ; clés distinctes et formats versionnés. Aucun fallback d’écriture en clair | Copie/altération de test, clé absente ou incorrecte, migration et restauration vérifiées ; jamais de test sur les données réelles |
| T03 | Purges | Faire appliquer les échéances retenues sans attendre un nouvel usage : sessions expirées, récapitulatif, états temporaires d’audience ; suivre les sauvegardes | Horloge simulée ou tâches déclenchées ; suppression réelle et maintien des preuves de révocation attendues |
| T04 | Langue, thème, densité et aperçu | Conserver mémorisation et personnalisation, avec portée compte/appareil explicite, remise à zéro et durée justifiée | Rechargement, nouvelle session, autre compte et réinitialisation ; aucun compte ne reçoit un état privé appartenant à un autre |
| T05 | J’aime durable | Conserver reconnaissance et retrait ; limiter l’état au service annoncé, avec durée et effacement. Aucun rapprochement avec visiteurs uniques | Même photo retrouvée puis retirée après rechargement ; séparation des deux mémoires navigateur/IP et comportement au-delà de leur validité |
| T06 | Retour et plein écran | Maintenir filtres, dernière photo, position, focus et continuité ; borner la mémoire au parcours utile | Parcours navigateur avec/sans script selon fonction, retour après plusieurs photos, sortie et expiration |
| T07 | Récapitulatif, flash, toast | Préserver contenu utile, affichage après redirection et « Défaire ». Chiffrer/relier l’état privé à la bonne session ; éviter les données d’URL | Usage unique, expiration, redirection/rechargement, autre compte ; contenu refusé après la fin de la fonction |
| T08 | Secours hors ligne Carnets | Conserver reprise après panne/crash. Copie locale privée chiffrée, isolée, bornée, déverrouillée pour le bon compte ; clé non laissée en clair à côté | Panne simulée, fermeture/réouverture, authentification du bon/mauvais compte, succès de reprise, expiration et effacement ; aucune promesse hors ligne non testée |
| T09 | Visiteurs uniques | Conserver l’indicateur journalier. Justifier ou minimiser IP/UA, démontrer le cloisonnement site/temps ; garder les empreintes hors des comptes/galeries/Vigie | Comparaison de métriques sur trafic fictif, collisions explicitées, redémarrage et changement de journée ; pas de baisse silencieuse du compteur |
| T10 | Restitutions d’audience | Démontrer l’anonymat, ou mettre en œuvre une restitution adaptée cohérente sur toutes les sorties | Petits effectifs et déductions entre périodes/totaux/pays/source/photo ; contrôle HTML, graphiques, infobulles et JSON. Ne pas supposer un seuil universel obligatoire |
| T11 | Opposition audience | Fournir un choix accessible si retenu pour couvrir la recommandation, mémorisé sans détournement ; vérifier avant empreinte et conserver DNT/GPC | Refus, rechargement et retour au choix ; aucune empreinte créée dans le périmètre refusé ; définir l’articulation avec les partages |
| T12 | Partages | Conserver boutons, QR et compteurs. Fixer leur périmètre d’opposition et leur conservation selon la qualification des agrégats | Aucun contenu de formulaire ni identifiant ajouté ; événements et purges cohérents avec le texte publié |
| T13 | Vigie | Préserver détections, corrélations, historique, contrôle indépendant des rôles NC2 et maintenance des protections en panne | Vérification des contrats de reprise, de la chaîne et de l’application des décisions. D6, D38, AAD/enc2 et séparation des clés explicitement traités |
| T14 | Changement de formats et anciennes copies | Traiter anciennes valeurs en clair, cookies/stockages obsolètes et copies de sauvegarde. Ne pas distribuer une clé globale par commodité | Migration idempotente, retour arrière maîtrisé, restauration sans résurrection d’effacements ; nettoyage limité aux propres états concernés |
| T15 | Textes d’information | Aligner les annonces FR/EN/DE sur le comportement réellement livré et les décisions de traitement | Tableau annonce/preuve ; aucune promesse de chiffrement, anonymat ou purge déduite d’une simple case de configuration |

## Dépendances et arbitrages

- T01, T03 et la robustesse technique peuvent avancer sans une déclaration générale d’exemption. Leur livraison ne clôt pas les points de qualification juridique.
- T02/T08 demandent une conception des clés et de la reprise. Le chiffrement d’une copie avec une clé accessible au mauvais compte ne résout pas son cloisonnement.
- T04–T08 exigent des durées justifiées et une décision sur les mémoires durablement demandées. Le dossier ne fixe pas une nouvelle durée arbitraire.
- T09–T11 doivent être étudiés ensemble. Des métriques agrégées peuvent rester, mais le maintien exact d’une granularité révélant une personne ne peut être promis avant l’analyse d’anonymat.
- Le choix d’un cookie de refus peut être exempté pour conserver ce choix ; sa finalité doit rester exclusive. Il ne sert pas de nouvel identifiant d’audience.
- Le besoin de consentement contextuel pour une fonction non exemptée doit être tranché avant son activation, sans bloquer la visite générale. Un écran de consentement ne corrige pas une faille de chiffrement ou de purge.
- L’interdiction d’un cache remplaçable n’impose pas de supprimer une session, une autorisation ou une reprise hors ligne nécessaire. Les rendus privés peuvent être recalculés ; mesurer l’effet sur réseau et calcul en maintenant les limites de concurrence.

## Ce qui n’est pas décidé par ce stream

Pas de nouvelle bibliothèque cryptographique, schéma SQL, distribution de clés, réécriture du journal Vigie, durée D38 ni suppression de fonctionnalité. Le [brief technique](../audit-cookies-2026-10/streams/technique.md) reçoit les résultats attendus et choisit les mécanismes compatibles avec les règles du dépôt et les décisions du propriétaire.

Le chiffrement est une politique de sécurité demandée. Les bases légales et les droits restent à documenter même après réussite de T02. Les tests vérifient les comportements ; les responsables arrêtent les décisions de traitement.
