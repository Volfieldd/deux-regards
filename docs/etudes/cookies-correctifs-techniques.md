# Cookies : premier lot de corrections techniques

Le diagnostic du 24 octobre 2026, ancré sur la version 1.217.0 (`f44cdf3`), a relevé des écarts de configuration, d’expiration et d’effacement. Ce premier lot corrige ceux qui peuvent être traités sans arbitrage CNIL ni modification des fonctions proposées. Les travaux de chiffrement intégral font l’objet d’une [conception distincte](chiffrement-etats-cookies.md).

## Séparation des périmètres

| Périmètre | Changement de ce lot |
|---|---|
| Front public | Aucun changement de langue, J’aime, navigation, plein écran ou secours hors ligne |
| Front administration v1/v2 | Densité des vignettes et notifications résistantes au refus du stockage facultatif |
| Serveur du site et de l’administration | Configuration HTTPS, échéance OIDC, effacement des sessions et des récapitulatifs Bonjour |
| Vigie, moteur et console | Contrats d’événements et de révocation préservés ; aucun changement de journal, de droits ou de console |

## Corrections et limites

| Constat | Comportement obtenu | Régression couverte |
|---|---|---|
| Production acceptant une URL publique HTTP | Démarrage refusé ; HTTP de développement et connexion locale de test conservés hors production | Configuration HTTP/HTTPS et normalisation de PUBLIC_URL |
| Absence de contrôle local de l’âge de transaction OIDC | Date signée vérifiée avant l’échange du code ; refus à dix minutes, date absente/invalide/future refusée | Connexion et vérification d’identité, transaction encore valide, aucun appel fournisseur ni session créée au refus |
| Sessions expirées conservées sans nouvelle connexion | Purge au démarrage puis chaque heure, sous les bornes de validité existantes | Session active intacte, borne absolue, déclencheur Vigie et arrêt des minuteries |
| Récapitulatif seulement purgé lors d’un autre usage | Une seule échéance sur le plus ancien, replanifiée après dépôt/consommation, annulée et mémoire vidée à l’arrêt | Suppression réelle de deux récapitulatifs à leurs échéances propres, sans requête intermédiaire |
| Refus du stockage navigateur interrompant les scripts admin | Accès facultatifs au toast et à la densité protégés ; l’affichage courant continue | Refus de lecture/suppression/écriture et persistance/annulation quand le stockage fonctionne |

La purge horaire distingue fin d’accès et suppression physique : une ligne de session expirée est retirée au passage suivant, pas nécessairement à la milliseconde de sa fin d’accès. Les empreintes révoquées nécessaires à la Vigie gardent leur conservation existante de 48 heures.

Une ancienne tentative OIDC dépourvue de date doit être recommencée après livraison ; la session déjà ouverte n’est pas invalidée par ce changement. Les connexions dans plusieurs onglets et les contrôles PKCE, state, nonce, rôles et CSRF restent en place.

Le récapitulatif reste en mémoire, sans disque, borné à 500 entrées et lu une seule fois. Le curseur et les notifications restent utilisables dans la page quand le navigateur refuse le stockage ; une mémoire entre rechargements ne peut pas être assurée dans ce cas. Aucun cookie, stockage ou destinataire nouveau n’est ajouté.

## Frontières avec le stream CNIL

| Objet | Décision ou preuve attendue | Effet sur ce lot |
|---|---|---|
| Langue, J’aime, retour, plein écran, secours hors ligne | Justification par finalité, durée, information et éventuel choix contextuel | Fonctions et stockages conservés ; aucun retrait décidé ici |
| Audience et visiteurs uniques | Auto-évaluation, absence de rapprochement et configuration réelle | Mesure inchangée |
| Conservation Vigie et incidents, D38 | Durées et exceptions justifiées par les responsables | Aucun changement de durée ni de journal |
| Cloudflare/Zitadel réels | Observation expurgée des cookies, attributs et paramètres actifs | Simulations locales seulement ; aucun accès à une installation réelle |
| Chiffrement intégral et formats | Séparation des clés, reprise, NC2, chaîne historique, restauration | Conception séparée avant migration ; ne pas présenter ce lot comme le chiffrement de toutes les données |

## Impact sur la Vigie et sécurité

Un refus de transaction trop ancienne utilise `authn_login_fail` avec une raison bornée, sans cookie, state, verifier ni contenu personnel. Les purges SQL passent par le déclencheur existant des sessions révoquées ; aucune règle, réponse automatique ou durée de trace n’est modifiée. Les protections d’authentification et de provenance restent nécessaires indépendamment des attributs du cookie.

Chaque bogue a été reproduit avant correction par un test ciblé. La vérification d’ensemble utilise les suites du dépôt avec et sans Vigie simulée ; un parcours en navigateur réel complète les tests des scripts. Les résultats et limites exacts figurent dans la PR du lot. Les tests travaillent uniquement avec des bases jetables et des données fictives.
