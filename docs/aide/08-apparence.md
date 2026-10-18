# Apparence

L'apparence du **site public** : thème, logo et icône. L'admin garde toujours la sienne.

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

## Site public : v1 ou v2

La **v2** est la nouvelle présentation du site public, issue de l'audit d'ergonomie d'octobre 2026. Ses pages arrivent une à une ; aujourd'hui : **la page d'une photo** (la visionneuse), **l'accueil et sa galerie** (avec les vues d'un photographe et des filtres) et **la page d'une série** (voir [Le site vu par les visiteurs](site-public)). Une page qui n'a pas encore sa version v2 s'affiche en v1. L'administration ne change pas.

1. **Voir la v2 avant tout le monde :** cliquez sur **Ouvrir l'aperçu de la v2**.
   - **Vous seul** la voyez, sur cette session (cet appareil, ce navigateur), jusqu'à **Quitter l'aperçu**, la déconnexion ou la fin de la session.
   - Un bandeau sable le rappelle en haut de chaque page du site, même d'une page restée en v1 ; il porte **Quitter l'aperçu**.
   - Les visiteurs gardent la v1, quoi qu'ils envoient (cookie, adresse) : le choix est gardé sur le serveur, jamais dans le navigateur.
   - Pendant l'aperçu, vos pages ne sont gardées dans aucun cache (Cloudflare compris) : un visiteur ne peut pas recevoir la page que vous voyez.
2. **L'appliquer à tous :** cochez **v2**, puis **Enregistrer la version**. Revenir à la v1 se fait de la même façon, à tout moment.

L'ouverture et la fermeture de l'aperçu, et chaque changement de version, sont notés au [Journal](reglages#journal).

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
