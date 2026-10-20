# Validation du système de thèmes

Validation locale du 20 octobre 2026, sur une base et un stockage jetables. **Toutes les photos des captures sont les quatre paysages générés des maquettes**, vérifiés par empreinte avant leur import. Aucun média, compte ou contenu de production utilisé pour ces captures. Les photos, auteurs, lieux et récits de démonstration sont fictifs.

[Manifeste des contrôles et empreintes](validation.json)

## Résultats

| Couverture | Attendu | Résultat |
|---|---|---|
| 84 tests serveur ciblés | Rendu, réglages, permissions, CSRF, héritage, aperçu, retour arrière, compatibilité V1/V2/V3, Carnets, traductions | Passants, après adaptation de l’ancien test d’ordre des panneaux à la nouvelle interface |
| 132 vues Chromium | 6 thèmes × 11 pages × 2 formats : 1440 × 1000 et 390 × 844 | Pages HTTP 200, un H1, images décodées, aucun débordement horizontal |
| Navigation mixte | Accueil V1 → Carnet Contact → photo Obscura → retour au Carnet | Thème attendu à chaque étape et contexte du billet conservé |
| Administration | Enregistrer par le formulaire, recharger, retrouver les choix | Réglages persistants dans les deux versions de l’admin ; parcours navigateur exécuté en admin V2 |
| Aperçu | Administrateur en Hors cadre, visiteur en Panoramique ; quitter l’aperçu | Isolation et retour au choix des visiteurs vérifiés |
| Ouverture | Changer de photo, changer de légende, revenir ; sélection annoncée | Boutons et sélection cohérents, aucun défilement automatique |
| Petits écrans | Accueil des 6 thèmes et formulaire admin à 320 px | Aucun débordement horizontal |
| Clavier et visionneuse | Lien d’évitement, ouverture/fermeture du plein écran, restitution du focus | Vérifiés dans Chromium |
| Photo et carte | Mini-carte, connexes, zoom et sélection d’un lieu ou agrandissement d’un regroupement | États observés conformes aux fonctions existantes |
| Mode calme | Préférence conservée entre les pages ; réduction système prioritaire | Vérifié ; contraste de l’état activé corrigé |
| Sans JavaScript | Photo initiale visible et accès à la galerie | Vérifiés |
| Réseau et console | Aucun appel externe ni erreur JavaScript | Aucun observé dans les parcours enregistrés |
| Axe ciblé | Accueil, photo, carte et billet Obscura ; mode calme activé | Aucune violation détectée après correction ; vérifications de contraste incomplètes sur certains éléments des pages photo/carte/billet |

Les 11 pages de chaque thème sont l’accueil, la galerie, une photo horizontale, une verticale, la carte, les voyages, un voyage détaillé, les Carnets, un billet, la présentation des regards et le contact. Les 19 vérifications complémentaires portent notamment sur les petits écrans et les interactions ci-dessus. Les détails sont dans le manifeste.

## Captures de revue

- [Les six accueils](captures/00-six-accueils.webp) — début de chaque page, pour comparer les directions.
- [Le panneau des thèmes dans l’administration](captures/01-reglages.webp) — réglages par rubrique ouverts.
- [Une photo, sa carte et ses connexes](captures/02-photo-carte-connexes.webp).
- [Un Carnet sur téléphone](captures/03-carnet-mobile.webp).

Les WebP ont été rouverts après encodage ; leurs dimensions, leurs empreintes et l’absence d’EXIF sont consignées. Les 132 captures intermédiaires ne sont pas toutes ajoutées au dépôt : ces quatre preuves suffisent à illustrer le résultat sans dupliquer le dossier des maquettes.

## Corrections et limites

Deux défauts visuels introduits pendant le développement ont été corrigés puis revérifiés : les positions de la grille Hors cadre qui débordaient sur téléphone, et le contraste du bouton Mode calme activé. Un ancien test attendait le panneau V1/V2 en premier ; il vérifie maintenant que les compositions viennent avant les réglages historiques.

Les essais ont aussi nécessité d’adapter le jeu temporaire au format d’identifiant des médias et de fermer le dialogue de nouveautés de l’admin. La sélection sur la carte tient compte du comportement existant : un groupe de lieux agrandit la carte avant de permettre le choix individuel. Ces ajustements concernent le protocole d’essai, sans modification du serveur de médias ni de la carte.

Les tests unitaires et HTTP réutilisent les jeux de test existants. Le serveur navigateur, lui, ne charge que les quatre images générées. Aucun nouvel outil de test générique, dépendance ou pipeline CI n’a été créé.

Pas de certification RGAA/RGESN : lecteur d’écran réel, Safari/Firefox, zoom navigateur à 200 %, réseau mobile contraint, contenu réel volumineux et campagne complète de galeries privées ne sont pas couverts. Les opérations serveur et règles de publication existantes sont réutilisées. La mise en production et l’activation d’un thème n’ont pas été effectuées.
