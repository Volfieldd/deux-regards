# Étude : stories Instagram en musique (module de montage)

| | |
|---|---|
| Statut | Note de cadrage. Rien n'est développé. Décisions DS1 à DS7 **prises le 18 octobre 2026** (propositions retenues telles quelles, section 12). |
| Date | 18 octobre 2026. Toutes les sources ont été consultées ce jour-là. |
| Base lue | `main` à `e204683` (version 1.90.0). |
| Demande | « Réfléchir à un module de Nicephos qui permet de poster des stories Instagram avec de la musique (libre de droits, ou dans des conditions compatibles avec l'usage de musiques sous licence) : grosso modo un mini module de montage qui enchaîne les photos avec une transition et une petite musique de quelques secondes. » Contrainte ajoutée : **un module Docker dédié, en plus** du site. |
| Périmètre | Montage (photos, transitions, musique), conteneur de rendu, droits sur la musique, phonothèque, publication (téléchargement, partage du téléphone, API d'Instagram), sécurité et impact sur la Vigie, plan en phases, décisions. |
| Hors périmètre | Reels, publications vidéo du fil, montage libre (pistes multiples, textes animés, sous-titres), musique d'Instagram par l'API (elle n'existe pas, section 3). |
| Références | `fichier:ligne` depuis la racine du dépôt. Sources externes : `[n]`, liste en fin de document (numérotation propre à cette étude). |
| Avertissement | Ce n'est pas un conseil juridique. La section 6 dit ce que disent les textes et les licences ; les points « à confirmer » se valident avec un juriste ou auprès de la SACEM avant la première story en musique. |

**Niveaux des exigences** (mêmes sens que dans les autres études)

| Niveau | Sens |
|---|---|
| **O** | Obligatoire : imposé par un texte ou une licence cités. |
| **I** | Impératif : règle écrite du projet (`docs/wiki/Développer.md`) ou condition de sécurité. |
| **R** | Recommandé : bonne pratique, un écart reste possible en connaissant le prix. |
| **C** | Choix des auteurs. Une valeur par défaut est proposée. |

**Identifiants** : `CO` conteneur de montage, `RE` rendu, `MU` musique et phonothèque, `PU` publication, `AD` écrans de l'admin, `VG` sécurité et Vigie, `DS` décisions des auteurs.

---

## En bref

- **Faisable, et moyen plutôt que colossal.** La publication par l'API d'Instagram existe déjà (`server/instagram.js`) : jeton chiffré, file, créneaux, limites de Meta, adresse temporaire servie à Meta, respect des accords des personnes. Une story vidéo, c'est le même circuit avec `media_type=STORIES` et `video_url` [1], [2].
- **Le montage vit dans un conteneur à part** (`montage`), facultatif comme le traducteur : sans lui, le site ne change pas. Il ne voit **ni la base, ni les originaux, ni aucun secret, ni Internet** : le site lui envoie des images déjà préparées et un morceau, il rend un MP4. ffmpeg, qui lit des fichiers déposés, est enfermé là.
- **Essai mesuré le 18 octobre 2026** : image Alpine + Node + ffmpeg de **415 Mo** ; 6 photos, fondus de 0,7 s, 17,5 s de vidéo : **44 à 70 s de calcul sur 2 cœurs**, ~650 Mo de mémoire ; fichier conforme aux exigences de Meta pour une story (H.264 High, 1080 × 1920, 30 i/s, AAC 48 kHz, `moov` en tête).
- **La musique est la vraie difficulté, et elle est juridique.** Une story publiée par l'API ne prend aucun sticker, et l'API de musique de Meta ne sert qu'aux Reels [2], [3] : le son est dans le fichier, et ses droits sont les vôtres. Pas de « quelques secondes, c'est libre » : même un échantillon très bref est une reproduction partielle [7], [10]. Retenus : domaine public et CC0 (enregistrement compris), CC BY (crédit incrusté), Pixabay (pistes sans bouclier Content ID), Sound Collection de Meta (Instagram seulement) ; jamais NC, ND ni SA (section 6).
- **Phonothèque à fiche obligatoire** : un morceau n'entre qu'avec sa source, sa licence, la preuve (adresse et date) et, s'il le faut, le crédit, que le rendu incruste lui-même.
- **Trois sorties**, dans l'ordre de livraison : télécharger le MP4 ; le partager depuis le téléphone (Instagram ajoute alors sa propre musique si l'on veut) ; le publier par la file Instagram.
- **Coût : 0 €.** Du calcul sur l'Unraid, quelques Mo par morceau, des MP4 effacés après quelques jours.
- **Calendrier** : de nouvelles routes, un envoi de fichiers, un droit et une migration ; d'après la décision du 18 octobre 2026, le code attend la **fin de la phase D de la Vigie**. Cette note, elle, peut être arbitrée tout de suite.
- **Sept décisions, prises le 18 octobre 2026** (section 12) : télécharger d'abord puis la file Instagram ; sources de musique limitées à la liste de DS2 ; phonothèque gérée par l'administrateur ; circuit des posts ; 3,5 s par photo et fondu de 0,7 s ; MP4 gardés 7 jours ; image du conteneur construite sur le serveur.

---

## 1. Ce qu'on veut

Un écran de l'admin où l'on choisit **3 à 10 photos publiées**, leur ordre, une **transition**, un **morceau** et son point de départ, et qui produit une **vidéo verticale de 5 à 30 secondes**, prête pour une story. Pas un logiciel de montage : peu de réglages, de bonnes valeurs par défaut, un aperçu fidèle (le MP4 lui-même).

| Id | Exigence | Niveau |
|---|---|---|
| RE1 | 3 à 10 photos **publiées** sur le site ; aucune photo bloquée pour Instagram par les accords des personnes (section 7.2). | I |
| RE2 | Durée totale entre 3 et 60 s (limites de Meta pour une story vidéo [2]) ; défaut proposé : 3,5 s par photo et fondu de 0,7 s, soit 17,5 s pour 6 photos. | O (bornes) · C (défauts) |
| RE3 | Cadre comme pour les posts : recadrage guidé par l'attention ou passe-partout ; filigrane au choix, « jamais sur cette photo » respecté (`server/instagram.js:317`). | I |
| RE4 | Transitions en nombre réduit : fondu enchaîné, fondu au noir, glissé ; léger zoom lent (« Ken Burns ») en option. | C |
| RE5 | Musique facultative ; morceau de la phonothèque seulement ; départ choisi dans le morceau ; fondu d'entrée court et fondu de sortie de 1,5 s. | I (phonothèque) · C (fondus) |
| RE6 | Crédit de la musique incrusté quand la licence l'exige (CC BY), sinon facultatif ; signature du photographe en option. | O (CC BY) · C |
| RE7 | L'aperçu est le fichier final : ce qu'on voit est ce qui part. | I |

## 2. Ce qui existe déjà

| Brique | Où | Réutilisation |
|---|---|---|
| Compte Instagram connecté, droits `instagram_business_basic,instagram_business_content_publish`, jeton chiffré et renouvelé | `server/instagram.js:34`, `:113`, `:233`, `:648` | telle quelle : ce sont les droits demandés pour publier une story [1] |
| File, créneaux horaires, budget d'appels et pause sur limite de Meta | `server/instagram.js:144`, `:713` ; `server/instagram-limits.js` | partagés entre posts et stories (une seule limite de 100 publications par 24 h chez Meta [1]) |
| Conteneur de Meta, vérification de son état, publication, lien | `server/instagram.js:550` à `:566` | même suite d'appels ; attente plus longue pour une vidéo (section 7.2) |
| Adresse temporaire impossible à deviner servie à Meta, `no-store`, `noindex`, `token_guess` émis pour la Vigie | `server/routes/public.js:130` à `:138` | même route, extension `.mp4` |
| Préparation de l'image (sharp, rotation, recadrage attentif, passe-partout, filigrane) | `server/instagram.js:317` | en 1080 × 1920 au lieu de 1080 × 1080 |
| Accords des personnes : blocage, confirmation, file vidée à chaque changement | `server/instagram.js:166`, `:359`, `:765` ; PLAN §30 | appliqués à **chaque** photo de la story |
| Circuit : le photographe propose, le modérateur valide | `server/permissions.js:35` à `:37` ; PLAN §33 | même circuit pour une story |
| Menu de partage du téléphone | `server/share.js` ; PLAN, « Partager » | partage d'un fichier vidéo (section 7.1) |
| Polices et rendu de texte en image (opentype.js) | `server/textile.js` | incrustation du crédit sans police dans le conteneur (section 5.3) |
| Service facultatif joint par une adresse (`TRANSLATE_URL`) | `server/config.js:92` à `:94`, `compose.yaml` (profil `traduction`) | même schéma : `MONTAGE_URL`, profil `montage` |
| Image à part dans le même dépôt | `Dockerfile.vigie` | même schéma : `Dockerfile.montage` |

Ce qui manque : le rendu vidéo, la phonothèque, une table des stories (`instagram_posts.photo_id` ne porte qu'une photo, `server/db/migrations/007_instagram.sql:13`), l'écran de montage.

## 3. Ce que permet l'API d'Instagram pour une story

| Point | Ce que dit Meta | Source |
|---|---|---|
| Publication | conteneur créé avec `media_type=STORIES`, image ou vidéo ; `video_url` pour une vidéo | [1], [2] |
| Droits | `instagram_business_basic` et `instagram_business_content_publish` avec « Instagram API with Instagram Login » : ceux que le site a déjà | [1] |
| Fichier | MOV ou MP4, sans liste d'édition, atome `moov` en tête | [2] |
| Vidéo | H.264 ou HEVC, balayage progressif, GOP fermé, 4:2:0 ; 23 à 60 i/s ; 1 920 px au plus en largeur ; 9:16 recommandé | [2] |
| Son | AAC, 48 kHz au plus, mono ou stéréo | [2] |
| Durée, poids | 3 à 60 s ; 100 Mo au plus | [2] |
| État du conteneur | `IN_PROGRESS`, `FINISHED`, `ERROR`, `EXPIRED` (non publié sous 24 h), `PUBLISHED` ; vérifier une fois par minute, 5 minutes au plus | [1] |
| Limite | 100 publications par l'API sur 24 h glissantes, comptées sur `media_publish` (par où passe aussi une story) ; la référence de `content_publishing_limit` dit encore « currently 50 » : la file lit déjà le quota réel | [1], [5] |
| Stickers | non pris en charge (« link, poll, location » cités) ; aucun paramètre de musique pour une story ; mentionner un compte reste possible | [2] |
| Musique de Meta par l'API | l'Audio API attache un son aux **Reels** seulement, et seulement avec Facebook Login, pas avec Instagram Login | [3] |
| Contrôle des droits avant publication | `copyright_check_status` sur un conteneur pas encore publié ; documenté pour Facebook Login, à confirmer avec Instagram Login | [4] |
| Comptes | comptes professionnels, « business and creator accounts » ; d'anciennes versions réservaient les stories aux comptes Entreprise | [6] |
| Reconnaître une story | `media_type` répond `IMAGE` ou `VIDEO` ; c'est `media_product_type` qui dit `STORY` | [1] |

Conséquence directe : **la musique doit être dans le fichier**, et ce n'est pas la bibliothèque d'Instagram, couverte par les accords de Meta avec les ayants droit, qui s'applique. Voir la section 6.

À confirmer par un essai sur le compte réel (section 10, phase S0) : la publication d'une story selon le type du compte (Entreprise ou Créateur) ; le décompte d'une story dans le quota (déduit, pas écrit [1]) ; la disponibilité de `copyright_check_status` avec Instagram Login [4].

## 4. Architecture : un conteneur de montage dédié

### 4.1 Pourquoi un conteneur à part

La contrainte est posée par les auteurs ; elle a aussi de bonnes raisons :

- **ffmpeg lit des fichiers déposés** (le morceau). C'est un gros lecteur de formats, avec un historique de failles ; l'enfermer dans un conteneur sans données ni secret ni réseau réduit ce qu'une faille permettrait.
- **L'image du site reste légère** et inchangée : ffmpeg ajoute de 180 à 650 Mo selon la façon de l'installer (section 4.4).
- **Le calcul est borné à part** : 2 cœurs et 1 Go, sans toucher à la mémoire du site (3 Go, `compose.yaml`) ni aux calculs de descriptions et de visages.
- **Facultatif** comme le traducteur (V10 pour la Vigie, même esprit) : sans `MONTAGE_URL`, l'entrée de menu n'existe pas.

### 4.2 Trois façons de brancher le conteneur

| Option | Principe | Pour | Contre | Verdict |
|---|---|---|---|---|
| **A. Service sans état, par HTTP** | le site prépare les images (sharp) et envoie images, morceau et réglages ; le conteneur répond le MP4 | aucun accès aux données ni à la base ; aucun secret ; réseau interne seulement ; facile à tester | ~5 à 20 Mo envoyés par rendu (sur le réseau Docker : négligeable) | **retenue** |
| B. Volume des données en lecture seule | le conteneur lit les originaux dans `/data` | moins de transfert | il voit **tous** les originaux et la base ; il refait le travail de sharp (rotation, cadre, filigrane) | écartée |
| C. File dans un dossier partagé | le site dépose une demande, le conteneur la prend | découplé | dossier partagé en écriture, états à tenir des deux côtés, nettoyage | écartée |

### 4.3 Contrat entre le site et le conteneur

| Id | Exigence | Niveau |
|---|---|---|
| CO1 | `POST /v1/rendu` : formulaire multipart avec un manifeste JSON (ordre, durées, transition, zoom, départ et fondus du son, débit visé), 3 à 10 JPEG en 1080 × 1920 préparés par le site, 0 ou 1 morceau **déjà normalisé**, 0 ou 1 PNG de crédit ; réponse : le MP4. | I |
| CO2 | `POST /v1/son` : reçoit un fichier déposé dans la phonothèque, le lit avec ffprobe, refuse au-delà des bornes (MU6), et renvoie sa durée et une version normalisée (AAC 48 kHz stéréo, sans métadonnées ni image de pochette). Le site ne garde et n'envoie ensuite **que** la version normalisée : seul ce conteneur lit un fichier venu de l'extérieur. | I |
| CO3 | `GET /healthz`. Rien d'autre : ni liste, ni stockage, ni historique. Fichiers de travail dans `/tmp` (tmpfs), effacés à la fin de chaque demande, réussie ou non. | I |
| CO4 | Demandes signées : en-tête HMAC-SHA256 sur la date, la méthode, le chemin et l'empreinte du corps, clé `MONTAGE_KEY` partagée, écart d'horloge de 5 minutes au plus. Le réseau est déjà fermé (CO7) ; la signature évite qu'un autre conteneur de la pile s'en serve. | R |
| CO5 | Un rendu à la fois ; une deuxième demande reçoit `429` avec `Retry-After`. Délai maximal de 180 s par rendu (ffmpeg tué au-delà). Corps de 60 Mo au plus. | I |
| CO6 | ffmpeg lancé sans shell (`execFile`, arguments en tableau), entrées nommées par le conteneur (jamais un nom venu de la demande), protocoles limités au fichier (`-protocol_whitelist file`), aucun filtre ni option fournis tels quels par la demande : le manifeste est validé et traduit en graphe de filtres par le conteneur. | I |
| CO7 | Réseau Docker `montage` **interne** (`internal: true`) partagé avec le site seulement : pas d'accès à Internet, pas de port publié. | I |
| CO8 | Durcissement de la pile : `read_only`, `tmpfs` `/tmp` borné (512 Mo), `cap_drop: [ALL]`, `no-new-privileges`, utilisateur non root, `mem_limit: 1g`, `cpus: 2`, `pids_limit: 64`, journaux bornés. | I |
| CO9 | ffmpeg borné en fils d'exécution (`-threads 2 -filter_threads 2 -filter_complex_threads 2`) : sans cela, sur une machine à 16 cœurs, il en ouvre trop et échoue sous `pids_limit: 64` (constaté pendant l'essai : « Resource temporarily unavailable »). | I |
| CO10 | Côté site, `MONTAGE_URL` absente : pas d'entrée de menu, routes en 404 ; conteneur injoignable : message clair, rien en file. | I |

### 4.4 Image : ce qui a été mesuré

Essai du 18 octobre 2026 sur l'hôte de test (images construites puis effacées, rien de publié) :

| Base | ffmpeg | Taille de l'image |
|---|---|---|
| `node:22-bookworm-slim` (celle du site) + `apt-get install --no-install-recommends ffmpeg` | 5.1.9 (Debian 12) | 973 Mo (+ ~650 Mo) |
| `node:22-alpine` + `apk add ffmpeg` | 8.1.2 | **415 Mo** (+ ~183 Mo) |
| `node:22-alpine` + binaires statiques (`mwader/static-ffmpeg:8.0`) | 8.0 | 621 Mo |

**Retenu : Alpine** (CO11, R). Le service n'a besoin que de Node (sans dépendance native) et de ffmpeg : pas de better-sqlite3, pas de sharp, donc pas d'étape de compilation. Image épinglée par empreinte, comme demandé pour les autres images (revue du 16 octobre 2026).

| Id | Exigence | Niveau |
|---|---|---|
| CO11 | `Dockerfile.montage` : `node:22-alpine` épinglée par empreinte, `apk add --no-cache ffmpeg`, code du service seul (`montage/`), utilisateur `node`, `HEALTHCHECK`. Aucune dépendance npm si possible (`node:http`, `node:child_process`). | R |
| CO12 | **Licence** : le ffmpeg d'Alpine est construit avec x264, sous GPL. Construire l'image sur le serveur ne pose pas de question ; **publier** l'image sur ghcr.io, comme celle du site, c'est distribuer des binaires GPL : il faut alors pouvoir fournir les sources correspondantes (celles d'Alpine pour la version épinglée). À trancher (DS7). | O (si publiée) |

### 4.5 Dans Compose

Profil `montage`, comme `traduction` ; même service dans `deploy/unraid/compose.yaml`, avec le réseau en plus.

```yaml
  # Montage des stories (profil « montage ») : rend des MP4 à partir d'images préparées par le site. Ne voit ni la base,
  # ni les originaux, ni aucun secret du site, ni Internet (réseau interne). MONTAGE_URL=http://montage:4200 dans le .env.
  montage:
    build: { context: ., dockerfile: Dockerfile.montage }
    image: site-photo-montage:latest
    profiles: [montage]
    restart: unless-stopped
    environment:
      MONTAGE_KEY: ${MONTAGE_KEY:?MONTAGE_KEY obligatoire pour le profil montage}
    networks: [montage]
    logging: *logging
    mem_limit: 1g
    cpus: 2
    pids_limit: 64
    read_only: true
    tmpfs:
      - /tmp:size=512m
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]

networks:
  montage:
    internal: true          # aucune sortie vers Internet
```

Le site rejoint le réseau `montage` en plus du sien. Le `.env` du site reçoit `MONTAGE_URL` et `MONTAGE_KEY` ; le conteneur ne reçoit **que** `MONTAGE_KEY`.

### 4.6 Rendu : mesures

Même conteneur durci que ci-dessus (`--network none`, `--read-only`, `--cpus 2`, `--memory 1g`, `--pids-limit 64`, `--cap-drop ALL`, utilisateur 1000), 6 images 1080 × 1920, 3,5 s chacune, fondus de 0,7 s, 17,5 s de vidéo, morceau MP3 coupé et fondu. Images d'essai générées (dégradés, puis images bruitées pour approcher le détail d'une vraie photo).

| Cas | Réglage x264 | Calcul | Fichier |
|---|---|---|---|
| dégradés, sans zoom | `medium`, CRF 20 | 57 s | 1,5 Mo |
| dégradés, zoom lent | `medium`, CRF 20 | 73 s | 2,2 Mo |
| images très détaillées (pire cas), sans zoom | `medium`, CRF 20 | 70 s | 16,8 Mo |
| images très détaillées, sans zoom | `veryfast`, CRF 20 | **44 s** | 13,8 Mo |

Mémoire au plus fort : ~650 Mo. Sortie vérifiée par ffprobe : H.264 High, 1080 × 1920, 30 i/s, AAC LC 48 kHz stéréo, 17,5 s ; `-movflags +faststart` place l'atome `moov` en tête, x264 produit des GOP fermés par défaut. Tous les cas restent loin des 100 Mo de Meta.

Ces temps viennent de l'hôte de test ; **à mesurer sur l'Unraid** (phase S1). Une minute d'attente est acceptable si l'écran le dit (barre d'avancement d'après la sortie `-progress` de ffmpeg).

## 5. Le rendu

### 5.1 Côté site

1. Contrôles : photos publiées, non bloquées (RE1), durée dans les bornes (RE2).
2. Pour chaque photo : JPEG 1080 × 1920 par sharp, avec la logique de `renderImage` (`server/instagram.js:317`) étendue au format vertical : recadrage guidé par l'attention, ou passe-partout (photo entière centrée sur fond blanc ou noir) ; filigrane selon la photo.
3. Crédit et signature : texte rendu en PNG transparent par le site (`server/textile.js`, polices du site) ; le conteneur n'a ni police ni `drawtext`.
4. Envoi au conteneur (CO1), réception du MP4, contrôle du résultat (taille, durée annoncée), enregistrement dans `/data/stories/` (section 7.3).

### 5.2 Côté conteneur (graphe essayé)

```
entrées :  -loop 1 -framerate 30 -t 3.5 -i p1.jpg  …  -i son.m4a  [-i credit.png]
image k :  scale=1080:1920, setsar=1, fps=30, format=yuv420p          (ou zoompan pour le zoom lent)
enchaîné : xfade=transition=fade:duration=0.7:offset=(k-1)×(3.5-0.7)   d'une image à la suivante
son :      atrim=start=<départ>:duration=<total>, afade=in:d=0.3, afade=out:st=<total-1.5>:d=1.5
sortie :   libx264 -preset veryfast -crf 20 -profile:v high -pix_fmt yuv420p -g 60 -r 30
           aac -b:a 160k -ar 48000 -ac 2 -movflags +faststart
```

Durée totale : `n × durée − (n − 1) × fondu`. `xfade` offre d'autres transitions (`fadeblack`, `slideleft`…) : RE4 n'en garde que trois.

### 5.3 Ce qu'on ne fait pas

Pas de texte animé, de sous-titres, de pistes multiples, ni de rendu dans le navigateur (WebCodecs) : la qualité et la durée de calcul varieraient d'un téléphone à l'autre, et le fichier devrait de toute façon remonter au site pour partir chez Meta.

## 6. La musique

### 6.1 Ce que dit le droit

- **Pas de « fair use ».** Les exceptions au droit d'auteur forment une liste fermée, dans la directive européenne [9] comme dans le Code de la propriété intellectuelle [8]. Toute reproduction, même partielle, faite sans autorisation est illicite [7].
- **« Quelques secondes, c'est libre » est faux.** La Cour de justice de l'UE juge que reprendre un échantillon sonore « même très bref » est une reproduction « en partie » [10]. Les plateformes disent la même chose en pratique [36].
- **La courte citation ne couvre pas un fond musical.** Elle suppose un but critique, polémique, pédagogique, scientifique ou d'information [8], et une interaction avec l'œuvre citée [10]. Une musique d'ambiance sous des photos ne commente pas le morceau (analyse, pas une source).
- **Un morceau porte deux couches de droits.** D'un côté, la composition (auteur, éditeur ; SACEM et SDRM pour la reproduction mécanique). De l'autre, l'enregistrement : le producteur [13] et les interprètes [12] doivent autoriser, pendant 70 ans pour une interprétation publiée sur phonogramme [11]. Une œuvre de Bach enregistrée en 2015 n'est donc **pas** libre [29].
- **Poser une musique sur des images (synchronisation)** demande l'accord de l'éditeur et du producteur, en plus de ce que gère la SACEM [14]. Le détail de la répartition entre la SACEM et les éditeurs reste à confirmer auprès de la SACEM (phase S0).
- **Les accords de Meta avec les maisons de disques ne couvrent pas notre fichier.** Ils couvrent la musique choisie dans l'appli. Cette bibliothèque est « intended for personal, non-commercial use », et certains comptes professionnels n'y ont pas accès [31]. Meta interdit l'usage commercial d'une musique sans licence et peut couper le son, bloquer ou retirer le contenu [32] ; plus il y a de morceaux enregistrés entiers, plus c'est probable [33].

### 6.2 Licences : ce qui passe et ce qui ne passe pas

| Licence | Pour une story promotionnelle | Pourquoi |
|---|---|---|
| **Domaine public, CC0** | **oui**, si l'**enregistrement** est libre lui aussi | CC0 renonce aux droits « to the greatest extent permitted by […] applicable law » [15] ; en France, le droit moral subsiste : nommer l'auteur reste de bon usage |
| **CC BY 4.0** | **oui**, avec un crédit | poser une musique sur une image est **toujours** une adaptation au sens des licences CC [16], [17] ; il faut donc créditer et signaler la modification (« coupé, fondu ») |
| CC BY-SA | **non** | une adaptation doit être partagée sous la même licence [19] ; la vidéo entière, photos comprises, devrait passer en BY-SA (déduction de [16] et [19]) |
| CC BY-NC (et NC-SA, NC-ND) | **non** | « not primarily intended for or directed towards commercial advantage » [20] ; une story qui fait connaître le site, et un jour sa boutique, s'en écarte ; la FAQ de CC exclut un remix commercial [17] |
| CC BY-ND | **non** | interdit de partager une adaptation [21], et un fond musical en est une [18] |
| Licence Pixabay | **oui**, sauf les pistes marquées d'un bouclier | usage commercial et modification permis, sans crédit ; vente du morceau seul interdite [22] ; les pistes au bouclier sont enregistrées dans Content ID, et Instagram et Facebook « may mute or block content » [23] |
| Sound Collection de Meta | **oui, sur les produits de Meta seulement** | licence gratuite, usage commercial permis, « on the Meta Company Products […] only » ; jamais à part de ces produits [30] |
| YouTube Audio Library | **non** | « intended solely for use by you in videos and other content that you create », monétisation sur YouTube ; rien sur Instagram, et YouTube ne se prononce pas hors de sa plateforme [27] |
| Abonnement (Epidemic Sound, Artlist) | oui, payant | un compte par plateforme dans l'offre d'entrée ; contenus publiés pendant l'abonnement couverts ensuite [34], [35] ; prix à confirmer |
| Autorisation écrite d'un musicien | oui | à condition qu'il détienne **tous** les droits (pas d'éditeur, pas de label, pas de SACEM sur ce titre, ou leur accord) |

### 6.3 Où trouver des morceaux sans payer

| Source | État au 18 octobre 2026 | À savoir |
|---|---|---|
| **Pixabay Music** | en ligne ; conditions du 18 novembre 2024 | écarter les pistes au bouclier ; garder la page de la piste et, s'il existe, le certificat de licence [22], [23] |
| **incompetech** (Kevin MacLeod) | en ligne ; CC BY 4.0 | crédit demandé : « Titre Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 », visible sans difficulté [26] |
| **Free Music Archive** | en ligne (Tribe of Noise) | filtres « Commercial Use » et « Use in a Remix or Video » ; FMA ne concède rien elle-même : vérifier la licence de chaque piste [24] |
| **ccMixter** | en ligne | filtre « free for commercial use » ; licences variables selon les pistes [28] |
| **Sound Collection de Meta** | conditions en vigueur ; téléchargement en 2026 à confirmer | réservée aux publications sur Instagram et Facebook (MU5) [30], [31] |
| Musopen | en ligne | domaine public pour les compositions, pas garanti pour les enregistrements : « cannot guarantee » [29] |
| FreePD | **fermé** (2008-2025) [25] | — |
| Uppbeat | à confirmer (site inaccessible pendant la recherche) | offre gratuite avec crédit, d'après des sources secondaires |

### 6.4 Le crédit (CC BY)

Une story n'a pas de légende. Le crédit va donc **dans l'image** (RE6) : titre, auteur, licence, puis une adresse courte vers une page qui donne tout le détail [18]. CC admet ce renvoi : « it may be reasonable to satisfy the conditions by providing a URI or hyperlink » [16].

| Id | Exigence | Niveau |
|---|---|---|
| MU1 | Crédit incrusté sur les 3 dernières secondes, lisible (corps et contraste vérifiés), hors des zones masquées par l'interface d'Instagram (haut et bas de l'écran) : « ♪ Titre — Auteur — CC BY 4.0 — nicephos.art/droits ». | O |
| MU2 | Une section « Musiques des stories » sur la page **Droits** existante, plutôt qu'une nouvelle route publique. Elle donne pour chaque morceau utilisé : titre, auteur, source, licence avec son lien, et modifications (« extrait coupé, fondu »). Elle reste en ligne tant que l'on garde la trace des stories. | O |

### 6.5 La phonothèque

| Id | Exigence | Niveau |
|---|---|---|
| MU3 | Fiche obligatoire, sans quoi le morceau n'est pas enregistré : titre ; auteur ; interprète s'il est différent ; adresse de la page du morceau ; licence (liste fermée : domaine public ou CC0, CC BY 4.0, Pixabay, Sound Collection de Meta, autorisation écrite, abonnement) ; adresse de la licence ; date de téléchargement ; preuve jointe (page enregistrée en PDF, certificat de Pixabay ou autorisation signée) ; crédit à afficher. | I |
| MU4 | NC, ND, SA, YouTube Audio Library et « licence inconnue » absents de la liste : on ne peut pas les enregistrer. Domaine public : case obligatoire « l'enregistrement est libre lui aussi (interprète et producteur) ». Pixabay : case obligatoire « pas de bouclier Content ID sur la page de la piste ». | I |
| MU5 | Portée par morceau. Un morceau de la Sound Collection est marqué « Instagram et Facebook seulement » : il n'entre que dans une story publiée par la file ou partagée vers Instagram, avec un avertissement sur « Télécharger ». | I |
| MU6 | Fichier : MP3, AAC/M4A, WAV, FLAC ou OGG ; 20 Mo et 10 minutes au plus ; lu et normalisé par le conteneur (CO2) ; refus émis en `upload_rejected`. | I |
| MU7 | Chaque story garde l'identifiant du morceau et une **copie de la fiche** au moment du rendu. Un morceau retiré n'est plus proposé, mais reste conservé avec sa preuve. | I |
| MU8 | Si Meta coupe le son ou bloque une story, la fiche et sa preuve servent à contester par la notification reçue [32] ; le morceau est suspendu en attendant. | R |
| MU9 | Si `copyright_check_status` est disponible avec Instagram Login [4], la file le lit avant `media_publish` et retient la story en cas d'alerte. Sinon, pas de contrôle préalable. | R |
| MU10 | Gestion réservée à l'administrateur (`musique.gerer`, DS3) : c'est lui qui engage les droits. | C |

### 6.6 À confirmer avant la première story en musique

1. Auprès de la SACEM : ce qu'il faut pour un titre de son répertoire synchronisé dans une story. Ce cas reste exclu tant que ce n'est pas clair (DS2).
2. Pixabay : un filtre pour exclure les pistes enregistrées dans Content ID.
3. Sound Collection de Meta : le téléchargement est-il encore possible en 2026, et depuis quel outil ?
4. Uppbeat : les conditions de l'offre gratuite pour Instagram et pour un usage commercial.

## 7. Publication

### 7.1 Télécharger, partager depuis le téléphone

| Id | Exigence | Niveau |
|---|---|---|
| PU1 | Bouton « Télécharger la vidéo » (MP4) : première sortie livrée, sans dépendre de l'API. | I |
| PU2 | Sur téléphone, « Partager » ouvre le menu du téléphone avec le fichier (`navigator.share({ files })`, quand `navigator.canShare` l'accepte) ; Instagram y figure s'il est installé. Comportement d'Instagram (story directe ou choix) **à vérifier** sur iPhone et Android. | R |
| PU3 | Option « **sans musique** » : la vidéo part muette et l'on ajoute la musique dans l'appli Instagram. Aucun risque de droits côté site ; côté Instagram, la bibliothèque générale est « intended for personal, non-commercial use » et certains comptes professionnels n'y ont pas accès : choisir dans la **Sound Collection**, utilisable à des fins commerciales [31]. | C |

### 7.2 Par la file Instagram

| Id | Exigence | Niveau |
|---|---|---|
| PU4 | Tables `stories` (état, réglages, morceau, fichier, jeton d'envoi, identifiant Meta, erreurs, essais, dates) et `story_photos` (story, photo, position) ; migration à part. `instagram_posts` n'est pas détournée (une photo par post). | I |
| PU5 | File, créneaux et budget **communs** aux posts et aux stories (`server/instagram-limits.js`), puisque la limite de Meta est commune ; une story compte pour une publication tant que Meta ne dit pas le contraire. | I |
| PU6 | Accords : chaque photo de la story passe le contrôle de `readinessOf` à l'entrée en file, à chaque changement d'accord et juste avant l'envoi ; une seule photo bloquée retire la story de la file avec la raison (comme PLAN §30). | I |
| PU7 | Adresse temporaire : `GET /partage/instagram/<jeton>.mp4`, même règles que l'image (`server/routes/public.js:132`) : jeton de 24 octets, valable 15 minutes et seulement pendant l'envoi, `no-store`, `noindex`, `token_guess` sur jeton inconnu ; le fichier est servi depuis `/data/stories/`, jamais recalculé à la demande. Vérifier que la bordure (Worker) et Cloudflare laissent passer une vidéo de plusieurs Mo sans la mettre en cache. | I |
| PU8 | Attente du traitement : une vérification par minute, 5 minutes au plus [1] (l'image attend aujourd'hui ~1 min 30, `server/instagram.js:552`). | O |
| PU9 | Pas de relevé de likes pour les stories (`syncEngagement` lit le fil) ; lien vers la story gardé 24 h. | C |
| PU10 | Circuit : le photographe propose, le modérateur valide, comme pour les posts ; « publier seul » réglable de la même façon. | I |

### 7.3 Conservation

| Id | Exigence | Niveau |
|---|---|---|
| PU11 | MP4 dans `/data/stories/`, effacé **7 jours** après publication ou abandon (défaut, DS6) : ce sont des photos de personnes, recalculables. Pas dans les sauvegardes. | R |
| PU12 | Une photo dépubliée, effacée ou refusée par une personne : les stories qui la contiennent sont retirées de la file et leur MP4 effacé. Une story déjà publiée disparaît d'Instagram en 24 h ; l'effacer plus tôt passe par l'appli (l'API ne supprime pas). | I |

## 8. Écrans de l'admin

| Id | Écran | Contenu |
|---|---|---|
| AD1 | Instagram › **Stories** | liste (brouillons, en file, publiées 24 h), bouton « Nouvelle story » |
| AD2 | Montage | photos choisies dans la photothèque (publiées seulement, bloquées grisées avec la raison), ordre par glisser ou flèches, durée, transition, zoom, morceau et départ (forme d'onde simple), crédit, « Rendre » puis lecteur vidéo, « Télécharger », « Partager », « Proposer » ou « Mettre en file » |
| AD3 | Instagram › **Phonothèque** | morceaux, écoute, fiche licence, morceaux retirés (gardés comme preuve d'une story passée, non choisissables) |

À passer en maquettes (bureau et téléphone) et devant le jury avant le code, comme le reste de l'admin v2 ; l'écran de montage doit être utilisable au téléphone.

## 9. Sécurité et impact sur la Vigie

### 9.1 Ce qui change

| Surface | Nouveau | Mesure |
|---|---|---|
| Conteneur `montage` | lecteur de formats exposé à des fichiers déposés | CO2 à CO9 : sans données, secret ni Internet, borné |
| Envoi de fichiers audio | nouvelle saisie (phonothèque) | droit dédié, taille et durée bornées, type vérifié par ffprobe dans le conteneur, `upload_rejected` émis |
| Routes de l'admin | montage, rendu, phonothèque, file des stories | droits ci-dessous, CSRF et contrôles existants, `authz_fail` |
| Route publique | `/partage/instagram/<jeton>.mp4` | PU7 ; chemin déjà interdit aux robots (`/partage/`) |
| Droits | `stories.monter` (portée « les miennes »), `musique.gerer` (administrateur seul : c'est lui qui engage les droits) ; publier : droits Instagram existants | DS3 |
| Migration | `stories`, `story_photos`, `musiques` | numéro suivant (053 à ce jour) |
| Sauvegarde | morceaux et fiches de licence irremplaçables | ajouter `musique` à `FILE_DIRS` (`server/db/backup.js:27`) ; MP4 exclus |

### 9.2 Menaces

| Id | Menace | Réponse |
|---|---|---|
| VG1 | Fichier audio piégé (faille de ffmpeg) | lu seulement dans le conteneur (CO2), qui ne peut rien atteindre (CO7, CO8) ; le site ne garde que la version normalisée ; mises à jour d'Alpine suivies comme les autres images |
| VG2 | Épuisement du serveur par des rendus en boucle | un rendu à la fois (CO5), délai maximal, limite par compte (10 rendus par heure), bornes de durée et de nombre de photos |
| VG3 | Injection d'options ou de filtres ffmpeg | CO6 : graphe construit par le conteneur depuis un manifeste validé (valeurs numériques bornées, transitions dans une liste fermée) |
| VG4 | Récupération de fichiers ou de requêtes ailleurs (SSRF) | aucun téléchargement par adresse : la phonothèque reçoit des fichiers, jamais un lien ; protocoles limités au fichier ; réseau interne |
| VG5 | Autre conteneur de la pile qui se sert du service | réseau `montage` limité au site, demandes signées (CO4) |
| VG6 | Vidéo d'une personne qui a refusé | PU6, PU12 |
| VG7 | Devinette du jeton de la vidéo | jeton de 192 bits, 15 minutes, `token_guess` déjà relevé par la Vigie |
| VG8 | Musique sans droit publiée | fiche de licence obligatoire (MU3), licences NC, ND et SA refusées (MU4), morceau retiré non choisissable (MU7) |

### 9.3 Vigie

| Id | Exigence | Niveau |
|---|---|---|
| VG9 | Événements existants réutilisés : `upload_rejected` (morceau refusé), `token_guess` (jeton `.mp4`), `authz_fail`, `sys_error` (conteneur injoignable, rendu en échec ou hors délai) ; pas de nouveau type sans passer par `server/securite/vocabulaire.js` et la Vigie. | I |
| VG10 | Proposé : un détecteur « rendus en rafale » (VG2) et une règle sur des `upload_rejected` répétés depuis l'admin. À valider avec la phase C2 (règles Sigma). | R |
| VG11 | Calendrier : nouvelles routes, saisie, droits et migration : **après la fin de la phase D**, chaque PR avec sa section « Impact sur la Vigie » (décision du 18 octobre 2026). | I |

## 10. Plan en phases

| Phase | Contenu | Livrable | Dépend de |
|---|---|---|---|
| **S0** (hors code) | Décisions DS1 à DS7 (prises le 18 octobre 2026) ; choix des 5 à 10 premiers morceaux avec leur fiche ; essai manuel d'une story par l'API sur le compte réel (type de compte, compte dans la limite) ; question à la SACEM si un doute reste (section 6) | décisions notées dans le PLAN | — |
| **S1** | Conteneur `montage` (`montage/`, `Dockerfile.montage`, profils Compose, réseau interne), `MONTAGE_URL` et `MONTAGE_KEY`, client signé côté site, rendu sans musique, écran de montage minimal, **Télécharger** ; mesures sur l'Unraid ; tests du contrat (bornes, signature, délai, injection) | une PR | fin de la phase D de la Vigie ; maquettes AD2 |
| **S2** | Phonothèque : envoi, normalisation par le conteneur, fiche licence, crédit incrusté, musique dans le rendu ; sauvegarde des morceaux | une PR | S1 |
| **S3** | Stories dans la file Instagram : tables, accords, circuit, adresse `.mp4`, attente de 5 minutes, conservation ; **Partager** depuis le téléphone | une PR | S2 ; essai S0 concluant |
| S4 (plus tard) | Modèles de story (réglages enregistrés), zoom lent, mentions de comptes | à voir | usage réel |

Chaque phase : revue de code et de sécurité avant la suivante ; tests e2e de l'écran de montage dans un vrai navigateur ; aide (`docs/aide/14-instagram.md`) et wiki (`docs/wiki/Instagram.md`, `Déploiement.md`) mis à jour.

## 11. Coûts

| Poste | Coût |
|---|---|
| Logiciels | 0 € (ffmpeg, Alpine, Node) |
| Musique | 0 € avec les sources de la section 6 ; abonnement payant en option (DS2) |
| API d'Instagram | 0 € (pas d'offre payante, `server/instagram-limits.js:2`) |
| Machine | ~1 min de 2 cœurs par rendu ; ~415 Mo d'image ; quelques Mo par morceau ; MP4 de 2 à 20 Mo gardés 7 jours |

## 12. Décisions

Toutes **prises le 18 octobre 2026** par les auteurs : chaque proposition est retenue telle quelle.

| Id | Question | Décision |
|---|---|---|
| DS1 | Sortie livrée en premier | Télécharger (S1), puis la file Instagram (S3) ; « sans musique » toujours proposé |
| DS2 | Sources de musique admises | domaine public et CC0 (enregistrement compris), CC BY 4.0, Pixabay sans bouclier Content ID, Sound Collection de Meta (Instagram seulement), autorisation écrite d'un musicien ; jamais NC, ND, SA, YouTube Audio Library ni musique du commerce ; abonnement payant : non pour l'instant (coût nul) |
| DS3 | Qui gère la phonothèque | l'administrateur seul (`musique.gerer`) ; les photographes choisissent dans la phonothèque |
| DS4 | Circuit des stories | le même que les posts : le photographe propose, le modérateur valide |
| DS5 | Durées par défaut | 3,5 s par photo, fondu de 0,7 s, 6 photos (17,5 s) ; bornes 3 à 60 s |
| DS6 | Conservation des MP4 | 7 jours après publication ou abandon, hors sauvegardes |
| DS7 | Image du conteneur | construite sur le serveur (`build:`) au début ; publiée sur ghcr.io seulement avec l'offre de sources GPL réglée (CO12) |

## 13. Risques

| Risque | Effet | Parade |
|---|---|---|
| Réclamation sur une musique pourtant libre (morceau réenregistré auprès d'un système de reconnaissance) | son coupé ou story retirée | fiche et preuve de licence gardées ; morceau retiré de la phonothèque ; option sans musique |
| Meta change ses exigences vidéo ou ses limites | envois refusés | erreur de Meta affichée telle quelle, réglages d'encodage à un seul endroit |
| Rendu trop lent sur l'Unraid | attente longue | `veryfast`, pas de zoom par défaut, rendu en tâche de fond avec avancement |
| Quota de Meta à 50 ou 100, stories comptées ou non | budget faux | la file lit `content_publishing_limit` avant chaque envoi, comme aujourd'hui |
| Faille de ffmpeg | conteneur compromis | il ne contient rien d'utile et ne joint que le site, qui vérifie la signature et le fichier rendu |

## 14. Sources

Consultées le 18 octobre 2026. Quelques citations de Pixabay et de Meta ont été lues à travers un outil qui reformule en partie : elles sont à relire sur la page avant de s'en servir comme preuve.

**Meta, Instagram**

1. Meta, *Instagram Platform — Content Publishing* (mis à jour le 30/06/2026) : https://developers.facebook.com/docs/instagram-platform/content-publishing/
2. Meta, *IG User Media* (référence, 28/09/2026) : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
3. Meta, *Audio API* (16/06/2026) : https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api
4. Meta, *Copyright detection* (12/08/2026) : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/copyright-detection
5. Meta, *IG User Content Publishing Limit* (23/07/2024) : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit/
6. Meta, *Instagram Platform — Overview* (28/09/2026) : https://developers.facebook.com/docs/instagram-platform/overview

**Droit**

7. Code de la propriété intellectuelle, art. L122-4 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278911
8. Code de la propriété intellectuelle, art. L122-5 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278917
9. Directive 2001/29/CE, considérant 32 : https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:32001L0029
10. CJUE, 29 juillet 2019, *Pelham*, C-476/17, points 29 et 71 : https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:62017CJ0476
11. Code de la propriété intellectuelle, art. L211-4 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006279029
12. Code de la propriété intellectuelle, art. L212-3 (version lue : 1992-2016, version en vigueur à confirmer) : https://www.legifrance.gouv.fr/codes/id/LEGIARTI000006279045/2006-08-03
13. Code de la propriété intellectuelle, art. L213-1 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006279050
14. Village de la Justice, *La synchronisation, un droit en devenir ?* : https://www.village-justice.com/articles/synchronisation-droit-devenir,54400.html

**Creative Commons**

15. CC0 1.0, texte juridique : https://creativecommons.org/publicdomain/zero/1.0/legalcode.en
16. CC BY 4.0, texte juridique (définition d'« Adapted Material », section 3(a)) : https://creativecommons.org/licenses/by/4.0/legalcode.en
17. Creative Commons, FAQ : https://creativecommons.org/faq/
18. Creative Commons, *Recommended practices for attribution* : https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution
19. CC BY-SA 4.0, texte juridique : https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
20. CC BY-NC 4.0, texte juridique : https://creativecommons.org/licenses/by-nc/4.0/legalcode.en
21. CC BY-ND 4.0, texte juridique : https://creativecommons.org/licenses/by-nd/4.0/legalcode.en

**Sources de musique**

22. Pixabay, *Terms of Service* (18/11/2024) : https://pixabay.com/service/terms/ — résumé : https://pixabay.com/service/license-summary/
23. Pixabay, *FAQ* (musique et Content ID) : https://pixabay.com/service/faq/
24. Free Music Archive, recherche avancée et *License Guide* : https://freemusicarchive.org/search?adv=1 · https://freemusicarchive.org/License_Guide
25. FreePD, avis de fermeture : https://freepd.com/
26. incompetech, FAQ : https://incompetech.com/music/royalty-free/faq.html
27. YouTube Audio Library (chaîne officielle, « À propos ») : https://www.youtube.com/@AudioLibraryEN/about
28. ccMixter : https://ccmixter.org/ · http://dig.ccmixter.org/
29. Musopen, FAQ (archive du 07/10/2026, le site renvoyait une erreur 403) : https://web.archive.org/web/20261007123445/https://musopen.org/faq/
30. Meta, *Sound Collection Terms* (16/03/2022) : https://www.facebook.com/sound/collection/terms
31. Instagram, aide, musique et comptes professionnels : https://help.instagram.com/402084904469945
32. Meta, *Music Guidelines* (26/03/2024) : https://www.facebook.com/legal/music_guidelines
33. Instagram, aide, musique dans les vidéos : https://help.instagram.com/629037417957828
34. Epidemic Sound, *Which plan is right for you* · *License music legally* : https://www.epidemicsound.com/how-it-works/which-plan-is-right-for-you/ · https://www.epidemicsound.com/how-it-works/license-music-legally/
35. Artlist, *Artlist License* : https://help-center.artlist.io/privacy-terms/artlist-license
36. YouTube, aide, « quelques secondes » : https://support.google.com/youtube/answer/2797449?hl=fr
