# Premiers pas

## Se connecter

1. Ouvrez l'adresse du site suivie de `/admin`.
2. Vous êtes envoyé vers la page de connexion (Zitadel). Connectez-vous avec votre compte, ou avec « Continuer avec Google » si c'est ainsi que votre compte a été créé.
3. Vous revenez sur le **tableau de bord**, ou sur la page que vous aviez demandée.

- **« Accès refusé » :** votre compte n'a pas le rôle d'administration. Utilisez « Utiliser un autre compte », ou demandez le rôle à l'autre auteur.
- **Connexion de test :** sur un serveur de test seulement, un formulaire « Connexion de test » remplace Zitadel. Il demande l'auteur à incarner et un jeton. Un bandeau rouge « Connexion locale de test » reste alors affiché en haut de l'admin.

## Se repérer

Le menu en haut de chaque page :

| Entrée | Pour |
|---|---|
| **Tableau de bord** | voir l'état du site d'un coup d'œil |
| **Photos** | importer, compléter, publier, ordonner, supprimer |
| **Séries** | créer, renommer, ordonner les séries |
| **Auteurs** | fiches des photographes, lien avec leur compte |
| **Filigrane & EXIF** | marquer les images, choisir les métadonnées |
| **Apparence** | thème du site, logo, icône |
| **Réglages** | nom du site, textes, photos de l'ouverture |
| **Aide** | cette aide |
| **Voir le site** | le site public, dans un nouvel onglet |
| **Se déconnecter** | fermer la session |

Chaque écran a un lien **« Aide sur cette page »** qui mène directement à la bonne section.

## Après chaque action

Un message apparaît en haut de la page :

- **cadre noir** : l'action a réussi (« Photo enregistrée. ») ;
- **cadre rouge** : elle a été refusée, avec la raison (« La série « Rue » contient encore 4 photo(s). »).

Quand un formulaire contient une erreur, les champs fautifs sont signalés en rouge, avec un message sous chacun, et **le reste de votre saisie est conservé**.

## Sessions et sécurité

- **Durée :** une session reste ouverte **8 heures sans activité**, et **24 heures au plus**. Au-delà, l'admin vous renvoie vers la connexion, puis vous ramène où vous étiez.
- **Ordinateur partagé :** cliquez sur **Se déconnecter**. La session est fermée sur le site et chez Zitadel.
- **« Formulaire expiré » :** la page était restée ouverte au-delà de votre session, ou dans une ancienne session. Rechargez la page et recommencez.
- **« Trop de tentatives » :** trop de connexions ont été tentées depuis votre réseau en 10 minutes. Patientez quelques minutes.

Toutes les actions de l'admin sont journalisées avec le compte qui les a faites.
