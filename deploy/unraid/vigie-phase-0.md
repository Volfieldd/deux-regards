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
   - réglages du projet : **Assert Roles on Authentication** et **Check authorization on Authentication** cochés (un compte sans rôle `vigie.*` est refusé dès Zitadel).
2. **Applications → New** : « Console Vigie », type **Web**, méthode **CODE** (secret client ; la Vigie ajoute PKCE) :
   - *Redirect URIs* : `https://vigie.nicephos.art/auth/callback` ;
   - *Post Logout URIs* : `https://vigie.nicephos.art/` ;
   - onglet **Token Settings** : *User roles inside ID Token* coché ;
   - noter **Client ID** et **Client Secret** (montré une seule fois) pour le `.env` de la Vigie.
3. **Authorizations → New** : chacun des deux administrateurs → **`vigie.admin`**.
4. Seconde application dans le même projet, pour Cloudflare Access : « Cloudflare Access », type **Web**, méthode **CODE**, *Redirect URI* `https://<équipe>.cloudflareaccess.com/cdn-cgi/access/callback` (nom d'équipe : étape 3.2.1) ; onglet **Token Settings** : **User Info inside ID Token** coché (Cloudflare ne lit l'adresse e-mail que dans l'ID token : sans cette case, le test de la méthode de connexion répond « User email was not returned »). Noter Client ID et secret.

### 3.2 Cloudflare Zero Trust : Access devant la console

1. **Zero Trust** (one.dash.cloudflare.com) → première ouverture : choisir un **nom d'équipe** (*team name*) et l'offre **Free** (50 utilisateurs ; une carte bancaire peut être demandée pour l'offre gratuite, sans débit).
2. **Settings → Authentication → Login methods → Add new → OpenID Connect** :
   - *Name* : Zitadel ;
   - *App ID* / *Client secret* : ceux de l'application « Cloudflare Access » (3.1.4) ;
   - *Auth URL* : `https://<instance>.zitadel.cloud/oauth/v2/authorize` ;
   - *Token URL* : `https://<instance>.zitadel.cloud/oauth/v2/token` ;
   - *Certificate URL* : `https://<instance>.zitadel.cloud/oauth/v2/keys` ;
   - *PKCE* : on ; *OIDC Claims* / scopes : `openid email profile` ;
   - **Test** : la connexion doit aboutir avec votre compte Zitadel, et la réponse contenir `email` (sinon : case *User Info inside ID Token* de l'étape 3.1.4, sur l'application « Cloudflare Access » et non « Console Vigie »).
   - Ajouter aussi **One-time PIN** (code par e-mail) comme méthode de secours.
3. **Access → Applications → Add an application → Self-hosted** :
   - nom : « Vigie » ; *Application domain* : `vigie.nicephos.art` ; *Session duration* : **8 hours** ;
   - *Identity providers* : Zitadel et One-time PIN ; *Instant Auth* : off ;
   - politique **Allow** « Administrateurs » : *Include → Emails* : les deux adresses ;
   - noter l'**Application Audience (AUD) Tag** (onglet *Overview* de l'application) : il ira dans le `.env` de la Vigie (`VIGIE_ACCESS_AUD`), avec le nom d'équipe (`VIGIE_ACCESS_TEAM`).
4. **Networks → Tunnels → nicephos → Public Hostname → Add** : `vigie.nicephos.art`, service **HTTP**, URL : `172.29.42.20:4200` (adresse fixe de la console, `VIGIE_CONSOLE_IP`). **Seulement quand la Vigie tourne avec la console réglée** (étape 3.5).

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

Le **Client Secret** va dans un fichier, jamais dans `vigie.env` : `VIGIE_SECRETS_DIR/console-secret` (une ligne, `chmod 600`, propriétaire 99:100). Le sub d'un compte se lit dans Zitadel (**Users →** le compte, champ *ID*). La console exige aussi la lecture des événements (`VIGIE_ZITADEL_ISSUER` et `zitadel.json`, étape 1.3) : elle relit les rôles `vigie.*` toutes les 5 minutes par ce compte de service.

Première connexion : vérifier que la console vous laisse entrer avec la clé d'accès. Un refus « clé d'accès exigée » veut dire que le jeton ne porte pas `mfa` dans `amr` : revoir l'étape 1.1, et me transmettre la ligne `vigie_console_refus` du journal (`docker exec nicephos-vigie node vigie/cli.js console`), qui donne le contenu de `amr`.

### 3.3 Redirection vers `www` : exclure la console

**Rules → Redirect Rules** → la règle « tout vers www » (installation, étape 4.5) → *Edit expression* :

```
not (http.host in {"www.nicephos.art" "vigie.nicephos.art"})
```

au lieu de `(http.host ne "www.nicephos.art")`. Le reste de la règle ne change pas.

Vérifier : `curl -sI https://nicephos.art/` → `301` vers `www` ; `curl -sI https://vigie.nicephos.art/` → `302` vers la connexion Cloudflare Access.

### 3.4 Jeton d'API pour la liste (phase E)

**My Profile → API Tokens → Create Token → Custom token** :

- nom : « Vigie : liste des adresses bloquées » ;
- *Permissions* : **Account → Account Filter Lists → Edit**, rien d'autre ;
- *Account Resources* : votre compte seulement ;
- *Client IP Address Filtering* : l'adresse publique d'Unraid, si elle est fixe ;
- *TTL* : un an.

Le jeton va dans le `.env` de la Vigie (`VIGIE_CLOUDFLARE_TOKEN`) avec l'identifiant du compte et celui de la liste `vigie_bloquees`. Jamais ailleurs.

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
| 3.4 Jeton d'API | phase E | ☐ |
