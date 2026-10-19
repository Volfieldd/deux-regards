# Images et variantes

## Principe

| | Où | Servi ? |
|---|---|---|
| **Original** | `STORAGE_DIR/originals/<uuid>.<ext>` | **Jamais** : aucune route ne mène à ce dossier. |
| **Variantes** | `STORAGE_DIR/variants/` | Oui, sous `/media/`, et seulement pour les photos **publiées**. |
| **Image Instagram** | aucun fichier : calculée à la demande depuis l'original | Seulement pendant un envoi, sous `/partage/instagram/<jeton>.jpg` (voir [Instagram](Instagram)). |

Chaque photo a des variantes **AVIF** et **WebP** aux largeurs **160, 480, 640, 1280 et 2000 px**. Il n'y a jamais d'agrandissement : une image de 900 px a des variantes de 160, 480, 640 et 900 px ; une image de 600 px, de 160, 480 et 600 px.

Les tailles de 160 et 480 px (version 1.181) servent les vignettes : planche et rangées de la galerie, « À proximité », séries, partage, carte, admin. Elles s'affichent de 40 à 320 px ; avant, le navigateur chargeait au moins la variante de 640 px (constat UX-T-07 de l'audit d'ergonomie, RGESN).

Les pages utilisent `<picture>` avec `srcset` et `sizes` : le navigateur choisit le format et la taille. Les dimensions sont toujours indiquées, ce qui évite les sauts de mise en page, et les images hors écran sont chargées à la demande. Les `sizes` disent la place réelle de l'image :

- rangées de la galerie v2 et v3 (`server/v2-vues.js`, `rowSizes`) : les rangées sont recomposées comme le navigateur le fait, par tranches d'écran de 128 px, et chaque photo prend la plus grande largeur atteinte dans sa tranche ; au téléphone, sa part de la rangée, calculée aussi pour un écran de 320 px ;
- planche contact de l'admin (`server/picture.js`, `tileSizes`) : 1,3 fois la hauteur de la rangée × le format au bureau, 1,6 fois au téléphone ; le curseur « Taille » réécrit les `sizes` à la hauteur choisie ;
- vignettes simples (carte de la fenêtre « Partager », admin des galeries privées) : un `srcset` WebP jusqu'à 640 px et la largeur affichée.

## Traitement d'une photo

1. **Import :**
   - vérification du poids (90 Mo), du nombre de pixels (120 Mpx), de la mémoire décodée (celle d'une image RVB 8 bits de 120 Mpx au plus : moins de pixels en 16 bits ou avec transparence), de la hauteur des versions affichées (16 383 px au plus, limite de WebP : panoramas verticaux) et du format réel, par un décodage à petite taille (un fichier tronqué ou un HEIC d'iPhone, que le serveur ne sait pas décoder, est refusé tout de suite) ;
   - lecture de l'EXIF (date, heure, GPS) une seule fois, après un parcours borné du bloc : un EXIF trop coûteux à lire est ignoré ;
   - empreinte SHA-256 de l'original, puis horodatage RFC 3161 en arrière-plan (voir [Preuves d'antériorité et droits](Preuves-et-droits)) ;
   - l'original est rangé sous un nom aléatoire ;
   - la photo est créée en brouillon.
2. **Rendu des variantes :**
   - l'original n'est décodé **qu'une fois** : orientation EXIF appliquée, réduction à la plus grande largeur servie (2000 px au plus), base gardée en mémoire ;
   - chaque taille en dérive : redimensionnement, filigrane éventuel, métadonnées selon le réglage (aucune par défaut ; mentions IPTC en XMP dans les modes signés), encodage AVIF (qualité 55) ou WebP (qualité 78) ;
   - les dix fichiers s'encodent en parallèle ; exception : le mode « tout l'EXIF de l'original » relit l'original pour chaque fichier (l'EXIF n'est pas dans la base en mémoire), deux fichiers à la fois.
   - **Concurrence :** `IMPORT_CONCURRENCY` photos à la fois (2), quelle que soit la page d'import, `IMAGE_THREADS` threads de libvips (4) ; voir [Configuration](Configuration). Mesure sur une photo de 24 Mpx (16 cœurs) : 6,5 s avant, 1,5 s après ; 4 photos : ~26 s avant, 3,7 s après.
3. **Publication :** les variantes deviennent accessibles sous `/media/`.

## Noms et cache

```
<uuid>-<largeur>.<format>               sans filigrane ni métadonnée
<uuid>-<empreinte>-<largeur>.<format>   avec filigrane et/ou métadonnées
```

- Les variantes sont servies avec `Cache-Control: max-age=31536000, immutable` (navigateur) et `CDN-Cache-Control: max-age=86400` : un cache partagé comme Cloudflare ne les garde qu'un jour, pour qu'une photo dépubliée ou effacée n'y reste pas servie un an.
- L'**empreinte** (8 caractères) résume les réglages appliqués. Quand ils changent, le nom change : le navigateur ne peut pas garder une version périmée.
- Seule la variante qui porte l'empreinte **courante** de la photo est servie ; les autres répondent 404, puis sont supprimées.
- Les brouillons restent visibles dans l'admin, via `/admin/media/` (session admin, `Cache-Control: no-store`).
- **Taille pas encore créée** (une photo d'avant l'ajout de 160 et 480 px, pendant son rattrapage) : `/media/`, `/admin/media/` et les images des galeries privées servent à sa place la plus petite variante plus grande de la même photo, de la même empreinte et du même format, en cache court (`Cache-Control` et `CDN-Cache-Control : public, max-age=300` sous `/media/`). La page ne casse jamais ; le vrai fichier prend la relève au plus tard cinq minutes après sa création. Une largeur que la photo n'a pas (`-999.webp`), une autre empreinte ou une photo non publiée répondent toujours 404 (`server/repli-variantes.js`).

## Recalcul

Le recalcul se déclenche :

- après une modification dans l'admin (réglages du filigrane ou des métadonnées, logo, dessins de la marque utilisés en filigrane, nom du site, auteur, photo) ;
- au démarrage du serveur ;
- avec `npm run variants`.

Un seul recalcul complet tourne à la fois, et seules les photos dont l'empreinte a changé, ou dont un fichier manque, sont recalculées. Les rendus d'import passent hors de cette file, `IMPORT_CONCURRENCY` à la fois. Les photos publiées passent les premières, et une pause de 50 ms sépare deux photos rendues.

- **Une taille ajoutée** (160 et 480 px, version 1.181) ne change pas l'empreinte : les fichiers existants restent valides et ne sont pas réécrits. Le passage du démarrage voit les fichiers qui manquent et ne rend **que ceux-là**, photo par photo, sans bloquer le site ; le journal le dit : `tailles manquantes créées (photos déjà rendues)`, avec leur nombre. Sur le serveur d'essai (16 cœurs, `IMAGE_THREADS=4`, AVIF effort 4), 36 photos de 2 400 à 4 000 px : 50 s, soit ~1,4 s par photo (l'original est décodé une fois) ; pages servies en 30 à 90 ms pendant ce temps. Pour 1 000 photos, compter une vingtaine de minutes. `npm run variants` fait la même chose (seulement les tailles manquantes) ; `-- --force` refait tout.

- **Import :** il n'attend pas la fin d'un recalcul en cours. Un verrou par photo empêche deux rendus simultanés de la même image.
- **Import photo par photo (page d'import) :** `POST /admin/photos/envoi` range l'original et crée le brouillon, puis répond aussitôt ; les variantes sont rendues **en arrière-plan**, `IMPORT_CONCURRENCY` photos à la fois. Le formulaire d'import **sans JavaScript** (`POST /admin/photos/import`, réponse HTML) fait de même pour tout le lot : cinquante rendus d'affilée dépasseraient les 100 s après lesquelles Cloudflare coupe la requête. Seul l'appel JSON de cette route attend encore le rendu de chaque photo. `GET /admin/photos/traitement?ids=…` donne l'état de chacune (`waiting`, `processing` avec `done / total`, `ready`, `error`) et le nombre de photos en cours (indicateur d'en-tête). Ce suivi est en mémoire : après un redémarrage, le passage de démarrage rend ce qui manque. Une photo dont le rendu échoue (incident passager : disque plein…) reste en brouillon, et le passage suivant recalcule ses images ; l'original, déjà validé par décodage, n'est jamais effacé. À l'appel JSON de `POST /admin/photos/import`, qui attend le rendu, une photo dont le rendu échoue est au contraire supprimée (ligne, original, variantes) et signalée refusée.
- **Écriture :** chaque variante est écrite sous un nom temporaire, puis renommée. Un arrêt brutal ne laisse jamais de fichier tronqué.
- **Ménage :** à chaque recalcul, les variantes sans photo et les fichiers temporaires de plus d'une heure sont effacés (un fichier plus récent peut être en cours d'écriture, y compris par `npm run variants` lancé serveur en marche) ; en fin de recalcul, les logos remplacés aussi.
- **Arrêt :** l'arrêt du serveur interrompt un recalcul entre deux photos ; les photos d'un import encore en attente ne sont pas rendues (celles en cours finissent), le passage de démarrage s'en charge : l'arrêt n'attend que les rendus en cours (`docker stop` tue le processus au bout de 10 s).

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
