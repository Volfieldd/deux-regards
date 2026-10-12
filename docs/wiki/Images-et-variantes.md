# Images et variantes

## Principe

| | Où | Servi ? |
|---|---|---|
| **Original** | `STORAGE_DIR/originals/<uuid>.<ext>` | **Jamais** : aucune route ne mène à ce dossier. |
| **Variantes** | `STORAGE_DIR/variants/` | Oui, sous `/media/`, et seulement pour les photos **publiées**. |
| **Image Instagram** | aucun fichier : calculée à la demande depuis l'original | Seulement pendant un envoi, sous `/partage/instagram/<jeton>.jpg` (voir [Instagram](Instagram)). |

Chaque photo a des variantes **AVIF** et **WebP** aux largeurs 640, 1280 et 2000 px. Il n'y a jamais d'agrandissement : une image de 900 px a des variantes de 640 et de 900 px.

Les pages utilisent `<picture>` avec `srcset` et `sizes` : le navigateur choisit le format et la taille. Les dimensions sont toujours indiquées, ce qui évite les sauts de mise en page, et les images hors écran sont chargées à la demande.

## Traitement d'une photo

1. **Import :**
   - vérification du poids (60 Mo), du nombre de pixels (120 Mpx) et du format réel, par décodage ;
   - empreinte SHA-256 de l'original, puis horodatage RFC 3161 en arrière-plan (voir [Preuves d'antériorité et droits](Preuves-et-droits)) ;
   - l'original est rangé sous un nom aléatoire ;
   - la photo est créée en brouillon.
2. **Rendu de chaque variante**, en un seul pipeline `sharp` :
   - application de l'orientation EXIF aux pixels ;
   - redimensionnement ;
   - filigrane éventuel ;
   - métadonnées selon le réglage (aucune par défaut ; mentions IPTC en XMP dans les modes signés) ;
   - encodage AVIF (qualité 55) ou WebP (qualité 78).
3. **Publication :** les variantes deviennent accessibles sous `/media/`.

## Noms et cache

```
<uuid>-<largeur>.<format>               sans filigrane ni métadonnée
<uuid>-<empreinte>-<largeur>.<format>   avec filigrane et/ou métadonnées
```

- Les variantes sont servies avec `Cache-Control: max-age=31536000, immutable`.
- L'**empreinte** (8 caractères) résume les réglages appliqués. Quand ils changent, le nom change : le navigateur ne peut pas garder une version périmée.
- Seule la variante qui porte l'empreinte **courante** de la photo est servie ; les autres répondent 404, puis sont supprimées.
- Les brouillons restent visibles dans l'admin, via `/admin/media/` (session admin, `Cache-Control: no-store`).

## Recalcul

Le recalcul se déclenche :

- après une modification dans l'admin (réglages du filigrane ou des métadonnées, logo, dessins de la marque utilisés en filigrane, nom du site, auteur, photo) ;
- au démarrage du serveur ;
- avec `npm run variants`.

Une seule tâche de fond tourne à la fois, et seules les photos dont l'empreinte a changé, ou dont un fichier manque, sont recalculées.

- **Import :** il n'attend pas la fin d'un recalcul en cours. Un verrou par photo empêche deux rendus simultanés de la même image.
- **Import photo par photo (page d'import) :** `POST /admin/photos/envoi` range l'original et crée le brouillon, puis répond aussitôt ; les variantes sont rendues **en arrière-plan, une photo après l'autre**. `GET /admin/photos/traitement?ids=…` donne l'état de chacune (`waiting`, `processing` avec `done / total`, `ready`, `error`) et le nombre de photos en cours (indicateur d'en-tête). Ce suivi est en mémoire : après un redémarrage, le passage de démarrage rend ce qui manque. Une photo dont le rendu échoue est supprimée (ligne, original, variantes), comme à l'import classique.
- **Écriture :** chaque variante est écrite sous un nom temporaire, puis renommée. Un arrêt brutal ne laisse jamais de fichier tronqué.
- **Ménage :** au démarrage, les fichiers temporaires et les variantes sans photo sont effacés ; en fin de recalcul, les logos remplacés aussi.
- **Arrêt :** l'arrêt du serveur interrompt un recalcul entre deux photos.

Un visiteur dont la page a été chargée juste avant une bascule peut voir une image manquante jusqu'au rechargement : l'ancienne variante est effacée dès que la nouvelle est en place.

```bash
npm run variants              # vérifie et recalcule ce qui doit l'être
npm run variants -- --force   # recalcule tout
```

Pour tout recalculer après une évolution du code de rendu, incrémentez `PIPELINE` dans `server/variants.js`.

## Protection

- **Dissuasion :** le clic droit et le glisser sont désactivés sur les images, et les originaux ne sont jamais exposés.
- **Filigrane** optionnel (voir [Filigrane et EXIF](Filigrane-et-EXIF)).
- **Aucune métadonnée** par défaut : pas de GPS, pas d'appareil.

Aucune de ces mesures n'empêche une capture d'écran : elles rendent seulement la copie moins facile et moins utile.
