# Premiers pas

## Se connecter

1. Ouvrez l'adresse du site suivie de `/admin`.
2. Vous êtes envoyé vers la page de connexion (Zitadel). Connectez-vous avec votre compte, ou avec « Continuer avec Google » si c'est ainsi que votre compte a été créé.
3. Vous arrivez sur **Aujourd’hui**, ou sur la page que vous aviez demandée.

- **« Accès refusé » :** votre compte n'a pas le rôle d'administration. Utilisez « Utiliser un autre compte », ou demandez le rôle à l'autre photographe.
- **Connexion de test :** sur un serveur de test seulement, un formulaire « Connexion de test » remplace Zitadel. Il demande le photographe à incarner et un jeton. Un bandeau rouge « Connexion locale de test » reste alors affiché en haut de l'admin.

## Se repérer

La **barre latérale**, à gauche, est toujours là. Elle est rangée par intention :

| Groupe | Entrée | Pour |
|---|---|---|
| | **Rechercher, agir… ⌘K** | la palette de commandes : une photo, une série, une page ou une action, au clavier |
| | **Aujourd’hui** | ce qui reste à faire et l’état du site d’un coup d’œil |
| **Travailler** | **Sorties** | une ligne par journée de prise de vue : ses photos et les personnes rencontrées, à trier ensemble (voir [Rencontres](rencontres#les-sorties)) |
| | **Photothèque** | importer, voir, compléter, publier, ordonner, supprimer |
| | **Personnes** | les personnes photographiées, avec toutes leurs rencontres : accords, refus, photos, droits (voir [Rencontres](rencontres#les-personnes)) |
| **Publier** | **Site public** | nom du site, textes, photos de l’ouverture, carte du monde |
| | **Séries** | créer, renommer, ordonner les séries ; sous l’entrée, *la liste des séries*, où l’on **dépose** des photos glissées depuis la photothèque |
| | **Instagram** | la file des photos à publier sur Instagram, et ses réglages |
| | **Statistiques** | la fréquentation du site, mesurée de façon anonyme |
| **Sur le terrain** | **App, cartes, QR** | l’app Rencontre du téléphone, les cartes d’accord à imprimer, le QR des vêtements |
| **Réglages** | **Photographes** | fiches des photographes, lettre des cartes, lien avec leur compte |
| | **Apparence** | thème du site, logo, icône |
| | **Filigrane & EXIF** | marquer les images, choisir les métadonnées |
| | **Droits & confidentialité** | textes des droits d’utilisation, page de confidentialité |
| | **Aide** | cette aide |
| | **Voir le site** | le site public, dans un nouvel onglet |

**Langue de l’admin** : au bout du menu, le même sélecteur que sur le site (drapeau et code : Français, English, Deutsch). Le choix est gardé sur **votre fiche de photographe** : il vous suit sur l’ordinateur comme sur le téléphone (l’app Terrain comprise) ; un compte qui n’est lié à aucun photographe le garde dans ce navigateur. Les écrans, boutons et messages changent de langue ; vos textes (titres, légendes, séries…) gardent leurs propres traductions ; cette aide existe aussi en anglais et en allemand. Dans l’app, la partie tendue à la personne photographiée reste dans la langue qu’elle choisit.

**Les mots de l’admin** : une **série** est un thème du site public (ce que voit le visiteur) ; une **sortie** est une journée de prise de vue d’un photographe (ses photos de ce jour-là et les personnes rencontrées) ; un **accord** (ou un **refus**) est ce qu’une personne photographiée a décidé, usage par usage ; la **carte d’accord** est le carton à faire signer ; la **carte du monde** est la page publique `/carte`.

Les **états** se lisent sans la couleur : **✓** (rond) c’est bon, **▲** (triangle) à vérifier, **✕** (carré ou croix) bloqué ; la couleur (bleu, jaune, vermillon) ne fait que le souligner.

En bas : votre nom, le bouton **soleil / lune** qui passe l’admin en **mode clair ou sombre**, et **Se déconnecter**. Sans choix de votre part, l’admin suit le réglage clair ou sombre de votre ordinateur ; votre choix est gardé pour les visites suivantes.

Pendant le traitement d’un import, l’indicateur **Traitement : *n* photos** s’affiche aussi en bas de la barre latérale.

**Sur téléphone (iPhone…)**, la barre latérale se replie : une **barre d’onglets** en bas donne Aujourd’hui, Photos, **Importer** (le gros bouton du milieu), **Terrain** (l’accueil Terrain : nouvelle rencontre, mon QR, ma sortie du jour) et **Menu** (qui ouvre la barre latérale, même sans JavaScript ; **Fermer**, en haut, la referme ; tant qu'elle est ouverte, le clavier reste dans le menu). Boutons, cases et champs y sont assez grands pour le doigt. Les écrans s’adaptent : par exemple, « Compléter et publier » montre une carte par photo (voir [Compléter et publier](photos#3-compléter-et-publier)).

Chaque écran a un lien **« Aide sur cette page »** (dans la photothèque : **Aide**, en haut à droite) qui mène directement à la bonne section.

## L’admin v2

L’administration existe en deux versions, côte à côte. La **v2** est la nouvelle, issue de l’audit d’ergonomie d’octobre 2026 ; la **v1** est celle que vous connaissez. **Chaque compte choisit la sienne** : votre choix ne change rien pour les autres, ni pour le site public.

- **Essayer la v2** : au pied de la barre latérale, au-dessus de votre nom, **Essayer l’admin v2**. Un clic, et vous y êtes.
- **Revenir à la v1** : au même endroit, **Revenir à l’admin v1**. Un clic aussi, quand vous voulez. Le choix se règle aussi dans **Mon compte** (cliquez sur votre nom), avec les e-mails des avis.
- **Un écran pas encore refait** s’affiche en v1, entier : la barre latérale de la v1 le dit (« Écran pas encore en v2 ») et garde le bouton du retour. Les autres écrans restent en v2.

Ce que la v2 change :

- **Le menu en quatre groupes** : **Photos** (Photothèque, Séries, Sorties, Voyages), **Personnes** (Personnes, Signalements, App de terrain), **Publier** (À valider ou Mes propositions, Site public, Carnets, Galeries privées, Instagram), **Équipe** (Comptes et rôles, Circuit de publication, Journal, Sécurité, Statistiques). Au pied : Réglages, Aide, Voir le site, la langue, Nouveautés. Une entrée n’apparaît que si votre rôle peut ouvrir la page.
- **Les Réglages à onglets** : Identité et apparence, Filigrane et EXIF, Mentions et confidentialité, Photographes, **Assistants d’analyse** (les aides calculées sur le serveur, avec leur interrupteur). Au téléphone, les onglets sont des cases, tous visibles.
- **Une seule façon d’enregistrer** : ce qui se défait s’enregistre quand vous quittez le champ ou touchez l’interrupteur ; le message en bas propose **Défaire** pendant 10 secondes (il attend tant que la souris ou le clavier est dessus). Le **témoin** sous le titre dit « Enregistré à 22 h 40 », ou « 1 champ non enregistré » avec un lien vers le champ. Ce qui a un effet public (les mentions légales, publier, proposer) garde un bouton qui le dit. Sans JavaScript, un bouton **Enregistrer** apparaît.
- **Compléter et proposer** (le lot d’un import) : titres anglais et allemand repliés sous chaque titre, la suggestion de série en un clic, **Pour les photos cochées** (série, lieu, ville de la carte, date) qui ne change rien avant **Appliquer**, des filtres **À corriger** et **Accord à vérifier**. **Proposer** (ou **Publier**, pour qui publie) montre d’abord ce qui reste à revoir — titre provisoire, date refusée, accord à vérifier — et se corrige sur place.
- **La fiche d’une photo** : la photo à gauche, les champs à droite, dans l’ordre de ce que voit le visiteur (titre, légende, texte de remplacement, mots-clés), puis **Où et quand** (série, photographe, lieu, ville de la carte, date, heure montrée) et **Diffusion** (filigrane, adresse). Chaque champ s’enregistre quand vous le quittez, avec **Défaire**. Une suggestion (description, traduction, mot-clé) remplit le champ sans rien enregistrer : relisez, puis **Enregistrer**. Plus de boutons « Brouillon / Publiée » : **Publier…**, **Proposer…** et **Dépublier…** (qui demande une raison, envoyée au photographe) passent par un dialogue, comme **Renvoyer** et **Supprimer**. Les accords et les visages sont en tête, avec un titre provisoire signalé.
- **La photothèque** : des filtres d’état avec leur symbole (○ Brouillons, ● Publiées, ◐ Proposées, ▲ Accord à vérifier…), un bouton **Filtrer** (les listes n’agissent plus à la première flèche), l’inspecteur qui nomme la photo choisie et dit une erreur sous son champ. **P** ouvre d’abord le dialogue de publication, qui montre les titres provisoires ; toutes les actions proposent **Défaire** sans recharger la page. Les touches d’une lettre (**P**, **I**, **L**, **Espace**) ne valent que quand une vignette ou l’inspecteur a le focus, et se coupent dans **Mon compte** (**Raccourcis d’une touche**).
- **À valider** : une ligne par proposition, avec l’état des accords et le titre provisoire ; **Renvoyer…** depuis la ligne, **Annuler la programmation** depuis la liste des programmées ; **Valider les photos cochées** montre d’abord combien partent, et quand.
- **L’app de terrain** : un titre, l’heure de fin de votre session, **Tendre le téléphone à la personne** qui replie votre partie, la langue de la personne sans drapeau, ce qui manque dit dans sa langue, la signature gardée après une erreur et **Effacer** qui se défait ; si le réseau coupe ou si la session expire, l’accord reste à l’écran jusqu’à **Réessayer**.

La Vigie est la même qu’en v1 : l’entrée **Sécurité** et son badge, la ligne en tête d’**Aujourd’hui**, le bandeau d’une alerte critique.

## Après chaque action

Un message apparaît en haut de la page :

- **liseré vert** : l'action a réussi (« Photo enregistrée. ») ;
- **liseré rouge** : elle a été refusée, avec la raison.

Dans la photothèque, les modifications rapides s’annoncent par un message en bas de l’écran, avec **Annuler** (ou **⌘Z** / **Ctrl+Z**).

Quand un formulaire contient une erreur, les champs fautifs sont signalés en rouge, avec un message sous chacun, et **le reste de votre saisie est conservé**.

## Sessions et sécurité

- **Durée :** une session reste ouverte **8 heures sans activité**, et **24 heures au plus**. Au-delà, l'admin vous renvoie vers la connexion, puis vous ramène où vous étiez.
- **Ordinateur partagé :** cliquez sur **Se déconnecter**. La session est fermée sur le site et chez Zitadel.
- **« Formulaire expiré » :** la page était restée ouverte au-delà de votre session, ou dans une ancienne session. Rechargez la page et recommencez.
- **« Trop de tentatives » :** trop de connexions ont été tentées depuis votre réseau en 10 minutes. Patientez quelques minutes.

Toutes les actions de l'admin sont journalisées avec le compte qui les a faites.
