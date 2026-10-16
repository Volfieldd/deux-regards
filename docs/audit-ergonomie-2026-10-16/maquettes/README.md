# Maquettes de l'audit d'ergonomie du 16 octobre 2026

Vingt maquettes en HTML et CSS, sans dépendance : MQ-01 à MQ-10 corrigent l'existant, MQ-11 à MQ-20 préparent le carnet, les galeries privées et la boutique. [MQ-00](MQ-00-direction-artistique.html) est la planche de direction artistique commune : jetons, composants, annotations ; les vingt maquettes s'y conforment. Mots et données fictives : [LEXIQUE-ET-DONNEES.md](LEXIQUE-ET-DONNEES.md). Le détail de chaque maquette (constats illustrés, ce qu'elle doit montrer) est dans la section [Maquettes](../README.md#maquettes) du rapport.

## Les ouvrir

- Ouvrez directement un fichier `MQ-xx-….html` dans votre navigateur (double-clic, ou glisser dans une fenêtre). Ce sont des fichiers locaux : aucun serveur n'est nécessaire.
- Aucune ressource externe : polices (Jost, IBM Plex Mono, Cormorant Garamond), feuilles de style et photos sont dans `_commun/`. Les pages fonctionnent hors ligne et n'envoient aucune requête vers Internet. Les liens internes des maquettes (`/tirages`, `/carnet/…`) ne mènent nulle part : ce sont ceux du futur site.
- Gardez le dossier entier : les fichiers HTML chargent `_commun/` par un chemin relatif.
- Pour voir la version téléphone, réduisez la fenêtre sous 760 px ou utilisez le mode « appareil » des outils de développement (Pixel 7, 412 × 839). Les maquettes de l'administration MQ-18 à MQ-20 suivent le mode du système : « Chambre noire » en mode sombre, clair sinon ; MQ-07 à MQ-10 sont en mode clair.
- Les rendus `-bureau.webp` (1440 × 900, densité 1) et `-mobile.webp` (Pixel 7, 412 × 839, densité 2) sont des captures pleine page de ces fichiers. Le format WebP plafonne à 16 383 px de haut : les pages de téléphone les plus longues (MQ-07, 08, 12, 15, 17 à 20) sont réduites pour tenir en 16 000 px, soit une densité effective de 1,3 à 1,9. MQ-10, l'app de terrain, n'a qu'un rendu téléphone. MQ-00, trop longue pour une seule colonne, est rendue en bandes côte à côte, coupées entre deux blocs et à lire de gauche à droite : 2 bandes au bureau (densité 1), 5 au téléphone (densité 1,5).

## Ce qui est annotation, et ce qui est interface

Tout ce qui est magenta appartient à la maquette, jamais à l'interface proposée : pastilles carrées numérotées (en marge, hors du flux, `aria-hidden`), étiquettes « État · … » au-dessus d'un cadre pointillé, traits du bas du premier écran dans les marges, et l'encart « Ce qui change » en fin de page. Gabarit commun : `_commun/annotations.css`. Pour voir une maquette sans annotations, ajoutez `#sans-annotations` à l'adresse (ou imprimez) : l'interface ne bouge pas d'un pixel. Les maquettes v0 (pastilles jaunes) gardent leur ancien gabarit jusqu'à leur reprise.

## Contenu de `_commun/`

| Fichier | Rôle |
|---|---|
| `site.css` | styles du site public, copie de `main` (polices en relatif) |
| `tokens.css` | jetons uniques : couleurs des thèmes nuit, jour, Atelier, admin clair et Chambre noire ; états ; échelle typographique ; espaces (grille de 8 px) ; rayons ; focus. Aucune maquette ne les redéclare |
| `public.css` | composants du site public : en-têtes Site, Contexte, Tunnel ; menu du téléphone ; langue ; pieds de page ; cartel ; vignettes en rangées ; diptyque ; boutons ; bascules ; formulaires ; prix ; étapes ; messages |
| `admin.css`, `app.css` | styles de l'administration et de l'app de terrain, copies de `main` |
| `admin-plus.css` | ce qui manque à `admin.css` : barre latérale unique, en-tête de page, trois boutons, états, témoin d'enregistrement, message d'action, formulaire type, dialogue |
| `annotations.css` | gabarit commun des annotations (magenta) et interrupteur « sans annotations » |
| `site-entete.css` | ancien en-tête des maquettes v0, remplacé par `public.css` |
| `fonts/` | polices WOFF2 |
| `photos/` | 26 photos de synthèse de la démonstration (aucune photo réelle) en 900 px, et leurs variantes `480/` et `160/` ; une image = une photo, voir LEXIQUE-ET-DONNEES.md |

`MQ-00-echantillons/` contient les pages de contrôle des en-têtes (à redimensionner) et les écrans de l'administration montrés dans MQ-00.

Les vignettes du tableau du rapport sont dans `vignettes/`.
