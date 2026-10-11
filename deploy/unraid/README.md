# Déployer Nicephos sur Unraid

Ce dossier contient tout le nécessaire :

| Fichier | Rôle |
|---|---|
| `compose.yaml` | la pile complète : site, sauvegarde quotidienne, tunnel Cloudflare (**méthode recommandée**) |
| `env.example` | les réglages, à copier en `.env` de la pile |
| `modeles/*.xml` | les mêmes conteneurs en modèles Unraid (onglet Docker), si vous préférez ne pas utiliser Compose |
| `exporter-donnees.sh` | exporte les données d'une installation existante (serveur de test) pour les reprendre sur Unraid |

```
Internet ─HTTPS─► Cloudflare (nicephos.com ; nicephos.art redirigé) ─tunnel─► nicephos-tunnel ─► nicephos:3000
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

L'image est construite par GitHub à chaque mise à jour de `main` (`.github/workflows/image.yml`) et publiée sur `ghcr.io/volfieldd/deux-regards`. Elle ne contient **aucune donnée** : ni photos, ni base, ni logo.

**Une seule fois**, après la première publication : sur GitHub, **Profil → Packages → deux-regards → Package settings → Change visibility → Public**. Sinon, Unraid ne pourra pas la télécharger sans identifiants. Si vous préférez la garder privée : dans le terminal Unraid, `docker login ghcr.io -u Volfieldd`, avec comme mot de passe un jeton GitHub qui a le droit `read:packages`.

## 2. Dossiers sur Unraid

Dans le terminal Unraid (icône `>_` en haut à droite) :

```bash
mkdir -p /mnt/cache/appdata/nicephos/data /mnt/user/backups/nicephos
chown -R 99:100 /mnt/cache/appdata/nicephos /mnt/user/backups/nicephos
```

- **Données sur le pool cache, chemin direct** (`/mnt/cache/…`, pas `/mnt/user/…`). La base SQLite fonctionne mal à travers la couche FUSE de `/mnt/user`. Si votre pool porte un autre nom, remplacez `cache`. Avec Unraid 6.12 et plus, un partage `appdata` « exclusif » convient aussi.
- **Sauvegardes sur le tableau**, donc sur d'autres disques que les données. Ajoutez-y une copie hors de la machine (plugin de sauvegarde, disque externe, cloud).
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
   - *Redirect URIs* : `https://nicephos.com/auth/callback` ;
   - *Post Logout URIs* : `https://nicephos.com/` ;
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

**Vérifier :** ouvrez `https://nicephos.com/admin`. Vous êtes renvoyé vers Zitadel, vous vous connectez, puis vous arrivez sur le tableau de bord. Un compte sans le rôle voit « Accès refusé », et aucune session n'est créée. En cas d'erreur, consultez les journaux du conteneur `nicephos` : le message indique l'étape en cause.

**Lier chaque compte à son auteur** (pour que l'import propose le bon auteur) : le tableau de bord affiche l'identifiant `sub` du compte connecté. Copiez-le dans **Auteurs → fiche de l'auteur → Compte de connexion**.

## 4. Cloudflare : tunnel et domaines

1. Ajoutez **nicephos.com** et **nicephos.art** à votre compte Cloudflare, puis changez les serveurs DNS chez le registraire, comme Cloudflare l'indique.
2. **Tunnel :** Zero Trust → **Networks → Tunnels → Create a tunnel** (type *Cloudflared*), nommé par exemple « nicephos ». Copiez le **jeton** affiché dans `TUNNEL_TOKEN`. Inutile d'installer cloudflared à la main : c'est le conteneur `nicephos-tunnel`.
3. Dans le tunnel, ouvrez **Public Hostname → Add** :
   - `nicephos.com`, service **HTTP**, URL `nicephos:3000` ;
   - facultatif : `www.nicephos.com`, avec le même service.
4. **nicephos.art → nicephos.com :** dans la zone nicephos.art :
   - **DNS :** enregistrement `A` `@` → `192.0.2.1`, **proxifié** (nuage orange). Faites de même pour `www` si vous le voulez. L'adresse n'est jamais jointe, la redirection intervient avant.
   - **Rules → Redirect Rules → Create** : *Hostname* `nicephos.art` ou `www.nicephos.art`, puis *Dynamic* `concat("https://nicephos.com", http.request.uri.path)`, code **301**, avec *Preserve query string*.

Un seul domaine principal (`PUBLIC_URL`), c'est ce qui garde la connexion à l'admin, les liens de partage et les mentions de droits cohérents.

## 5. Lancer la pile

**Méthode recommandée : plugin « Docker Compose Manager »** (Apps → rechercher « Compose Manager »).

1. Docker → en bas, **Add New Stack**, nommée `nicephos`.
2. **Edit Stack → Compose File :** collez le contenu de `compose.yaml`.
3. **Edit Stack → ENV File :** collez `env.example`, puis remplissez `COOKIE_SECRET` (`openssl rand -base64 32` dans le terminal), la partie Zitadel et `TUNNEL_TOKEN`.
4. **Compose Up.** Les trois conteneurs apparaissent dans l'onglet Docker : `nicephos`, `nicephos-sauvegarde` et `nicephos-tunnel`.

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

Les images servies ne sont pas dans l'archive : elles sont recalculées au démarrage, ce qui prend quelques minutes, et le site reste en ligne pendant ce temps. Comme le domaine change, les mentions de droits inscrites dans les images pointent désormais vers nicephos.com.

## 7. Premier accès

- **Contrôle local :** `http://<ip-unraid>:3080/`. Le site s'affiche ; l'admin, elle, ne fonctionne que par le domaine en HTTPS.
- **En ligne :** `https://nicephos.com/` et `https://nicephos.com/admin`.
- **Santé :** l'onglet Docker affiche `healthy` pour `nicephos`.

### Sauvegardes

`nicephos-sauvegarde` fait une sauvegarde au démarrage, puis toutes les 24 h, dans `/mnt/user/backups/nicephos` :

- `db/` : instantanés de la base, les 14 derniers ;
- `files/` : originaux, logos et marque. Les originaux y sont ajoutés et jamais effacés ;
- `last.json` : compte rendu de la dernière sauvegarde.

**Restaurer :** arrêtez la pile. Copiez `db/site-<date>.db` en `data/site.db`, recopiez `files/*` dans `data/`, puis `chown -R 99:100 data` et relancez la pile.

### Instagram (facultatif)

Pour publier automatiquement sur Instagram : compte professionnel, application Meta, puis `INSTAGRAM_APP_ID` et `INSTAGRAM_APP_SECRET` dans le `.env` de la pile. Le pas à pas complet est dans l’aide de l’admin (**Aide → Instagram**) et dans le wiki ([Instagram](https://github.com/Volfieldd/deux-regards/wiki/Instagram)). L’adresse de retour à déclarer chez Meta est `https://nicephos.com/admin/instagram/callback`.

### Mettre à jour

Dans Compose Manager : **Update Stack** (ou **Compose Pull**, puis **Compose Up**). Les données ne bougent pas : elles sont dans `data/`, jamais dans l'image. Une mise à jour qui modifie la base l'applique toute seule au démarrage. Prenez quand même l'habitude de vérifier la date de `last.json` avant.

### Ce qui protège les données

- **Montage oublié :** le site refuse de démarrer si `/data` n'est pas un dossier monté.
- **Dossier absent :** Compose refuse de démarrer au lieu d'en créer un vide.
- **Conteneurs :** système de fichiers en lecture seule, sans privilège, utilisateur 99:100.
- **Connexion de test :** jamais en ligne ; le serveur refuse `LOCAL_AUTH_TOKEN` en production.
