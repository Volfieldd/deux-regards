# Contrôle du deuxième round — chambre noire

20 octobre 2026. Maquettes uniquement dans `docs/maquettes-v4/`. Aucun code applicatif modifié, aucune connexion à l’administration réelle, aucune opération en production. Un seul exécuteur navigateur.

## Retrait du premier dossier

- Tous les fichiers du premier dossier ont été retirés avant de reconstruire cette proposition : images, captures, présentations, données et métadonnées comprises.
- Le commit de la branche de PR a été réécrit puis poussé avec `--force-with-lease`, en vérifiant l’identifiant distant attendu.
- Les entrées de reflog concernées ont été retirées de la seule branche, de sa référence distante locale et du HEAD de ce worktree. Après contrôle de non-accessibilité par les autres références et reflogs, 97 objets Git locaux obsolètes ont été supprimés. Aucun objet concerné ne restait empaqueté.
- L’ancien commit n’était plus présent dans le magasin Git local après ce nettoyage. Aucun lancement CI GitHub n’a été trouvé pour cet ancien commit.
- La branche et la référence `head` de la PR pointaient sur le commit nettoyé. L’ancien commit répondait toutefois encore **HTTP 200 sur GitHub** : sa purge côté serveur reste à effectuer par le support GitHub. La demande préparée est hors dépôt et n’a pas été envoyée automatiquement.
- Ne pas fusionner ou réintroduire une copie de l’ancienne branche. Les éventuels autres clones et téléchargements restent hors du contrôle de cette séance.

## Provenance du nouveau dossier

Quatre images générées par l’outil intégré `imagegen`, sans photographie de référence. Prompts complets dans [la provenance](assets/provenance.json). Aucun téléchargement d’image du site effectué pour ce deuxième round. Les quatre fichiers ont été encodés en WebP, sans recadrage des fichiers source. Les recadrages de certaines couvertures sont faits par CSS ; la visionneuse montre l’image entière.

Les titres, légendes, récits et lieux sont fictifs, sans attribution aux auteurs réels. Les captures de ce dossier montrent exclusivement ces nouveaux éléments. Aucun ancien PPTX, JPG, PNG ou WebP n’a été réutilisé.

## Vérifications du deuxième round, avant les exports WebP

Résultats détaillés : [verification.json](preuves/verification.json). **18 cas réussis**, dont un contrôle de **42 états dimensionnels** : 14 pages à 1440, 390 et 320 px.

| Parcours | Attendu et résultat observé |
|---|---|
| Les six propositions | Chaque lien du comparateur ouvre sa propre direction et conserve son identifiant dans les liens suivants. |
| Obscura | Image suivante, légende et univers mis à jour ; ouverture dans la visionneuse puis retour à l’image sélectionnée. |
| Panoramique | Une vignette change l’image ; l’ouverture restitue l’image entière, y compris le portrait. |
| Résonances | Le bouton change effectivement les deux images et le titre du dialogue. |
| Collection | Univers, recherche, absence de résultat, remise à zéro ; filtre et sous-ensemble conservés après la photo. |
| Photo | Agrandissement par Entrée, dialogue, Échap et focus rendu au déclencheur. Sur téléphone, image sur toute la largeur disponible et commandes de 44 px dessous. |
| Voyage | Photo de l’étape 2, compteur 2/3, connexe du même voyage puis retour à l’étape 3. |
| Carnets | Deux textes différents ; l’image du second billet revient bien au second billet. |
| Administration | Fiche modifiée et relue en mémoire ; réinitialisation au rechargement ; sortie ajoutée visible dans la liste. |
| Publication simulée | Titre blanc refusé, brouillon conservé dans l’onglet, annulation puis confirmation explicite, état de publication simulée affiché. |
| Menu mobile | Ouverture, fermeture par Échap, restitution du focus. |
| Mode calme | Préférence locale après rechargement ; préférence système prise en compte après son événement ; animations supprimées. |
| Espacements de texte | Quatre surfaces à 390 px avec espacements de lettres, mots, lignes et paragraphes majorés : aucun débordement horizontal. |
| Réseau et erreurs | Aucun appel externe ni erreur JavaScript collecté dans les parcours exécutés. |

Les [captures initiales](preuves/apercus.json) couvrent 22 états, ordinateur et téléphone. La capture photo à 390 px a été remplacée après son ajustement, et celle à 320 px ajoutée. Le [comparatif](six-chambres-noires.jpg) réunit les six accueils. Les vues ordinateur, téléphone, visionneuse, index et admin ont été relues visuellement.

## Accessibilité ciblée

Huit scans axe : les six directions, la photo et l’administration. **Aucune violation détectée sur les règles exécutées**. Des règles restent `incomplete` : `color-contrast` sur Obscura et Photo ; `aria-prohibited-attr` sur Panoramique. Cela ne constitue pas une certification.

Les cinq couples texte/fond principaux ont aussi été calculés selon la luminance sRGB et dépassent 4,5:1. [Contrastes et contrôle statique](preuves/verification-statique.json). Ce calcul ne couvre pas tous les pixels, les images ou tous les états.

Non exécutés : lecteur d’écran réel, zoom navigateur 200 %, appareils physiques, Safari/Firefox, audit exhaustif RGAA/RGESN et opérations métier du serveur. Les émulations et scans ciblés ne sont pas présentés comme ces essais manquants.

## Corrections apportées pendant les essais

- **Défaut de maquette corrigé** : le champ de recherche déclenchait un rendu à la saisie et à la perte de focus. Le second rendu supprimait le lien au moment du clic. Les événements sont désormais séparés entre le champ et la liste d’univers ; la navigation puis le retour filtré ont été rejoués avec succès.
- **Protocole corrigé** : l’émulation de réduction des animations doit attendre l’événement `matchMedia`. L’assertion immédiate pouvait précéder cet événement ; l’essai attend désormais l’état observable, sans attente arbitraire.
- **Amélioration visuelle** : la visionneuse mobile utilise toute la largeur pour la photo ; ses flèches sont placées dessous. Les états à 390 et 320 px et le scan Photo ont été rejoués.

Les scripts ponctuels de cette séance ne sont pas ajoutés comme nouvelle infrastructure de test. Aucun script de fumée ou pipeline CI du produit n’a été modifié. Les vérifications déjà réussies n’ont pas été répétées sans changement pertinent.

## Complément : dossier WebP du site

Les maquettes ont ensuite été complétées par une carte dédiée, Regards et Contact, puis par les déclinaisons intérieures des six pistes. Les 202 captures WebP et 15 planches sont décrites dans [le guide des exports](webp/README.md). Le [manifeste](webp/manifest.json) et la [provenance vérifiée](webp/provenance-images.json) consignent les dimensions, empreintes et seules images admises. Les contrôles de cette extension sont distincts des 18 cas du round précédent ; aucune nouvelle conformité exhaustive n’est revendiquée.
