# Vigie, phase 0 : réglages de Cloudflare et de Zitadel

Marche à suivre des réglages **hors code** qui préparent la Vigie ([étude](../../docs/etudes/annexe-vigie-architecture.md), [annexe Cloudflare](../../docs/etudes/annexe-vigie-cloudflare.md)). Elle est découpée en deux temps :

- **Maintenant** : utile au site tel qu'il est, avec ou sans Vigie (la Vigie est facultative). Sans risque pour le site si l'on suit l'ordre.
- **Avec la Vigie** : à faire quand son conteneur existe (phase B). On peut préparer les applications dès maintenant : elles ne servent à rien tant que la Vigie ne tourne pas.

Chaque étape dit comment **vérifier** et comment **revenir en arrière**.

---

## 0. `TRUST_PROXY` : déjà réglé sur Unraid

`TRUST_PROXY` est l'adresse **interne** du conteneur `nicephos-tunnel` (`cloudflared`) sur le réseau Docker de la pile, et rien d'autre : le site ne croit l'en-tête `X-Forwarded-For` (l'adresse réelle du visiteur) et le pays de Cloudflare que s'ils viennent de cette adresse. Un poste du réseau local qui joint le site directement ne peut donc pas se faire passer pour un autre visiteur.

Sur Unraid, la pile le fait déjà : `cloudflared` a l'adresse fixe `TUNNEL_IP` (`172.29.42.10` par défaut), hors de la plage donnée aux autres conteneurs (`NET_IP_RANGE`), et le site reçoit `TRUST_PROXY: ${TUNNEL_IP}` (`compose.yaml`, service `site` ; même valeur dans le modèle `modeles/`). **Rien à faire.** Le point 4 de la feuille de route concerne le `compose.yaml` générique de la racine (serveur de test), pas Unraid.

Vérifier :

```bash
docker inspect nicephos-tunnel --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'   # 172.29.42.10
docker exec nicephos printenv TRUST_PROXY                                                           # 172.29.42.10
docker logs nicephos 2>&1 | grep -c "TRUST_PROXY non défini"                                        # 0
```

Les deux adresses doivent être identiques. Si vous changez `TUNNEL_IP` dans le `.env`, les deux suivent.

---

## 1. Zitadel, maintenant

Console de l'instance : `https://<instance>.zitadel.cloud/ui/console`.

### 1.1 Second facteur obligatoire pour tous

**Avant** : chacun des deux comptes enregistre **deux** facteurs (par exemple une passkey ou une clé de sécurité, et une application d'authentification) : **Utilisateur → Mon compte → Authentification à plusieurs facteurs**. Un facteur perdu ne bloque alors pas le compte.

1. Votre organisation → **Settings → Login Behavior and Security** (ou *Login Behavior and Access* selon la version) :
   - **Force MFA** : coché ;
   - **Force MFA for local authenticated users only** : **décoché** (sinon une connexion par Google passe sans second facteur de Zitadel) ;
   - *Register allowed* : décoché (déjà fait à l'installation).
2. Facteurs admis : *Multifactor* : application d'authentification (TOTP), clé de sécurité / passkey (U2F). Évitez SMS et e-mail comme second facteur.

Vérifier : déconnectez-vous du site, reconnectez-vous (y compris par « Continuer avec Google » si vous l'utilisez) : Zitadel doit demander le second facteur.
Revenir en arrière : décocher **Force MFA**.

Puis, dans l'admin du site : **Réglages → Droits & confidentialité → « L'authentification à deux facteurs est activée »** (la page `/confidentialite` le dit alors).

### 1.2 Vérifier ce que dit le jeton (`amr`)

Pour confirmer la compatibilité avec la future console : après une connexion **par Google puis second facteur**, et une connexion **par mot de passe puis second facteur**, regarder la revendication `amr` du jeton d'identité. Le plus simple : je fournirai à la phase B une page de test de la Vigie qui l'affiche ; en attendant, la console Zitadel montre les sessions de l'utilisateur et leurs facteurs (**Users → l'utilisateur → Sessions**, selon la version). Ce qu'on attend : `mfa` présent dans `amr` dans les deux cas.

### 1.3 Compte de service en lecture seule (événements)

1. **Users → Service Users → New** : nom d'utilisateur `vigie-lecture`, nom « Vigie (lecture) », type de jeton d'accès **JWT**.
2. Dans sa fiche → **Keys → New** : type **JSON**, date d'expiration dans un an → télécharger le fichier. Gardez-le dans votre gestionnaire de mots de passe ; il ira dans le `.env` de la Vigie à la phase B (`VIGIE_ZITADEL_KEY_FILE`). Jamais dans le dépôt.
3. **Rôle d'instance** : menu de l'instance (**Default settings** / *Instance*) → **Managers** (ou *Administrators*) → **Add** → `vigie-lecture` → rôle **`IAM_OWNER_VIEWER`**, et **aucun autre**.

### 1.4 Liste des types d'événements (à me transmettre)

Pour un essai ponctuel, le plus simple est un jeton personnel **temporaire** :

1. Fiche de `vigie-lecture` → **Personal Access Tokens → New**, expiration **demain** → copier le jeton.
2. Dans un terminal (Unraid ou votre ordinateur) :

   ```bash
   ZITADEL=https://<instance>.zitadel.cloud
   PAT='COLLER_LE_JETON'

   # Types d'événements de votre instance (c'est cette liste qu'il me faut) :
   curl -s -X POST "$ZITADEL/admin/v1/events/types/_search" \
     -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d '{}' > zitadel-types.json

   # Essai de lecture : les échecs de mot de passe des dernières 24 h (peut être vide)
   curl -s -X POST "$ZITADEL/admin/v1/events/_search" \
     -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
     -d "{\"asc\":true,\"limit\":50,\"creation_date\":\"$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ)\",\"event_types\":[\"user.human.password.check.failed\"]}" | head -c 2000
   ```

   (Sur macOS : `date -u -v-1d +%Y-%m-%dT%H:%M:%SZ`.)
3. **Supprimer le jeton personnel** tout de suite après (**Personal Access Tokens → supprimer**). La Vigie utilisera la clé JSON.
4. Me transmettre `zitadel-types.json` (la liste des types ne contient aucune donnée personnelle). **Ne pas** transmettre le résultat du second appel : il peut contenir des identifiants et des adresses.

Si le premier appel répond `403` / `PermissionDenied` : le rôle `IAM_OWNER_VIEWER` n'est pas posé au niveau de l'instance (étape 1.3.3).

---

## 2. Cloudflare, maintenant

Tableau de bord Cloudflare → zone **nicephos.art**. Faire une étape à la fois et vérifier le site (public, admin, publication Instagram) avant la suivante.

### 2.1 Chiffrement et DNS

| Où | Réglage |
|---|---|
| **SSL/TLS → Overview** | **Full (strict)** |
| **SSL/TLS → Edge Certificates** | *Always Use HTTPS* : on · *Minimum TLS Version* : **TLS 1.2** · *TLS 1.3* : on · *Automatic HTTPS Rewrites* : on · **HSTS : ne rien activer ici** (le site l'envoie lui-même) |
| **DNS → Settings** | **DNSSEC → Enable**, puis copier l'enregistrement **DS** affiché chez votre registraire (zone du domaine). Statut « Active » sous 24 h environ |
| **DNS → Records** | **Add record → CAA** : *Name* `@`, *Tag* « Only allow specific hostnames » (`issue`), *CA domain* `pki.goog`. Cloudflare ajoute alors de lui-même, pour son certificat universel, les autres autorités dont il a besoin (vérifiez qu'elles apparaissent dans la liste ; sinon, ajoutez `letsencrypt.org` et `ssl.com`) |

Vérifier : `https://www.nicephos.art` s'ouvre, cadenas valide ; `dig +short CAA nicephos.art` liste les autorités.
Revenir en arrière : supprimer les enregistrements CAA ; DNSSEC se désactive chez le registraire puis chez Cloudflare.

### 2.2 En-têtes et options qui injectent des scripts

| Où | Réglage |
|---|---|
| **Rules → Settings → Managed Transforms** (ou *Rules → Transform Rules → Managed Transforms*) | **Add visitor location headers** : on · **Remove "X-Powered-By" headers** : on · **Add security headers** : **off** (ceux du site sont plus stricts) |
| **Speed → Optimization** | *Rocket Loader* : off · *Mirage* : off (s'ils sont proposés) |
| **Scrape Shield** | *Email Address Obfuscation* : off · *Hotlink Protection* : off (le partage Instagram en a besoin) |
| **Analytics & Logs → Web Analytics** | injection automatique du script : **off** |

Vérifier : dans le navigateur (outils de développement → Réseau), aucune requête vers un autre domaine que `www.nicephos.art` ; console sans erreur CSP.

### 2.3 Réglages de sécurité

| Où | Réglage |
|---|---|
| **Security → Settings** | *Security Level* : **Medium** · *Browser Integrity Check* : on · *Challenge Passage* : **30 minutes** |
| **Security → Bots** | **Block AI bots** (ou *AI Scrapers and Crawlers*) : on, si proposé · **Bot Fight Mode** : on, **puis tester tout de suite une publication Instagram** ; si elle échoue (Meta ne récupère pas l'image), remettre Bot Fight Mode sur off : il ne peut pas être contourné en offre gratuite |
| **Security → WAF → Managed rules** | *Cloudflare Free Managed Ruleset* : laisser actif |

### 2.4 Liste et règles personnalisées

1. **Manage Account → Configurations → Lists → Create new list** : nom `vigie_bloquees`, type **IP**, vide. (La Vigie la remplira par l'API en phase E ; vous pouvez y mettre une adresse à la main.)
2. **Security → WAF → Custom rules → Create rule**, dans cet ordre. Pour chacune : *Edit expression*, coller l'expression, choisir l'action, **Deploy**.

| Ordre | Nom | Action | Expression |
|---|---|---|---|
| 1 | Vigie : adresses bloquées | Block | `(ip.src in $vigie_bloquees)` |
| 2 | Outils d'attaque | Block | `(http.user_agent eq "") or (lower(http.user_agent) contains "sqlmap") or (lower(http.user_agent) contains "nikto") or (lower(http.user_agent) contains "nuclei") or (lower(http.user_agent) contains "masscan") or (lower(http.user_agent) contains "zgrab") or (lower(http.user_agent) contains "wpscan") or (lower(http.user_agent) contains "acunetix")` |
| 3 | Chemins de scanners | Block | `(http.request.uri.path contains "/wp-") or (ends_with(http.request.uri.path, ".php")) or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "/phpmyadmin") or (http.request.uri.path contains "/cgi-bin") or (http.request.uri.path contains "/.aws") or (http.request.uri.path contains "/server-status")` |
| 4 | Méthodes inutiles | Block | `not (http.request.method in {"GET" "HEAD" "POST"})` |
| 5 | Admin hors pays habituels | Managed Challenge | `(starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/auth/")) and not (ip.src.country in {"FR" "DE" "CH" "BE" "LU" "AT" "IT" "ES" "NL" "GB" "PT"}) and not cf.client.bot` |

- Règle 5 : liste des pays à ajuster (décision D13 à D15 en attente) ; si l'admin passe plus tard derrière Cloudflare Access, elle sera remplacée.
- Vérifier : `curl -sI https://www.nicephos.art/wp-login.php` → `403` ; `curl -sI -A "" https://www.nicephos.art/` → `403` ; `curl -sI -X PUT https://www.nicephos.art/` → `403` ; le site, l'admin et une publication Instagram fonctionnent. **Security → Events** montre les blocages (24 h d'historique).
- Revenir en arrière : chaque règle se désactive d'un clic dans la liste.

### 2.5 Limite de débit des images

**Security → WAF → Rate limiting rules → Create rule** :

- nom : « Images : aspiration » ;
- expression : `(starts_with(http.request.uri.path, "/media/"))` ;
- *Counting characteristics* : IP (seul choix en gratuit) ;
- *When rate exceeds* : **200** requêtes par **10 secondes** ;
- action : **Block**, durée : 10 secondes (imposée en gratuit).

Vérifier pendant une semaine dans **Security → Events** qu'aucun visiteur légitime n'est bloqué (défilement rapide de la grille, visionneuse). Si tout va bien, descendre à 150 (décision D15).

### 2.6 Notifications

**Notifications → Add** (adresse des deux administrateurs) :

- **HTTP DDoS Attack Alert** ;
- **Tunnel Health Alert** (état du tunnel), si proposé ;
- alertes de certificat (*Universal SSL*), si proposées.

---

## 3. Avec la Vigie (phase B) — à préparer quand vous voulez

### 3.1 Zitadel : projet « Vigie »

1. **Projects → Create New Project** : « Vigie ». Dans le projet :
   - **Roles → New**, quatre rôles (clé / nom affiché) : `vigie.viewer` « Lecteur », `vigie.handler` « Intervenant », `vigie.analyst` « Analyste », `vigie.admin` « Administrateur » ;
   - réglages du projet : **Assert Roles on Authentication** (nouvelle console : *Assign user roles during authentication*) et **Check authorization on Authentication** cochés (un compte sans rôle `vigie.*` est refusé dès Zitadel).
2. **Applications → New** : « Console Vigie », type **Web**, méthode **CODE** (secret client ; la Vigie ajoute PKCE) :
   - *Redirect URIs* : `https://vigie.nicephos.art/auth/callback` ;
   - *Post Logout URIs* : `https://vigie.nicephos.art/` ;
   - onglet **Token Settings** : **User roles inside ID Token** et **Include user's profile info in the ID Token** (ancien nom : *User Info inside ID Token*) cochés, puis **Save** (la case seule ne s'enregistre pas). La console ne lit les rôles et le nom que dans l'ID token : sans la première case, elle répond « Connexion refusée : votre compte Zitadel n'a aucun rôle » même avec `vigie.admin` ;
   - noter **Client ID** et **Client Secret** (montré une seule fois) pour le `.env` de la Vigie.
3. **Authorizations → New** : chacun des deux administrateurs → **`vigie.admin`**.
4. Seconde application dans le même projet, pour Cloudflare Access : « Cloudflare Access », type **Web**, méthode **CODE**, *Redirect URI* `https://<équipe>.cloudflareaccess.com/cdn-cgi/access/callback` (nom d'équipe : étape 3.2.1) ; onglet **Token Settings** : **Include user's profile info in the ID Token** (ancien nom : *User Info inside ID Token*) coché, puis **Save** (Cloudflare ne lit l'adresse e-mail que dans l'ID token : sans cette case, le test de la méthode de connexion répond « User email was not returned »). Noter Client ID et secret.

### 3.2 Cloudflare Zero Trust : Access devant la console

1. **Zero Trust** (one.dash.cloudflare.com) → première ouverture : choisir un **nom d'équipe** (*team name*) et l'offre **Free** (50 utilisateurs ; une carte bancaire peut être demandée pour l'offre gratuite, sans débit).
2. **Settings → Authentication → Login methods → Add new → OpenID Connect** :
   - *Name* : Zitadel ;
   - *App ID* / *Client secret* : ceux de l'application « Cloudflare Access » (3.1.4) ;
   - *Auth URL* : `https://<instance>.zitadel.cloud/oauth/v2/authorize` ;
   - *Token URL* : `https://<instance>.zitadel.cloud/oauth/v2/token` ;
   - *Certificate URL* : `https://<instance>.zitadel.cloud/oauth/v2/keys` ;
   - *PKCE* : on ; scopes : ceux par défaut (`openid email profile`) ; *OIDC Claims* : vide (ce champ n'est pas celui des scopes) ;
   - **Test** : la connexion doit aboutir avec votre compte Zitadel, et la réponse contenir `email`. Une réponse avec seulement `id` et `amr` (`"oidc_fields": {}`) veut dire que l'e-mail manque dans l'ID token : case *Include user's profile info in the ID Token* de l'étape 3.1.4, sur l'application dont le Client ID est celui saisi ici (« Cloudflare Access », pas « Console Vigie »), et adresse e-mail renseignée sur le compte.
   - Ajouter aussi **One-time PIN** (code par e-mail) comme méthode de secours.
3. **Access → Applications → Add an application → Self-hosted** :
   - nom : « Vigie » ; *Application domain* : `vigie.nicephos.art` ; *Session duration* : **8 hours** ;
   - *Identity providers* : Zitadel et One-time PIN ; *Instant Auth* : off ;
   - politique **Allow** « Administrateurs » : *Include → Emails* : les deux adresses ;
   - noter l'**Application Audience (AUD) Tag** (onglet *Overview* de l'application) : il ira dans le `.env` de la Vigie (`VIGIE_ACCESS_AUD`), avec le nom d'équipe (`VIGIE_ACCESS_TEAM`).
4. **Networks → Tunnels → nicephos → Public Hostname → Add** : `vigie.nicephos.art`, service **HTTP** (pas HTTPS), URL : `172.29.42.20:4200` (adresse fixe de la console sur le réseau du tunnel, `VIGIE_CONSOLE_IP`). **Jamais l'adresse de l'Unraid** (`10.21.30.222:4200`…) : le port 4200 n'est pas publié sur l'hôte, Cloudflare répondrait « Host Error ». **Seulement quand la Vigie tourne avec la console réglée** (étape 3.5).
5. **Un seul connecteur** : onglet **Connectors** du tunnel. Seul le conteneur `nicephos-tunnel` de la pile est sur le réseau de la console ; un second `cloudflared` lancé avec le même jeton (modèle Unraid « Cloudflared Tunnel », autre machine) reçoit une partie des requêtes et ne joint pas `172.29.42.20` : 502 « Bad gateway » une fois sur deux, typiquement au retour de Zitadel. Arrêter l'autre (et son démarrage automatique), après avoir vérifié que `nicephos-tunnel` joint les autres services du tunnel (wiki [Vigie, Dépannage](https://github.com/Volfieldd/deux-regards/wiki/Vigie#dépannage)), ou lui donner un tunnel à lui.

### 3.5 `vigie.env` : la console

Avec ce qui a été noté aux étapes 3.1 et 3.2 :

```
VIGIE_CONSOLE_CLIENT_ID=<Client ID de « Console Vigie »>
VIGIE_CONSOLE_PROJECT_ID=<identifiant du projet « Vigie » (Projects → Vigie, en haut de la page)>
VIGIE_CONSOLE_ORG_ID=<identifiant de l'organisation propriétaire du projet (Organization → en haut de la page)>
VIGIE_ACCESS_TEAM=<nom d'équipe Zero Trust>
VIGIE_ACCESS_AUD=<Application Audience (AUD) Tag>
VIGIE_ADMIN_SUBS=<sub Zitadel des deux administrateurs, séparés par une virgule>
```

Une valeur par ligne, rien d'autre après le `=` (pas de commentaire en fin de ligne). Le **Client Secret** va dans un fichier, jamais dans `vigie.env` : `VIGIE_SECRETS_DIR/console-secret` (celui de « Console Vigie », pas de « Cloudflare Access » ; une ligne, `chmod 600`, propriétaire 99:100). Le sub d'un compte se lit dans Zitadel (**Users →** le compte, champ *ID*). La console exige aussi la lecture des événements : `VIGIE_ZITADEL_ISSUER=https://<instance>.zitadel.cloud` décommenté dans `vigie.env` et la clé dans `VIGIE_SECRETS_DIR/zitadel.json` (étape 1.3) ; elle relit les rôles `vigie.*` toutes les 5 minutes par ce compte de service. Chaque relecture compte deux requêtes dans le quota mensuel de l'API de Zitadel Cloud (offre gratuite : 5 000) ; la Vigie compte ce qu'elle consomme et prévient à 80 % (wiki, « Quota de l'API de Zitadel Cloud »). Sans eux, la Vigie refuse de démarrer : « La console exige VIGIE_ZITADEL_ISSUER et le compte de service ».

Première connexion : vérifier que la console vous laisse entrer avec la clé d'accès. Un refus « clé d'accès exigée » veut dire que le jeton ne porte pas `mfa` dans `amr` : revoir l'étape 1.1, et me transmettre la ligne `vigie_console_refus` du journal (`docker exec nicephos-vigie node vigie/cli.js console`), qui donne le contenu de `amr`. Autres symptômes (« Host Error », 502, « User email was not returned », « Connexion refusée ») : wiki [Vigie, Dépannage](https://github.com/Volfieldd/deux-regards/wiki/Vigie#dépannage).

### 3.3 Redirection vers `www` : exclure la console

**Rules → Redirect Rules** → la règle « tout vers www » (installation, étape 4.5) → *Edit expression* :

```
not (http.host in {"www.nicephos.art" "vigie.nicephos.art"})
```

au lieu de `(http.host ne "www.nicephos.art")`. Le reste de la règle ne change pas.

Vérifier : `curl -sI https://nicephos.art/` → `301` vers `www` ; `curl -sI https://vigie.nicephos.art/` → `302` vers la connexion Cloudflare Access.

### 3.4 Liste des adresses bloquées chez Cloudflare (phase E3, facultative)

La Vigie recopie ses blocages de tout le site de 24 h et plus dans une liste d'adresses de votre compte Cloudflare ; une règle du pare-feu bloque cette liste avant tout le reste (le Worker de bordure n'est même pas appelé : son quota gratuit est épargné, et le blocage tient si le Worker est coupé).

Il faut la bordure en place (étape 3.7).

1. **Le jeton de la bordure** (celui de `VIGIE_SECRETS_DIR/cloudflare-token`, étape 3.7) : **My Profile → API Tokens →** le jeton « Vigie » **→ Edit**, ajouter la permission **Account → Account Filter Lists → Edit** (votre compte seulement). Rien d'autre ne change.
2. **`vigie.env`** : `VIGIE_CF_LISTE=vigie_bloquees`, puis redémarrer la Vigie. Elle crée la liste si elle n'existe pas (**Manage Account → Configurations → Lists**), puis la remplit dans les 5 minutes.
3. **La règle** : **Security → WAF → Custom rules → Create rule** sur la zone `nicephos.art` :
   - nom : « Vigie : adresses bloquées » ;
   - *Field* : **IP Source Address**, *Operator* : **is in list**, *Value* : `vigie_bloquees` (expression : `(ip.src in $vigie_bloquees)`) ;
   - *Action* : **Block** ; placer la règle **en premier**.
4. Vérifier : `docker exec nicephos-vigie node vigie/cli.js bordure` affiche « Liste chez Cloudflare (vigie_bloquees) : N adresse(s), rapprochée le … ». La page **Santé** de la console le montre aussi.

Ce que la Vigie ne touche jamais : une entrée ajoutée à la main dans la liste (sans commentaire « Vigie #… »). Pour arrêter : retirer `VIGIE_CF_LISTE` (les entrées de la Vigie restent jusqu'à ce que vous vidiez la liste) ou désactiver la règle.

### 3.6 Mode urgence depuis la console (« I'm Under Attack », facultatif)

Le mode urgence fait passer chaque visiteur par une vérification de son navigateur chez Cloudflare (quelques secondes) avant le site : utile contre une attaque massive. La console (Règles et réglages, Analyste ou Administrateur, identité redemandée) l'active pour une durée (24 h au plus par défaut, `VIGIE_CF_URGENCE_MAX`) ; à la fin, la Vigie remet le niveau de sécurité d'avant. Chaque activation ouvre une alerte haute (les Administrateurs sont prévenus).

1. **Jeton à part** (droit plus large que celui de la bordure : il ne sert qu'à ça) : **My Profile → API Tokens → Create Token → Custom token**, nom « Vigie : mode urgence », *Permissions* : **Zone → Zone Settings → Edit**, *Zone Resources* : **Specific zone → nicephos.art**, filtrage par adresse si l'adresse d'Unraid est fixe, *TTL* : un an.
2. Le jeton va dans `VIGIE_SECRETS_DIR/cloudflare-urgence` (une ligne, `chmod 600`, propriétaire 99:100) ; l'identifiant de la zone (page d'accueil de la zone, colonne de droite, *Zone ID*) dans `vigie.env` : `VIGIE_CF_ZONE_ID=…`. Redémarrer la Vigie.
3. Essai : `docker exec nicephos-vigie node vigie/cli.js urgence marche --duree 1h --motif "essai"`, ouvrir le site (la page de vérification de Cloudflare apparaît), puis `… urgence arret`.

### 3.7 Bordure Cloudflare (phase C3, facultative)

Un Worker Cloudflare (`bordure/`, offre gratuite) devant l'admin, la connexion et les pages : il bloque avant le site les adresses bloquées par la Vigie, transmet au site l'opérateur réseau et l'empreinte TLS en en-têtes signés, et écrit ce qu'il voit dans Analytics Engine, que la Vigie relit chaque minute ([ce qu'il fait](../../docs/wiki/Vigie.md#bordure-cloudflare-phase-c3-facultative)). Les étapes 3.4 (liste des adresses bloquées) et 3.6 (mode urgence) sont indépendantes ; la 3.4 réutilise le jeton de cette étape.

Trois noms à ne pas confondre :

| Nom | Quoi | Sens | Où il est écrit |
|---|---|---|---|
| `vigie-blocages` | espace **Workers KV** : la liste signée des blocages | Vigie → Worker | son **identifiant** (32 caractères) dans `VIGIE_CF_KV_NAMESPACE` et dans `wrangler.toml` (`id`) |
| `vigie_bordure` | jeu de données **Analytics Engine** : un point par requête | Worker → Vigie | un **nom** choisi, le même dans `wrangler.toml` (`dataset`) et `VIGIE_CF_DATASET` ; ne pas mettre la variable suffit (c'est la valeur par défaut). Cloudflare le crée au premier point écrit : rien à créer ni à récupérer |
| `vigie-bordure` | le **Worker** lui-même | — | `name` de `wrangler.toml` |

L'ordre ci-dessous ne coupe jamais le site : sans en-têtes de la bordure, le site ne change rien ; sans liste dans KV, le Worker laisse tout passer.

**Il faut** : une machine avec Node 20 ou plus et une copie du dépôt (votre ordinateur : Wrangler ne tourne pas sur Unraid), et `npx wrangler@4 login` une fois (ouvre le navigateur sur votre compte Cloudflare).

1. **Espace KV** : `npx wrangler@4 kv namespace create vigie-blocages`, ou **Storage & Databases → Workers KV → Create** avec ce nom. Noter son **ID** (colonne ID de la liste des espaces, 32 caractères hexadécimaux).
2. **Clé partagée entre le Worker et le site**, sur Unraid : `openssl rand -base64 32`, la valeur dans le `.env` du site : `VIGIE_BORDURE_KEY=…` (32 caractères au moins, **différente** de `VIGIE_INGEST_KEY`), puis `docker compose up -d site` dans le dossier de la pile.
3. **Jeton pour la Vigie** : **My Profile → API Tokens → Create Token → Custom token**, nom « Vigie : bordure », *Permissions* : **Account → Account Analytics → Read** et **Account → Workers KV Storage → Edit** (plus **Account → Account Filter Lists → Edit** si vous ferez l'étape 3.4), *Account Resources* : votre compte seulement. Le jeton (une ligne) va dans `VIGIE_SECRETS_DIR/cloudflare-token`, `chmod 600`, propriétaire `99:100`. Le droit sur KV vaut pour tous les espaces du compte (Cloudflare ne permet pas mieux) : ce fichier ne va nulle part ailleurs.
4. **`vigie.env`** : `VIGIE_CF_ACCOUNT_ID=…` (**Account ID** : page d'accueil du compte, ou colonne de droite de la zone) et `VIGIE_CF_KV_NAMESPACE=…` (l'ID de l'étape 1). Pas de `VIGIE_CF_DATASET`. Puis recréer la Vigie : `docker compose --profile vigie up -d vigie` (**pas** `docker restart`, qui garde l'ancien `vigie.env`), et lire `docker logs --tail 30 nicephos-vigie`. La Vigie refuse de démarrer sur une valeur fausse, en le disant :

   | Message | Cause |
   |---|---|
   | `VIGIE_CF_ACCOUNT_ID : identifiant de compte…` | pas 32 caractères hexadécimaux (guillemets, espace, fin de ligne Windows : `sed -i 's/\r$//' vigie.env`) |
   | `VIGIE_CF_KV_NAMESPACE est obligatoire avec VIGIE_CF_ACCOUNT_ID` | ID de l'espace KV absent ou mal copié |
   | `VIGIE_CF_TOKEN_FILE : jeton Cloudflare introuvable` | fichier de l'étape 3 absent de `VIGIE_SECRETS_DIR` |
   | `VIGIE_CF_DATASET : nom de jeu de données invalide` | ligne `VIGIE_CF_DATASET` à retirer (ou exactement `vigie_bordure`) |

   À ce stade, la Vigie écrit sa liste dans KV et ne lit encore rien : la page **Santé** dit la bordure muette jusqu'à l'étape 6.
5. **Remplir `wrangler.toml`**, sur votre ordinateur, dans le dépôt : copier `vigie.env` et le `.env` du site depuis Unraid (dossier de la pile), puis :

   ```bash
   ./bordure/remplir-wrangler.sh --secret ~/vigie.env ~/site.env
   rm ~/vigie.env ~/site.env          # le .env du site contient des secrets
   ```

   Le script crée `bordure/wrangler.toml` (ignoré par Git) depuis le modèle, y met le compte, l'ID KV, le jeu de données et la clé publique des décisions (`VIGIE_DECISIONS_PUBKEY` du site), vérifie chaque valeur, et avec `--secret` pose `BORDURE_KEY` chez Cloudflare (la valeur de `VIGIE_BORDURE_KEY`, jamais affichée). Relancé, il met le fichier à jour (copie `wrangler.toml.bak`).
6. **Déployer** : `cd bordure && npx wrangler@4 deploy`. **Le Worker est en service dès cette commande** : elle pose la route `nicephos.art/*`.
7. **Routes**, tout de suite après (**Workers Routes** de la zone `nicephos.art`) :
   - la route `nicephos.art/*` → `vigie-bordure` : **Edit**, *Request limit failure mode* : **Fail open** (au-delà de 100 000 requêtes par jour, elles passent au lieu d'échouer) ;
   - **Add route** pour chacun de `nicephos.art/media/*`, `nicephos.art/static/*`, `nicephos.art/fonts/*`, `nicephos.art/partage/*`, `nicephos.art/admin/media/*`, *Worker* : **None** (images et fichiers ne comptent pas dans le quota ; le Worker les laisserait passer de toute façon).
8. **Vérifier**, après 5 à 10 minutes de trafic : `docker exec nicephos-vigie node vigie/cli.js bordure` donne un **dernier battement du Worker** de moins de 5 minutes et une **dernière requête vue** ; la page **Santé** de la console ne dit plus la bordure muette ; aucun `edge_signature_invalid` dans le **Journal** de la console (sinon : motif « signature fausse » → `BORDURE_KEY` différente de `VIGIE_BORDURE_KEY`, relancer le script avec `--secret` ; « adresse différente » → `TRUST_PROXY` du site, étape 0). Ensuite, si vous voulez, l'étape 3.4.

**Revenir en arrière** : effet immédiat avec `DESACTIVE = "1"` dans `bordure/wrangler.toml` puis `npx wrangler@4 deploy` (tout passe, rien n'est bloqué ni compté), ou supprimer la route `nicephos.art/*`. Pour tout retirer : la route, `VIGIE_BORDURE_KEY` du `.env` du site et les `VIGIE_CF_*` de `vigie.env` (sauf `VIGIE_CF_ZONE_ID` du mode urgence), puis `docker compose up -d site` et `docker compose --profile vigie up -d vigie`.

---

## Récapitulatif

| Étape | Quand | Fait |
|---|---|---|
| 0. `TRUST_PROXY` vérifié | maintenant | ☐ |
| 1.1 Second facteur obligatoire (deux facteurs par compte avant) | maintenant | ☐ |
| 1.2 `amr` vérifié | maintenant ou phase B | ☐ |
| 1.3 Compte `vigie-lecture`, clé JSON, `IAM_OWNER_VIEWER` | maintenant | ☐ |
| 1.4 `zitadel-types.json` transmis, jeton temporaire supprimé | maintenant | ☐ |
| 2.1 à 2.6 Cloudflare | maintenant, une étape à la fois | ☐ |
| Passerelle Signal ([`signal/README.md`](signal/README.md)) | maintenant | ☐ |
| 3.1 à 3.3 Projet Vigie, Access, redirection | phase B | ☐ |
| 3.7 Bordure Cloudflare (Worker, KV, jeton) | phase C3, facultative | ☐ |
| 3.4 Liste des adresses bloquées chez Cloudflare (après 3.7) | phase E3, facultative | ☐ |
| 3.6 Mode urgence | facultatif | ☐ |
| Sorties réseau : mandataire, règles de l'hôte, journaux lus par la Vigie ([`reseau/README.md`](reseau/README.md)) | phase E4, instance de test d'abord | ☐ |
