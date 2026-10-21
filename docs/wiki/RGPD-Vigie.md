# RGPD : fiche de traitement de la Vigie

**État documentaire du 21 octobre 2026**, code examiné en version **1.207.0**, complété par le correctif LEG-V3 décrit dans l’[étude, § 14.9](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/vigie-dossiers.md#149-leg-v3--masquage-des-copies-dadresses-conservées). Cette fiche complète le [registre RGPD](RGPD), la [procédure de violation](RGPD#4-procédure-en-cas-de-violation-de-données-articles-33-et-34) et la documentation [Vigie](Vigie). Elle décrit le code ; elle ne certifie ni la configuration du serveur ni l’accomplissement des validations ci-dessous. Aucune donnée d’une instance réelle n’a été consultée pour la rédiger.

## 1. Traitement, finalités et personnes

**Responsables conjoints** : Sébastien et Julien, Nicephos ; contact des personnes : **info@nicephos.art**. Les coordonnées légales complètes sont celles à renseigner dans Droits & confidentialité. Les responsabilités et signatures relèvent de l’[accord du registre](RGPD#2-accord-entre-responsables-conjoints-article-26).

La Vigie est facultative. Lorsqu’elle est activée, elle collecte des événements de sécurité, les rapproche par compte, session, adresse ou accès de galerie, détecte des activités inhabituelles, ouvre des alertes et des dossiers, puis permet leur examen et leur traitement. Ses sources peuvent comprendre le site, Zitadel, le Worker Cloudflare et les composants techniques configurés. Leur activation effective reste à relever par les responsables.

Les finalités sont de protéger les accès et les données, détecter et contenir un incident, en reconstruire le déroulement et documenter ses conséquences. La Vigie ne doit pas servir à mesurer le rendement des personnes ni à réutiliser leurs habitudes à des fins commerciales. Un changement de finalité exige une nouvelle analyse.

Les personnes concernées comprennent les titulaires de comptes du site et de la console, les invités des galeries et les visiteurs dont l’activité est journalisée. Avec le Worker de bordure, le périmètre comprend les visiteurs des pages hors images. Les personnes photographiées, correspondants et parents peuvent être indirectement concernés par une référence de fiche ou de message consulté ; leur contenu n’est pas recopié par le contrat BV-33. Une adresse partagée ou un compte compromis ne désigne pas avec certitude l’auteur d’une action.

## 2. Données, provenance et destinataires

| Ensemble | Données effectivement prévues par le code | Usage et limites |
|---|---|---|
| Journal et signaux | Horodatages, source, type et gravité ; identifiants de compte, session, accès et objet ; IP ou réseau, pays, contexte de navigateur/appareil selon la source ; extrait borné d’une saisie malveillante | Détection et reconstitution. Un extrait hostile peut lui-même contenir des données personnelles ; le borner ne l’anonymise pas |
| Bordure Cloudflare | IP, ASN, pays, empreintes TLS hachées, réponse, classe de route, premier segment du chemin | Complète ce que le site observe ; aucune lecture du contenu de la connexion TLS par ce mécanisme |
| Lectures, exports et suppressions personnels, BV-33 | Référence d’objet lorsqu’elle existe, catégories fermées, effectif d’une liste, nombre de déchiffrements et taille du corps préparé ; compte et session | Ni valeurs des fiches ni images, signatures ou messages copiés. Catégories opérationnelles, distinctes des catégories particulières de l’article 9. Les compteurs ne sont pas des effectifs certains de personnes |
| Dossiers | Entités liées, signaux copiés, périodes, phases ATT&CK projetées, confiance, enjeu, gravité, explication, classement et motifs des interventions | Évaluation automatisée suivie d’un examen humain. Un dossier peut subsister après les événements sources ; « incident » ne signifie pas nécessairement violation de données personnelles |
| Console | Identifiant et nom du compte, rôles et attributions, dates d’accès et d’action ; sessions avec empreinte du cookie, contexte d’authentification, IP, navigateur et jeton CSRF | Authentification, habilitation et audit. Les motifs libres ne doivent contenir que les faits nécessaires |
| Reçus de suspension, côté site | Numéro d’accès de galerie, début et fin de décision ; repères locaux des cas historiques réservés au contrôle manuel | Éviter de perdre une suspension après panne ou de reposer celle levée par l’équipe. Aucun nom, adresse, motif ou secret recopié. Remise sur demande avec les données de l’invité, selon la [procédure du registre](RGPD#reçus-de-suspension-dun-accès-de-galerie) |
| Exports et registre des violations | JSON d’incident : références, comptes, sessions, période, catégories et signaux ; CSV du journal : détails autorisés, dont les IP ; registre : faits, effets, mesures et décisions | Fichiers personnels à accès restreint. Le JSON écarte les champs réseau et les notes libres, sans garantir qu’un identifiant arbitraire soit anonyme |

Les destinataires internes sont les responsables et les personnes qu’ils habilitent nominativement. Dans la console, le rôle effectif dépend du plafond Zitadel et de l’attribution Vigie, selon le mode configuré :

- **Lecteur / Lectrice** : lecture, adresses tronquées en /24 ou /48 ; aucun geste de traitement.
- **Intervenant** : accès aux adresses complètes et traitement des alertes/dossiers.
- **Analyste** : droits précédents, réglages et exports détaillés.
- **Administrateur** : droits précédents, gestion des habilitations et de la confiance.

Les calques ATT&CK Navigator ne contiennent que des agrégats et des libellés fixes ; ils sont accessibles en lecture. Les notifications de la Vigie vers Signal ou le relais de messagerie sont limitées au résumé technique et au lien de console : leur construction exclut les comptes et adresses réseau des événements. Les coordonnées des destinataires et les copies reçues restent à gérer chez le relais et sur leurs appareils.

Les prestataires possibles sont Cloudflare, Zitadel, le fournisseur de messagerie et, selon l’installation, les services de notification ou d’hébergement. Le [registre général](RGPD) les recense. **À vérifier sur les contrats et réglages réels** : entités contractantes, lieux de traitement et de sauvegarde, sous-traitants ultérieurs, garanties des transferts hors EEE et durées propres aux services. Une mention d’un mécanisme de transfert dans le registre ne prouve pas à elle seule qu’il couvre le compte et le service utilisés. Aucun nouveau prestataire n’est ajouté par cette fiche.

## 3. Bases légales et mise en balance

La détection, la corrélation et la sécurisation de la console reposent sur l’**intérêt légitime à protéger le site et les données** (article 6.1.f). L’article 32 décrit les obligations de sécurité ; il ne justifie pas à lui seul toute collecte ou toute durée. La documentation d’une violation et les notifications requises relèvent de l’obligation légale correspondante (article 6.1.c, articles 33 et 34). Il faut distinguer ce registre minimal du dossier technique complet.

La mise en balance préparée pour les responsables suit les trois examens de la [CNIL sur l’intérêt légitime](https://www.cnil.fr/fr/les-bases-legales/interet-legitime) :

| Examen | Éléments propres à Nicephos | Condition de validation |
|---|---|---|
| Intérêt poursuivi | Prévenir les accès non autorisés aux photos privées, coordonnées, messages et accords ; conserver une chronologie exploitable | Limiter l’usage à la sécurité et au traitement des incidents |
| Nécessité | Le rapprochement compte/session distingue plusieurs attaques d’une rafale isolée ; les métadonnées BV-33 évitent de recopier les fiches | Justifier chaque source et la précision utile ; examiner si un réseau tronqué ou une durée moindre suffit hors enquête |
| Équilibre | Les personnes peuvent attendre une protection du service ; elles ne doivent pas découvrir une surveillance étendue de leurs horaires, appareils ou déplacements estimés | Information préalable, accès limité, contestation humaine, purge vérifiable ; traiter les écarts de la section 8 avant de conclure favorablement |

**Validation de la mise en balance** : à dater et signer par les responsables après vérification du périmètre réel et des mesures restantes. Le présent inventaire ne remplace pas cette décision.

## 4. Conservation : état du code et politique à terminer

Le choix ordinaire retenu est **183 jours**, réglable par `VIGIE_RETENTION_DAYS`. La [CNIL recommande six mois à un an pour la journalisation](https://www.cnil.fr/fr/securite-tracer-les-operations), avec des exceptions motivées ; le [guide ANSSI, § 3.4.5](https://messervices.cyber.gouv.fr/documents-guides/anssi-guide-recommandations_securite_architecture_systeme_journalisation.pdf), reprend cette plage. Cela soutient le choix de Nicephos, sans imposer exactement 183 jours ni fixer la durée d’un registre de violations.

| Ensemble | Déclencheur et conservation dans le code | Réserve ou décision restante |
|---|---|---|
| Événements chaînés | 183 jours depuis la réception, purge par lots avec ancre de chaîne | Vérifier le réglage et l’exécution des purges ; les copies en dossier suivent une autre règle |
| Signaux projetés ; entités et liens du moteur | Signaux : 30 jours depuis l’événement ; entités : 30 jours et liens : 90 jours depuis leur dernière activité | Les copies dans les dossiers ne sont pas effacées par ces purges |
| Dossiers clos non incidents | 183 jours depuis la dernière activité, pas depuis le classement ; suppression du dossier et de ses liens à la purge suivante | D38, appliquée aussi aux dossiers existants depuis la PR #207 |
| Dossiers encore suivis ; dossiers classés incident | Pas d’échéance globale automatique | Revoir les dossiers ouverts et définir une durée propre aux incidents ; aucune conservation illimitée n’est approuvée |
| IP dans les dossiers conservés | Après 183 jours depuis la dernière activité du dossier : graines, entités IP/réseau, titres, notes et autres textes dérivés tronqués en /24 ou /48 ; IP des signaux vidées, clés et exclusions corrigées | LEG-V3 corrigé : jusqu’à 1 000 dossiers avec IP à traiter en priorité, plus un parcours circulaire de 1 000 dossiers pour le rattrapage. Un stock important peut demander plusieurs purges quotidiennes. Le délai porte sur le dossier, pas sur chaque IP ; les identifiants de compte, session et objet restent personnels |
| Alertes closes ; décisions levées ou échues | 395 jours depuis la dernière activité de l’alerte, la levée ou l’échéance de la décision | Durée distincte de celle des dossiers ; nécessité à justifier. Les éléments encore actifs ne suivent pas cette purge |
| Reçus de suspension du site | Jusqu’à la fin de la décision, puis purge horaire ; effacement immédiat avec l’accès ou au retrait de la Vigie | Une prolongation prolonge le reçu. Les repères historiques du cache cessent d’agir à leur échéance et sont retirés à une nouvelle écriture du cache ; cela ne purge pas les listes signées anciennes du cache ni les sauvegardes |
| Habitudes classées légitimes, D39 | Effet limité à 90 jours ; au plus 2 000 entrées | L’expiration les rend inopérantes ; leur retrait physique du réglage intervient à une prochaine écriture de classement, pas à une purge périodique |
| Sessions de console | Autorisation : 1 heure au plus, 15 minutes sans activité ; lignes en base supprimées après 7 jours depuis la création, contrôle horaire | Ne pas confondre expiration de l’accès et effacement de l’IP, du nom et du navigateur. Les transactions OIDC expirent à 10 minutes ; nettoyage lors de nouvelles connexions |
| Habilitations de console | Identifiant, nom et historique d’attribution conservés ; pas de purge dédiée repérée | Définir le retrait des comptes devenus inutiles, sans rétablir leurs droits |
| Compteurs quotidiens ; bordure | Compteurs du journal : 762 jours ; Analytics Engine : durée déclarée de 3 mois, à vérifier sur le service utilisé | Vérifier que les agrégats et les combinaisons conservées ne permettent pas une réidentification |
| Sauvegardes Vigie | 14 instantanés gardés par défaut (`VIGIE_BACKUP_KEEP`), suppression des plus anciens lors d’une nouvelle sauvegarde | Ce n’est pas une garantie de 14 jours si la tâche s’arrête ; documenter le cycle et les effacements à réappliquer après restauration |
| Exports téléchargés et registre des violations | Aucune purge à distance des fichiers téléchargés | Espace restreint, responsable, motif de conservation, échéance ou prochaine revue et effacement à inscrire pour chaque dossier externe |

La [CNIL demande de documenter les violations](https://www.cnil.fr/fr/violations-de-donnees-personnelles-les-regles-suivre) ; sa fiche ne donne pas de durée chiffrée générale pour ce registre. **D38 reste donc partiellement ouverte** : les responsables doivent fixer et justifier la durée, son point de départ, les exceptions de contentieux et les données strictement nécessaires. Garder l’intégralité du dossier technique indéfiniment ne découle pas de l’article 33.5. L’exception du moteur décrit un état actuel, pas une politique validée.

Sources du constat technique : `vigie/store.js`, `vigie/moteur.js`, `vigie/dossiers.js`, `vigie/masquage.js`, `vigie/console/sessions.js`, `vigie/console/droits.js` et `vigie/backup.js`. Le défaut de copie résiduelle dans la graine et le titre, reproduit sur une base en mémoire, est corrigé par LEG-V3. Les tests couvrent aussi les IPv6 abrégées et accolées à du texte, les anciennes purges partielles, les cibles de confiance, les collisions entre entités, la reprise après interruption et les fusions/scissions. La correction ne réécrit pas le journal chaîné, qui garde sa propre purge, et ne modifie pas les sauvegardes déjà produites.

## 5. Garanties, information et exercice des droits

La console prévoit une authentification OIDC, des habilitations relues avant les actions, des confirmations et jetons CSRF, un rendu serveur échappé et borné, une CSP stricte, l’absence de cache et de référent. Les gestes et exports détaillés sont audités. La chaîne HMAC détecte des altérations ; **elle ne chiffre pas le journal**. La base Vigie et ses instantanés ne bénéficient pas du coffre `DATA_KEY` des fiches du site : leur confidentialité dépend notamment des accès système, du réseau et du chiffrement des supports effectivement déployé.

La troncature réseau, les empreintes et les références d’objets ne garantissent pas l’anonymat. Les rôles limitent l’accès, mais ne dispensent pas d’informer les comptes surveillés et les visiteurs concernés. La notice publique actuelle (`server/privacy.js`) décrit le journal et BV-33 ; elle reste à compléter pour les dossiers, les destinataires habilités, les durées différenciées et les droits correspondants. L’ancienne formule « consultable par nous seuls » doit correspondre aux habilitations réellement accordées.

Une demande reçue au contact du registre doit être qualifiée, avec une vérification d’identité proportionnée. Rechercher séparément les données du site et celles de la Vigie : l’export d’une fiche de personne ne constitue pas l’export complet d’un compte surveillé. Protéger les données des tiers dans la réponse et examiner les demandes d’accès, de rectification, d’effacement, de limitation ou d’opposition selon leur fondement ; tracer la décision et ses motifs. Une obligation de conserver une preuve n’autorise pas un refus global sans examen. Ne pas éditer manuellement une chaîne pour répondre à une demande : prévoir une procédure contrôlée compatible avec son intégrité.

Les décisions de blocage préexistantes doivent être distinguées du classement d’un dossier : D1 à E n’ont pas ajouté de réponse automatique fondée sur les phases. Une gravité ou une IP seule ne prouve pas une faute individuelle. Une contestation doit pouvoir conduire à une relecture humaine, à la correction des liens ou à la levée d’une mesure. L’existence de règles automatiques ne suffit pas, à elle seule, à conclure que l’article 22 s’applique ou ne s’applique pas : examiner leurs effets concrets sur l’accès des personnes ([CNIL, profilage et décision automatisée](https://www.cnil.fr/fr/profilage-et-decision-entierement-automatisee)).

## 6. Préexamen AIPD et risques pour les personnes

L’ancienne conclusion générale « pas de profilage, pas de surveillance systématique, donc pas d’AIPD » ne couvre pas la Vigie. Le petit nombre de comptes ne suffit pas à conclure. La [méthode CNIL de préexamen AIPD](https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd) demande d’examiner notamment l’évaluation, la surveillance et le croisement de données.

| Critère à examiner | Constat sur la Vigie |
|---|---|
| Évaluation et notation | Présent : habitudes de connexion, confiance et gravité rattachées à des comptes |
| Surveillance systématique | Présent : suivi continu des événements et corrélations lorsque la Vigie est active |
| Croisement de données | Présent : sources site, identité et bordure, selon les composants activés |
| Décision automatisée avec effet significatif ; exclusion d’un service | À apprécier selon les règles de blocage actives, leur durée et les recours ; ne pas assimiler toute alerte à une telle décision |
| Grande échelle, personnes vulnérables, données sensibles ou hautement personnelles, innovation | À examiner selon les volumes, les personnes et les sources réels ; la catégorie BV-33 « mineur » ne signifie pas que le dossier contient une fiche de mineur, mais les métadonnées restent à évaluer |

**Conclusion du préexamen** : plusieurs critères sont présents ; préparer et faire valider une AIPD complète, au lieu de maintenir une dispense non motivée. Cette fiche en fournit l’inventaire et les premiers risques, mais pas une AIPD achevée. Les responsables doivent documenter le périmètre réel, la gravité et la vraisemblance des risques résiduels, les mesures et la conclusion avant de valider l’usage envisagé ; si le traitement est déjà actif, réexaminer sans délai la situation. Une consultation préalable doit être examinée si un risque élevé demeure malgré les mesures ([RGPD, articles 35 et 36](https://cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4)).

| Risque pour la personne | Mesures présentes dans le code | Point restant pour l’analyse |
|---|---|---|
| Attribution erronée d’une attaque, blocage d’un compte légitime | Force des liens, explication, scission/détachement, classement humain et apprentissage limité | Mesurer les faux positifs, vérifier le recours et les effets des blocages |
| Observation excessive des habitudes ou divulgation de l’activité | Métadonnées fermées, rôles, masquage à l’affichage, audit | Information des personnes, périmètre utile, revue des habilitations et du chiffrement réel |
| Conservation ou réidentification au-delà du besoin | Purges ordinaires, limites de volume, exports bornés | Rattrapage du masquage, durée des incidents, habilitations et apprentissages expirés ; voir section 8 |
| Fuite d’un export, d’une sauvegarde ou d’un journal | Export détaillé réservé, confirmation et audit ; isolation du composant | Stockage des téléchargements, copies, supports et prestataires à contrôler |
| Sous-estimation d’une violation ou absence d’information | Références et catégories conservées, indication des plafonds | Ne pas confondre absence de signal et absence de violation ; compléter l’enquête et la décision juridique |

## 7. Pièce à ouvrir pour chaque violation

Le registre effectif des violations se conserve dans un espace privé à accès restreint, **jamais dans ce dépôt**. Chaque fiche doit porter les éléments suivants ; ne pas remplir les inconnues par zéro :

- Référence, responsable de suivi, date et heure de prise de connaissance, période connue ou estimée, faits et sources fiables ; distinguer suspicion, incident technique et violation confirmée.
- Nature de l’atteinte à la confidentialité, à l’intégrité ou à la disponibilité ; catégories et nombres approximatifs de personnes et d’enregistrements, incertitudes et conséquences probables.
- Mesures de confinement, récupération et réduction des conséquences, avec dates et responsables ; état du chiffrement et exposition éventuelle des clés.
- Évaluation du risque, décision motivée de notifier ou non, date et référence CNIL, raisons d’un éventuel retard, compléments transmis ; information des personnes ou justification de son absence.
- Pièces utiles, emplacement protégé, destinataires, mesures restant à prendre, date de clôture, motif et échéance de conservation ou prochaine revue, décision finale d’effacement.

Le délai de **72 heures court depuis la prise de connaissance de la violation**, pas depuis le classement du dossier. Si la notification est requise et que l’enquête n’est pas terminée, transmettre les informations disponibles puis compléter sans retard indu. Documenter aussi les violations non notifiées ; informer les personnes sans délai indu en cas de risque élevé, sous réserve des conditions légales applicables ([CNIL, règles en cas de violation](https://www.cnil.fr/fr/violations-de-donnees-personnelles-les-regles-suivre)).

L’export JSON de la Vigie exige actuellement un incident clos et un rôle Analyste ou Administrateur. **Ne pas attendre cette clôture ou cet export pour décider ou notifier.** Il fournit des indices de périmètre, pas le registre entier : listes sans identifiants, plafonds et sources purgées limitent ses conclusions ; une phase n’établit pas à elle seule une exfiltration ou une publication.

## 8. Actions et validations restant ouvertes

| Référence | Action | État au 21 octobre 2026 |
|---|---|---|
| LEG-V1 | Fixer et justifier la durée et le point de départ du registre des violations et des dossiers incidents ; traiter séparément alertes et décisions à 395 jours | Responsables conjoints ; D38 partiellement ouverte, aucune durée universelle ANSSI/CNIL identifiée |
| LEG-V2 | Achever l’AIPD et la mise en balance, en tenant compte des sources, volumes et blocages effectivement activés | Préexamen préparé ; validation non effectuée |
| LEG-V3 | Corriger la purge des IP résiduelles et examiner les copies, titres et motifs ; ajouter les tests de non-régression et le banc exigés pour le moteur | Corrigé et testé dans le moteur et le masque partagé avec la console ; rattrapage des dossiers existants lors des purges, sauvegardes à traiter selon leur cycle propre |
| LEG-V4 | Définir et appliquer l’effacement des habilitations inutiles et des apprentissages expirés ; prévoir le traitement des demandes de droits dans la Vigie | Limites identifiées dans le code ; ne pas confondre désactivation et effacement |
| LEG-V5 | Compléter la notice publique et l’information des comptes habilités avec les durées et destinataires exacts | Dossier interne complété ; `server/privacy.js` non modifié dans cette livraison documentaire |
| LEG-V6 | Vérifier les contrats, transferts, supports chiffrés, sauvegardes, purges et emplacement des exports sur l’installation réelle | Contrôle du propriétaire ; aucun accès aux données réelles dans ce travail |
| LEG-V7 | Signer la répartition des responsabilités, conserver les décisions et revoir la fiche chaque année et lors d’un changement de périmètre | Accord et dates à compléter par les responsables |

**Relecture des responsables** : date ……………… ; Sébastien ……………… ; Julien ……………… ; décisions et pièces justificatives conservées dans ……………… . Les références LEG-V servent au suivi de cette fiche ; elles ne remplacent ni les décisions D31 à D39 ni les besoins de détection BV.
