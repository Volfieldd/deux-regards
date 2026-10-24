# Plan et historique de réalisation

Ce document dit **pourquoi** le site est construit ainsi et **dans quel ordre** il l'a été. Pour l'utiliser ou le reprendre, partir du [README](README.md) ; pour le détail fonction par fonction, [Spécifications](docs/wiki/Spécifications.md).

Nicephos, site photo de Sébastien et Julien. Le nom est défini à un seul endroit (`SITE_NAME`, ou Réglages dans l'admin) ; « Deux Regards » était le nom provisoire.

Références de design (artefacts claude.ai) :
- Mix retenu : https://claude.ai/artifact/41G7RSWC6zQQh1gsoXtGRG
- Prototype des 4 directions : https://claude.ai/artifact/WAfffW6sWdDvLWLDPRPAq5
- Maquettes (pages photo, mobile, admin) : https://claude.ai/artifact/WDgwfg3Nn9GYXnaQszKnKc

## Correction — Relecture des expositions et attribution Vigie (24 octobre 2026)

Les quatre constats de la relecture de `994a899` sont corrigés ensemble. Photos et Carnets observent leurs changements persistés avant toute attente de notification, sous le compte de la requête ; la publication programmée impose un contexte sans sujet. Un POST concurrent ne prive plus DS23 de son acteur. Audit, DS9, déduplication et chaîne restent vérifiés par les lots signés jusqu’au moteur ; aucun type ni règle de détection nouveau.

Consultation, export et retrait des votes restent accessibles avant clôture après un retour du site ou de la rubrique en v1, depuis Confidentialité pour les cookies reconnus ; la collecte reste fermée en v1. Le retrait d’un bilan permet un nouveau rectificatif sans modifier ni réafficher son parent retiré, avec le même circuit de droits et de publication. Menus, index et adresses inconnues utilisent des recherches SQL dédiées, avant chargement des accrochages : sur 1 000 expositions ou collections de 12 photos, l’index charge 144 références, une fiche 12 et les menus/adresses inconnues aucune. Le décompte parcourt encore les métadonnées en SQL ; aucun coût CPU constant n’est revendiqué.

Chaque bogue conserve son test. Les six scénarios de concurrence Vigie échouaient avant correction et passent après ; les tests ciblés métier, les contrôles de documentation et la relecture indépendante sont concluants. La campagne complète et les parcours navigateur sont consignés dans la PR avec leurs nombres définitifs ; pas de fusion ni déploiement dans ce lot.

## Étude et démarrage — Les saisons de Nicephos (23 octobre 2026)

La [spécification fonctionnelle et le plan détaillé](docs/etudes/saisons-apres-image.md) cadrent les expositions temporaires, leur visite, les archives et le passage éditorial vers les collections permanentes. **Les saisons** portent la programmation et la rubrique publique s’appelle **Expositions**. Après arbitrage du propriétaire, le pilote participatif est un **vote consultatif sur des photos proposées à l’avance**, sans compte ni dépôt. Les séries sont conservées ; l’Après-image avec compositions, suggestions ou uploads est documenté comme évolution différée.

**S0 implémenté dans la PR #218, en brouillon et en attente de revue** : socle métier et migration `065_saisons.sql`, avec tests sur bases jetables ; saisons préparées, accrochages ordonnés, calendrier, programmation, ouverture, clôture, retrait et publication explicite d’un bilan avec ou sans sélection. Le modèle reste interne : aucun écran, route, cookie, droit ou événement nouveau n’est branché au serveur ; le site publié ne présente pas encore de saison. Les méthodes de lecture destinées au public écartent à chaque lecture une photo qui n’est plus publiée, y compris dans la sélection du bilan.

Chaque PR comporte sa note de version en français, anglais et allemand, même pour un socle interne, ainsi qu’une version `1.<numéro de PR>.0`. La PR #218 porte la version `1.218.0` et annonce explicitement que les interfaces ne sont pas encore disponibles. Les besoins de la Vigie et leurs preuves attendues sont détaillés par lot dans le plan fonctionnel.

**À suivre, une PR par jalon** : S1b, raccordement de l’atelier après définition complète des droits et du calendrier ; S2, visite, couverture publique avant ouverture et archive complète de 12 mois ; S3, bilans immuables, rectificatifs distincts et prolongements présentés comme de nouvelles expositions ; V0, propositions et validations ; V1, vote consultatif. Les anciens lots A1/A2 (contributions Après-image) et les invités restent différés. Aucun nouveau droit ni durée de cookie ne sont décidés implicitement.

## Arbitrages — Expositions et vote consultatif (23 octobre 2026)

Le propriétaire a décidé : choix de l’accueil réservé à l’administrateur, couverture publique avant ouverture, conservation de l’exposition complète pendant 12 mois, ajout du sous-titre/prologue/conclusion/couverture/cartels et trois langues requises pour publier. Le bilan publié est immuable ; un rectificatif est un **nouveau bilan lié**. Le prolongement se présente comme une nouvelle exposition, sans changement implicite du statut permanent des collections.

Le photographe d’origine propose les photos au vote ; relecteur et administrateur les valident. La direction de publication peut réordonner les propositions et constitue une responsabilité **distincte de l’administration, sans attribution automatique**. Le visiteur peut voter sur chaque photo proposée, au plus une fois sur chacune pour ce navigateur dans l’exposition ; le cookie sans compte est accepté, avec sa limite entre appareils ou après effacement. Le vote demeure consultatif. Les réponses complémentaires du 24 octobre fixent le consentement au premier vote et la purge des identifiants à la clôture ; la restitution publique reste éditoriale, dans le bilan.

La conception des compositions Après-image, suggestions, uploads, identités de contributeurs, publication/attribution et branches successives est gardée pour plus tard ; elle ne fait plus partie du pilote. Les réponses complémentaires fixent le calendrier UTC à la minute et les 12 mois depuis la clôture. Les comportements de programmation et de retrait du socle restent applicables. Le plan détaille les [besoins de la Vigie par lot](docs/etudes/saisons-apres-image.md#101-besoins-de-la-vigie-et-preuves-attendues-par-lot), notamment BV-6/DS22 pour les compteurs de vote. **Cette actualisation est documentaire : ces nouvelles règles ne sont pas encore activées dans le code.**

## Précision — Mécanisme du vote et traceurs (24 octobre 2026)

Accord pour instruire d’abord un identifiant aléatoire minimal dans un cookie créé au premier vote, sans fingerprinting. L’objectif est de simplifier le parcours ; **le propriétaire retient ensuite un consentement explicite dans le formulaire du premier vote**, sans bandeau global ni exemption revendiquée. Le [plan, § 5.4](docs/etudes/saisons-apres-image.md#54-piste-retenue-pour-létude--identifiant-minimal-au-premier-vote) documente les sources CNIL, la qualification et l’information/consentement à prévoir dans V1, la durée limitée à la clôture et les données nécessaires au consentement. Aucun cookie de vote ni fingerprinting activé par cette précision documentaire.

## Mise en œuvre — BV-35, PR #226, version 1.226.0 (24 octobre 2026)

Le manque de signal éditorial de V0 est traité dans la PR #226, en brouillon et dépendante de #224. Les changements effectifs persistés des propositions, de leur ordre et des deux validations émettent `config_public_changed`, objet fermé `propositions_vote`. Le détail se limite au numéro d’exposition, à l’action, aux versions, aux effectifs de photos et aux états booléens des validations ; aucune liste d’œuvres, texte, donnée de visiteur, cookie ou voix individuelle. Lectures, refus, conflits et répétitions identiques ne produisent pas ce signal.

La corrélation DS23 existante `reglage_apres_session_reprise` consomme ces événements sur le même compte dans une fenêtre inclusive d’une heure, avec sa gravité haute, sa phase ancrage et sa réponse `verifier_identite` selon les modes et garde-fous existants. Cette corrélation temporelle est non ordonnée ; elle ne prouve pas que la reprise de session a précédé le geste. Aucun nouveau type, permission, seuil, moteur ou mécanisme de conservation. Le [registre BV-35](docs/etudes/vigie-besoins-des-briques.md#bv-35--circuit-des-propositions-au-vote-après-une-session-reprise), le plan des saisons, les pages Vigie/Sécurité et les tests HTTP et de corrélation sont actualisés. Vérifications sur le code gelé `51a1485` : **61/61 tests ciblés, 1 458/1 458 en mode nominal et 1 458/1 458 avec Vigie**, aucun échec, ignoré ni annulé. Les suites complètes reprennent les scripts npm avec `--test-concurrency=4` placé avant les fichiers. Le scénario HTTP BV-35 traverse le vrai récepteur HMAC, l’alerte, le dossier et le retour de décision signée jusqu’à l’arrêt de la mutation suivante ; l’indice de reprise reste simulé. Banc 20k/5k/5k, trois paires alternées : analyse médiane 0,72 → 0,75 ms/événement et rafale 0,434 → 0,454 ms, six chaînes intactes. Les sources du moteur et les documents YAML analysés sont identiques ; les écarts locaux de +4,2 % et +4,6 % sur machine partagée ne garantissent pas la performance sur cible. Notes FR/EN/DE réservées à `securite.voir`. Aucune fusion ni mise en ligne.

## Mise en œuvre — Vote consultatif, V1, PR #224, version 1.224.0 (24 octobre 2026)

La page de l’exposition ouverte présente les photos proposées dans leur ordre doublement validé, sans modifier l’accrochage. Le visiteur peut voter une fois sur chacune avec ce navigateur ; consentement explicite non précoché au premier formulaire, aucun compte ni bandeau global. Aucun cookie de vote à la simple visite et aucun fingerprinting. Le cookie HttpOnly expire à la clôture ; la base garde un index propre à l’exposition, une preuve de consentement chiffrée et les bulletins nécessaires à l’unicité. Sans chiffrement disponible, aucun vote n’est collecté.

« Mes votes » permet l’export et le retrait des voix du navigateur. La clôture ou le retrait de l’exposition purgent les identifiants et bulletins de la base active, au démarrage, à la minute et aux lectures ; seuls les totaux restent dans l’atelier. Les sauvegardes gardent leur rotation existante de 14 jours. Les résultats sont consultatifs, sans classement public ni promotion automatique. Confidentialité FR/EN/DE, registre RGPD, aide, sécurité et besoins de la Vigie sont actualisés ; aucun secret ni bulletin n’est envoyé dans les signaux de sécurité.

Migration 070 et parcours sans JavaScript, PR en brouillon dépendante de #223. Tests ciblés : 20 modèle et 19 HTTP, A206/traductions 2 et liens 4 réussis. **Suites complètes : 1 446/1 446 sans Vigie et 1 446/1 446 avec Vigie**, sur le code gelé `99abbe6`, aucun échec, ignoré ou annulé. Quatre parcours sans JavaScript passent dans Chromium/WebKit à 1 440/390 px : ordre prévalidé, consentement, deux photos, persistance, export JSON téléchargé et analysé, anglais/allemand, retrait puis retour sans cookie. Vingt-quatre mesures sans débordement et six contrôles Axe sans violation ; contrôle SQL après retrait : zéro votant, zéro bulletin et total zéro. Les régressions de premier envoi concurrent, provenance native, téléchargement WebKit et notice hors Vigie ont leurs vérifications conservées. Aucune fusion ni mise en ligne.

## Mise en œuvre — Propositions consultatives, V0, PR #223, version 1.223.0 (24 octobre 2026)

Les photos proposées à l’avance suivent un circuit versionné : photographe d’origine, relecture, puis validation administrative. Le rôle distinct **Direction de publication** peut seulement réordonner cette liste ; il n’est attribué automatiquement à aucun administrateur. L’administrateur seul ne relit pas et ne réordonne pas ; un cumul de rôles est explicite. Changer la liste ou son ordre invalide les deux validations, y compris pendant l’ouverture. Clôture et retrait figent le circuit. Les photos sont revérifiées dans l’accrochage et selon leurs droits avant chaque validation et lecture.

Migration 069, écran des deux administrations, aide FR/EN/DE, droits et journal documentés. Le besoin Vigie BV-35 décrit la corrélation du circuit avec une session reprise, encore à compléter à cette étape ; le complément est décrit dans la section BV-35 ci-dessus. Les refus et écritures sont déjà observables sans texte ni bulletin. PR en brouillon, dépendante de #222, sans fusion ni déploiement. Votes publics et consentement restent dans V1.

Vérifications V0 : **1 407/1 407 dans chaque mode**, avec et sans Vigie, à quatre processus de test. Le premier passage a relevé le nouveau rôle absent du catalogue de la Vigie ; catalogue et cumul corrigés, test conservé. Quatre cas navigateur sur quatre comptes fictifs valident proposition/relecture/administration/direction ; vingt-quatre mesures v1/v2 à 1 440/390/320 px sans débordement et deux contrôles Axe sans violation. Banc 20k/5k/5k : analyse médiane 0,72 → 0,70 ms, rafale 0,380 → 0,458 ms ; le contrôle à code identique présente aussi des écarts (0,408 → 0,456 ms sur la rafale). Les mesures sur machine partagée ne permettent pas d’attribuer un ralentissement au correctif ; absence de ralentissement non démontrée, vérification sur cible à conserver avant validation.

## Mise en œuvre — Bilans et collections, S3, PR #222, version 1.222.0 (24 octobre 2026)

L’exposition close peut publier un bilan en trois langues, avec une sélection éditoriale. Sa publication fige textes et sélection ; un rectificatif est un nouveau bilan lié. Les œuvres choisies peuvent former une collection permanente avec sa présentation, sa couverture, son ordre et ses cartels propres. La collection garde son parcours sans date de clôture ; les droits de chaque photo sont vérifiés à la lecture. L’exposition conserve ses bilans et les liens vers les collections après les douze mois d’archive, sans réafficher ses anciennes photos. Une origine retirée cesse d’être affichée sans retirer automatiquement sa collection.

Administration et visite FR/EN/DE raccordées ; migration 068 reprend les bilans déjà publiés du socle. PR en brouillon, dépendante de #221, sans fusion ni déploiement. Sept cas navigateur réussis couvrent les publications dans l’administration et la visite jusqu’à la collection dans Chromium/WebKit sur ordinateur et mobile. Dix-huit mesures de débordement des écrans administratifs et six contrôles Axe sont sans défaut relevé. Les publications/retraits des bilans et collections sont attribués à l’administration dans la Vigie, sans brouillon ni texte brut. Les suites complètes passent : **1 397/1 397 dans chaque mode**, avec et sans Vigie, exécutées séquentiellement à quatre processus de test.

## Mise en œuvre — Visite des expositions, S2, PR #221, version 1.221.0 (24 octobre 2026)

Depuis l’accueil choisi explicitement par l’administration, le visiteur rejoint l’exposition, parcourt ses photos avec leurs cartels, puis sa conclusion. La rubrique Expositions et les pages FR/EN/DE suivent les présentations publiques v2/v3. Avant l’ouverture, seuls le titre, les dates et la couverture annoncent l’exposition. Après la clôture, l’accrochage reste accessible douze mois calendaires UTC ; son adresse garde ensuite le bilan sans restituer les photos. Une couverture ou une photo retirée disparaît à la lecture ; aucune exposition de remplacement n’est choisie automatiquement.

PR en brouillon, dépendante de #220, sans fusion ni déploiement. La Vigie reçoit les textes effectivement publics et distingue les transitions de calendrier des gestes administratifs. Le lot ciblé passe 25/25 tests. Cinq parcours réels sans JavaScript passent dans Chromium et WebKit, sur ordinateur et formats mobiles ; huit contrôles Axe ne trouvent aucune violation. Les suites complètes passent : **1 376/1 376 sans Vigie et 1 376/1 376 avec Vigie**. Bilans rectificatifs, collections et vote restent dans leurs lots séparés.

## Mise en œuvre — Atelier des expositions, S1b, PR #220, version 1.220.0 (24 octobre 2026)

Le propriétaire valide la matrice de droits : le photographe prépare ses expositions, le relecteur lit et validera les propositions au lot V0 ; l’administration programme, publie, retire et choisit l’accueil. La direction de publication garde une permission distincte, sans attribution automatique. Calendrier UTC à la minute ; archive complète pendant 12 mois depuis la clôture puis bilan et liens vers les collections. Pour le vote, consentement explicite au premier vote dans le formulaire, cookie et identifiants supprimés à la clôture, compteurs seuls conservés.

S1b raccorde les vraies routes et les deux administrations : migration 067, sous-titre/prologue/conclusion, couverture et cartels contextuels, trois langues avant validation, choix de photos publié/autorisé et paginé, ordre numérique, aperçu privé, erreurs conservées et conflit de version sans écrasement. Les permissions, le CSRF et les portées sont vérifiés ; le choix d’accueil est observé par la Vigie via BV-1. L’aide et les notes FR/EN/DE sont mises à jour. Routes publiques, bilans rectificatifs et vote arrivent dans leurs lots séparés. La PR reste en brouillon, sans fusion ni déploiement.

Vérifications S1b : **1 365/1 365 tests sans Vigie et 1 365/1 365 avec Vigie**. Parcours dans l’application jetable, sans JavaScript : création et persistance des textes/ordre/couverture/cartels, erreur de calendrier sans écriture, conflit sans écrasement, programmation et choix d’accueil, refus hors portée. Chromium : administrations v1/v2 à 1 440, 390 et 320 px sans débordement ; quatre pages sans violation Axe. Photos fictives générées, aucune donnée réelle. Safari et services OIDC réels non essayés dans ce lot.

## Correction — Échéances, purges et stockages refusés, PR #225, version 1.225.0 (24 octobre 2026)

Premier lot du diagnostic des cookies sur la version 1.217.0 : URL publique HTTPS obligatoire en production, dix minutes OIDC vérifiées au serveur avant échange du code, suppression des sessions expirées au démarrage puis chaque heure, effacement autonome des récapitulatifs Bonjour à quinze minutes et accès facultatifs au stockage navigateur protégés dans les deux admins. Derrière Cloudflare Tunnel, le service interne reste autorisé en HTTP sans certificat local : un test sur un listener HTTP réel vérifie la santé et les attributs du cookie destiné au visiteur HTTPS. Les fonctions, droits, durées et empreintes révoquées de la Vigie sont préservés. Chaque défaut a son test de régression ; les parcours navigateur utilisent une base jetable avec stockage autorisé et refusé. La [note du lot](docs/etudes/cookies-correctifs-techniques.md) sépare les périmètres et les dépendances CNIL. Le [chiffrement intégral](docs/etudes/chiffrement-etats-cookies.md), déjà demandé, est conçu mais non appliqué : NC2, l’historique Vigie, les index et le déverrouillage entièrement hors ligne restent à arbitrer avant migration.

## Correction — Inventaire Fastify autonome de la Vigie, PR #217, version 1.217.0 (23 octobre 2026)

Le manifeste et le verrou autonomes de la Vigie passent de Fastify 5.12.5 à 5.12.7. `Dockerfile.vigie` installe bien cet inventaire avant de le copier dans l’image publiée : sa construction l’audite désormais séparément et s’arrête avant l’image finale si npm signale une vulnérabilité de production. Le test d’infrastructure maintient l’alignement avec le site et l’ordre installation, audit, image finale. Les routes actuelles n’emploient pas la forme `headers.propertyNames` concernée par GHSA-389g-gv7q-r4x8 ; le comportement du moteur et de la console reste inchangé.

## Correction — Constats résiduels de l’audit de sécurité, PR #216, version 1.216.0 (23 octobre 2026)

Sept commentaires ont été réexaminés sur la version courante. La revalidation des archives privées et la protection de la suppression des autosauvegardes étaient déjà livrées par la PR #212. Les cinq écarts restants sont corrigés : droit d’édition exigé pour la mutation `revised` d’un billet publié, refus local avant la relecture Zitadel propre à une action, deux rendus privés distincts au plus, analyse des sources indépendantes et des alertes locales avant le délestage du moteur, et frontière `INPUT` vers l’hôte. Les refus de rendu ne comptent ni téléchargement ni export réussi et ne laissent aucune archive réservée. La passe finale a aussi relevé l’avis faible GHSA-389g-gv7q-r4x8 sur Fastify 5.12.5 ; le dépôt n’emploie pas le schéma `headers.propertyNames` concerné, mais Fastify du site passe en 5.12.7 afin de retirer l’avis. Les types de la Vigie restent inchangés. Les règles réseau réelles, les ACL et les services de l’hôte devront être contrôlés sur l’instance de test avant leur application sur Unraid.

## Correction — Dépendances d’installation d’ONNX Runtime, PR #215, version 1.215.0 (22 octobre 2026)

Les neuf avis npm signalés concernent `adm-zip 0.5.18` (huit) et `sprintf-js 1.1.3` (un), dans la chaîne de l’installateur ONNX. `adm-zip` est imposé en **0.6.1** et `global-agent` en **4.1.3**, ce qui retire `roarr` et `sprintf-js`. Le moteur ONNX reste en **1.22.0** : la comparaison réelle avec 1.30.0 a produit des empreintes CLIP différentes (cosinus ≈ 0,994 sur deux images neutres), incompatibles avec une validation de stabilité des empreintes déjà conservées. Le retrait des modules d’installation de l’image finale et le réglage `skip` sont conservés. Trois tests couvrent un ZIP ordinaire, les noms dupliqués et la sortie par un lien symbolique. Le site et la Vigie doivent être livrés depuis la même révision pour actualiser aussi l’inventaire de veille. Voir [Sécurité](docs/wiki/Sécurité.md) et [Tests](docs/wiki/Tests.md).

## Livraison — Veille des vulnérabilités npm, PR #214, version 1.214.0 (22 octobre 2026)

À la demande du propriétaire, périmètre retenu : bibliothèques du site et de la Vigie, directes et indirectes, limites affichées. L’onglet `/veille` consulte les inventaires de production déclarés dans les deux fichiers de verrouillage embarqués avec la Vigie. OSV est interrogé quotidiennement en arrière-plan ; avis, gravité publiée, versions et correctifs déclarés sont consultables par tous les rôles existants. Cache persistant lié à l’empreinte de l’inventaire, réessai horaire après échec, ancienneté et couverture incomplète explicites. À la demande du propriétaire, les correspondances ouvrent aussi des alertes dédupliquées par avis/bibliothèque/version, persistantes après redémarrage et respectant les classements. Les hautes/critiques passent par les notifications configurées ; une aggravation peut renotifier. La migration 019 garde le suivi, publié atomiquement avec le cache et le journal. Une disparition après vérification complète clôt sans attester de correctif installé ; panne et couverture partielle ne clôturent rien. Complément de D35 validé par le propriétaire le 22 octobre : une alerte haute ou critique active sur le service visé majore la gravité d’un dossier d’un cran maximum, après le calcul habituel, avec justification et liens. La migration 020 distingue cibles courantes et mémoire de déduplication. Les dossiers ouverts sont actualisés par lots ; les dossiers clos gardent leur contexte. Confiance, phases, ouverture de dossier, score d’entité et réponses automatiques restent indépendants de cette pondération. L’inventaire installé, Node.js, le système et les services externes restent hors périmètre. Contrat : [Veille](docs/wiki/Vigie.md#veille-des-vulnérabilités), besoin [BV-34](docs/etudes/vigie-besoins-des-briques.md#bv-34--veille-des-vulnérabilités-des-bibliothèques).

## Correction — Reconnexion à la console de la Vigie, PR #213, version 1.213.0 (22 octobre 2026)

Un ancien retour OIDC ne supprime plus le cookie d’une connexion plus récente. Un retour invalide reste refusé et journalisé (DS30), puis redirige vers `/auth/reprendre`, sans code ni state : recharger cette page ne rejoue plus la tentative et ne multiplie plus les alertes. Le message « Connexion à recommencer » distingue cette situation de l’expiration d’une session après inactivité. Les contrôles de transaction, de second facteur, de droits et de fraîcheur des actions sensibles sont conservés. Tests dans `test/vigie-console.test.js` et `test/vigie-console-vues.test.js` ; détails dans [Vigie](docs/wiki/Vigie.md#session-expirée-et-refus-répétés-au-retour-sur-téléphone).

## Correction — Audit de code et de sécurité hors Vigie, PR #212, version 1.212.0 (21 octobre 2026)

Six chemins sont refermés avec leurs tests de non-régression : une action groupée rejetée est atomique et ne contourne plus la relecture d’une photo programmée ; voir les photos des autres ne permet plus de les lier, offrir, exposer ou dépublier ; seuls les éditeurs écartent un brouillon automatique de Carnet ; une archive privée revérifie droits, résolution et photos encore autorisées ; un retrait d’accord arrête un envoi Instagram avant `media_publish` ; `HEAD` vérifie un téléchargement privé sans produire son JPEG. La migration 064 ajoute le manifeste d’autorisation temporaire des archives.

## Correction — Trois constats de la revue Vigie, PR #211, version 1.211.0 (21 octobre 2026)

Exemptions des blocages automatiques vérifiées sur le réseau réel, /64 IPv6 compris ; reçu transactionnel des suspensions de galerie et reprise des échecs, sans reposer une suspension levée par l’équipe ; masquage par rôle des textes du mode urgence. Les anciennes suspensions ambiguës restent à vérifier manuellement, selon le choix du propriétaire. Migration 063, tests de panne et de redémarrage, contrôle navigateur, banc avant/après. Aucune maquette modifiée. Détail dans [Vigie](docs/wiki/Vigie.md#reprise-des-suspensions-de-galeries-privées).

## Correction — Édition des photos et aperçus, PR #209, version 1.209.0 (21 octobre 2026)

Demande de description sans rechargement de la fiche, confirmation avant de remplacer un texte déjà saisi, Défaire des langues ajoutées dans l’admin v2. Aperçu du filigrane actualisable sur place sans enregistrer, respect de sa case d’activation. Bandeau de prévisualisation étendu aux neuf compositions, toujours réservé au droit `site.apparence` ; visionneuse publique inchangée. Tests ciblés du serveur et parcours navigateur dans les deux admins.

## Préparation — Atelier des saisons, S1a, PR #219, version 1.219.0 (23 octobre 2026)

La branche `feat/saisons-atelier` prépare l’atelier indépendamment des décisions encore ouvertes : compteur de version, enregistrement transactionnel des textes et de l’ordre, contrat de formulaire, calendrier à fuseau explicitement fourni et quatre gabarits communs aux administrations v1/v2. La sélection de photos est bornée et paginée ; une modification concurrente n’est pas écrasée. Les gabarits sont traduits et conçus sans script obligatoire.

**Aucune route ni permission de saison n’est encore activée** : S1b raccordera l’atelier après les réponses du propriétaire sur les droits et le fuseau. La [section 10.1 du plan](docs/etudes/saisons-apres-image.md#101-besoins-de-la-vigie-et-preuves-attendues-par-lot) donne les raccordements Vigie de chaque lot ; S1a ne déclare aucune émission HTTP livrée. La note de version de cette PR décrit cette limite. Le socle #218 n’est pas fusionné ; le lot suivant reste dépendant de sa revue.

Vérifications de S1a : 1 350 tests réussis sans Vigie et 1 350 avec, dont 27 tests du modèle, du calendrier et du formulaire ; 9 tests ciblés de notes, liens et langues. Aperçu isolé : 72 états de rendu et 12 HTML valides, sans défaut relevé ; sélection et ordre transmis sans JavaScript. Le parcours authentifié dans l’admin réel et la persistance HTTP restent à vérifier en S1b.

## Livraison — Vigie en dossiers, PR E #202, version 1.202.0 (21 octobre 2026)

Après D1 #198, D2 #199, D3 #200 et la mise à jour documentaire #201 : extension des lectures personnelles livrée dans la PR #202 après accord du propriétaire. Catégories fermées et volumes par requête/session (BV-33), listes couvertes, enjeu par catégorie, indice des trois réseaux en 24 h, huit fiches comptées par session. Documentation : [étude, section 14.4](docs/etudes/vigie-dossiers.md#144-pr-e--catégories-et-volumes-des-lectures-bv-33), [Vigie](docs/wiki/Vigie.md), [RGPD](docs/wiki/RGPD.md). Les seuils 8/3 et les durées existantes restent inchangés ; pas de recalage sans le mois d’observation prévu.

## Livraison — Périmètre exportable des incidents, PR #204, version 1.204.0 (21 octobre 2026)

Export JSON depuis les incidents clos, confirmation et droit Analyste, audit obligatoire, limites explicites et références conservées après purge des sources. La [section 14.5 de l’étude](docs/etudes/vigie-dossiers.md#145-périmètre-exportable-dun-incident-103) précise le contrat et les écarts aux maquettes. Les durées D38 et le mois d’observation restent des étapes séparées.

## Livraison — Finitions du contrôle navigateur après E, PR #206 (21 octobre 2026)

La planche A4 conserve ses dimensions imprimées et défile dans un aperçu nommé au clavier ou au téléphone. Le sélecteur de langue partagé conserve sa liste native dans une navigation nommée, sans rôle ARIA redondant. Les contrôles de données et la Vigie restent inchangés.

## Livraison — D38, conservation des dossiers ordinaires, PR #207 (21 octobre 2026)

La purge des dossiers clos non incidents suit la durée du journal, soit 183 jours par défaut depuis la dernière activité, au lieu des 395 jours fixes. Les dossiers encore suivis et les incidents sont préservés. La [section 14.7 de l’étude](docs/etudes/vigie-dossiers.md#147-d38--conservation-des-dossiers-ordinaires) donne les sources ANSSI/CNIL, l’application aux dossiers existants et la limite restante : la durée du registre des incidents doit être fixée avec le dossier légal.

## Documentation — Dossier légal de la Vigie (21 octobre 2026)

Le [complément RGPD](docs/wiki/RGPD-Vigie.md) décrit le traitement, les données, les rôles, les durées effectives, la mise en balance et le préexamen AIPD. Le registre et la procédure des violations sont actualisés ; aucune dispense générale d’AIPD n’est maintenue. Les validations et corrections restent explicites (LEG-V1 à LEG-V7), notamment la durée des incidents, la notice publique et le masquage incomplet des IP dans la graine et le titre des dossiers conservés, reproduit sur une base synthétique. Cette étape ne modifie pas le moteur ni l’interface.

## Correction — Masquage des dossiers conservés (LEG-V3, 21 octobre 2026)

Les copies d’adresses échues sont traitées dans la graine, le titre, les textes, les entités et les signaux, avec le masque canonique partagé par la console. Le rattrapage est transactionnel, reprend après redémarrage et préserve la priorité des adresses encore présentes. Les tests couvrent notamment les IPv6 accolées, les anciens réseaux mal formés, les collisions et les fusions/scissions. Les décisions de conservation encore ouvertes restent dans le [dossier légal](docs/wiki/RGPD-Vigie.md) ; voir l’[étude, § 14.9](docs/etudes/vigie-dossiers.md#149-leg-v3--masquage-des-copies-dadresses-conservées).

## Principes

- Front simple : HTML/CSS/JS sans framework ni build, rendu côté serveur, dans l'esprit du prototype.
- Backend unique : tout s'administre après authentification.
- Authentification exclusivement OIDC. Aucun mot de passe stocké ni géré par l'application.
- Les originaux ne sont jamais exposés : seules des variantes redimensionnées, sans EXIF, sont servies.

## Stack

| Rôle | Choix |
|---|---|
| Serveur | Node.js LTS + Fastify |
| Données | SQLite (`better-sqlite3`), migrations SQL versionnées |
| Images | `sharp` (resize, AVIF/WebP, suppression EXIF) |
| QR des cartes de rencontre | `qrcode` (SVG, sans dépendance native) |
| Texte en tracés (QR des vêtements) | `opentype.js` (lit les polices WOFF du site) |
| E-mails (facultatif) | `nodemailer` (SMTP de votre boîte) |
| Gabarits | Eta |
| Auth | `openid-client` (Authorization Code + PKCE) |
| Identité | Zitadel Cloud, Google en IdP externe dans Zitadel |
| Déploiement | image Docker publiée sur `ghcr.io/volfieldd/deux-regards` à chaque fusion sur `main`, hébergée sur Unraid, exposée par Cloudflare Tunnel ; sauvegarde quotidienne de `STORAGE_DIR` |

## Authentification OIDC

Flux : `/auth/login` → Zitadel (connexion locale ou « Continuer avec Google ») → `/auth/callback` → session.

- Client OIDC de type « Web », Authorization Code + PKCE, `state` et `nonce` vérifiés.
- Scopes : `openid profile email` + `urn:zitadel:iam:org:project:id:{projectId}:aud` pour recevoir les rôles.
- Autorisation : rôle de projet Zitadel `admin`, lu dans le claim `urn:zitadel:iam:org:project:roles`. Sans ce rôle : 403, même authentifié.
- Repli sans Zitadel (Google en direct) : même code, autorisation par liste blanche de `sub` avec `email_verified` à vrai.
- Session côté serveur (table `sessions`), cookie `httpOnly` + `Secure` + `SameSite=Lax`, ID régénéré à la connexion, expiration glissante.
- CSRF : jeton synchronisé sur toutes les routes d'écriture de l'admin.
- Déconnexion : suppression de la session + RP-initiated logout (`end_session_endpoint`).
- Config par variables d'environnement : `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROJECT_ID`, `OIDC_ORG_ID`, `OIDC_REDIRECT_URI`, `OIDC_ADMIN_ROLE`, `OIDC_ALLOWED_SUBS` (repli).
- La double authentification et la politique de connexion se règlent dans Zitadel, pas dans l'application.

## Modèle de données

Schéma dans `server/db/migrations/` (fichiers `NNN_*.sql` appliqués dans l'ordre, jamais modifiés après coup).

| Table | Contenu |
|---|---|
| `authors` | nom, adresse (slug), bio, `oidc_sub` (lien avec le compte) |
| `categories` | séries : nom, adresse, ordre |
| `photos` | titre, adresse, série, auteur, lieu, date, légende, statut (brouillon / publiée), ordre, original, dimensions, nom du fichier d'origine, empreinte SHA-256, clé de variantes, exclusion du filigrane, date de première publication, ville (nom, pays, centre ; origine GPS ou manuelle), présence sur la carte |
| `settings` | réglages clé → JSON : textes, droits (FR, EN, DE), ouverture, thème, filigrane et EXIF, Instagram |
| `sessions` | empreinte du jeton, `sub`, nom, rôles, CSRF, expirations |
| `timestamps` | preuves d'antériorité RFC 3161 |
| `stats_days`, `stats_pages`, `stats_photos`, `stats_sources` | statistiques anonymes agrégées par jour |
| `instagram_account`, `instagram_posts` | compte connecté (jeton chiffré), file et historique des publications |

## Arborescence

```
server/            serveur Fastify
  app.js           assemblage : plugins, CSP et en-têtes, rendu Eta, fichiers statiques
  config.js        variables d'environnement (voir docs/wiki/Configuration.md)
  routes/          public.js (site), admin.js (admin), media.js (images), brand.js (emblème, favicon)
  auth.js, oidc.js, sessions.js, ratelimit.js   connexion OIDC, sessions, CSRF, limites
  repo.js, admin-repo.js                         accès aux données (lecture publique, admin)
  images.js, media.js, variants.js, watermark.js import, variantes, filigrane, EXIF
  proofs.js, timestamp.js                        preuves d'antériorité
  stats.js, charts.js                            statistiques anonymes
  instagram.js                                   publication sur Instagram
  rights.js                                      textes de la page Droits d'utilisation (FR, EN, DE)
  themes.js, brand.js, help.js                   thèmes, identité, aide intégrée
  db/              migrations SQL, seed de démonstration, CLI (migrate, seed, variants)
views/             gabarits Eta du site ; views/admin/ pour l'admin
public/            CSS et JS du site (css/, js/), de l'admin (admin/), thèmes (themes/)
assets/            polices, certificats de l'autorité d'horodatage
seed/              12 photos et données de démonstration
docs/              aide intégrée (aide/), sources du wiki (wiki/), spécifications, audits
e2e/               tests navigateur (Playwright, conteneur officiel)
test/              tests node:test
deploy/unraid/     paquet de déploiement Unraid
storage/           données (hors Git) : base SQLite, originals/ (jamais servi), variants/
```

## Phases

### 0. Socle (fait)
- Projet Node, Fastify, SQLite, migrations, scripts `dev` / `start` / `test`.
- Seed avec les 12 photos et les données du prototype.
- Fichier `.env.example`, `.gitignore` (dont `storage/` et la base).

### 1. Front public, d'après le mix (fait)
- Ouverture plein cadre avec fondu et vignettes (photos choisies dans les réglages).
- Filtre « deux regards » : les deux / Sébastien / Julien.
- Index des séries en grand avec aperçu au survol.
- Grille en quinconce, numérotation `N°04 · Rue · J`.
- Page photo `/photo/:slug` : visionneuse noire, précédente/suivante, clavier, swipe, légende.
- Pages `/serie/:slug`, `/auteur/:slug`, `/a-propos`.
- Le site reste lisible sans JS ; le JS ajoute le fondu, le swipe et le filtre sans rechargement.
- Polices auto-hébergées (@fontsource), CSP stricte sans ressource tierce.

### 2. Images (fait)
- Import : original vers `storage/originals/`, variantes générées, EXIF supprimé, rotation EXIF appliquée avant suppression.
- `srcset` + `sizes`, lazy-loading, dimensions explicites (pas de saut de mise en page).
- Dissuasion : clic droit et glisser désactivés sur les images, en-tête `Cache-Control` long sur les variantes.

### 3. Auth OIDC (fait)
- Routes `/auth/login`, `/auth/callback`, `/auth/logout` (POST + CSRF), préhandlers `requireAdmin` et `verifyCsrf`.
- Transaction (state, nonce, PKCE) dans un cookie signé de 10 min ; `next` limité aux chemins locaux.
- Rôles lus dans l'ID token, complétés par userinfo si Zitadel ne les y met pas.
- Session : jeton aléatoire dans le cookie (`__Host-` en HTTPS), seule son empreinte SHA-256 en base ; 8 h glissantes, 24 h au plus (un rôle retiré cesse de valoir le lendemain au plus tard).
- Rôle accepté seulement s'il vient de l'organisation `OIDC_ORG_ID` ; `next` normalisé par l'analyseur d'URL (pas de redirection ouverte) ; 30 passages par `/auth/*` et par IP sur 10 min ; code et state masqués dans les journaux.
- `/admin` minimal (identité + déconnexion) en attendant la phase 4.
- Tests de bout en bout contre un faux fournisseur OIDC : rôle absent → 403 sans session, `state` invalide → refus, code rejoué, session expirée → redirection, régénération, déconnexion.

### 4. Admin (fait)
- Photos : import multiple (glisser-déposer ou sélecteur), en brouillon ; édition avec validation ; publier / dépublier ; réordonnancement par glisser-déposer, avec boutons ↑ ↓ en alternative clavier et sans JS ; recherche et filtres ; suppression confirmée dans la page (original, variantes et entrée de l'ouverture).
- Séries : création, renommage, adresse, ordre, suppression bloquée tant qu'elles contiennent des photos.
- Auteurs : nom, adresse, bio, lien avec le compte OIDC (`sub` affiché sur le tableau de bord) ; l'auteur lié est proposé par défaut à l'import.
- Réglages : nom du site (repli sur `SITE_NAME`), accroche, introduction, à propos, photos de l'ouverture (publiées seulement).
- Import : 60 Mo (90 Mo depuis la phase 11) et 120 mégapixels au plus par fichier, 50 fichiers par envoi, format vérifié par décodage (JPEG, PNG, WebP, TIFF, HEIF), jeton CSRF exigé avant le premier fichier, orientation EXIF appliquée aux dimensions.
- Variantes : `/media/` ne sert que les photos publiées ; aperçu des brouillons sous `/admin/media/` (session admin).
- Connexion locale de test (`LOCAL_AUTH_TOKEN`), interdite en ligne.
- Tests navigateur (`e2e/`, conteneur Playwright) : rendu bureau et mobile, filtres, visionneuse, sans JS, admin et parcours complet d'une photo.

### 4 ter. Filigrane et métadonnées (fait)
- Filigrane texte (variables {auteur}, {annee}, {site}, {titre}, polices du site) ou logo, 9 positions ou mosaïque, opacité, taille, marge, tailles concernées ; exclusion par photo ; aperçu sans enregistrer.
- EXIF des images servies : aucune (défaut), droits, prise de vue (sans GPS ; date et heure seulement pour une photo qui montre son heure sur le site, depuis la migration 052 ; boîtier, objectif et exposition seulement pour une photo qui montre sa prise de vue, depuis la migration 060), tout l'original.
- Empreinte des réglages dans le nom des variantes : cache long sans image périmée, bascule sans image cassée ; recalcul en arrière-plan avec progression.
- Spécification : [docs/specs/filigrane-et-exif.md](docs/specs/filigrane-et-exif.md). Wiki : [docs/wiki/](docs/wiki/).

### 4 quater. Preuves d'antériorité et droits (fait)
- Empreinte SHA-256 de chaque original, horodatée RFC 3161 (FreeTSA par défaut, autorité qualifiée eIDAS possible), reprise automatique ; téléchargement et vérification de la preuve, vérifiable avec OpenSSL sans le site.
- Mentions IPTC (XMP) dans les modes EXIF signés ; page publique `/droits`.
- Spécification : [docs/specs/preuves-et-droits.md](docs/specs/preuves-et-droits.md).

### 5. Mise en ligne (fait)
- Image Docker en deux étapes, conteneur en lecture seule, utilisateur sans droits ; exposition par Cloudflare Tunnel (`cloudflared`), sans Caddy.
- Données dans un dossier de l'hôte monté explicitement ; refus de démarrer sans montage ; `down -v` sans effet.
- Sauvegarde quotidienne (instantané SQLite contrôlé, originaux supprimés effacés des sauvegardes après 90 jours), restauration documentée.
- `sitemap.xml`, `robots.txt` ; Open Graph et passe d'accessibilité faits plus tôt.
- Guide : [docs/wiki/Déploiement.md](docs/wiki/Déploiement.md).

### 6. Apparence et identité (fait)
- Thèmes déclarés dans `server/themes.js`, feuilles de variables dans `public/themes/` ; Atelier (d'origine), Nicephos nuit et jour (d'après le logo).
- Admin → Apparence : choix du thème, aperçu réservé aux admins, emblème (masque coloré par le thème, favicon générée), sous-titre.
- Guide : [docs/wiki/Apparence-et-thèmes.md](docs/wiki/Apparence-et-thèmes.md).

### 7. Ergonomie de l'admin (fait)
- Audit d'ergonomie (PR #12, [docs/audit-ergonomie-2026-10/](docs/audit-ergonomie-2026-10/README.md)), puis import suivi photo par photo, lot complété sur une page, sélection multiple, séries en cartes (#13), envoi dès le choix des fichiers, date de l'appareil (#14).
- Refonte « Chambre noire » de l'admin : maquettes (#17, [docs/design-2026-10/](docs/design-2026-10/README.md)), police Jost, modes sombre et clair, photothèque avec inspecteur (#18).

### 8. Statistiques anonymes (fait)
- Pages et photos vues, visiteurs par jour, sites d'origine ; sans cookie, sans IP conservée, Do Not Track et GPC respectés, effacement à 25 mois (#19). Mention publique sur `/droits`.

### 9. Publication sur Instagram (fait)
- API officielle « Instagram API with Instagram Login » : file d'attente, créneaux horaires, modèles de légende, cadre et filigrane par photo, jeton chiffré (#20).
- Mise en file automatique **par série**, aucune par défaut (#21).

### 10. Admin sur iPhone, finitions (fait)
- Audit sur iPhone ([docs/audit-iphone-2026-10/](docs/audit-iphone-2026-10/README.md)) ; lot en cartes sur téléphone, « Ouvrir la fiche », cibles de 44 px, projet e2e `iphone` en WebKit (#22).
- Vignettes de l'ouverture en cadre 3:2, photo entière ; nom long dans la barre latérale (#23).
- Droits d'utilisation en français, anglais et allemand (`/droits`, `/en/droits`, `/de/droits`), textes par défaut affichés et rétablissables dans Réglages (#24).
- Site public : retour à la série à l'endroit quitté depuis une photo (#25).

### 11. Vitesse de l'import (fait)
- Mesure : une photo de 24 Mpx mettait ~6,5 s à calculer (original décodé six fois, sharp sur un seul thread sous glibc, une photo à la fois).
- Décodage unique de l'original puis variantes dérivées et encodées en parallèle ; `IMAGE_THREADS` (4) et jemalloc dans l'image ; `IMPORT_CONCURRENCY` (2 photos à la fois) : 1,5 s par photo, ×7 sur un lot.
- Envoi : 3 photos à la fois au plus et 100 Mo en cours d'envoi au plus ; 90 Mo par fichier (une requête par photo, sous le plafond de 100 Mo par requête de Cloudflare).

### 12. Galerie par ordre de publication (fait)
- Sélecteur « Ordre : Sélection · Plus récentes » au-dessus de la grille, cumulable avec les filtres, suivi par la visionneuse ; `?ordre=recentes`.
- Colonne `photos.published_at` (migration 009), posée par déclencheurs à la première publication ; photos déjà publiées : date d'import.

### 13. Visionneuse : légendes longues (fait)
- Plus d'ascenseur intérieur : légende repliée à 3 lignes avec « Lire la suite », la page défile ; image ajustée au premier écran ; titres longs coupés à la ligne ; flèches sous le texte sur téléphone.

### 14. Instagram dans les limites de l'API (fait)
- Pas d'offre payante de l'API : budget réglable (Prudent par défaut : 25 publications / 24 h, 60 min d'écart, 100 appels / h ; Limites de Meta ; Personnalisé), quota réel lu avant chaque envoi, pause sans essai consommé quand Meta signale une limite, consommation affichée, « Publier maintenant » refusé hors budget ; vérifications espacées (≈ 6 appels par publication au lieu de 32).
- Journal des appels `instagram_calls` (migration 010), dates et types seulement, 7 jours.

### 15. Statistiques : carte des visiteurs par pays (fait)
- Pays transmis par Cloudflare (`CF-IPCountry`, cru derrière le proxy de confiance seulement), compté par visiteur unique du jour (`stats_countries`, migration 011) ; aucune géolocalisation par le site, aucune IP conservée.
- Mappemonde Natural Earth embarquée (`public/admin/carte-monde.svg`, centres des pays dans `server/pays-centres.json`, générés par `scripts/carte-monde.mjs`), bulles proportionnelles, liste des 10 premiers ; mention publique « Mesure d'audience » complétée (FR/EN/DE).

### 16. Ville des photos, préparation de la carte (fait)
- Liste des villes GeoNames (CC BY 4.0) embarquée (`server/geo/villes.tsv`, `scripts/villes.mjs`) ; recherche au fil de la frappe et ville d'une position GPS (`server/geo/cities.js`).
- Champ Ville (fiche, photothèque), ville proposée d'après le GPS à l'import et pour les photos existantes (`server/geo/locate.js`) ; seule la ville est gardée ; case « Afficher sur la carte » décochée par défaut, actions groupées (migration 012).

### 17. Page publique « Carte » (fait)
- Réglage `map_page` (faux par défaut) : `/carte` en 404 pour les visiteurs tant qu'elle n'est pas publiée, aperçu pour les auteurs connectés ; lien « Carte » dans le menu (FR / EN / DE sur `/droits`) et entrée de `sitemap.xml` une fois publiée ; vue comptée dans les statistiques (`carte`).
- Fond `public/carte-terre.svg` (symboles sans couleur : le thème donne l'encre) et réglages de la projection (`server/geo/projection.json`, appliqués par `server/geo/projection.js`), générés par `scripts/carte-monde.mjs` ; villes placées côté serveur.
- Vignettes rondes dans le SVG (sans JS : carte fixe, liens vers la liste des lieux) ; `site.js` : zoom par le viewBox (× 40 au plus), taille des vignettes constante, regroupement des vignettes qui se chevauchent, pincement, Ctrl + molette, glisser.

### 18. Carte et villes plus précises (fait)
- Villes : toutes les communes de France (ADM4 du fichier FR de GeoNames) et les localités de plus de 500 habitants ailleurs (~250 000 lieux) ; noms français des villes de plus de 30 000 habitants ; classement pondéré par la population ; colonnes compactes et index des débuts de mots (~55 Mo, quelques ms par recherche), liste chargée au démarrage en production.
- Fond de carte en trois niveaux : 1:110m (monde, frontières), 1:50m chargé au premier zoom, tuiles 1:10m (`public/carte-tuiles/`, 157 fichiers) de la zone visible au-delà de × 8 ; zoom jusqu'à × 40 ; fichiers `.br` / `.gz` servis tels quels (`preCompressed`).

### 19. Site en trois langues (fait)
- `server/i18n.js` : textes de l'interface FR / EN / DE, repli des textes des auteurs (`pick`), détection de la langue (pays Cloudflare, `Accept-Language`), adresses préfixées (`/en`, `/de`).
- Pages publiques enregistrées trois fois (préfixe vide, `/en`, `/de`) ; arrivée sur une page française redirigée selon le choix (cookie `langue`, posé par `/langue/:lang`) ou la détection, jamais pour les robots ; `/droits/en` et `/droits/de` redirigées vers `/en/droits`, `/de/droits` ; `hreflang`, `x-default`, `og:locale`, sitemap avec les trois langues.
- Traductions facultatives (migration 013) : photos (titre, légende, lieu), séries, biographies ; réglages `tagline_en`, `intro_de`… ; champs repliés dans l'admin (`views/admin/_tr.eta`) ; sélecteur à drapeaux (`views/langs.eta`, `public/flags/`).

### 20. Propositions de traduction (fait)
- `server/translate.js` : client LibreTranslate (`TRANSLATE_URL`, `TRANSLATE_API_KEY` facultative), délai borné, erreurs expliquées ; `POST /admin/traduction`.
- Bouton « Proposer une traduction » sous chaque champ anglais et allemand (texte français, sinon l'autre traduction), proposition à relire, « Annuler ».
- Conteneur `libretranslate/libretranslate:v1.9.6` dans la pile Unraid (réseau interne, modèles fr / en / de dans un volume) et en profil `traduction` dans `compose.yaml`.

### 21. Likes Instagram dans l'admin (fait)
- Relevé quotidien des likes et commentaires des posts publiés depuis le site (`syncEngagement`, après 6 h à Paris, 1 à 3 appels, dans le budget), historique par jour (migration 014, `instagram_engagement`).
- Fiche photo : chiffres et courbe ; page Instagram : « Les plus aimées sur Instagram », « Relever maintenant » (10 minutes au moins entre deux relevés).

### 22. Rencontres : « je vous ai photographié » (fait)
- Page `/bonjour` (trois langues) : référence de carte (code de contrôle HMAC), ou date et lieu ; recevoir la photo, accord ou refus, message ; anti-abus (limite par adresse, champ piège) ; migration 015 (`encounters`, `encounter_events`, `encounter_photos`, lettre des cartes `authors.card_prefix`).
- Admin « Rencontres » : liste, fiche, photos liées, carte signée (photo gardée dans la base), refus qui bloque la publication et « Appliquer le refus » (brouillon, file Instagram) ; purge à 12 mois.

### 23. Cartes à imprimer et photo offerte (fait)
- Planches A4 (`/admin/rencontres/cartes`) : paires « pour nous » / « pour eux » au format carte de visite, cinq par feuille, d'un seul côté ; numérotées (QR et code de contrôle uniques, numéros réservés dans `settings.cards_printed`) ou génériques (QR vers `/bonjour`, numéro au tampon) ; textes dans `server/cards.js`.
- Photo offerte : lien privé `/pour-vous/<jeton>` (30 jours, révocable, compteurs ; migration 016), page dans la langue de la personne, JPEG 2048 px (jamais l'original, EXIF « usage personnel »), message prêt à envoyer (mailto) dans sa langue.

### 24. QR des vêtements (fait)
- `/bonjour/J` : QR générique d'un photographe (sans numéro), demande attribuée à l'auteur ; la date et le lieu restent demandés.
- Auteurs → « QR pour les vêtements » : compositions vectorielles (`server/textile.js`, texte converti en tracés, logo d'Apparence intégré à la couleur de l'encre) verticale (dos, sac), logo seul (poitrine, casquette), écusson et QR seul, encre noire (textile clair) ou blanche (textile foncé, carré blanc évidé), en SVG ou PNG transparent ; QR en correction H avec sa marge.

### 25. App Rencontre sur le téléphone (fait)
- `/admin/rencontre` : web app installable (manifeste, plein écran) ; position arrondie (Permissions-Policy limitée à cette route), photo de repère, consentement en trois langues, signature au doigt, majorité ou parent ; numéro suivant du photographe (partagé avec les cartes) ; écran « Merci » avec le QR de la page de la personne ; récapitulatif par SMTP (`server/mailer.js`, `SMTP_URL`, `MAIL_FROM`) ou mailto ; migration 017.
- Suite possible : mode hors ligne (enregistrement différé).

### 26. Confidentialité (RGPD), premier volet (fait)
- Page `/confidentialite` en trois langues (`server/privacy.js`) : responsables conjoints, données par traitement, durées, destinataires (Cloudflare, Instagram si accepté, messagerie), cookies, sécurité (deux facteurs et disque chiffré annoncés seulement une fois cochés dans Réglages), droits et CNIL ; liens en pied de page, sur `/bonjour`, dans l'app et sur les cartes (via le QR).
- Durées automatisées : photo de repère 6 mois ; accord ou refus tant qu'une photo liée existe puis 5 ans ; originaux supprimés effacés des sauvegardes après 90 jours (`BACKUP_DELETED_DAYS`, garde-fou si le dossier est vide).
- Suite : export des données d'une personne et effacement complet (photos comprises), chiffrement des champs sensibles, registre des traitements, analyse d'impact, procédure de violation, accord entre responsables conjoints.

### 27. Confidentialité (RGPD), deuxième volet : droits (fait)
- `/bonjour` : « Vos données » (copie ou effacement) ; migration 019 (`rights_request`, `rights_requested_at`, `rights_done_at`, `anonymized`) ; badge avec échéance d'un mois.
- Export ZIP (`server/zip.js`, sans dépendance) ; effacement avec suppression des photos sur demande, refus gardé sans identité, rappel des posts Instagram.

### 28. Confidentialité (RGPD), troisième volet : chiffrement et documents (fait)
- `server/vault.js` : AES-256-GCM, clé `DATA_KEY` (HKDF) ; champs des rencontres (textes, position, historique, images) chiffrés à l'écriture, déchiffrés à la lecture ; données existantes chiffrées au démarrage ; état dans Réglages et sur `/confidentialite`.
- Wiki [RGPD](docs/wiki/RGPD.md) : registre des traitements, accord entre responsables conjoints, analyse d'impact simplifiée, procédure de violation, liste des actions restantes.

### 29. Accord par session, visage sur le nom (fait)
- Un accord couvre les photos de son photographe prises le jour de la session (date EXIF ; `session_day` corrige une horloge décalée), sauf exclusions (`encounter_exclusions`, migration 020) ; fiche d'une photo : « Personnes rencontrées » (même session ou liées) ; un refus reste ciblé sur les photos liées ; durée de conservation de l'accord tant qu'une photo de la session ou liée existe.
- Photo de la personne (visage) : dans l'app ou ajoutée à la fiche, vignette ronde dans la liste, la fiche et la fiche photo ; gardée avec l'accord (sinon 6 mois) ; consentement, page Confidentialité et registre mis à jour.

### 30. Instagram suit les accords (fait)
- Instagram suppose le site : refuser le site, c'est refuser Instagram (formulaires `/bonjour`, app, carte ; anciens accords lus sans Instagram).
- Photo bloquée pour Instagram, sans confirmation possible, si une personne liée ou de la session (non exclue) refuse ou n'a pas accepté Instagram : entrée dans la file refusée, file vidée à chaque changement d'accord et avant chaque créneau, contrôle juste avant l'envoi ; fiche photo « Instagram bloqué » et « Pas sur cette photo ».

### 31. Parcours de l'admin autour de la sortie (maquettes validées le 14 octobre 2026)
1. (fait) Mots (Sortie, Personne, Accord, Carte d'accord, Carte du monde, « Où »), menu en quatre groupes (Travailler, Publier, Sur le terrain, Réglages), page « Sur le terrain » (app, cartes d'accord, QR des vêtements avec logo, une seule composition), états lisibles par un daltonien (forme + mot, palette bleu / jaune / vermillon).
2. (fait) « Aujourd'hui » en liste de choses à faire, triée par urgence.
3. (fait) Sorties (une par photographe et par jour, découpables par une heure de coupure), détection des visages locale (sans reconnaissance), état par usage « prête / à vérifier / bloquée » ; « à vérifier » demande une confirmation explicite, gardée dans l'historique .
   - (fait) Fiche Personne pour plusieurs rencontres (un accord par sortie, un refus vaut pour tout, rapprochement par e-mail confirmé à la main, jamais par le visage).
4. (fait) Fiche photo en rubriques, accueil « Terrain » sur le téléphone (nouvelle rencontre, montrer mon QR, ma sortie du jour).

### 32. Personnes, signature Instagram, admin en trois langues (fait)
- Fiche Personne (plusieurs rencontres, refus étendu, rapprochement par adresse, export et effacement de la personne).
- Signature Instagram du photographe, sous la légende, retirable par photo.
- Admin en français, anglais, allemand ; préférence par photographe ; aide traduite en anglais et en allemand (docs/aide/en, docs/aide/de).

### 33. Retours d'un ami allemand et série proposée (fait)
- Impressum / mentions légales en pied de chaque page ; aide traduite ; ergonomie de la fiche ; « J'aime » et « Signaler » sur la page photo.
- Série proposée (maquettes validées le 15 octobre 2026) : désactivée par défaut ; modèle CLIP (ONNX allégé, ≈ 90 Mo) téléchargé à l'allumage dans le dossier des données, empreinte SHA-256 vérifiée ; empreinte visuelle de chaque photo calculée sur le serveur. Pour un brouillon dont la série n'a pas été choisie à la main, chaque série d'au moins 3 photos rangées reçoit la moyenne des ressemblances de ses 3 photos les plus proches ; une autre série est proposée si elle ressemble nettement plus (deux si elles sont presque à égalité). Ressemblance par série, quel que soit le photographe. Vue rapide, fiche, sortie, filtre et Aujourd'hui ; une photo à la fois, jamais de « tout accepter ».
- Partager (maquettes validées le 15 octobre 2026) : menu du téléphone sur téléphone (Signal, Instagram… y sont, faute de lien web), fenêtre avec réseaux, lien à copier et QR sur ordinateur ; pas de LinkedIn, Mastodon ni Telegram ; partages comptés anonymement.
- Rôles et permissions (RBAC), cadrage validé le 15 octobre 2026 :
  - les rôles vivent dans la base du site, l'IdP ne fait que transporter l'identité ;
  - un photographe ne voit que ses photos, ses sorties et ses personnes (accord par sortie et par photographe) ; il supprime ses photos (elles restent sa propriété) et voit les réclamations et demandes RGPD qui le concernent (droit à part) ; export et effacement restent à l'administrateur ;
  - publier (site et Instagram) est un droit à part, donné pour l'instant à l'administrateur et au modérateur ;
  - le modérateur publie, dépublie, traite les signalements et fait remonter au photographe les éléments à traiter, sans accès aux données personnelles ;
  - quatre rôles au départ (Administrateur, Photographe, Modérateur, Relecteur), rôles sur mesure plus tard ;
  - étapes 1 (socle : permission déclarée par route, fermé par défaut), 2 (comptes et rôles en base, compte en attente, garde-fou `ADMIN_SUBS`, journal, menu selon les droits), 3 (portée « les miennes », rôle Photographe) et 4 (interface selon les droits, textes seuls pour modérateur et relecteur, remarques adressées au photographe) faites ; reste l'étape 5, rôles sur mesure, plus tard.
- Circuit de publication, décidé le 15 octobre 2026 : modifier une photo publiée relève du photographe (droit réglable par le modérateur) ; le modérateur ne retouche pas, il renvoie avec une remarque ; Instagram : le photographe propose, le modérateur valide (réglable : publier seul) ; programmer dès le départ ; « Aujourd'hui » et e-mail au choix de chacun ; proposer et valider par lot ; un signalement ne dépublie rien tout seul.
  - site : fait (proposer, À valider, programmer, renvoyer, dépublier avec raison, réglages par photographe, e-mails) ;
  - Instagram : à faire.
- Écarté : repérer les personnes de dos (pas d'obligation de consentement ; une personne de dos peut toujours être enregistrée si elle le souhaite).

## Côté Zitadel (à faire une fois)

1. Créer une organisation et un projet « site photo » avec un rôle `admin`.
2. Créer une application OIDC « Web », méthode d'authentification « Code » (client_secret_basic ; l'application envoie aussi PKCE), redirect `https://<domaine>/auth/callback` (et `http://localhost:3000/auth/callback` en dev), post-logout redirect vers le site.
3. Ajouter Google comme IdP externe (client OAuth Google à créer dans Google Cloud).
4. Donner le rôle `admin` à Sébastien et Julien ; désactiver l'inscription libre.
5. Reporter l'ID de l'organisation dans `OIDC_ORG_ID`.
6. Une fois le domaine choisi : ajouter `includeSubDomains` à HSTS si tous les sous-domaines sont en HTTPS.

## Feuille de route

**Thèmes par rubrique — PR 188, version 1.188.0 (implémenté, en attente de fusion et de déploiement).** Neuf choix : les trois présentations historiques et six chambres noires ; thème général et exceptions par rubrique dans les deux admins, aperçu personnel, retour historique, galerie distincte, ouverture manuelle et mode calme. Aucun changement d’apparence à l’installation. Dans ce nouveau système, les Carnets restent disponibles avec un thème général V1 grâce au rendu V2 ; les restrictions V1 mentionnées plus bas décrivent le fonctionnement historique. Les pages `/galerie` et `/series` sont livrées (point 8) : ouvertes quand la rubrique Galerie est en V2, en V3 ou en chambre noire. [Fonctionnement](docs/themes-par-rubrique/README.md) et [validation, captures et limites](docs/themes-par-rubrique/validation.md). Ces contrôles ciblés ne constituent pas une certification RGAA/RGESN ni une validation sur Safari réel.

Fait côté nom et domaine : **Nicephos**, en ligne sur `https://www.nicephos.art` (toutes les autres adresses y sont redirigées par Cloudflare, voir [Déploiement](docs/wiki/Déploiement.md)).

À faire, par ordre de priorité :
1. Essai de l'admin sur un vrai iPhone (clavier ouvert, barres de Safari), après le déploiement de #22.
2. Audit iPhone, lots restants : mode « Sélectionner » dans la photothèque (4), page Séries au toucher (5), fiche photo raccourcie avec « Enregistrer » collant (6).
3. HSTS : ajouter `includeSubDomains` si tous les sous-domaines restent en HTTPS.
4. `compose.yaml` générique : avec `TRUST_PROXY` par défaut (adresses privées) et le port ouvert sur le réseau local, un poste du réseau peut fausser `X-Forwarded-For` ; fixer `TRUST_PROXY` à l'adresse du tunnel comme sur Unraid (documenté dans Déploiement).
5. Petites incohérences relevées lors de la relecture de l'aide (octobre 2026) :
   - fiche photo : l'indication du champ Date (« AAAA-MM ou AAAA-MM-JJ ») ne dit pas que « oct. 2026 » ou « 10/2026 » sont aussi compris ;
   - Instagram : jeton expiré mais lisible, la page affiche « Connecté » sans bouton pour se reconnecter directement ;
   - Instagram : un seul libellé pour le lien vers le post (« voir le post ↗ » sur la fiche, « Voir sur Instagram ↗ » dans l'historique) ;
   - photothèque : deux liens d'aide (« Aide sur cette page » et « Aide »).
6. Revue du 16 octobre 2026 ([docs/revue-2026-10-16.md](docs/revue-2026-10-16.md)), décisions à prendre :
   - avant la mise à jour : vérifier dans le `.env` de production `OIDC_ORG_ID` (puis refuser le démarrage sans lui), `PUBLIC_URL` (désormais obligatoire) et `SMTP_URL` (STARTTLS exigé hors relais local, sinon `?requireTLS=false`) ; prévoir l'espace du `VACUUM` unique au premier démarrage ;
   - dépôt et image : épinglage des images de base par digest, protection de `main`, `sha_pinning_required`, cosign ; onnxruntime-node ≥ 1.30 après revalidation de YuNet, CLIP et Florence-2 et traitement des empreintes CLIP existantes (écart reproduit le 22 octobre ; dépendances d’installation corrigées séparément) ; `UV_THREADPOOL_SIZE` à mesurer ;
   - Unraid : UID dédié à la place de 99:100 ; healthcheck du modèle de sauvegarde ;
   - YuNet et CLIP dans un processus à part, comme Florence-2 ; valider les réglages (20 descriptions en attente, 5 min par calcul, visages à 1 600 px et tolérance 0,8) ;
   - cartes : codes à 5 caractères pour les nouvelles cartes, et ne pas lever un refus signé même avec un bon code ;
   - modérateur : moyen de dépublier une page de voyage (route sous `photos.publier` ou état « proposé ») ;
   - page tendue à la personne : mode kiosque ou flèche « ← » ;
   - RGPD : administrateur en copie dès la première relance ; trace anonyme d'un refus qui garde sa partie de la journée ; chiffrés liés à leur colonne (AAD, `enc2`) ;
   - purge de Cloudflare par API (jeton) lors d'une dépublication ou d'un refus ; script de restauration d'une seule photo ;
   - import lancé dès le dépôt de fichiers, ou après un clic sur « Envoyer » ; `<h2>` dans `<summary>` dans tout l'admin.
7. Journalisation de sécurité et détection d'incidents (demandé le 17 octobre 2026) : étude dans [`docs/etudes/journalisation-securite.md`](docs/etudes/journalisation-securite.md), décisions D1 à D7 validées le 17 octobre 2026 ; composant isolé « Vigie » (conteneur, base et console à part, derrière Cloudflare Access et Zitadel) décrit dans [`annexe-vigie-architecture.md`](docs/etudes/annexe-vigie-architecture.md), réglages gratuits de Cloudflare dans [`annexe-vigie-cloudflare.md`](docs/etudes/annexe-vigie-cloudflare.md) ; Vigie **facultative** ; console `vigie.nicephos.art`, droits à quatre rôles et deux clés (Zitadel + Vigie), origine du signal dans chaque alerte, événements de Zitadel Cloud lus par l'API, alertes sur Signal (paquet prêt : [`deploy/unraid/signal/`](deploy/unraid/signal/README.md)) ; plan en phases 0 (hors code) à E ; décisions D8 à D12 et D16 prises le 17 octobre 2026, D13 à D15 (Cloudflare) à prendre. Phase 0 faite (17 octobre 2026). **Phase A faite** : le site émet ses événements de sécurité vers la Vigie (`server/securite/`, migration 048, `npm run test:vigie`) ; revue de code et de sécurité de la phase A le 17 octobre 2026 ([compte rendu](docs/revue-vigie-phase-a-2026-10-17.md)) : gravité haute corrigée (migration 049), points N1 à N10 arbitrés le 17 octobre 2026 (N1, N2, N5 à N8 faits, migration 050) ; **phase B faite** (17 octobre 2026) : conteneur de la Vigie (`vigie/`, `Dockerfile.vigie`, profil Compose `vigie`), réception signée, base chaînée, décisions signées appliquées par le site, interrupteurs, ligne de commande, lecture de Zitadel (210 types suivis), sauvegarde ; guide [Vigie](docs/wiki/Vigie.md) ; revue de code et de sécurité de la phase B le 17 octobre 2026 ([compte rendu](docs/revue-vigie-phase-b-2026-10-17.md)) : gravité haute corrigée, points NB1 à NB7 à arbitrer ; NB1 à NB7 acceptés ; **recadrage** du 17 octobre 2026 ([`docs/etudes/recadrage-vigie-edge-wake.md`](docs/etudes/recadrage-vigie-edge-wake.md)) : concepts de marlinOS repris (détection en bordure, quorum entre sources, pipeline WAKE), phase C coupée en C1 (moteur d'entités et quorum), C2 (règles Sigma et détecteurs), C3 (capteur en bordure Cloudflare Worker) ; décisions D17 à D23 prises le 17 octobre 2026 (Sigma, quorum, Worker, listes de menaces, verdicts agrégés, OCSF en phase E) ; **phase C1 faite** : moteur d'entités, quorum entre sources, exceptions à source unique, alertes, modes par règle, réponses automatiques prudentes (`vigie/moteur.js`, `vigie/poids.js`) ; **phase C2 faite** : règles Sigma (`vigie/regles/`), détecteurs comportementaux, listes de menaces gratuites, contrôle des rôles sur les sauvegardes du site, résumés par adresse côté site ; revue de code et de sécurité de C1 et C2 le 17 octobre 2026 ([compte rendu](docs/revue-vigie-phase-c-2026-10-17.md)) : gravités critique et haute corrigées (migration 004 de la Vigie), points NC1 à NC7 arbitrés le 17 octobre 2026 et faits (sauvegardes du site obligatoires, clôture des alertes sans suite, délai et expiration des règles, abaques de capacité [`docs/etudes/vigie-capacite.md`](docs/etudes/vigie-capacite.md), deux horodatages) ; **phase C3 faite** (17 octobre 2026) : capteur en bordure Cloudflare (`bordure/worker.js` : blocages appliqués avant le site depuis une liste signée réservée à la bordure, en-têtes signés vérifiés par le site, constats lus dans Analytics Engine par la Vigie, source « bordure » du quorum), empreintes TLS observées avant d'en faire des alertes ; essai sur l'instance de test d'abord ; revue de code et de sécurité de C3 le 17 octobre 2026 ([compte rendu](docs/revue-vigie-phase-c3-2026-10-17.md)) : gravité haute corrigée (calcul du Worker), points NC3-1 à NC3-6 arbitrés le 17 octobre 2026 (erreurs vues en bordure en contexte, battement du Worker) ; **phase D, première partie (D1) faite** : notifications Signal et e-mail de secours (plafond horaire, synthèse, canal en échec signalé), résumé signé des alertes pour l'admin du site (`GET /v1/resume`), diagnostic `bordure` pour l'essai ; maquettes de la console (D2), console et affichage dans l’admin (D3) également faits côté code (entrée Sécurité, résumé et bandeau critique). **Dossiers et phases d'attaque** (20 octobre 2026) : note de conception [`docs/etudes/vigie-dossiers.md`](docs/etudes/vigie-dossiers.md) (dossiers qui regroupent les signaux d'une même attaque d'une entité à l'autre, huit phases tirées de MITRE ATT&CK, confiance des accès, enjeu des données personnelles, frise et graphe) ; décisions D31 à D39 prises le 20 octobre 2026 (ATT&CK complet gardé dans la détection, phases dans les dossiers seulement) ; maquettes MV-12 à MV-14 faites ([`docs/maquettes-vigie/`](docs/maquettes-vigie/README.md)) ; plan en cinq PR (A ATT&CK et phases, B moteur des dossiers, C maquettes, D console, E données personnelles). **Console des dossiers** : D1 faite (#198 : lectures, filtres, gestes confirmés, scission et compte du contrôle des rôles) ; D2 faite (#199 : frise, graphe et matrice ATT&CK en SVG serveur, listes au téléphone, tableaux équivalents). D3 faite (#200, version 1.200.0) : vue ATT&CK globale, fiches des techniques, filtre indexé du journal et calques Navigator de couverture, de signaux et de dossier. Les trois PR sont fusionnées dans cet ordre ; les détails et limites sont consignés dans l’étude (§ 14.1 à 14.3) et le wiki Vigie. E (données personnelles, § 4.6 et 11) est livrée dans #202, version 1.202.0, après accord du propriétaire ; voir le suivi en tête de ce document.
8. **Site public v2** (audit d'ergonomie du 16 octobre 2026, maquettes v2 validées par le propriétaire : le blog s'appelle « Carnet », diaporama en pause par défaut, légende à deux voix l'auteur d'abord, page de série sans grande couverture, onglets de l'admin en cases au téléphone) : la v2 s'implémente à côté de la v1, page par page, derrière le réglage « Site public : v1 / v2 » et la vue de session des administrateurs (Spécifications, P23). **La v1 est gardée pour de bon** (décision du propriétaire, 19 octobre 2026) : elle reçoit les correctifs de sécurité et d'accessibilité, pas les nouveautés (Carnets, galeries privées et la suite restent en v2 seulement). **Fait** : le bouton « Voir en v1 / Voir en v2 » des pages publiques, pour l'administrateur connecté seulement (`site.apparence`), qui bascule la vue de sa session (`POST /admin/apparence/apercu-v2`, `vue=v1|v2|suivre`), réponses `private, no-store` pour toute session. **Fait** : le mécanisme, le socle (jetons, en-tête Contexte, menu, langue, pied de page), la visionneuse (MQ-04), puis l'accueil, la galerie en rangées et ses filtres, et la page d'une série (MQ-01 à MQ-03), sur les routes et paramètres existants (la galerie est la partie `#galerie` de l'accueil et les vues `/auteur/…`, `?regard=&serie=`, `?ordre=`). Puis les pages à formulaire (MQ-05, planche MQ-00) : « Je vous ai photographié » (`/bonjour`, `/bonjour/<réf>`, `/bonjour/merci`), Signaler, Partager sans script et la photo offerte (`/pour-vous/…`), mêmes routes, mêmes champs et même champ piège qu'en v1 (testé en v1 et en v2 avec la Vigie : piège, provenance, limites, jetons). Puis les pages sans formulaire d'envoi d'après la planche MQ-00 : À propos, Droits d'utilisation, Mentions légales et Confidentialité (sommaire, ancres, lignes de 65 signes, impression ; contenu identique à la v1), Rechercher (même formulaire GET, séries proposées sans résultat), Carte (cadrée sur les lieux, noms des villes, déplacement au clavier), Voyages et un voyage (couverture entière, carte sans défilement), page introuvable (recherche et issues). Données ou adresses à créer pour ces pages : vignettes de 160 px des épingles de la carte (UX-F-19), recherche tolérante aux pluriels et aux fautes (UX-F-26, change le traitement du serveur), contexte du voyage, de la carte ou de la recherche dans la visionneuse (UX-F-09, paramètre à créer), À propos « en trois temps » (portraits, démarche, nom et animal, UX-F-33), mesure d'audience déplacée des Droits vers la Confidentialité (texte légal à revoir). **Fait** : les adresses `/galerie` et `/series` (PR `feat/galerie-series-pages` ; Spécifications P32 ; registre de la Vigie, « /galerie et /series », BV-32) : v2 et v3 seulement (404 et aucun lien en v1, comme les Carnets), menu, fil d'Ariane et « Toutes les séries » qui y mènent, aperçu de la galerie et « Toute la galerie » sur l'accueil, mêmes filtres (`?regard=`, `?serie=`, `?ordre=`), index des séries (couverture, compte, photographes, années, texte d'intention), plan du site, canoniques et hreflang ; deux routes exactes, le chemin piège `/galerie/tout-telecharger` reste une 404 qui alerte ; filtres hors liste signalés une fois par requête. **À suivre**, une PR par page, chacune avec son impact sur la Vigie : données à créer pour ces pages : promesse distincte de l'accroche (les deux listes d'ouverture, bureau et téléphone, `hero_tel` : **fait** par #173, voir le point 9), diptyques « Même soir » / « Même fleuve » (**fait** : texte d'intention d'une série et description courte de chaque regard, migration 053, Spécifications P25 et A46) ; la page Contact (MQ-06, sans le tirage) : **fait** (PR `feat/page-contact`, migration 061 ; évaluation face à la Vigie avant le code, BV-27 à BV-30 ; Spécifications P30 et A54) : `/contact` (« Écrire à Sébastien, à Julien, ou aux deux », `?pour=`), `/a-propos#contact` qui y mène, `/droits/demande?photo=<adresse>` (« Demander une licence » dans la visionneuse v2 et sur la page Droits), en v1 et en v2/v3, trois langues, sans script ; mêmes protections que `/bonjour` ; nom, e-mail et message chiffrés, effacés à 12 mois ; boîte « Messages et demandes » dans l'admin (v1 et v2, permission `messages.traiter` avec portée, lecture notée), ligne dans « Aujourd'hui », e-mail aux photographes sans donnée personnelle ; pas d'accusé de réception au visiteur ; restent la page `/instagram` (MQ-06, cadre 13) et la rubrique « Vente des tirages » des mentions (avec la boutique) ; `/bonjour`, mineurs et date libre : **fait** (PR `feat/bonjour-mineurs` ; registre de la Vigie, BV-31 ; Spécifications P31 et A55 ; migration 062) : âge et nom du parent (`adult`, `guardian`, les règles de l'app : avec un accord, avant 18 ans le nom du parent exigé, publication avec l'accord des deux parents ou du parent qui exerce seul l'autorité parentale ; chiffrés), âge demandé aussi pour recevoir la photo et, avant 15 ans, l'adresse d'un parent à la place de celle de l'enfant, jamais gardée (`guardian_email`, `email_parent`), date en texte libre (fr, en, de ; `server/date-libre.js`), récapitulatif des choix sur la page merci (cookie de 15 minutes, rien dans l'adresse), en v1 (champs seulement) et en v2/v3 ; **pas d'accusé de réception par e-mail** (même raison que la page Contact), ni délai de réponse promis (à décider par le propriétaire) ; suite (PR `feat/app-mineurs`, Spécifications P31 et A56, aucune migration) : **fait** : l'app de terrain (v1 et v2) demande l'âge aussi pour la photo ou une adresse et propose « moins de 15 ans » (l'e-mail d'un parent, jamais celui de l'enfant, même colonne `email_parent`), avec la phrase des deux parents ; sur `/bonjour`, « moins de 15 ans » aussi pour une publication seule ; le récapitulatif de l'app et la photo offerte envoyés à un parent s'adressent au parent (fr, en, de) ; puis la bascule de la v2 pour tous, d'après la liste de contrôle [`docs/wiki/Bascule-v2.md`](docs/wiki/Bascule-v2.md) (avant, pendant, la première semaine, et après : la v1 reste, retour possible à tout moment). Ce que chaque brique demande à la Vigie (données à consommer, cas d'usage à ajouter ou à rattacher) : registre [`docs/etudes/vigie-besoins-des-briques.md`](docs/etudes/vigie-besoins-des-briques.md), tenu à chaque PR. Carnets et galeries privées : évaluation face à la Vigie faite (BV-12 à BV-26) et décisions prises le 18 octobre 2026 (registre, « Tranché » : mot de passe obligatoire, lien de 30 jours et 6 mois au plus, rubrique et regard pour les Carnets, « Écrire aux auteurs » en `mailto:`…). **Boutique sortie du lot** (MQ-13 à MQ-15, MQ-19 : ni tirages, ni panier, ni « Tirage : à partir de… »). **Fait** : les **Carnets** (MQ-11, MQ-12, MQ-20 ; migration 055 ; Spécifications P27 et A48 ; v2 seulement, 404 en v1) : liste filtrée par rubrique et regard, billet en Markdown restreint rendu par le serveur, trois langues publiées une par une, flux Atom, plan du site, visionneuse `?carnet=`, éditeur de l'admin (enregistrement automatique, aperçu, photos du billet, versions), circuit de publication (proposer, publier ou programmer, renvoyer, retirer) et permissions `carnet.*` ; côté Vigie, émissions BV-12, BV-13, BV-14 et journal d'audit prêt pour BV-20 et BV-21 (publication programmée par `app.carnet.runDue()`). Hors de ce lot : billets privés (avec les galeries privées), réactions des lecteurs, lettre d'information. **Galeries privées** (MQ-16 à MQ-18) : **fait** (PR `feat/galeries-privees`, migration 056) : galeries d'un photographe ou communes, photos de la photothèque (usage « privé » d'après les accords, bloquées en cas de refus), accès par lien personnel ou de groupe et mot de passe généré, montrés une seule fois et transmis par l'équipe (aucun e-mail envoyé par le site) ; page du lien neutre, galerie et visionneuse compacte en v2 quel que soit le réglage public, favoris et sélection envoyée ou reprise, téléchargements en 2 048 px ou 4 000 px au plus, archive ZIP ; essais limités (5 → 1 min, 10 → 15 min, 30 → suspension), révocation immédiate, sessions d'invité et autorisations à échéance, purge six mois après la fin ; portée « les miennes », journal d'audit, émissions vers la Vigie (BV-14, BV-16 à BV-19, BV-22 à BV-25 ; Spécifications P26 et A47). Restent : commentaires, limite des favoris, page `/prive` des accès d'une session, rendu sans filigrane, sel par photo et purge Cloudflare (G43), e-mail d'invitation. **Carnets** (MQ-11, MQ-12, MQ-20) et **admin v2** (MQ-07 à MQ-10, choix par compte) : après la fin de la phase D de la Vigie, chacun avec une évaluation d'impact sécurité (nouvelles routes, formulaires, cookies, permissions). **Admin v2, socle fait** (PR `feat/admin-v2`, migration 057, Spécifications A49) : choix par compte (« Essayer l'admin v2 » / « Revenir à l'admin v1 », Mon compte), repli écran par écran, mise en page et menu en quatre groupes avec la Vigie de la v1, Aujourd'hui, Réglages à onglets (sauf Identité et apparence, restée en v1 pendant le bouton v1 ↔ v2 du site public), règle d'enregistrement et de confirmation (MQ-09), le lot et « Proposer » (MQ-08), l'app de terrain et son accueil (MQ-10). **Fait, vague 2** (PR `feat/admin-v2-photos`) : la fiche d'une photo (MQ-09 : témoin, enregistrement au champ quitté, filigrane et adresse compris, Défaire, dialogues pour publier, programmer, renvoyer, dépublier avec raison et supprimer, suggestions jamais enregistrées sans « Enregistrer »), la photothèque (filtres d'état à symbole, « Filtrer » toujours là, touche P confirmée, raccourcis d'une touche coupables dans Mon compte, erreurs sous le champ, Défaire sans recharger, import) et À valider (titre provisoire, renvoyer et annuler une programmation depuis la page, confirmation avant de valider). **Fait, vague 3b** (PR `feat/admin-v2-terrain`) : Personnes et Demandes et rencontres (titres distincts), une personne et une rencontre (mêmes lectures sensibles et mêmes déchiffrements que la v1, testés ; effacer et appliquer un refus par un dialogue), Séries (champ quitté et ordre avec « Défaire »), Sorties et une sortie (lieu au champ quitté), Voyages et un voyage (champ quitté, page en ligne et suppression par un dialogue). **Fait, vague 3a** (PR `feat/admin-v2-reglages`, Spécifications A50) : Identité et apparence (sous-titre, marque, thème au geste ; logos au choix du fichier, dialogues pour remplacer et retirer ; version du site public et vue de la session inchangées), Comptes et rôles (cartes, Modifier, Défaire, supprimer après désactivation et dialogue) et Site public (la page au geste, l'ouverture sur place, un seul bouton sans script), mêmes routes que la v1 (réponse JSON à la demande, noms des champs au journal). **Fait, partie B « publier et terrain »** (PR `feat/admin-v2-publier`, Spécifications A51) : Instagram (file sans recharger avec « Défaire », propositions des photographes, réglages au geste, dialogues pour publier, retirer et déconnecter ; jeton jamais affiché), l'app (Mon QR, Merci, avec le bandeau d'identité), Carnets et Galeries privées dans la coquille v2 (contenu, formulaires et routes de la v1 ; mêmes émissions vers la Vigie, testées). **Fait, vague 4 « suivi et aide »** (PR `feat/admin-v2-suivi`, Spécifications A52) : Journal (un libellé lisible pour chaque action, cible nommée, connexions regroupées, filtres Type et Période, 50 lignes par page), Statistiques, Signalements des visiteurs (filtres, supprimer par un dialogue), Circuit de publication (interrupteurs au geste avec « Défaire »), Aide (sommaire replié au téléphone, recherche surlignée) et Nouveautés (mois repliés, fenêtre « Nouveau depuis votre dernière visite » au clavier), mêmes routes que la v1. **Fait, finitions** (PR `feat/admin-v2-finitions`, Spécifications A57) : « Sur le terrain » et les cartes d'accord en v2 ; Carnets et galeries privées avec dialogues, réglages au geste et « Défaire », liste des galeries au format v2 ; Journal : cible nommée (voyage, série) et actions groupées détaillées ; aide par chapitre et panneau contextuel ; page refusée (403) en v2. **À suivre** : données à créer de MQ-08 et MQ-10 (doublons d'import, « dernier import », carte papier signée sans script, photo de repère gardée après un refus : chacune demande une décision du propriétaire) ; l'éditeur de billet garde son propre témoin d'enregistrement. Données à créer pour la visionneuse : variantes de 160 et 480 px (UX-T-07). **Fait** : cadrage de la mini-carte sur la ville et barre d'échelle (PR `feat/minicarte`, MQ-04 ; Spécifications P22) : cadre centré sur la ville par le serveur (`v2.cadrage`, celui de la page Carte), assez large pour les villes « À proximité », de 60 à 300 km ; barre d'échelle ronde mesurée le long du parallèle de la ville (projection du fond), en km ou en m ; noms de 13 px placés sans chevauchement de 288 à 400 px ; le même cadre et la même barre sans script ; jamais plus précis que le centre de la ville ; en v1 aussi (même cadre, barre en unités du fond ; les autres noms de la v1, de 8 à 11 px, restent tels quels). Reste : un fond plus riche aux grandes échelles (fleuves, lacs, routes : le fond Natural Earth n'a que les terres et les frontières ; une ville à l'intérieur des terres se voit sur un fond uni), et les tuiles 1:10m sans script (aujourd'hui le fond 1:50m sans script). **Fait** : EXIF de prise de vue (boîtier, objectif, focale, vitesse, ouverture, ISO, lus à l'import et rattrapés une fois pour les photos déjà là ; jamais GPS, numéro de série, propriétaire ni logiciel ; montrée par défaut, case « Montrer la prise de vue sur le site » de la fiche, suivie par les images servies en mode « Prise de vue » ; migration 060, Spécifications P29 et A53). **Fait** : heure de prise de vue publique (tranché le 18 octobre 2026 : choix par photo, décochée par défaut, date au jour exigée ; Spécifications P24 et A45, migration 052) ; numéro d'inventaire (UX-T-05 : donné à la première publication, jamais changé ni redonné) et texte de remplacement (UX-F-44 : écrit ou validé dans la fiche, en trois langues, aussi en `alt` de la v1 ; la description suggérée s'y reprend, jamais seule) — migration 053, Spécifications P25 et A46 ; finitions : année du numéro à l'heure de Paris (migration 054), texte de remplacement aussi dans « Compléter et publier » et l'inspecteur de la photothèque, choix « Site public : v1 ou v2 » en tête d'Apparence.

9. **Site public v3** (19 octobre 2026, maquettes [`docs/maquettes-v3/`](docs/maquettes-v3/README.md), PR des maquettes #153) : la v2 redessinée, troisième choix du réglage « Site public » (v1, v2 ou v3) et de la vue de session des administrateurs (Spécifications, P28). Mêmes pages, mêmes routes, mêmes champs que la v2 ; un autre dessin (`public/css/v3/v3.css`, chargé après les feuilles de la v2) et, à l'accueil, l'ouverture en plein cadre (recadrage de 10 % au plus, en-tête et cartel posés sur la photo au bureau, voile limité à leur bande : décision du propriétaire, contraire à la lettre d'UX-F-17) et les regards par l'image (`views/v3/`). Sans boutique : ni prix, ni bouton d'achat, ni « Tirages ». **Fait** (suite, migration 059) : point fort du cadrage de chaque photo (fiche v1 et v2) et ouverture du téléphone (`hero_tel`, Site public v1 et v2), évalués face à la Vigie (`hero_tel` suivi comme `hero` ; le point fort n'est qu'un cadrage d'affichage).

**Vignettes de 160 et 480 px** (UX-T-07, RGESN ; PR `feat/variantes-160-480`, version 1.181, Spécifications I1, I4 et I6) : **fait**. Deux largeurs de plus en AVIF et WebP, dans tous les srcset (v1, v2, v3, admin v1 et v2) ; `sizes` revus (rangées par tranches de 128 px et au petit téléphone, planche de l'admin et son curseur, carte de partage, galeries privées de l'admin) ; rattrapage des photos existantes au démarrage, seulement les tailles manquantes, et repli sur la taille au-dessus tant qu'une vignette manque (`server/repli-variantes.js`). Rien à faire au déploiement. Restent : les « trop gros » des rangées aux largeurs où leur composition change dans une tranche (une tranche de 64 px en corrige la moitié, pour 30 % de HTML en plus : écarté), et la v1 (ouverture en `100vw`, visionneuse), laissée telle quelle.

Plus tard (noté le 15 octobre 2026 ; étude détaillée dans [`docs/etudes/blog-galeries-boutique.md`](docs/etudes/blog-galeries-boutique.md)) :
- **Blog** : récits et billets des photographes, avec leurs photos, dans les trois langues du site.
- **Photos privées protégées** (fait, point 8 : galeries privées) : galeries privées visibles de l'administration (connexion Zitadel) et de personnes choisies, qui reçoivent un lien temporaire et un mot de passe.
- **Boutique** : panier et achat (tirages, peut-être fichiers numériques), jusqu'au paiement et à la facturation.

Plus tard (noté le 18 octobre 2026 ; note de cadrage dans [`docs/etudes/stories-instagram-musique.md`](docs/etudes/stories-instagram-musique.md)) :
- **Stories Instagram en musique** : petit montage (3 à 10 photos, transitions, un morceau de quelques secondes) rendu par un conteneur dédié (`montage`, profil Compose, facultatif), musique tirée d'une phonothèque à fiche de licence obligatoire, sortie en téléchargement puis par la file Instagram ; décisions DS1 à DS7 prises le 18 octobre 2026 (propositions de l'étude retenues : télécharger d'abord, puis la file Instagram ; domaine public, CC0, CC BY, Pixabay sans bouclier, Sound Collection de Meta pour Instagram seulement, autorisation écrite ; phonothèque gérée par l'administrateur ; circuit des posts ; 3,5 s par photo, fondu de 0,7 s ; MP4 gardés 7 jours ; image du conteneur construite sur le serveur) ; prochaine étape : phase S0 (essai d'une story par l'API, premiers morceaux, question à la SACEM) ; code après la fin de la phase D de la Vigie.

Écarté pour l'instant : suggestions de titres et légendes par IA (contrainte de coût nul ; l'offre gratuite de Gemini exige le payant pour des utilisateurs dans l'EEE ; piste possible : modèle local via Ollama).
