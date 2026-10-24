# Prestataires et configuration réelle à qualifier

État du 24 octobre 2026, complété après la réponse du propriétaire : **Cloudflare en offre gratuite et Zitadel en offre gratuite**. Ces deux informations sont acquises ; elles ne prouvent ni les fonctions activées, ni le lieu d’hébergement, ni les cookies réellement reçus. Aucune donnée de production consultée.

**La gratuité ne signifie ni absence de DPA, ni suivi publicitaire, ni obligation de payer pour être conforme.** Les contrats publiés couvrent des usages gratuits ; leur application au compte et aux services concernés doit être rattachée aux pièces réelles. Le maintien des fonctions reste la cible. Aucun réglage de fournisseur n’a été modifié.

## 1. Fiches des services

| Référence | Service et périmètre | Preuve disponible | Élément manquant pour conclure |
|---|---|---|---|
| F01 | Cloudflare sur le site public : acheminement, pays ; protections ou outils additionnels possibles | [privacy.js](../../server/privacy.js), [stats.js](../../server/stats.js), 40–44 ; documentation de déploiement | Fonctions actives : challenges, Turnstile, Bot Fight Mode, Web Analytics/Zaraz ou autres ; cookies effectivement reçus et usages propres du fournisseur |
| F02 | Cloudflare Access pour console Vigie, éventuellement administration | Console conçue pour un jeton Access vérifié ; [server.js](../../vigie/console/server.js), 107–118 | Domaines et applications réellement protégés, cookies et attributs, durées de session, options de liaison et fonctions connexes |
| F03 | Zitadel : connexion admin/console et événements de sécurité | OIDC dans [oidc.js](../../server/oidc.js), console et [fiche RGPD Vigie](../wiki/RGPD-Vigie.md) | Instance, domaines, cookies d’IdP, MFA, durées, entité contractante, localisation et sous-traitants ; aucun secret client à transmettre |
| F04 | Meta/Instagram : connexion de l’équipe et publication serveur | [routes/admin.js](../../server/routes/admin.js), 772–794 ; absence de SDK social identifié sur les pages publiques | Parcours OAuth réel, cookies de Meta sur ses origines, données/conditions effectivement applicables au service choisi |
| F05 | Hébergement, sauvegardes, notifications | Registres existants et code de sauvegarde | Prestataires/destinations réellement utilisés, personnes habilitées, contrats, garanties de transfert et durées des copies |

Les noms `__cf_bm`, `cf_clearance`, `CF_Authorization` ou autres ne sont pas déclarés « présents » sur la production. La [documentation Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/) donne des exemples dépendant des services activés. Un cookie fourni par un prestataire peut être posé sur le domaine du site ; il faut qualifier sa finalité plutôt que son seul domaine.

## 2. Ce que permettent de conclure les offres gratuites

### Cloudflare : contrat et fonctions sont deux questions distinctes

Le [contrat self-service](https://www.cloudflare.com/terms/), §§ 2.6 et 6.1, traite les services gratuits et incorpore le DPA lorsque le contenu comprend les données personnelles visées. Le [DPA publié, version 6.4 du 3 avril 2026](https://www.cloudflare.com/cloudflare-customer-dpa/), encadre le traitement pour le compte du client. Il faut conserver la version applicable au compte et distinguer ce périmètre des données de réseau et usages décrits par le contrat. Une signature manuscrite ou un abonnement payant ne sont pas présentés comme préalables universels par ces textes.

Les clauses de transfert et la [liste des sous-traitants](https://www.cloudflare.com/gdpr/subprocessors/) ne prouvent pas une résidence exclusivement européenne. Vérifier services, entité contractante et garanties couvrant les flux réellement utilisés ; ne pas transformer une référence au Data Privacy Framework ou aux clauses contractuelles types en validation automatique du dossier.

| Fonction ou réglage à relever | Fait documenté et conséquence pour Nicephos |
|---|---|
| Bot Fight Mode | Produit gratuit, activable/désactivable ; il peut imposer des calculs au navigateur. Il porte sur le domaine et ses exceptions ne se règlent pas comme des règles WAF ordinaires. Relever l’état et les parcours touchés ; ne pas déduire son activation du tier. [Documentation](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) |
| Règles/challenges de sécurité | Relever les règles effectivement actives, les challenges et éventuels widgets séparés. Les noms de cookies documentés en R12 ne prouvent pas leur présence. Une finalité anti-abus demande une qualification propre ; ne pas désactiver une protection avant d’avoir étudié son remplacement |
| Web Analytics / Observatory / RUM | La documentation actuelle annonce RUM automatiquement activé pour Free avec trafic EU exclu, et désactivable. **Vérifier ce réglage en priorité**, y compris l’injection : l’absence de script dans le dépôt ne tranche pas. L’exclusion dépend des centres Cloudflare concernés, pas d’une preuve de nationalité ou de conformité générale ; le traitement peut se produire dans une autre région. [Documentation](https://developers.cloudflare.com/speed/observatory/rum-beacon/) |
| Zaraz ou autres outils additionnels | Relever « utilisé / non utilisé / inconnu » et les destinations configurées. Aucun de ces états n’est établi par le fait que le compte est gratuit |
| Access | Une [offre gratuite Access](https://www.cloudflare.com/sase/products/access/) existe. Cela ne prouve pas que l’admin ou la console y sont effectivement protégés. Relever applications, périmètres et durée de session |
| Cookies Access | Les [options documentées](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/) incluent HttpOnly, SameSite et liaison de cookie. Relever la configuration effective et les compatibilités avant modification ; imposer Strict partout peut casser la connexion. Le document ne décide aucune nouvelle durée |

Les statistiques réseau disponibles chez Cloudflare et le beacon navigateur RUM sont des mécanismes différents. La présence d’un tableau de bord d’analytique ne suffit pas à prouver une écriture sur le terminal. Inversement, « sans cookie » ne clôt pas à lui seul l’examen des opérations et traitements du service.

### Zitadel : confirmer d’abord Cloud ou auto-hébergement

La réponse « offre gratuite » ne distingue pas encore une instance Cloud Free d’un logiciel auto-hébergé sans abonnement. La [description officielle](https://zitadel.com/docs/legal/service-description/cloud-service-description) distingue service géré et exploitation sur son infrastructure ; dans le second cas, hébergement, sauvegardes et services associés sont à qualifier séparément. La disponibilité d’un logiciel ne signifie pas, à elle seule, que l’éditeur reçoit les identités de cette installation.

Pour Cloud, les [TOS publiées](https://zitadel.com/docs/legal/terms-of-service), état du 15 novembre 2023, créent la relation à l’inscription et incluent le DPA parmi les annexes ; elles évoquent aussi les plans gratuits. Le [DPA, état du 8 mai 2025](https://zitadel.com/docs/legal/data-processing-agreement), s’applique dans la mesure où Zitadel traite les données comme sous-traitant et devient obligatoire avec le contrat. Ce texte comprend des dispositions d’optimisation du service et de transfert à analyser selon les données et usages concernés ; ne pas lui attribuer un usage exclusivement d’authentification par simple présomption.

L’[aide officielle du 25 juin 2026](https://help.zitadel.com/corporate-structure-contracting-entities) désigne **CAOS AG, Suisse**, pour les clients Cloud self-service. C’est une indication contractuelle à vérifier pour le compte, pas la preuve d’une région de données suisse. La version applicable, l’entité et les [sous-traitants effectifs](https://zitadel.com/docs/legal/subprocessors) restent à documenter.

Le [Customer Portal, état du 7 mai 2026](https://help.zitadel.com/customer-portal-instances) affiche la région de l’instance et présente le choix d’une région spécifique comme une fonction Pro. Une description générale plus ancienne annonce un choix de localisation à la création : ne pas en déduire que ce choix est disponible sur ce compte Free. **Relever la région réellement affichée suffit pour commencer ; aucune migration ni dépense n’est décidée.** Une région principale ne garantit pas, seule, que transit, assistance et sous-traitance restent intégralement dans cette région.

Pour l’authentification, relever MFA/passkeys, durées et renouvellement, domaines de connexion, cookies d’IdP et données de profil transmises. Ces réglages ne se déduisent pas du tier. Il n’est pas demandé d’exporter les utilisateurs, leurs événements ou les secrets du client OIDC.

## 3. Observations à recueillir sans données de visiteurs

Le propriétaire peut relever, avec son propre profil de test autorisé :

1. Les noms des fonctions activées par périmètre, les origines parcourues et la version du site déployée.
2. Les noms des cookies reçus, domaine, chemin, HttpOnly/Secure/SameSite et durée. **Pas leur valeur.**
3. Le moment de déclenchement : arrivée neuve, challenge, choix de langue, ouverture d’une galerie, connexion admin/console, sortie.
4. Les noms des destinataires réseau, sans URL contenant un identifiant, un code, un state ou un jeton.
5. Pour les contrats : entité et service couverts, date/version du contrat de traitement, lieux/garanties des transferts, sous-traitants et durées pertinentes. Pas de clé ni de contenu de compte.

Utiliser des références techniques telles que « domaine du site », « domaine console » et « IdP » suffit pour le dossier partagé ; une adresse interne de serveur n’y a pas sa place. Un export HAR brut ou une capture de cookies avec leurs valeurs ne doit pas être transmis tel quel.

L’hébergement HTTPS ne prouve pas l’absence d’outils additionnels. Une CSP restrictive ne bloque pas un en-tête Set-Cookie ajouté par un proxy. Le déclenchement d’une plateforme extérieure après un clic doit être décrit séparément de ce qui se passe avant le clic.

### Relevé minimal demandé au propriétaire

Un bref relevé textuel suffit, sans export du compte :

1. **Cloudflare :** par périmètre public/admin/console, indiquer si le trafic est proxifié et si Access protège une application ; préciser Bot Fight Mode, challenges/widgets, RUM/Web Analytics et Zaraz : actif, inactif ou inconnu. Pour RUM, ajouter le mode d’exclusion géographique et l’injection éventuelle.
2. **Zitadel :** Cloud Free ou auto-hébergé ; pour Cloud, recopier seulement le nom de région affiché. Dans les deux cas, donner les durées de connexion et méthodes MFA activées, sans identité d’utilisateur.
3. **Contrats :** indiquer service, entité, date/version des TOS/DPA applicables et référence de la liste de sous-traitants. Une confirmation d’acceptation suffit au dossier partagé ; garder les pièces nominatives au bon endroit.
4. **Profil de test personnel autorisé :** fournir les seuls noms/attributs/durées des cookies sur accueil, connexion et challenge s’il se présente. Aucun jeton, JWT, code, URL privée ou HAR brut.

Ce relevé collecte des preuves : il ne demande pas d’activer ou de désactiver des produits. Si un réglage n’est pas identifiable, le noter plutôt que lui attribuer une valeur par défaut.

## 4. Qualification à terminer

- Pour la sécurité, vérifier l’usage exclusif et la proportionnalité de chaque dispositif ; l’étiquette « anti-bot » ne règle pas une éventuelle réutilisation secondaire.
- Pour l’IdP et Access, distinguer les cookies nécessaires à la connexion des autres finalités du fournisseur.
- Pour les transferts, vérifier que la garantie citée couvre bien l’entité, le service et les données du compte utilisé ; ne pas recopier une référence au Data Privacy Framework comme preuve automatique.
- Pour la sous-traitance, distinguer l’éditeur interne du module d’audience de ses fournisseurs d’infrastructure.

Cadre : [FAQ CNIL, questions 16–18](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ), [RGPD, article 28](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4) et [transferts, chapitre V](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre5). Ces points ne peuvent pas être clos par le seul succès des tests locaux.

## 5. Tableau de réception

| Élément | Réponse reçue et référence | Statut |
|---|---|---|
| Offre Cloudflare | **Gratuite**, déclaration du propriétaire reçue dans cette discussion | Confirmé par déclaration ; produits et réglages non déduits |
| Offre Zitadel | **Gratuite**, déclaration du propriétaire reçue dans cette discussion | Confirmé par déclaration ; Cloud ou auto-hébergement à préciser |
| Fonctions Cloudflare publiques | Non fournies dans les preuves disponibles | En attente d’observation du propriétaire |
| Access sur l’administration | Non fourni ; conception Access de la console seulement établie | En attente |
| Mode/région/entité Zitadel réels | Aucun relevé du compte utilisé | En attente ; aucune résidence supposée |
| Inventaire réel des cookies et domaines | Aucun relevé réel utilisé | En attente |
| Conditions prestataires applicables | Textes publics officiels consultés ; rattachement au compte/service réel non vérifié | Documentation réunie, validation contractuelle du compte en attente |
| Finalité des provenances/partages dans l’équipe | Code et libellés étudiés ; confirmation d’usage non reçue | À arrêter par les responsables |

Une réponse absente n’est pas un accord ni une preuve d’activation. Le dossier avance sur le code sans transformer ces inconnues en certification de l’installation.

**Suite possible sans changer d’offre :** qualifier les services réellement utilisés, rattacher les contrats, justifier les protections et traiter les écarts constatés. Si une propriété nécessaire manque effectivement à l’offre actuelle, comparer alors les alternatives qui conservent le service. Le seul mot « gratuit » ne tranche aucune de ces décisions. Les références nouvelles R13–R25 sont consignées dans [sources.md](sources.md).
