# Maquettes de l'audit d'ergonomie du 16 octobre 2026

Vingt maquettes en HTML et CSS, sans dépendance : MQ-01 à MQ-10 corrigent l'existant, MQ-11 à MQ-20 préparent le carnet, les galeries privées et la boutique. Le détail de chaque maquette (constats illustrés, ce qu'elle doit montrer) est dans la section [Maquettes](../README.md#maquettes) du rapport.

## Les ouvrir

- Ouvrez directement un fichier `MQ-xx-….html` dans votre navigateur (double-clic, ou glisser dans une fenêtre). Ce sont des fichiers locaux : aucun serveur n'est nécessaire.
- Aucune ressource externe : polices (Jost, IBM Plex Mono, Cormorant Garamond), feuilles de style et photos sont dans `_commun/`. Les pages fonctionnent hors ligne et n'envoient aucune requête vers Internet. Les liens internes des maquettes (`/tirages`, `/carnet/…`) ne mènent nulle part : ce sont ceux du futur site.
- Gardez le dossier entier : les fichiers HTML chargent `_commun/` par un chemin relatif.
- Pour voir la version téléphone, réduisez la fenêtre sous 760 px ou utilisez le mode « appareil » des outils de développement (Pixel 7, 412 × 839). Les maquettes de l'administration MQ-18 à MQ-20 suivent le mode du système : « Chambre noire » en mode sombre, clair sinon ; MQ-07 à MQ-10 sont en mode clair.
- Les rendus `-bureau.webp` (1440 × 900, densité 1) et `-mobile.webp` (Pixel 7, 412 × 839, densité 2) sont des captures pleine page de ces fichiers. Le format WebP plafonne à 16 383 px de haut : les pages de téléphone les plus longues (MQ-07, 08, 12, 15, 17 à 20) sont réduites pour tenir en 16 000 px, soit une densité effective de 1,3 à 1,9. MQ-10, l'app de terrain, n'a qu'un rendu téléphone.

## Ce qui est annotation, et ce qui est interface

Tout ce qui est jaune appartient à la maquette, pas à l'interface proposée : pastilles numérotées, repère « bas du premier écran », planches « Autre état », et l'encart crème « Ce qui change » en fin de page (en-tête, repères avec leur ligne de références, bloc « Mesures »). Ce gabarit est commun aux vingt maquettes (`_commun/annotations.css`) ; pastilles, repère et bandeau disparaissent à l’impression.

## Contenu de `_commun/`

| Fichier | Rôle |
|---|---|
| `site.css` | styles du site public, repris du dépôt |
| `site-entete.css` | en-tête et pied de page cibles du site public (MQ-01), communs à toutes les maquettes du site |
| `admin.css`, `app.css` | styles de l'administration et de l'app de terrain, repris du dépôt |
| `annotations.css` | gabarit commun des annotations |
| `fonts/` | polices WOFF2 |
| `photos/` | 12 photos de synthèse de la démonstration (aucune photo réelle) |

Les vignettes du tableau du rapport sont dans `vignettes/`.
