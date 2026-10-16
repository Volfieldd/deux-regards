# Annexe : galeries privées, modèle de menace et conception de sécurité

| | |
|---|---|
| Statut | Étude, rien n'est développé. Annexe de [blog-galeries-boutique.md](blog-galeries-boutique.md) (partie 2). |
| Date | 15 octobre 2026. Sources consultées ce jour-là. |
| Base lue | `/home/claudecode/dr-work/etude`, commit `7f3727f`, version `1.87.0` ; références à `server/routes/admin.js` recalées sur `main` à `c88632d` (version 1.88.0 : une ligne de plus en tête du fichier) |
| Relecture | 16 octobre 2026 : revue de conception (sessions, CSRF, essais concurrents, métadonnées, cache, page neutre) ; sources ajoutées consultées ce jour-là. |
| Mesures | Les mentions **(mesuré)** viennent d'une exécution de Node 22.23.1 sur la machine de l'étude, pas sur le serveur Unraid. |
| Sources | `[n]` : même numérotation que le document principal ; liste en fin d'annexe. |

Les exigences G1 à G78, le socle SO1 à SO9 et les constats C1 à C8 sont définis dans le document principal (§ 2.6 et § 7.1).

---

## 1. Ce qu'on protège, contre qui

**Biens à protéger** : des photos non publiques, parfois de personnes reconnaissables, parfois de mineurs ; les données des invités (étiquette, e-mail, journal, sélections, commentaires) ; la disponibilité du serveur.

**Adversaires** : un destinataire indiscret à qui le lien a été transféré ; un attaquant qui a obtenu un lien ; des robots qui explorent les adresses ; un voleur de sauvegarde ; une erreur de l'équipe.

**Méthode retenue** : lien personnel + mot de passe généré, donnés par deux canaux (document principal, § 2.3). C'est la seule méthode qui donne à la fois le suivi par personne, la révocation par personne et la limitation des essais par cible, sans tiers et sans coût.

---

## 2. Modèle de menace

| Id | Menace | Exemple | Mesures | Ce qui reste |
|---|---|---|---|---|
| M1 | Fuite du lien | Boîte mail piratée, lien collé dans une discussion, capture d'écran | Mot de passe par un autre canal (G14, G58) ; échéance (G8) ; révocation (G9) ; lien personnel (G5) | Faible |
| M2 | Transfert volontaire du lien **et** du mot de passe | L'invité partage avec un ami | Lien personnel ; appareils comptés et alerte (G31) ; téléchargement coupé par défaut (G44) ; filigrane (G42) | Moyen : on le voit, on ne l'empêche pas |
| M3 | Force brute du mot de passe | Script sur un lien obtenu, requêtes lancées en parallèle | 59 bits générés (G14) ; compteur en base, essai compté comme échec **avant** le calcul scrypt, un seul calcul à la fois par invitation, suspension à 30 échecs (G19) ; limite par adresse (G20) ; scrypt (G17) | Négligeable (§ 3.2, § 3.3) |
| M4 | Énumération | Deviner des jetons ou des espaces | Jeton de 192 bits (G6) ; format vérifié avant la base ; 404 identique (G11) ; identifiant d'espace sans valeur (G38) | Négligeable |
| M5 | Fuite par l'en-tête `Referer` | Clic vers un autre site depuis la page du lien | `Referrer-Policy: no-referrer` **réellement envoyé** (G32, corrige le piège C1) ; aucun lien sortant (G34) ; redirection vers une adresse sans jeton (G27) | Négligeable |
| M6 | Cache partagé | Cloudflare garde une image privée et la sert à un autre | `Cache-Control: private` (G39) ; règle « Bypass cache » et contrôle de `cf-cache-status` (G41) ; jamais sous `/media/` (G38) | Faible si G41 est vérifiée |
| M7 | Indexation | Un lien fuité dans une page publique est exploré | `X-Robots-Tag: noindex` (G32) ; hors sitemap (G35) ; `/g/` ouvert aux robots pour qu'ils lisent `noindex` (G36) | Faible |
| M8 | Capture de l'adresse d'une image | Copier l'URL d'une image et l'envoyer | Contrôle d'accès à chaque image : sans session, 404 (G38) ; `Cross-Origin-Resource-Policy` (G40) | Négligeable |
| M9 | Mot de passe commun | Un même code pour 20 personnes | Un mot de passe par invitation (G16) ; lien de groupe = choix explicite (G5) | Faible |
| M10 | Vol de session | XSS, cookie volé | `HttpOnly`, `__Host-` (G25) ; CSP `script-src 'self'` et échappement Eta (inchangés) ; rotation (G24) ; révocation (G9) | Faible |
| M11 | CSRF sur les actions de l'invité, CSRF de connexion | Un site tiers coche des photos, ou fait entrer le navigateur dans une galerie de l'attaquant | `Origin` **présent** et égal au site, ou `Sec-Fetch-Site: same-origin` ; jeton CSRF dès qu'une session existe (G28) ; `SameSite=Lax` | Négligeable |
| M12 | Vol de la base ou d'une sauvegarde | Copie du fichier SQLite | Empreintes des jetons et des mots de passe ; e-mails et commentaires scellés (G70) ; disques chiffrés (« à mettre en place » dans `RGPD.md`) | Moyen tant que les disques ne sont pas chiffrés : les photos sont sur disque |
| M13 | Antivirus de messagerie, aperçus de liens | Le lien est ouvert par un robot | Le GET ne consomme rien (G12) ; page neutre, sans Open Graph ni sélecteur de langue (G33, G37) | Un faux « lien consulté » |
| M14 | Jeton dans les journaux | Journal du serveur, `audit_log`, paramètre `vers=` du sélecteur de langue | `redactUrl` étendu à `/g/` et à `vers=` (G13, SO4, corrige C3) ; pas de sélecteur `/langue/` sur ces pages (G37) ; identifiants numériques dans les routes d'admin (G56, piège C4) | Négligeable |
| M15 | Accès trop large de l'équipe | Un photographe voit l'espace de l'autre | `request.owns('galeries.voir', space.author_id)`, jamais `request.can` seul (G55, G56, constat C8) | Faible |
| M16 | Déni de service | Rafale de mots de passe (scrypt), rendus HD, archives | 2 calculs scrypt à la fois (G18) ; rendu fait une fois (G44) ; archive bornée (G46) | Faible |
| M17 | Photo montrée malgré un refus | Photo d'une personne qui a refusé le site | Usage « privé » dans `readiness` (G61) | Faible |
| M18 | Erreur de destinataire | Faute de frappe dans l'e-mail | Mot de passe par un autre canal ; révocation ; journal | Faible |
| M19 | Position révélée par les métadonnées | Réglage « Tout l'EXIF de l'original » : les variantes gardent le GPS (`variants.js:14`, `images.js:81`) ; séance à domicile | Dans ce mode, la route privée refuse ces variantes ou sert un rendu sans GPS de `storage/private/` (G38, G42) | Faible |
| M20 | Archivage par un tiers | Always Online de Cloudflare envoie à Internet Archive les URL GET les plus demandées qui ont répondu 200 [311] ; `/g/<jeton>` répond 200 | Always Online désactivé (J14) ; Crawler Hints à vérifier | Faible si J14 est fait |

---

## 3. Conception détaillée

### 3.1 Lien

- **Jeton** : `crypto.randomBytes(24)` en base64url, 32 caractères, 192 bits ; forme et contrôle `^[\w-]{32}$` de la photo offerte (`encounters.js:431`, `:441`), avant toute requête en base.
- **Stockage** : empreinte SHA-256 seulement, comme les sessions (`sessions.js:8`). Un jeton de 192 bits ne se devine pas : une empreinte rapide sans sel suffit. Le lien complet ne s'affiche qu'à sa création ; « Nouveau lien » invalide l'ancien. Garder le jeton scellé pour renvoyer le même lien (C) affaiblirait la protection (base + `DATA_KEY` suffiraient) : non recommandé.
- **Échéance** : contrôlée sur le serveur, 30 jours par défaut (C), 12 mois au plus, jamais au-delà de l'espace [250].
- **Révocation** : supprime dans la même transaction les autorisations des sessions liées (`visitor_grants`), sur le modèle de `accounts.js:127`.

### 3.2 Mot de passe

**Génération (R).** Le serveur tire 12 caractères par `crypto.randomInt(31)` dans `CODE_CHARS` (`encounters.js:21`, sans 0/O ni 1/I/L ; constante non exportée aujourd'hui : à exporter, ou à déplacer dans `passwords.js`), groupés par quatre (`K7QM-P3XW-9TRA`). Saisie tolérante : casse, espaces et tirets ignorés. Aucun mot de passe choisi à la main : on ne peut pas en garantir la force.

**Force.**

- Entropie : 12 × log₂(31) ≈ **59,4 bits**. Dix caractères n'en donneraient que 49,5.
- La CNIL demande au moins **50 bits** quand l'accès est restreint par des mesures comme le blocage après plusieurs échecs (cas 2), **80 bits** sans restriction (cas 1) [48].
- Attaque en ligne avec un lien obtenu : 30 essais au plus avant suspension, soit une chance de 30 / 31¹² ≈ 4 × 10⁻¹⁷.
- Le NIST demande 15 caractères pour un mot de passe *choisi* utilisé comme seul facteur et plafonne à 100 échecs consécutifs [249] ; ici, la référence française est la CNIL et le mot de passe est aléatoire.

**Stockage (I).** scrypt, paramètres OWASP [246] :

| Paramètres | Mémoire | Temps | Remarque |
|---|---|---|---|
| N = 2¹⁷, r = 8, p = 1 (minimum OWASP de référence) | 128 Mio | ≈ 0,76 s avec `maxmem` à 256 Mio (mesuré) | Refusé par Node avec le `maxmem` par défaut : « memory limit exceeded » (mesuré) |
| **N = 2¹⁵, r = 8, p = 3** (équivalent OWASP) | 32 Mio | ≈ 0,45 s (mesuré) | **Recommandé**, `maxmem` à 64 Mio |

- Sel de 16 octets, clé de 32 octets, format auto-décrit `scrypt$15$8$3$<sel>$<clé>` : les paramètres pourront être relevés, avec re-hachage au prochain succès.
- Comparaison par `crypto.timingSafeEqual` [247].
- Temps à remesurer sur le serveur Unraid ; cible entre 0,25 et 1 s.
- Argon2id demanderait une dépendance native : `crypto.argon2` existe dans les versions récentes de Node, pas dans Node 22 (mesuré) [247]. scrypt, cité par la CNIL et l'OWASP, suffit.

**Concurrence (R).** `crypto.scrypt` tourne dans le pool de libuv (4 fils par défaut, `UV_THREADPOOL_SIZE` [248]), partagé avec les lectures de fichiers. Huit calculs simultanés retardent un `fs.stat` d'environ 0,87 s (mesuré) : une rafale ralentirait le service des images. D'où un sémaphore : 2 calculs à la fois, une file de 10, puis une réponse 503 « réessayez ». **Et un seul calcul à la fois par invitation** : une deuxième requête pour la même invitation pendant un calcul répond tout de suite « réessayez » (I, § 3.3).

### 3.3 Limitation des essais

| Niveau | Règle (valeurs C) | Où |
|---|---|---|
| Invitation | 5 échecs consécutifs : 1 min d'attente ; 10 : 15 min ; 30 sans succès : invitation **suspendue**, équipe prévenue, déblocage à la main ; compteur remis à zéro au succès | Colonnes `failed_count`, `failed_total`, `locked_until`, `suspended_at` **en base** : elles survivent à un redémarrage, contrairement au limiteur en mémoire (`ratelimit.js:19-39`) |
| Adresse IP | 20 essais par 15 min, toutes invitations confondues ; 60 GET de `/g/…` par heure | `createRateLimiter` ; IPv6 regroupée par /64 (`ratelimit.js:4-15`) |
| Global | 2 calculs scrypt simultanés | Sémaphore (§ 3.2) |

**Ordre des opérations (I).** Le calcul scrypt dure environ 0,45 s et il est asynchrone : si le compteur était lu avant et écrit après, une douzaine d'essais lancés en parallèle (2 calculs plus une file de 10) passeraient au-delà des seuils de 5, 10 et 30. Donc, dans **une même transaction synchrone** avant le calcul : contrôler le verrou et la suspension, puis compter l'essai comme un échec (`failed_count + 1`, `failed_total + 1`, verrou posé si un seuil est atteint). Après le calcul, en cas de succès seulement, annuler cet échec et remettre le compteur consécutif à zéro. Test de requêtes concurrentes dans T6.

La CNIL donne comme exemple un « blocage du compte après 10 échecs avec mécanisme de déblocage » [48] ; le NIST plafonne à 100 échecs [249]. Bloquer une invitation suppose d'avoir le lien : c'est déjà une fuite, traitée par un nouveau lien.

### 3.4 Session invité et cookie

- **Session visiteur commune** (SO2), partagée plus tard avec le panier : jeton de 32 octets dans le cookie, empreinte en base (`token_hash`), jeton CSRF. **L'identifiant de la session (`visitor_sessions.id`) est un identifiant interne aléatoire, distinct de l'empreinte du jeton** : le panier et les commandes s'y rattachent et ne bougent pas quand le jeton change. Différence avec `sessions.js`, où l'empreinte sert d'identifiant.
- **Autorisations** : `visitor_grants` relie la session aux invitations ouvertes ; une session peut ouvrir plusieurs espaces. Chaque autorisation a sa propre échéance (`expires_at`), son mode (`remember`) et sa dernière activité (`last_seen_at`), contrôlés à chaque requête : l'inactivité se mesure autorisation par autorisation, et **la durée du cookie ne prolonge jamais une autorisation**.
- **Cookie** `__Host-visiteur` : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sans `Domain` ; le préfixe `__Host-` exige `Secure` et `Path=/` et interdit `Domain`, donc aucun sous-domaine ne peut l'écraser [251] ; sans préfixe en HTTP local, comme `auth.js:41-45`.
- **`Lax` plutôt que `Strict`** : avec `Strict`, le cookie n'est pas envoyé quand on clique sur un lien depuis une messagerie web (navigation venue d'un autre site), et l'invité revoit la page du mot de passe. `Lax` n'envoie le cookie depuis un autre site que pour une navigation de premier niveau en GET [251].
- **Rotation** : chaque mot de passe accepté **change le jeton** de la session (nouveau jeton, nouvelle `token_hash`, nouveau jeton CSRF) ; l'identifiant interne, les autres autorisations et le panier restent. Sans session, une session est créée.

| Cas | Cookie | Inactivité de l'autorisation | Plafond de l'autorisation |
|---|---|---|---|
| Par défaut | Cookie de session du navigateur (sans `Max-Age`), sauf si un panier existe (voir ci-dessous) | 12 h | 7 jours |
| « Se souvenir de cet appareil » (décoché par défaut) | `Max-Age` de 30 jours | 30 jours | 30 jours |
| Panier présent (boutique) | `Max-Age` de 30 jours (durée du panier, partie 3) | Sans effet sur les autorisations | Sans effet |
| Toujours | — | — | Jamais au-delà de l'échéance de l'invitation ni de l'espace |

- **« Quitter la galerie »** : supprime les **autorisations** de la session (pas la session, donc pas le panier), change le jeton, réponse avec `Clear-Site-Data: "cache"` (HTTPS, largement pris en charge depuis 2023 [254]). Pas `"cookies"` : cela effacerait aussi la session d'admin et le cookie de langue.
- **Appareil** (G31) : une session visiteur distincte qui a accepté le mot de passe de l'invitation. Limite connue : vider ses cookies compte un appareil de plus ; le navigateur n'est pas noté (§ 3.9).

### 3.5 En-têtes par type de réponse

| Réponse | `Cache-Control` | Autres en-têtes |
|---|---|---|
| Page du lien `/g/<jeton>` | `no-store` | `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (exception par route SO3 : l'`onSend` global l'écrase aujourd'hui, `app.js:263-264`) ; aucune balise Open Graph, `canonical` ni `hreflang` (option du gabarit, § 3.8) |
| Pages `/prive/…` | `no-store` | Idem |
| Images `/prive/…/m/…` | `private, no-cache` avec ETag (par défaut) ; `private, no-store` (option « stricte ») | `X-Robots-Tag: noindex`, `Cross-Origin-Resource-Policy: same-origin` [253] |
| Téléchargements | `private, no-store` | `Content-Disposition: attachment`, `noindex`, CORP |

Images en `private, no-cache` plutôt que `no-store` (C) : le navigateur garde le fichier mais redemande avant chaque usage ; l'accès reste contrôlé à chaque affichage et le serveur répond 304 sans renvoyer l'image. Avec `no-store`, une galerie de 200 photos se retélécharge à chaque visite, contraire à la sobriété [245]. Ce qui reste : la copie sur le disque d'un ordinateur partagé, que « Quitter » vide ; l'option « stricte » passe à `no-store`.

### 3.6 Images, cache et Cloudflare

- **Route (I)** `/prive/:pid/m/:name`, nom conforme à `VARIANT_RE` comme `/media/`. À chaque image : (1) la session a une autorisation valide pour l'espace, ou la personne a la permission d'équipe ; (2) la photo appartient à l'espace ; (3) la clé est la clé courante. Sinon 404. `picture()` sert tel quel avec `base: '/prive/<pid>/m/'` (`picture.js:7`).
- **Le nom de fichier n'est pas un secret** : l'UUID v4 de l'original (122 bits) n'est pas devinable, mais il apparaît dans le HTML public, l'Open Graph et le partage des photos publiées (`public.js:213`, `:258`, `:389`). L'autorisation ne repose jamais dessus.
- **Cloudflare** : `private` signifie que la réponse « ne doit pas être stockée par un cache partagé » ; `no-store` n'est jamais mis en cache, quel que soit le réglage « Origin Cache Control » [271]. Mais une règle « Ignore cache-control header and use this TTL » fait ignorer ces en-têtes [272]. Par défaut, `.avif`, `.webp` et `.jpg` sont mis en cache, sauf `private`, `no-store`, `no-cache`, `max-age=0` ou réponse qui pose un cookie [270].
- **Défense en profondeur (R)** : règle « Bypass cache » sur `/g/*` et `/prive/*` (liste complète des chemins en J14 du document principal), aucune règle « Ignore cache-control » sur ces chemins ; **Always Online désactivé** : il transmet à Internet Archive « the most popular URLs found among GET requests that returned a 200 HTTP status code in the previous five hours » [311], or `/g/<jeton>` répond 200 ; Crawler Hints à vérifier. Après la mise en ligne, `cf-cache-status` doit valoir `DYNAMIC` ou `BYPASS` et le `Cache-Control` reçu doit être celui du serveur [273]. Les réglages réels du compte ne sont pas dans le dépôt : **à confirmer** dans le tableau de bord.
- **Filigrane (C)** : par défaut, celui du site, en servant les variantes existantes de `variants/` par la route privée (aucun rendu de plus). Option « sans filigrane » : rendu dans `storage/private/`, hors de `variants/`, qui ne garde qu'une clé par photo et efface les fichiers qu'il ne connaît pas (`variants.js:140`, `:146-153`), avec son propre ménage.
- **Métadonnées (I)** : avec le réglage « Tout l'EXIF de l'original », les variantes gardent la position GPS et le numéro de série (`variants.js:14`, `:74-75` ; `images.js:81`). Dans ce mode, la route privée ne sert pas ces variantes : elle sert un rendu sans GPS de `storage/private/`, ou refuse (404) avec une alerte pour l'équipe. Test à côté de T21.
- **Photo publiée rendue privée** : elle doit changer de nom et ses anciennes adresses doivent être purgées chez Cloudflare (purge par URL ouverte à l'offre gratuite [274]), sinon le cache d'un an la sert encore (`Cache-Control: public, max-age=31536000, immutable` sur `/media/`, `docs/wiki/Sécurité.md:78`). Or la clé des variantes (`variant_key`) est une empreinte des **seuls réglages** (filigrane, métadonnées ; `variants.js:58-79`) : elle est la même pour les photos d'un même auteur, et vide sans filigrane ni métadonnées, auquel cas les noms `<uuid>-<largeur>.<ext>` ne changent jamais. « Nouvelle clé » suppose donc un **sel par photo** : colonne `photos.variant_salt` (`ALTER TABLE … ADD COLUMN`, sans reconstruire la table), ajoutée à l'empreinte et changée au passage en privé ; puis purge des 6 adresses (3 largeurs × 2 formats) et de l'`og:image`. La purge par l'API demande un **jeton d'API Cloudflare** limité à la purge du cache de la zone : nouveau secret, à décrire dans `Configuration.md` ; sans jeton, l'équipe est prévenue et purge à la main. Une photo publiée **et** présente dans une galerie n'a rien à cacher ; le cas ne se pose que si on la dépublie.

### 3.7 Téléchargements et archive

- Tailles (C) : « web » 2048 px, comme la photo offerte ; « grande » 4000 px ou pleine définition (à décider : est-ce une exception à « originaux jamais servis » ? La règle vise le fichier original).
- JPEG rendu **une fois** depuis l'original puis gardé dans `storage/private/` ; le rendu à la volée de `/pour-vous` n'est pas repris (C6) : décoder un original de 24 Mpx coûte plusieurs secondes de processeur (`images.js:15-17`).
- Métadonnées : EXIF auteur et « usage personnel », comme `giftJpeg` (`public.js:56-58`) ; **jamais de GPS** (une séance à domicile donnerait l'adresse) ; jamais le fichier original.
- Archive ZIP : `zip.js` travaille en mémoire, sans compression ni ZIP64 (`zip.js:5-31`) ; archive écrite sur disque dans `storage/private/archives/`, effacée après 24 h, bornée à 100 photos et 1 Gio (C), 3 archives par invitation et par jour. Pas dans `storage/tmp/` : l'admin le vide à chaque démarrage (restes d'import, `admin.js:64-67`).

### 3.8 Indexation

- `X-Robots-Tag: noindex` sur toutes les réponses, images comprises.
- **`/g/` n'est pas interdit dans `robots.txt`** : une page bloquée ne voit jamais son `noindex` et « peut quand même apparaître dans les résultats » [256] ; un lien fuité serait alors indexé avec son jeton visible. Ouvert aux robots, il ne montre que le formulaire, avec `noindex`.
- **`/prive/` est interdit** : sans session, tout y répond 404.
- Le document du W3C sur les « capability URLs » conseille `robots.txt` ; il date de 2014 et ne traite pas ce cas [250]. `/pour-vous/`, aujourd'hui interdit (`public.js:110`), pose la même question (C7).
- Page du lien : titre neutre « Galerie privée · Nicephos », ni `description`, ni Open Graph, ni image : un aperçu de lien dans une messagerie ne montre rien. Aujourd'hui `views/layout.eta` émet **toujours** `og:title`, `og:site_name`, `og:locale` et l'`og:image` de partage de la marque (`layout.eta:4`, `:23-33`) : il faut une option du gabarit (`it.neutral`) qui retire Open Graph, `canonical` et `hreflang`.
- **Sélecteur de langue** : `nav.eta:4` inclut `langs.eta:6`, qui pointe vers `/langue/<l>?vers=<page courante>` (`here`, `app.js:138`). Sur `/g/<jeton>`, un clic mettrait le jeton dans le journal (`redactUrl` ne masque pas `vers=`) puis mènerait à `/en/g/…`, qui répond 404. Les pages `/g/` et `/prive/` ont donc un menu **sans** sélecteur `/langue/` ; la langue s'y change par `POST /prive/:pid/langue` (G37).

### 3.9 Journal des accès et journaux du serveur

- **`space_events`** : un événement par lien consulté (un par adresse et par jour), mot de passe accepté ou refusé, verrouillage, suspension, visite (une par session et par jour), téléchargement (taille), archive, sélection terminée, commentaire, commande, révocation.
- Chaque événement garde la date, l'**IP tronquée** (`truncateIp`, /24 ou /48) et le pays (`cf-ipcountry`, si `TRUST_PROXY`). Le navigateur n'est pas noté : seul un indicateur « robot ou aperçu », avec le détecteur de `stats.js:79-90`.
- Journal du serveur : `redactUrl` masque `/g/<jeton>`, ainsi que le paramètre `vers=` quand il contient `/g/` (SO4). Les routes d'admin désignent une invitation par son numéro, jamais par son jeton : `admin.js:155` écrit les paramètres de route dans `audit_log` (C4).

### 3.10 Accès de l'équipe

- Sur `/prive/…`, la route accepte aussi l'équipe, sans mot de passe, par **`request.owns('galeries.voir', space.author_id)`** : la session d'admin est chargée sur toute requête (`auth.js:65-73`). Pas `request.can('galeries.voir')` seul : `can()` renvoie `'les miennes'`, qui vaut vrai (`permissions.js:107-111`), et un photographe verrait l'espace de l'autre. C'est le défaut de l'aperçu d'un voyage (`public.js:301`, `request.can('sorties.voir')`), relevé comme constat C8 et à porter à l'audit.
- Billets privés : la même permission, `galeries.voir`, sur l'espace de type billet ; pas de seconde règle par `post_authors`.
- Espaces communs (`author_id` NULL) : `owns()` est faux en portée « les miennes » (`s.authorId === null` jamais vrai) ; ils sont donc réservés aux comptes qui ont la portée « tout », comme les voyages communs (`voyages.js`, `sees` et `manages`). Test dans T26 et `test/portee.test.js`.
- Bandeau « Vue équipe » ; actions d'invité désactivées ; aucun événement d'invité noté.
- Les invités ne sont jamais dans `accounts` et n'ont aucun rôle de `ROLES` : `hasRole` (`permissions.js:100`) ouvrirait l'admin à tout porteur d'un rôle du catalogue (`auth.js:92`). Passer les invités par Zitadel ne marche pas sans changement : une connexion sans rôle crée un compte « en attente », refuse la session (`auth.js:176-180`) et le purge au bout de 90 jours (`accounts.js:37-41`).

### 3.11 Pièges du code actuel à ne pas reproduire

| Piège | Où | Ce que font les galeries |
|---|---|---|
| `Referrer-Policy` posé par une route, écrasé par l'`onSend` global (C1, vérifié) | `public.js:59`, `app.js:263-264` | Exception par route `config.referrer` (SO3) et test qui vérifie l'en-tête réellement envoyé (T14) |
| Jeton stocké en clair (C2) | `016_photos_offertes.sql:4` | Empreinte seulement (G7) |
| URL à jeton non masquée dans le journal (C3) | `app.js:69-73` | `redactUrl` étendu (G13) |
| Jeton dans les paramètres d'une route d'admin, donc dans `audit_log` (C4) | `rencontres.js:116`, `admin.js:153-155` | Identifiants numériques (G56) |
| Rendu depuis l'original à chaque requête (C6) | `public.js:56-58` | Rendu une fois, gardé (G44) |
| Message `flash` signé mais pas chiffré | `admin.js:176-188` | Lien et mot de passe jamais dans un `flash` ; création protégée contre le renvoi du formulaire (G22, G57) |
| Limiteur en mémoire, remis à zéro au redémarrage | `ratelimit.js:19-39` | Compteur d'échecs par invitation en base, compté avant scrypt (G19) |
| `request.can(perm)` sans portée : `'les miennes'` vaut vrai (C8) | `public.js:301`, `permissions.js:107-111` | `request.owns('galeries.voir', space.author_id)` (G55) |
| `sameSite` accepte une requête **sans** `Origin` | `public.js:382` (`!o`) | `Origin` exigé et égal au site, ou `Sec-Fetch-Site: same-origin` (G28) |
| Open Graph et sélecteur `/langue/?vers=` sur toutes les pages | `layout.eta:4`, `:23-33` ; `nav.eta:4`, `langs.eta:6` ; `redactUrl` (`app.js:69-73`) | Option `it.neutral` du gabarit ; menu sans sélecteur ; `vers=` masqué (G33, G37, SO4) |
| `storage/tmp` vidé à chaque démarrage | `admin.js:64-67` | Archives dans `storage/private/archives/` (G46) |
| Variantes avec GPS en mode « Tout l'EXIF » | `variants.js:14`, `images.js:81` | Rendu sans GPS ou refus par la route privée (G38, G42) |
| Clé de variante commune à toutes les photos, vide sans réglage | `variants.js:58-79` | Sel par photo, `photos.variant_salt` (G43) |

---

## 4. Modèle de données

Conventions du projet : dates en millisecondes, traductions `_en` et `_de`, JSON dans un `TEXT`, états validés en JavaScript. Numéro de migration indicatif (document principal, § 7.3).

```sql
-- 043_espaces_prives.sql
-- Sessions des visiteurs du site public (galeries privées, puis panier). Le cookie porte un jeton aléatoire ; la base
-- n'en garde que l'empreinte, comme 002_sessions.sql.
-- L'identifiant est interne et stable : la rotation du jeton (mot de passe accepté, « Quitter ») ne change que
-- token_hash, donc le panier et les commandes rattachés à la session ne bougent pas.
CREATE TABLE visitor_sessions (
  id          TEXT PRIMARY KEY,               -- identifiant interne aléatoire (jamais dans le cookie)
  token_hash  TEXT NOT NULL UNIQUE,           -- SHA-256 du jeton du cookie ; changé à chaque rotation
  csrf        TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'fr',     -- langue choisie dans les pages privées
  created_at  INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL                -- durée du cookie (panier : 30 jours) ; ne prolonge aucune autorisation
);
CREATE INDEX visitor_sessions_exp ON visitor_sessions (expires_at);

-- Espaces privés : une galerie (photos choisies) ou un billet, visibles de l'équipe (galeries.voir, avec portée) et
-- des personnes invitées (lien personnel et mot de passe). Les photos gardent leur statut : l'appartenance passe par
-- space_items (reconstruire photos pour un nouvel état ferait perdre des données).
CREATE TABLE private_spaces (
  id          INTEGER PRIMARY KEY,
  public_id   TEXT NOT NULL UNIQUE,            -- 12 caractères aléatoires, adresse /prive/<public_id> ; pas un secret
  kind        TEXT NOT NULL DEFAULT 'galerie', -- galerie | billet
  author_id   INTEGER REFERENCES authors(id) ON DELETE SET NULL,  -- propriétaire ; NULL : espace commun
  title       TEXT NOT NULL,
  title_en    TEXT NOT NULL DEFAULT '',
  title_de    TEXT NOT NULL DEFAULT '',
  intro       TEXT NOT NULL DEFAULT '',
  intro_en    TEXT NOT NULL DEFAULT '',
  intro_de    TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | ouverte | fermee
  closes_at   INTEGER,                         -- échéance de l'espace ; aucune invitation ne va au-delà
  options     TEXT NOT NULL DEFAULT '{}',      -- JSON : download, sizes, watermark, favorites, favorites_max,
                                               -- comments, prints, strict_cache
  cover_item  INTEGER,                         -- space_items.id (sans clé étrangère : référence croisée)
  created_by  TEXT NOT NULL,                   -- sub du compte
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX private_spaces_author ON private_spaces (author_id);

-- Photos d'un espace, dans l'ordre choisi. La confirmation d'une photo « à vérifier » pour l'usage privé est gardée.
CREATE TABLE space_items (
  id            INTEGER PRIMARY KEY,
  space_id      INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  photo_id      INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  confirmed_by  TEXT,
  confirmed_why TEXT,
  added_at      INTEGER NOT NULL,
  UNIQUE (space_id, photo_id)
);
CREATE INDEX space_items_photo ON space_items (photo_id);

-- Invitations : ni le jeton du lien ni le mot de passe ne sont gardés, seulement leurs empreintes. Étiquette et e-mail
-- chiffrés (vault.seal) ; email_index : HMAC (vault.index) pour l'export et l'effacement. Effacées 6 mois après la fin.
CREATE TABLE space_invites (
  id               INTEGER PRIMARY KEY,
  space_id         INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,        -- SHA-256 du jeton du lien
  password_hash    TEXT NOT NULL,               -- scrypt$15$8$3$<sel>$<clé>
  label            TEXT NOT NULL,               -- chiffré
  email            TEXT,                        -- chiffré, facultatif
  email_index      TEXT,
  lang             TEXT NOT NULL DEFAULT 'fr',
  encounter_id     INTEGER REFERENCES encounters(id) ON DELETE SET NULL, -- la personne photographiée, si c'est elle
  is_group         INTEGER NOT NULL DEFAULT 0,
  rights           TEXT NOT NULL DEFAULT '{}',  -- JSON : remplace les options de l'espace pour cette invitation
  max_devices      INTEGER,                     -- NULL : pas de refus, seulement une alerte
  expires_at       INTEGER NOT NULL,
  revoked_at       INTEGER,
  failed_count     INTEGER NOT NULL DEFAULT 0,  -- échecs consécutifs (remis à zéro au succès)
  failed_total     INTEGER NOT NULL DEFAULT 0,  -- échecs depuis le dernier succès ou déblocage (suspension à 30)
  locked_until     INTEGER,
  suspended_at     INTEGER,
  first_opened_at  INTEGER,                     -- premier mot de passe accepté
  last_seen_at     INTEGER,
  downloads        INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  ended_at         INTEGER                      -- échéance passée ou révocation : départ du délai de purge
);
CREATE INDEX space_invites_space ON space_invites (space_id);
CREATE INDEX space_invites_email ON space_invites (email_index);
CREATE INDEX space_invites_end ON space_invites (ended_at);

-- Autorisations ouvertes par un mot de passe accepté. Révoquer une invitation ou « Quitter » supprime ses lignes.
-- Inactivité et plafond contrôlés ligne par ligne, à chaque requête (12 h et 7 jours ; 30 jours avec remember).
CREATE TABLE visitor_grants (
  session_id    TEXT NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  invite_id     INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  remember      INTEGER NOT NULL DEFAULT 0,     -- « Se souvenir de cet appareil »
  granted_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,               -- plafond : jamais au-delà de l'invitation ni de l'espace
  PRIMARY KEY (session_id, invite_id)
);
CREATE INDEX visitor_grants_invite ON visitor_grants (invite_id);

-- Sélections : une liste par défaut, d'autres nommées plus tard. done_at : « J'ai terminé ».
CREATE TABLE space_lists (
  id          INTEGER PRIMARY KEY,
  invite_id   INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  done_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE TABLE space_list_items (
  list_id   INTEGER NOT NULL REFERENCES space_lists(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES space_items(id) ON DELETE CASCADE,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (list_id, item_id)
);

-- Commentaires des invités, visibles de l'équipe seulement. Texte chiffré.
CREATE TABLE space_comments (
  id          INTEGER PRIMARY KEY,
  invite_id   INTEGER NOT NULL REFERENCES space_invites(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES space_items(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);

-- Journal des accès : IP tronquée (/24 ou /48), pays Cloudflare ; ni navigateur ni jeton. Effacé avec l'invitation.
CREATE TABLE space_events (
  id          INTEGER PRIMARY KEY,
  space_id    INTEGER NOT NULL REFERENCES private_spaces(id) ON DELETE CASCADE,
  invite_id   INTEGER REFERENCES space_invites(id) ON DELETE CASCADE,  -- NULL : action d'équipe
  kind        TEXT NOT NULL,   -- lien_consulte, mot_de_passe_ok, mot_de_passe_refuse, verrou, suspension, visite,
                               -- telechargement, archive, selection_terminee, commentaire, commande, revocation
  item_id     INTEGER,         -- sans clé étrangère : l'événement survit au retrait de la photo
  detail      TEXT,
  robot       INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  country     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX space_events_space ON space_events (space_id, created_at);
CREATE INDEX space_events_invite ON space_events (invite_id, created_at);
```

Dans la même migration : `ALTER TABLE photos ADD COLUMN variant_salt TEXT NOT NULL DEFAULT '';` (sel par photo, G43 ; une colonne ajoutée ne reconstruit pas la table). Si les auteurs retiennent l'invitation qui couvre plusieurs espaces (G78, C), une table `invite_spaces (invite_id, space_id)` remplace `space_invites.space_id`.

Billets privés (migration `044`, après le carnet) : `ALTER TABLE private_spaces ADD COLUMN post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;` et `posts.visibility`. SQLite l'accepte car la valeur par défaut est NULL [280].

Permissions : `galeries.voir`, `galeries.gerer`, `galeries.partager`, toutes `{ scoped: true }`, contrôlées par `request.owns(…, space.author_id)`. Fichiers : `storage/private/` (rendus sans filigrane ou sans GPS, téléchargements) et `storage/private/archives/` (archives), hors sauvegarde. Modules : `server/tokens.js`, `server/passwords.js`, `server/visitor-sessions.js`, `server/spaces.js`, `server/routes/prive.js`, `server/routes/galeries.js`.

**`DATA_KEY` exigée (I)** : sans elle, `vault.seal()` ne chiffre rien et `vault.index()` renvoie `null` (`vault.js:33-36` ; `docs/wiki/Configuration.md:94`). L'envoi du lien par e-mail (colonnes `email`, `email_index`) et les commentaires refusent de s'ouvrir sans `DATA_KEY` ; l'admin le dit (G70).

---

## 5. Routes

**Invités** (hors `pages()`, sans préfixe de langue, enregistrées avant le 404)

| Méthode et chemin | Rôle | Protection |
|---|---|---|
| `GET /g/:token` | Page du mot de passe ; autorisation déjà ouverte : 303 vers l'espace | Format, empreinte, 404 ou 410, limite par adresse, `noindex`, `no-referrer`, `no-store` |
| `POST /g/:token` | Vérifie le mot de passe, ouvre la session (ou change son jeton), 303 vers `/prive/<public_id>` | Pas encore de session, donc pas de jeton CSRF : seul contrôle contre le CSRF de connexion, `Origin` **présent** et égal au site, ou `Sec-Fetch-Site: same-origin` ; limites (§ 3.3), sémaphore ; échec 403 ; limite 429 |
| `GET /prive/:pid` | Galerie ou billet | Session avec autorisation, ou équipe ; sinon 404 uniforme (« Ouvrez le lien personnel reçu ») |
| `GET /prive/:pid/photo/:item` | Page d'une photo | Idem, et appartenance de la photo |
| `GET /prive/:pid/m/:name` | Variante d'image | G38, G39, G40 |
| `GET /prive/:pid/telecharger/:item/:taille` | JPEG en pièce jointe | Droit de téléchargement, compteur |
| `POST /prive/:pid/archive`, `GET /prive/:pid/archive/:n` | Archive ZIP | CSRF, bornes (G46) |
| `POST /prive/:pid/selection/:item` | Choisir ou retirer | CSRF, `Origin`, limite |
| `POST /prive/:pid/selection/terminer` | Figer la sélection | CSRF |
| `POST /prive/:pid/commentaires/:item` | Commenter | CSRF, longueur, limite |
| `POST /prive/:pid/langue` | Changer de langue | CSRF |
| `POST /prive/quitter` | Supprimer les autorisations de la session (le panier reste), changer le jeton, `Clear-Site-Data: "cache"` | CSRF |
| `GET /prive` (si G78 retenu) | Liste des espaces que la session a ouverts | Session ; `no-store`, `noindex` |

**Admin** (`server/routes/galeries.js`, `P()` et `W()` de `admin.js:160-161`)

| Méthode et chemin | Permission |
|---|---|
| `GET /admin/galeries` ; `GET /admin/galeries/:id` (onglets) | `galeries.voir` |
| `POST /admin/galeries` ; `POST /admin/galeries/:id` (réglages), `/ouvrir`, `/fermer`, `/supprimer` | `galeries.gerer` |
| `POST /admin/galeries/:id/photos`, `/photos/:item/retirer`, `/photos/:item/confirmer`, `/ordre` | `galeries.gerer` |
| `POST /admin/photos/actions` (action groupée « Ajouter à un espace », `admin.js:1110`) | `galeries.gerer` en plus de `photos.voir` |
| `POST /admin/galeries/:id/invitations` (jeton de formulaire à usage unique : un renvoi par F5 ou « Précédent » ne crée pas une seconde invitation ; puis 303 vers la page suivante) | `galeries.partager` |
| `GET /admin/galeries/:id/invitations/:inv/secrets` (`no-store` ; lien et mot de passe lus dans une mémoire du serveur liée à la session d'admin, effacée à la première lecture ; ensuite : « déjà affichés, créez un nouveau mot de passe ») | `galeries.partager` |
| `POST /admin/galeries/:id/invitations/:inv/envoyer`, `/prolonger`, `/nouveau-lien`, `/nouveau-mot-de-passe`, `/debloquer`, `/revoquer`, `/effacer` | `galeries.partager` |
| `POST /admin/galeries/:id/selections/:list/rouvrir` | `galeries.gerer` |
| `GET /admin/galeries/:id/selections/:list/export` | `galeries.voir` |
| `GET /admin/galeries/:id/apercu` (redirige vers `/prive/<public_id>` en vue équipe) | `galeries.voir` |

Autres changements : portée des routes `/admin/galeries/:id` sur le modèle de `voyages.js` (`load`, `sees`, `manages`, qui gèrent l'objet commun à `author_id` NULL), plutôt qu'un motif ajouté au contrôle `admin.js:114-142`, qui suppose un seul propriétaire ; menu (`views/admin/layout.eta:70-112`) et aide (`HELP`) ; `robots.txt` (`public.js:110`) ; `redactUrl` (`app.js:69-73`, `/g/` et `vers=`) ; exception `config.referrer` dans l'`onSend` (`app.js:263-266`) ; option `it.neutral` de `views/layout.eta` et menu sans sélecteur de langue.

---

## 6. Tests

**`test/prive.test.js` : accès**

| Id | Vérifie |
|---|---|
| T1 | Jeton mal formé : 404, sans lecture de la base. |
| T2 | Jeton inconnu bien formé : même corps et mêmes en-têtes que toute page absente. |
| T3 | Jeton expiré, révoqué, ou espace fermé : 410, sans le titre de l'espace. |
| T4 | Le GET du lien note « lien consulté » sans changer `first_opened_at`. |
| T5 | Mauvais mot de passe : 403, compteur augmenté, essais restants affichés. |
| T6 | Horloge injectée : 10 échecs donnent 15 min de refus, même avec le bon mot de passe ; 30 donnent la suspension ; « Débloquer » rétablit l'accès. Requêtes concurrentes (faux scrypt lent) : 20 essais lancés ensemble sur une invitation au compteur à 4 ne dépassent jamais les seuils ; un seul calcul à la fois par invitation. |
| T7 | 21e essai depuis une même adresse, toutes invitations confondues : 429. |
| T8 | Bon mot de passe : 303 vers `/prive/<public_id>` ; cookie `__Host-` avec `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` (configuration HTTPS) ; empreinte en base, jamais le jeton. |
| T9 | Une session existante change de jeton (rotation) et garde ses autres autorisations ; **avec un panier présent, le panier reste** et une commande passée avant garde l'accès à `/merci`. |
| T10 | `/prive/<pid>` sans autorisation : 404 identique pour un `pid` existant et inexistant. |
| T11 | Une session de l'espace A ne voit ni la page ni les images de B. |
| T12 | Après révocation, la requête suivante de la même session répond 404. |
| T13 | Une prolongation garde le lien ; « Nouveau lien » invalide l'ancien. |
| T14 | Sur les pages : `no-store`, `noindex` et `Referrer-Policy: no-referrer` réellement présent (garde contre `app.js:263-264`). |
| T15 | `robots.txt` interdit `/prive/` et n'interdit pas `/g/` ; sitemap, recherche et statistiques : aucune trace. |
| T16 | Journal capturé : `/g/<jeton>` masqué, y compris dans `/langue/fr?vers=/g/<jeton>` ; ni jeton ni mot de passe. |
| T17 | Durées, autorisation par autorisation : 12 h d'inactivité, plafond de 7 jours, 30 jours avec « se souvenir », jamais au-delà de l'échéance ; un cookie de 30 jours posé pour le panier ne prolonge pas une autorisation. |

**`test/prive-images.test.js`**

| Id | Vérifie |
|---|---|
| T18 | Image de l'espace : 200 ; `private, no-cache` (ou `no-store` en option stricte), `noindex`, CORP, ETag ; 304 si inchangée. |
| T19 | Variante d'une photo hors de l'espace (même publiée), ou ancienne clé : 404 par la route privée. |
| T20 | `/media/<variante d'une photo seulement privée>` : 404. |
| T21 | Téléchargement interdit sans le droit ; avec le droit : JPEG sans GPS (métadonnées lues par `sharp`), EXIF auteur, compteur augmenté ; le second téléchargement ne refait pas de rendu. Réglage « Tout l'EXIF de l'original » : la route privée ne sert jamais une variante avec GPS (rendu sans GPS ou 404). |
| T22 | Archive : bornes respectées, fichier effacé après 24 h. |

**`test/prive-admin.test.js`**

| Id | Vérifie |
|---|---|
| T23 | Création d'une invitation : pages `no-store`, pas de cookie `flash` contenant le mot de passe, aucun mot de passe en clair dans le fichier SQLite ; même formulaire envoyé deux fois (F5) : une seule invitation ; page des secrets vide à la seconde lecture. |
| T24 | `audit_log` sans jeton ni mot de passe après création, régénération et révocation. |
| T25 | E-mail (transport injecté) : lien présent, mot de passe absent, texte dans la langue de l'invitation. |
| T26 | Portée : un photographe ne voit pas l'espace de l'autre, ni dans l'admin ni sur `/prive/…` (404) ; un espace commun (`author_id` NULL) n'est visible que des comptes à portée « tout » ; l'équipe autorisée voit `/prive/…` sans mot de passe et aucun événement d'invité n'est noté. Cas ajoutés aussi à `test/portee.test.js`. |
| T27 | Usage « privé » : photo bloquée refusée à l'ajout ; photo à vérifier exige une confirmation gardée. |
| T28 | Purge : invitations finies depuis plus de 6 mois effacées avec listes, commentaires, événements et autorisations ; sessions expirées effacées. |
| T29 | Export et effacement par e-mail d'invité. |

**`test/passwords.test.js`**

| Id | Vérifie |
|---|---|
| T30 | Génération (alphabet, longueur, groupes) ; saisie tolérante ; format scrypt et paramètres relus de l'empreinte ; re-hachage si les paramètres changent. |
| T31 | Sémaphore : 2 calculs simultanés au plus (faux scrypt injecté), 503 au-delà de la file. |

**Sélection et billets**

| Id | Vérifie |
|---|---|
| T32 | Sans jeton CSRF, avec un `Origin` étranger, ou **sans `Origin`** (ni `Sec-Fetch-Site: same-origin`) : 403 ; `POST /g/:token` sans `Origin` : 403 ; limite de sélection respectée ; « Terminé » fige la liste et prévient l'équipe. |
| T33 | Un billet privé est absent de `/carnet`, du sitemap, du flux et de la recherche, et accessible par invitation. |
| T34 | « Quitter la galerie » : autorisations supprimées, nouvelle requête sur `/prive/<pid>` : 404 ; le panier de la même session est toujours là. |
| T35 | Page du lien et pages privées : aucune balise `og:*`, `canonical` ni `hreflang` ; aucun lien `/langue/` ; `POST /prive/:pid/langue` change la langue. |

Tests de garde existants qui couvrent les routes d'admin sans rien ajouter : `test/roles.test.js`, `test/revue.test.js`, `test/langues-admin.test.js`, `test/nouveautes.test.js`. Navigateur : parcours de l'invité dans `e2e/tests/prive.spec.js`, lancé par les projets `desktop` et `mobile` ; sélection **sans JavaScript** (`javaScriptEnabled: false`). Les projets `iphone` et `audit` ne lancent que `iphone.spec.js` et `audit.spec.js` (`e2e/playwright.config.js:17-22`) : le cas iPhone s'ajoute à `iphone.spec.js` ; `audit` rejoue les parcours d'ergonomie de l'admin avec `E2E_AUDIT=1` et ne mesure pas les pages publiques, donc le contrôle axe-core des pages privées va dans `prive.spec.js`. Écritures seulement avec `E2E_ALLOW_WRITES=1` et un serveur jetable.

---

## 7. Analyse d'impact simplifiée et violation

Lignes à ajouter à l'analyse (`docs/wiki/RGPD.md`, § 3) :

| Risque pour les personnes | Gravité | Mesures | Risque résiduel |
|---|---|---|---|
| Une galerie privée vue par des tiers (lien et mot de passe transférés ou volés) | Importante | Lien personnel, mot de passe par un autre canal, échéance, révocation, appareils comptés, téléchargement coupé par défaut | Modéré, puis faible avec le suivi |
| Une photo d'une personne qui a refusé, montrée en privé | Importante | Usage « privé » bloquant | Faible |

Un accès non autorisé à une galerie où l'on reconnaît des personnes est une violation de données : la procédure de `RGPD.md` § 4 s'applique ; notification à la CNIL sous 72 h si un risque existe (art. 33 [44]). Durées de journalisation : la CNIL recommande de 6 mois à 1 an [49].

---

## 8. Contrôle après la mise en ligne

À noter dans `docs/wiki/Exploitation.md` :

```
curl -sI https://www.nicephos.art/g/<jeton de test>          # page du lien
curl -sI https://www.nicephos.art/prive/<id>/m/<variante>    # image (avec le cookie d'une session de test)
```

Attendu : `cf-cache-status: DYNAMIC` ou `BYPASS` ; `cache-control` identique à celui du serveur ; `referrer-policy: no-referrer` ; `x-robots-tag: noindex` [273]. Dans le tableau de bord : Always Online désactivé [311], Crawler Hints vérifié.

---

## 9. À confirmer

1. **Usage « privé » et droit à l'image** : montrer à des tiers choisis une photo d'une personne reconnaissable sans son accord explicite, et dans quels cas ; avis d'un avocat [42], [43].
2. **Pleine définition** : un JPEG pleine définition sans EXIF de prise de vue est-il une exception à « originaux jamais servis » ? À écrire dans les règles du projet.
3. **Cloudflare** : règles de cache, « Browser Cache TTL », « Origin Cache Control » actifs sur le compte.
4. **Durées** : 6 mois après la fin de l'invitation ; 30 jours d'échéance par défaut ; 12 h et 7 jours de session.
5. **Répartition** des trois permissions entre les rôles.
6. **Mot de passe dans l'e-mail** : faut-il proposer l'option ?
7. **Appareils** (une session visiteur distincte qui a accepté le mot de passe) : alerte à 3, refus au-delà ou non.
8. **Temps de scrypt** sur le serveur Unraid (cible 0,25 à 1 s) ; ajuster N.
9. **Champ « nom d'utilisateur » caché** pour les gestionnaires de mots de passe (plusieurs galeries sur le même site) : à essayer dans les navigateurs.
10. **`/pour-vous/` dans `robots.txt`** (C7) : à porter à l'audit de sécurité.
11. **Invitation qui couvre plusieurs espaces**, ou page `/prive` qui liste les accès de la session (G78).
12. **Aperçu des voyages** (`public.js:301`, C8) : `request.can('sorties.voir')` sans portée ; à porter à l'audit.

## Sources

Consultées le 15 octobre 2026, sauf mention du 16 octobre 2026 (relectures). Numérotation commune avec le document principal.

**Œuvres d'art, droit d'auteur, droit à l'image**

- [42] Code civil, art. 9 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006419288
- [43] Service-public.fr, « Droit à l'image et au respect de la vie privée », F32103 (vérifié le 06/05/2022) : https://www.service-public.gouv.fr/particuliers/vosdroits/F32103

**Données personnelles**

- [44] RGPD : https://eur-lex.europa.eu/eli/reg/2016/679/oj ; chapitre III (CNIL) : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3
- [48] CNIL, recommandation « mots de passe » (délibération n° 2022-100 : 80 bits en cas 1, 50 bits en cas 2) : https://www.cnil.fr/fr/mots-de-passe-recommandations-pour-maitriser-sa-securite
- [49] CNIL, recommandation « journalisation » (délibération n° 2021-122 : de 6 mois à 1 an) : https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation

**Ergonomie, accessibilité, sobriété**

- [245] RGESN 2024 (Arcep, Arcom, ADEME) : https://ecoresponsable.numerique.gouv.fr/publications/referentiel-general-ecoconception/

**Web, sécurité, référencement**

- [246] OWASP, « Password Storage Cheat Sheet » : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- [247] Node.js 22, module `crypto` : https://nodejs.org/docs/latest-v22.x/api/crypto.html ; version courante (`crypto.argon2`) : https://nodejs.org/api/crypto.html
- [248] Node.js 22, `UV_THREADPOOL_SIZE` : https://nodejs.org/docs/latest-v22.x/api/cli.html
- [249] NIST SP 800-63B, révision 4 (26 août 2025) : https://pages.nist.gov/800-63-4/sp800-63b.html
- [250] W3C, « Good Practices for Capability URLs » (18 février 2014) : https://www.w3.org/TR/capability-urls/
- [251] MDN, `Set-Cookie` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- [253] MDN, `Cross-Origin-Resource-Policy` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy
- [254] MDN, `Clear-Site-Data` : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data
- [256] Google Search Central, « Block search indexing with noindex » (10/12/2025) : https://developers.google.com/search/docs/crawling-indexing/block-indexing
- [270] Cloudflare, cache par défaut : https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- [271] Cloudflare, `Cache-Control` : https://developers.cloudflare.com/cache/concepts/cache-control/
- [272] Cloudflare, réglages des règles de cache : https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
- [273] Cloudflare, valeurs de `cf-cache-status` : https://developers.cloudflare.com/cache/concepts/cache-responses/
- [274] Cloudflare, purge du cache : https://developers.cloudflare.com/cache/how-to/purge-cache/
- [280] SQLite, `ALTER TABLE` : https://www.sqlite.org/lang_altertable.html
- [311] Cloudflare, Always Online (envoi à Internet Archive des URL GET les plus demandées ayant répondu 200 ; consulté le 16/10/2026) : https://developers.cloudflare.com/cache/how-to/always-online/
