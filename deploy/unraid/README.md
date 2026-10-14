# Déployer Nicephos sur Unraid

Ce dossier contient tout le nécessaire :

| Fichier | Rôle |
|---|---|
| `compose.yaml` | la pile complète : site, sauvegarde quotidienne, tunnel Cloudflare, traducteur LibreTranslate (**méthode recommandée**) |
| `env.example` | les réglages, à copier en `.env` de la pile |
| `modeles/*.xml` | les mêmes conteneurs en modèles Unraid (onglet Docker), si vous préférez ne pas utiliser Compose |
| `exporter-donnees.sh` | exporte les données d'une installation existante (serveur de test) pour les reprendre sur Unraid |

```
Internet ─HTTPS─► Cloudflare (www.nicephos.art ; autres adresses redirigées) ─tunnel─► nicephos-tunnel ─► nicephos:3000
                                                                                        │
                                       /mnt/cache/appdata/nicephos/data ◄── /data ──────┘
                 nicephos-sauvegarde (chaque jour) ──► /mnt/user/backups/nicephos
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

**Une seule fois**, après la première publication : sur GitHub, **Profil → Packages → deux-regards → Package settings → Change visibility → Public**. Sinon, Unraid ne pourra pas la télécharger sans identifiants. Si vous préférez la garder privée : dans le terminal Unraid, `docker login ghcr.io -u Volfieldd`, avec comme mot de passe un jeton GitHub qui a le droit `read:packages`.

## 2. Dossiers sur Unraid

Dans le terminal Unraid (icône `>_` en haut à droite) :

```bash
mkdir -p /mnt/cache/appdata/nicephos/data /mnt/user/backups/nicephos
chown -R 99:100 /mnt/cache/appdata/nicephos /mnt/user/backups/nicephos
```

- **Données sur le pool cache, chemin direct** (`/mnt/cache/…`, pas `/mnt/user/…`). La base SQLite fonctionne mal à travers la couche FUSE de `/mnt/user`. Si votre pool porte un autre nom, remplacez `cache`. Avec Unraid 6.12 et plus, un partage `appdata` « exclusif » convient aussi.
- **Sauvegardes sur le tableau**, donc sur d'autres disques que les données. Ajoutez-y une copie hors de la machine (plugin de sauvegarde, disque externe, cloud).
- **Disques chiffrés (recommandé, RGPD)** : la base contient des noms, des e-mails, des signatures. Voir « Chiffrer les données » plus bas.
- **99:100**, c'est-à-dire `nobody:users` : l'utilisateur standard des conteneurs Unraid. Les conteneurs tournent sous cet utilisateur, sans aucun privilège.

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
3. **Edit Stack → ENV File :** collez `env.example`, puis remplissez `PUBLIC_URL=https://www.nicephos.art`, `COOKIE_SECRET` (`openssl rand -base64 32` dans le terminal), la partie Zitadel et `TUNNEL_TOKEN`.
4. **Compose Up.** Les quatre conteneurs apparaissent dans l'onglet Docker : `nicephos`, `nicephos-sauvegarde`, `nicephos-tunnel` et `nicephos-traduction`.

Au premier lancement sans données reprises, le site part d'une base vide : pas de photos, pas d'auteurs. Créez d'abord les auteurs dans l'admin.

**Autre méthode : modèles Unraid** (sans plugin).

1. Créez le réseau commun, une fois, dans le terminal : `docker network create nicephos`.
2. Copiez les trois fichiers de `modeles/` dans `/boot/config/plugins/dockerMan/templates-user/`.
3. Docker → **Add Container** → *Template* → `nicephos`. Remplissez les champs (mêmes valeurs que `env.example`), puis **Apply**. Faites de même pour `nicephos-sauvegarde` (mêmes dossiers) et pour `nicephos-tunnel`.

## 6. Reprendre les données du serveur de test

Sur le serveur de test, dans le dossier du dépôt :

```bash
deploy/unraid/exporter-donnees.sh            # → nicephos-donnees-AAAA-MM-JJ.tar.gz
scp nicephos-donnees-*.tar.gz root@unraid:/mnt/cache/appdata/nicephos/
```

Sur Unraid, **avant** le premier `Compose Up` (ou après avoir arrêté la pile) :

```bash
cd /mnt/cache/appdata/nicephos
tar -xzf nicephos-donnees-*.tar.gz -C data
chown -R 99:100 data
```

L'archive contient :

- la base, dans un instantané cohérent pris pendant que le site tourne ;
- les originaux, les preuves d'antériorité, les logos et la marque.

Les images servies ne sont pas dans l'archive : elles sont recalculées au démarrage, ce qui prend quelques minutes, et le site reste en ligne pendant ce temps. Si l'adresse publique change, les mentions de droits inscrites dans les images suivent `PUBLIC_URL` (ici `https://www.nicephos.art/droits`).

## 7. Premier accès

- **Contrôle local :** `http://<ip-unraid>:3080/`. Le site s'affiche ; l'admin, elle, ne fonctionne que par le domaine en HTTPS.
- **En ligne :** `https://www.nicephos.art/` et `https://www.nicephos.art/admin`.
- **Santé :** l'onglet Docker affiche `healthy` pour `nicephos`.

### Sauvegardes

`nicephos-sauvegarde` fait une sauvegarde au démarrage, puis toutes les 24 h, dans `/mnt/user/backups/nicephos` :

- `db/` : instantanés de la base, les 14 derniers ;
- `files/` : originaux, logos et marque. Un original supprimé dans l'admin y reste récupérable **90 jours**, puis il est effacé (droit à l'effacement ; `BACKUP_DELETED_DAYS` pour changer ce délai). Si le dossier des originaux est vide (montage raté), rien n'est effacé ;
- `last.json` : compte rendu de la dernière sauvegarde.

**Restaurer :** arrêtez la pile et gardez une copie de `data/`. Copiez `db/site-<date>.db` en `data/site.db` et supprimez `data/site.db-wal` et `data/site.db-shm` s'ils existent ; recopiez `files/*` dans `data/`, puis `chown -R 99:100 data` et relancez la pile. Les images servies se recalculent au démarrage.

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

Dans Compose Manager : **Update Stack** (ou **Compose Pull**, puis **Compose Up**). Pour revenir à une version précise : `IMAGE=ghcr.io/volfieldd/deux-regards:sha-xxxxxxx` dans le `.env` de la pile (une migration de base déjà appliquée n'est pas défaite : restaurez alors aussi la base). Les données ne bougent pas : elles sont dans `data/`, jamais dans l'image. Une mise à jour qui modifie la base l'applique toute seule au démarrage. Prenez quand même l'habitude de vérifier la date de `last.json` avant.

### Chiffrer les données (disque volé, disque jeté)

La base contient des données personnelles (noms, e-mails, signatures, photos de repère) : les ranger sur des disques chiffrés protège contre le vol du serveur ou un disque revendu. Unraid sait le faire (chiffrement LUKS) :

1. **Pool chiffré pour les données** : *Main → Add Pool* (ou un pool existant vidé), système de fichiers **« xfs - encrypted »** ou **« btrfs - encrypted »**, puis formatez. Unraid demande une phrase de passe (ou un fichier clé) au démarrage du tableau.
2. **Déplacez les données** pile arrêtée : `rsync -a /mnt/cache/appdata/nicephos/ /mnt/<pool-chiffré>/appdata/nicephos/`, puis changez `DATA_DIR` dans le `.env` de la pile et relancez.
3. **Sauvegardes** : sur des disques du tableau eux aussi chiffrés (même choix de format, disque par disque), ou une copie hors de la machine déjà chiffrée.
4. **La clé** : avec une phrase de passe tapée à chaque démarrage, un disque volé ne révèle rien ; mais après une coupure de courant, le site attend que vous déverrouilliez le tableau. Un fichier clé posé sur la clé USB d'Unraid démarre tout seul, mais protège moins (la clé USB voyage avec le serveur).
5. **Chiffrement dans la base**, en plus des disques : ajoutez `DATA_KEY` au `.env` de la pile (`openssl rand -base64 32`, une seule fois) et gardez-en une copie dans un gestionnaire de mots de passe. Au redémarrage, les noms, e-mails, signatures, photos de repère et messages déjà enregistrés sont chiffrés ; Réglages → Confidentialité affiche « actif ». **Clé perdue = données illisibles**, sauvegardes comprises ; ne la changez pas sans aide.
6. Une fois fait, cochez **Réglages → Confidentialité → « Les données et les sauvegardes sont sur des disques chiffrés »** : la page `/confidentialite` l'annonce.

Pensez aussi à **l'authentification à deux facteurs** dans Zitadel (*Settings → Login Behavior and Access → Multifactor*, ou l'obligation par organisation) pour vos deux comptes, puis cochez la case correspondante dans Réglages.

### Ce qui protège les données

- **Montage oublié :** le site refuse de démarrer si `/data` n'est pas un dossier monté.
- **Dossier absent :** Compose refuse de démarrer au lieu d'en créer un vide.
- **Conteneurs :** système de fichiers en lecture seule, sans privilège, utilisateur 99:100.
- **Connexion de test :** jamais en ligne ; le serveur refuse `LOCAL_AUTH_TOKEN` en production.
- **Adresse des visiteurs :** réseau Docker dédié ; le site ne croit `X-Forwarded-For` que venant du tunnel (`TRUST_PROXY` = `TUNNEL_IP`), pas d'un poste du réseau local.
