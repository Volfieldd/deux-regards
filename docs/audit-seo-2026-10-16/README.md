# Audit SEO de Nicephos et plan d’action

**Date :** 16 octobre 2026.
**Périmètre :** le site public https://www.nicephos.art (français, anglais, allemand) et son code (`/home/claudecode/dr-work/seo`, dépôt deux-regards, base `4042eaa`). L’administration n’est examinée que pour ce qui produit le contenu public : fiche photo, séries, réglages.
**Projets à venir pris en compte :** un carnet (blog), des galeries privées, une boutique de tirages.

**Méthode**
- Visite en simple visiteur, avec environ 45 chargements marqués « NicephosAudit-scan » (journal : `ux-data/prod/seo/log.txt`). Relevé des en-têtes et du HTML avec curl, et des balises de 26 pages de production et de 34 pages de la démo.
- Lecture du code, sans le modifier : `server/routes/public.js`, `views/layout.eta`, `server/i18n.js`, `server/repo.js`, le sitemap, le robots.txt et la chaîne des images (`server/images.js`, `server/variants.js`, `server/routes/media.js`).
- Core Web Vitals mesurés en laboratoire avec Playwright (`outils/seo-cwv.mjs`) : Pixel 7, 150 ms de latence, 1,6 Mbit/s, processeur ×4, cache vide, 3 passes. La même page a été mesurée une seconde fois avec le fond de carte bloqué, pour isoler sa part.
- Recherches Google et Bing du 16/10/2026 : la marque, les lieux, « photographe <ville> ».
- Recoupement avec les audits RGAA (site public) et RGESN (écoconception) du même jour.

**Limites**
- Pas d’accès à la Search Console ni à Bing Webmaster Tools, qui ne sont pas configurés (SEO-01). Je n’ai donc aucune donnée réelle d’indexation, de requêtes ou de liens entrants. Ce qui est dit de l’indexation repose sur les recherches et sur le code.
- PageSpeed Insights sans clé a répondu 429 (quota épuisé). Il n’y a pas non plus de données terrain CrUX, que le site n’a sans doute pas encore faute de trafic. Toutes les mesures de performance sont des mesures de laboratoire.
- La redirection de langue n’a pas été reproduite en direct, parce que l’adresse IP du test est en France. Le constat s’appuie sur le code.
- Les volumes de recherche ne sont pas mesurés (pas d’outil de mots-clés). J’ai choisi les cibles d’après l’intention et la concurrence observée. Il faudra les confirmer avec les requêtes réelles de la Search Console après 4 à 8 semaines.
- Ce dossier ne contient aucune capture de la production (photos personnelles). Les preuves restent dans `ux-data/`, hors dépôt.

---

## En une page

**Verdict.** La base technique de Nicephos vaut celle d’un bon site marchand. Le rendu se fait côté serveur et tout se lit sans JavaScript. Les redirections http, apex et www se font en un seul saut 301. Les canonical et les hreflang sont réciproques, le sitemap est trilingue, et le noindex est bien posé sur les pages utilitaires. Les images sont en AVIF et WebP, et portent des mentions IPTC qui les rendent éligibles au badge « Licenciable » de Google Images.

Mais Google ne voit presque rien de ce qui fait la valeur du site. Le 16 octobre, aucune page n’apparaît, même sur « nicephos.art ».

**Ce qui bloque, par ordre d’impact**
1. **Aucun suivi** : ni Search Console ni Bing Webmaster Tools, donc on ne sait ni quoi corriger ni si les corrections portent (SEO-01).
2. **Des titres et des descriptions vides de sens** : l’accueil s’intitule « Nicephos » dans les trois langues, et la même devise sert de description à 36 adresses (SEO-02).
3. **Des auteurs presque anonymes** : prénoms seuls, une biographie manquante, des mentions légales sans éditeur. C’est le premier frein à la confiance, pour Google comme pour un futur acheteur (SEO-03).
4. **Des pages série et photographe identiques à l’accueil** : 6 H1, même description, même image de partage, et cette image est le logo (SEO-04).
5. **Aucune donnée structurée** : rien ne relie la marque, les deux photographes, les photos, leurs lieux et leur licence (SEO-05).
6. **Des versions anglaise et allemande qui n’en sont pas** : 38 titres de photo sur 44 sont restés en français, et les rares traductions sont des calques automatiques (« Not the sea to drink »). Elles sont pourtant annoncées en hreflang (SEO-06).
7. **Des légendes et des lieux trop pauvres** pour être trouvés sur les recherches de lieu, et des textes alternatifs qui répètent le titre (SEO-07).

**Ce qu’il faut viser.** D’abord la marque (« Nicephos », que les moteurs confondent avec « Nicéphore » Niépce) et le nom des deux auteurs. Ensuite la longue traîne des lieux, surtout dans Google Images : le Sillon à marée haute, la pointe du Nick, Cézembre, la fontaine Stravinsky, Avenue of the Giants, le Tegernsee. Plus tard, « tirage photo <lieu> ». Il ne faut pas viser « photographe Angers » : on y cherche à embaucher un photographe, et ces places sont tenues par des professionnels.

**Les 6 actions de la semaine** (une demi-journée de réglages et une petite PR, vague 0)
1. Créer la Search Console (propriété « Domaine », TXT dans Cloudflare) et y soumettre le sitemap. Créer Bing Webmaster Tools par import.
2. Écrire les titres et les descriptions par gabarit, coupés au mot (`exemples/titres-meta.md`).
3. Mettre le fond de carte léger sur la page photo : le LCP mobile passe de 3,0 s à environ 2,1 s.
4. Mettre la recherche et les filtres combinés en noindex.
5. Sortir le logo de la photothèque.
6. Faire relire par un locuteur natif les noms de séries traduits.

**Ensuite**
- Vague 1, technique (fin octobre à mi-novembre) : JSON-LD, gabarit propre aux séries et aux photographes, historique des adresses avec 301, adresses d’images stables, hreflang réservé aux pages traduites.
- Vague 2, contenus (novembre et début décembre) : biographies, introductions des séries, légendes et textes alternatifs, traductions relues, ouverture des Voyages.
- Vague 3, autorité et suivi (à partir de décembre) : Instagram et Pinterest, presse et tourisme locaux, carnet.

**À ne pas faire.** Acheter des liens. Publier sans relecture des traductions ou des descriptions générées. Bourrer les textes alternatifs de mots-clés.

**Mesure.** Search Console, Bing Webmaster Tools et la page Statistiques de l’admin (provenance des visites) suffisent : pas besoin de traceur sur le site.

---

## Suivi des audits précédents

| Audit | Recommandation qui touche le référencement | État au 16/10 |
|---|---|---|
| Ergonomie de l’admin (F-m06) | Signaler le titre provisoire tiré du nom de fichier | **Suivi pour le titre** : il est repéré dans « À finir » (`server/todo.js:156`). **Pas pour l’adresse** : elle reste celle du nom de fichier, d’où 11 photos publiées en `/photo/dsc…-dxo` (SEO-08). |
| Ergonomie, cible « Séries » (C3) | Adresse de la série repliée, avec l’avertissement « la changer casse les liens » | **Suivi** pour l’avertissement (`docs/aide/03-photos.md:109`). Mais aucune redirection n’existe, donc l’avertissement reste vrai (SEO-08). |
| Revue d’octobre | `<main>` et `<h1>` à l’accueil sans ouverture | **Suivi** (`views/home.eta:3` et `:35`). Avec l’ouverture, c’est l’inverse : 6 H1 (SEO-04). |
| Revue d’octobre | Voiles de l’ouverture plus denses | **Suivi au bureau seulement** : le menu tombe à 1,9:1 sur téléphone (audit RGAA, constat 1). |
| Revue d’octobre | Focus rendu au lien activé après un filtre | **Régression** : le focus part sur un autre lien qui a la même adresse (audit RGAA, constat 4). |
| Revue d’octobre | `aria-invalid` et `aria-describedby` sur les erreurs | `aria-describedby` **absent** des formulaires publics (audit RGAA, constat 8). |
| Revue d’octobre | Bordures des champs à 3,2:1 | **Pas sur les formulaires publics** : 1,3:1 (audit RGAA, constat 9). |
| Audit iPhone (admin) | Saisie au toucher, « Compléter et publier » | Hors référencement. Utile indirectement : c’est là que se saisissent les titres, les lieux et les légendes (SEO-07). |
| Design d’octobre | Maquettes de l’admin | Hors référencement. |

---

## État des lieux technique

| Contrôle | État | Détail |
|---|---|---|
| HTTPS et redirections (http, apex → www) | OK | Un seul saut 301, chemin et paramètres conservés |
| HSTS | Partiel | 1 an, sans `includeSubDomains` ni `preload` (SEO-22) |
| HTTP/2, HTTP/3, compression, TTFB | OK | zstd et brotli, TTFB de 60 à 120 ms |
| Rendu serveur, site sans JavaScript | OK | Tout le contenu et tous les liens sont dans le HTML |
| robots.txt | À corriger | Deux groupes `User-agent: *` (SEO-19). Admin, auth, partage, langue et pour-vous bien exclus |
| Sitemap | Partiel | 180 adresses avec hreflang, mais sans images ni x-default, et lastmod partiel (SEO-14) |
| Canonical | OK, sauf 2 cas | Indépendante des paramètres. Contradictions : recherche et filtres combinés (SEO-04, SEO-18) |
| hreflang | Partiel | Réciproques, avec x-default, mais annoncés sur des pages non traduites (SEO-06) |
| `lang` et `og:locale` | Partiel | Justes pour la page, mais les textes de repli n’ont pas d’attribut `lang` (SEO-06) |
| noindex des pages utilitaires | OK | Par en-tête `X-Robots-Tag` |
| Codes HTTP (404, 410, 301) | OK | Sauf la barre oblique finale (SEO-21) et les adresses renommées (SEO-08) |
| Redirection selon la langue | À corriger | Robots épargnés. Visiteurs : le pays passe avant le navigateur, sur toutes les pages (SEO-12) |
| Titres | À corriger | « Nicephos » seul, aucun mot-clé (SEO-02) |
| Meta descriptions | À corriger | La devise sur 36 adresses, légende et signature collées (SEO-02) |
| Titres H1 | À corriger | 6 H1 sur les pages galerie (SEO-04) |
| Données structurées | Absentes | Aucun bloc JSON-LD (SEO-05) |
| Open Graph et cartes X | Partiel | WebP sans dimensions ni alternative, logo sur les séries (SEO-15) |
| Images : formats, srcset, dimensions, lazy | OK | AVIF + WebP, CLS ≤ 0,018 partout |
| Images : IPTC/XMP | OK | Créateur, droits, crédit, WebStatement, LicensorURL. Créateur au prénom seul (SEO-03) |
| Images : adresses stables | À corriger | Changent avec les réglages, les anciennes répondent 404 (SEO-13) |
| Images : texte alternatif | Partiel | Égal au titre (SEO-07) |
| Images : aperçus en grand | Absent | Pas de `max-image-preview:large` (SEO-16) |
| Core Web Vitals sur bureau | OK | LCP de 0,44 à 0,87 s |
| Core Web Vitals sur mobile : accueil, séries | OK | LCP de 1,1 à 1,4 s, TBT 0 |
| Core Web Vitals sur mobile : page photo | À corriger | LCP ≈ 3,0 s, TBT ≈ 400 ms (SEO-10) |
| Core Web Vitals sur mobile : carte | À corriger | LCP 5,8 s (SEO-23) |
| Adresses (slugs) | À corriger | 11 adresses `dsc…-dxo`, 2 séries périmées, aucune 301 (SEO-08) |
| Maillage interne | Partiel | La page photo ne mène ni à la série, ni au voyage, ni au pied de page (SEO-11) |
| Liens entre les langues | À corriger | Via `/langue/`, en nofollow et interdit par robots.txt (SEO-12) |
| Search Console, Bing Webmaster Tools | Absents | (SEO-01) |
| Requêtes conditionnelles sur le HTML | Absentes | Ni ETag ni Last-Modified (SEO-22) |
| Réécriture par Cloudflare | À corriger | Lien e-mail et script injectés (SEO-20) |

---

## Constats

Comment lire chaque constat :
- **Impact** : fort, moyen ou faible.
- **Effort** : S (une demi-journée au plus), M (1 à 3 jours), L (plus de 3 jours).
- **Zone** : front (site public), admin, hébergement (Cloudflare, DNS), ou les deux.

Les chemins `server/…` et `views/…` renvoient au dépôt. Les chemins `ux-data/…` renvoient aux preuves, hors dépôt.

### Impact fort

#### SEO-01 · Ni Search Console ni Bing Webmaster Tools : le site est invisible et rien n’est suivi

**Impact fort · effort S · hébergement**

**Constat**
- Le DNS ne contient ni TXT `google-site-verification` ni `MS=`, et les pages n’ont ni balise ni fichier de vérification.
- Le 16/10/2026, les recherches « nicephos.art » et « Nicephos photographie » ne renvoient aucune page du site. « Nicephos » est très proche de « Nicéphore » (Niépce), qui occupe tous les résultats.
- Sans Search Console, on ne peut pas :
  - savoir quelle canonique Google retient pour `/en/` et `/de/` ;
  - repérer les pages « explorées, non indexées » ;
  - suivre Google Images et les données structurées ;
  - soumettre le sitemap.

**Preuve.** `dig +short TXT nicephos.art` ne renvoie que `v=spf1 include:_spf.protonmail.ch ~all` et `protonmail-verification=…`. `ux-data/prod/seo/home.html` ne contient aucune meta de vérification. L’API PageSpeed a renvoyé HTTP 429.

**Correction** (aucune ligne de code, aucun script tiers)
1. Search Console : Ajouter une propriété → **Domaine** → `nicephos.art`. Ajouter le TXT `google-site-verification=…` dans Cloudflare DNS (Cloudflare propose de le faire lui-même). Cette propriété couvre à la fois http, https, l’apex et www.
2. Sitemaps : soumettre `https://www.nicephos.art/sitemap.xml`.
3. Inspection d’URL : demander l’indexation de 10 pages clés (`/`, `/en/`, `/de/`, `/a-propos`, `/carte`, `/auteur/julien`, `/auteur/seb` et 3 séries).
4. Bing Webmaster Tools : « Importer depuis Google Search Console ». Bing alimente aussi DuckDuckGo et Ecosia.
5. Cloudflare → Caching → Configuration → **Crawler Hints** : à activer. Bing, Yandex et Seznam seront alors prévenus des changements par IndexNow.
6. Créer une clé API PageSpeed gratuite, pour une mesure mensuelle.

**Indicateur.** Propriété validée. Sitemap à l’état « Opération effectuée », avec 180 adresses découvertes. « nicephos » en première position dans les 2 à 4 semaines.

#### SEO-02 · Titres et meta descriptions : sans mot-clé, dupliqués ou mal composés

**Impact fort · effort S · front**

**Constat**
- **Accueil** : le `<title>` est « Nicephos » (8 caractères), identique en fr, en et de. Il ne contient ni « photographie », ni lieu, ni nom.
- **Photographes** : « par Julien · Nicephos ». **Séries** : le nom créatif seul, comme « Super Urbain · Nicephos » ou « Nocturne · Nicephos ». **Carte** et **À propos** : « Carte · Nicephos », « À propos · Nicephos ».
- **Description** : la devise « Ce qui attire nos regards mérite d’être partagé. » sert sur l’accueil, les 8 séries, les 2 photographes et À propos. Cela fait 12 adresses en français et 36 en tout.
- **Photo** : la légende et la signature sont collées sans ponctuation (« …24-120 f4 Julien, Saint Malo, France, oct. 2026 »). La description n’est jamais tronquée (347 caractères sur *The Grapes of Wrath*). La photo-logo n’a que « Julien ».
- **Voyage** : `intro.slice(0, 200)` coupe au milieu d’un mot.
- **Titres trop longs** : « Volcan de Lassen - Caldeira de volcan et sources d’eau chaude sulfurée · Nicephos » fait 81 caractères.

**Preuve.** `ux-data/seo/balises-prod-bureau.csv` ; `server/routes/public.js:210-212` (galerie), `:257` (photo), `:309` (voyage), `:343` (À propos) ; `views/layout.eta:10`.

**Correction**
1. Dans `server/format.js`, ajouter deux utilitaires :
   ```js
   // Texte ramené à `max` caractères : coupé en fin de phrase si possible, sinon au dernier mot, suivi de « … ».
   export function clip(s, max = 155) {
     const t = String(s || '').replace(/\s+/g, ' ').trim();
     if (t.length <= max) return t;
     const head = t.slice(0, max);
     const dot = head.lastIndexOf('. ');
     if (dot >= max * 0.5) return head.slice(0, dot + 1);
     const sp = head.lastIndexOf(' ', max - 1);
     return `${head.slice(0, sp > 0 ? sp : max - 1).replace(/[\s,;:–—-]+$/, '')}…`;
   }
   // « titre · Nicephos », sans la marque quand le tout dépasserait 60 caractères (Google coupe au-delà).
   export const titled = (title, siteName, max = 60) =>
     (title.length + siteName.length + 3 <= max ? `${title} · ${siteName}` : title);
   // Une phrase se termine par un point.
   export const sentence = s => (s && !/[.!?…]$/.test(s.trim()) ? `${s.trim()}.` : s || '');
   ```
2. Dans `server/i18n.js`, ajouter `UI[lang].seo` avec les textes de `exemples/titres-meta.md`. Pour le français :
   ```js
   seo: {
     home: site => `${site} — photographies de Sébastien et Julien`,
     author: name => `${name}, photographe`,
     serie: c => (c.subtitle ? `${c.name} — ${c.subtitle}` : `${c.name} — série photo`),
     serieAuto: (c, n, cities) => `Série « ${c.name} » : ${n} photos${cities.length ? ` prises à ${cities.join(', ')}` : ''}.`,
     photoLine: p => `Photo de ${p.author}${p.place ? `, ${p.place}` : ''}${p.when ? `, ${p.when}` : ''}.`,
     map: names => `Carte des photos : ${names}`,
     about: 'Qui sommes-nous ? Sébastien et Julien, photographes',
   },
   ```
3. Dans `server/routes/public.js` :
   - galerie (l.210-212) : `pageTitle` = `titled(t.seo.serie(activeSerie), siteName)`, ou `titled(t.seo.author(activeAuthor.name), siteName)`, ou sur l’accueil `pick(settings, 'seo_title', lang) || t.seo.home(siteName)`. `description` = `clip(activeSerie?.intro || activeAuthor?.bio || pick(settings, 'seo_description', lang) || …)` ;
   - photo (l.257) : `description: clip([sentence(photo.legend), t.seo.photoLine(photo)].filter(Boolean).join(' '))` ;
   - voyage (l.309) : `clip(tr.intro)` à la place de `tr.intro.slice(0, 200)` ;
   - toutes les pages : `titled(…)` à la place de `` `${…} · ${siteName}` ``.
4. Dans Site public, un réglage « Titre et description pour les moteurs », par langue (`seo_title`, `seo_description`, avec `_en` et `_de`), pour l’accueil seulement.

**Indicateur.** Aucun titre ni aucune description en double sur les 180 adresses. Titres de 30 à 65 caractères. Dans la Search Console, le taux de clic (rapport Performances) doit monter.

#### SEO-03 · Identité des auteurs (E-E-A-T) trop mince, mentions légales incomplètes

**Impact fort · effort S (rédaction) · les deux**

**Constat**
- On ne connaît les auteurs que par leur prénom, partout : titres, pied de page, et IPTC `dc:creator` = « Julien » dans les images servies.
- Julien n’a pas de biographie. Personne n’a de portrait ni de lien vers Instagram ou un autre profil.
- La biographie de Sébastien n’existe qu’en français. Elle se contredit : « depuis quelques années déjà », puis « il y a maintenant 21 ans ».
- La page d’un photographe n’affiche pas sa biographie, qui n’apparaît que sur `/a-propos`.
- Les mentions légales n’indiquent ni éditeur, ni adresse, ni responsable de la publication, alors que leur description les annonce. La phrase « hébergé… à l’adresse ci-dessus » ne renvoie à aucune adresse.

**Preuve.** `ux-data/prod/front-bureau/a-propos.png`, `a-propos-en.png`, `mentions-legales.png` (hors dépôt) ; `server/legal.js:8-16` (un champ vide est masqué) ; XMP d’une vignette de production (`dc:creator` = « Julien ») ; `server/variants.js:75` (`artist: p.author`, `credit: siteName`).

**Correction**
1. **Décision des auteurs** : choisir une identité publique stable (nom complet ou nom d’artiste) et l’employer partout : titres, biographie, IPTC, JSON-LD `Person`, Instagram.
2. **Page photographe** = un vrai « à propos » :
   - portrait ;
   - 120 à 250 mots par langue : parcours, sujets, lieux, matériel ;
   - réalisations, même modestes ;
   - liens `sameAs`.
   Dans l’admin, ajouter à `authors` une colonne `same_as` (liste d’adresses de profils publics). Les colonnes `bio_en` et `bio_de` existent déjà.
3. **Mentions légales** (Réglages → Mentions légales) : noms, adresse ou domiciliation, responsable de la publication.
   - Le site est hébergé par ses éditeurs (`server/legal.js:14`). La dispense d’un éditeur non professionnel (LCEN art. 6-III-2), qui permet de ne publier que les coordonnées de l’hébergeur, ne joue donc guère ici.
   - Avec la boutique, les mentions complètes deviennent obligatoires, ainsi que l’Impressum en Allemagne (§ 5 DDG).
   - Demander l’avis d’un juriste.
4. **IPTC** : `dc:creator` = nom public complet ; `photoshop:Credit` = « Julien [Nom] / Nicephos ». Toute modification de ces champs change l’empreinte des variantes, donc les adresses de toutes les images. **Faire SEO-13 avant.**
5. Ouvrir une rubrique « Expositions et presse » dès le premier événement.

**Indicateur.** Les deux biographies dans les 3 langues. Les mentions légales complètes. Dans la Search Console, la requête « <nom> photographe » doit apparaître.

#### SEO-04 · Pages série et photographe : des copies de l’accueil

**Impact fort · effort M · les deux**

**Constat**
- `renderGallery` sert le gabarit de l’accueil tel quel à `/serie/…` et à `/auteur/…` :
  - les 6 H1 du diaporama d’accueil, dont le premier est le logo, « Bienvenue! Hi ! Hallo! » ;
  - le même H2 (la devise) ;
  - la même description ;
  - la même `og:image` (le logo).
- Le nom de la série n’apparaît que dans le `<title>` et dans un H3 sous l’index des séries. Sur `/serie/atlantique` (démo), le H1 est « Miradouro, l’heure dorée », une photo d’une autre série.
- La table `categories` n’a aucun champ de texte (`server/repo.js:20`).
- Les filtres combinés `/?regard=julien&serie=nuit` (16 combinaisons × 3 langues) répondent 200, avec une canonique sur eux-mêmes et des hreflang.

**Preuve.** `ux-data/prod/seo/serie.html` et `filtre.html` (mêmes 6 `<h1>` que `home.html`) ; `ux-data/seo/balises-prod-bureau.csv` ; `server/routes/public.js:180-214` ; `views/home.eta:6-23`, `:38`, `:72` ; `server/urls.js:7` ; audit RGAA, constat 10.

**Correction**
1. **Migration `040_textes_series.sql`** (ou le prochain numéro libre) :
   ```sql
   -- Pages série : un sous-titre (titre de la page, H1) et une introduction (80 à 150 mots), en trois langues.
   ALTER TABLE categories ADD COLUMN subtitle    TEXT NOT NULL DEFAULT '';
   ALTER TABLE categories ADD COLUMN subtitle_en TEXT NOT NULL DEFAULT '';
   ALTER TABLE categories ADD COLUMN subtitle_de TEXT NOT NULL DEFAULT '';
   ALTER TABLE categories ADD COLUMN intro       TEXT NOT NULL DEFAULT '';
   ALTER TABLE categories ADD COLUMN intro_en    TEXT NOT NULL DEFAULT '';
   ALTER TABLE categories ADD COLUMN intro_de    TEXT NOT NULL DEFAULT '';
   -- Profils publics des photographes (Instagram, Flickr…) : JSON, liste d'adresses.
   ALTER TABLE authors ADD COLUMN same_as TEXT NOT NULL DEFAULT '[]';
   ```
   Il faut ensuite :
   - lire ces colonnes dans `server/repo.js:20`, et faire passer `subtitle` et `intro` par `pick()` ;
   - ajouter dans Séries (admin) deux champs avec la traduction (`views/admin/_tr.eta`).
2. **Gabarit** (`views/home.eta`). L’ouverture (diaporama) est réservée à l’accueil. Sur une série ou un photographe, elle cède la place à un en-tête de collection :
   ```eta
   <% const col = it.activeSerie || it.activeAuthor; %>
   <% if (col) { %>
   <header class="collection wrap">
     <%~ include('./brand', it) %><%~ include('./nav', it) %>
     <h1><%= it.activeSerie ? it.activeSerie.name : it.t.seo.author(it.activeAuthor.name) %></h1>
   <% if (it.activeSerie?.subtitle) { %>  <p class="sub"><%= it.activeSerie.subtitle %></p><% } %>
   <% const text = it.activeSerie ? it.activeSerie.intro : it.activeAuthor.bio; if (text) { %>
     <div class="intro"><% text.split(/\n\s*\n/).forEach(par => { %><p><%= par %></p><% }) %></div>
   <% } %>
   <% if (it.cover) { %>  <figure class="cover"><%~ it.picture(it.cover, { sizes: '100vw', eager: true, alt: it.cover.alt || '' }) %></figure><% } %>
   </header>
   <% } else { %>
     … ouverture actuelle …
   <% } %>
   ```
   Sur l’accueil :
   - un seul H1, « Nicephos — photographies de Sébastien et Julien », qui peut être visuellement masqué ;
   - les titres des diapositives deviennent des `<h2>` (ou `<p class="cap-title">`) ;
   - le H3 de la grille devient un H2.

   C’est aussi la correction du constat 10 de l’audit RGAA.
3. **`og:image`** : la couverture de la série (`series.find(c => c.slug === filter.serie)?.cover`), ou la première photo du photographe. Sur l’accueil, l’image de partage de la marque (`/brand/partage-….jpg`), et non `hero[0]`.
4. **Filtres combinés** (`server/routes/public.js`, dans `renderGallery`) :
   ```js
   const combined = Boolean(filter.regard && filter.serie);
   if (combined) reply.header('x-robots-tag', 'noindex, follow');
   // …
   canonical: combined ? undefined : galleryUrl({ regard: filter.regard, serie: filter.serie }),
   ```
5. Écrire les textes de la vague 2 (exemple d’introduction dans « Stratégie »).

**Indicateur.**
- Chaque page série et photographe a un H1 unique, une description propre et sa propre `og:image`.
- Dans la Search Console, `/serie/bord-de-mer` reçoit des impressions sur « Saint-Malo » ou « Côte d’Émeraude ».

#### SEO-05 · Aucune donnée structurée (JSON-LD)

**Impact fort · effort M · front**

**Constat.** Aucune page ne contient de bloc `application/ld+json`. Il manque donc :
- `WebSite` et `Organization`, pour le nom du site et le logo dans les résultats ;
- `Person` pour Sébastien et Julien ;
- `ImageObject`, pour le créateur, le crédit, la licence et le badge « Licenciable » ;
- `BreadcrumbList`, `CollectionPage` pour les séries, `Article` pour les voyages.

Le badge « Licenciable » ne repose aujourd’hui que sur l’IPTC des fichiers. Cela suffit pour être éligible, mais Google lit les deux sources, et les données de la page sont prises en compte plus vite.

**Preuve.** Champ `ld` vide dans `ux-data/prod-front-bureau/*.json` et `ux-data/demo-front-bureau/*.json`. Aucune occurrence de `ld+json` dans `views/` ni dans `server/`.

**Correction**
1. **`views/layout.eta`**, avant `</head>`. Un bloc de données n’est pas exécuté : la CSP `script-src 'self'` ne le bloque pas.
   ```eta
   <% if (it.jsonld) { %>
     <script type="application/ld+json"><%~ JSON.stringify(it.jsonld).replace(/</g, '\\u003c') %></script>
   <% } %>
   ```
2. **Nouveau module `server/jsonld.js`**. Les `@id` ne dépendent pas de la langue : une même personne et un même site, quelle que soit la version.
   ```js
   // Données structurées (JSON-LD, schema.org) des pages publiques : un objet par page, écrit par layout.eta.
   import { localize } from './i18n.js';
   import { variantName, widthsFor } from './images.js';
   import { photoUrl, galleryUrl } from './urls.js';

   const IN_LANGUAGE = { fr: 'fr-FR', en: 'en', de: 'de' };

   export function createJsonLd({ publicUrl, siteName, brand = {}, sameAs = [], rightsPath = '/droits' }) {
     const abs = (path, lang = 'fr') => publicUrl + localize(path, lang);
     const media = (p, w) => `${publicUrl}/media/${variantName(p.file, w, 'webp', p.variant_key)}`;
     const site = { '@id': `${publicUrl}/#site` };
     const org = { '@id': `${publicUrl}/#organisation` };
     const personId = slug => `${publicUrl}/auteur/${slug}#personne`;
     const person = a => ({ '@type': 'Person', '@id': personId(a.slug), name: a.name, url: abs(`/auteur/${a.slug}`) });
     const crumbs = (id, lang, items) => ({ '@type': 'BreadcrumbList', '@id': id, itemListElement: items.map(([name, path], i) =>
       ({ '@type': 'ListItem', position: i + 1, name, ...(path ? { item: abs(path, lang) } : {}) })) });
     const graph = nodes => ({ '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) });
     const list = a => (a && a.length ? a : undefined);

     return {
       home: ({ lang, description, authors }) => graph([
         { '@type': 'WebSite', ...site, url: abs('/', lang), name: siteName, description, inLanguage: IN_LANGUAGE[lang], publisher: org },
         { '@type': 'Organization', ...org, name: siteName, url: `${publicUrl}/`, sameAs: list(sameAs),
           logo: brand.favicon180 && { '@type': 'ImageObject', url: `${publicUrl}/brand/${brand.favicon180}`, width: 180, height: 180 },
           founder: authors.map(a => ({ '@id': personId(a.slug) })) },
         ...authors.map(person),
       ]),
       author: ({ lang, author, title, description, image }) => graph([
         { '@type': 'ProfilePage', '@id': abs(`/auteur/${author.slug}`, lang), url: abs(`/auteur/${author.slug}`, lang), name: title,
           inLanguage: IN_LANGUAGE[lang], isPartOf: site, mainEntity: { '@id': personId(author.slug) } },
         { ...person(author), description: description || undefined, image, memberOf: org, sameAs: list(JSON.parse(author.same_as || '[]')) },
       ]),
       serie: ({ lang, serie, title, description, photos }) => {
         const url = abs(galleryUrl({ serie: serie.slug }), lang);
         return graph([
           { '@type': 'CollectionPage', '@id': url, url, name: title, description, inLanguage: IN_LANGUAGE[lang], isPartOf: site,
             image: photos[0] && media(photos[0], widthsFor(photos[0].width).at(-1)), breadcrumb: { '@id': `${url}#ariane` },
             mainEntity: { '@type': 'ItemList', numberOfItems: photos.length, itemListElement: photos.slice(0, 20).map((p, i) =>
               ({ '@type': 'ListItem', position: i + 1, url: abs(photoUrl(p.slug), lang), name: p.title })) } },
           crumbs(`${url}#ariane`, lang, [[siteName, '/'], [serie.name]]),
         ]);
       },
       photo: ({ lang, photo: p }) => {
         const url = abs(photoUrl(p.slug), lang);
         const ws = widthsFor(p.width), w = ws.at(-1);
         const year = (p.taken_on || p.published_at || '').slice(0, 4);
         return graph([
           { '@type': 'ItemPage', '@id': url, url, name: p.title, inLanguage: IN_LANGUAGE[lang], isPartOf: site,
             primaryImageOfPage: { '@id': `${url}#image` }, breadcrumb: { '@id': `${url}#ariane` } },
           { '@type': 'ImageObject', '@id': `${url}#image`, contentUrl: media(p, w), thumbnailUrl: media(p, ws[0]),
             encodingFormat: 'image/webp', width: w, height: Math.round(p.height * w / p.width),
             name: p.title, caption: p.legend || undefined, description: p.alt || undefined,
             creator: person({ slug: p.author_slug, name: p.author }), creditText: `${p.author} / ${siteName}`,
             copyrightNotice: `© ${year} ${p.author}`, license: abs(rightsPath, lang), acquireLicensePage: abs(rightsPath, lang),
             dateCreated: p.taken_on || undefined, datePublished: p.published_at ? p.published_at.slice(0, 10) : undefined,
             contentLocation: p.city_name ? { '@type': 'Place', name: p.place || p.city_name,
               address: { '@type': 'PostalAddress', addressLocality: p.city_name, addressCountry: p.city_cc } } : undefined,
             inLanguage: IN_LANGUAGE[lang] },
           crumbs(`${url}#ariane`, lang, [[siteName, '/'], [p.category, galleryUrl({ serie: p.category_slug })], [p.title]]),
         ]);
       },
     };
   }
   ```
   `JSON.stringify` laisse de côté les valeurs `undefined` : un champ vide ne produit rien. Aucune coordonnée GPS n’est publiée, seulement la ville, comme sur la carte.
3. **Branchement** dans `server/routes/public.js` :
   - accueil : `jsonld: ld.home({ lang, description, authors })` ;
   - photographe : `ld.author(…)` ;
   - série : `ld.serie(…)` ;
   - photo : `ld.photo({ lang, photo })` ;
   - voyage : `Article` (voir `exemples/jsonld-billet.json`, même forme).
4. **Validation** avec le [Test des résultats enrichis](https://search.google.com/test/rich-results) et le validateur schema.org. Ensuite, suivre dans la Search Console les rapports « Métadonnées d’image », « Fil d’Ariane » et « Profile page ».

Des exemples prêts à coller sont dans `exemples/` : `jsonld-site.json`, `jsonld-personne.json`, `jsonld-serie.json` et `jsonld-photo.json`.

**Indicateur.**
- Aucune erreur au Test des résultats enrichis sur les 5 types de pages.
- Rapport « Métadonnées d’image » : 44 éléments valides.
- Badge « Licenciable » visible dans Google Images : chercher « site:nicephos.art » dans l’onglet Images.

#### SEO-06 · Versions anglaise et allemande : hreflang annoncé sur des pages restées en français, traductions automatiques non relues

**Impact fort · effort M · les deux**

**Constat**
- **Titres de photo** : sur l’accueil EN et DE, 38 titres sur 44 sont identiques au français. Le repli (`FALLBACK`, `pick()`) affiche le français quand `title_en` ou `title_de` est vide. Il en va de même pour les légendes et les lieux.
- **hreflang** : les 120 adresses `/en/` et `/de/` du sitemap sont pourtant annoncées en `en` et `de`. Leur `<html lang="en">` entoure un H1 et une légende en français, sans `lang="fr"`. La similarité mot à mot entre `/photo/le-sillon…` et `/en/photo/le-sillon…` est de 0,69 : seule l’interface change.
- **Conséquence** : Google détermine la langue d’après le contenu. Il peut regrouper ces pages avec la page française comme doublons, choisir lui-même la canonique et ignorer le hreflang. Le budget d’exploration d’un site tout neuf s’en trouve dilué.
- **Traductions publiées telles quelles**, alors que le code prévoit le contraire (« jamais de traduction publiée automatiquement », `server/translate.js:1-3`) :
  - séries : « Pas la mer à boire » → « Not the sea to drink » et « Nicht das Meer zum Trinken » ; « Belles mécaniques » → « Beautiful mechanics » et « Schöne Mechanik » ;
  - titres : « Lassen Vulkan - Caldera und Heißwassersulfidquellen » (ce mot n’existe pas) ; « Ein Affe wartet auf das Kind » (le français dit « cherche son enfant ») ; « Radfahrer im Gegenlicht in le Marais in Paris » ;
  - `/en/a-propos` : « discover the world through our goals » (« objectifs » photo traduit par *goals* et non *lenses*) ; la biographie de Sébastien y reste en français.

**Preuve.** Comparaison des liens de `ux-data/prod-front-bureau/accueil.json`, `accueil-en.json` et `accueil-de.json` ; `ux-data/prod/seo/photo.html` et `photo-en.html` ; `server/i18n.js:14-23` ; `server/repo.js:10-13` ; `server/routes/public.js:113-134` ; `views/layout.eta:18-21` ; audit RGAA, constat 6.

**Correction**
1. **Tout de suite** : faire relire par un locuteur natif les 8 noms de séries, la page À propos, les deux biographies et les 6 titres traduits. Propositions, à faire valider :

   | Français | Anglais | Allemand |
   |---|---|---|
   | Pas la mer à boire | Plain Sailing | Meer geht immer |
   | Belles mécaniques | Fine Machines | Edle Karossen |
   | Nocturne | Nocturne | Nocturne |
   | Photosynthese (à corriger en « Photosynthèse ») | Photosynthesis | Photosynthese |
   | Volcan de Lassen… | Lassen Volcanic Park – caldera and sulphur springs | Lassen-Volcanic-Nationalpark: Caldera und Schwefelquellen |
   | Un singe qui cherche son enfant | A monkey looking for its baby | Ein Affe sucht sein Junges |
   | Cyclistes en contre-jour dans le Marais | Cyclists against the light in the Marais | Radfahrer im Gegenlicht im Marais |

2. **Règle de publication** : une version linguistique n’est annoncée (hreflang, sitemap) et indexable que si son contenu principal est traduit. Pour une photo, cela veut dire son titre, et sa légende si elle en a une.
   - Dans `server/i18n.js` :
     ```js
     const filled = (row, field, l) => typeof row?.[column(field, l)] === 'string' && row[column(field, l)].trim() !== '';
     // Langue réellement servie par pick() (repli compris), pour poser lang="…" sur le texte.
     export const pickLang = (row, field, lang) => (FALLBACK[lang] || FALLBACK.fr).find(l => filled(row, field, l)) || null;
     // Langues où le contenu principal existe : le français toujours, les autres si chaque champ rempli en français l'est aussi.
     export const readyLangs = (row, fields) => LANGS.filter(l => l === 'fr' || fields.every(f => !filled(row, f, 'fr') || filled(row, f, l)));
     ```
   - Dans `server/repo.js` (`decorate`, l.10-13), calculer ces valeurs sur la ligne brute :
     ```js
     langs: readyLangs(p, ['title', 'legend']),
     langOf: { title: pickLang(p, 'title', lang), legend: pickLang(p, 'legend', lang), category: pickLang(p, 'category', lang) },
     ```
   - Dans `views/layout.eta:18`, remplacer `it.langs.forEach` par `(it.alternates || it.langs).forEach`.
   - Dans la route photo, passer `alternates: photo.langs`. Si `!photo.langs.includes(lang)`, ajouter `reply.header('x-robots-tag', 'noindex, follow')`. La page reste accessible aux visiteurs, mais sort des moteurs. **Ne pas** poser de canonique vers la page française en même temps que le noindex : ce sont deux signaux contradictoires.
   - Dans le sitemap, n’écrire chaque photo que dans `photo.langs`, avec des `xhtml:link` limités à ces langues.
   - Appliquer la même règle aux séries (nom et introduction), aux voyages, à À propos et au futur carnet.
   - Pour un titre volontairement identique dans toutes les langues (*The Grapes of Wrath*, *Bay Area*, *Beetle*), il suffit de le recopier dans les champs anglais et allemand.
3. **Attribut `lang` sur les replis** (RGAA 8.7, et utile aux moteurs) :
   ```eta
   <% const langAttr = l => (l && l !== it.lang ? ` lang="${l}"` : ''); %>
   <h1<%~ langAttr(p.langOf.title) %>><%= p.title %></h1>
   ```
   Faire de même pour la légende, le nom de série, les titres de la grille et le texte alternatif. Dans ce dernier cas, poser `lang` sur l’`<img>`.
4. **Admin** : une proposition de LibreTranslate garde l’état « à relire » tant que l’auteur ne l’a pas modifiée ou cochée « relue ». Elle ne compte pas comme une traduction pour la règle du point 2. Ajouter une file « Traductions à relire » dans À valider, en commençant par les titres, qui sont courts.
5. **Priorités** : l’anglais pour la Californie, l’allemand pour la Bavière (Munich, Tegernsee).

**Indicateur.**
- Inspection d’URL sur 3 adresses `/en/photo/…` traduites : la canonique choisie par Google est celle déclarée.
- Aucune adresse `/en/` ou `/de/` non traduite dans le sitemap.

#### SEO-07 · Légendes, lieux et textes alternatifs trop pauvres pour la longue traîne et Google Images

**Impact fort · effort M · les deux**

**Constat**
- **Légendes** : absentes, ou purement techniques (« Longue exposition de 30 sec au Nikon Z 7ii + 24-120 f4 »). Une page photo compte environ 146 mots, surtout de l’interface.
- **Noms propres mal écrits** : « Saint Malo », « Saint lunaire », « Canal Saint Martin », « le marais ». « Alley of the giants, California » désigne en fait **Avenue of the Giants**. On lit « Caldeira » en anglais.
- **Coquilles** : « Photosynthese », « Eclosion », « Féérie », « énergetique », « A-fleurissage ».
- **Classement** : « Vue sur l’île de Cézembre » (Dinard) est rangée dans « Super Urbain ».
- **Texte alternatif** : il reprend le titre (`server/picture.js:7`), d’où des `alt` purement poétiques : « Fractales », « Beetle », « Boule de feu ». Les descriptions Florence-2 relues (`photo_descriptions.text_fr/en/de`) ne servent jamais d’alternative.
- **IPTC** : il n’y a ni `dc:title`, ni `dc:description`, ni lieu.
- **EXIF** : les données utiles (Nikon Z 7II, 24-120 mm f/4, 30 s) sont dans les fichiers, mais pas sur la page.

**Preuve.** `ux-data/prod-front-bureau/photo-sillon-saint-malo.json`, `photo-dsc7561-sans-titre.json`, `photo-skyline-en.json`, `accueil.json` ; `server/picture.js:7` ; `server/images.js:63-74` ; `server/db/migrations/039_descriptions.sql`.

**Correction**
1. **Une charte de légende, dans l’aide** (`docs/aide/03-photos.md`) :
   - 2 à 4 phrases : quoi, où exactement (nom officiel du lieu et commune), quand, comment ou pourquoi ;
   - la ligne technique à part ;
   - des lieux normalisés : « Saint-Malo », « canal Saint-Martin », « le Marais » ;
   - la description de Florence-2 seulement comme point de départ.

   Exemple pour « Depuis le Nick vers Cézembre », à valider par Julien : « Depuis la pointe du Nick, à Saint-Lunaire, le regard file vers l’île de Cézembre et le phare du Grand Jardin, à l’entrée de la rade de Saint-Malo. Les bruyères du premier plan, laissées floues, cadrent la mer. »
2. **Un champ « Ce que montre la photo » (texte alternatif)**, par langue, de 80 à 140 caractères : ce qu’on voit, puis le lieu. Il est pré-rempli par la description Florence-2, que l’auteur relit.
   ```sql
   ALTER TABLE photos ADD COLUMN alt    TEXT NOT NULL DEFAULT '';
   ALTER TABLE photos ADD COLUMN alt_en TEXT NOT NULL DEFAULT '';
   ALTER TABLE photos ADD COLUMN alt_de TEXT NOT NULL DEFAULT '';
   ```
   Il faut aussi passer `alt` par `pick()` dans `decorate`, et appeler `picture(p, { …, alt: p.alt || p.title })` dans `views/photo.eta:9`. Les vignettes gardent `alt=""`, car leur titre est voisin : c’est le bon choix d’accessibilité.
3. **Une « fiche technique » sous la légende** : boîtier, objectif, focale, ouverture, vitesse, ISO. Ces données sont lues une seule fois à l’import (`shootingTags`, `server/images.js`) et gardées en base.
4. **Des repères « à vérifier », non bloquants**, dans le circuit de publication (`server/readiness.js`) :
   - légende de moins de 15 mots ;
   - lieu non reconnu ;
   - titre non traduit ;
   - adresse de type `dsc…` ;
   - texte alternatif vide.
5. **Enrichir l’IPTC** (`rightsXmp`, `server/images.js:63`), **après SEO-13** :
   ```xml
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Le Sillon de Saint-Malo à marée haute</rdf:li></rdf:Alt></dc:title>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">À marée haute, la mer bat la digue du Sillon…</rdf:li></rdf:Alt></dc:description>
   <Iptc4xmpCore:Location>Le Sillon</Iptc4xmpCore:Location>
   <photoshop:City>Saint-Malo</photoshop:City>
   <photoshop:State>Bretagne</photoshop:State>
   <photoshop:Country>France</photoshop:Country>
   ```
   Il faut déclarer l’espace de noms `xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"`.

**Effort.** Compter environ 5 minutes de rédaction par photo, soit 4 heures pour les 44.

**Indicateur.**
- 44 légendes sur 44 d’au moins 2 phrases.
- 100 % des photos avec un texte alternatif dédié.
- Dans la Search Console, avec le filtre « Images », au moins 10 requêtes contenant un nom de lieu sous 3 mois.

### Impact moyen

#### SEO-08 · 11 adresses tirées des noms de fichiers, 2 séries aux adresses périmées, aucune redirection

**Impact moyen · effort M · les deux · urgent : le site n’a encore presque aucun lien**

**Constat**
- 11 photos publiées ont une adresse en `/photo/dsc…-dxo` : « Depuis le Nick vers Cézembre », « Alley of the giants », « Un tapis de fleurs dans les Alpes »…
- Deux séries ont une adresse qui ne correspond plus à leur nom : `/serie/panoramas` affiche « Anthropocène », `/serie/fleurs` affiche « Photosynthese ».
- **Cause** : à l’import, le titre provisoire vient du nom de fichier (`titleFromFilename`), et l’adresse en dérive. La fiche photo renvoie ensuite le champ « Adresse » pré-rempli (`views/admin/photo.eta:48`) : changer le titre ne change donc plus l’adresse (`checkedSlug`, `server/admin-repo.js:119`). Seule la vue « Compléter le lot » la fait suivre, et seulement pour un brouillon (l.228).
- Changer l’adresse d’une photo publiée envoie l’ancienne en 404. L’aide le dit (« casse les anciens liens partagés »), mais il n’existe ni historique ni redirection.

**Preuve.** `ux-data/prod/sitemap.xml` ; `server/admin-repo.js:18`, `:119-125`, `:181-207`, `:228` ; `server/routes/public.js:245` (`callNotFound`) ; `docs/aide/03-photos.md:109`.

**Correction** (dans cet ordre)
1. **Migration** :
   ```sql
   -- Anciennes adresses : une 301 vers l'adresse actuelle, pour les liens partagés et les moteurs.
   CREATE TABLE slug_history (
     kind       TEXT NOT NULL CHECK (kind IN ('photo', 'serie')),
     old_slug   TEXT NOT NULL,
     target_id  INTEGER NOT NULL,
     changed_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (kind, old_slug)
   );
   ```
   Dans `updatePhoto` (l.207) et `saveCategory` (l.325) : si l’adresse change, faire `INSERT OR REPLACE INTO slug_history (kind, old_slug, target_id) VALUES (?, ?, ?)`, puis `DELETE FROM slug_history WHERE kind = ? AND old_slug = ?` pour la nouvelle adresse, qui ne doit pas rediriger vers elle-même.
2. **Route** (`server/routes/public.js`, `/photo/:slug`, juste avant `callNotFound`) :
   ```js
   const moved = app.db.prepare("SELECT p.slug FROM slug_history h JOIN photos p ON p.id = h.target_id WHERE h.kind = 'photo' AND h.old_slug = ? AND p.status = 'published'").pluck().get(request.params.slug);
   if (moved) return reply.redirect(base.photoUrl(moved, filter), 301);
   ```
   Même chose pour `/serie/:slug` (vers `base.galleryUrl({ serie })`) et pour les sous-pages `/photo/:slug/partager` et `/signaler`.
3. **Corriger la cause** dans `updatePhoto`. Quand l’adresse actuelle est encore celle du titre provisoire (`p.slug === uniqueSlug('photos', titleFromFilename(p.source_name), id)`) et que le titre change, il faut la dériver du nouveau titre, même pour une photo publiée (la 301 couvre l’ancienne). Dans la fiche, afficher sous le champ : « Adresse suggérée : depuis-la-pointe-du-nick-vers-cezembre (l’ancienne sera redirigée) ».
4. **Renommer maintenant**, une fois les points 1 et 2 en ligne :

   | Actuelle | Proposée |
   |---|---|
   | dsc7561-dxo | depuis-la-pointe-du-nick-vers-cezembre |
   | dsc7639-dxo | vue-sur-l-ile-de-cezembre-depuis-dinard |
   | dsc8662-dxo | fontaine-stravinsky-paris |
   | dsc8681-dxo | cyclistes-en-contre-jour-dans-le-marais |
   | dsc8682-dxo | en-terrasse-dans-un-jeu-d-ombres |
   | dsc4781-dxo | avenue-of-the-giants-sequoias-californie |
   | dsc-6320-dxo | volcan-de-lassen-caldeira-sources-sulfureuses |
   | dsc2158-dxo | tapis-de-fleurs-tegernsee |
   | dsc2120-dxo | singe-qui-cherche-son-petit |
   | dsc9460-dxo | aperitif-a-la-tombee-du-jour |
   | dsc0775-dxo | arbre-contoure |
   | /serie/panoramas | /serie/anthropocene |
   | /serie/fleurs | /serie/photosynthese |

   Les titres sont à corriger en même temps : « Avenue of the Giants », « Photosynthèse », « Saint-Malo ».

**Indicateur.**
- Aucune adresse `dsc` dans le sitemap.
- `curl -I` sur une ancienne adresse renvoie `301` vers la nouvelle.
- La Search Console ne signale aucune 404 sur `/photo/` (rapport Pages, « Introuvable »).

#### SEO-09 · Le logo est publié comme une photo et ouvre le diaporama

**Impact moyen · effort S · admin**

**Constat**
- « Bienvenue! Hi ! Hallo! » est publiée comme photo n°37 de la série « Plus près du ciel ». Sa description se réduit à « Julien », et la photo figure dans le sitemap en 3 langues.
- C’est la première diapositive de l’ouverture. Son titre est donc le premier H1 de l’accueil, des séries et des photographes, et l’image sert d’`og:image` à toutes ces pages.
- Son texte alternatif ne restitue pas le texte de l’image (audit RGAA, constat 17).

**Preuve.** `ux-data/seo/balises-prod-bureau.csv` (ligne `photo-logo-nicephos`) ; `ux-data/prod-front-bureau/photo-logo-nicephos.json`.

**Correction**
1. Dépublier la photo.
2. Mettre une vraie photo forte en tête de l’ouverture (Site public → Ouverture).
3. Le mot d’accueil trilingue va dans le texte d’introduction. L’image de partage de la marque (`/brand/partage-….jpg`) sert à l’accueil (SEO-04, point 3).

**Indicateur.** L’`og:image` de l’accueil n’est plus le logo. La photo-logo n’est plus dans le sitemap.

#### SEO-10 · Page photo sur mobile : LCP ≈ 3 s et TBT ≈ 400 ms, à cause du fond de carte de 1 Mo

**Impact moyen · effort S · front**

**Constat**
- La page photo est la porte d’entrée des moteurs et des liens partagés. Sa petite carte « Prise à … » charge `carte-terre-fine.svg` (1 057 Ko décodés, 230 Ko en brotli). `site.js` analyse ensuite 4 tuiles de détail avec `DOMParser` et masque le fond. Tout cela se passe au chargement, même quand la carte est hors de l’écran.
- **Mesures** (Pixel 7, 1,6 Mbit/s, processeur ×4, cache vide) :
  - avec la carte : LCP 2 964, 3 084 et 3 136 ms ; TBT 395, 416 et 451 ms ;
  - carte bloquée : LCP 2 064 et 2 144 ms ; TBT 0 ;
  - à 512 kbit/s (démo), la photo n’apparaît qu’à 7,0 s.
- Le fond léger `carte-terre.svg` (25 Ko en brotli) est déclaré dans le gabarit, mais n’est pas utilisé.
- Sur bureau, la visionneuse annonce `sizes="100vw"` alors que la hauteur limite l’image à 70 % de l’écran. Un portrait est ainsi servi 5,4 fois trop large (audit RGESN, C4).
- Pour Google, les Core Web Vitals comptent à travers les données terrain (CrUX). Le site n’en a pas encore : l’enjeu immédiat est l’expérience de celui qui arrive.

**Preuve.** `ux-data/prod/seo/cwv-prod-out.json` et `cwv-prod-out2.json` ; `views/photo.eta:9`, `:27`, `:31`, `:33` ; `views/trip.eta:27-29` ; `public/js/site.js:526-549`.

**Correction**
1. Dans `views/photo.eta:31` et `:33`, ainsi que `views/trip.eta:27-29` : remplacer `fine` par `terre`. Mettre `data-base` aussi sur la couche des frontières, puisque les tuiles contiennent les leurs. Dans `site.js`, remplacer `base.setAttribute('display', 'none')` par :
   ```js
   svg.querySelectorAll('[data-base]').forEach(b => b.setAttribute('display', 'none'));
   ```
2. Dans `public/js/site.js:526`, ne charger les tuiles qu’à l’approche de l’écran :
   ```js
   const whenNear = (el, fn) => {
     if (!('IntersectionObserver' in window)) return fn();
     const io = new IntersectionObserver(es => {
       if (es.some(e => e.isIntersecting)) { io.disconnect(); (window.requestIdleCallback || setTimeout)(fn); }
     }, { rootMargin: '300px' });
     io.observe(el);
   };
   document.querySelectorAll('[data-trip-map], [data-zoom-map]').forEach(fig => whenNear(fig, () => { /* corps actuel */ }));
   ```
3. Dans `views/photo.eta:9`, calculer `sizes` d’après le rapport de la photo :
   ```eta
   <%~ it.picture(p, { sizes: `min(92vw, ${(70 * p.width / p.height).toFixed(1)}vh)`, eager: true }) %>
   ```
4. Sans JavaScript, la côte sera plus grossière à l’échelle d’une ville : c’est le prix accepté pour l’instant. Pour aller plus loin (audit RGESN, C3) : écrire côté serveur les 1 à 3 tuiles utiles, ce qui fonctionne aussi sans JavaScript.

**Indicateur.** Avec `outils/seo-cwv.mjs` sur mobile : LCP < 2,5 s et TBT < 100 ms sur 3 passes. Ensuite, le rapport « Core Web Vitals » de la Search Console, dès qu’il a des données.

#### SEO-11 · Maillage interne : la page photo ne mène ni à sa série, ni au voyage, ni au reste du site

**Impact moyen · effort S · front**

**Constat**
- Sur la page photo :
  - la ligne « N°11 · Pas la mer à boire · Julien · Saint Malo… » relie le photographe, mais pas la série ;
  - la page n’a ni fil d’Ariane, ni menu, ni pied de page (Droits, Mentions légales) ;
  - seul « Fermer » ramène au site.
- Les 44 pages photo ne transmettent donc rien aux pages série.
- La page photo ne renvoie pas non plus vers son voyage (en démo, « Miradouro » ne mène pas à « Lisbonne et Porto »).
- Sur `/carte`, les villes ne sont que des ancres.

**Preuve.** `views/photo.eta:13` ; `ux-data/prod/seo/photo.html` (26 liens, aucun `/serie/…`) ; `ux-data/demo-front-bureau/photo-miradouro.json` ; audit RGAA, constat 11.

**Correction**
1. `views/photo.eta:13` :
   ```eta
   · <a href="<%= it.galleryUrl({ serie: p.category_slug }) %>"<%~ p.langOf?.category && p.langOf.category !== it.lang ? ` lang="${p.langOf.category}"` : '' %>><%= p.category %></a> ·
   ```
2. Un fil d’Ariane visible au-dessus du titre (Nicephos › Pas la mer à boire › photo), doublé du `BreadcrumbList` de SEO-05.
3. Pied de page : `<%~ include('./footer', it) %>`, en version compacte sous « À proximité ». Dans la barre du haut, l’emblème (lien vers l’accueil) et une loupe (RGAA 12.1).
4. « Cette photo fait partie du voyage … » quand un voyage publié la contient.
5. Sur `/carte`, sous chaque ville, les liens vers ses photos (déjà présents dans la liste) et, plus tard, vers sa page de lieu.

**Indicateur.** Chaque page photo contient un lien vers sa série. Dans la Search Console, rapport Liens → « Pages les plus liées en interne » : les séries remontent.

#### SEO-12 · Redirection automatique de langue : le pays l’emporte sur le navigateur, sur toutes les pages ; les liens de langue ne sont pas explorables

**Impact moyen · effort S · front**

**Constat**
- Sur chaque page française, un visiteur sans cookie reçoit une 302 vers `/en/` ou `/de/`, selon `detectLang()`.
- La fonction regarde d’abord le pays. Hors des pays de la liste `SEVERAL`, elle renvoie « en », quelle que soit la langue du navigateur. Un francophone à Londres, à New York ou à Madrid qui clique sur un résultat Google `/photo/x` est donc envoyé sur `/en/photo/x`.
- Googlebot n’est pas touché. Mais cette redirection contredit le ciblage hreflang de Google, qui déconseille les redirections automatiques selon la langue supposée.
- Les liens de langue passent par `/langue/…`, en `rel="nofollow"` et interdit par robots.txt. Il n’existe donc aucun lien explorable entre les versions.
- Sur téléphone, la liste des langues sort de l’écran (audit RGAA, constat 2).

**Preuve.** `server/i18n.js:52-59` ; `server/routes/public.js:158-170` ; `views/langs.eta:6`.

**Correction**
1. `server/i18n.js`, `detectLang` :
   ```js
   export function detectLang({ country = 'XX', acceptLanguage = '' } = {}) {
     // La langue du navigateur d'abord : un francophone à Londres reste en français, une germanophone à Madrid passe en allemand.
     const first = browserLangs(acceptLanguage).find(l => LANGS.includes(l));
     if (first) return first;
     const c = String(country || 'XX').toUpperCase();
     if (FRANCOPHONE.has(c)) return 'fr';
     if (GERMANOPHONE.has(c)) return 'de';
     return 'en';
   }
   ```
2. `server/routes/public.js:159`, dans le hook. Ne rediriger que l’accueil, et jamais quand le visiteur navigue déjà dans le site :
   ```js
   if (request.url.split('?')[0] !== '/') return;
   const own = new URL(app.config.publicUrl).host;
   try { if (request.headers.referer && new URL(request.headers.referer).host === own) return; } catch { /* Referer illisible : on continue */ }
   ```
3. `views/langs.eta:6` : des liens directs, explorables :
   ```eta
   <a href="<%= it.localize(it.here, l) %>" hreflang="<%= l %>" lang="<%= l %>" data-lang="<%= l %>"…>
   ```
   `site.js` pose le cookie `langue` au clic. La route `/langue/` reste en place pour les anciens liens.
4. Mettre à jour les tests de `detectLang`.

**Indicateur.** Avec curl, `Accept-Language: fr-FR` et `CF-IPCountry: GB` : 200 sur `/photo/x`. Plus aucune 302 sur une page profonde.

#### SEO-13 · Adresses d’images instables : changer un réglage renomme toutes les images, et les anciennes répondent 404

**Impact moyen · effort S · front**

**Constat**
- Le nom des variantes contient une empreinte des réglages : filigrane, mode EXIF, nom de l’auteur, nom du site (`server/variants.js:75-78`).
- `/media` ne sert que l’empreinte courante (`server/routes/media.js:14-18`). Toute modification change donc l’adresse de toutes les images, et les anciennes répondent 404.
- Google Images indexe l’adresse de l’image : les positions acquises et les épingles Pinterest (paramètre `media`) sont perdues jusqu’à la prochaine exploration.
- 3 empreintes coexistent déjà en production (`5348f47c`, `1a225af9`, `2a46625b`) : les réglages ont changé au moins deux fois.
- SEO-03, SEO-07 et la décision sur le filigrane (SEO-17) changeront encore l’empreinte.

**Preuve.** `server/routes/media.js:14-24` ; `server/variants.js:75-78` ; `ux-data/prod/seo/home.html`.

**Correction.** Dans `server/routes/media.js`, une 301 vers la variante actuelle :
```js
import { VARIANT_RE, variantName, widthsFor } from '../images.js';
const current = app.db.prepare("SELECT file, width, status, variant_key FROM photos WHERE file >= ? || '.' AND file < ? || '/'");

app.get('/media/:name', async (request, reply) => {
  if (lookup(request.params.name) === 'published') return reply.sendFile(request.params.name, dir, { maxAge: '365d', immutable: true });
  // Ancienne empreinte (réglage de filigrane ou d'EXIF changé) ou largeur disparue : 301 vers la variante actuelle.
  const m = VARIANT_RE.exec(request.params.name);
  const p = m && current.get(m[1], m[1]);
  if (!p || p.status !== 'published') return reply.callNotFound();
  const ws = widthsFor(p.width);
  const w = ws.find(x => x >= Number(m[3])) ?? ws.at(-1);
  const target = variantName(p.file, w, m[4], p.variant_key);
  if (target === request.params.name) return reply.callNotFound();
  return reply.header('cache-control', 'public, max-age=86400').redirect(`/media/${target}`, 301);
});
```
Les photos dépubliées continuent de répondre 404.

**Indicateur.** Une ancienne adresse `…-5348f47c-2000.webp` répond `301`, puis `200`.

#### SEO-14 · Sitemap sans images, sans x-default, avec un lastmod partiel

**Impact moyen · effort S · front**

**Constat**
- Le sitemap n’a pas d’espace de noms `image`. Les images, qui sont le cœur du site, ne sont signalées que par les pages, en 1 280 px.
- Les pages déclarent un x-default, mais pas le sitemap.
- `lastmod` n’existe que pour l’accueil et les photos (135 adresses sur 180).

**Preuve.** `ux-data/prod/sitemap.xml` ; `server/routes/public.js:113-134`.

**Correction** (`server/routes/public.js`)
```js
const urlset = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
const links = (loc, langs = LANGS) => [
  ...langs.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(base + localize(loc, l))}"/>`),
  `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(base + loc)}"/>`,
].join('');
const image = p => p ? `<image:image><image:loc>${xml(`${base}/media/${variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)}`)}</image:loc></image:image>` : '';
```
- Chaque entrée de `pagesList` porte `image` (la photo, ou la couverture de la série) et `langs` (SEO-06).
- `lastmod` d’une série ou d’un photographe = le `updated_at` le plus récent de ses photos publiées.
- Seule la balise `image:loc` est utile : Google ignore les autres balises du sitemap d’images depuis 2022.

**Indicateur.** Dans la Search Console, le sitemap affiche des images découvertes, et le rapport Pages ne montre pas d’erreur hreflang.

#### SEO-15 · Cartes de partage : WebP sans dimensions ni texte, image de l’accueil sur les séries

**Impact moyen · effort S · front**

**Constat**
- `og:image` pointe vers la variante WebP de 2 000 px (166 Ko). LinkedIn et certains clients de messagerie lisent mal le WebP.
- Il n’y a ni `og:image:width` et `og:image:height`, ni `og:image:alt`, ni `twitter:image:alt`, ni `og:locale:alternate`.
- `og:type` vaut toujours `website`.
- La description envoyée à Pinterest se limite à « titre · Nicephos ».

**Preuve.** `views/layout.eta:22-33` ; `server/routes/public.js:213`, `:258` ; HEAD de la variante 2000 : `content-type: image/webp`, 166 652 octets.

**Correction**
1. Une variante JPEG de 1 200 px réservée au partage, produite avec les autres, sur le modèle de `giftJpeg` (`server/routes/public.js:56-58`).
2. `views/layout.eta` :
   ```eta
     <meta property="og:type" content="<%= it.ogType || 'website' %>">
   <% it.langs.filter(l => l !== lang).forEach(l => { %>  <meta property="og:locale:alternate" content="<%= it.locales[l] %>">
   <% }) %>
   <% if (ogImage) { %>
     <meta property="og:image" content="<%= ogImage %>">
   <% if (it.ogImageWidth) { %>  <meta property="og:image:width" content="<%= it.ogImageWidth %>">
     <meta property="og:image:height" content="<%= it.ogImageHeight %>">
   <% } if (it.ogImageAlt) { %>  <meta property="og:image:alt" content="<%= it.ogImageAlt %>">
     <meta name="twitter:image:alt" content="<%= it.ogImageAlt %>">
   <% } %>  <meta name="twitter:card" content="summary_large_image">
   <% } %>
   ```
3. `ogType: 'article'` pour les voyages et le carnet, avec `article:published_time`.
4. Pinterest : la description est la première phrase de la légende, avec le lieu (`server/share.js`).

**Indicateur.** L’outil de débogage de partage de Facebook et l’inspecteur de publications de LinkedIn affichent l’image du premier coup.

#### SEO-16 · Aperçus d’images en grand non autorisés (`max-image-preview` absent)

**Impact moyen · effort S · front · décision des auteurs**

**Constat**
- Aucune page n’a de meta robots.
- Sans `max-image-preview:large`, Google peut se limiter à de petits aperçus. Discover n’affiche de grandes images (au moins 1 200 px) qu’avec ce réglage, et les futurs billets du carnet en dépendront.

**Correction.** Si les auteurs l’acceptent, ajouter dans `views/layout.eta` :
```eta
  <meta name="robots" content="max-image-preview:large">
```
Le noindex par en-tête des pages utilitaires reste prioritaire. Un aperçu en grand reste un lien vers le site, et l’IPTC accompagne l’image.

#### SEO-17 · Filigrane en plein cadre : un frein au clic dans Google Images, Discover et Pinterest

**Impact moyen · effort S · admin · décision des auteurs**

**Constat**
- Le rhinocéros et le logotype « NICEPHOS PHOTOGRAPHY GALLERY » occupent le centre de chaque image, vignettes de 640 px comprises.
- Dans une grille Google Images ou Pinterest, la vignette ressemble à un aperçu de banque d’images, ce qui fait baisser les clics et les enregistrements.
- L’IPTC, le badge « Licenciable » et les preuves d’antériorité horodatées protègent déjà les photos.

**Correction.** Proposer une signature discrète en coin, par exemple « © Julien [Nom] · nicephos.art », sur 12 à 15 % de la largeur et à 40–60 % d’opacité. On peut aussi réserver le plein cadre à la seule variante de 2 000 px.
- Le recalcul se fait la nuit (audit RGESN, C15).
- Il ne faut le lancer **qu’après SEO-13**.
- Mesurer l’effet avant et après dans la Search Console : onglet Images, impressions et taux de clic.

### Impact faible

#### SEO-18 · Recherche : page vide indexable, noindex et canonique contradictoires

**Impact faible · effort S · front**

**Constat.** `/recherche` sans requête est indexable, avec ses hreflang, alors qu’elle ne contient qu’un formulaire. `/recherche?q=…` envoie à la fois un noindex et une canonique vers `/recherche`.

**Correction** (`server/routes/public.js:326-329`)
```js
reply.header('x-robots-tag', 'noindex, follow');
// …
canonical: q ? undefined : '/recherche',
```

#### SEO-19 · robots.txt : deux groupes `User-agent: *`

**Impact faible · effort S · hébergement**

**Constat**
- Le bloc géré par Cloudflare (`Content-Signal`, environ 30 robots d’IA bloqués) précède le groupe de l’application (`Disallow: /admin`, `/auth/`, `/partage/`, `/langue/`, `/pour-vous/`).
- Google et les robots conformes à la RFC 9309 fusionnent les deux groupes. Des robots plus anciens ne lisent que le premier.
- `Content-Signal` est ignoré par Google. Bloquer `Google-Extended` et `GoogleOther` n’a aucun effet sur l’exploration, l’indexation, le classement ni les AI Overviews. Pour ces derniers, seuls `nosnippet` ou `max-snippet` agissent.

**Preuve.** `ux-data/prod/robots.txt` (l.30 et l.131) ; `server/routes/public.js:109-110`.

**Correction.** Garder un seul groupe `*`.
- Désactiver le robots.txt géré par Cloudflare (AI Crawl Control).
- Reprendre dans `server/routes/public.js:110` la ligne `Content-Signal` actuelle, et la liste des robots d’entraînement (`ux-data/prod/robots.txt`, l.53-129), sous cette forme :
  ```
  User-agent: *
  Content-Signal: …(ligne actuelle)
  Disallow: /admin
  Disallow: /auth/
  Disallow: /partage/
  Disallow: /langue/
  Disallow: /pour-vous/
  Allow: /

  User-agent: GPTBot
  Disallow: /
  (… même chose pour chaque robot d’entraînement de la liste actuelle …)

  Sitemap: https://www.nicephos.art/sitemap.xml
  ```
- Ne jamais interdire `/media/`, `/static/` ni `Googlebot-Image`.

#### SEO-20 · Cloudflare réécrit le lien de partage par e-mail et injecte un script

**Impact faible · effort S · hébergement**

**Constat**
- L’option « Email Address Obfuscation » de Cloudflare remplace `mailto:` par `/cdn-cgi/l/email-protection#…` et ajoute `email-decode.min.js` en fin de page.
- Sans JavaScript, le partage par e-mail ouvre une page Cloudflare, et les Mentions légales affichent « [email protected] ».
- Les robots découvrent ces liens `/cdn-cgi/`.

**Correction.** Désactiver Scrape Shield → Email Address Obfuscation dans Cloudflare. À défaut, entourer le lien de `<!--email_off-->` et `<!--/email_off-->` dans `views/_share.eta:14`.

#### SEO-21 · Barre oblique finale : 404 au lieu d’une 301

**Impact faible · effort S · front**

**Constat.** `/a-propos/` et `/photo/…/` répondent 404 : un lien externe mal recopié est perdu.

**Correction** (`server/app.js`, hook `onRequest`)
```js
app.addHook('onRequest', async (request, reply) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  const [path, query] = request.url.split(/\?(.*)/s);
  // Jamais « //… » : la redirection deviendrait une redirection ouverte vers un autre site.
  if (path.length > 1 && path.endsWith('/') && !path.startsWith('//') && !/^\/(en|de)\/$/.test(path)) {
    return reply.redirect(path.replace(/\/+$/, '') + (query ? `?${query}` : ''), 301);
  }
});
```

#### SEO-22 · HSTS sans `includeSubDomains`, HTML sans ETag

**Impact faible · effort S · hébergement et front**

**Correction**
1. Quand tous les sous-domaines seront en HTTPS : `max-age=63072000; includeSubDomains; preload` (`server/app.js:269`, comme le prévoit le commentaire), puis inscription sur hstspreload.org.
2. Ajouter `@fastify/etag` (ETag faible) pour les pages publiques : Googlebot pourra alors recevoir des 304.

#### SEO-23 · Poids des pages galerie et carte

**Impact faible · effort M · front**

**Constat** (détail dans l’audit RGESN, C1, C2, C5, C6, C7)
- Les 5 diapositives invisibles de l’ouverture pèsent 820 Ko, même sans JavaScript.
- La carte charge 1,1 Mo de vignettes de 640 px pour des pastilles de 26 unités. Son LCP mobile est de 5,8 s.
- L’emblème est un PNG de 1 600 px (93 Ko).
- La police Cormorant est préchargée alors que le thème de production ne l’emploie pas.

**Correction.** Reprendre les corrections de l’audit RGESN :
- première diapositive seule dans le HTML ;
- variantes de 160 et 320 px ;
- emblème à la taille utile ;
- préchargement des polices selon le thème.

Côté SEO, cela ne pèse que sur l’expérience. Cela ne gêne ni l’exploration ni l’indexation.

#### SEO-24 · Noms de fichiers d’images en UUID, adresses françaises sous `/en/` et `/de/`

**Impact faible · effort M · front · facultatif**

**Constat**
- Le nom de fichier est un signal faible pour Google Images. Ici, c’est un UUID : le signal est nul.
- Les pages fixes traduites gardent des adresses françaises : `/en/a-propos`, `/de/mentions-legales`.

**Correction** (priorité faible)
1. Une adresse d’image qui commence par le titre de la photo, du type `/media/<slug>--<uuid>-<clé>-<l>.<fmt>`. La partie `<slug>--` serait ignorée par le serveur (`VARIANT_RE` avec préfixe facultatif), si bien qu’un renommage ne casse rien. À faire en même temps que SEO-13.
2. Des adresses traduites pour les pages fixes (`/en/about`, `/de/impressum`), avec une 301 depuis les adresses actuelles.

---

## Stratégie éditoriale et de visibilité

### Positionnement

Nicephos est une galerie d’auteurs, sans notoriété, avec 44 photos. On gagne là où la concurrence est faible et où l’intention est artistique. Les cibles sont, dans l’ordre :
1. **La marque et les auteurs.** Il faut que « Nicephos » soit reconnu comme une entité distincte de « Nicéphore » (Niépce). Pour cela :
   - le même nom partout : Instagram, Pinterest, Bluesky ;
   - `Organization` avec logo et `sameAs` ;
   - « Nicephos » et « photographie » dans le titre de l’accueil.
2. **Les lieux, dans Google Images** : des requêtes précises, à faible volume, peu disputées. Sur ces lieux, les concurrents sont les offices de tourisme, Wikipédia, les sites de voyage et Instagram. On les bat dans Google Images, et avec des guides tirés d’une expérience vécue.
3. **Plus tard, les tirages** (« tirage photo Saint-Malo », « San Francisco skyline print »).

### Mots-clés par langue

Ce sont des cibles d’intention. Les volumes restent à confirmer dans la Search Console.

| Intention | Français | Anglais | Allemand | Page qui répond |
|---|---|---|---|---|
| Marque | nicephos ; nicephos photographie ; nicephos.art | nicephos photography | nicephos Fotografie | Accueil, À propos |
| Auteurs | « Julien [Nom] photographe » ; « Sébastien [Nom] photographe » | « … photographer » | « … Fotograf » | `/auteur/…` |
| Côte d’Émeraude | Sillon Saint-Malo marée haute ; pointe du Nick Saint-Lunaire ; île de Cézembre ; phare du Grand Jardin ; grandes marées Saint-Malo photo | Saint-Malo high tide ; Emerald Coast Brittany photography | Saint-Malo Flut ; Smaragdküste Bretagne | Photos, série « Pas la mer à boire », voyage, guide |
| Paris | fontaine Stravinsky ; canal Saint-Martin photo ; le Marais photo de rue | Stravinsky Fountain Paris ; Canal Saint-Martin | Strawinsky-Brunnen Paris | Photos, « Super Urbain » |
| Californie | séquoias Avenue of the Giants ; parc volcanique de Lassen ; road trip Californie photos | Avenue of the Giants redwoods ; Lassen Volcanic caldera ; San Francisco skyline photo ; Monterey whales | Avenue of the Giants Mammutbäume ; Kalifornien Roadtrip Fotos | Photos, voyage Californie (anglais d’abord) |
| Bavière | Tegernsee photo ; Munich | Lake Tegernsee ; Munich | Tegernsee Foto ; Bad Wiessee ; München Fotografie | Photos, voyage Bavière (allemand d’abord) |
| Anjou, île de Ré | Angers de nuit photo ; Grez-Neuville ; Ars-en-Ré photo | Île de Ré | Île de Ré Fotos | Photos, page de lieu Angers |
| Technique (carnet) | pose longue mer ; photographier les grandes marées ; macro gouttes d’eau | long exposure seascape | Langzeitbelichtung Meer | Billets « technique » |
| Plus tard (boutique) | tirage photo Saint-Malo ; photo Cézembre à encadrer | San Francisco skyline print | Tegernsee Bild kaufen | Pages photo devenues produits, `/tirages` |
| **À ne pas viser** | photographe Angers ; photographe Saint-Malo ; photo de nuit (générique) ; fond d’écran | photographer Paris ; wallpaper | Fotograf München | — |

Pourquoi écarter « photographe <ville> » : les recherches du 16/10 sont dominées par des professionnels du mariage et du portrait, qui ont une fiche Google, et par des annuaires. Les thèmes génériques sont le terrain des banques d’images (Adobe Stock, Shutterstock, Unsplash, Pexels) et des tutoriels.

**Où placer chaque lieu** : son nom officiel dans le titre de page, la légende, le texte alternatif, la ville de la carte et le `Place` du JSON-LD. Jamais une liste de mots-clés.

### Pages à créer ou enrichir

| Page | Aujourd’hui | À faire | Quand |
|---|---|---|---|
| Accueil | « Nicephos », devise, 6 H1 | Titre et description (titres-meta.md), H1 unique, première diapositive = une vraie photo | Vague 0 et 1 |
| Séries (8) | Copies de l’accueil | H1, sous-titre, introduction de 80 à 150 mots ×3, couverture | Vagues 1 et 2 |
| Photographes (2) | Copies de l’accueil, pas de biographie | Portrait, biographie de 120 à 250 mots ×3, lieux de prédilection, liens | Vague 2 |
| Pages photo (44) | Titre, légende courte ou absente | Légende de 2 à 4 phrases, lieu normalisé, texte alternatif, fiche technique, liens vers la série et le voyage | Vague 2 |
| À propos | Devise en H1, traduction approximative | « Sébastien et Julien, deux regards », démarche, matériel, contact, déclaration d’écoconception (RGESN) | Vague 2 |
| Voyages | `/voyages` répond 404 en production | Publier « Côte d’Émeraude, octobre 2026 » et « Californie, août 2026 » (introduction de 150 à 300 mots, un court texte par jour). Il faut ajouter un champ de texte à `trip_days` | Vague 2 |
| Pages de lieu | — | `/lieu/<ville>` dès qu’un lieu compte au moins 6 photos : Angers (10), Saint-Malo et Côte d’Émeraude (6 avec Saint-Lunaire et Dinard). Paris (4) ensuite | Vague 3 |
| Droits | Conditions d’usage | Section « Obtenir une licence » (contact, usages, délais) : c’est la page `acquireLicensePage` | Vague 1 |
| Carnet | — | Voir plus bas | Vague 3 |

Exemple d’introduction pour « Pas la mer à boire », à faire valider par Julien :
> La Côte d’Émeraude telle que Julien l’arpente : la digue du Sillon à Saint-Malo quand la marée haute frappe le mur, la pointe du Nick à Saint-Lunaire face à l’île de Cézembre, le phare du Grand Jardin sur son rocher. Des poses longues qui lissent l’eau, des contre-jours d’automne. Photos prises en octobre 2026 entre Saint-Malo, Dinard et Saint-Lunaire.

### Google Images et badge « Licenciable »

C’est le premier gisement de trafic pour une galerie. Pour l’exploiter :
- [x] Mentions IPTC/XMP dans chaque variante : créateur, droits, crédit, `WebStatement` et `LicensorURL` vers `/droits` (déjà en place).
- [ ] `ImageObject` avec `license`, `acquireLicensePage`, `creator`, `creditText` et `copyrightNotice` (SEO-05).
- [ ] Adresses d’images stables, avec une 301 au changement de réglage (SEO-13).
- [ ] Sitemap d’images (SEO-14).
- [ ] Texte alternatif dédié, légende et lieu dans le texte autour de l’image (SEO-07).
- [ ] `max-image-preview:large` (SEO-16).
- [ ] Filigrane discret (SEO-17, décision des auteurs).
- [ ] Section « Obtenir une licence » sur `/droits`, puis, avec la boutique, une page de licence dédiée.
- Ne **jamais** interdire `/media/` dans robots.txt, et ne pas mettre `noimageindex` sur les pages publiques.

Suivi : dans la Search Console, rapport Performances avec le filtre « Type de recherche : Images », et rapport « Métadonnées d’image ».

### Le carnet (blog) : ligne éditoriale

- **Rôle de chaque type de page**, avec des liens dans les deux sens. Cette règle évite qu’elles se concurrencent :
  - voyage = itinéraire et galerie ;
  - billet = récit ou guide ;
  - photo = l’image ;
  - série = le thème.
- **Formats** :
  - récit : 1 200 à 2 000 mots, 12 à 20 photos ;
  - histoire d’une photo : 400 à 700 mots ;
  - guide de lieu : 1 000 à 1 500 mots, avec carte, accès et meilleure heure ;
  - technique : 800 à 1 500 mots, avec les vrais réglages.
- **Rythme tenable** : 2 billets par mois, un long et un court. Chaque billet est signé, daté, illustré d’au moins une image de 1 200 px, et rédigé à partir d’une expérience vécue.
- **Calendrier proposé** :
  - novembre 2026 : « Côte d’Émeraude en octobre » et « Le Sillon à marée haute, 30 s de pose » ;
  - décembre : « Nos photos de 2026 » et « Choisir un tirage : papier, format, cadre » ;
  - janvier 2027 : « Californie, été 2026 » (anglais d’abord) ;
  - février : « Photographier les grandes marées à Saint-Malo » (un mois avant l’équinoxe) ;
  - mars : macro au jardin ;
  - avril : Paris (le Marais, la fontaine Stravinsky, le canal Saint-Martin) ;
  - mai : « Munich et le Tegernsee » (allemand d’abord) ;
  - juin : feu d’artifice ;
  - juillet : voitures anciennes ;
  - août : « Deux regards : comment nous choisissons nos photos » ;
  - septembre : « Angers en 10 photos » ;
  - octobre : « Un an de Nicephos ».
- **Langues** : une version anglaise ou allemande n’existe que traduite et relue (même règle que SEO-06).

### Liens entrants

Le site n’a aujourd’hui aucun lien vers son compte Instagram ni vers un autre profil. Voici d’où viendront les liens, du plus simple au plus long :
1. **Profils** : Instagram (lien en bio), Pinterest, Flickr, 500px. Ce sont aussi des `sameAs` pour le JSON-LD.
2. **Communautés** :
   - Fotocommunity pour le marché allemand ;
   - groupes Flickr par lieu ;
   - clubs et concours de la Fédération photographique de France.
3. **Presse et tourisme locaux** :
   - Ouest-France, Le Pays Malouin, Le Courrier de l’Ouest ;
   - offices de tourisme de Saint-Malo et d’Angers : proposer des photos contre un crédit avec lien.
4. **Événements** : une exposition en médiathèque ou en café, avec une page sur le site et un JSON-LD `Event`.
5. **Facultatif** : verser une ou deux photos secondaires sur Wikimedia Commons (CC BY-SA, crédit avec lien), en connaissance du compromis sur les droits. Des articles invités sur des blogs de voyage.
6. **Lettre mensuelle « Nouvelles photos »**, envoyée par le mailer du site, avec double opt-in. Elle servira aussi à annoncer la boutique.

Jamais d’achat de liens, d’échanges de liens ni d’annuaires de masse.

### Réseaux

- **Instagram.**
  - Publier sur le site d’abord, puis sur Instagram, avec le lieu et « photo complète sur nicephos.art » dans la légende.
  - Depuis juillet 2025, d’après l’annonce d’Instagram, Google peut indexer les publications publiques des comptes professionnels. La même photo sur Instagram peut alors concurrencer la page du site. Il faut donc que la page du site soit la plus riche : légende, lieu, licence.
- **Pinterest.** C’est un moteur de recherche par mots-clés.
  - Ouvrir un compte Business et revendiquer le domaine (TXT DNS).
  - Créer des tableaux par lieu et par série : « Saint-Malo & Côte d’Émeraude », « Photographie de nuit », « Californie ».
  - Écrire des descriptions d’épingle en langage naturel (SEO-15). En option, une variante verticale 2:3.

### Ce qui n’est pas pertinent aujourd’hui

- **Google Business Profile.** Deux photographes amateurs, sans accueil de clients ni prestation en personne, ne sont pas éligibles. Une boutique en ligne seule ne suffit pas non plus. À réexaminer seulement en cas de séances photo ou de vente en personne à horaires fixes.
- **Le champ de recherche dans les résultats (`SearchAction`)** : Google l’a retiré fin 2024. Inutile de le baliser.

---

## Préparer les projets à venir

### Carnet (blog)

- **Adresses** : `/carnet/<slug>`, `/en/carnet/<slug>`, `/de/carnet/<slug>`. « Carnet » plutôt que « journal », pour ne pas confondre avec le Journal de l’admin.
- **hreflang** : il faut passer par `it.alternates` (SEO-06). Aujourd’hui `views/layout.eta:18` annonce toujours les 3 langues : un billet non traduit pointerait vers une page de repli ou une 404.
- **JSON-LD** : `BlogPosting` (`exemples/jsonld-billet.json`), avec `headline`, `datePublished`, `dateModified`, `author` (Person, `url` vers `/auteur/…`), `image` d’au moins 1 200 px, `inLanguage`, et `BreadcrumbList`.
- **Sitemap** : `lastmod` = `dateModified`.
- **Flux Atom** : `/carnet/flux.xml`, avec `<link rel="alternate" type="application/atom+xml">` dans le `<head>`.
- **Pagination** : `?page=n`, avec une canonique sur elle-même, sans noindex. Pas de pages d’étiquettes (pages fines).
- **Liens** : chaque billet renvoie vers ses photos, ses séries et son voyage, et ces pages renvoient au billet.
- **Écoconception** : même chaîne d’images. Une vidéo hébergée sur place seulement si elle porte l’information. Pas d’iframe YouTube ni Instagram.

### Galeries privées (lien temporaire et mot de passe)

Il ne faut rien laisser fuiter dans les moteurs, pages comme images. Le modèle `/pour-vous/` (noindex, no-store, no-referrer, 410 à l’expiration) est le bon point de départ.
- **Préfixe dédié `/prive/`** :
  - en-têtes `X-Robots-Tag: noindex, nofollow, noarchive, noimageindex` sur le HTML et sur les images ;
  - `Cache-Control: private, no-store` ;
  - `Referrer-Policy: no-referrer`.
- **Images servies par une route authentifiée**, jamais par `/media/`. Aujourd’hui, `/media/` sert toute photo au statut `published` (`server/routes/media.js:21-24`). Une photo privée doit donc avoir un statut distinct, ou passer par une table d’accès.
- **Exclusions** : pas de sitemap, de recherche, de carte, d’« À proximité », de flux ni de lien public.
- **Partage** :
  - une `og:image` générique, pour qu’un lien partagé ne montre pas la photo ;
  - lien expiré → 410 ;
  - ni canonique ni hreflang.
- **robots.txt** : le `Disallow: /prive/` n’est pas nécessaire. Avec un Disallow, Google ne peut plus lire le noindex. Une adresse bloquée mais liée ailleurs peut alors apparaître sans contenu. C’est le mot de passe qui protège.
- **Page de saisie du mot de passe** : noindex.
  - Champ standard, avec `autocomplete="current-password"` et l’affichage du mot de passe possible (WCAG 3.3.8).
  - Pas de CAPTCHA visuel.
  - L’administration passe par Zitadel.
- **Une photo à la fois privée et publique** garde sa page publique comme canonique.

### Boutique (panier, achat, paiement, facture)

- **Une seule adresse par œuvre : la page photo devient la page produit.** Quand une photo est en vente, elle reçoit un bloc « Tirage » : formats, papier, édition, prix TTC, délai. Une page photo et une page produit séparées se disputeraient les mêmes requêtes et diviseraient les liens reçus.
- **Variantes de format** sur la même page (`?format=40x60`), avec une canonique vers la page photo.
- **JSON-LD** (`exemples/jsonld-produit.json`) :
  - `ProductGroup` (`variesBy: size`), dont chaque variante est un `Product` avec `sku` ;
  - chaque variante a une `Offer` : `price`, `priceCurrency` EUR, `availability`, `shippingDetails`, `hasMerchantReturnPolicy` ;
  - le `ProductGroup` coexiste avec l’`ImageObject` de la page.
- **Merchant Center** : fiches gratuites, flux construit sur les mêmes données. Pour des œuvres, `identifier_exists` = `no` (pas de GTIN). Les prix doivent être identiques sur la page, dans le JSON-LD et dans le flux. La livraison et les retours se déclarent dans Merchant Center (ou dans la Search Console), ou au niveau de l’`Organization`.
- **Pages hors index** : panier, commande, compte et factures en `noindex` et `Disallow: /panier`, `/commande`, `/compte`, jamais dans le sitemap. Aucune facette indexable (format, prix) : tris et filtres en `noindex, follow`.
- **Produit épuisé** : la page reste en 200, avec `availability: OutOfStock`. Une édition close passe en `SoldOut`, avec un lien vers des œuvres proches.
- **Avis** : on ne balise `AggregateRating` et `Review` que pour des avis recueillis sur le site auprès d’acheteurs réels. Jamais d’avis importés d’autres sites, jamais d’avis sur l’`Organization` elle-même.
- **Pages pivots** :
  - `/tirages` (`CollectionPage`), titrée « Tirages photo d’art : Saint-Malo, Paris, Californie · Nicephos » ;
  - « Tirages de Saint-Malo » dès que 6 photos d’un même lieu sont en vente.
- **Licences** : `acquireLicensePage` pointe ensuite vers une page de licence de la boutique.
- **Mentions** : mentions légales complètes, CGV, Impressum (SEO-03).
- **Paiement** : le script du prestataire n’est chargé que sur la page de paiement, avec une CSP élargie à cet endroit seulement (audit RGESN, C18).

---

## Plan d’action

Les vagues suivent la façon de travailler du projet : une PR par vague (ou par lot de la vague 1), un audit de contrôle avant de passer à la suivante, et la fusion sur demande.

**Outils de mesure, tous sans traceur sur le site**
- **GSC** : Google Search Console.
- **BWT** : Bing Webmaster Tools.
- **TRE** : Test des résultats enrichis.
- **Stats** : page Statistiques de l’admin, onglet Provenance. Elle compte les visites venues de google, bing ou pinterest d’après l’en-tête Referer, sans cookie ni adresse IP (`server/stats.js`).
- **CWV** : `outils/seo-cwv.mjs`.
- **curl** : relevé des en-têtes et des balises.

### Vague 0 : réglages et corrections rapides (semaine du 19 octobre)

| N° | Action | Réf. | Effort | Impact | Indicateur de réussite | Mesure |
|---|---|---|---|---|---|---|
| 0.1 | Search Console : propriété « Domaine », sitemap, inspection des 10 pages clés | SEO-01 | 30 min | fort | Propriété validée, 180 adresses découvertes | GSC |
| 0.2 | Bing Webmaster Tools par import, Crawler Hints activé | SEO-01 | 15 min | moyen | Sitemap lu par Bing | BWT |
| 0.3 | Cloudflare : obfuscation des e-mails désactivée (NEL aussi, si personne ne lit les rapports) | SEO-20 | 10 min | faible | Plus de `/cdn-cgi/` dans le HTML | curl |
| 0.4 | Titres et descriptions par gabarit, `clip()`, `titled()` | SEO-02 | S | fort | Aucun doublon, titres de 30 à 65 caractères | curl, puis taux de clic dans GSC |
| 0.5 | Fond de carte léger, chargement à l’approche, `sizes` de la visionneuse | SEO-10 | S | moyen | LCP mobile < 2,5 s, TBT < 100 ms | CWV |
| 0.6 | Recherche et filtres combinés en noindex ; x-default dans le sitemap | SEO-18, SEO-04 (point 4), SEO-14 | S | faible | En-têtes et sitemap justes | curl |
| 0.7 | Logo hors de la photothèque, première diapositive = une vraie photo | SEO-09 | S | moyen | `og:image` de l’accueil ≠ logo | curl |
| 0.8 | `max-image-preview:large`, si les auteurs l’acceptent | SEO-16 | S | moyen | Meta présente | curl |
| 0.9 | Relecture native des noms de séries et des 6 titres traduits | SEO-06 | S | fort | Plus aucun calque | Relecture |

PR « SEO, vague 0 » : 0.4 à 0.6 et 0.8. Les points 0.1 à 0.3, 0.7 et 0.9 se font sans code (réglages, admin, relecture).

### Vague 1 : technique (27 octobre au 21 novembre)

| N° | Action | Réf. | Effort | Impact | Indicateur de réussite | Mesure |
|---|---|---|---|---|---|---|
| 1.1 | Historique des adresses et 301 ; correction de l’adresse figée au titre provisoire | SEO-08 | M | moyen | Ancienne adresse → 301 | curl, rapport Pages de GSC |
| 1.2 | Renommer les 11 photos et les 2 séries (après 1.1) | SEO-08 | S | moyen | Aucune adresse `dsc` | Sitemap |
| 1.3 | Redirection des anciennes empreintes d’images | SEO-13 | S | moyen | Ancienne image → 301 → 200 | curl |
| 1.4 | JSON-LD : `layout.eta` et `server/jsonld.js` | SEO-05 | M | fort | Aucune erreur ; 44 « Métadonnées d’image » valides | TRE, GSC |
| 1.5 | Gabarit des séries et des photographes, migration 040, champs dans l’admin | SEO-04 | M | fort | Un H1 et une description propres par page | curl, GSC |
| 1.6 | Langues : `alternates`, noindex des versions non traduites, `lang` des replis, redirection, liens directs | SEO-06, SEO-12 | M | fort | Canonique retenue = déclarée | Inspection d’URL dans GSC |
| 1.7 | Sitemap : images et lastmod | SEO-14 | S | moyen | Images découvertes | GSC |
| 1.8 | Cartes de partage : JPEG 1 200 px et balises `og:` | SEO-15 | S | moyen | Aperçu du premier coup | Débogueurs Facebook et LinkedIn |
| 1.9 | Page photo : lien vers la série, fil d’Ariane, pied de page, mini-menu | SEO-11 | S | moyen | Lien vers la série sur 44 pages sur 44 | curl, rapport Liens de GSC |
| 1.10 | robots.txt en un groupe, barre oblique finale, HSTS, ETag | SEO-19, SEO-21, SEO-22 | S | faible | Rapport robots.txt sans alerte | GSC |

Lots de PR proposés :
- (a) adresses et images : 1.1 à 1.3 ;
- (b) balisage et gabarits : 1.4, 1.5, 1.7 à 1.9 ;
- (c) langues : 1.6 ;
- (d) hygiène : 1.10.

### Vague 2 : contenus (novembre et début décembre)

| N° | Action | Réf. | Effort | Impact | Indicateur de réussite | Mesure |
|---|---|---|---|---|---|---|
| 2.1 | Identité publique, biographies de 120 à 250 mots ×3, portraits, profils | SEO-03 | S par auteur | fort | 2 biographies × 3 langues | Relecture, TRE (Person) |
| 2.2 | Mentions légales complètes (avis d’un juriste) | SEO-03 | S | moyen | Éditeur, contact, responsable | Relecture |
| 2.3 | Introductions (80 à 150 mots) et sous-titres des 8 séries ×3 | SEO-04 | M | fort | 8 sur 8 | GSC (impressions des séries) |
| 2.4 | Légendes de 2 à 4 phrases et lieux normalisés pour les 44 photos (≈ 4 h) | SEO-07 | M | fort | 44 sur 44 | GSC Images (requêtes de lieu) |
| 2.5 | Textes alternatifs dédiés, à partir de Florence-2 relu | SEO-07 | M | moyen | 100 % | Relevé (curl) |
| 2.6 | Traductions relues : titres, puis légendes (anglais pour la Californie, allemand pour la Bavière) | SEO-06 | M | fort | Part des photos traduites | Sitemap, GSC par pays |
| 2.7 | Ouvrir les Voyages : Côte d’Émeraude et Californie | Stratégie | M | fort | 2 voyages en ligne, liés depuis leurs photos | GSC |
| 2.8 | Décision sur le filigrane, puis recalcul de nuit (après 1.3) | SEO-17 | S | moyen | Taux de clic Images avant et après | GSC Images |
| 2.9 | XMP enrichi : titre, description, lieu, nom complet, crédit (après 1.3) | SEO-07, SEO-03 | S | moyen | Champs présents | exiftool sur une variante |

### Vague 3 : autorité et suivi (à partir de décembre, puis en continu)

| N° | Action | Réf. | Effort | Impact | Indicateur de réussite | Mesure |
|---|---|---|---|---|---|---|
| 3.1 | Instagram (lien en bio, légendes), Pinterest Business et revendication du domaine, tableaux par lieu | Stratégie | S | moyen | Visites venues d’Instagram et de Pinterest | Stats (Provenance) |
| 3.2 | Presse et tourisme locaux, clubs, Fotocommunity | Stratégie | continu | fort | 5 domaines référents en 3 mois | Rapport Liens de GSC |
| 3.3 | Carnet : lancement, 2 billets par mois | Stratégie | L | fort | Impressions sur `/carnet/` | GSC (filtre de répertoire) |
| 3.4 | Pages de lieu (au moins 6 photos) : Angers, Côte d’Émeraude | Stratégie | M | moyen | Positions sur « <lieu> photo » | GSC |
| 3.5 | Revue mensuelle de 30 minutes : requêtes de marque, Images, pages non indexées, CWV, liens | — | S/mois | fort | Tableau de bord tenu | GSC, BWT, Stats |
| 3.6 | Cadrage SEO de la boutique et des galeries privées (adresses, données, noindex) | Projets | L | fort | Choix écrits avant le code | — |

### Calendrier sur 3 mois (19 octobre 2026 au 17 janvier 2027)

| Période | Travaux | Jalon |
|---|---|---|
| 19 au 25 oct. | Vague 0 | Search Console et Bing actifs ; PR de la vague 0 fusionnée |
| 26 oct. au 8 nov. | Vague 1, lots (a) et (b) ; renommage des adresses | Test des résultats enrichis sans erreur ; aucune adresse `dsc` |
| 9 au 22 nov. | Vague 1, lots (c) et (d) ; rédaction des biographies et des introductions | Inspection de `/en/…` conforme ; premiers chiffres dans la Search Console |
| 23 nov. au 6 déc. | Vague 2 : légendes, textes alternatifs, traductions ; voyage Côte d’Émeraude | 44 légendes ; 8 introductions |
| 7 au 20 déc. | Voyage Californie (anglais) ; Pinterest ; premier billet si le carnet est prêt | Premier bilan Search Console : Pages, Images, requêtes |
| 21 déc. au 3 janv. | Fêtes : billet « Nos photos de 2026 » ; démarches presse et clubs | — |
| 4 au 17 janv. | Bilan à 3 mois ; pages de lieu ; cadrage de la boutique | Bilan écrit, objectifs du trimestre suivant |

**Objectifs indicatifs à 3 mois.** Ils sont à réviser après les premières données.
- « nicephos » en première position en France, en Allemagne et au Royaume-Uni.
- Au moins 90 % des adresses françaises du sitemap indexées.
- Les 44 photos dans le rapport « Métadonnées d’image ».
- Des impressions Images en hausse d’un mois sur l’autre.
- Au moins 10 requêtes de lieu avec des impressions.
- Au moins 5 domaines référents.

### Relevé rapide après chaque PR

```sh
for u in / /en/ /serie/bord-de-mer /auteur/julien /photo/le-sillon-de-saint-malo-a-maree-haute '/recherche?q=mer'; do
  echo "== $u"; curl -s -D - -A 'NicephosAudit-scan' "https://www.nicephos.art$u" -o /tmp/p.html | grep -i '^x-robots-tag'
  grep -oE '<title>[^<]*|name="description" content="[^"]*|rel="canonical" href="[^"]*|hreflang="[a-z-]*"|application/ld\+json|<h1[^>]*>[^<]*' /tmp/p.html
done
```

---

## Ce qu’il ne faut pas faire

- **Acheter des liens**, échanger des liens, s’inscrire dans des annuaires de masse ou des réseaux de blogs : c’est contraire aux règles anti-spam de Google, et un site neuf en serait le premier pénalisé.
- **Publier des contenus générés en masse** :
  - descriptions de Florence-2 ou traductions de LibreTranslate publiées sans relecture ;
  - pages de lieu ou d’étiquettes vides, créées pour les mots-clés.
- **Publier des traductions automatiques non relues**, ou annoncer en hreflang une version qui n’est pas traduite.
- **Bourrer de mots-clés** les textes alternatifs, les titres ou les légendes (« photo Saint-Malo photographe Saint-Malo Bretagne… »). Le texte alternatif décrit ce qu’on voit, pour quelqu’un qui ne le voit pas.
- **Servir à Googlebot autre chose qu’aux visiteurs** (cloaking), ou rediriger automatiquement selon la langue sur les pages profondes.
- **Changer une adresse sans 301**, ou renommer les images sans redirection.
- **Combiner noindex et canonique vers une autre page**, ou canonique d’une langue vers une autre.
- **Interdire `/media/` ou Googlebot-Image** dans robots.txt pour « protéger » les photos : c’est se retirer de Google Images. La protection passe par l’IPTC, la licence et le filigrane.
- **Compter sur un Disallow pour cacher des galeries privées** : seuls le mot de passe et le noindex protègent.
- **Baliser des avis** qui ne viennent pas d’acheteurs du site, ou des avis sur l’organisation elle-même.
- **Ajouter un traceur tiers** pour mesurer le référencement : la Search Console, Bing Webmaster Tools et les statistiques du serveur suffisent.
- **Viser « photographe <ville> »** : ce n’est ni gagnable ni la bonne intention.

---

## Fichiers de ce dossier

| Fichier | Contenu |
|---|---|
| `README.md` | Cet audit et son plan d’action |
| `exemples/jsonld-site.json` | Accueil : `WebSite`, `Organization`, `Person` ×2 |
| `exemples/jsonld-personne.json` | Page photographe : `ProfilePage` et `Person` |
| `exemples/jsonld-serie.json` | Page série : `CollectionPage`, `ItemList`, `BreadcrumbList` |
| `exemples/jsonld-photo.json` | Page photo : `ItemPage`, `ImageObject` (licence, créateur, lieu), `BreadcrumbList` |
| `exemples/jsonld-billet.json` | Futur carnet : `BlogPosting` et `BreadcrumbList` (même forme pour un voyage en `Article`) |
| `exemples/jsonld-produit.json` | Future boutique : `ProductGroup`, variantes `Product`, `Offer`, livraison et retours |
| `exemples/titres-meta.md` | Titres, descriptions et H1 proposés pour les pages principales, en français, anglais et allemand |

**Valeurs à remplacer dans les exemples JSON-LD**
- `COMPTE_INSTAGRAM`, `COMPTE_PINTEREST`, `COMPTE_JULIEN` : profils réels.
- Les dates, prix, formats, papier et délais de la boutique : ce sont des exemples.
- Les noms : prénoms actuels, à remplacer par l’identité publique choisie (SEO-03).
- `Person.image` : à ajouter quand les portraits existeront (une photo d’œuvre ne convient pas).

Dans le code, toutes ces valeurs viennent de la base (voir `server/jsonld.js`, SEO-05). Les adresses d’images reprennent l’empreinte actuelle `2a46625b`.
