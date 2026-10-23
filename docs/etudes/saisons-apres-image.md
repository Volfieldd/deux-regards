# Les saisons et l’Après-image : conception et plan de réalisation

| | |
|---|---|
| Statut | Plan fonctionnel rédigé ; **S0 en PR #218 et préparation indépendante de S1 en cours, en attente de revue**. Aucune interface de saison ni participation publique n’est annoncée comme livrée. L’avancement effectif et les PR figurent dans [`PLAN.md`](../../PLAN.md). |
| Date | 23 octobre 2026. |
| Base de départ | `origin/main` à `f44cdf3`, branche de travail `feat/saisons-socle`. |
| Objet | Une programmation d’expositions photographiques datées, des collections accessibles directement et une participation facultative qui peut prolonger une exposition. |
| Références | [Développer](../wiki/Développer.md), [Spécifications](../wiki/Spécifications.md), [Tests](../wiki/Tests.md), [Sécurité](../wiki/Sécurité.md), [RGPD](../wiki/RGPD.md), [besoins de la Vigie](vigie-besoins-des-briques.md). |
| Lecture | **Retenu** : orientation issue de la conversation. **Proposé** : contrat détaillé à confirmer par la réalisation ou un arbitrage explicite. **À arbitrer** : décision encore ouverte, notamment en matière de droits, de sécurité ou de données personnelles. |

Cette note décrit la cible et ses conditions de livraison. Une règle proposée ici n’est pas une permission accordée à un rôle existant. Une maquette illustre un parcours ; elle ne prouve ni la persistance des données ni la mise en production.

## 1. Intentions et décisions retenues

| Id | Orientation retenue |
|---|---|
| SA-D1 | Préférence forte pour **Les saisons** : le site devient un lieu de rendez-vous autour d’un propos photographique commun. |
| SA-D2 | Une saison est une **exposition datée**, avec un début, une fin, un texte d’intention et un accrochage ordonné. |
| SA-D3 | Les **séries sont conservées**. La rubrique publique **Collections** propose une autre entrée éditoriale ; elle ne renomme ni ne remplace silencieusement les séries existantes. |
| SA-D4 | Le visiteur peut parcourir toute l’exposition librement. L’**Après-image est facultative et proposée en fin de visite**. Ni compte ni vote ne conditionnent la visite. |
| SA-D5 | Dans le pilote, l’Après-image porte sur **un triptyque de trois photographies**, distinct de l’accrochage complet de la saison : le visiteur en conserve deux et en remplace exactement une, sans doublon ni écrasement du parent. |
| SA-D6 | **Contribution créée**, **contribution mise en avant** et **accrochage permanent** sont trois décisions distinctes. Aucune promotion automatique n’est promise. |
| SA-D7 | Le bilan peut ne retenir aucune contribution et aucune photographie pour les collections. Les photographes gardent la décision artistique. |
| SA-D8 | L’accueil évolue pour montrer la saison et conserve un accès direct aux collections. Les neuf écrans ont une déclinaison ordinateur et téléphone. |
| SA-D9 | Les invités, le dépôt de photographies externes et les mécanismes de vote sont des évolutions séparées, après le socle et les arbitrages nécessaires. |
| SA-D10 | Le pilote qualifie la réponse par une relation prédéfinie : **Écho**, **Contraste** ou **Déplacement**. Un commentaire libre est une possibilité future à arbitrer, pas un champ du pilote. |

Le bénéfice recherché est une continuité entre découverte, rendez-vous et mémoire : voir une exposition aujourd’hui, éventuellement lui répondre, puis retrouver ce que les photographes ont choisi d’en conserver.

## 2. Vocabulaire et relations

| Terme | Définition fonctionnelle |
|---|---|
| Série | Classement photographique existant. Une photo conserve sa série lorsqu’elle rejoint une saison ou une collection. |
| Saison | Exposition éditoriale datée, indépendante du classement en séries. Plusieurs saisons peuvent réutiliser une photo autorisée. |
| Accrochage de la saison | Ensemble ordonné de référence choisi pour l’exposition ; sa taille est indépendante de celle du pilote Après-image. |
| Triptyque parent | Trois photographies de référence de l’atelier Après-image ; ce sous-ensemble reste identifiable lorsque des branches sont créées. |
| Après-image | Réponse du visiteur à l’accrochage, dans un atelier borné ; elle ne modifie pas la photothèque. |
| Branche | Accrochage dérivé qui garde la référence et la version de son parent, avec les remplacements explicités. |
| Trace | Confirmation de l’enregistrement d’une contribution. Ses conditions de consultation et de conservation restent à arbitrer. |
| Mise en avant | Choix éditorial de montrer une contribution ; ce n’est ni son enregistrement ni son entrée dans les collections. |
| Bilan | Page de la saison close : intention rétrospective, choix et éventuels prolongements. Un bilan vide de sélection reste un bilan valide. |
| Collection | Ensemble permanent éditorialisé, accessible sans traverser une saison ni participer. |
| Filiation | Lien lisible entre saison, accrochage parent, branche éventuellement retenue et accrochage permanent. |

**Proposé** : une photographie est référencée par son identifiant existant ; les saisons et collections portent leurs propres associations et ordres. Aucun déplacement de série, nouvelle copie d’original ni modification de l’inventaire ne résulte de ces associations.

Une photographie peut rester visible dans sa série sans être retenue après une saison. « Non retenue » ne veut dire ni « supprimée », ni « dépubliée », ni « refusée artistiquement pour toujours ».

## 3. Hiérarchie publique et neuf écrans

La navigation cible de la maquette emploie **Expositions** et **Collections** ; **Les saisons** en est la signature éditoriale. Cette cible ne remplace pas automatiquement le menu existant. L’intégration conserve les accès utiles aux séries, photographes et à la galerie et s’accorde avec les thèmes déjà proposés ; aucune composition n’est activée silencieusement.

| Écran | Contenu et résultat attendu | Ordinateur | Téléphone |
|---|---|---|---|
| E1 — Accueil | Saison du moment, photographie d’ouverture, intention brève, dates, « Visiter l’exposition » et accès direct aux collections. | Photographie dominante et texte bref ; une seule invitation principale. | Titre, dates et action lisibles sans recouvrir l’image ; collections accessibles immédiatement. |
| E2 — Entrée d’exposition | Propos, photographes, dates, taille de l’accrochage ; « Commencer la visite » et accès direct aux images. | Prologue court et aperçu de l’accrochage. | Prologue resserré, sommaire accessible ; pas de longue introduction obligatoire. |
| E3 — Photographie | Œuvre entière, cartel, position, précédente/suivante, retour au sommaire et à la saison. | Image préservée et commandes proches ; clavier en amélioration facultative. | Image adaptée au format et commandes visibles ; aucun geste horizontal imposé. |
| E4 — Conclusion | Fin de visite, intention rappelée, collections et invitation facultative à l’Après-image. | Suites possibles regroupées sans classement social. | Actions successives lisibles : poursuivre librement ou contribuer. |
| E5 — Atelier Après-image | Triptyque parent rappelé, deux images conservées, une remplacée parmi les choix autorisés, relation Écho/Contraste/Déplacement, aperçu et validation. | Triptyque parent et résultat comparables ; remplacement repérable. | Trois emplacements, compteur textuel et aperçu final ; sélection possible sans glisser. |
| E6 — Confirmation et trace | Enregistrement confirmé, portée de la contribution expliquée, retour à la conclusion ou à la visite. | Accrochage obtenu et liens de sortie. | Confirmation courte avant les liens ; aucune inscription imposée ensuite. |
| E7 — Saison close | Archive avec dates réelles ; « Bilan en préparation », puis bilan publié et éventuels liens vers les collections. | Récit et choix éditoriaux, sans fausse galerie encore ouverte à contribution. | Même contenu et mêmes états, en lecture verticale. |
| E8 — Index des collections | Ensembles permanents, intention, couverture et accès à chaque accrochage. | Vue d’ensemble éditoriale, sans classement par popularité. | Liste lisible et liens nommés ; images sans recadrage destructeur. |
| E9 — Accrochage permanent et filiation | Œuvres retenues, intention propre, origine et lien vers la saison et son bilan quand ils sont publics. | Accrochage puis filiation lisible ; l’origine ne prend pas la place des œuvres. | Filiation en texte après l’accrochage, sans graphe indispensable. |

La liste des saisons et les liens d’archives conduisent à E2 ou E7 selon l’état. Le bilan se consulte dans la saison close ; il n’impose pas un dixième écran.

### Parcours et sorties

- **Visite libre prioritaire** : E1 → E2 → E3, avec navigation libre → E4 → E8 ou une autre visite.
- **Participation facultative** : E4 → E5 → E6 → E4 ; quitter l’atelier permet aussi de revenir à E4 sans contribution.
- **Mémoire** : archive → E7 → E9, si un accrochage permanent a été publié ; E7 peut ne présenter que le bilan.
- **Accès direct** : navigation → E8 → E9, sans exposition préalable, compte ni vote.

L’Après-image n’interrompt pas la première consultation d’une photographie. Les liens directs vers une œuvre et les retours de visionneuse conservent le contexte de la saison ; ils ne déplacent pas l’utilisateur dans la galerie générale par surprise.

Entre deux saisons, l’accueil peut présenter les collections, une saison annoncée ou la dernière archive. **Proposé** : une saison principale mise en avant à la fois ; les éventuels chevauchements et le choix de cette saison restent explicites dans l’admin.

## 4. Calendrier, états et retrait

| État fonctionnel | Visibilité et actions attendues |
|---|---|
| Brouillon | Préparation privée ; aucune présence publique ni accès par adresse devinée. |
| Programmée | Dates et accrochage prêts ; annonce publique éventuelle distincte de la préparation privée. L’accès avant ouverture est cadré au lot S2. |
| Ouverte | Visite disponible dans la fenêtre prévue. La participation ne l’est que si A1 est livré et activé pour cette saison. |
| Close | Visite en archive selon le choix éditorial ; atelier fermé ; « Bilan en préparation » si aucun bilan n’est publié. |
| Bilan publié | Saison close avec récit validé ; sélection éventuellement vide et liens vers les prolongements réellement publiés. |
| Retirée | Retrait prioritaire sur le calendrier et le bilan : aucune œuvre ni contribution de la saison n’est rendue par son ancien accès public. |

Le calendrier doit afficher une zone explicite dans l’admin. **À arbitrer avant S1/S2** : fuseau éditorial, saisie à l’heure ou à la journée, traitement des changements d’heure et possibilité de déplacer une clôture après ouverture. `Europe/Paris` est une proposition cohérente avec l’usage existant de l’inventaire, pas une décision acquise pour les saisons.

**Proposé** : instants enregistrés sans ambiguïté ; ouverture incluse, clôture exclue. À l’instant exact de clôture, une nouvelle contribution n’est plus acceptée, même si son formulaire était déjà ouvert. Les dates publiques doivent permettre de comprendre la dernière période de visite sans compter sur un compte à rebours.

Le retrait est distinct d’une clôture normale et d’une suppression. Son motif est explicite dans l’admin ; le texte rendu au public ne révèle pas un motif sensible. **À arbitrer** : retrait réversible, réouverture exceptionnelle et devenir des adresses déjà partagées. Une remise en ligne ne doit jamais republier automatiquement une photographie devenue indisponible.

## 5. Atelier Après-image et intégrité d’une branche

L’atelier rappelle l’intention de la saison et le contrat du pilote : « Gardez deux images de ce triptyque et remplacez la troisième pour proposer un autre regard. » Le triptyque n’est pas l’accrochage complet de l’exposition. L’atelier ne demande pas d’évaluer les photographes ni de désigner un vainqueur.

### Contrat de composition

1. Le triptyque parent et sa version sont identifiés au début de l’atelier et revérifiés à l’enregistrement.
2. La branche finale contient **exactement trois photographies** : deux du triptyque parent conservées et exactement une remplacée.
3. Chaque photographie est présente au plus une fois dans la branche. Remettre la même photographie dans le même emplacement ne compte pas comme un remplacement.
4. Les remplacements viennent uniquement du choix autorisé pour cette saison et encore disponible à la validation ; aucun identifiant fourni par le navigateur n’est accepté sur la seule foi du formulaire.
5. La branche reçoit un identifiant distinct et garde la filiation ; le triptyque parent et l’accrochage complet de la saison ne sont jamais écrasés.
6. Créer une branche ne change ni la série, ni le statut de publication, ni le cartel global des photographies.
7. La relation est choisie dans la liste fermée **Écho / Contraste / Déplacement** ; une valeur différente est refusée. Aucun commentaire libre n’est recueilli dans le pilote.

La saison peut contenir un nombre de photographies quelconque dans les bornes du socle : **aucune contrainte de multiple de trois** ne s’applique à l’exposition. Un atelier sur un format plus grand demeure une idée ultérieure, hors du pilote et des critères A1.

**À arbitrer avant A1** : désignation du triptyque parent, conservation des emplacements ou réordonnancement autorisé et constitution du choix de remplacement. La possibilité de repartir d’une branche et la profondeur maximale de filiation relèvent d’une extension A2 explicitement cadrée.

Un échec de formulaire conserve les sélections encore valides et explique les changements nécessaires sans prétendre que l’enregistrement a réussi. Un commentaire libre, même facultatif, demanderait un cadrage ultérieur de sa visibilité, de sa modération et de sa conservation avant tout ajout à l’atelier.

### Enregistrement, exposition et permanence

| Étape | Effet | Ce qu’elle ne garantit pas |
|---|---|---|
| Contribution enregistrée | La réponse est persistée et une confirmation fidèle est rendue. | Publication, validation éditoriale, affichage du texte ou sélection permanente. |
| Contribution mise en avant | Une décision éditoriale permet sa présentation selon le cadre accepté. | Entrée des photographies ou du montage dans une collection permanente. |
| Accrochage permanent publié | Une curation explicite crée ou enrichit une collection et explique sa filiation. | Conservation de toutes les contributions ou de tous les commentaires. |

Texte public proposé : « Vos choix nourrissent notre réflexion pour les prochaines collections. La sélection finale appartient aux photographes. » La confirmation dit « Votre après-image a été enregistrée », sans promettre publication ni permanence.

Les modalités permettant de retrouver sa trace, de la retirer ou de demander un effacement dépendent du choix d’identité et de conservation. Aucun lien privé, cookie, compte visiteur, pseudonyme ou jeton durable n’est décidé par cette note.

## 6. Bilan, collections et filiation

Le bilan raconte ce qui s’est passé et ce qui a été choisi : intention initiale, regard rétrospectif, éventuelles branches mises en avant et prolongements permanents. Les chiffres éventuels décrivent leur périmètre ; une création n’est pas comptée comme une mise en avant ou une acquisition.

**Proposé** : une publication de bilan est un geste distinct de la clôture. Elle montre aussi les cas « aucune contribution retenue » ou « aucun accrochage permanent », dans un texte respectueux, sans classement des personnes ni liste publique des refus. Le socle S0 prévoit un bilan publié unique, non réécrivable ; une correction ultérieure nécessiterait un contrat explicite dans un autre lot.

Les photographies non retenues suivent leur publication habituelle, notamment dans leurs séries. Les branches non retenues suivent la durée et la visibilité qui seront décidées avant A1 ; elles ne deviennent pas une archive publique perpétuelle par défaut. La conservation du bilan éditorial ne justifie pas celle de toutes les données de participation.

Une collection a sa propre intention et son ordre. Les liens de filiation indiquent l’origine éditoriale disponible ; ils ne ressuscitent pas une photographie retirée, un texte effacé ou une contribution devenue privée. La possibilité de nommer un contributeur dans une filiation est un arbitrage de droits et de données personnelles préalable à A2.

## 7. Gestion dans l’admin et rôles fonctionnels

Les fonctions suivantes décrivent des responsabilités, **pas de nouveaux rôles techniques** ni une extension de droits existants.

| Responsabilité fonctionnelle | Gestes à prévoir |
|---|---|
| Préparer une saison | Créer le brouillon, rédiger les trois langues, choisir les photographies disponibles, leur ordre et les dates ; consulter l’aperçu. |
| Valider et programmer | Vérifier droits des images, complétude et calendrier ; programmer ou publier selon la décision de l’équipe. |
| Suivre et retirer | Comprendre l’état courant, les photos indisponibles et les anomalies ; clôturer ou retirer par un geste explicite. |
| Rédiger le bilan et composer les collections | Sélectionner sans obligation de résultat, expliquer les choix, conserver la filiation puis publier séparément. |
| Examiner les contributions | Lire dans le périmètre autorisé, décider d’une mise en avant et traiter un retrait ; seulement après A1/A2. |
| Visiter et contribuer | Lire sans compte ; utiliser éventuellement l’atelier lorsqu’il est ouvert, selon le cadre arrêté. |

**À arbitrer avant S1** : qui voit, prépare, programme, publie, retire et sélectionne ; portée « les miennes » ou commune ; traitement des saisons réunissant les deux photographes ; droit de composer un accrochage avec leurs photos. Aucun droit existant de lecture d’une photo ne suffit à autoriser son exposition.

L’admin doit proposer une liste filtrée par état, une fiche structurée en intention, calendrier, accrochage et publication, un aperçu privé et une validation récapitulative avant mise en ligne. L’atelier de sélection des photos est utilisable sans glisser, avec les refus expliqués. Les actions sensibles et leurs confirmations suivent les conventions existantes des deux administrations.

### Champs et limites éditoriales proposées

Ces valeurs sont des propositions bornées, à aligner sur le code et les maquettes au jalon concerné ; elles ne constituent pas des exigences déjà acceptées.

| Objet | Champs | Bornes proposées |
|---|---|---|
| Saison | Titre, intention, adresse, dates et ordre des photos ; sous-titre, prologue, conclusion et couverture à préciser dans l’interface. | Plafonds techniques S0 : titre 120 signes, intention (`intro`) 4 000, adresse 160, accrochage 500 photos. Conseils éditoriaux proposés : sous-titre 180 ; intention 800 ; prologue et conclusion 2 000 chacun. |
| Accrochage | Références des photos et ordre ; version du triptyque parent et éventuels cartels contextuels à cadrer aux lots suivants. | Photos uniques, 500 au plus dans S0 ; une couverture appartient à l’accrochage et reste disponible. Conseil éditorial proposé : cartel contextuel 500 signes. |
| Après-image | Triptyque parent et version, trois photos finales et relation prédéfinie. | Exactement deux photos conservées et une remplacée, sans doublon ; Écho/Contraste/Déplacement seulement. Aucun champ d’identité ni commentaire libre dans le pilote. |
| Bilan | Récit et sélection dans S0 ; titre et liens vers les accrochages permanents à préciser pour S3. | Plafond technique S0 : récit (`report`) 12 000 signes. Conseils éditoriaux proposés : titre 120 signes ; récit 4 000. Sélection vide autorisée. |
| Collection | Titre, intention, couverture, ordre et origine éditoriale. | Titre 120 signes ; intention 1 200 ; références uniques par accrochage. |

Les contenus éditoriaux publics ont leurs versions française, anglaise et allemande. **Proposé** : reprendre les replis de traduction existants et signaler les manques dans l’admin ; décider avant publication si certaines rubriques exigent les trois versions complètes. Les relations du pilote ont trois libellés traduits prédéfinis ; aucun texte libre de visiteur n’est traduit ni transmis à un service par ce lot.

## 8. Erreurs, concurrence et photographies retirées

| Situation | Comportement attendu |
|---|---|
| Date illisible, fin avant le début, heure ambiguë | Refus expliqué auprès du champ ; aucune programmation partielle. |
| Brouillon ou objet privé demandé publiquement | Aucune donnée éditoriale privée ni photographie révélée ; comportement d’absence cohérent avec le site. |
| Saison close pendant l’atelier | Refus d’enregistrer après la clôture ; retour vers E7 et explication ; aucun faux succès. |
| Parent modifié pendant l’atelier | Détection de version ; la réponse n’est pas silencieusement rattachée à un nouveau parent. Révision proposée avant nouvel enregistrement. |
| Deux membres de l’équipe enregistrent la même version | Conflit explicite, sans écraser une modification plus récente. |
| Double clic, rechargement ou renvoi du même formulaire | Une validation ne crée pas plusieurs branches. Le mécanisme de rejeu est choisi avec le cadre de participation. |
| Triptyque invalide, nombre de remplacements différent d’un, doublon, photo absente du choix ou relation inconnue | Refus atomique ; indication des éléments à corriger ; aucune branche partiellement persistée. |
| Photo dépubliée, supprimée, bloquée ou retirée pour un accord | Le retrait prime sur saison, archive, branche, bilan, collection, aperçu et cache ; aucune variante ne reste exposée par ce circuit. |
| Retrait d’une photo en cours de validation | Disponibilité revérifiée dans l’opération d’écriture ; refus si la composition n’est plus autorisée. |
| Exposition devenue incomplète | Information discrète et accès aux œuvres restantes ; pas de remplacement créatif automatique. Participation suspendue si son contrat ne peut plus être respecté. |
| Référence d’origine retirée | Filiation textuelle ajustée ; aucun lien ne révèle une page devenue privée ou un contenu effacé. |
| Échec serveur ou persistance indisponible | Échec annoncé, sans confirmation ; les données précédemment publiées ne sont pas écrasées. |

La suppression physique d’un élément éditorial et son éventuelle restauration restent à définir ; le retrait public ne dépend pas d’une suppression. L’état courant d’autorisation des photographies est revérifié à chaque lecture publique, même pour un accrochage historiquement figé.

## 9. Accessibilité et fonctionnement sans script

- Les neuf écrans existent en rendu serveur ; lire, naviguer, sélectionner, corriger et envoyer un formulaire ne nécessitent pas JavaScript.
- Images entières, textes de remplacement et cartels conservent leur rôle ; aucun texte essentiel n’est incrusté dans une photographie.
- Hiérarchie des titres, navigation nommée, focus visible, état textuel et cibles de 44 px sur téléphone suivent les règles du projet.
- Aucun état ne dépend de la couleur seule ; les remplacements sont indiqués par leur emplacement et un libellé.
- Les erreurs sont liées aux champs et résumées ; sélection et erreurs utiles sont conservées après refus sans exposer de données privées.
- Aucun défilement horizontal obligatoire, glisser indispensable, son automatique ou animation nécessaire à la compréhension.
- Les améliorations avec script respectent le mode de mouvement réduit et n’ajoutent pas de styles ou scripts en ligne interdits par la CSP.

## 10. Arbitrages de sécurité, de données personnelles et de droits

| Id | Décision encore ouverte | Jalon dépendant |
|---|---|---|
| SA-Q1 | Matrice des droits et portées pour saisons, photos communes, publication, retrait, bilan et collections. | S1 et suites exposées à l’équipe. **Ne bloque pas S0**, qui n’expose aucune route ni droit. |
| SA-Q2 | Fuseau, précision du calendrier, chevauchements et modification des dates après publication. | S1/S2. |
| SA-Q3 | Identité éventuelle du contributeur, preuve de maîtrise d’une trace, retrait et exercice des droits. | A1. |
| SA-Q4 | Données collectées, finalité, visibilité privée ou publique, durée de conservation et purge. Aucun texte libre dans le pilote ; son éventuel ajout exige un arbitrage ultérieur. | A1 ; texte libre dans une évolution séparée. |
| SA-Q5 | Protection contre l’abus, rejeu, automatisation et surcharge ; éventuel stockage navigateur et information associée. | A1. |
| SA-Q6 | Autorisation de publier une contribution, son texte et un éventuel nom ; correction, retrait et conservation de la filiation. | A2. |
| SA-Q7 | Désignation du triptyque parent, choix de remplacement et ordre. La taille du pilote est fixée à trois images ; dérivation d’une branche à cadrer séparément. | A1, puis A2 si dérivation étendue. |
| SA-Q8 | Photographies d’hôtes, dépôt, droit d’auteur, accords des personnes et circuit éditorial. | Évolution future séparée. |

Aucune durée, nouvelle permission, empreinte visiteur ou réutilisation d’identité n’est fixée implicitement. Tout nouveau champ personnel passe par `server/vault.js`, dispose d’une durée, figure dans l’export et dans la notice Confidentialité, et actualise le registre RGPD avant sa collecte.

### 10.1 Besoins de la Vigie et preuves attendues par lot

Cette matrice fait partie du plan de livraison. **État courant : S0 est en PR #218 et la préparation indépendante S1a en PR #219 ; aucun raccordement HTTP spécifique aux saisons n’est encore branché.** Les protections communes existent déjà, mais elles ne prouvent pas le comportement de futures routes. Chaque PR distingue ce qu’elle raccorde, ce qu’elle vérifie et ce qui reste prévu. Les cas DS sont définis dans la [conception du journal de sécurité](journalisation-securite.md#3-cas-de-détection) ; les besoins et leur état figurent dans le [registre des briques](vigie-besoins-des-briques.md).

| Lot et surface | Besoin et raccordement prévu | Acceptation et limites |
|---|---|---|
| **S0 — Tables et modèle interne** | Aucune route, permission, session, contribution ou donnée personnelle nouvelle ; aucune émission à ajouter. Les références n’altèrent ni le statut ni les protections des photos. | Migration et règles sur base synthétique ; projection publique excluant brouillons et bilans préparés. Aucun nouveau BV, changement de règle, de seuil ou de moteur déclaré livré. |
| **S1a — Préparation indépendante de l’atelier** | Modèle versionné, contrat de formulaire et gabarits inactifs ; aucune autorisation nouvelle ni émission HTTP. Les validations internes ne prétendent pas remplacer les contrôles des futures routes. | Tests de persistance, conflits et rollback sur données synthétiques ; aperçu de rendu isolé. Aucun test de session/permission/CSRF revendiqué avant S1b. |
| **S1 — Routes, droits, aperçu et décisions de l’équipe** | Déclarer `config.perm` sur chaque route et la permission précise de chaque action après SA-Q1 ; reprendre les gardes d’authentification, de confirmation d’identité et de CSRF du plugin admin. `authz_fail` couvre DS10 ; `authz_csrf_fail` couvre DS14. Si une portée est retenue, la vérifier sur les objets et identifiants soumis ; une absence réelle ne doit pas être confondue avec un objet existant hors portée. | Vérifier refus sans session, sans permission, hors portée si applicable et sans CSRF, y compris aperçu et identifiants de photos falsifiés ; aucune écriture sur refus. Vérifier les décisions de gel, verrouillage et confirmation d’identité via les gardes existantes. L’aperçu reste `private, no-store`, `noindex`, sans se déclarer export sensible. |
| **S1 — Saisies et journal des gestes** | Crochet commun `malicious_input` pour DS11 ; `input_validation_fail` pour les valeurs impossibles du formulaire (DS12 : types, listes, bornes ou identifiants forgés), avec champ, raison et longueur seulement. Compléter `request.auditChanges` pour le journal d’audit avec les noms des champs et références numériques, jamais leur valeur. Les conflits d’édition, dates simplement incorrectes et changements ordinaires d’état sont des refus métier ; ils ne deviennent pas automatiquement des signaux d’attaque. | Vérifier persistance et journal après un geste réussi ; statut fidèle après refus ; aucune valeur éditoriale ou personnelle dans le détail des événements. Vérifier le signalement d’une requête forgée sans ajouter de doublon au crochet commun. Le journal d’audit **n’est pas lu par la Vigie** : sa présence ne remplace pas une émission requise. |
| **S2 — Textes effectivement publics, accueil et exposition** | Étendre [`server/securite/textes-publics.js`](../../server/securite/textes-publics.js) aux seuls textes rendus publics des saisons : titres et intentions visibles, puis bilan uniquement après sa publication. Réutiliser BV-20/BV-21 (DS9), `config_public_changed`, objets `texte_public` et `textes_publics`, via la comparaison commune après écriture. Un futur réglage de saison mise en avant ou de composition de l’accueil est évalué sous BV-1/DS9 et DS23 ; ajouter sa clé surveillée si nécessaire. | Tester un contact ajouté au texte public et le nombre de champs changés, sans texte, adresse e-mail ou téléphone dans l’événement. Un brouillon, une annonce privée et un bilan seulement préparé restent absents de l’instantané. Un aperçu et un enregistrement identique ne signalent pas un changement public. Ne pas réutiliser l’instantané public brut de toute la ligne `saisons` si des colonnes restent privées. |
| **S2 — Ouverture programmée et retrait** | Réutiliser `watchPublication` pour BV-20/BV-21 avec `sub = null`, émetteur « publication programmée », au changement réel de visibilité. **Adapter aussi l’optimisation fondée sur `total_changes()`** : en S0, la phase change avec l’horloge sans écriture SQL ; le contrôle actuel peut donc ignorer une ouverture. Prévoir une comparaison de calendrier indépendante des seuls résultats `review.runDue()` / `carnet.runDue()`. Le retrait manuel passe par la comparaison commune après écriture. | Avec horloge contrôlée et sans autre écriture, vérifier une ouverture détectée, une seule fois, sans attribution au prochain compte qui écrit. Vérifier exclusion des saisons retirées et des bilans privés, redémarrage propre et absence de doublon sur passage suivant. Une clôture qui conserve une archive ne retire pas artificiellement les textes encore publics. La minuterie de surveillance ne conditionne pas le droit de lecture, qui reste vérifié à chaque requête. |
| **S2 — Visite et images** | Conserver les protections communes contre les injections, les pièges et les rafales de 404 ; elles couvrent DS11/DS12/DS15. Évaluer le nombre réel d’images chargées par le parcours pour éviter les faux positifs d’aspiration (BV-4). Réutiliser les routes de variantes et leur contrôle de disponibilité ; ne créer aucun chemin d’original. | Parcours libre nominal sans événement anormal dû aux liens internes ou aux images attendues. Retrait d’une photo effectif côté serveur dans exposition, archive et aperçu. Le cache partagé et les copies déjà reçues gardent leurs limites existantes : ne pas promettre l’effacement à distance d’un navigateur. Aucun recalage de seuil sans observation ou risque concret. |
| **S3 — Bilan, collections et filiation** | Étendre la source BV-20/BV-21 aux nouveaux textes de collections réellement publics ; le bilan rejoint l’instantané seulement au geste de publication. Droits, CSRF et journal comme S1. Des choix exclusivement photographiques et éditoriaux ne sont pas une lecture personnelle : aucun `sensitive_read` artificiel. La filiation ne recopie pas de contribution privée. | Tester bilan avec sélection vide et non vide sur deux saisons distinctes, publication et retrait de collection, photo retirée et origine privée. Vérifier comparaison des textes à leur publication, jamais pendant leur préparation ; références interdites refusées sans fuite. |
| **A1 — Enregistrement public et trace** | Après SA-Q3 à SA-Q5 et SA-Q7, reprendre les protections publiques adaptées : provenance, contrôle CSRF si session, piège si retenu, limites bornées et rejouabilité. Réutiliser `input_validation_fail` (DS12), `malicious_input` (DS11), `malicious_honeypot`, `excess_rate_limit_exceeded` et, **seulement si une trace secrète est retenue**, `token_guess` (DS16). Aucun cookie ni identifiant visiteur n’est décidé par cette matrice. | Tester nominal, rejeu, rafale, provenance étrangère et triptyque forgé ; aucune confirmation avant persistance. Les refus normaux de clôture, de version ou de photo retirée ne deviennent pas automatiquement des alertes. Ne journaliser ni composition complète, ni jeton de trace, ni texte ou identité de visiteur. Vérifier notice, export, retrait et purge selon les arbitrages avant collecte. |
| **A2 — Examen éditorial, mise en avant et retrait** | Après SA-Q6, séparer autorisation de lecture et de publication. Si la contribution comporte des données personnelles, appliquer DS18/BV-33 aux lectures, listes et exports réels : `sensitive_read` / `sensitive_export`, catégories et effectifs fermés, volumes par les outils existants ; effacement effectif via `sensitive_delete` si pertinent. Réévaluer BV-20/BV-21 pour les seuls textes rendus publics. | Vérifier refus hors droit, exposition volontaire distincte de la création, retrait et effacement propagés. Les listes et aperçus ne révèlent pas de donnée d’une autre portée ; une filiation ne rétablit pas une contribution privée. Les catégories ne sont pas inventées et aucun contenu de fiche n’entre dans le journal. |

Les événements disponibles sont ceux du [`vocabulaire fermé`](../../server/securite/vocabulaire.js). Les gardes et la comparaison commune sont dans [`server/securite/site.js`](../../server/securite/site.js), les gardes et le journal du plugin dans [`server/routes/admin.js`](../../server/routes/admin.js), et le passage actuel des publications programmées dans [`server/app.js`](../../server/app.js). Ne pas déclarer une future route `config.audit` pour simplement « avoir une trace » : cette option classe une lecture réussie comme **export sensible**. Le journal et l’observation d’une donnée personnelle ont des finalités distinctes.

Un raccordement à BV-20/BV-21 complète leur couverture existante ; il n’exige pas un nouveau numéro par écran. Un manque réellement constaté se documente dans le registre avec son abus, son cas DS, l’émission minimale manquante et son lot de résolution ; attribuer alors le prochain BV libre, après relecture du registre. **Aucun nouveau BV n’est réservé ici.** La vérification reste ciblée sur la brique : pas de nouvelle règle, de changement de moteur ni de campagne d’attaque complète sans besoin concret.

## 11. Livraison : une PR par jalon

| Lot | Livrable et dépendances | Acceptation nominale | Acceptation des erreurs |
|---|---|---|---|
| **S0 — Modèle métier, implémenté dans la branche** | Migration additive, accès aux objets et règles pures d’état/composition. Pas de route publique, d’interface, de minuterie branchée ni de nouveau droit. Aucune collecte de contribution. | Créer/lire un brouillon synthétique ; ordre et références persistés ; phases calculées aux bornes ; photos et séries existantes intactes. | Transitions hors cycle, dates invalides, doublons et composition invalide refusés ; écritures atomiques ; retrait prioritaire ; migration sur une base jetable. |
| **S1 — Atelier des saisons** | Préparation indépendante S1a décrite ci-dessous ; activation S1b après S0 et SA-Q1/SA-Q2 : administration de préparation, aperçu, calendrier, accrochage et décisions de publication/retrait. | Un membre habilité prépare une saison, traduit ses textes, ordonne les images et programme ; persistance vérifiée après relecture. | Refus hors portée, photo non autorisée, conflit concurrent et calendrier invalide ; aperçu inaccessible sans droit ; aucun brouillon public. |
| **S2 — Visite publique, accueil et archives** | Après S1 : E1 à E4 et E7, index des saisons, liens et adaptations des thèmes ; aucune participation tant que A1 manque. | Visite libre complète, accès existants aux séries conservés, ouverture et clôture à l’heure, archive lisible ; trois langues et sans script. L’accès « Collections » rejoint S3 dès sa livraison, sans lien mort avant. | Saison retirée/brouillon absents ; photo retirée cachée partout ; état changé pendant la visite expliqué ; aucun bouton d’atelier inactif présenté comme disponible. |
| **S3 — Bilans et collections** | Après S1/S2 : bilan éditorial, E8/E9, sélection éventuellement vide, filiation saison/collection ; l’index reste accessible directement. | Publier un bilan vide et un bilan avec choix sur **deux saisons distinctes**, chacun unique et non réécrivable dans S0 ; consulter l’accrochage permanent et son origine ; série des photos inchangée. | Refus de publier une référence interdite, conflit de version et filiation privée ; retrait répercuté sans restaurer une photo. |
| **A1 — Après-image** | Après S2 et SA-Q3/SA-Q4/SA-Q5/SA-Q7 : E5/E6, collecte minimale, confirmation, retrait et purge conformes aux décisions. | Créer un triptyque persisté avec deux images conservées, une remplacée et une relation Écho/Contraste/Déplacement ; parent intact ; retour à la conclusion sans compte imposé à la visite. Aucun commentaire libre. | Clôture, parent modifié, remplacement incorrect, doublon, relation inconnue, rejeu, dépassement et photo retirée ; aucune confirmation avant écriture ; purge et droits vérifiés. |
| **A2 — Mise en avant et filiation** | Après A1, S3 et SA-Q6 : examen éditorial, publication distincte, liens vers bilan/collections selon autorisations. | Une contribution enregistrée reste distincte de sa mise en avant et d’une sélection permanente ; un bilan peut tout écarter. | Pas de publication sans décision ; retrait/effacement répercuté ; une filiation ne révèle pas une contribution privée. |
| **Plus tard — Invités et vote** | Études et PR séparées après les arbitrages correspondants. | Critères à établir avec un besoin précis. | Aucun dépôt externe, classement, promotion automatique ou collecte supplémentaire ajouté aux lots précédents. |

S3 peut être livré sans A1 : la première saison peut donc être une exposition complète et son bilan une décision des photographes. A1 n’oblige pas à livrer immédiatement A2 ; le visiteur est informé du devenir réel de sa contribution.

### Préparation de l’atelier avant les arbitrages (S1a)

Le lot suivant avance sur les éléments indépendants des droits et du fuseau :

- Compteur de version persistant (`066_saisons_versions.sql`) et validation atomique des textes, de l’ordre et d’une décision ; un écran périmé reçoit un conflit sans écrasement, même si les deux sauvegardes ont lieu à la même milliseconde.
- Contrat des formulaires trilingues : conservation du calendrier inchangé, ordre numérique sans glisser, ajout de seules photos déjà publiées, retrait d’une photo de l’accrochage et recherche paginée de 24 résultats. La série et la publication des photos restent intactes.
- Conversion d’heure locale avec fuseau **obligatoirement fourni par le futur branchement**, sans valeur par défaut. Une heure nouvelle inexistante ou ambiguë est refusée ; aucun des fuseaux proposés n’est adopté par ce code.
- Gabarits communs aux administrations v1/v2 : liste, éditeur, aperçu privé et récapitulatif de décision, traduits, sans script obligatoire. Ils restent **non raccordés** : aucun menu, route, droit, cookie ou écriture d’audit supplémentaire n’est activé dans l’application.

**S1a ne livre pas encore l’atelier utilisable depuis l’admin.** Les formulaires et la persistance sont contrôlés séparément ; le rendu navigateur isolé ne prouve pas les gardes de session, les permissions, le CSRF ni un parcours HTTP complet. Les décisions SA-Q1/SA-Q2 restent ouvertes. Le choix d’un motif de retrait dans une liste est préparé dans la vue, sans collecte ni conservation nouvelle.

**S1b** raccordera ces éléments après les réponses du propriétaire : permissions exactes et portées, menu et chargement de la feuille dédiée dans les deux administrations, routes et gardes, erreurs restituées, fuseau affiché, aide, journal et signaux S1 de la matrice §10.1. Son acceptation exige alors un parcours navigateur complet avec persistance et refus, ainsi que les vérifications de la Vigie. S1 n’est terminé qu’après ce raccordement.

La PR #219 de S1a, version `1.219.0`, dépend de #218 et reste en brouillon ; sa base temporaire est la branche du socle tant que celui-ci n’est pas fusionné par le propriétaire. Sa note de version distingue la préparation des écrans de leur activation.

### Définition de « terminé » pour chaque lot

Le code et les migrations du lot sont livrés, ses règles nominales et d’erreur sont vérifiées, et sa documentation décrit le comportement réel. Un lot dépendant d’un arbitrage reste incomplet tant que cet arbitrage manque ; le développement indépendant peut continuer.

La validation réutilise les tests pertinents et ajoute des régressions ciblées pour les invariants métier. Une interface est essayée dans un vrai navigateur, sur ordinateur et téléphone, avec vérification des résultats persistés et des refus, en trois langues et sans script pour les parcours concernés. Les contrôles utilisent un serveur jetable et des images neutres ou générées, jamais les données réelles.

Chaque PR rapporte les cas exécutés, les nombres réels, les preuves utiles et les limites ; aucune suite non lancée n’est déclarée réussie. La portée suit la politique proportionnée du dépôt, sans harnais générique ni CI complète imposés à chaque écran. Les liens documentaires se vérifient avec `node --test test/liens-internes.test.js`.

Une PR reste en brouillon pour revue, avec « Sécurité » et « Impact sur la Vigie ». **Chaque PR de ce chantier, y compris S0, ajoute sa note de version en français, anglais et allemand dans `server/nouveautes.json` et passe `package.json` et `package-lock.json` à `1.<numéro de la PR>.0`**, conformément au rappel du propriétaire. Une note décrit ce qui est effectivement livré : une étape interne n’annonce pas un écran disponible. Les notes destinées à un droit particulier restent filtrées par leur permission, et celles qui concernent la Vigie portent `perm: "securite.voir"`. Une interface nouvelle actualise aussi l’aide. L’historique de `PLAN.md` n’inscrit « fait » qu’après livraison effective ; la fusion appartient au propriétaire.

## 12. Annexe technique du socle S0

Le modèle distingue une **décision persistée** (`brouillon`, `programme`, `publie`, `retire`) d’une **phase dérivée de l’horloge**. Cette séparation évite de transformer le passage du temps en une série d’écritures ou de considérer une minuterie comme preuve d’ouverture effective.

- Les instants d’ouverture et de clôture bornent une fenêtre **[ouverture, clôture[** : ouverture incluse, clôture exclue.
- Le retrait l’emporte sur les dates ; le brouillon reste privé. Une décision de programmation ou de publication ne dispense jamais des vérifications de visibilité et d’autorisation lors d’une future exposition par S1/S2.
- La phase décrit l’avant-ouverture, l’ouverture ou la clôture selon l’instant de référence. « Bilan publié » appartient au cycle éditorial du bilan ; il ne remplace pas l’autorisation des photos.
- S0 ne branche aucune minuterie, route, tâche de collecte ou nouveau droit. Il permet de tester les bornes avec une horloge fournie, sans attente réelle ni dépendance à l’heure du test.
- S0 n’ajoute ni visiteur, ni acteur, ni auteur personnel aux objets. **Proposé** : figer l’accrochage dès sa programmation ; S1 devra expliciter les corrections et les versions concurrentes, plutôt que modifier silencieusement une référence déjà partagée.
- La prochaine migration libre à la base de départ est **065** ; son numéro doit être revérifié avant livraison. Les migrations 063 et 064 existent déjà et ne sont pas modifiées.
- Les plafonds techniques de `server/saisons.js` sont : `title` 120 signes, `intro` 4 000, `report` 12 000, `slug` 160 et `photos` 500. Ils bornent le stockage ; les conseils de rédaction plus courts du § 7 ne changent pas ces constantes. La borne de 500 ne contraint pas la saison à un multiple de trois : le triptyque Après-image est un objet distinct, à livrer en A1.
- Les invariants relationnels protègent l’unicité des références et l’ordre ; les écritures qui doivent réussir ensemble sont atomiques. Les choix de calendrier visibles et la matrice de droits restent réservés aux jalons correspondants.

**État courant** : S0 en revue dans la PR #218 ; S1a préparé dans la branche de l’atelier ; S1b attend les décisions de droits et de calendrier ; S2, S3, A1 et A2 à réaliser. Le socle se trouve dans [`server/saisons.js`](../../server/saisons.js), la [migration 065](../../server/db/migrations/065_saisons.sql) et ses [tests métier](../../test/saisons-modele.test.js). Aucun parcours public ou administratif nouveau n’est déclaré disponible par cette annexe.
