# Fiche de traitement des votes consultatifs des expositions

État du code **994a899c8fe1ac663f90671894e5d843d847eb48**, version **1.226.0**, lu le 24 octobre 2026. Cette finalité n’existait pas dans l’inventaire initial de f44cdf3. Lecture statique sans code produit modifié ni test lancé ; aucun déploiement, compte réel, quota gratuit ou comportement de prestataire n’est présumé.

## P09 — Voter et retrouver ses votes dans une exposition

**Service demandé :** voter au plus une fois sur chacune des photographies proposées et validées pour une exposition, avec ce navigateur ; retrouver ses votes, les exporter et les annuler. Le vote est consultatif : aucun score ne publie automatiquement une œuvre. L’équipe dispose de totaux ; les pages publiques ne montrent ni compteur ni classement.

**Décision existante :** consentement explicite au premier vote, sans bandeau global, sans exemption revendiquée ; identifiant minimal sans compte ni fingerprinting ; fin des identifiants à la clôture. Voir [PLAN](../../PLAN.md), 22–44. Cette fiche ne rouvre pas ces décisions. Les critères de consentement, conservation et information sont ceux des [sources R01, R07 et R08](sources.md) ; un résultat de test ne constitue pas une certification CNIL.

### Dépôt du terminal

| Élément | État constaté |
|---|---|
| Nom | `__Host-exposition_vote_<id>` en HTTPS ; `exposition_vote_<id>` en développement HTTP ; une entrée distincte par exposition |
| Contenu | Jeton opaque de 43 caractères base64url, 32 octets. La route le dérive par HMAC d’un nonce/date du formulaire initial avec une clé propre à cet usage ; deux envois du même formulaire retrouvent le même jeton. Ni nom, e-mail, vote ou compte dans sa valeur |
| Portée | Hôte courant, aucun Domain, `Path=/`, HttpOnly, SameSite=Lax ; Secure selon `secureCookies`. Même cookie entre langues |
| Déclenchement | Seulement après validation du formulaire, consentement requis et vote métier accepté. Une visite sans cookie ne crée pas d’identifiant de vote ; le défi de formulaire signé est sans magasin serveur ni cookie préalable |
| Échéance | `Expires` égal à la clôture UTC de l’exposition, sans durée glissante. Les votes suivants réémettent le même jeton avec cette même date. Ce n’est pas un Max-Age fixe universel |
| Fin | Suppression explicite au retrait des votes ; nettoyage à une consultation après clôture/retrait, et expiration navigateur à la clôture initialement annoncée. Le retrait anticipé d’une exposition ne peut effacer à distance un cookie d’un navigateur absent |
| Authenticité/confidentialité | Le jeton est dérivé d’un HMAC mais n’est pas une enveloppe de cookie signée et vérifiée à la lecture par `signed: true`/`unsignCookie`. Il n’est pas chiffré. Sa validation métier se fait via l’index serveur. Le défi CSRF signé ne doit pas être confondu avec une signature du cookie |

Preuves : [expositions-votes.js](../../server/routes/expositions-votes.js), 9–40, 51–68, 153–177, 185–200. Aucun localStorage/sessionStorage supplémentaire n’a été trouvé pour cette fonction.

**Qualification terminal : consentement choisi, sans exemption revendiquée.** La case n’est pas précochée ; l’information indique le but, le caractère facultatif, la durée et les limites ; le formulaire reste utilisable sans JavaScript. Un refus ou une absence d’accord ne déclenche pas de dépôt de vote. La visite de l’exposition reste disponible ; accepter les votes ne vaut pas accepter l’audience ou les services extérieurs.

La version de notice `expositions-vote-1` et un nouvel accord sont exigés lorsque la preuve manque ou porte une ancienne version. Tant qu’une preuve de la version courante existe, les autres votes de cette exposition ne redemandent pas l’accord. Preuves : [vue](../../views/v2/exposition-vote.eta), 21–38 ; [modèle](../../server/saisons-votes.js), 66–89 ; [textes FR/EN/DE](../../server/saisons-votes-textes.js), 4–22, 25–43, 46–64.

### État serveur et minimisation

| Donnée | Finalité, protection et durée |
|---|---|
| Index du navigateur | HMAC du jeton et du numéro d’exposition via le coffre ; sert à retrouver les bulletins propres, sans compte ni IP. Les index de deux expositions sont distincts |
| Preuve de consentement | Instant et version de notice, chiffrés par `vault.seal`. Sans coffre activé, aucune collecte de vote n’est acceptée ; une preuve illisible ne devient pas un accord implicite |
| Bulletins | Numéro d’exposition, photo et index ; permettent unicité, consultation, export et annulation. L’association reste lisible dans les colonnes SQLite : les bulletins ne sont pas intégralement chiffrés par la seule protection de la preuve |
| Totaux | Exposition, photo et entier ; indépendants des votants. Les annulations avant clôture les décrémentent ; les totaux subsistent après suppression des détails |
| Nettoyage | Index/preuves et bulletins supprimés par cascade à la clôture ou au retrait de l’exposition ; purge au démarrage, chaque minute et aux consultations. Hors arrêt/panne, le nettoyage périodique peut attendre le passage suivant ; aucun minuteur ne garantit une suppression à la milliseconde |

Preuves : [migration 070](../../server/db/migrations/070_expositions_votes.sql), 3–25 ; [modèle](../../server/saisons-votes.js), 17–28, 42–54, 66–117 ; [minuterie](../../server/routes/expositions-votes.js), 43–48. L’association index/photos demeure une donnée pseudonyme pendant l’ouverture, pas une statistique anonyme du seul fait que le jeton brut n’est pas en base.

La fonction de vote ne conserve ni IP ni caractéristiques du terminal. Le limiteur commun traite temporairement le réseau des formulaires ; les refus peuvent alimenter le journal de sécurité, traitement distinct. Aucun rapprochement entre cookie de vote, visiteurs uniques, accès privés ou compte n’a été identifié dans ces modules. L’affichage de participation et l’export sont `private, no-store`, `noindex`, `no-referrer` ; les médias publics et leurs caches ne deviennent pas pour autant des données de vote.

### Retrait, export, destinataires

« Mes votes » permet, avant clôture et avec le cookie, d’exporter les photos votées et la preuve minimale, ou de retirer l’accord et toutes les voix de cette exposition. Le retrait efface le votant et ses bulletins, ajuste les totaux, puis supprime le cookie. Il reste proposé même si la preuve est illisible. Sans cookie, le site ne demande pas une identité nouvelle pour tenter de retrouver les votes. La suppression du cookie ne transmet pas elle-même une demande d’effacement au serveur ; les données restantes suivent alors la clôture et sa purge.

L’atelier n’obtient que les totaux dans ce parcours, sous permissions et portée de la saison : [saisons-propositions.js](../../server/routes/saisons-propositions.js), 20–44, [vue admin](../../views/admin/saison-propositions.eta), 10–11. Les totaux exacts à faible volume ne doivent pas être déclarés anonymes sans examen contextuel. La grille d’exemption d’audience ne devient pas automatiquement le régime de cette fonction consentie ; minimisation et risque d’inférence restent néanmoins à examiner. Aucun arrondi ni suppression du résultat éditorial n’est imposé par cette fiche.

La [Confidentialité](../../server/privacy.js), 50–55, et le [registre RGPD](../wiki/RGPD.md), 20, décrivent le vote, le consentement et les sauvegardes existantes de 14 jours. Cela constitue une annonce documentaire ; l’exécution de la rotation en production et le traitement d’une restauration après retrait individuel ne sont pas prouvés par cette lecture.

### Statut et preuves restant nécessaires

**Étayé statiquement :** consentement contextuel avant premier dépôt, case initiale non cochée, notice versionnée en trois langues, maintien de la visite, minimisation de l’identifiant, absence de fingerprinting propre au vote, preuve chiffrée et refus sans clé, export/retrait cloisonnés par navigateur, nettoyage périodique et aux lectures.

**À compléter :** observation des parcours sur le commit actuel, attributs effectivement reçus via l’infrastructure, adéquation de chaque période d’ouverture et de la conservation des totaux, analyse des petits effectifs, copies/sauvegardes et reprise des retraits lors d’une restauration. Le chiffrement/authenticité des états doit inclure ce nouveau cookie et les bulletins liés dans la [conception cryptographique](../etudes/chiffrement-etats-cookies.md) ; le consentement ne remplace pas la politique de sécurité demandée. Aucune durée nouvelle ni architecture n’est décidée ici.

Les tests existants couvrent notamment absence de dépôt initial/accord, attributs HTTPS et clôture, multi-photos/langues, refus sans clé, export/retrait, preuve illisible, journaux et purge sans visite : [expositions-votes-http.test.js](../../test/expositions-votes-http.test.js), 54–106, 172–215, 298–385 ; [saisons-votes.test.js](../../test/saisons-votes.test.js), 59–119, 181–258. Ils ont été rejoués par le contrôle central parmi les [101 tests ciblés réussis](preuves/tests-suivi-technique.txt), sur ce commit. Aucun parcours graphique du vote ni résultat historique n’est présenté comme rejoué par ce suivi.
