# Cookies et données personnelles : conformité, sécurité et technique

Rapport révisé le **24 octobre 2026**, à partir de Nicephos **1.217.0**, commit `f44cdf31f8c8c8893071e9350962cdf1370202ee`.

**La cible est un site public utilisable sans acceptation globale imposée, avec des stockages justifiés et protégés.** Aucun usage publicitaire n’a été trouvé dans le code. L’authentification et certaines préférences demandées peuvent être exemptées ; cela ne couvre pas automatiquement tous les usages actuels. Un choix contextuel préalable reste nécessaire pour une opération non exemptée que l’on souhaite conserver.

**Scénario précisé après le diagnostic : chiffrement en base et dans les cookies, avec maintien des fonctionnalités.** Les suppressions étudiées ci-dessous sont des alternatives de minimisation, pas des exigences légales ni des suppressions décidées. La section 11 présente les contraintes pour garder les fonctions ; elle prévaut pour ce scénario.

**Le code actuel ne satisfait pas votre exigence de protection de toutes les données personnelles stockées.** Des copies locales, des tables d’administration et des données de la Vigie restent lisibles au niveau applicatif. Certaines signatures protègent l’intégrité sans assurer la confidentialité. Le chiffrement des supports réels n’a pas été vérifié.

Le rapport sépare **conformité obligatoire**, **politique de sécurité demandée** et **choix techniques**, puis **site public**, **administration** et **Vigie**. Il expose les exemptions, les conditions restant à établir et les corrections proposées. L’[inventaire technique](inventaire-technique.md) conserve les douze familles de cookies, huit stockages navigateur, références et preuves initiales. La [carte de protection des données](protections-et-caches.md) détaille les stockages en clair et les contraintes de chiffrement.

Ce document est une analyse de conformité et un programme de corrections, pas une certification de l’installation. Les propositions restent distinctes des comportements livrés. Aucun code produit n’a été modifié et aucune donnée réelle n’a été consultée.

## 1. Trois périmètres distincts

Ici, « front » désigne le site destiné aux visiteurs, y compris les routes serveur qui lui répondent. « Back-office » désigne l’administration. Cette séparation ne correspond pas simplement à JavaScript contre Node.js.

| Périmètre | Personnes et fonctions | Cookies applicatifs | Enjeu principal |
|---|---|---|---|
| **Site public** | Visiteurs, formulaires, invités des galeries | `langue`, `bonjour_recap`, `[__Host-]visiteur` | Exemptions, absence de suivi inutile, confidentialité des échanges et des galeries |
| **Administration** | Équipe, édition et gestion | `[__Host-]session`, `[__Host-]oidc-<state>`, `flash`, `admin_langue`, `admin_theme`, `ig_state`, `apercu_theme` | Authentification, données des comptes/sessions, brouillons, messages et OAuth |
| **Vigie** | Comptes de sécurité ; personnes concernées par les événements | `__Host-vigie`, `__Host-vigie-tx` | Connexion console, journal, décisions, tampons, exports et sauvegardes |

**La séparation fonctionnelle n’est pas un cloisonnement physique complet.** Le public et l’admin partagent l’application et l’hôte. Le cookie d’équipe en `Path=/` peut être envoyé lors d’une visite publique, pour les aperçus et l’exclusion des statistiques notamment. La Vigie est un service séparé. Séparer les domaines public/admin serait un chantier d’architecture ; un changement de chemin de cookie ne suffirait pas.

Un navigateur neuf n’a reçu aucun cookie applicatif sur l’accueil testé. Les trois cookies publics résultent d’actions particulières. Les cookies ajoutés par Cloudflare et ceux des parcours Zitadel restent à relever sur les services réellement déployés.

## 2. Obligations réglementaires et politique demandée

### 2.1. Deux examens juridiques séparés

**Stockages du terminal :** l’article 82 impose en principe un consentement préalable, avec des exceptions pour la communication électronique et les opérations strictement nécessaires au service expressément demandé. La qualification porte sur la finalité et l’usage effectif. Remplacer un cookie par localStorage ne contourne pas cette règle. Voir l’[article 82 de la loi Informatique et Libertés](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037813978).

**Données personnelles :** l’exemption de consentement aux cookies ne dispense pas de finalité, de base légale, de minimisation, de conservation nécessaire et de sécurité. Un identifiant pseudonyme ou une empreinte ne devient pas automatiquement anonyme. L’intérêt légitime peut fonder un traitement de sécurité justifié ; il ne remplace pas le consentement requis pour un traceur facultatif. Voir le [RGPD, articles 5 à 7](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2).

Un traitement purement serveur sans opération relevant de l’article 82 n’a pas à obtenir une « exemption de cookie » : sa base légale RGPD doit être définie, et ce n’est pas nécessairement le consentement. Les tableaux d’exemptions concernent les opérations sur le terminal ; le cas de l’audience demande de qualifier précisément le mécanisme utilisé.

L’information sur les données personnelles doit expliquer notamment finalités, bases légales, destinataires, durées et droits. Voir le [RGPD, articles 12 à 14](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3). Pour un traceur exempté sans données personnelles, informer sur son existence relève de la recommandation de transparence de la CNIL : toute omission d’une préférence fonctionnelle n’est pas automatiquement une violation du RGPD. Voir la [recommandation du 16 janvier 2026, § 5](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf).

### 2.2. Ce que chaque sujet exige

| Sujet | Exigence réglementaire | Politique demandée pour Nicephos |
|---|---|---|
| Consentement | Analyser les exemptions ; sinon consentement valable avant lecture/écriture | Usages exemptés ou sans stockage pour éviter une demande globale |
| Données personnelles | Protection adaptée aux risques et démontrable | Aucune copie privée persistante en clair ; chiffrement authentifié et protection de l’origine des échanges |
| Conservation | Durée nécessaire et justifiable, effacement effectif | Supprimer les copies évitables et les reliquats après leur fonction |
| Cache | Le RGPD n’interdit pas tous les caches par principe | Écarter le cache lorsqu’une autre façon de rendre le service existe ; exposer son coût de remplacement |
| Administration | Être connecté ne dispense pas d’analyser les traceurs | Conserver l’authentification nécessaire ; retirer les mémoires accessoires ou les intégrer à un état métier protégé |

Le RGPD n’impose pas de signer chaque champ ou de chiffrer uniformément tout le système : il demande des mesures adaptées au risque. Votre politique de chiffrement systématique des données privées est une exigence de projet plus précise. Voir le [RGPD, articles 25 et 32](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).

### 2.3. Une cible sans bannière est possible

Un cookie nécessaire à l’ouverture d’une galerie peut être utilisé quand la personne demande ce service, sans lui faire accepter une finalité publicitaire. Certaines préférences intrinsèques attendues, notamment la langue, peuvent aussi être exemptées. Voir les [lignes directrices CNIL, § 49](https://www.cnil.fr/sites/default/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf).

**Un bouton « Tout accepter » ne corrigerait ni le stockage en clair, ni les purges absentes, ni les durées excessives.** Si une finalité facultative ne bénéficie pas d’une exemption, il faut la retirer ou recueillir un consentement préalable libre et spécifique. Imposer une acceptation générale pour entrer n’est pas la stratégie retenue. Voir la [CNIL sur le consentement aux traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi).

## 3. Site public

### 3.1. Conformité et exemptions par usage

**« Exemption fondée »** signifie que la fonction entre dans une catégorie reconnue si son usage reste exclusif. **« À justifier »** signifie que sa nécessité ou sa proportionnalité exacte n’est pas démontrée ici ; cela ne signifie pas automatiquement « illégal ». Les choix ci-dessous sont l’analyse du dispositif, pas une validation de la CNIL.

| Usage actuel | Exemption | Cible proposée pour réduire les stockages |
|---|---|---|
| **Langue**, cookie 365 jours | **Fondée** pour une personnalisation attendue sans réutilisation ; durée à justifier | Utiliser les chemins `/en`, `/de` et les liens. Si une mémoire intervisites est conservée, en faire un service explicitement demandé et borné |
| **Galerie**, cookie visiteur | **Fondée** pour maintenir l’authentification demandée | Garder un jeton opaque de session sans nom ni donnée métier. « Se souvenir » reste un choix distinct ; borner sa persistance au besoin utile |
| **Récapitulatif Bonjour**, cookie 15 min | **À justifier** pour le retour immédiat demandé ; purge actuelle imparfaite | Confirmation dans la réponse POST, avec prévention des soumissions répétées : plus de cookie ni de magasin de récapitulatifs |
| **J’aime**, localStorage sans durée | **Mémoire indéfinie non justifiée** par le seul clic | État du geste sur la page courante ; après rechargement, ne plus prétendre retrouver le choix personnel |
| **Mouvement réduit**, localStorage | **Défendable** pour une préférence demandée ; durée indéfinie à justifier | `prefers-reduced-motion` et choix de la page courante |
| **Retour galerie**, sessionStorage 3 h | **À justifier** pour la continuité du parcours | Liens explicites, ancre de photo et historique natif, sans magasin applicatif supplémentaire |
| **Plein écran**, sessionStorage | **Défendable** pour poursuivre le mode demandé | Gérer l’état dans la page ; renoncer au rétablissement automatique entre pages |
| **Audience**, empreintes quotidiennes en mémoire serveur | L’absence de cookie ne suffit pas à trancher ; mécanisme et conditions à documenter | Compteurs de pages/photos sans visiteurs uniques : retrait des empreintes et du dédoublonnage d’audience |

Retirer une mémoire change parfois une fonction. Perdre une restauration après rechargement n’est pas conserver le service à l’identique : le tableau expose ce compromis. **Ne pas remplacer le cookie de galerie par un secret dans l’URL**, qui exposerait les accès aux historiques, journaux et partages.

Pour l’audience, les conditions CNIL comprennent l’usage limité au compte de l’éditeur, des statistiques anonymes, l’absence de rapprochement et de suivi multisite. Le code a des propriétés favorables ; son auto-évaluation complète et l’installation réelle restent à établir. Les durées de treize et vingt-cinq mois ne sont pas des autorisations universelles pour tous les cookies. Voir la [CNIL sur la mesure d’audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience).

### 3.2. Sécurité

- Formulaires : imposer le chiffrement des données privées ; le coffre actuel revient au clair sans clé.
- Galerie : garder sessions, droits et révocations côté serveur ; supprimer le cache navigateur des images privées, aujourd’hui autorisé par `private, no-cache`.
- Photo offerte : retirer les JPEG conservés après calcul lorsque le recalcul à la demande suffit.
- J’aime : le serveur conserve aussi une clé IP/photo ; retirer localStorage ne supprime pas ce traitement. Nécessité, minimisation et purge doivent être traitées séparément.
- Réponses privées : `no-store`, aucun contenu personnel dans l’URL, pas de copie des valeurs dans les preuves ou journaux ordinaires.

Sources : [server/vault.js](../../server/vault.js), 27–58 ; [server/routes/public.js](../../server/routes/public.js), 66–94 et 121–133 ; [server/routes/prive.js](../../server/routes/prive.js), 349–402 ; [server/feedback.js](../../server/feedback.js), 9–41.

### 3.3. Technique et expérience cible

Le public reste accessible sans fenêtre d’acceptation globale. La langue suit les liens. L’invité ouvre sa galerie par lien et mot de passe ; une information courte explique la session nécessaire et la durée de « Se souvenir » si l’option reste. Chaque formulaire explique son traitement. La page Confidentialité reste accessible.

Il s’agit d’une **cible après corrections** : cookies de langue/récapitulatif et mémoires locales existent encore dans la version auditée. Il ne faut pas publier un texte affirmant leur suppression avant de la livrer.

## 4. Administration

### 4.1. Conformité des usages du navigateur

| Usage | Qualification | Cible proposée |
|---|---|---|
| Session équipe | Authentification nécessaire : exemption fondée | Jeton opaque protégé, données serveur chiffrées, purge des lignes expirées |
| Transaction OIDC | Nécessaire à la connexion demandée | Confidentialité de l’état contenant une identité ; échéance serveur ; maintien de PKCE/state/nonce |
| Transaction Instagram | Nécessaire à la connexion Instagram demandée | State protégé et borné ; traiter expiration et remplacement entre onglets |
| `flash` et `toast` | Retour d’action utile ; transport de données personnelles non démontré nécessaire | Codes de messages fermés, texte générique ; détails privés sur l’écran métier autorisé |
| Langue, thème, densité, aperçu | Personnalisation potentiellement exemptée ; le rôle admin n’exonère pas de l’analyse | État courant ou préférence de compte protégée, sans mémoire navigateur inutile |
| Secours local Carnets | La copie intercomptes sans durée n’est pas justifiée par la seule fonction d’édition | Retirer localStorage ; garder formulaire courant, réessai et brouillon serveur protégé |

Une préférence associée à un compte peut rester personnelle même déplacée sur le serveur. Son besoin, sa durée et son effacement doivent la suivre.

### 4.2. Sécurité : problèmes objectifs

1. **Comptes, sessions et certains journaux admin restent lisibles dans SQLite**, même avec DATA_KEY : ils ne passent pas par le coffre.
2. **Le brouillon local Carnets reste en clair après logout.** La reprise par un second compte autorisé a été reproduite.
3. **Le flash est signé mais lisible**, avec parfois nom, destinataire e-mail ou libellé d’invité. Il ne respecte pas votre politique, même sans fuite distante démontrée.
4. **Les sessions expirées n’ont pas de purge périodique propre.** Fin de validité et effacement de la ligne ne sont pas équivalents.
5. **La configuration de production accepte HTTP.** Secure et `__Host-` dépendent de PUBLIC_URL ; le démarrage doit refuser cette incohérence.

Sources : [server/accounts.js](../../server/accounts.js), 19–20 ; [server/sessions.js](../../server/sessions.js), 13–49 ; [server/routes/admin.js](../../server/routes/admin.js), 267–285 et 1210–1254 ; [public/admin/carnet.js](../../public/admin/carnet.js), 41–96 ; [server/config.js](../../server/config.js), 40–64 et 159–160.

### 4.3. Technique

L’alignement de l’activité publique/admin avec le renouvellement du cookie, le refus propre d’un stockage navigateur indisponible et les onglets Instagram sont des sujets techniques distincts. Ils ne prouvent pas, seuls, une infraction RGPD. Les rotations, droits relus et contrôles CSRF existants doivent être préservés.

## 5. Vigie

### 5.1. Conformité

Les deux cookies applicatifs de la console servent sa connexion et sa transaction : **exemption fondée pour cet usage exclusif**. Le thème local est une préférence évitable. Access/Zitadel ne justifie pas toute collecte ou durée du journal.

Le [dossier RGPD existant](../wiki/RGPD-Vigie.md) retient l’intérêt légitime pour la sécurité, avec une mise en balance à finaliser. Il distingue dossier technique et registre légal des violations. Information, habilitations, contrats et garanties de transfert doivent correspondre à l’installation réelle. La durée d’un dossier d’incident ne découle pas automatiquement de celle du journal ; **D38 reste partiellement ouverte**.

### 5.2. Sécurité : écarts avec la nouvelle politique

| Ensemble | Protection actuelle | Écart et cible |
|---|---|---|
| Journal et projections | Chaîne HMAC, accès restreints | Contenu lisible : chiffrer les données privées, y compris projections et copies, sans casser l’intégrité vérifiable |
| Sessions/transactions console | Empreinte du jeton, délais, Access/MFA, droits | Identité, contexte, CSRF et transaction lisibles en base : minimiser/chiffrer |
| Tampon d’envoi côté site | Droits fichiers restrictifs ; signature au transport | Lots écrits en clair sans MAC conservé dans ce format : enveloppe chiffrée/authentifiée, vérifiée avant réémission |
| Décisions locales | Payload signé Ed25519 et vérifié | Contenu lisible ; chiffrer l’enveloppe locale et protéger ses métadonnées sans perdre la signature d’origine |
| Sauvegardes/exports | Restrictions d’accès et fonctionnelles | Pas de chiffrement applicatif général des instantanés : couvrir toutes les copies, leurs clés et leur durée |

Sources : [RGPD-Vigie](../wiki/RGPD-Vigie.md), 18–25 et 53–78 ; [vigie/console/sessions.js](../../vigie/console/sessions.js), 17–76 ; [server/securite/index.js](../../server/securite/index.js), 212–223 ; [server/securite/decisions.js](../../server/securite/decisions.js), 78–94 et 160–165. Cela décrit le format applicatif, pas le chiffrement du disque réel, non vérifié.

### 5.3. Technique : préserver les états de sécurité

Le tampon évite de perdre des événements pendant une panne ; les décisions locales maintiennent les protections sans accès à la Vigie. Sessions, autorisations, révocations et reçus de suspension sont des états nécessaires. Il faut les **minimiser, chiffrer/authentifier et purger**, plutôt que les supprimer comme une optimisation de rendu.

La rotation du jeton/CSRF après réauthentification console est un durcissement distinct. Chiffrer le journal affecte recherches, corrélations, exports et chaîne : aucune réécriture rétroactive ou attribution silencieuse de DATA_KEY à la Vigie. D6 et NC2, notamment le contrôle indépendant des rôles sur les sauvegardes, doivent être préservés ou explicitement adaptés. Voir les [contraintes détaillées](protections-et-caches.md).

## 6. « Aucune donnée en clair, tout signé » : politique opérationnelle

### 6.1. Les mécanismes ont des rôles différents

| Mécanisme | Apport | Limite |
|---|---|---|
| Signature numérique | Origine et intégrité vérifiables | Le contenu reste lisible |
| MAC/HMAC | Authenticité et intégrité avec une clé partagée | Ne chiffre pas ; pas une signature personnelle |
| AES-GCM ou autre chiffrement authentifié adapté | Confidentialité et détection des altérations | Ne justifie aucune collecte ou durée supplémentaire |
| Empreinte d’un jeton aléatoire | Vérifier le secret sans stocker sa valeur brute | Ne chiffre pas les autres champs ni n’anonymise la personne |

La [CNIL distingue chiffrement, hachage et signature](https://www.cnil.fr/fr/securite-chiffrement-hachage-signature). Votre objectif se traduit par **« données privées chiffrées et authentifiées ; états transmis et preuves d’origine protégés »**. L’étiquette AES-GCM fournit déjà une authentification ; une signature supplémentaire n’est utile que pour une fonction distincte, par exemple vérifier une origine avec une autre clé.

### 6.2. Règles cibles

1. **Navigateur :** aucun contenu métier personnel intelligible en cookie, localStorage, sessionStorage ou URL. Garder seulement les jetons opaques nécessaires : ils restent des identifiants pseudonymes à protéger, pas des données anonymes. Pour satisfaire l’exigence d’authenticité, protéger les états transmis par MAC ou enveloppe authentifiée, avec échéance serveur.
2. **Serveur :** chiffrer/authentifier les données privées conservées, y compris comptes, sessions, métadonnées corrélables, journaux, tampons et copies nécessaires. L’empreinte du bearer reste préférable à sa conservation réversible.
3. **Clés :** absence ou incompatibilité de clé = refus d’écrire en clair. Vérifier un témoin de clé, protéger la restauration et séparer les clés des copies de données.
4. **Transit :** HTTPS public obligatoire, échanges interservices protégés, signatures vérifiées. Une signature transport ne protège pas la confidentialité d’un fichier en attente.
5. **Copies :** sauvegardes chiffrées, provenance vérifiable, exports maîtrisés, purges effectives et restauration vérifiée. Un export lisible demandé constitue une remise autorisée, à transmettre de façon protégée sans copie durable inutile.

Une enveloppe signée ne rend pas inutilisable un jeton volé : Secure, HttpOnly, durée, révocation et contrôles de contexte restent nécessaires. Le chiffrement actuel n’authentifie pas le rattachement d’un champ à sa ligne/colonne par AAD ; ne pas présenter cette protection comme acquise. Sa conception versionnée est déjà un sujet ouvert du projet.

**Le clair est temporairement nécessaire pour saisir, traiter ou lire une donnée autorisée.** Le serveur doit déchiffrer une fiche pour l’afficher. La politique réalisable interdit les copies durables privées en clair et les caches évitables ; elle ne peut promettre qu’aucune donnée affichée ne sera jamais déchiffrée en mémoire. Photos et noms volontairement publiés relèvent de leur finalité de publication. Cela n’autorise aucune copie cachée supplémentaire.

DATA_KEY est aujourd’hui **facultative**, avec simple avertissement en production : [server/config.js](../../server/config.js), 88–89 ; [server/index.js](../../server/index.js), 22–23 ; [server/vault.js](../../server/vault.js), 8 et 27–58. Même présente, elle ne couvre pas toutes les tables. Votre règle demande donc des changements effectifs, pas seulement une case déclarative « disque chiffré ».

## 7. Caches et alternatives

**`no-cache` permet le stockage avec revalidation ; `no-store` demande de ne pas conserver la réponse dans un cache.** No-store ne peut empêcher un destinataire autorisé d’enregistrer un fichier ou de faire une capture. Voir la [RFC 9111, § 5.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2).

| Copie actuelle | Alternative proposée | Compromis |
|---|---|---|
| Brouillon local | Formulaire courant, réessai, brouillon métier serveur chiffré | Saisie non sauvegardée perdue en cas de fermeture/crash |
| Récapitulatif Bonjour + cookie | Confirmation directe du POST | Adapter le parcours et prévenir les doublons |
| Données privées dans flash/toast | Code fermé et texte générique | Détails dans l’écran métier |
| Empreintes d’audience | Agrégats pages/photos uniquement | Renoncer aux visiteurs uniques |
| Mémoire IP/photo des J’aime | Réactions sans unicité, ou état anti-abus strictement justifié | Doubles réactions possibles ; préserver les vraies limites de sécurité |
| Images privées en cache navigateur | `private, no-store` | Davantage de transferts, abandon du bénéfice des réponses 304 |
| JPEG offerts gardés en mémoire | Recalcul ; mutualiser seulement les calculs simultanés puis retirer les buffers | CPU/latence ; concurrence bornée |
| JPEG privés gardés sur disque | Rendu et transmission sans conservation après envoi | Recalcul et adaptation des archives |
| Mémoires d’interface | État courant, liens non sensibles, système, ou préférence métier protégée | Perte de certaines restaurations |
| CSS, fontes et ressources publiques en cache | Pour appliquer littéralement la règle : servir à nouveau à chaque demande | Coût réseau/latence ; sujet technique, sans bénéfice de confidentialité pour un fichier non personnel |

Les sources et variantes publiées constituent les ressources servies, pas seulement un cache opportuniste. Les états de sécurité du § 5.3 ne doivent pas non plus disparaître sous ce nom.

Retirer le code d’un ancien stockage ne l’efface pas sur les appareils déjà utilisés. Le changement doit aussi traiter les cookies et entrées locales obsolètes ainsi que les copies serveur antérieures, sans fermer des sessions sans raison. No-store ne nettoie pas rétroactivement tous les fichiers déjà conservés.

**Priorité : retirer les copies privées évitables.** Aucune exception implicite n’est décidée pour les caches publics : leur désactivation est possible, mais relève d’un lot technique distinct. Il ne faut pas la présenter comme une obligation CNIL concernant des fontes publiques.

Le choix actuel du cache d’images privées était motivé par la sobriété ; `no-store` est déjà envisagé dans l’[annexe des galeries, § 3.5](../etudes/annexe-galeries-privees-securite.md). Votre règle donne l’orientation nouvelle, sans modification encore livrée. Le récapitulatif Bonjour doit rester « jamais sur disque » : le déplacer vers SQLite rouvrirait cette décision ; le rendu direct évite le stockage.

## 8. Programme de corrections par catégorie

**Conformité** indique un résultat réglementaire à assurer, sans imposer une implémentation particulière. **Politique projet** désigne votre exigence plus précise. **Technique** désigne un moyen ou un compromis.

| Travail | Catégorie | Périmètre | Preuve attendue |
|---|---|---|---|
| Consigner finalités, bases légales et exemptions | Conformité | Public / admin / Vigie | Chaque opération restante sur le terminal est justifiée ; les opérations soumises à consentement sont retirées ou consenties avant activation. Bases légales serveur examinées séparément |
| Harmoniser Confidentialité, Droits, registre et information d’équipe | Conformité / transparence recommandée | Trois périmètres | Information RGPD obligatoire pour les données personnelles ; transparence recommandée sur les traceurs exemptés sans données personnelles. Textes exacts FR/EN/DE |
| Fixer/exécuter les effacements | Conformité + technique | Sessions, récapitulatif, Vigie et copies | Purge sans nouvelle connexion ou requête opportuniste |
| Refuser production HTTP et clés absentes/incompatibles | Sécurité / politique projet | Site et composants concernés | Démarrage incohérent refusé, aucune écriture silencieuse en clair |
| Protéger tables et copies aujourd’hui lisibles | Sécurité / politique projet | Admin / Vigie | Copies illisibles sans clé, altération détectée, restauration et contrôles indépendants préservés |
| Retirer brouillons locaux et données privées des notifications | Sécurité + minimisation | Admin | Aucun texte privé persistant dans le navigateur |
| Retirer caches privés remplaçables | Sécurité / technique | Public privé / back-office | No-store et aucun rendu recréable conservé après traitement |
| Simplifier mémoires d’interface et audience | Technique / minimisation | Public surtout | Absence des anciens stockages, parcours visibles vérifiés, métriques adaptées |
| Échéance OIDC et rotation console | Sécurité | Admin / Vigie | Transaction tardive refusée localement ; ancien jeton inutilisable après rotation si retenue |
| Relever prestataires et configuration réels | Conformité / exploitation | Cloudflare / Zitadel / Meta | Domaines, fonctions, durées et garanties documentés, valeurs des secrets masquées |

**Ordre conseillé :** fermer les voies de stockage privé en clair et les incohérences de configuration ; retirer copies navigateur et caches privés ; garantir les purges ; finaliser exemptions et textes selon les fonctions conservées. Les vérifications prestataires peuvent avancer en parallèle. Une information déjà inexacte doit être corrigée sans attendre la fin des chantiers.

## 9. Conditions pour conclure sans consentement global

La conclusion sera étayée lorsque :

1. aucun stockage facultatif sur le terminal ne sera imposé pour voir le site ;
2. chaque opération de lecture/écriture sur le terminal restante sans consentement aura une finalité exclusivement exemptée et une durée nécessaire documentées ;
3. les opérations sur le terminal sans exemption établie auront été retirées ou resteront inactives avant un éventuel choix contextuel ;
4. les services d’infrastructure réellement activés auront été inclus ;
5. l’information décrira le comportement livré et les obligations RGPD connexes seront traitées.

Le chiffrement n’accorde aucune exemption supplémentaire ; l’entrée dans l’admin non plus. Inversement, une préférence fonctionnelle exemptée ne demande pas de faire cliquer tous les visiteurs sur « J’accepte ».

Le périmètre de ce rapport est celui des cookies, stockages et données connexes examinés. Les autres traitements du site, notamment publication des photos et droits des personnes, restent couverts par leurs propres analyses et le registre.

## 10. Preuves et état du travail

Le code produit est inchangé. Le diagnostic initial a exécuté **135 tests ciblés réussis**, **4 tests de liens applicatifs réussis** et **13 contrôles complémentaires**, avec une erreur 503 provoquée volontairement et aucune erreur navigateur inattendue. Chromium a réellement vérifié visite neuve, langue, J’aime, déconnexion, secours Carnets et reprise par un second compte autorisé. Ces résultats concernent le code audité, pas les solutions proposées.

- [Inventaire technique et constats détaillés](inventaire-technique.md)
- [Carte des stockages, protections et contraintes](protections-et-caches.md)
- [135 tests ciblés](preuves/tests-cibles.txt)
- [Contrôles HTTP et Chromium](preuves/controles.json)
- [Script ponctuel](preuves/controle.mjs)
- [Liens applicatifs](preuves/liens-internes.txt)
- [Vérification des liens des rapports](preuves/liens-rapport.txt)

Cette révision ajoute des lectures ciblées du chiffrement, des caches et des sources officielles. Ce n’est pas une nouvelle campagne de tests produit. Aucune base réelle, aucun secret ni aucune installation de production n’a été consulté.

## 11. Conserver les fonctionnalités : contraintes à respecter

Le chiffrement en base et dans les cookies est retenu comme exigence de conception. Il doit être authentifié et couvrir les copies privées nécessaires. La conservation d’une fonction n’accorde pas automatiquement une exemption ; inversement, son retrait n’est pas une obligation générale de la loi.

| Fonction à maintenir | Contraintes pour la conserver |
|---|---|
| **Langue et préférences mémorisées** | Choix explicite, contenu limité à la préférence, durée justifiée et effacement accessible. Pour l’équipe : préférence associée au bon compte et protégée. Exemption défendable pour une personnalisation intrinsèque attendue |
| **Galerie et « Se souvenir »** | Session nécessaire, cookie chiffré/authentifié, droits serveur vérifiés et bornés. Persistance demandée séparément ; une durée de cookie ne prolonge jamais l’accès. Maintenir révocation, rotation et sortie |
| **J’aime retrouvé après rechargement** | Définir et expliquer le service de mémorisation sur cet appareil, limiter les données et la durée, permettre retrait et effacement. Le seul clic « J’aime » ne prouve pas l’exemption de toute persistance ; si elle n’est pas établie, choix préalable contextuel avant la mémoire durable |
| **Retour galerie et plein écran** | Mémoire limitée à l’onglet ou au parcours utile, contenu minimal, retrait à la fin. Ne pas réutiliser ce contexte pour analyser les habitudes. Exemption à motiver par la continuité du service demandé |
| **Récapitulatif et notifications détaillées** | Maintenir l’usage unique, une courte échéance réellement vérifiée et la séparation des sessions. Chiffrer/authentifier les états nécessaires ; ne pas mettre les valeurs dans l’URL. Le flash peut garder ses détails si son contenu et son rattachement sont protégés |
| **Brouillon de secours après panne/crash** | Une persistance est nécessaire. Si le réseau est coupé, la copie doit être locale : chiffrée, isolée par compte/billet/langue, bornée dans le temps, récupérable seulement avec les autorisations nécessaires. Ne pas stocker la clé de déchiffrement en clair à côté du brouillon. Justifier l’exemption de cette fonction de secours ou proposer un choix contextuel |
| **Statistiques de visiteurs uniques** | Conserver un état temporaire de rapprochement, documenter l’auto-évaluation audience, ne produire que des statistiques anonymes, sans rapprochement avec comptes/galeries/Vigie, sans suivi multisite ni réutilisation tierce incompatible. Purger réellement les empreintes. Le chiffrement ne transforme pas les identifiants en données anonymes |
| **Détections et enquêtes Vigie** | Préserver les événements utiles, les recherches, les corrélations et les contrôles indépendants pendant les durées justifiées ; concevoir le chiffrement sans casser la chaîne ni distribuer les clés du site à la Vigie par commodité |

Pour la qualification des mémoires d’interface et le consentement éventuel, voir les [règles CNIL sur les traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi). L’analyse de nécessité doit porter sur le service réel : le simple fait de nommer un stockage « fonctionnel » ou « nécessaire » ne suffit pas. Pour les statistiques, voir les [conditions CNIL d’exemption d’audience](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience).

### 11.1. Distinguer l’état nécessaire d’un cache de confort

Une mémoire permettant de retrouver un choix ou une saisie fait partie de la fonction si cette reprise est demandée. Un cache de rendu accélère un résultat que l’on peut recalculer. Les deux doivent être minimisés et sécurisés ; les nommer différemment ne crée aucune exemption. En revanche, on ne peut pas supprimer tout état de reprise et garantir une reprise identique après fermeture.

Les caches de JPEG privés peuvent être remplacés par du calcul à la demande en conservant les mêmes photos et droits. Cela préserve la fonction, avec un coût CPU/réseau et éventuellement une latence supérieurs à mesurer. Une copie locale de brouillon ne peut pas être remplacée par le serveur pendant une coupure réseau. Si aucune copie locale durable n’est acceptée, la reprise après fermeture hors ligne ne peut être garantie.

### 11.2. Conditions communes de sécurité et de conservation

- Chiffrement authentifié, clés séparées, formats versionnés ; aucune écriture en clair si la clé manque ou ne correspond pas.
- Cookies nécessaires : Secure, HttpOnly, SameSite adapté au parcours, portée limitée, échéance vérifiée côté serveur et révocation. Le chiffrement n’empêche pas le rejeu d’un cookie volé.
- Cloisonnement public/admin/Vigie et séparation des comptes ; aucune reprise de brouillon ou de notification par le mauvais compte.
- Durée justifiée pour chaque fonction ; expiration d’accès et suppression physique clairement distinguées. Le nettoyage local dépend aussi de l’exécution du navigateur : ne pas promettre un effacement exact appareil éteint.
- Effacement des copies obsolètes et anciennes données après migration, dans les limites documentées des sauvegardes et restaurations.
- Information précise sur les mémoires et les traitements ; consentement préalable seulement là où il est requis. Les traitements serveur disposent séparément de leur base légale RGPD.
- Vérifications de maintien fonctionnel : retrouver les préférences, retrouver/retirer un J’aime, reprendre le bon brouillon, compter les indicateurs annoncés, maintenir droits, révocations et détections.

**Toutes les fonctions peuvent rester proposées ; leur activation durable par défaut sans aucun choix supplémentaire ne peut pas être garantie pour une opération dont l’exemption n’est pas établie.** Un choix contextuel concerne alors la fonction demandée et laisse la visite publique libre. La conservation indéfinie de données ne devient pas nécessaire au seul motif de préserver un historique.
