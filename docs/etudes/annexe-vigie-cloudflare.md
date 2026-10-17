# Annexe : Cloudflare, configuration gratuite recommandée

| | |
|---|---|
| Statut | Étude. Réglages à faire dans le tableau de bord de Cloudflare (phase 0) puis, pour la recopie des blocages, par l'API (phase E, décision D11 prise le 17 octobre 2026). Rien n'est fait. Les règles R1 et la liste ne servent que si la Vigie est installée (elle est facultative) ; les autres réglages valent pour tout site. |
| Date | 17 octobre 2026. Limites de l'offre gratuite vérifiées ce jour-là dans la documentation de Cloudflare (sources en fin de document) ; Cloudflare les change souvent : ce qui est marqué « à vérifier » se contrôle dans le tableau de bord avant d'être réglé. |
| Contexte | Site derrière Cloudflare Tunnel (`cloudflared`), toutes les adresses redirigées vers `https://www.nicephos.art` ([Déploiement](../wiki/Déploiement.md)). Offre **Free**. |
| Lien | [Architecture de la Vigie](annexe-vigie-architecture.md) |

**Règle de cette annexe** : tout ce qui est payant est marqué **payant** et n'est pas retenu.

---

## 1. Ce que donne l'offre gratuite (sécurité)

| Fonction | Offre gratuite | Usage ici |
|---|---|---|
| Règles personnalisées du WAF (*custom rules*) | **5 règles** ; pas d'expressions régulières (Business et plus) ; action « Log » absente | section 3 |
| Règles de limite de débit (*rate limiting rules*) | **1 règle**, comptée par adresse seulement, période fixe de **10 s**, blocage fixe de **10 s**, action « Block » | section 4 |
| Règles d'accès IP (*IP Access Rules*) | jusqu'à 50 000 ; blocage d'un **pays** par cette voie : Enterprise seulement (**payant**) — mais une règle personnalisée sur `ip.src.country` le permet | blocages ponctuels à la main |
| Listes personnalisées (*Lists*) | **1 liste**, adresses IP seulement, **10 000** entrées au total | liste `vigie_bloquees` alimentée par la Vigie (phase E) |
| Jeu de règles géré gratuit (*Free Managed Ruleset*) | actif d'office, vulnérabilités à fort impact | laisser actif |
| Jeu de règles géré complet de Cloudflare, jeu OWASP | **payant** (Pro et plus) | non retenu |
| Bot Fight Mode | gratuit ; non réglable, ne peut pas être contourné par une règle | section 5, avec précaution |
| Super Bot Fight Mode, score de robot | **payant** (Pro et plus) | non retenu |
| Événements de sécurité (*Security Events*) | 24 h d'historique, échantillonnés | consultation ; import dans la Vigie à étudier (section 8) |
| Logpush (envoi de tous les journaux) | **payant** (Enterprise) | non retenu |
| En-têtes de position (*Add visitor location headers*) | toutes offres | voyage impossible (`DS3`) |
| Cloudflare Access (Zero Trust) | gratuit jusqu'à **50 utilisateurs** | console de la Vigie ; option pour l'admin (section 6) |
| Notifications | par e-mail ; alertes d'attaque DDoS HTTP incluses dans l'offre gratuite | section 9 |
| Turnstile (vérification anti-robot) | gratuit | **non retenu** : il charge un script de Cloudflare dans la page, contraire à la règle du site « aucune ressource tierce » |

---

## 2. Réglages de base (tableau de bord)

| Où | Réglage | Pourquoi |
|---|---|---|
| SSL/TLS → Overview | **Full (strict)** | aucune connexion en clair, même si l'origine change un jour |
| SSL/TLS → Edge Certificates | *Always Use HTTPS* : oui ; *Minimum TLS Version* : **1.2** ; *TLS 1.3* : oui ; *Automatic HTTPS Rewrites* : oui | |
| SSL/TLS → Edge Certificates | HSTS : **laisser au site** (il l'envoie déjà) ; ajouter `includeSubDomains` seulement quand tous les sous-domaines sont en HTTPS (feuille de route, point 3) | une seule source pour l'en-tête |
| DNS → Settings | **DNSSEC** : activer (gratuit), puis reporter l'enregistrement DS chez le registraire | empêche l'usurpation du domaine par le DNS |
| DNS → Records | enregistrements **CAA** limitant l'émission de certificats aux autorités qu'utilise Cloudflare (liste dans la documentation Cloudflare) | un tiers ne peut pas obtenir un certificat du domaine ailleurs |
| Security → Settings | *Security Level* : **Medium** ; *Browser Integrity Check* : oui ; *Challenge Passage* : 30 min | |
| Rules → Managed Transforms | *Add visitor location headers* : **oui** ; *Remove "X-Powered-By" headers* : oui ; *Add security headers* : **non** (le site envoie déjà des en-têtes plus stricts ; ceux de Cloudflare, comme `X-Frame-Options: SAMEORIGIN`, les affaibliraient) | |
| Speed → Optimization | *Rocket Loader*, *Email Address Obfuscation*, *Mirage* : **non** ; Web Analytics de Cloudflare (injection automatique) : **non** | ils injectent des scripts : la CSP du site les bloquerait, et ce seraient des ressources tierces |
| Caching → Cache Rules | aucune règle qui mette en cache `/admin`, `/auth`, `/bonjour`, `/pour-vous` (le site les envoie déjà en `no-store`) ; vérifier après tout changement de règle de cache | une page de l'admin en cache partagé serait une fuite |
| Network | *IPv6* : oui ; *WebSockets* : non (inutiles) | surface réduite |
| Rules → Redirect Rules | la règle qui renvoie tout vers `www` (`deploy/unraid/README.md`, étape 4.5) doit **exclure la console** : expression `not http.host in {"www.nicephos.art" "vigie.nicephos.art"}` au lieu de `(http.host ne "www.nicephos.art")` ; dans le tunnel, *Public Hostname* `vigie.nicephos.art` → la Vigie (l'enregistrement DNS créé par le tunnel prime sur le `*` de redirection) | sans cela, la console serait redirigée vers le site |

---

## 3. Les 5 règles personnalisées

Ordre d'exécution de haut en bas. Expressions dans le langage des règles de Cloudflare, sans expression régulière (non disponible en gratuit). Hôte : `www.nicephos.art` (les autres adresses sont déjà redirigées).

**R1 — Adresses bloquées par la Vigie** · action **Block**

```
ip.src in $vigie_bloquees
```

La liste est créée vide en phase 0, alimentée par la Vigie en phase E (`D11`). En attendant, des adresses peuvent y être mises à la main.

**R2 — Outils d'attaque connus et navigateurs vides** · action **Block**

```
http.user_agent eq ""
or lower(http.user_agent) contains "sqlmap"
or lower(http.user_agent) contains "nikto"
or lower(http.user_agent) contains "nuclei"
or lower(http.user_agent) contains "masscan"
or lower(http.user_agent) contains "zgrab"
or lower(http.user_agent) contains "wpscan"
or lower(http.user_agent) contains "acunetix"
```

**R3 — Chemins de scanners** · action **Block**

```
(http.request.uri.path contains "/wp-"
 or ends_with(http.request.uri.path, ".php")
 or http.request.uri.path contains "/.env"
 or http.request.uri.path contains "/.git"
 or http.request.uri.path contains "/phpmyadmin"
 or http.request.uri.path contains "/cgi-bin"
 or http.request.uri.path contains "/.aws"
 or http.request.uri.path contains "/server-status")
```

Le site n'a aucun de ces chemins. Contrepartie : ces requêtes n'arrivent plus aux chemins pièges du site (`E18`) ; elles restent visibles 24 h dans les événements de sécurité de Cloudflare. Le lien piège caché (`DS15`) n'est pas concerné.

**R4 — Méthodes inutiles** · action **Block**

```
not http.request.method in {"GET" "HEAD" "POST"}
```

Le site n'utilise que ces trois méthodes (vérifié le 17 octobre 2026 : aucune route `PUT`, `PATCH` ni `DELETE` dans `server/` ; l'admin envoie ses appels JSON en `POST`).

**R5 — Connexion et admin hors des pays habituels** · action **Managed Challenge**

```
(starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/auth/"))
and not ip.src.country in {"FR" "DE" "CH" "BE" "LU" "AT" "IT" "ES" "NL" "GB" "PT"}
and not cf.client.bot
```

Liste des pays à ajuster (`D14`). Un administrateur en voyage passe le défi une fois (30 min de validité). Remplacée par Cloudflare Access si l'option de la section 6 est retenue : R5 devient alors libre, par exemple pour bloquer des pays d'où ne vient aucun visiteur légitime.

---

## 4. La règle de limite de débit

Une seule en gratuit, 10 s de période, 10 s de blocage. La limite de débit de Cloudflare compte **avant le cache** : c'est le seul moyen de voir et freiner l'aspiration des images servies depuis le cache, angle mort du site (étude principale, section 7).

```
Expression : starts_with(http.request.uri.path, "/media/")
Seuil      : 150 requêtes par 10 secondes, par adresse
Action     : Block, 10 secondes
```

Le seuil est à mesurer avant activation (`D15`) : une grille qui défile vite charge plusieurs dizaines d'images ; une visionneuse qui précharge en charge quelques-unes. Commencer à 200, regarder les événements de sécurité pendant une semaine, descendre si aucun visiteur légitime n'est touché. Un blocage de 10 s ne gêne pas un humain et ralentit fortement un aspirateur.

Le site garde ses propres limites (`/auth`, `/bonjour`, signalements) : elles ne dépendent pas de Cloudflare.

---

## 5. Robots

| Réglage | Recommandation | Attention |
|---|---|---|
| **Bot Fight Mode** | à essayer | il ne peut pas être contourné par une règle en gratuit. **Tester la publication Instagram juste après** : Meta vient chercher l'image à `/partage/instagram/<jeton>.jpg` ; si Meta est mis au défi, la publication échoue. En cas d'échec : le désactiver |
| Blocage des robots d'IA (*Block AI bots*) | **oui**, si proposé dans l'offre gratuite (à vérifier dans *Security → Bots*) | protège contre l'aspiration des photos pour l'entraînement de modèles, sans gêner les moteurs de recherche |
| `robots.txt` géré par Cloudflare | non : le site sert déjà le sien | deux sources se contrediraient |

---

## 6. Cloudflare Access

**Console de la Vigie (retenu).** Application *self-hosted* sur le sous-domaine de la console (`D8`) :

- fournisseur d'identité : **Zitadel** en OIDC générique (application OIDC « Cloudflare Access » dans Zitadel, adresse de retour `https://<équipe>.cloudflareaccess.com/cdn-cgi/access/callback`) ; code à usage unique par e-mail en secours ;
- politique **Allow** : les adresses e-mail des deux administrateurs ; durée de session : 8 h ;
- la Vigie vérifie le jeton `Cf-Access-Jwt-Assertion` à chaque requête (annexe architecture, section 5.2).

**Admin du site (option recommandée, `D13`).** Une seconde application Access sur `www.nicephos.art/admin` (Access sait protéger un chemin) :

- effet : aucune requête vers l'admin n'atteint le site sans être passée par Access ; une faille dans une route de l'admin devient inexploitable depuis Internet par qui n'a pas de compte ;
- `/auth/*` reste hors d'Access (le retour OIDC du site doit passer) ;
- compte : chaque compte de l'admin (photographes, modérateurs, relecteurs) compte parmi les 50 utilisateurs gratuits ;
- à vérifier : les appels JSON de l'admin et l'app Rencontre sur le téléphone après expiration de la session Access (Access redirige une requête de navigation ; un appel JSON reçoit une erreur, l'admin doit alors recharger la page).

---

## 7. Tunnel

- Règles d'entrée (*ingress*) explicites : `www.nicephos.art` → site, sous-domaine de la console → `http://<adresse fixe de la Vigie>:4200`, et en dernier `http_status:404` (rien d'autre n'est servi).
- Aucun port de la Vigie publié sur l'hôte ; le port du site seulement sur `127.0.0.1` comme aujourd'hui.
- Le jeton du tunnel reste dans le seul conteneur `cloudflared`.

---

## 7 bis. Worker de bordure (phase C3, décision D19)

Fait le 17 octobre 2026 : `bordure/worker.js`, guide d'installation dans [Vigie](../wiki/Vigie.md#bordure-cloudflare-phase-c3-facultative). Gratuit :

| Service | Limite gratuite | Usage |
|---|---|---|
| Workers | 100 000 requêtes par jour, 10 ms de calcul par requête | une invocation par page ; routes « sans Worker » pour les images et fichiers |
| Workers KV | 100 000 lectures, 1 000 écritures par jour | liste des blocages, écrite au plus toutes les 2 minutes |
| Analytics Engine | 100 000 points écrits, 10 000 lectures par jour ; 3 mois de conservation | un point par requête ; une lecture par minute |

Le Worker complète la règle R1 (liste `vigie_bloquees`, recopiée par l'API en phase E) : R1 bloque sur tout le site, images comprises, mais sa liste est limitée à 10 000 adresses et ne connaît pas les portées « admin » et « connexion » ; le Worker applique les portées et ne coûte rien de plus.

## 8. API (phase E)

| Besoin | Droit du jeton | Coût |
|---|---|---|
| Ajouter et retirer des adresses de la liste `vigie_bloquees` | *Account → Account Filter Lists → Edit* (les listes sont au niveau du compte) ; appels : `GET /accounts/{compte}/rules/lists` (trouver la liste), `POST /accounts/{compte}/rules/lists/{liste}/items` (ajouter, avec un commentaire « Vigie #alerte, fin le … »), `DELETE …/items` (retirer), `GET …/items` (rapprochement) ; les ajouts et retraits sont asynchrones : la Vigie suit l'opération (`GET /accounts/{compte}/rules/lists/bulk_operations/{id}`) avant de marquer la décision « recopiée » | gratuit |
| Passer en mode « I'm Under Attack » depuis la console (mode urgence) | *Zone → Zone Settings → Edit*, sur la seule zone `nicephos.art` | gratuit ; droit large : jeton à part, facultatif |
| Purger une image du cache après dépublication (déjà dans la feuille de route) | *Zone → Cache Purge → Purge* | gratuit |
| Lire les événements de sécurité de Cloudflare pour les recouper dans la Vigie | *Zone → Analytics → Read* (API GraphQL) | gratuit ; **à vérifier** : jeux de données et durée accessibles en offre gratuite |

Règles pour chaque jeton : un jeton par usage, limité à la seule zone ou au seul compte, filtré par adresse source si l'adresse publique d'Unraid est fixe, date d'expiration (un an), gardé dans le `.env` de la Vigie seulement. La Vigie ne fait que des appels sortants vers `api.cloudflare.com`, bornés (délai, taille de réponse, aucune redirection suivie), comme les appels à Meta.

Synchronisation : les blocages de 24 h et plus vont dans la liste ; ceux plus courts restent au site (inutile d'user les 10 000 entrées) ; à la levée ou à l'expiration, l'entrée est retirée ; un rapprochement quotidien retire ce que la Vigie ne connaît plus.

---

## 9. Notifications de Cloudflare

À régler dans *Notifications*, vers l'adresse des administrateurs :

- **HTTP DDoS Attack Alert** (gratuit) ;
- état du tunnel (*Tunnel Health*), si proposé dans l'offre gratuite (à vérifier) : le site injoignable se voit tout de suite ;
- expiration ou problème de certificat (*Universal SSL*), si proposé.

Elles passent par Cloudflare, indépendamment du site et de la Vigie : un canal de plus qui ne dépend pas de l'hôte.

---

## 10. Payant, signalé et non retenu

| Fonction | Offre minimale | Ce qu'elle apporterait |
|---|---|---|
| Jeu de règles géré complet et OWASP Core Ruleset | Pro | plus de signatures d'attaques |
| Super Bot Fight Mode, score de robot | Pro / Business | robots classés, réglables, exceptions possibles (Instagram) |
| Plus de règles (20 en Pro), expressions régulières (Business) | Pro / Business | règles plus fines |
| Limite de débit réglable (périodes, durées, clés autres que l'adresse) | Pro et plus | limite par chemin plus juste |
| Score d'attaque du WAF (*WAF attack score*) | Business (à vérifier) | détection par apprentissage des injections |
| Logpush | Enterprise | tous les journaux de Cloudflare dans la Vigie |
| Blocage de pays par règle d'accès IP | Enterprise | inutile : la règle personnalisée R5 suffit |
| Page Shield | Business et plus | inutile : le site ne charge aucun script tiers |

---

## Décisions

| Id | Question | Proposition |
|---|---|---|
| D13 | Mettre aussi l'admin du site derrière Cloudflare Access | oui : la plus forte réduction de surface d'attaque disponible gratuitement ; à essayer d'abord sur l'instance de test |
| D14 | Pays admis sans défi pour `/admin` et `/auth` (règle R5) | France et pays voisins ; à ajuster selon vos voyages |
| D15 | Seuil de la limite de débit sur `/media/` | 200 par 10 s la première semaine, puis 150 si aucun visiteur légitime n'est bloqué |

---

## Sources

1. Cloudflare, *Custom rules* (5 règles en Free, pas d'expressions régulières avant Business, action Log absente). https://developers.cloudflare.com/waf/custom-rules/
2. Cloudflare, *Rate limiting rules* (Free : une règle, comptée par adresse, période et blocage fixes de 10 s, action Block). https://developers.cloudflare.com/waf/rate-limiting-rules/
3. Cloudflare, *IP Access rules* (50 000 règles ; blocage d'un pays réservé à Enterprise). https://developers.cloudflare.com/waf/tools/ip-access-rules/
4. Cloudflare, *Lists* (Free : une liste d'adresses, 10 000 entrées). https://developers.cloudflare.com/waf/tools/lists/
5. Cloudflare, *Managed Transforms reference* (en-têtes de position sur toutes les offres ; en-têtes de sécurité ; retrait de `X-Powered-By`). https://developers.cloudflare.com/rules/transform/managed-transforms/reference/
6. Cloudflare, *Security Events, Free plan* (24 h, échantillonné). https://developers.cloudflare.com/waf/analytics/security-events/free-plan/
7. Cloudflare, *Stop malicious bots (Free, Pro, Business)* (Bot Fight Mode, `cf.client.bot`). https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/
8. Cloudflare, *Free DDoS alerts*. https://blog.cloudflare.com/free-ddos-alerts/
9. Cloudflare, Zero Trust gratuit jusqu'à 50 utilisateurs. https://blog.cloudflare.com/teams-plans/
