# Installateur de Nicephos (Unraid ou Linux)

Un script qui fait l'installation « propre » de Nicephos. Il pose des questions à l'écran, vérifie les prérequis et les jetons, puis configure tout seul :

- **Zitadel** (la connexion à l'admin) ;
- **Cloudflare** (le tunnel, le domaine, le durcissement) ;
- **la machine** (les dossiers, le `.env`, la pile Compose).

Avant de changer quoi que ce soit, il montre tout ce qu'il va faire et attend votre accord.

Il reprend, dans l'ordre, les marches à suivre du [guide Unraid](../unraid/README.md) (étapes 2 à 5) et de [vigie-phase-0.md](../unraid/vigie-phase-0.md) (parties 1 à 3). Ces guides restent la référence : ils décrivent chaque réglage, comment le vérifier, et comment revenir en arrière.

## Ce qu'il garantit

- **Il ne supprime rien.** Ni chez Zitadel, ni chez Cloudflare, ni sur la machine.
  - Les autres adresses du tunnel restent en place, par exemple celles d'un autre site servi par le même tunnel.
  - Les autres enregistrements DNS et les autres règles de la zone ne sont pas touchés.
- **Il ne reprend jamais une valeur déjà posée.** Les secrets et réglages du `.env` restent tels quels : `COOKIE_SECRET`, `DATA_KEY`, secret client, réglages faits à la main.
- **Il sauvegarde avant de remplacer.** Tout fichier remplacé est d'abord copié à côté (`….avant-installateur-<date>`).
- **Il ne touche pas aux dossiers existants.** Un dossier qui existe déjà n'est jamais modifié, même s'il a un autre propriétaire : l'installateur le signale seulement.
- **Il n'écrit nulle part ses jetons** (Zitadel, Cloudflare). Il ne les affiche pas non plus : la saisie est masquée.
- **On peut le relancer.** Ce qui est en place est retrouvé (« déjà en place »), et seul ce qui manque est fait. Après une erreur, corrigez, puis relancez.
- **Il peut tourner sans rien changer.** Avec `--essai`, il ne fait que des lectures chez Zitadel et Cloudflare, et n'écrit rien sur la machine. Il montre ce qu'il ferait.

## Prérequis

Le premier écran de l'installateur affiche cette liste. Pour chaque élément, il donne le pas à pas (choix 2 ou 3).

**La machine** (vérifiée par le lanceur) :

- Unraid 6.12 ou plus avec le plugin « Docker Compose Manager », ou Linux x86-64 avec Docker et Docker Compose v2 ;
- la connexion au registre privé `ghcr.io` (README Unraid, étape 1). Le lanceur la propose si elle manque. Sur Unraid, il la garde aussi après un redémarrage ;
- un pool pour les données, chiffré de préférence, et d'autres disques pour les sauvegardes.

**Les comptes** (vérifiés à la saisie) :

- **Le domaine dans Cloudflare**, zone « Active ».
- **Un jeton d'API Cloudflare** pour l'installateur. On le crée dans *My Profile → API Tokens → Create Token → Custom token*, avec ces droits :

  | Droit | Pour quoi |
  |---|---|
  | Account → Cloudflare Tunnel → Edit | le tunnel et ses adresses publiques |
  | Zone → Zone → Read | trouver la zone |
  | Zone → DNS → Edit | `www`, `@`, `*` (et DNSSEC, CAA) |
  | Zone → Zone Settings → Edit | Always Use HTTPS, réglages TLS |
  | Zone → Single Redirect → Edit | la redirection vers `www` |
  | Zone → Zone WAF → Edit | *durcissement* : règles du pare-feu, limite de débit |
  | Zone → Managed Headers → Edit | *durcissement* : en-têtes gérés |
  | Account → Account Filter Lists → Edit | *durcissement* : liste `vigie_bloquees` |
  | Account → Access: Apps and Policies → Edit | *console de la Vigie* |
  | Account → Access: Organizations, Identity Providers, and Groups → Edit | *console de la Vigie* |

  Réglages du jeton :
  - *Account Resources* : votre compte ;
  - *Zone Resources* : votre domaine ;
  - *TTL* : jusqu'à demain.

  Les droits sont essayés un par un à la saisie. Un droit qui manque est nommé.
- **Une instance Zitadel Cloud** et un **compte de service « installateur »** avec un *Personal Access Token*. On le crée dans *Users → Service Users → New*, puis *Personal Access Tokens → New*.
  - Rôle d'instance **IAM_OWNER** : *Default settings → Managers → Add*. Il sert à donner son rôle au compte de lecture de la Vigie.
  - Sans la Vigie, **ORG_OWNER** de l'organisation suffit.
- **Les adresses e-mail des administrateurs.** Si un compte existe déjà, il est retrouvé. Sinon, il est créé, et Zitadel envoie l'invitation pour choisir le mot de passe.
- **Facultatif, pour la console de la Vigie :** Cloudflare Zero Trust activé. Choisir un nom d'équipe et l'offre Free dans *one.dash.cloudflare.com*.

## Lancer

### Unraid

Dans le terminal d'Unraid (icône `>_`), après la connexion au registre (README Unraid, étape 1) :

```bash
docker run --rm --entrypoint cat ghcr.io/volfieldd/deux-regards:latest /app/deploy/installateur/installer.sh > /tmp/installer.sh
bash /tmp/installer.sh --essai     # d'abord : ce qui serait fait, sans rien changer
bash /tmp/installer.sh             # puis pour de bon
```

La pile s'installe dans Compose Manager (`/boot/config/plugins/compose.manager/projects/nicephos`). Si une pile nommée « nicephos » existe déjà, l'installateur la met à jour.

### Linux

En root, depuis une copie du dépôt (`sudo bash deploy/installateur/installer.sh`), ou avec la même commande que pour Unraid, préfixée de `sudo`. Le dossier de la pile est demandé (par défaut `/opt/nicephos`). Les conteneurs tournent sous l'uid et le gid demandés (par défaut 1000:1000).

### Comment il tourne

1. **Le lanceur** (`installer.sh`, bash) vérifie la machine : root, Docker, Compose, Compose Manager sur Unraid, et l'image privée.
2. **L'installateur** (`installer.mjs`, Node, sans dépendance) tourne ensuite dans l'**image du site**, qui a Node : rien n'est installé sur l'hôte. Il voit les dossiers de l'hôte :
   - sur Unraid : `/mnt` et `/boot/config`, aux mêmes chemins ;
   - sur Linux : tout l'hôte, sous `/hote`.
3. **À la fin, le lanceur** démarre la pile (`docker compose pull` puis `up -d`), attend que le site soit `healthy`, puis vérifie :
   - l'adresse publique, par Cloudflare ;
   - la redirection (`https://<domaine>/…` → `301` vers `https://www.<domaine>/…`).

Lancé depuis une copie du dépôt, le lanceur prend l'installateur de cette copie, pas celui de l'image. C'est utile pour essayer une nouvelle version.

## Ce qu'il fait, dans l'ordre

| Où | Quoi |
|---|---|
| Machine | `NICEPHOS_DIR/data`, `BACKUP_DIR` (et, avec la Vigie, `vigie/`, `vigie-secrets/`, `BACKUP_DIR-vigie`), avec leur propriétaire (99:100 sur Unraid). Signale un partage Unraid exporté sans mot de passe. |
| Zitadel | Projet « Nicephos » (*Assert Roles* et *Check authorization* cochés), rôle `admin`, application « Site Nicephos » (Web, code, secret client), comptes et rôle des administrateurs, politique de connexion de l'organisation (inscriptions libres fermées, second facteur obligatoire pour tous si demandé). |
| Zitadel, Vigie | Compte de service `vigie-lecture` (JWT), rôle d'instance `IAM_OWNER_VIEWER` seul, clé JSON d'un an dans `vigie-secrets/zitadel.json`. Avec la console : projet « Vigie » et ses quatre rôles, applications « Console Vigie » et « Cloudflare Access », rôle `vigie.admin` des administrateurs. |
| Cloudflare | Tunnel géré par Cloudflare (créé ou retrouvé par son nom), adresse publique `www` → `http://nicephos:3000`, DNS (`www` vers le tunnel ; `@` et `*` vers `192.0.2.1` proxifiés, s'ils sont libres), redirection 301 de toutes les adresses vers `www`, *Always Use HTTPS*. Prévient si plusieurs connecteurs tournent sur le même tunnel. |
| Cloudflare, durcissement | *Full (strict)*, TLS 1.2 minimum, TLS 1.3, *Automatic HTTPS Rewrites*, niveau de sécurité, *Browser Integrity Check*, *Challenge Passage* 30 min, Rocket Loader, Email Obfuscation et Hotlink Protection coupés, en-têtes gérés, liste `vigie_bloquees`, les cinq règles du pare-feu de `vigie-phase-0.md` (2.4), la limite de débit des images (2.5), DNSSEC, CAA. |
| Cloudflare, console | Connexion par Zitadel et par code e-mail dans Access, politique « administrateurs », application « Vigie » (8 h) ; `vigie.<domaine>` dans le tunnel et le DNS, exclu de la redirection. |
| Machine | `docker-compose.yml` (celui de cette version), `.env` et `vigie.env` (fusion), `vigie-secrets/console-secret`. |

Une **règle faite à la main** d'après le guide, par exemple la redirection vers `www`, est reconnue. Elle est mise à jour, pas doublée.

Le **secret client** d'une application qui existe déjà est repris du `.env`. S'il n'y est pas, un nouveau secret est généré : Zitadel ne remontre jamais l'ancien, qui cesse alors de fonctionner. Le plan l'annonce avant.

## Ce qui reste à faire à la main

L'installateur affiche cette liste à la fin :

- supprimer le compte de service « installateur » de Zitadel et le jeton Cloudflare de l'installateur ;
- chaque administrateur : accepter l'invitation, puis enregistrer deux facteurs ;
- lier chaque compte à son auteur dans l'admin (les `sub` sont affichés) ;
- si `DATA_KEY` vient d'être générée, la copier dans un gestionnaire de mots de passe ;
- DNSSEC : copier l'enregistrement DS chez le registraire ;
- dans Cloudflare : *Bot Fight Mode*, puis tester une publication Instagram ; Web Analytics sans injection ; notifications ;
- dans l'admin, Droits & confidentialité : cocher les cases qui deviennent vraies ;
- pour la Vigie : Signal, la bordure, la liste des adresses bloquées et le mode urgence (`vigie-phase-0.md`, 3.4 à 3.7).

## En cas de problème

- **« Droits manquants »** à la saisie du jeton Cloudflare : *My Profile → API Tokens →* le jeton *→ Edit*, ajoutez le droit nommé, puis saisissez à nouveau le jeton. Un refus plus tard (`403`) nomme aussi le droit probable.
- **Erreur pendant l'application** : ce qui est fait est fait. Corrigez, puis relancez : les éléments déjà en place sont retrouvés.
- **La pile ne démarre pas** : le message de Compose s'affiche. Voir le [guide Unraid](../unraid/README.md) et le wiki [Vigie, Dépannage](https://github.com/Volfieldd/deux-regards/wiki/Vigie#dépannage).
- **« 2 connecteurs actifs sur le tunnel »** : un second `cloudflared` tourne avec le même jeton, par exemple le modèle Unraid « Cloudflared Tunnel ». Il reçoit une partie des requêtes et ne joint pas la pile : 502 une fois sur deux. Arrêtez-le, ou donnez-lui un tunnel à lui.
