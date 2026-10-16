# Titres, descriptions et H1 proposés

Complément de l’audit SEO du 16 octobre 2026 (constats SEO-02, SEO-04 et SEO-06).

## Règles

- **`<title>`** : de 30 à 60 caractères. Le sujet d’abord, puis « · Nicephos ». La marque est retirée quand le tout dépasserait 60 caractères (`titled()`, SEO-02). Seul l’accueil commence par la marque.
- **Meta description** : de 110 à 155 caractères, une ou deux phrases, différente pour chaque adresse. Elle contient le lieu et l’auteur. Elle est coupée en fin de phrase ou au mot (`clip()`), jamais au milieu d’un mot.
- **H1** : le sujet de la page, un seul par page.
- **Langues** : chaque texte anglais ou allemand est une proposition à faire **relire par un locuteur natif** avant publication. Une version non relue n’est pas annoncée en hreflang (SEO-06).
- **Noms** : ce sont les prénoms actuels. Si les auteurs choisissent une identité complète (SEO-03), il faut la reprendre partout.
- **Contenu** : les sous-titres et les descriptions des séries décrivent les photos actuellement publiées (lieux relevés sur la carte de production). Ils sont **à valider par les auteurs**. Le nombre de caractères est indiqué entre parenthèses.
- **Où les saisir** :
  - accueil : réglage « Titre et description pour les moteurs » (Site public), à créer ;
  - séries : nouveaux champs « Sous-titre » et « Introduction » (migration 040). La description de la page reprend la première phrase de l’introduction, ou le texte ci-dessous s’il est saisi tel quel ;
  - photographes : biographie (`authors.bio`, `bio_en`, `bio_de`) ;
  - pages fixes : `UI[lang].seo` dans `server/i18n.js`.

---

## Accueil (`/`, `/en/`, `/de/`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Nicephos — photographies de Sébastien et Julien (47) | Deux regards, une galerie : les photos de Sébastien et Julien, de la Côte d’Émeraude à Paris, de l’Anjou à la Bavière et à la Californie. (137) |
| en | Nicephos — photography by Sébastien and Julien (46) | Two photographers, one gallery: Brittany’s Emerald Coast, Paris, the Loire Valley, Bavaria and California. Sea, night, street and nature photography. (149) |
| de | Nicephos – Fotografie von Sébastien und Julien (46) | Zwei Fotografen, eine Galerie: Smaragdküste der Bretagne, Paris, Anjou, Tegernsee und Kalifornien. Meer, Nacht, Stadt und Natur. (128) |

**H1**, un seul, qui peut être visuellement masqué : le texte du `<title>`. Les titres des diapositives deviennent des H2.

---

## Photographes (`/auteur/julien`, `/auteur/seb`)

| Page | Langue | `<title>` | Description |
|---|---|---|---|
| Julien | fr | Julien, photographe — mer, ville et Californie · Nicephos (57) | Les photos de Julien : la Côte d’Émeraude à marée haute, Paris, la Bavière et la Californie (San Francisco, séquoias, Lassen). (126) |
| Julien | en | Julien, photographer — sea, city and California · Nicephos (58) | Julien’s photographs: Brittany’s Emerald Coast at high tide, Paris, Bavaria and California (San Francisco, redwoods, Lassen). (125) |
| Julien | de | Julien, Fotograf – Meer, Stadt und Kalifornien · Nicephos (57) | Julien fotografiert die Smaragdküste bei Flut, Paris, Bayern und Kalifornien (San Francisco, Mammutbäume, Lassen). (114) |
| Sébastien | fr | Sébastien, photographe — nuit, macro et mécaniques (50, sans la marque) | Les photos de Sébastien : nuits angevines, macro au jardin, voitures de collection et scènes de ville, d’Angers à l’île de Ré. (126) |
| Sébastien | en | Sébastien, photographer — night, macro and cars · Nicephos (58) | Sébastien’s photographs: night scenes in Angers, garden macro, classic cars and city life, from Angers to the Île de Ré. (120) |
| Sébastien | de | Sébastien, Fotograf – Nacht, Makro und Oldtimer · Nicephos (58) | Sébastiens Fotos: Nachtszenen in Angers, Makro im Garten, Oldtimer und Stadtleben, von Angers bis zur Île de Ré. (112) |

**H1** : « Julien, photographe » ; « Julien, photographer » ; « Julien, Fotograf ». Même modèle pour Sébastien.

Une fois les biographies écrites (120 à 250 mots), la description reprend leur première phrase, à condition qu’elle cite des lieux ou des sujets.

---

## Séries (`/serie/<adresse>`)

Le titre suit le gabarit « {nom} — {sous-titre} · Nicephos ». Le H1 est le nom de la série. Le sous-titre s’affiche sous le H1, avec une majuscule initiale (CSS `::first-letter`).

Sur les noms, voir SEO-06 :
- « Pas la mer à boire » devient « Plain Sailing » et « Meer geht immer », à la place des calques actuels ;
- « Belles mécaniques » devient « Fine Machines » et « Edle Karossen » ;
- « Nocturne » est gardé dans les trois langues ;
- « Photosynthese » s’écrit « Photosynthèse » en français.

### Pas la mer à boire (`/serie/bord-de-mer`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Pas la mer à boire — la mer à Saint-Malo · Nicephos (51) | La Côte d’Émeraude vue par Julien : le Sillon de Saint-Malo à marée haute, la pointe du Nick à Saint-Lunaire face à Cézembre. Poses longues, octobre 2026. (154) |
| en | Plain Sailing — the sea at Saint-Malo · Nicephos (48) | Brittany’s Emerald Coast by Julien: the Sillon at Saint-Malo at high tide, Pointe du Nick facing Cézembre island. Long exposures, October 2026. (143) |
| de | Meer geht immer – das Meer bei Saint-Malo · Nicephos (52) | Die Smaragdküste der Bretagne: der Sillon von Saint-Malo bei Flut, die Pointe du Nick mit Blick auf Cézembre. Langzeitbelichtungen, Oktober 2026. (145) |

### Super Urbain (`/serie/urbain`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Super Urbain — Paris, San Francisco et la rue · Nicephos (56) | Photographie urbaine : le Marais et la fontaine Stravinsky à Paris, le canal Saint-Martin, la skyline de San Francisco. 12 photos de Sébastien et Julien. (153) |
| en | Super Urban — Paris, San Francisco, street life · Nicephos (58) | Street and city photography: the Marais and the Stravinsky Fountain in Paris, Canal Saint-Martin, the San Francisco skyline. By Sébastien and Julien. (149) |
| de | Super Urban – Paris, San Francisco und Straße · Nicephos (56) | Stadtfotografie: das Marais und der Strawinsky-Brunnen in Paris, der Canal Saint-Martin, die Skyline von San Francisco. Von Sébastien und Julien. (145) |

« Vue sur l’île de Cézembre » (Dinard) serait mieux dans « Pas la mer à boire ».

### Nocturne (`/serie/nuit`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Nocturne — photographies de nuit · Nicephos (43) | Photographies de nuit à Angers, sur l’île de Ré et dans l’Hérault : lumières, foules et lune. Cinq photos de Sébastien et Julien. (129) |
| en | Nocturne — night photography · Nicephos (39) | Night photography in Angers, on the Île de Ré and in the south of France: lights, crowds and the moon. Five photos by Sébastien and Julien. (139) |
| de | Nocturne – Nachtfotografie · Nicephos (37) | Nachtfotografie in Angers, auf der Île de Ré und in Südfrankreich: Lichter, Menschen und der Mond. Fünf Fotos von Sébastien und Julien. (135) |

### Belles mécaniques (`/serie/vehicules`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Belles mécaniques — voitures de collection · Nicephos (53) | Voitures anciennes et de collection, de l’Anjou à l’île de Ré et jusqu’en Californie : Coccinelle, américaines chromées, bolide bleu. (133) |
| en | Fine Machines — classic car photography · Nicephos (50) | Classic and vintage cars, from Anjou and the Île de Ré to California: a Beetle, chrome-laden American cars, a blue racer. (121) |
| de | Edle Karossen – Oldtimer-Fotografie · Nicephos (46) | Oldtimer und Klassiker vom Anjou über die Île de Ré bis Kalifornien: ein Käfer, verchromte Amerikaner, ein blauer Flitzer. (122) |

### Photosynthèse (`/serie/fleurs`, puis `/serie/photosynthese` avec une 301)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Photosynthèse — fleurs, arbres et séquoias · Nicephos (53) | Le végétal sous toutes ses formes : gouttes et fleurs au jardin, prairies des Alpes bavaroises, séquoias de Californie et volcan de Lassen. (139) |
| en | Photosynthesis — flowers, trees and redwoods · Nicephos (55) | Plant life in every form: garden drops and flowers, Bavarian alpine meadows, California redwoods and Lassen’s volcanic landscape. (129) |
| de | Photosynthese – Blumen, Bäume und Mammutbäume · Nicephos (56) | Pflanzen in allen Formen: Tropfen und Blüten im Garten, Almwiesen am Tegernsee, kalifornische Mammutbäume und der Vulkan Lassen. (128) |

### Anthropocène (`/serie/panoramas`, puis `/serie/anthropocene` avec une 301)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Anthropocène — l’empreinte humaine · Nicephos (45) | L’empreinte humaine sur les paysages : l’été caniculaire de 2026, une régate à Munich, des baleines face à l’industrie à Monterey. (130) |
| en | Anthropocene — the human footprint · Nicephos (45) | The human footprint on the landscape: the scorching summer of 2026, a regatta in Munich, whales off Monterey’s industrial shore. (128) |
| de | Anthropozän – der Fußabdruck des Menschen · Nicephos (52) | Der Mensch prägt die Landschaft: der Hitzesommer 2026, eine Regatta in München, Wale vor der Industrieküste von Monterey. (121) |

### Plus près du ciel (`/serie/cieux`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Plus près du ciel — ciels et lumières · Nicephos (48) | Regarder en l’air : soleil couchant sur l’île de Ré, ombres et silhouettes tournées vers le ciel. Photos de Sébastien et Julien. (128) |
| en | Closer to the Sky — skies and light · Nicephos (46) | Looking up: sunset over the Île de Ré, shadows and silhouettes reaching for the sky. Photos by Sébastien and Julien. (116) |
| de | Näher am Himmel – Himmel und Licht · Nicephos (45) | Der Blick nach oben: Sonnenuntergang auf der Île de Ré, Schatten und Silhouetten vor dem Himmel. Fotos von Sébastien und Julien. (128) |

À relire après le retrait du logo de cette série (SEO-09).

### Feel Good (`/serie/feel-good`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Feel Good — instants heureux · Nicephos (39) | Des instants qui font du bien : une cascade au bord du Tegernsee, un singe qui cherche son petit à Munich. Photos de Julien. (124) |
| en | Feel Good — happy moments · Nicephos (36) | Feel-good moments: a waterfall by Lake Tegernsee, a monkey looking for its baby in Munich. Photos by Julien. (108) |
| de | Feel Good – glückliche Momente · Nicephos (41) | Momente, die guttun: ein Wasserfall am Tegernsee, ein Affe auf der Suche nach seinem Jungen in München. Fotos von Julien. (121) |

### Description générée, tant qu’une série n’a pas d’introduction

`t.seo.serieAuto` produit : « Série « {nom} » : {n} photos prises à {4 villes les plus fréquentes} ». Par exemple : « Série « Nocturne » : 5 photos prises à Angers, Ars-en-Ré, Poussan. »

---

## Carte (`/carte`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Carte des photos : Angers, Paris, Saint-Malo, Californie (56, sans la marque) | Les lieux de nos photos sur une carte du monde : Angers, Paris, Saint-Malo et la Côte d’Émeraude, l’île de Ré, la Bavière, la Californie. (137) |
| en | Photo map: Angers, Paris, Saint-Malo, California · Nicephos (59) | Where our photos were taken, on a world map: Angers, Paris, Saint-Malo and the Emerald Coast, the Île de Ré, Bavaria and California. (132) |
| de | Fotokarte: Angers, Paris, Saint-Malo, Kalifornien · Nicephos (60) | Wo unsere Fotos entstanden sind: Angers, Paris, Saint-Malo und die Smaragdküste, die Île de Ré, Bayern und Kalifornien. (119) |

**H1** : « Carte des photos » ; « Photo map » ; « Fotokarte ».

La description actuelle, générée à partir des 6 premières villes, est une bonne base. Il vaut mieux citer des régions (Côte d’Émeraude, Californie) que de petites communes (Heidenheim, Poussan).

---

## À propos (`/a-propos`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Qui sommes-nous ? Sébastien et Julien, photographes (51, sans la marque) | Nicephos, ce sont deux amis photographes, Sébastien et Julien : qui nous sommes, ce que nous photographions, notre matériel et comment nous contacter. (150) |
| en | About us: Sébastien and Julien, photographers · Nicephos (56) | Nicephos is two friends who photograph, Sébastien and Julien: who we are, what we shoot, the gear we use and how to get in touch. (129) |
| de | Über uns: Sébastien und Julien, Fotografen · Nicephos (53) | Nicephos, das sind zwei befreundete Fotografen, Sébastien und Julien: wer wir sind, was wir fotografieren, unsere Ausrüstung, Kontakt. (134) |

**H1** : « Sébastien et Julien, deux regards » ; « Sébastien and Julien, two ways of seeing » ; « Sébastien und Julien, zwei Blicke ». Aujourd’hui, le H1 est la devise.

---

## Voyages

### Liste (`/voyages`), dès qu’un voyage est publié

| Langue | `<title>` | Description |
|---|---|---|
| fr | Voyages en photos : Côte d’Émeraude, Californie · Nicephos (58) | Nos voyages en photos, jour après jour, avec l’itinéraire sur la carte : Côte d’Émeraude, Californie, Bavière. (110) |
| en | Travel photography: Emerald Coast, California · Nicephos (56) | Our trips in photographs, day by day, with the route on a map: Brittany’s Emerald Coast, California, Bavaria. (109) |
| de | Reisefotos: Smaragdküste, Kalifornien · Nicephos (48) | Unsere Reisen in Fotos, Tag für Tag, mit der Route auf der Karte: Smaragdküste der Bretagne, Kalifornien, Bayern. (113) |

### Exemple de voyage : Californie, août 2026

Le titre du voyage se saisit tel quel dans l’admin.

| Langue | `<title>` | Description |
|---|---|---|
| fr | Californie, août 2026 : San Francisco, séquoias et Lassen (57) | La Californie en août 2026, jour après jour : San Francisco, la route des séquoias (Avenue of the Giants) et le parc volcanique de Lassen. (138) |
| en | California, August 2026: San Francisco, redwoods, Lassen (56) | California in August 2026, day by day: San Francisco, the redwoods of the Avenue of the Giants and Lassen Volcanic National Park. (129) |
| de | Kalifornien, August 2026: San Francisco, Redwoods, Lassen (57) | Kalifornien im August 2026, Tag für Tag: San Francisco, die Mammutbäume der Avenue of the Giants und der Lassen-Volcanic-Nationalpark. (134) |

Ici, la description est la première phrase de l’introduction, coupée par `clip()`, et non `intro.slice(0, 200)`.

---

## Droits d’utilisation (`/droits`)

| Langue | `<title>` | Description |
|---|---|---|
| fr | Droits d’utilisation et licences des photos · Nicephos (54) | Ce que vous pouvez faire des photos de Nicephos : usage personnel, partage avec un lien, demande de licence pour une publication ou un tirage. (142) |
| en | Photo licensing and terms of use · Nicephos (43) | What you may do with Nicephos photographs: personal use, sharing with a link, and how to request a licence for publication or prints. (133) |
| de | Nutzungsrechte und Bildlizenzen · Nicephos (42) | Was Sie mit den Fotos von Nicephos tun dürfen: privater Gebrauch, Teilen per Link, Lizenzanfrage für Veröffentlichung oder Druck. (129) |

C’est la page `license` et `acquireLicensePage` des photos. Il faut lui ajouter une section « Obtenir une licence ».

---

## Pages photo (`/photo/<adresse>`)

### Gabarits

**`<title>`** : `titled(titre de la photo, siteName)`. Le gabarit n’ajoute pas la ville automatiquement : la ville de la carte est parfois trompeuse (Redding pour Lassen, Garberville pour Avenue of the Giants). Quand la photo montre un lieu, c’est au **titre** de le nommer (charte de légende, SEO-07).

**Description**, sous la forme « première phrase de la légende + ligne d’attribution », puis `clip(…, 155)`.

| Langue | Avec une légende | Sans légende |
|---|---|---|
| fr | `{phrase de la légende} Photo de {auteur}, {ville} ({région}), {mois année}.` | `{titre} : photo de {auteur} prise à {ville} ({région}) en {mois année}, série {série}.` |
| en | `{caption sentence} Photo by {author}, {city}, {region}, {Month Year}.` | `{title}: photo by {author}, taken in {city}, {region}, in {Month Year}. Part of the {series} series.` |
| de | `{Satz der Bildunterschrift} Foto von {Autor}, {Ort} ({Region}), {Monat Jahr}.` | `{Titel}: Foto von {Autor}, aufgenommen in {Ort} ({Region}) im {Monat Jahr}, Serie {Serie}.` |

- Le mois s’écrit en toutes lettres (`Intl.DateTimeFormat(…, { month: 'long', year: 'numeric' })`), plutôt que l’abréviation de la ligne de métadonnées (« oct. 2026 »).
- La ligne technique (« Longue exposition de 30 sec au Nikon… ») ne va pas dans la description : elle a sa place dans la fiche technique (SEO-07).

### Exemples

**Le Sillon de Saint-Malo à marée haute** (`/photo/le-sillon-de-saint-malo-a-maree-haute`)

| Langue | Titre de la photo | `<title>` produit | Description |
|---|---|---|---|
| fr | Le Sillon de Saint-Malo à marée haute | Le Sillon de Saint-Malo à marée haute · Nicephos (48) | À marée haute, la mer bat la digue du Sillon ; une pose de 30 secondes lisse les vagues. Photo de Julien, Saint-Malo (Bretagne), octobre 2026. (142) |
| en | The Sillon at high tide, Saint-Malo | The Sillon at high tide, Saint-Malo · Nicephos (46) | At high tide the sea pounds the Sillon sea wall; a 30-second exposure smooths the waves. Photo by Julien, Saint-Malo, Brittany, October 2026. (141) |
| de | Der Sillon bei Flut, Saint-Malo | Der Sillon bei Flut, Saint-Malo · Nicephos (42) | Bei Flut schlägt das Meer gegen den Sillon-Damm; 30 Sekunden Belichtung glätten die Wellen. Foto von Julien, Saint-Malo (Bretagne), Oktober 2026. (145) |

**Depuis le Nick vers Cézembre** (`/photo/dsc7561-dxo`, puis `/photo/depuis-la-pointe-du-nick-vers-cezembre`)

| Langue | Titre de la photo | `<title>` produit | Description |
|---|---|---|---|
| fr | Depuis la pointe du Nick vers Cézembre | Depuis la pointe du Nick vers Cézembre · Nicephos (49) | De la pointe du Nick, le regard file vers l’île de Cézembre et le phare du Grand Jardin. Photo de Julien, Saint-Lunaire (Bretagne), octobre 2026. (145) |
| en | Cézembre from Pointe du Nick, Saint-Lunaire | Cézembre from Pointe du Nick, Saint-Lunaire · Nicephos (54) | From Pointe du Nick the eye runs to Cézembre island and the Grand Jardin lighthouse. Photo by Julien, Saint-Lunaire, Brittany, October 2026. (140) |
| de | Blick von der Pointe du Nick auf Cézembre | Blick von der Pointe du Nick auf Cézembre · Nicephos (52) | Von der Pointe du Nick geht der Blick zur Insel Cézembre und zum Leuchtturm Grand Jardin. Foto von Julien, Saint-Lunaire (Bretagne), Oktober 2026. (146) |

**Skyline de San Francisco**, photo sans légende : la description est générée.

| Langue | `<title>` produit | Description |
|---|---|---|
| fr | Skyline de San Francisco · Nicephos (35) | Skyline de San Francisco : photo de Julien prise à San Francisco (Californie) en août 2026, série Super Urbain. (111) |
| en | San Francisco skyline · Nicephos (32) | San Francisco skyline: photo by Julien, taken in San Francisco, California, in August 2026. Part of the Super Urban series. (123) |
| de | Skyline von San Francisco · Nicephos (36) | Skyline von San Francisco: Foto von Julien, aufgenommen in San Francisco (Kalifornien) im August 2026, Serie Super Urban. (121) |

Aujourd’hui, la page anglaise affiche « Skyline de San Francisco » en titre et « Julien, San Francisco, California, Aug 2026 » en description.

**Titres à reprendre** (avec le `<title>` produit)

| Photo actuelle | fr | en | de |
|---|---|---|---|
| Alley of the giants, California | Avenue of the Giants, la route des séquoias · Nicephos (54) | Avenue of the Giants redwoods, California · Nicephos (52) | Avenue of the Giants: Mammutbäume in Kalifornien · Nicephos (59) |
| Volcan de Lassen - Caldeira de volcan et sources d’eau chaude sulfurée (81 aujourd’hui) | Parc volcanique de Lassen : caldeira et sources sulfureuses (59, sans la marque) | Lassen Volcanic Park – caldera and sulphur springs (50, sans la marque) | Lassen-Volcanic-Nationalpark: Caldera und Schwefelquellen (57, sans la marque) |
| À la Fontaine Stravinsky | À la fontaine Stravinsky, Paris · Nicephos (42) | At the Stravinsky Fountain, Paris · Nicephos (44) | Am Strawinsky-Brunnen in Paris · Nicephos (41) |
| Cyclistes en contre-jour dans le marais | Cyclistes en contre-jour dans le Marais · Nicephos | Cyclists against the light in the Marais · Nicephos | Radfahrer im Gegenlicht im Marais · Nicephos |
| Vie au Canal Saint Martin | Vie au canal Saint-Martin · Nicephos | Life on the Canal Saint-Martin · Nicephos | Leben am Canal Saint-Martin · Nicephos |
| Eclosion florale / Féérie florale | Éclosion florale / Féerie florale | — | — |
| Baleines & production énergetique | Baleines et production énergétique, Monterey · Nicephos | Whales and energy production, Monterey · Nicephos | Wale und Energieproduktion, Monterey · Nicephos |
| Bienvenue! Hi ! Hallo! | À dépublier (SEO-09) | — | — |

**H1 de la page photo** : le titre de la photo, avec `lang="…"` quand il s’affiche dans une autre langue que la page (SEO-06).

---

## Pages déjà correctes, ou hors index

| Page | État | À faire |
|---|---|---|
| Mentions légales | Titre et description corrects | Remplir les champs vides (SEO-03) |
| Confidentialité | Description claire (99) | — |
| Je vous ai photographié (`/bonjour`) | Description claire (145), noindex | — |
| Recherche | noindex avec une requête | noindex aussi sans requête, et pas de canonique avec une requête (SEO-18) |
| Page introuvable | 404, sans description | — |
