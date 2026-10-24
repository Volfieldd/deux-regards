# Utiliser les fiches et terminer le dossier

État du 24 octobre 2026. Les fiches sont un **dossier interne de justification et de suivi**, à conserver avec le registre RGPD. Elles servent à expliquer chaque finalité, les garanties réellement en place et les décisions restant à prendre. Elles ne sont ni des formulaires à faire accepter aux visiteurs, ni une demande d’homologation CNIL. Pour l’audience, la CNIL demande une démonstration documentée et exclut la présentation de l’auto-évaluation comme une certification : [méthode officielle](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience).

## 1. Répartir les documents

| Pièce | Utilisation concrète | Responsable et moment |
|---|---|---|
| [Fiches public](fiches-public.md), [admin/Vigie](fiches-admin-vigie.md), [vote](fiches-votes.md) | Garder une justification par finalité. Compléter les durées, la base légale du traitement personnel, les destinataires et la décision exemption/consentement | Responsables du site, lors de la décision puis après chaque changement concerné |
| [Audience](audience.md) | Fermer chaque garantie avec une preuve de code/configuration et, si nécessaire, une analyse alternative motivée | Responsable du traitement avec le développeur ; avant d’affirmer que la mesure est exemptée |
| [Exigences T01–T15](exigences-techniques.md) et [contrôle d’application](suivi-exigences.md) | Transformer les écarts en lots techniques avec résultat attendu et preuve de clôture | Développeur ; une PR par étape selon les règles du dépôt |
| [Prestataires](fournisseurs.md) | Consigner les services actifs, la région, le cadre contractuel et les observations de cookies | Titulaire des comptes Cloudflare/Zitadel ; relevé expurgé, sans secret |
| [Information FR/EN/DE](information-fr-en-de.md) | Préparer les explications publiques et celles de l’équipe, alignées sur le produit livré | Responsables et développeur ; publication après vérification du comportement annoncé |
| [Preuves](suivi-exigences.md#vérifications-exécutées) | Conserver commande, révision, résultat et limites ; ajouter la version déployée lors de sa vérification | Exécutant du contrôle puis responsable du déploiement |

Le [registre existant](../wiki/RGPD.md) et la [fiche Vigie](../wiki/RGPD-Vigie.md) restent les références des traitements. Les compléter avec les décisions finales et un lien vers les fiches plutôt que recopier des conclusions contradictoires. La démarche répond à la responsabilité de démontrer les mesures prises et de les tenir à jour ; les pièces nécessaires au registre sont précisées aux articles 24 et 30 du [RGPD](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).

## 2. Ce qui est déjà décidé

| Décision issue de cette discussion | Conséquence pour la suite |
|---|---|
| Conserver les fonctionnalités | Langue, J’aime, navigation, secours hors ligne, visiteurs uniques et protections restent dans la cible ; aucune suppression pour simplifier l’audit |
| Chiffrer les données privées en base et dans les cookies | L’objectif de sécurité est acquis. Les frontières NC2, l’historique Vigie, les index et le déverrouillage hors ligne restent à concevoir ; voir [étude technique](../etudes/chiffrement-etats-cookies.md) |
| Éviter les caches lorsqu’une alternative existe | Distinguer un rendu recalculable d’un état nécessaire de session, de droit ou de reprise. Vérifier la fonction et le coût de l’alternative avant remplacement |
| Éviter un consentement global imposé à l’entrée | Qualifier chaque usage. Un consentement nécessaire peut être demandé au moment de la fonction concernée ; il ne conditionne pas la visite générale |
| Cloudflare gratuit et Zitadel gratuit | Information reçue du propriétaire ; ne prouve ni les options actives, ni la résidence, ni le déploiement des corrections |
| Vote d’exposition | Le plan produit a déjà retenu un consentement explicite au premier vote, sans exemption revendiquée ; ne pas rouvrir cet arbitrage dans une correction |

## 3. Compléments à apporter aux fiches

Les formulations proposées ci-dessous sont à confirmer par les responsables ; elles ne sont pas enregistrées comme leurs réponses.

| Référence | Réponse concrète à consigner | Pièces concernées |
|---|---|---|
| D-C01 | Confirmer si les statistiques/provenances/partages servent seulement à piloter les contenus et le fonctionnement du site, sans profil publicitaire ni rapprochement avec comptes, invitations ou Vigie. Décrire toute autre utilisation réelle | P08 et audience |
| D-C02 | Pour chaque préférence et copie de secours : indiquer combien de temps elle est utile, son point de départ, son éventuel renouvellement et le geste d’effacement. Le tableau doit distinguer durée actuellement codée et durée retenue | P01, P04–P07, A03–A07, V02 |
| D-C03 | Décrire ce que le visiteur ou l’opérateur demande durablement : retrouver ses J’aime, récupérer un brouillon après fermeture, sur appareil partagé ou personnel. Choisir ensuite la justification d’exemption ou le consentement contextuel à réaliser | P04 et A07 |
| D-C04 | Faire démontrer minimisation IP/UA, isolement site/jour et anonymat de toutes les sorties, en maintenant l’indicateur journalier. Décider le choix d’opposition et son périmètre | P08, audience, T09–T12 |
| D-C05 | Arrêter la base légale du traitement personnel et, lorsqu’il s’agit d’intérêt légitime, sa nécessité et sa mise en balance. L’exemption d’un cookie ne suffit pas | Fiches personnelles, registre site/Vigie |
| D-C06 | Relever les fonctions Cloudflare actives, Access par périmètre, Cloud ou auto-hébergement Zitadel, sa région et les documents contractuels applicables | F01–F05 ; checklist fournisseurs |
| D-C07 | Faire réaliser les protections et tester migration/restauration ; la politique de chiffrement ne demande pas d’être acceptée une seconde fois | T02, T07, T08, T13, T14 |
| D-C08 | Finaliser la conservation de sécurité/incidents selon D38, les habilitations et la gestion des anciennes copies | V03 et registre Vigie |

Pour chaque décision, renseigner : **référence — décision et raison — responsable — date — version/configuration — preuve — prochain événement imposant une revue**. Une validation interne est une trace de responsabilité ; elle ne transforme pas une garantie technique absente en garantie appliquée.

## 4. Ordre d’exécution proposé

1. **Conserver les cinq correctifs déjà intégrés** et identifier la version réellement déployée. Le [contrôle](suivi-exigences.md) distingue présence au code et installation réelle.
2. **Compléter le relevé Cloudflare/Zitadel**, sans attendre de modifier les fonctions applicatives. Conserver dans un espace privé les contrats ou éléments de compte révélateurs ; le dépôt ne reçoit que les références et constats expurgés.
3. **Ouvrir les lots de protection restants** : chiffrement et clés/migrations, puis flash/toast et secours local correctement isolés. L’architecture du secours totalement hors ligne doit préserver la reprise après fermeture.
4. **Fermer le lot audience** : minimisation/équivalence, sorties de faible effectif, opposition et purge autonome. Conserver les visiteurs uniques journaliers ; mesurer les conséquences sur l’indicateur avant tout changement de calcul.
5. **Arrêter les justifications/durées et les cas de consentement** avec leurs résultats techniques. Faire revoir les cas gris précis si nécessaire, puis actualiser le registre et publier uniquement l’information vérifiée.

Les opérations d’installation et de déploiement suivent les règles du dépôt. Ce dossier ne donne pas accès à la production et ne constitue pas une preuve de sa configuration.

## 5. Critère de clôture d’une fiche

Une fiche n’est close que lorsque la finalité et le service demandé sont explicites, la qualification est motivée, les données/destinataires/durées et droits sont fixés, les garanties sont livrées et vérifiées, l’information correspond au résultat, et la configuration réelle a sa preuve. Réexaminer la fiche si un prestataire, une finalité, une durée, un stockage ou une sortie change.

Conserver également les constats historiques avec leur révision : ils expliquent l’écart initial mais ne prouvent pas l’état actuel. Ne pas publier les détails de clés, d’architecture interne ou de vulnérabilités dans la notice destinée aux visiteurs.
