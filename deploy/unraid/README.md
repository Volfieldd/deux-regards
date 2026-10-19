# Déployer Nicephos sur Unraid

Les marches à suivre ponctuelles (mise à jour, chiffrement `DATA_KEY`, disques chiffrés, deux facteurs, e-mails, app iPhone, demandes RGPD) sont regroupées dans le wiki : [Procédures](https://github.com/Volfieldd/deux-regards/wiki/Procédures).

Ce dossier contient tout le nécessaire :

| Fichier | Rôle |
|---|---|
| `compose.yaml` | la pile complète : site, sauvegarde quotidienne, tunnel Cloudflare, traducteur LibreTranslate (**méthode recommandée**) ; en option, par profil, la Vigie et sa passerelle Signal, et la tâche `bordure` qui déploie le Worker de bordure chez Cloudflare (lancée à la main : `vigie-phase-0.md`, étape 3.7) |
| `env.example` | les réglages, à copier en `.env` de la pile |
| `signal/` | **facultatif** : enregistrer le numéro de la passerelle Signal de la Vigie (alertes de sécurité sur le téléphone ; service `signal` de la pile, profil `signal`) ; guide dans [`signal/README.md`](signal/README.md) |
| `vigie-phase-0.md` | **facultatif** : réglages de Cloudflare et de Zitadel qui préparent la Vigie (second facteur, compte de lecture des événements, règles du WAF, Access) ; la partie « maintenant » sert aussi sans Vigie |
| `vigie.env.example` | **facultatif** : secrets de la Vigie, à copier en `vigie.env` dans le dossier de la pile, à côté de son `.env` (services `vigie` et `vigie-backup`, profil `vigie`) ; guide : [Vigie](https://github.com/Volfieldd/deux-regards/wiki/Vigie) |
| `modeles/*.xml` | les mêmes conteneurs en modèles Unraid (onglet Docker), si vous préférez ne pas utiliser Compose |
| `exporter-donnees.sh` | exporte les données d'une installation existante (serveur de test) pour les reprendre sur Unraid |

```
Internet ─HTTPS─► Cloudflare (www.nicephos.art ; autres adresses redirigées) ─tunnel─► nicephos-tunnel ─► nicephos:3000
                                                                                        │
                                               NICEPHOS_DIR/data ◄── /data ──────┘
                 nicephos-sauvegarde (chaque jour) ──► BACKUP_DIR
```

Aucun port n'est ouvert sur votre box : le tunnel sort vers Cloudflare, qui fournit le HTTPS.

## Ordre des étapes

1. [Image Docker](#1-image-docker) (une fois)
2. [Dossiers sur Unraid](#2-dossiers-sur-unraid)
3. [Zitadel : la connexion à l'admin](#3-zitadel--la-connexion-à-ladmin)
4. [Cloudflare : tunnel et domaines](#4-cloudflare--tunnel-et-domaines)
5. [Lancer la pile](#5-lancer-la-pile)
6. [Reprendre les données du serveur de test](#6-reprendre-les-données-du-serveur-de-test) (facultatif)
7. [Premier accès, sauvegardes, mises à jour](#7-premier-accès)

---

## 1. Image Docker

L'image est construite par GitHub à chaque mise à jour de `main` (`.github/workflows/image.yml`) et publiée sur `ghcr.io/volfieldd/deux-regards`, avec deux étiquettes : `latest` (dernière version) et `sha-xxxxxxx` (version d'un commit, pour revenir en arrière). Elle ne contient **aucune donnée** : ni photos, ni base, ni logo.

Le code est propriétaire (voir `LICENSE`) : le dépôt et les deux images (`deux-regards` et `deux-regards-vigie`) restent **privés**. Ne passez jamais un paquet en *Public* : l'image contient tout le code, et GitHub ne permet plus de rendre privé un paquet devenu public (il faudrait le supprimer).

Unraid doit donc se connecter au registre, **une seule fois** :

1. Sur GitHub, **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**, avec le seul droit `read:packages` et une longue durée. Notez sa date d'expiration : à cette date, les mises à jour échouent jusqu'à ce que vous recommenciez cette étape.
2. Dans le terminal Unraid :

   ```bash
   docker login ghcr.io -u Volfieldd          # mot de passe : le jeton
   mkdir -p /boot/config/docker-auth
   cp /root/.docker/config.json /boot/config/docker-auth/
   chmod 600 /boot/config/docker-auth/config.json
   ```

3. `/root` est en mémoire sur Unraid : la connexion disparaît à chaque redémarrage. Ajoutez ces lignes à la fin de `/boot/config/go` pour la remettre au démarrage :

   ```bash
   mkdir -p /root/.docker
   cp /boot/config/docker-auth/config.json /root/.docker/config.json
   chmod 600 /root/.docker/config.json
   ```

Compose Manager (**Compose Pull**) et les modèles de l'onglet Docker utilisent ensuite cette connexion. Un `denied` ou `unauthorized` au téléchargement veut dire : connexion perdue ou jeton expiré.

## 2. Dossiers sur Unraid

Tout part de deux réglages du `.env` de la pile (étape 5), à choisir maintenant :

- **`NICEPHOS_DIR`** : le dossier de Nicephos, sur un pool, **chiffré de préférence** (voir « Chiffrer les données » plus bas). Il contient `data/` (le site) et, s'ils servent, `vigie/`, `vigie-secrets/` et `signal/`. Chacun est monté seul dans son conteneur : le site ne voit que `data/`.
- **`BACKUP_DIR`** : les sauvegardes, sur **d'autres disques** que les données. Celles de la Vigie vont à côté, dans `BACKUP_DIR-vigie`.

Dans le terminal Unraid (icône `>_` en haut à droite), posez vos deux chemins, puis créez les dossiers :

```bash
NICEPHOS=/mnt/cache/appdata/nicephos        # = NICEPHOS_DIR du .env (par exemple /mnt/volumes/nicephos)
SAUVEGARDES=/mnt/user/backups/nicephos      # = BACKUP_DIR du .env

mkdir -p "$NICEPHOS/data" "$SAUVEGARDES"
chown 99:100 "$NICEPHOS/data" "$SAUVEGARDES"

# Vigie (facultative)
mkdir -p "$NICEPHOS/vigie" "$NICEPHOS/vigie-secrets" "$SAUVEGARDES-vigie"
chown 99:100 "$NICEPHOS/vigie" "$NICEPHOS/vigie-secrets" "$SAUVEGARDES-vigie"
chmod 700 "$NICEPHOS/vigie" "$NICEPHOS/vigie-secrets"

# Passerelle Signal (facultative) : utilisateur de son image, pas 99:100
mkdir -p "$NICEPHOS/signal"
chown 1000:1000 "$NICEPHOS/signal"
chmod 700 "$NICEPHOS/signal"

# Mandataire de sortie et journaux réseau (facultatifs, reseau/README.md)
mkdir -p "$NICEPHOS/reseau/mandataire" "$NICEPHOS/reseau/hote"
chown 99:100 "$NICEPHOS/reseau/mandataire"
chmod 755 "$NICEPHOS/reseau" "$NICEPHOS/reseau/hote"
```

Les commandes des sections suivantes reprennent `$NICEPHOS` et `$SAUVEGARDES` : dans un nouveau terminal, reposez d'abord ces deux lignes.

- **Chemin direct d'un pool** (`/mnt/<pool>/…`, jamais `/mnt/user/…`). La base SQLite fonctionne mal à travers la couche FUSE de `/mnt/user`. Avec Unraid 6.12 et plus, un partage « exclusif » convient aussi.
- **Sauvegardes sur d'autres disques** (le tableau, par exemple). Ajoutez-y une copie hors de la machine (plugin de sauvegarde, disque externe, cloud).
- **Disques chiffrés (recommandé, RGPD)** : la base contient des noms, des e-mails, des signatures. Voir « Chiffrer les données » plus bas.
- **99:100**, c'est-à-dire `nobody:users` : l'utilisateur standard des conteneurs Unraid. Les conteneurs tournent sous cet utilisateur, sans aucun privilège.
- **Partages réseau fermés (obligatoire)** : sous Unraid, le premier dossier d'un pool ou du tableau est un partage (`appdata` pour `/mnt/cache/appdata/…`, `nicephos` pour `/mnt/volumes/nicephos`, `backups` pour `/mnt/user/backups/…`), et un partage peut être exporté sur le réseau local sans mot de passe (sécurité *Public*). Or l'invité SMB d'Unraid est justement `nobody` (99), le propriétaire de la base, des originaux et des sauvegardes : les droits des fichiers ne protègent alors rien. Dans **Shares**, ouvrez le partage de `NICEPHOS_DIR` puis celui de `BACKUP_DIR` : **SMB Security Settings → Export : No**, et **NFS Security Settings → Export : No** (ou, si vous devez y accéder, sécurité *Private* avec un utilisateur nommé, jamais *Public* ni *Secure*). Vérifiez depuis un autre ordinateur qu'ils n'apparaissent plus (`\\unraid\backups`…).

## 3. Zitadel : la connexion à l'admin

L'admin n'a pas de mot de passe à elle : on s'y connecte avec un compte **Zitadel**. L'offre gratuite de Zitadel Cloud suffit largement pour deux comptes. Zitadel peut aussi proposer « Continuer avec Google ». Tout se configure dans la **console Zitadel**, une seule fois, avant la mise en ligne.

### 3.1 Créer l'instance

1. Allez sur <https://zitadel.com> → **Sign up**, et créez un compte.
2. Créez une **instance** (offre gratuite) et choisissez la région Europe. Son adresse ressemble à `https://nicephos-xxxxxx.zitadel.cloud` : c'est **`OIDC_ISSUER`**.
3. Ouvrez la **console** de l'instance (bouton « Console » ou `https://<instance>.zitadel.cloud/ui/console`).

### 3.2 Projet, rôle, application

1. **Organisation :** en haut à gauche, l'organisation par défaut convient. Notez son identifiant : menu **Organization**, champ *Resource Id* (un long nombre). C'est **`OIDC_ORG_ID`**.
2. **Projets → Create New Project**, par exemple « Nicephos ». Dans le projet :
   - ouvrez l'onglet **General** et notez son *Resource Id* : c'est **`OIDC_PROJECT_ID`** ;
   - dans **Roles → New**, créez le rôle avec la clé `admin` (le nom affiché est libre, par exemple « Administrateur ») ;
   - dans les réglages du projet, cochez **« Assert Roles on Authentication »** et **« Check authorization on Authentication »**. Avec la seconde option, un compte sans rôle est refusé dès Zitadel.
3. **Applications → New**, dans le projet :
   - nom : « Site Nicephos » ; type : **Web** ;
   - méthode d'authentification : **CODE** (avec secret client) ;
   - *Redirect URIs* : `https://www.nicephos.art/auth/callback` ;
   - *Post Logout URIs* : `https://www.nicephos.art/` ;
   - à la création, Zitadel affiche le **Client ID** (**`OIDC_CLIENT_ID`**) et le **Client Secret** (**`OIDC_CLIENT_SECRET`**). **Copiez le secret tout de suite** : il n'est plus montré ensuite. En cas d'oubli, vous pouvez en générer un nouveau.

### 3.3 Comptes de Sébastien et Julien

1. **Users → New**, une fiche par personne, avec son e-mail. Zitadel envoie l'invitation et chacun choisit son mot de passe. Activez la double authentification si vous le souhaitez (réglages de connexion de l'organisation).
2. **Donner le rôle :** dans le projet, ouvrez **Authorizations → New**, choisissez l'utilisateur, puis cochez `admin`.
3. **Empêcher les inscriptions libres :** **Settings → Login Behavior and Security** de l'organisation, décochez *Register allowed*.
4. **Facultatif, Google :** **Settings → Identity Providers → Google**. Il faut alors un client OAuth créé dans Google Cloud Console, avec l'URI de retour que Zitadel affiche.

### 3.4 Dans le `.env`

```dotenv
OIDC_ISSUER=https://nicephos-xxxxxx.zitadel.cloud
OIDC_CLIENT_ID=…
OIDC_CLIENT_SECRET=…
OIDC_PROJECT_ID=…
OIDC_ORG_ID=…
OIDC_ADMIN_ROLE=admin
```

**Vérifier :** ouvrez `https://www.nicephos.art/admin`. Vous êtes renvoyé vers Zitadel, vous vous connectez, puis vous arrivez sur le tableau de bord. Un compte sans le rôle voit « Accès refusé », et aucune session n'est créée. En cas d'erreur, consultez les journaux du conteneur `nicephos` : le message indique l'étape en cause.

**Lier chaque compte à son auteur** (pour que l'import propose le bon auteur) : le tableau de bord affiche l'identifiant `sub` du compte connecté. Copiez-le dans **Auteurs → fiche de l'auteur → Compte de connexion**.

## 4. Cloudflare : tunnel et domaines

Le site n'a qu'une adresse : **`https://www.nicephos.art`** (`PUBLIC_URL`). Toutes les autres (`nicephos.art` sans `www`, autres sous-domaines, `http://`) y sont redirigées par Cloudflare. Une seule adresse garde cohérents la connexion à l'admin, les liens de partage, Instagram et les mentions de droits des images.

1. Ajoutez **nicephos.art** à votre compte Cloudflare, puis changez les serveurs DNS chez le registraire, comme Cloudflare l'indique.
2. **Tunnel :** Zero Trust → **Networks → Tunnels → Create a tunnel** (type *Cloudflared*), nommé par exemple « nicephos ». Copiez le **jeton** affiché dans `TUNNEL_TOKEN`. Inutile d'installer cloudflared à la main : c'est le conteneur `nicephos-tunnel`.
3. Dans le tunnel, **Public Hostname → Add** : `www.nicephos.art`, service **HTTP**, URL `nicephos:3000`. Cloudflare crée l'enregistrement DNS `www`.
4. **DNS des autres adresses** (zone nicephos.art) : enregistrement `A` `@` → `192.0.2.1`, et `A` `*` → `192.0.2.1` pour les autres sous-domaines, tous deux **proxifiés** (nuage orange). L'adresse n'est jamais jointe : la redirection intervient avant.
5. **Redirection :** **Rules → Redirect Rules → Create rule** :
   - *If incoming requests match…* : **Custom filter expression**, `(http.host ne "www.nicephos.art")` ;
   - *Then* : type **Dynamic**, `concat("https://www.nicephos.art", http.request.uri.path)` ;
   - code **301**, **Preserve query string** coché.
6. **SSL/TLS → Edge Certificates → Always Use HTTPS** : activé (pour `http://www.nicephos.art`).

**Pièges :**

- Le champ *Value* n'attend qu'un nom de domaine (`www.nicephos.art`), avec *Field* **Hostname** et *Operator* **does not equal** : l'aperçu doit afficher exactement `(http.host ne "www.nicephos.art")`. Une expression collée dans *Value*, ou *Field* laissé sur **URI Full**, donne soit aucune redirection, soit une **boucle** sur `www.nicephos.art` (site inaccessible) : désactivez alors la règle, corrigez-la, et testez en 302 avant de repasser en 301. Détails : [Déploiement](../../docs/wiki/Déploiement.md).
- Le certificat gratuit (*Universal SSL*) couvre `nicephos.art` et `*.nicephos.art`, soit **un seul niveau** de sous-domaine : `a.b.nicephos.art` donne une erreur de certificat avant toute redirection.
- Un autre domaine (par exemple `nicephos.com`) se redirige de la même façon : zone ajoutée à Cloudflare, enregistrements `@` et `*` proxifiés, même règle dans cette zone.

**Vérifier :** `curl -sI "https://nicephos.art/serie/rue?x=1"` répond `301` vers `https://www.nicephos.art/serie/rue?x=1`.

## 5. Lancer la pile

**Méthode recommandée : plugin « Docker Compose Manager »** (Apps → rechercher « Compose Manager »).

1. Docker → en bas, **Add New Stack**, nommée `nicephos`.
2. **Edit Stack → Compose File :** collez le contenu de `compose.yaml`.
3. **Edit Stack → ENV File :** collez `env.example`, puis remplissez `NICEPHOS_DIR` et `BACKUP_DIR` (les dossiers de l'étape 2), `PUBLIC_URL=https://www.nicephos.art`, `COOKIE_SECRET` (`openssl rand -base64 32` dans le terminal), la partie Zitadel et `TUNNEL_TOKEN`.
4. **Compose Up.** Les quatre conteneurs apparaissent dans l'onglet Docker : `nicephos`, `nicephos-sauvegarde`, `nicephos-tunnel` et `nicephos-traduction`.

**Vigie et Signal (facultatifs), dans la même pile :** `COMPOSE_PROFILES=vigie` dans le `.env` ajoute `nicephos-vigie` et `nicephos-vigie-sauvegarde` ; `COMPOSE_PROFILES=vigie,signal` ajoute aussi la passerelle `nicephos-signal`. Les réseaux internes se créent tout seuls. Il reste à préparer, avant le **Compose Up** :

- les clés de la Vigie (ses dossiers sont ceux de l'étape 2), et ses lignes dans le `.env` du site ([Vigie](https://github.com/Volfieldd/deux-regards/wiki/Vigie), « Installer sur Unraid ») ;
- `vigie.env`, que Compose Manager n'affiche pas : créez-le dans le terminal, **dans le dossier de la pile**, celui qui contient déjà son `docker-compose.yml` et son `.env` (en général `/boot/config/plugins/compose.manager/projects/nicephos/`), puis `chmod 600`. Sans lui, la Vigie refuse de démarrer (« Variable manquante ») ; le reste de la pile n'en souffre pas ;
- pour Signal, l'enregistrement du numéro (son dossier est celui de l'étape 2) : [`signal/README.md`](signal/README.md).

Au premier lancement sans données reprises, le site part d'une base vide : pas de photos, pas d'auteurs. Créez d'abord les auteurs dans l'admin.

**Autre méthode : modèles Unraid** (sans plugin).

1. Créez le réseau commun, une fois, dans le terminal :

   ```bash
   docker network create --subnet 172.29.42.0/24 --ip-range 172.29.42.128/25 nicephos
   ```

   Le tunnel y a l'adresse fixe `172.29.42.10` (hors de la plage donnée aux autres conteneurs), et le site ne croit `X-Forwarded-For` que venant d'elle (`TRUST_PROXY`) : un poste du réseau local ne peut pas se faire passer pour un autre visiteur. Un réseau `nicephos` créé avant, sans `--subnet` : arrêtez les conteneurs, `docker network rm nicephos`, puis recréez-le ainsi. N'utilisez pas les modèles et la pile Compose en même temps (même sous-réseau).
2. Copiez les trois fichiers de `modeles/` dans `/boot/config/plugins/dockerMan/templates-user/`.
3. Docker → **Add Container** → *Template* → `nicephos`. Remplissez les champs (mêmes valeurs que `env.example`), puis **Apply**. Faites de même pour `nicephos-sauvegarde` (mêmes dossiers) et pour `nicephos-tunnel`. Les paramètres supplémentaires gardent les protections de la pile : système en lecture seule, aucun privilège, mémoire limitée (`--memory 3g` pour le site ; `6g` pour les descriptions « Précis »).

## 6. Reprendre les données du serveur de test

Sur le serveur de test, dans le dossier du dépôt :

```bash
deploy/unraid/exporter-donnees.sh            # → nicephos-donnees-AAAA-MM-JJ.tar.gz
scp nicephos-donnees-*.tar.gz root@unraid:/mnt/cache/appdata/nicephos/    # votre NICEPHOS_DIR
```

L'archive n'est lisible que par vous (elle contient les données personnelles, en clair si le serveur de test n'a pas de `DATA_KEY`).

Sur Unraid, **avant** le premier `Compose Up` (ou après avoir arrêté la pile) :

```bash
cd "$NICEPHOS"                                 # posé à l'étape 2
tar -xzf nicephos-donnees-*.tar.gz -C data
rm -f data/site.db-wal data/site.db-shm
chown -R 99:100 data
```

- **`rm -f …-wal …-shm`** : un journal resté d'un premier lancement à vide serait sinon rejoué sur la base importée, qui repartirait vide. À ne faire que pile arrêtée.
- **Mêmes clés** : si le serveur de test a une `DATA_KEY` (ou une `INSTAGRAM_TOKEN_KEY`), reprenez la même dans le `.env` de la pile, sinon les données chiffrées sont illisibles. Sans `INSTAGRAM_TOKEN_KEY`, un `COOKIE_SECRET` différent impose de reconnecter Instagram.
- **Une fois le site vérifié**, effacez l'archive sur les deux machines : elle échappe à la rotation des sauvegardes et à l'effacement des 90 jours.

L'archive contient :

- la base, dans un instantané cohérent pris pendant que le site tourne ;
- les originaux, les preuves d'antériorité, les logos et la marque.

Les images servies ne sont pas dans l'archive : elles sont recalculées au démarrage, ce qui prend quelques minutes, et le site reste en ligne pendant ce temps. Si l'adresse publique change, les mentions de droits inscrites dans les images suivent `PUBLIC_URL` (ici `https://www.nicephos.art/droits`).

## 7. Premier accès

- **Contrôle local :** `http://<ip-unraid>:3080/`. Le site s'affiche ; l'admin, elle, ne fonctionne que par le domaine en HTTPS.
- **En ligne :** `https://www.nicephos.art/` et `https://www.nicephos.art/admin`.
- **Santé :** l'onglet Docker affiche `healthy` pour `nicephos`.

### Sauvegardes

`nicephos-sauvegarde` fait une sauvegarde au démarrage, puis toutes les 24 h, dans `BACKUP_DIR` :

- `db/` : instantanés de la base, les 14 derniers. Chacun est une copie compacte, contrôlée, sans les restes des données effacées ;
- `files/` : originaux, logos et marque, tels qu'ils sont dans les données ;
- `supprimes/` : un original supprimé dans l'admin y reste récupérable **90 jours**, puis il est effacé (droit à l'effacement ; `BACKUP_DELETED_DAYS` pour changer ce délai). Si le dossier des originaux est vide (montage raté), rien n'y passe ;
- `last.json` : compte rendu de la dernière sauvegarde.

**Santé :** l'onglet Docker affiche `healthy` pour `nicephos-sauvegarde` tant que la dernière sauvegarde a moins de deux jours et rien d'anormal ; sinon `unhealthy` : lisez `last.json` et les journaux du conteneur.

**Garde-fou :** si la base n'a plus aucune photo alors que la sauvegarde précédente en avait (dossier des données vide ou mal indiqué après un déplacement), l'instantané est nommé `site-…-suspect.db`, le conteneur passe `unhealthy`, et les vrais instantanés ne sont plus effacés à chaque passage : ils restent 14 jours. Corrigez `DATA_DIR`. Si vous avez vraiment supprimé toutes les photos, effacez `last.json` pour lever l'alerte.

**Restaurer** (instantané au choix, le plus récent en général) :

1. Arrêtez la pile (**Compose Down**).
2. Dans le terminal Unraid, avec `$NICEPHOS` et `$SAUVEGARDES` posés (étape 2) et le nom de l'instantané :

   ```bash
   docker run --rm --user 99:100 --network none \
     -v "$NICEPHOS/data":/data -v "$SAUVEGARDES":/backups -e BACKUP_DIR=/backups \
     ghcr.io/volfieldd/deux-regards:latest node server/db/restore.js site-AAAA-MM-JJTHHMMSS.db
   ```

   Prenez l'image de votre pile (`IMAGE` du `.env` si vous l'avez fixée). Le script refuse si le site tourne. Il garde la base actuelle dans `data/site-avant-restauration-<date>.db`, met l'instantané en place, ferme toutes les sessions, et ne recopie que les originaux que cite l'instantané (depuis `files/`, sinon `supprimes/`) : un original effacé depuis ne revient pas. Il affiche ensuite les actions faites **après** l'instantané, d'après le journal de la base gardée.
3. **Compose Up.** Les images servies se recalculent au démarrage.
4. **Refaites** les actions marquées « ! » que l'instantané a défaites : effacements de personnes (droit à l'effacement), suppressions de photos, rôles retirés et comptes désactivés (voir **Comptes et rôles**). Notez la restauration dans le registre ([RGPD](../../docs/wiki/RGPD.md)), puis effacez `site-avant-restauration-…` une fois tout vérifié.

### Instagram (facultatif)

Pour publier automatiquement sur Instagram : compte professionnel, application Meta, puis `INSTAGRAM_APP_ID` et `INSTAGRAM_APP_SECRET` dans le `.env` de la pile. Le pas à pas complet est dans l’aide de l’admin (**Aide → Instagram**) et dans le wiki ([Instagram](https://github.com/Volfieldd/deux-regards/wiki/Instagram)). L’adresse de retour à déclarer chez Meta est `https://www.nicephos.art/admin/instagram/callback`. Sans `INSTAGRAM_TOKEN_KEY`, le jeton est chiffré avec `COOKIE_SECRET` : changer ce secret impose de reconnecter le compte.

### Traduction (propositions dans l'admin)

Le conteneur `nicephos-traduction` (LibreTranslate, logiciel libre) propose les traductions anglaises et allemandes dans l'admin (bouton **Proposer une traduction** sous chaque champ « en anglais et en allemand »). Tout se passe sur le serveur : aucun texte ne part sur Internet, aucun compte, 0 €.

- **Premier lancement :** il télécharge une seule fois ses modèles français, anglais et allemand (environ 300 Mo, gardés dans le volume `nicephos_traduction-modeles`) ; comptez quelques minutes avant que le bouton réponde. Ensuite il fonctionne hors ligne.
- **Ressources :** environ 1 Go de mémoire (limite 2 Go), une seconde par texte, sans carte graphique.
- **Réseau :** aucun port publié ; seul le site le joint (`TRANSLATE_URL=http://libretranslate:5000`, réglé par défaut dans la pile).
- **Qualité :** une base à relire (« Six heures » peut devenir « Six hours »), jamais publiée sans vous.
- **Ne pas l'utiliser :** mettez `TRANSLATE_URL=` (vide) dans le `.env` : le bouton disparaît. Vous pouvez alors supprimer le conteneur.
- **Modèles Unraid** (sans Compose) : ajoutez le conteneur `libretranslate/libretranslate:v1.9.6` (variables `LT_LOAD_ONLY=fr,en,de` et `LT_DISABLE_WEB_UI=true`, dossier `/home/libretranslate/.local` à garder) sur le même réseau que le site, puis `TRANSLATE_URL` vers lui.

### Mettre à jour

Dans Compose Manager : **Update Stack** (ou **Compose Pull**, puis **Compose Up**). Si le fichier de la pile a changé le réseau (plage `ip_range`, octobre 2026) et que Compose refuse de le réutiliser : **Compose Down**, puis **Compose Up** (les données ne bougent pas). Pour revenir à une version précise : `IMAGE=ghcr.io/volfieldd/deux-regards:sha-xxxxxxx` dans le `.env` de la pile (une migration de base déjà appliquée n'est pas défaite : restaurez alors aussi la base). Les données ne bougent pas : elles sont dans `data/`, jamais dans l'image. Une mise à jour qui modifie la base l'applique toute seule au démarrage. Prenez quand même l'habitude de vérifier la date de `last.json` avant.

### Chiffrer les données (disque volé, disque jeté)

La base contient des données personnelles (noms, e-mails, signatures, photos de repère) : les ranger sur des disques chiffrés protège contre le vol du serveur ou un disque revendu. Unraid sait le faire (chiffrement LUKS) :

Le plus simple est de choisir un pool chiffré **dès l'installation**, comme `NICEPHOS_DIR` (étape 2). Pour déplacer une installation existante :

1. **Pool chiffré pour les données** : *Main → Add Pool* (ou un pool existant vidé), système de fichiers **« xfs - encrypted »** ou **« btrfs - encrypted »**, puis formatez. Unraid demande une phrase de passe (ou un fichier clé) au démarrage du tableau.
2. **Déplacez tout le dossier** pile arrêtée : `rsync -a "$NICEPHOS/" /mnt/<pool-chiffré>/nicephos/` (données, Vigie, Signal, avec leurs propriétaires), puis changez `NICEPHOS_DIR` dans le `.env` de la pile et relancez.
3. **Sauvegardes** : sur des disques du tableau eux aussi chiffrés (même choix de format, disque par disque), ou une copie hors de la machine déjà chiffrée.
4. **La clé** : avec une phrase de passe tapée à chaque démarrage, un disque volé ne révèle rien ; mais après une coupure de courant, le site attend que vous déverrouilliez le tableau. Un fichier clé posé sur la clé USB d'Unraid démarre tout seul, mais protège moins (la clé USB voyage avec le serveur).
5. **Chiffrement dans la base**, en plus des disques : ajoutez `DATA_KEY` au `.env` de la pile (`openssl rand -base64 32`, une seule fois) et gardez-en une copie dans un gestionnaire de mots de passe. Au redémarrage, les noms, e-mails, signatures, photos de repère et messages déjà enregistrés sont chiffrés ; Droits & confidentialité affiche « actif ». **Clé perdue = données illisibles**, sauvegardes comprises ; ne la changez pas sans aide.
6. Une fois fait, cochez **Droits & confidentialité → « Les données et les sauvegardes sont sur des disques chiffrés »** : la page `/confidentialite` l'annonce.

Pensez aussi à **l'authentification à deux facteurs** dans Zitadel (*Settings → Login Behavior and Access → Multifactor*, ou l'obligation par organisation) pour vos deux comptes, puis cochez la case correspondante dans Droits & confidentialité.

### Ce qui protège les données

- **Montage oublié :** le site refuse de démarrer si `/data` n'est pas un dossier monté.
- **Dossier absent :** Compose refuse de démarrer au lieu d'en créer un vide.
- **Conteneurs :** système de fichiers en lecture seule, sans privilège, utilisateur 99:100.
- **Connexion de test :** jamais en ligne ; le serveur refuse `LOCAL_AUTH_TOKEN` en production.
- **Adresse des visiteurs :** réseau Docker dédié ; le site ne croit `X-Forwarded-For` (ni le pays de Cloudflare) que venant du tunnel (`TRUST_PROXY` = `TUNNEL_IP`, adresse que les autres conteneurs ne peuvent pas prendre), pas d'un poste du réseau local.
- **Partages réseau :** `appdata` et `backups` non exportés (étape 2).
- **Secrets :** le jeton du tunnel ne va qu'à `nicephos-tunnel`, jamais au site.
- **Sorties du site** (facultatif, [reseau/README.md](reseau/README.md)) : par un mandataire à liste autorisée ; toute autre sortie, et tout flux entre conteneurs hors de la liste, rejetés et journalisés par l'hôte, lus par la Vigie.
- **Passerelle Signal** (facultative) : aucun port publié ; son API, sans authentification, n'est joignable que par le réseau interne de la Vigie, où le site n'est pas.
- **Effacements :** une donnée effacée est mise à zéro dans la base, et les instantanés ne gardent pas ses restes ; une restauration ne ramène pas un original effacé que la base restaurée ne connaît plus.
- **Base vide par erreur :** les vrais instantanés sont gardés, et `nicephos-sauvegarde` passe `unhealthy`.
