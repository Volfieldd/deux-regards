# Apparence

L'apparence du **site public** : version (v1, v2 ou v3), thème, logo et icône. L'admin garde toujours la sienne.

En **admin v2**, cette page est l'onglet **Identité et apparence** des Réglages : mêmes champs, mais le sous-titre, la marque et le thème s'enregistrent au geste (avec **Défaire**), et un logo dès le fichier choisi ; remplacer ou retirer un logo passe par un dialogue (voir [L'admin v2](premiers-pas#ladmin-v2)).

## Site public : v1 ou v2

En tête de la page. La **v2** est la nouvelle présentation du site public, issue de l'audit d'ergonomie d'octobre 2026. Elle couvre toutes les pages publiques (voir [Le site vu par les visiteurs](site-public)), sauf les pages d'erreur et de connexion, qui gardent la présentation v1. L'administration ne change pas.

**La v1 est gardée**, pour de bon : elle reste un retour possible à tout moment, et reçoit les correctifs de sécurité et d'accessibilité. Les nouveautés (Carnets, galeries privées) n'existent qu'en v2 et en v3.

**La v3** reprend les pages de la v2 et leurs règles d'accessibilité, avec un autre dessin : à l'accueil, la photo en plein cadre (bord à bord, recadrée de 10 % au plus ; au bureau, l'en-tête et le titre de la photo sont posés dessus, au téléphone le titre vient dessous), les regards présentés par leurs photos, des titres plus grands, les données des photos en caractères à chasse fixe, des boutons sans cadre. Une page qui n'a pas de v2 s'affiche en v1, en v3 comme en v2. Pas de boutique : ni « Tirages », ni bouton d'achat.

1. **Passer d'une version à l'autre, pour vous seul :** en haut de chaque page du site public, deux petits boutons, **Voir en v1**, **Voir en v2** ou **Voir en v3** (les deux versions que vous ne voyez pas), changent la version que vous voyez ; un clic, et la même page s'affiche dans l'autre version.
   - À côté, une phrase rappelle ce que voient les visiteurs : « Vous voyez la v1, comme les visiteurs » ou « Vous seul voyez la v2 ; les visiteurs voient la v1 ».
   - **Vous seul** voyez ce bouton et cette vue, sur cette session (cet appareil, ce navigateur), jusqu'à un nouveau clic, la déconnexion ou la fin de la session. Il faut le droit d'apparence.
   - Les visiteurs voient toujours la version choisie ici, quoi qu'ils envoient (cookie, adresse) : votre vue est gardée sur le serveur, jamais dans le navigateur.
   - Tant que vous êtes connecté, vos pages ne sont gardées dans aucun cache (Cloudflare compris) : un visiteur ne peut pas recevoir la page que vous voyez, ni le bouton.
   - En vue v1, les Carnets sont introuvables, comme pour un visiteur en v1 : sur une page des Carnets, le bouton dit **Voir l'accueil en v1** et ouvre l'accueil.
   - Le bouton n'apparaît pas sur les pages des invités des galeries privées.
   - Depuis cette section, **Voir le site en v2** (ou **en v1**, **en v3**) fait la même chose et ouvre l'accueil ; **Revenir à la version des visiteurs** oublie votre vue.
2. **Avant d'appliquer la v2 à tous :** suivez la [liste de contrôle de la bascule](https://github.com/Volfieldd/deux-regards/wiki/Bascule-v2) (essais sur iPad, ordinateur et téléphone, sauvegarde récente, ce qu'il faut surveiller la première semaine) ; pour la v3, sa [liste de contrôle](https://github.com/Volfieldd/deux-regards/wiki/Bascule-v3), qui commence par préparer l'ouverture (photos du bureau et du téléphone, point fort de chacune).
3. **L'appliquer à tous :** cochez **v2** (ou **v3**), puis **Enregistrer la version**. Revenir à la v1 se fait de la même façon, à tout moment.

Chaque clic sur le bouton, et chaque changement de version, sont notés au [Journal](reglages#journal).

## Choisir un thème

Chaque thème est présenté avec ses trois couleurs (fond, encre, accent) et une description.

1. Cliquez sur **Aperçu** sous un thème : le site s'ouvre dans un nouvel onglet avec ce thème.
   - **Vous seul** le voyez.
   - Un bandeau le rappelle en haut de page.
   - L'aperçu suit votre navigation pendant une heure, ou jusqu'à **Quitter l'aperçu**.
2. Pour l'appliquer à tous les visiteurs : cochez le thème, puis cliquez sur **Enregistrer l'apparence**.

| Thème | Esprit |
|---|---|
| **Atelier** | papier chaud, titres en italique |
| **Nicephos — nuit** | galerie noire, trait blanc, capitales espacées, accent sable |
| **Nicephos — jour** | la même identité sur fond blanc |

## Marque

- **Nom du site seulement**, ou **Emblème + nom (+ sous-titre)**. Le second choix n'est possible qu'avec un emblème ou une icône envoyés.
- **Sous-titre** : par exemple « Photography gallery », 60 caractères au plus.
- Le **nom** du site se règle dans [Site public](reglages#site-public).

## Logos : quatre emplacements

| Emplacement | Quoi envoyer | Où il apparaît |
|---|---|---|
| **Emblème (dessin)** | le dessin seul, sans texte | en-tête, à côté du nom, sur ordinateur |
| **Icône (version simplifiée)** | version à trait épais, carré de 512 px idéalement | onglet du navigateur, écran d'accueil du téléphone, en-tête sur téléphone |
| **Logo complet** | le logo avec le nom (version horizontale) | en grand, en tête de la page « À propos » |
| **Image de partage** | carré de 1080 px ou 1200 × 630 | aperçu quand une page sans photo est partagée sur un réseau social |

- **Envoyer :** choisissez le fichier (PNG, WebP ou JPEG, 5 Mo au plus), puis **Envoyer**. **Remplacer** fonctionne de la même façon ; l'ancien fichier est effacé.
- **Retirer :** un bouton sous chaque emplacement.
- **Couleur automatique :** emblème, icône et logo complet prennent **la couleur du thème** (blanc sur fond noir, noir sur fond clair). Une seule version suffit, noire ou blanche : le sens du trait est détecté. Le pourtour est recadré automatiquement.
- **Icône d'onglet :** une icône carrée sur fond opaque est reprise telle quelle. Sinon, elle est composée automatiquement.
- **Photo d'un dessin :** l'orientation du téléphone est appliquée ; un dessin photographié n'est pas affiché de travers.
- **Image de partage :** réencodée en JPEG, 1200 px au plus. Une transparence devient un fond **blanc** derrière un dessin sombre (logo noir détouré), **noir** derrière un dessin clair.
- **SVG :** refusés à l'envoi.
