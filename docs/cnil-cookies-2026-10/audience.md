# Auto-évaluation de la mesure d’audience Nicephos

**Réexamen sur 1.226.0 :** le module de mesure est inchangé par rapport au code initial ci-dessous ; ses réserves restent ouvertes. Le [contrôle public/audience](preuves/controle-public-audience.md) couvre les nouvelles rubriques et le [suivi](suivi-exigences.md) contient les tests réellement rejoués. Les offres gratuites déclarées sont traitées dans les prestataires.

État du **24 octobre 2026**, commit `f44cdf31f8c8c8893071e9350962cdf1370202ee`, version 1.217.0. Outil interne développé pour les responsables du site. Aucune installation réelle, base de visiteurs ou sauvegarde réelle consultée.

**Conclusion : les conditions de l’exemption ne sont pas toutes démontrées dans le dossier actuel.** Le module possède des garanties favorables : aucun cookie d’audience, aucune empreinte de visiteur enregistrée dans ses tables, aucune liste de pages attachée à une empreinte. Les points à fermer sont la minimisation de l’empreinte, son cloisonnement effectif, l’anonymat des restitutions à faible volume, l’opposition accessible, la conservation réelle et les usages/prestataires d’exploitation. Cette conclusion ne prescrit pas de supprimer les visiteurs uniques.

La correspondance ci-dessous suit la [grille CNIL de juillet 2025, p. 2–4](https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf). Les intitulés courts renvoient à ses critères, sans reproduire le formulaire. Les rubriques de prestataire ne sont pas automatiquement applicables à un outil interne ; les fournisseurs d’infrastructure sont examinés séparément dans [fournisseurs.md](fournisseurs.md). La grille permet de justifier une mesure technique alternative ; ce dossier ne considère pas cette justification comme acquise.

## 1. Fonction réellement mesurée

`createStats()` incrémente pages, photos, visiteurs par jour, mobile, pays et domaine de provenance. Une clé aléatoire propre à l’instance est renouvelée au changement de journée constaté. Deux empreintes sont calculées : IP et navigateur complets, puis IP seule pour la borne par adresse. Elles restent en mémoire. La base reçoit des agrégats.

Le compteur « visiteurs » dédoublonne des couples techniques IP/navigateur pour une journée ; il ne compte pas avec certitude des personnes physiques. Une nouvelle clé ou un redémarrage peut modifier le dédoublonnage. Les totaux d’une période additionnent les visiteurs de ses journées : ils ne sont pas des personnes distinctes sur toute la période. La page admin l’explique déjà pour cette addition.

Preuves : [server/stats.js](../../server/stats.js), 47–113 et 131–159 ; [views/admin/stats.eta](../../views/admin/stats.eta), 24–29 ; [server/routes/admin.js](../../server/routes/admin.js), 1116–1162.

## 2. Grille de correspondance

L’état « étayé par le code » ne vérifie pas les usages humains ni les paramètres du fournisseur. « Partiel » indique une preuve ou une justification à compléter ; aucun pourcentage global de conformité n’est calculé.

| Repère de la grille | Constat Nicephos et preuve | État / condition de clôture |
|---|---|---|
| G01 — Périmètre fonctionnel | Le module ne contient ni cohorte ni conversion de campagne. Ses sorties éditoriales comprennent aussi les domaines de provenance ; `stats.js`, 49–54, 142–149 | **Partiel.** Faire confirmer l’usage éditorial et opérationnel. Un tableau de provenance n’est pas automatiquement une mesure d’acquisition marketing ; l’usage réel compte |
| G02 — Données minimales | IP complète et UA complet entrent dans HMAC ; aucune conservation brute dans les tables du module ; `stats.js`, 95–97 | **Écart aux mesures recommandées, alternative non démontrée.** Justifier les entrées exactes ou les réduire. Mesurer les collisions et la stabilité avant de modifier l’indicateur |
| G02 — Événements | Pages/photos dans `stats.hit` ; partages de boutons et QR dans un module distinct ; `public.js`, 365–422 et 625–631 ; `share.js`, 29–44 | **Étayé pour le périmètre lu.** Pas de collecte de saisie de formulaire ou de rejeu de session identifié ; maintenir cette frontière |
| G03 — Contrat du fournisseur | Pas de fournisseur du logiciel d’audience identifié : outil interne. Cloudflare achemine déjà les requêtes et fournit le pays | **Sans objet pour la fourniture interne du module.** Le contrat d’infrastructure reste à vérifier ; ne pas transformer ce classement en validation de Cloudflare |
| G04 — Mutualisation | Les tables examinées appartiennent au site ; aucune table de clientèle multiediteur ni export de données brutes vers un service d’audience | **Étayé dans le code.** Confirmer que les instances, copies et usages d’exploitation restent séparés |
| G05 — Réutilisation fournisseur | Pas de SDK d’audience ni d’appel tiers dans `stats.js` | **Partiel pour l’installation.** Fonctions Cloudflare éventuellement activées et conditions contractuelles inconnues |
| G06 — Contact fournisseur | Rubrique de service à des prospects non pertinente pour ce module interne | **Sans objet pour le module interne.** Contact des responsables et exercice des droits à vérifier dans l’information publiée |
| G07 — Imports et référent | `sourceOf()` ne garde que le domaine, sans chemin ni requête ; aucune entrée CRM/UTM dans les insertions ; `stats.js`, 30–37, 50–54 | **Étayé.** Le pays transmis par Cloudflare est un enrichissement technique à documenter, pas un import d’identité. Ne pas ajouter de rapprochement de comptes |
| G08 — Isolement des sites | Clé de 32 octets par instance/journée ; pas de domaine explicite dans le HMAC ; `stats.js`, 56–74, 96–97 | **Partiel.** La séparation par clés d’instances peut être une alternative, si les domaines et instances réels la garantissent. Aucune preuve de suivi multisite déduite de la seule absence du domaine dans la formule |
| G08 — IP et temporalité | Pays accepté seulement derrière le proxy prévu ; IP utilisée entièrement pour les empreintes ; renouvellement au premier événement d’un nouveau jour | **Partiel.** Décrire le rôle de l’IP et les garanties du HMAC. Justifier l’alternative à la minimisation suggérée, ainsi que le nettoyage sans trafic |
| G07/G08 — Marquage personnel | Clés de pages contrôlées et identifiants de photos ; pas de nom, message, référence de rencontre ni identité visiteur dans les tables statistiques ; `public.js`, 365–393, 518, 692–804 | **Étayé dans ce module.** Garder les états de J’aime, d’accès privé et de Vigie hors du rapprochement d’audience |
| G09 — Couverture externe | Pas de fonction de dédoublonnage entre sites ou de rapprochement de campagnes identifiée | **Étayé dans le code**, installation à confirmer |
| G10 — Restitutions | Nombres exacts par jour, photo, provenance et pays ; test de pays à un visiteur ; `stats.js`, 131–159 ; `test/statistiques.test.js`, 122–135 | **Anonymat non démontré à faible volume.** Aucun seuil, regroupement ni étude alternative identifié. L’absence d’identifiant dans les tables ne suffit pas à fermer ce point |
| G11 — Combinaisons | Périodes comparées et marges pays/source/photo, avec totaux exacts et affichages annexes | **Justification manquante.** Étudier les déductions par différence et les informations contextuelles connues ; couvrir toutes les sorties, pas une seule table |
| G12 — Parcours individuel | `seen` mémorise une empreinte sans lui associer une liste des pages ; aucune session replay identifiée ; `stats.js`, 58–59, 99–105 | **Étayé dans le module.** La séparation du journal de sécurité reste nécessaire |
| G13 — Opposition accessible | DNT/GPC vérifiés avant le HMAC ; pas de commande d’opposition immédiate trouvée dans Confidentialité ; `stats.js`, 82, 93–97 ; `privacy.js`, 72–83 | **Partiel.** Pour la démarche recommandée, offrir une commande accessible ou démontrer l’efficacité d’une alternative. Le contact général ne prouve pas un refus immédiat de mesure |
| G14 — Opposition durable | Les en-têtes sont honorés lorsqu’ils sont présents ; pas d’état propre à une opposition exprimée sur le site | **Partiel.** Mémoriser le refus s’il est proposé sur le site, vérifier avant calcul, expliquer sa portée et ne pas l’utiliser à une autre fin |

Les références officielles des objectifs figurent dans [sources.md](sources.md), R05–R06. La présentation recommandée par la grille peut être remplacée par une démonstration d’anonymat adaptée : un arrondi uniforme n’est ni une obligation légale universelle ni une preuve suffisante contre toutes les déductions.

## 3. Quatre compléments propres à Nicephos

### Conservation et nettoyage

La borne de 25 mois est codée pour les cinq tables `stats_*`, mais le nettoyage se fait dans `rollover()`, à la prochaine visite comptée d’une nouvelle journée. Les empreintes expirent selon le même déclenchement ; il n’y a pas de purge autonome dans ce magasin. Une promesse d’effacement exactement à minuit dépasse donc ce mécanisme. La conservation des sauvegardes n’a pas été vérifiée.

**Mesure minimale :** faire respecter la durée retenue indépendamment du trafic, sans modifier les métriques. Distinguer fin d’utilité, suppression et copies de sauvegarde. Les repères de conservation sont examinés dans la [recommandation CNIL, § 5](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf) ; ils ne suffisent pas à qualifier la finalité ou l’anonymat.

### Partages : traitement distinct

`photo_shares` conserve photo, moyen fermé, jour et nombre. Il ne conserve aucun identifiant visiteur. Le POST et le QR ne passent cependant pas par les mêmes exclusions que `stats.hit`. Les DNT/GPC et l’exclusion des comptes d’équipe ne s’y appliquent pas uniformément. Aucune purge par durée de cette table n’a été identifiée dans le périmètre lu.

Cela ne démontre pas que le comptage agrégé d’un clic constitue le même traitement qu’une empreinte de visiteur, ni qu’il violerait automatiquement une obligation DNT. Il faut définir si l’opposition proposée couvre ces compteurs et adapter l’information à son périmètre. Ne pas généraliser l’effacement à 25 mois à tous les compteurs du site.

Preuves : [server/share.js](../../server/share.js), 29–44 ; [server/routes/public.js](../../server/routes/public.js), 411–420, 625–631 ; [test/partager.test.js](../../test/partager.test.js), 58–61.

### Sorties à couvrir ensemble

Outre la page Statistiques v1/v2, les nombres apparaissent dans l’accueil admin, les fiches/inspecteurs de photos, les graphiques, pourcentages, infobulles et le JSON `/admin/photos/:id/statistiques`. Aucun export CSV propre à l’audience n’a été identifié dans cette lecture. Le JSON est déjà une sortie à examiner.

Sources : [server/routes/admin.js](../../server/routes/admin.js), 455, 1090–1093 et 1116–1170 ; [views/admin/stats.eta](../../views/admin/stats.eta), 24–38 et 89–118 ; [views/admin/v2/stats.eta](../../views/admin/v2/stats.eta).

### Information et choix des responsables

Les expressions « empreinte anonyme », « aucune IP ni identifiant conservé » et « oubliée à minuit » doivent être précisées : empreinte technique temporaire en mémoire, agrégats en base et nettoyage réellement exécuté. Ne pas annoncer l’outil « validé CNIL ». La [page officielle](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience) précise la portée de l’auto-évaluation.

Les responsables doivent confirmer l’usage des provenances et partages, les destinataires effectifs et les garanties retenues pour les faibles volumes. L’intérêt légitime éventuellement retenu pour la phase personnelle du traitement demande sa propre analyse ; l’exemption article 82 ne le remplace pas.

## 4. Mesures conservant les fonctions

1. Décrire l’indicateur journalier réellement produit, sans le transformer en personnes distinctes sur un mois.
2. Justifier ou réduire les entrées du HMAC et rendre l’isolation site/jour démontrable. Toute réduction modifiant le dédoublonnage doit être comparée sur des données fictives ; aucune modification silencieuse du chiffre n’est décidée ici.
3. Démontrer l’anonymat des sorties, ou adapter leur restitution avec des mesures cohérentes entre vues, totaux et JSON. Les fonctions d’audience restent ; la granularité exacte peut nécessiter un arbitrage si elle permet d’identifier une visite.
4. Ajouter une opposition accessible et cohérente avec l’information, en conservant DNT/GPC. Définir séparément la portée sur les partages réellement anonymes.
5. Garantir les purges et traiter les anciennes copies ; ne pas déplacer les empreintes dans un nouveau stockage durable.
6. Terminer la fiche prestataires et faire arrêter les finalités, la base légale et les durées par les responsables.

## 5. Preuves exécutées

Les suites existantes `test/statistiques.test.js` et `test/partager.test.js` ont été relancées seules sur bases jetables : **11 tests, 11 réussis, aucun échec ni test ignoré**. Voir [la sortie](preuves/tests-audience-partage.txt). Elles vérifient des propriétés techniques du code présent ; elles ne démontrent pas l’exemption ni la production. Aucun nouveau test durable, outil de consentement ou changement de fonctionnalité n’a été créé.
