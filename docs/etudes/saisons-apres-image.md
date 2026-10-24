# Les saisons : expositions et vote consultatif

| | |
|---|---|
| Statut | Mise en œuvre dans les PR #218 à #224 : socle, atelier, visite publique, bilans/collections, propositions validées et vote consultatif consenti, avec vérifications métier et navigateur. Toutes les PR restent en brouillon ; aucune fusion ni mise en ligne effectuée. |
| Date | 23 octobre 2026 ; précision du mécanisme de vote le 24 octobre 2026. |
| Objet | Expositions photographiques datées, couverture publique avant ouverture, archive complète pendant 12 mois et prolongements éditoriaux vers les collections. Le pilote participatif est un vote consultatif sur des photos proposées à l’avance. |
| Références | [Développer](../wiki/Développer.md), [Spécifications](../wiki/Spécifications.md), [Tests](../wiki/Tests.md), [Sécurité](../wiki/Sécurité.md), [RGPD](../wiki/RGPD.md), [besoins de la Vigie](vigie-besoins-des-briques.md). |
| Lecture | **Décidé** : réponse explicite du propriétaire. **Proposé** : détail fonctionnel à confirmer. **Ouvert** : arbitrage encore nécessaire. **Différé** : hors du pilote, sans collecte ni activation implicite. |

Cette révision remplace le pilote Après-image fondé sur une composition créée par le visiteur. Le visiteur vote désormais sur des photographies déjà proposées et validées. Il ne dépose ni image, ni composition, ni commentaire. La conception antérieure reste documentée au § 8 pour une évolution future.

## 1. Décisions et périmètre retenu

Les orientations SA-D1 à SA-D4 et SA-D7/SA-D8 restent la base : priorité aux **Saisons**, exposition datée avec accrochage ordonné, séries conservées, visite libre et accès direct aux collections ; les photographes gardent la décision artistique et peuvent ne rien retenir. L’évolution participative demeure facultative.

Les anciennes SA-D5 (triptyque composé par le visiteur) et SA-D10 (Écho/Contraste/Déplacement) sont **différées**. SA-D6 conserve son sens uniquement pour cette future contribution ; un vote du pilote n’est pas une composition à publier. L’ancienne SA-D9 est remplacée concernant le vote : le **vote consultatif entre dans le pilote**, les invités et dépôts externes restent différés.

| Id | Point de la liste soumis au propriétaire | Décision retenue |
|---|---|---|
| SA-D11 | 8 — Navigation | Le nom public de la rubrique est **Expositions**. « Les saisons » reste le concept éditorial. |
| SA-D12 | 9 — Accueil | **L’administrateur seul choisit ce que l’accueil met en avant**. Le photographe et le relecteur ne décident pas de cette mise en avant. Une sélection absente, retirée ou dont l’archive est échue rend la place à l’ouverture habituelle ; aucune autre exposition n’est choisie automatiquement. |
| SA-D13 | 10 — Avant ouverture | **Couverture publique** avant l’ouverture. Cela n’autorise pas la visite anticipée de l’accrochage ; le titre et les dates accompagnent la couverture dès programmation. Aucun texte ni cartel de la visite n’est révélé avant ouverture. |
| SA-D14 | 11 — Archive | **Conserver l’exposition complète pendant 12 mois**. Douze mois calendaires UTC après la clôture, puis bilans et liens vers les collections ; la durée ne vaut pas décision d’effacer les photos de leur série. |
| SA-D15 | 12 — Contenus | Ajouter **sous-titre, prologue, conclusion, couverture et cartels propres à l’exposition**. Les limites réalisées sont précisées au § 6. |
| SA-D16 | 13 — Langues | **Français, anglais et allemand requis pour publier**. Une traduction manquante n’est plus silencieusement remplacée par le français dans ces nouveaux contenus. |
| SA-D17 | 14 — Bilans | **Un bilan publié est immuable**. Une correction se publie dans un **second bilan rectificatif**, relié au précédent ; le premier n’est pas réécrit. |
| SA-D18 | 14 — Prolongement | Un prolongement se **présente comme une nouvelle exposition**, avec son intention et son accrochage propres. Cette présentation ne transforme pas implicitement une collection permanente en exposition limitée dans le temps. |
| SA-D19 | 15 — Proposition et validation | Le **photographe d’origine propose** ; **le relecteur et l’administrateur valident**. Dans le pilote, ce circuit porte sur les photos proposées au vote. Il ne décide pas à lui seul de tous les droits de gestion des saisons. |
| SA-D20 | 15 et réponse complémentaire — Ordre | La **direction de publication peut réordonner les propositions**. La réalisation utilise le rôle distinct **Direction de publication** et la permission `saisons.vote_ordonner`, sans attribution automatique à l’administration. Chaque changement de liste ou d’ordre invalide les deux validations. |
| SA-D21 | 16/17 — Participation | **Vote sur des photos proposées à l’avance, sans compte ni identité déclarée**. Aucun dépôt ou mécanisme de suggestion de photo par un visiteur dans le pilote. Documenter cette seconde approche pour plus tard. |
| SA-D22 | 20 et réponses complémentaires — Unicité | **Un vote possible sur chaque photo** ; limitation par navigateur acceptée, avec **cookie**, sans compte. Le contrat retenu est une voix par couple **photo/exposition pour ce navigateur**. Un même navigateur peut donc voter sur plusieurs photos de l’exposition, une fois sur chacune. |
| SA-D23 | 18/19/21/22 — Reports | Mettre en attente visibilité/conservation des anciennes contributions, publication/attribution de ces contributions, branches successives et photographes invités. Ces points ne sont pas des dépendances du vote simple. |
| SA-D24 | 23 — Portée du vote | **Consultatif**. Aucun classement ne publie automatiquement une photo dans les collections et aucun engagement de permanence n’est promis. Les autres formats se décideront plus tard. |
| SA-D25 | 24 octobre — Limitation et traceurs | Accord pour **instruire un identifiant aléatoire minimal dans un cookie créé au premier vote**, sans fingerprinting. Cette étude est suivie de SA-D28 : consentement explicite dans le premier formulaire, sans bandeau global ni exemption revendiquée. |
| SA-D26 | 24 octobre — Matrice de droits | Le propriétaire valide : **photographe prépare ses expositions et propose ses photos ; relecteur valide les propositions ; administrateur programme, publie, retire et choisit l’accueil ; permission distincte de direction de publication pour réordonner, sans attribution automatique**. S1b raccorde préparation/lecture/publication/accueil ; V0 raccorde les propositions et la direction de publication. |
| SA-D27 | 24 octobre — Calendrier et archive | **UTC, saisie à la minute ; archive complète pendant 12 mois calendaires depuis la clôture, puis page de bilan et liens vers les collections**. |
| SA-D28 | 24 octobre — Premier vote et conservation | **Consentement explicite au premier vote, intégré au formulaire sans bandeau global ; suppression du cookie et des identifiants de vote à la clôture ; seuls les totaux sont conservés**. Cette voie est validée pour avancer sans déclarer une exemption juridique acquise. |

La réponse initiale « un seul vote par visiteur » est précisée par la réponse complémentaire « un vote possible sur chaque photo ». Le cookie accepté repère le navigateur dans le périmètre de l’exposition ; il ne représente pas une personne vérifiée. Effacer ses cookies ou changer d’appareil peut permettre un nouveau vote : cette limite est acceptée pour le pilote et doit être annoncée fidèlement.

Les réponses complémentaires SA-D26 à SA-D28 tranchent les droits de départ, le calendrier et le parcours de consentement. Le gel après programmation et le retrait sans réouverture restent les comportements du socle ; une évolution ultérieure devra être explicite.

## 2. Objets et règles communes

| Objet | Rôle fonctionnel |
|---|---|
| Série | Classement photographique existant, conservé. Une photo ne change pas de série quand elle rejoint une exposition ou un prolongement. |
| Saison / exposition | Exposition datée, avec textes, couverture et ordre propres. La rubrique publique se nomme Expositions. |
| Accrochage | Ordre éditorial des photos ; aucun nombre multiple de trois n’est exigé. |
| Annonce | Présence avant ouverture, avec couverture publique. Son contenu additionnel est distinct de la visite de l’exposition. |
| Proposition au vote | Photo existante choisie à l’avance par le photographe d’origine et validée par le relecteur et l’administrateur. |
| Vote consultatif | Soutien à une photo proposée, une fois par photo, par exposition et par navigateur reconnu. Aucun nouvel objet photographique n’est créé. |
| Bilan | Récit publié après clôture ; la sélection peut être vide. Un bilan publié ne se modifie pas. |
| Bilan rectificatif | Nouveau bilan qui indique ce qu’il rectifie et renvoie au précédent. Il ne l’efface pas. |
| Prolongement / collection | Ensemble éditorial propre, présenté avec le soin et les éléments d’une nouvelle exposition ; sa filiation avec la saison reste lisible. |

Les associations portent sur les identifiants existants des photos ; aucune copie d’original n’est produite. L’autorisation courante d’une photo prime toujours sur son appartenance passée à une saison, à un bilan ou à une collection. Une photo dépubliée ou retirée n’est pas rétablie par une archive, une couverture, un résultat de vote ou une filiation.

## 3. Parcours du visiteur, ordinateur et téléphone

| Écran | Contenu et résultat attendu | Ordinateur | Téléphone |
|---|---|---|---|
| E1 — Accueil | Mise en avant choisie par l’admin, intention courte, dates et visite ; accès direct aux collections. | Une invitation principale, photographie dominante. | Titre et actions lisibles sans recouvrir l’image. |
| E2 — Entrée | Prologue, photographes, dates, accrochage et entrée dans la visite. Avant ouverture : annonce avec couverture, sans accès anticipé aux photos. | Prologue et aperçu lorsque l’exposition est ouverte. | Introduction resserrée, accès direct aux images. |
| E3 — Photographie | Image entière, cartel contextuel, position, précédente/suivante et retour à l’exposition. Si cette photo est proposée au vote, action consultative selon le calendrier décidé. | Clavier en amélioration facultative ; commande de vote explicite. | Commandes visibles ; aucun geste de glisser indispensable. |
| E4 — Conclusion | Conclusion éditoriale, collections et invitation facultative au vote. | Suites lisibles sans classement imposé. | Actions successives simples. |
| E5 — Photos proposées au vote | Choix prévalidé ; vote possible sur chaque photo. Pas d’upload, de triptyque à composer ou de texte libre. | Liste ordonnée, accès à la photo et au cartel, état dans le formulaire de vote. | Liste lisible, action de 44 px au moins, état textuel. |
| E6 — Confirmation | Vote effectivement enregistré, photo concernée et état déjà voté ; retour à la visite ou aux propositions. | Confirmation fidèle à la persistance. | Message bref, aucune inscription demandée. |
| E7 — Archive | Exposition complète conservée pendant 12 mois ; bilan en préparation, puis bilan et éventuels rectificatifs. Le vote n’est pas présenté ouvert après sa clôture. | Archive et récit éditorial. | Même contenu, lecture verticale. |
| E8 — Collections | Ensembles permanents accessibles directement. | Vue d’ensemble éditoriale. | Liste et liens nommés. |
| E9 — Prolongement | Présentation comme une nouvelle exposition : couverture, intention, accrochage, textes et origine. | Les œuvres puis la filiation. | Filiation textuelle, sans graphe nécessaire. |

La visite libre E1 → E2 → E3 → E4 reste complète sans vote. Le visiteur peut aussi accéder directement aux collections. L’atelier de vote E5 est facultatif ; les emplacements exacts des invitations sur E3/E4 seront vérifiés à la réalisation, sans interrompre la première découverte d’une image.

**Réalisation S2** : annonce dès programmation (titre, dates, couverture) ; rubrique publique en v2/v3, y compris les chambres noires. Les chevauchements n’entraînent aucun choix automatique de l’accueil. Sans sélection valide, l’ouverture habituelle du site demeure. L’admin garde seul la mise en avant.

## 4. Cycle éditorial, dates et archive

| Phase | Effet attendu |
|---|---|
| Brouillon | Préparation privée, textes et accrochage modifiables par les personnes habilitées. |
| Programmée / annoncée | Programmation validée ; titre, dates et couverture publics dès la programmation. L’accrochage complet reste fermé avant ouverture. |
| Ouverte | Visite disponible. Vote pendant la même fenêtre, si la liste de propositions de la version courante est doublement validée et le chiffrement disponible. |
| Close | Exposition en archive complète pendant 12 mois ; vote fermé ; bilan en préparation si nécessaire. |
| Bilan publié | Archive avec bilan immuable ; un rectificatif se publie séparément et reste lié au bilan qu’il corrige. |
| Retirée | Retrait prioritaire : couverture, exposition, archive et accès au vote indisponibles publiquement par ce circuit. |
| Échéance d’archive | Bilans et liens vers les collections restent lisibles, sans photos de l’ancien accrochage ; aucune suppression de photothèque ou de collection ne découle automatiquement de la durée de 12 mois. |

Le socle S0 enregistre des instants et calcule la visibilité à la lecture : ouverture incluse, clôture exclue. Il permet déjà les chevauchements, fige textes et ordre dès programmation, autorise l’annulation d’une programmation avant ouverture et ne propose pas de réouverture après retrait. Ces comportements restent ceux du pilote, conformément aux précisions de calendrier et de droits validées.

**Décidé** : UTC et minute. S1b conserve le gel après programmation, l’annulation avant ouverture et le retrait sans restauration du socle. Réouverture, suppression physique et restauration restent des évolutions à cadrer ; elles ne sont pas annoncées disponibles dans ce pilote.

L’exposition complète reste consultable **12 mois calendaires UTC après sa clôture**, puis son adresse conserve les bilans et les liens vers les collections. Le parcours photographique de l’exposition cesse à cette échéance ; la photothèque et les collections permanentes gardent leurs règles propres. Les identifiants et cookies de vote expirent à la clôture, selon SA-D28.

## 5. Vote consultatif et circuit de validation

### 5.1 Choix et ordre des photos

Le photographe d’origine propose les photos soumises au vote. La liste requiert deux validations, celle du relecteur et celle de l’administrateur. Une photo doit être existante, publiée et encore autorisée au moment de l’exposition et du vote. Le pilote n’a aucun dépôt externe.

La direction de publication peut réordonner ces propositions. Le propriétaire a demandé une responsabilité distincte de l’administration : le rôle **Direction de publication** reçoit l’accès à l’administration, la lecture des expositions et le réordonnancement des propositions. L’admin ne reçoit automatiquement ni ce droit ni la relecture ; les cumuls de rôles sont explicites. Les validations portent sur une version identifiable : toute modification des photos ou de leur ordre requiert une nouvelle double validation, y compris pendant l’ouverture. La section publique des propositions reprend cet ordre validé et conserve l’accrochage artistique distinct.

La matrice SA-D26 répartit aussi préparation des textes, programmation et retrait. Le photographe prépare les bilans/collections de ses expositions ; l’admin les publie et les retire, le relecteur les lit. Le choix de l’accueil reste réservé à l’administrateur, indépendamment de la direction de publication.

### 5.2 Contrat de vote du pilote

1. Le visiteur peut voter sur **chaque photo du choix prévalidé**, sans compte ni identité déclarée.
2. Une même photo reçoit **au plus une voix de ce navigateur dans cette exposition**. Un vote sur une autre photo du même choix est autorisé.
3. Le cookie accepté sert à retrouver le périmètre du navigateur. Aucune empreinte d’adresse IP, adresse e-mail ou base de comptes ne découle de cette décision.
4. L’écriture revérifie l’exposition, sa phase, la proposition validée et la disponibilité de la photo. Un identifiant fourni par le navigateur n’est pas une autorisation.
5. Un double clic, un renvoi du formulaire ou des requêtes simultanées n’ajoutent pas plusieurs voix. La contrainte métier et la confirmation doivent rester vraies après redémarrage.
6. Le résultat est **consultatif** ; il ne publie ni ne promeut automatiquement une photo dans une collection.
7. Le vote n’écrit ni texte libre ni nouvelle composition, et ne modifie ni l’ordre des œuvres ni leur série.
8. La confirmation suit la persistance effective. Un échec n’affiche pas « vote enregistré » et une répétition dit que le vote existe déjà.

**Décidé avant V1** : consentement explicite au premier vote et expiration du cookie et des identifiants à la clôture. **Réalisation** : données minimales du vote et retrait du consentement ; les compteurs seuls restent après purge. **Réalisation du pilote** : résultats agrégés réservés à l’équipe dans son périmètre, restitution publique par le bilan éditorial et vote dans la fenêtre d’ouverture de l’exposition. La limitation par navigateur est acceptée ; elle ne devient pas une garantie de personne unique sur tous ses appareils.

Le vote d’exposition utilise son propre périmètre et ne réemploie pas le « J’aime » général de la galerie. Réutiliser une même photo dans deux saisons exige deux périmètres de vote distincts.

### 5.3 Informations et conservation

L’absence de compte ne supprime pas le stockage nécessaire au vote et au cookie. La notice du premier vote, Confidentialité FR/EN/DE et le registre RGPD décrivent la finalité, les données et les droits. Le cookie contient un jeton aléatoire ; la base conserve seulement son index propre à l’exposition et une preuve de consentement chiffrée via `server/vault.js`, sans IP ni caractéristiques du navigateur dans les bulletins. Le vote est indisponible sans chiffrement configuré. « Mes votes » permet l’export et le retrait des voix du navigateur, avec correction des totaux pendant l’ouverture.

Les points 18/19 mis en attente par le propriétaire concernent les **anciennes contributions photographiques**, pas une autorisation de conserver indéfiniment les données du vote. À la clôture ou au retrait, purge des votants et bulletins détaillés, maintien des totaux seuls. Le cookie expire à l’heure de clôture ; la base active purge au démarrage, à la minute et lors des lectures du vote. Les sauvegardes suivent leur rotation existante de 14 jours ; une restauration purge les expositions closes, sans prétendre rejouer un retrait individuel survenu après l’instantané. Aucune collecte n’est activée par S0/S1a seuls.

### 5.4 Piste retenue pour l’étude : identifiant minimal au premier vote

Le 24 octobre, après examen de Glassbox et des règles de la CNIL, le propriétaire a accepté d’examiner d’abord un identifiant aléatoire minimal dans un cookie créé au premier vote. Cet accord d’étude est complété par le choix explicite du formulaire de consentement SA-D28 ; aucune dispense de consentement n’est revendiquée. L’objectif est un parcours de vote simple, avec la collecte minimale utile.

Contrat réalisé par V1 : aucun cookie de vote à la simple visite ; identifiant aléatoire sans empreinte Canvas, audio, polices ou matériel ; usage limité à la reconnaissance des votes dans l’exposition, sans profil de navigation ni rapprochement entre expositions. La visite libre reste indépendante du vote. Le consentement au premier vote et la fin du cookie/des identifiants à la clôture sont désormais décidés (SA-D28) ; la notice, l’export et le retrait accompagnent leur réalisation. Les 12 mois de l’archive ne prolongent pas cette conservation.

La [CNIL inclut le fingerprinting parmi les traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi). Remplacer le cookie par une empreinte, du stockage local ou un identifiant haché ne crée donc pas, à lui seul, une exemption. Glassbox est un [banc de diagnostic du navigateur](https://github.com/HotStartLabs/glassbox), pas un mécanisme d’unicité de vote prêt à intégrer ; il n’est pas retenu dans la piste du pilote.

Un traceur strictement nécessaire peut bénéficier d’une exemption, mais [la CNIL précise que la lutte contre la fraude n’en bénéficie pas en général](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ), hors cas particuliers. Cette piste d’exemption n’est pas retenue pour le pilote ; le formulaire recueille le consentement explicite. La documentation doit distinguer les règles d’accès au terminal et les obligations applicables aux données traitées. L’information requise ne disparaît pas au seul motif d’une éventuelle exemption de consentement.

Après cette étude, le propriétaire a choisi le **consentement explicite au premier vote dans le formulaire** (SA-D28). V1 réalise cette voie avec une case non précochée, une information précise et un retrait accessible, sans bandeau global ni exemption revendiquée. À la clôture, les identifiants et preuves de vote sont purgés ; les compteurs agrégés restent. Aucun cookie ou fingerprinting n’est mis en œuvre dans S1a/S1b.

## 6. Textes, bilans et prolongements

| Objet | Cible fonctionnelle | Limites et état actuel |
|---|---|---|
| Exposition | Titre, sous-titre, intention, prologue, conclusion, couverture et dates ; textes FR/EN/DE. | Titre 120 signes ; sous-titre 180 ; intention 4 000 ; prologue/conclusion 2 000 chacun, limites communes au modèle et aux formulaires. |
| Accrochage | Ordre, photos et cartels propres à l’exposition, sans écraser le cartel global. | 500 photos uniques au plus, cartel contextuel de 500 signes. Couverture rattachée à une photo autorisée de l’accrochage. |
| Bilan | Récit et sélection éventuellement vide, titre et liens d’origine ; trois langues avant publication. | Titre 120 et récit 12 000 signes. S3 crée des bilans distincts et reprend les bilans S0 publiés par migration additive, sans inventer leurs traductions. |
| Prolongement / collection | Présentation comme une nouvelle exposition : titre, intention, couverture, accrochage et textes propres, filiation explicite. | Titre 120, sous-titre 180, intention 4 000, prologue/conclusion 2 000, cartels 500 ; aucune nouvelle durée temporaire n’est déduite de cette présentation. |

**Trois langues requises** : les brouillons peuvent être incomplets ; la publication des nouveaux contenus bloque si une version FR/EN/DE nécessaire manque. Les champs éditoriaux facultatifs, lorsqu’ils sont utilisés, ont leurs trois versions. La publication des expositions, bilans et collections vérifie leurs trois langues sans repli silencieux.

Un bilan publié ne se corrige jamais en place. Le rectificatif indique son lien avec le précédent et ce qu’il rectifie ; les liens entre les deux restent lisibles. Le retrait d’une photo prime sur l’immutabilité du texte et sur l’historique des choix. Les bilans publics montrent leurs liens vers le précédent et les rectificatifs suivants, sans écraser le bilan initial.

Le prolongement dispose de sa propre présentation et de son ordre, comme une nouvelle exposition. Il reste distinct du score du vote et garde la filiation éditoriale. Le pilote crée un nouvel ensemble permanent depuis une sélection de bilan. Enrichir une collection déjà publiée reste une évolution distincte ; sa présentation publiée est figée.

## 7. Erreurs et accessibilité

| Situation | Résultat attendu |
|---|---|
| Brouillon, accrochage avant ouverture ou exposition retirée demandés publiquement | Aucun contenu privé ou accès anticipé aux photos ; couverture d’annonce seule selon les règles S2. |
| Traduction nécessaire absente | Publication refusée avec les langues et champs à compléter ; aucune publication partielle. |
| Version concurrente ou proposition changée après validation | Conflit explicite, sans écrasement ni utilisation silencieuse d’un choix non validé. |
| Vote répété, double clic ou concurrence | Une seule voix par photo/exposition/navigateur ; message fidèle, aucun compteur doublé. |
| Exposition close, proposition absente ou photo retirée pendant l’envoi | Refus expliqué, aucune voix persistée pour une cible devenue interdite. |
| Tentative de modifier un bilan publié | Refus ; proposer le parcours de rédaction d’un nouveau rectificatif. |
| Dépublication, suppression ou retrait d’accord d’une photo | La photo cesse d’être servie par ce circuit dans couverture, visite, archive, vote, résultat, bilan, collection et aperçu. |
| Échec serveur | Aucun faux succès ; état précédemment validé intact. |

Les pages et formulaires sont rendus sur le serveur ; visite, vote, erreurs et retours ne nécessitent pas de script. Cibles de 44 px au téléphone, focus visible, champs étiquetés, erreurs associées, état textuel et images entières suivent les règles du projet. L’ordre se modifie sans glisser. Aucun texte indispensable n’est incrusté dans une photo, aucune information ne dépend de la couleur seule.

## 8. Évolutions différées : Après-image et invités

Cette section documente la seconde approche demandée par le propriétaire, **sans la lancer**. Les anciens lots A1/A2 quittent la séquence de livraison du pilote.

| Évolution | Conception conservée pour plus tard | Préalables avant réalisation |
|---|---|---|
| Après-image composé | Ancien pilote SA-D5 : triptyque de trois photos, deux conservées et une remplacée, sans doublon ; relation Écho/Contraste/Déplacement de SA-D10. | Confirmer l’intérêt après le vote simple ; définir trace, identité éventuelle, récupération et maîtrise de la contribution. |
| Suggestions et dépôts de photos | Proposition d’image par un visiteur, éventuellement au-delà de la photothèque existante. | Cadrer comptes si retenus, upload, stockage, droits d’auteur, accords des personnes, retrait, publication, modération et sécurité avant tout développement. Aucune base d’utilisateurs n’est créée par le pilote. |
| Visibilité et conservation des contributions | Ancien point 18, en attente. | Décider données, finalités, visibilité, durées et purge ; pas d’archive perpétuelle implicite. |
| Publication, nom et filiation | Ancien point 19, en attente. Une création reste distincte d’une mise en avant et d’une sélection permanente. | Accord de publication, attribution éventuelle, correction, retrait et devenir des liens après effacement. |
| Branches successives | Ancien point 21, en attente. | Dérivation autorisée ou non, ordre et profondeur maximale. |
| Photographes invités | Ancien point 22, en attente. | Invitation/dépôt, droits, accords, validation et retrait. |
| Autres participations | Commentaire libre, formats plus grands, autre mécanisme de vote. | Nouvelle décision après observation du vote consultatif ; aucun commentaire libre dans le pilote. |

## 9. Arbitrages encore ouverts

| Repère | Décision restante | Dépendance |
|---|---|---|
| SA-Q1 — Résolu pour le pilote | Matrice SA-D26 : préparation propre au photographe, lecture pour le relecteur, administration en portée commune ; propositions/validations et direction distincte dans V0. | S1b / V0. |
| SA-Q2 — Résolu pour le pilote | UTC/minute ; chevauchements possibles, gel/annulation/retrait du socle conservés ; réouverture et suppression physique hors pilote. | S1b/S2. |
| SA-Q9 — Réalisé | Titre, dates et couverture dès programmation ; accueil choisi par admin, ouverture habituelle si sélection absente ou périmée. | S2 / PR #221. |
| SA-Q10 — Résolu | 12 mois calendaires UTC après clôture, puis page de bilan et liens vers les collections. | S2. |
| SA-Q11 — Réalisé | Rôle distinct Direction de publication, sans attribution automatique ; changement de liste/ordre annule relecture et validation. | V0 / PR #223. |
| SA-Q12 — Parcours décidé | Consentement explicite au premier vote ; cookie/identifiants supprimés à la clôture, compteurs conservés ; mise en œuvre de l’information, du retrait et de l’export. Une voix par photo/exposition/navigateur, sans compte. | V1. |
| SA-Q13 — Réalisé | Bilans liés et collections nouvelles autonomes, textes et ordre propres, sans correction en place du bilan publié. | S3 / PR #222. |
| SA-Q3/SA-Q4/SA-Q6/SA-Q7 | Trace, identité et données des anciennes contributions, publication/attribution et branches. Désormais différés au § 8 ; ils ne bloquent pas le vote simple. | Futur Après-image. |
| SA-Q5 | Abus : volet vote traité au contrat V1 ; volet dépôts et contributions différé. | V1, puis évolution future. |
| SA-Q8 | Invités et dépôts externes. | Évolution future séparée. |

Les réponses complémentaires SA-D26 à SA-D28 complètent les arbitrages initiaux. La durée d’archive et la conservation du vote sont distinctes et toutes deux précisées.

## 10. Réalisation : une PR par jalon

| Lot | Livrable et dépendances | Acceptation attendue |
|---|---|---|
| **S0 — Socle, PR #218** | Migration 065 et modèle interne existants, sans route ni nouveau droit. | Règles de dates/états et références atomiques ; projection publique refiltrée. Trois langues obligatoires, annonce, limite d’archive et rectificatifs sont encore des écarts à la nouvelle cible, pas des fonctionnalités annoncées livrées. |
| **S1a — Préparation, PR #219** | Migration 066/version, formulaire transactionnel, conversion de dates à fuseau fourni, quatre gabarits trilingues inactifs et ce plan. | Concurrence/rollback et rendu isolé vérifiés. Aucun choix de droits ou fuseau ajouté en silence ; pas de vote collecté. Les nouvelles décisions sont documentées, pas annoncées implémentées. |
| **S1b — Atelier raccordé, PR #220** | SA-Q1/SA-Q2 validés : droits et portées, menus v1/v2, routes/CSRF/identité, aide, journal ; ajout des contenus du choix 12 et contrôle des trois langues avant publication. | Préparer, traduire, ordonner et programmer ; persistance réelle et refus sans droit, traduction manquante, photo interdite, conflit et date invalide. Mise en avant réservée à admin. |
| **S2 — Visite, annonce et archive, PR #221** | Après S1b et SA-Q9/SA-Q10 : E1 à E4/E7, rubrique Expositions, couverture publique avant ouverture, archive complète 12 mois et accueil sous contrôle admin. | Ouverture/clôture/échéance, aperçu/annonce distincts, trois langues sans repli public manquant ; couverture/photo retirée cachée partout. Aucun faux bouton de vote avant V1. |
| **S3 — Bilans et prolongements, PR #222** | Après S1/S2 et SA-Q13 : bilans immuables, rectificatif comme nouveau bilan lié, E8/E9 et présentation du prolongement comme nouvelle exposition. | Bilan vide ou avec choix ; modification en place refusée ; rectificatif distinct sans écrasement ; filiation lisible et photos encore autorisées. |
| **V0 — Propositions validées, PR #223** | Après SA-Q1/SA-Q11 : proposition par photographe d’origine, validations du relecteur et de l’admin, ordre par direction de publication distincte. | Liste et version approuvées ; refus d’auto-attribution de droits ou d’ordre modifié sans validation du circuit retenu. |
| **V1 — Vote consultatif, PR #224** | Après S2/V0 et SA-Q12 : E5/E6, identifiant minimal au premier vote après consentement explicite contextuel (§ 5.4), une voix par photo/exposition/navigateur, confirmation, information et purge. | Vote sur plusieurs photos possible, doublon sur la même refusé, concurrence/rejeu/redémarrage, clôture et photo retirée ; aucun cookie de vote à la simple visite, information/consentement conforme à la qualification retenue ; résultat consultatif sans publication automatique. |
| **Différé — Après-image, invités et autres formats** | Études et PR séparées après nouvelle demande et décisions du § 8. | Aucune collecte ou interface de dépôt, de commentaire, de composition ou de branche dans les lots précédents. |

S3 peut être livré sans vote : une première exposition et son bilan restent complets sans participation. V0/V1 remplacent A1/A2 dans la séquence prioritaire ; le statut de collections permanentes n’est jamais obtenu automatiquement par un score.

### 10.1 Besoins de la Vigie et preuves attendues par lot

**État courant** : S1b, S2, S3 et V0 raccordent les routes, permissions, textes publics et décisions. Les tests prouvent les transitions de calendrier sans SQL ni attribution au prochain admin, et les publications explicites des bilans/collections attribuées à leur compte. V1 raccorde les formulaires, le consentement, l’export/retrait et la purge du vote ; les deux suites complètes passent 1 446/1 446. Les PR restent en brouillon, sans déploiement. Les cas DS viennent de la [conception du journal](journalisation-securite.md#3-cas-de-détection), les besoins de la Vigie du [registre des briques](vigie-besoins-des-briques.md). Les protections communes existantes ne prouvent pas les routes à venir.

| Lot / surface | Raccordement prévu | Preuves et limites |
|---|---|---|
| **S0/S1a — Interne** | Aucune émission HTTP nouvelle, permission, cookie ou collecte visiteur activée. Modèle et gabarits seuls. | Tests synthétiques et rendu isolé ; aucun nouveau BV réservé ni contrôle de route déclaré livré. |
| **S1b/V0 — Droits et décisions** | `config.perm` sur chaque route ; gardes admin, identité et CSRF. `authz_fail` pour DS10 et `authz_csrf_fail` pour DS14. Respecter les responsabilités distinctes du photographe, relecteur, admin et direction de publication, après définition des permissions. | Refus sans session/droit/CSRF, hors portée si applicable, auteur ou photo falsifiés ; vérification des gels et confirmations d’identité existants ; aucune mutation ni validation partielle sur refus. La mise en avant est refusée au photographe et au relecteur. |
| **S1b/V0 — Saisie et journal** | Crochet commun `malicious_input` (DS11), `input_validation_fail` pour les formes/identifiants forgés (DS12), journal des noms de champs et références numériques via `request.auditChanges`. Les refus métier ordinaires ne deviennent pas des alertes. | Acteurs et décisions réellement persistés selon le modèle approuvé ; valeurs éditoriales, motif sensible ou contenu de fiche absents des événements. Le journal d’audit n’est pas lu par la Vigie. |
| **S2 — Textes publics et annonce** | Adapter [`textes-publics`](../../server/securite/textes-publics.js) aux champs réellement visibles, selon annonce, ouverture et archive ; BV-20/BV-21, DS9, `config_public_changed`. La mise en avant admin et sa clé de réglage relèvent aussi de BV-1/DS23. | Contacts ajoutés et nombre de textes modifiés détectés sans recopier texte/e-mail/téléphone. Pas d’intention privée, de bilan préparé ou de texte d’accrochage prématuré sous prétexte que la couverture est publique. |
| **S2 — Calendrier et échéance** | `watchPublication` avec acteur `sub = null` au changement temporel de visibilité. Adapter l’optimisation `total_changes()` : ouverture et future échéance d’archive peuvent survenir sans écriture SQL. Initialiser l’instantané avant le franchissement. | Horloge contrôlée, aucune autre écriture, détection une fois sans attribution au prochain admin ; redémarrage et passage suivant sans doublon. La clôture conserve les textes de l’archive ; l’échéance suit SA-Q10. La lecture reste autorisée par l’état courant, indépendamment de la minuterie de surveillance. |
| **S2 — Photos et parcours** | Protections communes injections/pièges/404 (DS11/DS12/DS15), examen du chargement d’images pour BV-4 ; variantes existantes uniquement. | Couverture, exposition et archive respectent les retraits. Parcours nominal sans faux positif d’aspiration ; aucun seuil recalé sans risque concret ou observation. Limites existantes des caches déjà reçus explicites. |
| **S3 — Bilan, rectificatif et prolongement** | Étendre BV-20/BV-21 aux seuls nouveaux textes effectivement publiés. Publication du rectificatif observée comme nouveau contenu ; bilan précédent non réécrit. Gardes et journal comme S1b. | Refus d’édition en place, création et liens du rectificatif, absence de textes préparés dans l’instantané ; retrait/photo indisponible propagés. Aucun `sensitive_read` artificiel pour une simple sélection éditoriale. |
| **V1 — Vote et compteurs** | Évaluer BV-6/DS22 (statistiques gonflées), DS12 et DS15, ainsi que les limites/provenance/CSRF adaptées au cookie retenu. Réutiliser les types du [`vocabulaire fermé`](../../server/securite/vocabulaire.js), notamment `input_validation_fail`, `malicious_input`, `excess_rate_limit_exceeded` et les signaux existants de rafale si applicables. | Unicité et compteurs prouvés par persistance, concurrence et redémarrage ; abus et votes sur propositions interdites vérifiés. Un doublon normal ne devient pas une attaque. Ne pas envoyer cookie, jeton, identité ou bulletin complet à la Vigie. Pas d’empreinte IP créée pour contourner la limite acceptée du navigateur. |
| **Évolutions différées** | Réévaluer identité, uploads, lectures/export/effacement sensibles et publication lors d’une future décision. DS18/BV-33 seulement si de vraies données personnelles sont concernées. | Aucun signal, champ de visiteur ou nouvelle collecte implémenté sous couvert de documenter l’Après-image futur. |

Les branchements communs sont dans [`server/securite/site.js`](../../server/securite/site.js), les gardes et le journal dans [`server/routes/admin.js`](../../server/routes/admin.js), les publications programmées dans [`server/app.js`](../../server/app.js). Un aperçu n’est pas un export sensible : ne pas ajouter `config.audit` pour simplement tracer une lecture.

Un manque réellement constaté doit être décrit dans le registre avec son abus, son DS, l’émission minimale manquante et le lot de résolution ; attribuer alors le prochain BV libre. Le besoin BV-35 documente la corrélation du circuit des propositions avec une session reprise, encore à instruire ; sa détection n’est pas déclarée livrée. Aucun nouveau type, moteur ou seuil n’est modifié.

### Définition de « terminé »

Chaque lot livre son code, ses migrations additives, sa documentation et des vérifications proportionnées des effets métier et erreurs. Une interface raccordée s’essaie dans un vrai navigateur sur ordinateur et téléphone, avec persistance et refus, trois langues et sans script. Les données et images sont synthétiques ; aucune base réelle, sauvegarde ou production n’est utilisée.

Chaque PR reste en brouillon, avec contexte, résultats réels, « Sécurité » et « Impact sur la Vigie ». **Chaque PR, y compris interne, porte sa note FR/EN/DE et sa version `1.<numéro de PR>.0`.** La note décrit ce qui est réellement disponible ; une interface activée actualise aussi l’aide. Vérifier les liens documentaires avec `node --test test/liens-internes.test.js`. La fusion appartient au propriétaire.

## 11. État du code et étapes de revue

| PR / lot | Code réalisé dans la pile de branches | État de revue |
|---|---|---|
| #218 / S0 | Migration 065, modèle et références photographiques internes. | Brouillon, non fusionné. |
| #219 / S1a | Migration 066, version concurrente, calendrier et formulaires préparés. | Brouillon, non fusionné. |
| #220 / S1b | Migration 067, atelier raccordé v1/v2, portées et droits, textes/couverture/cartels trilingues, accueil réservé à admin. | Brouillon ; 1 365 tests dans chaque mode et parcours navigateur réel vérifiés. |
| #221 / S2 | Annonce, visite, archive 12 mois UTC, accueil choisi et surveillance temporelle des textes publics. | Brouillon ; 1 376 tests dans chaque mode, Chromium/WebKit ordinateur/mobile vérifiés. |
| #222 / S3 | Migration 068, bilans immuables, rectificatifs, collections autonomes, parcours public et Vigie. | Brouillon ; parcours métier/public et navigateur vérifiés, 1 397 tests dans chaque mode réussis. |
| #223 / V0 | Migration 069, propositions versionnées, double validation et rôle distinct de direction de publication. | Brouillon ; quatre acteurs vérifiés dans le navigateur, 1 407 tests dans chaque mode réussis ; mesures de banc variables, même à code identique : validation de performance sur cible encore à confirmer. |
| #224 / V1 | Migration 070, vote consultatif, consentement, export/retrait et purge ; invitation publique et ordre prévalidé. | Brouillon ; 1 446 tests dans chaque mode et quatre parcours Chromium/WebKit ordinateur/mobile réussis, export réel et effacement persistant vérifiés. |

Les sources de vérité opérationnelles sont les [Spécifications](../wiki/Spécifications.md), l’aide Expositions et les tests de chaque lot. Les scores ne publient jamais automatiquement une œuvre. La fusion de chaque PR reste une décision du propriétaire ; la pile ne vaut pas mise en ligne. Les seuls formats fonctionnels différés sont ceux du § 8, l’enrichissement d’une collection publiée, et les besoins Vigie explicitement encore proposés.

Limites de validation : bases et images synthétiques, aucun service OIDC, installateur ou Cloudflare réel essayé. Le banc de la Vigie a été exécuté avant/après et contrôlé à code identique ; les variations de la machine partagée ne permettent pas d’attester une absence de ralentissement sur cible. Les chiffres et cette limite figurent dans la PR #223.
