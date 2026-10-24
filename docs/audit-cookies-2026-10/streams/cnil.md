# Discussion autonome sur les exemptions CNIL et les obligations RGPD

**Reprise réalisée :** le [dossier CNIL](../../cnil-cookies-2026-10/README.md) contient les fiches par finalité, l’auto-évaluation d’audience, les exigences et les réserves. Ce brief demeure le cadrage ; le dossier distingue les preuves acquises des décisions encore ouvertes.

## Mission et contexte de reprise

Préparer un dossier de justification par finalité pour Nicephos, en séparant **site public, administration et Vigie**. L’utilisateur veut conserver **toutes les fonctionnalités**, sans imposer de consentement global pour entrer sur le site. Ce document prépare une discussion distincte ; il ne crée pas une nouvelle conversation et n’autorise aucune implémentation.

Lire le [rapport révisé](../README.md), l’[inventaire technique](../inventaire-technique.md), la [carte des protections](../protections-et-caches.md) et les [preuves](../preuves/controles.json). Les propositions antérieures de suppression de fonctions sont des alternatives étudiées, pas des décisions acceptées : la conservation fonctionnelle prévaut.

État audité : **1.217.0**, commit **`f44cdf31f8c8c8893071e9350962cdf1370202ee`**. **135 tests ciblés**, **4 tests de liens applicatifs** et **13 contrôles complémentaires** ont été exécutés sur des données jetables. Ils ne prouvent ni l’installation réelle ni les solutions futures. Les documents de diagnostic sont actuellement non committés. Aucune donnée de production n’a été consultée.

## Contraintes décidées

- Chiffrement en base et dans les cookies selon la politique demandée ; authenticité et gestion des clés à concevoir avec le [chantier technique](technique.md).
- Aucun cache évitable lorsqu’une alternative conserve réellement le service. Une session, une autorisation, une file de reprise nécessaire ou un secours hors ligne ne sont pas supprimables sous la seule étiquette « cache ».
- Maintenir notamment langue mémorisée, J’aime durable, retour galerie, plein écran, visiteurs uniques et reprise de brouillon après panne ou crash. Une reprise après crash nécessite une persistance quelque part ; hors ligne, elle doit être locale.
- Aucun bandeau global, aucune suppression de fonction et aucun changement de code dans cette discussion. Ne pas rouvrir silencieusement les décisions du projet.

## Cadre d’analyse à appliquer

Faire deux examens distincts : **article 82 pour les lectures/écritures du terminal**, puis **RGPD pour les données personnelles traitées**, y compris au serveur. Un traitement serveur ne nécessite pas automatiquement un consentement. Un cookie exempté ne dispense pas des obligations RGPD connexes. Le chiffrement ne rend pas les données anonymes et ne crée aucune exemption.

Les connexions demandées et la langue choisie ont des bases favorables, sous usage exclusif et durée proportionnée. **J’aime durable et secours hors ligne restent à justifier** : le geste utilisateur, une case « mémoriser » ou la qualification « fonctionnel » ne suffisent pas. Distinguer nécessité du service, facilité de développement et intérêt économique.

Pour chaque usage, qualifier : exemption étayée sous conditions, justification incomplète, ou absence d’exemption établie. Ce dernier statut ne constitue pas automatiquement un constat d’illégalité. Si nécessaire, examiner un choix contextuel préalable, spécifique et libre, sans imposer une acceptation globale.

L’autoévaluation documente une position ; l’audit technique vérifie les faits ; une revue juridique indépendante apprécie les cas discutables. Aucun ne constitue une certification ou validation de la CNIL.

## Fiches et preuves à produire

Une fiche par finalité, même si plusieurs variantes de cookies la servent :

1. Service rendu, personnes concernées et action exprimant la demande.
2. Nécessité exacte, alternatives réellement équivalentes et raisons de les retenir ou écarter.
3. Exclusivité de l’usage, réutilisations, rapprochements et prestataires.
4. Contenu, portée, durée, renouvellement, expiration et effacement effectif ; distinction terminal/serveur et accès/conservation.
5. Références de code, configuration requise, preuves existantes et futurs contrôles ciblés.
6. Base légale RGPD éventuelle, information nécessaire ou recommandée, droits applicables.
7. Statut motivé, critères manquants, décision du responsable, date et conditions de réexamen.

Couvrir les douze familles de cookies, les huit stockages navigateur et les états serveur connexes. Identifier séparément Cloudflare, Access, Zitadel et Meta. Sans lire de données de production, demander aux propriétaires des observations anonymisées : noms, domaines, attributs, durées, fonctions activées et paramètres utiles, jamais valeurs de jetons ou secrets.

## Audience et sources primaires

Remplir critère par critère l’[outil CNIL de juillet 2025](https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf), sans déclarer automatiquement applicables à un outil interne toutes les rubriques destinées aux prestataires. Documenter finalité exclusive, minimisation des en-têtes, absence de rapprochement/multisite, composantes d’empreinte, anonymat des restitutions, opposition et durées. Justifier les mesures alternatives ; ne pas assimiler l’autoévaluation à une conformité globale.

Références complémentaires : [article 82](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037813978), [exemptions expliquées par la CNIL](https://cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi), [audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience), [recommandation consolidée du 16 janvier 2026, § 5](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf), RGPD [principes et bases légales](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2), [information](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3), [conception et sécurité](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4). Aucune durée universelle ne valide tous les usages.

## Livrables et liaison technique

Livrer les fiches, le pointage des critères manquants, les mesures minimales conservant les fonctions et les arbitrages motivés. Transmettre à [technique.md](technique.md) les contraintes de déclenchement, contenu, portée, durée, effacement, isolation des comptes et choix contextuels. Recevoir les contraintes réelles de clés, reprise, rotation et disponibilité avant de conclure.

Préparer ensuite les textes FR/EN/DE selon le comportement retenu ; ne publier aucune promesse avant sa réalisation. Réutiliser les preuves existantes : pas de nouvelle recherche exhaustive, campagne de tests ou intervention produit maintenant.
