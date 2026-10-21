# Galeries privées

Une **galerie privée** montre des photos choisies à des personnes invitées, et à elles seules : la planche d'une séance à la cliente, un travail en cours à une éditrice, un récit pour des proches. Chaque personne reçoit un **accès** : un **lien personnel** et un **mot de passe**, que vous lui donnez par deux moyens différents (le lien par e-mail, le mot de passe par SMS ou de vive voix). Menu : **Publier › Galeries privées**. Chaque photographe voit ses galeries, l'administrateur toutes ; le modérateur et le relecteur n'y ont pas accès.

## Créer une galerie

**Nouvelle galerie** : un titre (en anglais et en allemand si vos invités lisent ces langues), un mot d'accueil facultatif, et la **date de fermeture** (un an au plus). Une galerie commune aux deux photographes n'existe que pour qui voit toutes les galeries.

- **Photos** : l'onglet Photos ajoute des photos de la photothèque, brouillons compris (elles gardent leur statut : rien n'est publié). Chaque photo montre son **usage privé** : ● prête (aucun visage, ou un accord « expositions et tirages » sûr), ▲ à vérifier (un visage sans accord, un accord pour le site seulement), ✕ bloquée (un refus : elle ne peut pas être ajoutée, et une photo refusée plus tard disparaît de la galerie). Une photo à vérifier reste **cachée aux invités** tant que vous ne l'avez pas confirmée : **Confirmer l'usage privé** l'affiche et garde votre confirmation ; la fiche de la galerie dit combien de photos sont cachées. **Monter** et **Descendre** règlent l'ordre que verront les invités.
- **Ouvrir** : une galerie commence en brouillon (l'équipe seule) ; **Ouvrir la galerie** rend ses accès valables. À sa date de fermeture, elle se ferme seule et tous ses accès cessent de marcher.
- **Voir comme un invité** : la galerie telle que la verra une personne invitée, avec un bandeau « Vue équipe » ; rien n'est noté.
- Avec le réglage **Tout l'EXIF de l'original** (Filigrane & EXIF), les images gardent le GPS : la galerie privée ne les sert pas, l'onglet Photos le signale.

## Donner un accès

**Nouvel accès** : le nom de la personne (vous seul le voyez, il est chiffré), **une personne** (lien personnel, par défaut) ou **un groupe** (le même lien pour plusieurs personnes, signalé dans la liste), la langue de la galerie pour elle, la **fin de l'accès** (30 jours par défaut, 6 mois au plus, jamais après la fermeture ; deux choix rapides) et ses **droits** : choisir ses favoris, télécharger les photos en 2 048 px, et en grande taille jusqu'à 4 000 px. La personne voit les photos prêtes ou confirmées, avec le filigrane du site, téléchargements compris (le même que celui du site) ; jamais l'original ni le GPS.

**Créer l'accès** affiche **une seule fois** le lien et le mot de passe (12 caractères en trois groupes, sans 0, O, 1, I ni L), avec deux messages prêts à copier : celui du lien, à envoyer par e-mail, et celui du mot de passe, à envoyer par SMS. **Le site n'envoie aucun e-mail** : vous transmettez vous-même. Quittée, la page ne se relit plus : seules les empreintes du lien et du mot de passe sont gardées. Renvoyer le formulaire (F5, Précédent) ne crée pas un second accès.

## Suivre un accès

L'onglet **Accès** donne une ligne par accès : ses droits, sa fin, sa dernière visite, son état (◐ envoyé, pas ouvert ; ● ouvert ; ▲ en pause, suspendu, ou qui expire dans 3 jours ; ✕ expiré ou révoqué). La fiche d'un accès montre :

- **les chiffres** : ouverture (le mot de passe accepté, pas le simple lien : un antivirus de messagerie ouvre souvent le lien avant la personne), dernière visite, **appareils** (signalés dans « Aujourd'hui » au-delà de 3 : le lien a peut-être été transmis), favoris ;
- **sa sélection** : les favoris dans l'ordre où elle les a posés, **Exporter la sélection (CSV)** (noms de fichiers d'origine), et **Rouvrir la sélection** après un envoi. Ouvrir la fiche fige une sélection envoyée : la personne ne la reprend plus seule ;
- **l'activité** : visites, mots de passe refusés, pauses, favoris, téléchargements, avec le réseau (adresse IP tronquée) et le pays ; jamais le navigateur ;
- **les réglages** : prolonger (même lien, même mot de passe), élargir ou réduire les droits ; **Nouveau mot de passe…** (le lien reste ; une pause ou une suspension est levée) ; **Nouveau lien…** (le mot de passe reste ; l'ancien lien cesse de marcher aussitôt) ;
- **Révoquer l'accès…** : le lien et le mot de passe cessent de marcher tout de suite, même dans une galerie déjà ouverte chez la personne ; **Effacer l'accès et ses données…** : tout ce qui le concerne est effacé.

## Sécurité et données

- **Essais** : 5 mots de passe refusés de suite donnent une pause d'une minute, 10 une pause de 15 minutes, 30 suspendent l'accès (signalé dans « Aujourd'hui ») jusqu'à ce que vous le débloquiez. **Débloquer l'accès** ou **Nouveau mot de passe…** rouvrent.
- **Sur le navigateur de la personne** : la galerie reste ouverte 12 heures sans visite et 7 jours au plus, ou 30 jours avec « Se souvenir de cet appareil » ; jamais après la fin de l'accès. **Quitter la galerie** la referme.
- **Pages privées** : jamais indexées, jamais gardées en cache, sans lien vers un autre site ; les images ne sont servies qu'à une session qui a le droit de les voir, jamais par l'adresse publique des photos.
- **Journal** : chaque accès créé, élargi, prolongé, débloqué, révoqué ou effacé est noté au [Journal](reglages#journal) avec son numéro (jamais le lien, le mot de passe ni le nom), comme chaque lecture d'une fiche d'accès ou de l'activité ; la Vigie, si elle est en service, le reçoit aussi.
- **Durées** : tout ce qui concerne un accès (nom, activité, favoris, sélection) est effacé six mois après sa fin ; une personne peut demander à l'effacer plus tôt (**Effacer l'accès et ses données…**).

Dans l'admin v2, révoquer, effacer, donner un nouveau lien ou un nouveau mot de passe, fermer et supprimer une galerie se confirment dans une fenêtre de la page ; les réglages d'une galerie et d'un accès s'enregistrent quand on quitte le champ, avec « Défaire » (sauf une fermeture avancée, qui raccourcit les accès et ne se défait pas). « Aide sur cette page » ouvre ce passage de l'aide à côté de la page.
