# Sorties réseau du site et flux entre conteneurs (BV-10, BV-11)

Phase E4 de la Vigie ; cahier des charges : [registre des briques](../../../docs/etudes/vigie-besoins-des-briques.md#déploiement--sorties-réseau-et-flux-entre-conteneurs)
(BV-10, BV-11), décisions D24 et D25 de l'[étude de recadrage](../../../docs/etudes/recadrage-vigie-edge-wake.md).
**Tout est facultatif** : sans les réglages ci-dessous, le site sort comme avant et la Vigie dit « Réseau : non réglé ».

Trois pièces, chacune utile seule, qui se complètent :

| Pièce | Ce qu'elle fait | Où |
|---|---|---|
| Mandataire de sortie (service `sortie`, profil « sortie ») | le site ne joint Internet que par lui ; il n'accepte que les noms de la liste ; refus et sorties acceptées journalisés (nom, port, octets ; jamais un chemin ni un contenu) | `mandataire.js`, `compose.yaml` |
| Règles de l'hôte (`regles.sh`, chaîne `DOCKER-USER`) | **forcent** le passage par le mandataire : toute autre sortie du site, et tout flux entre conteneurs hors de la liste, est rejeté et journalisé (`NICEPHOS-SORTIE`, `NICEPHOS-FLUX`) | `regles.sh` |
| Source « réseau » de la Vigie | lit ces deux journaux en lecture seule et en tire `reseau_sortie_refusee`, `reseau_sortie_directe`, `reseau_flux_hors_liste`, `vigie_reseau_silence` | `vigie/reseau.js`, `vigie/regles/75-reseau.yml` |

## Pourquoi un mandataire écrit ici

Squid et tinyproxy savent filtrer par nom ; le mandataire du dépôt (`mandataire.js`, 220 lignes, sans dépendance, lancé avec
l'image du site déjà tenue à jour) fait en plus ce qu'eux ne font pas sans réglages fragiles :

- il **résout lui-même** le nom autorisé, **refuse** s'il mène à une adresse privée (réseau local, Unraid, `169.254.…`) et se
  connecte à l'adresse vérifiée (un nom qui change d'adresse entre-temps ne mène pas ailleurs) ;
- son journal est **fait pour la Vigie** : une ligne JSON par demande, sans chemin par construction (un tunnel `CONNECT`
  n'en montre pas ; le HTTP en clair est refusé, son nom seul noté), un battement par heure (la Vigie distingue « rien à
  dire » de « muet ») ;
- sa liste se construit **au démarrage depuis les réglages du site**, sans fichier de configuration à générer.

Liste construite (journal du conteneur au démarrage, et `node vigie/cli.js reseau`) :

| Nom | D'où | Pour |
|---|---|---|
| hôte de `OIDC_ISSUER` (`<instance>.zitadel.cloud:443`) | `.env` | connexion à l'admin |
| hôte de `TSA_URL` (`freetsa.org:443` par défaut ; rien avec `off`) | `.env` | horodatage des preuves |
| hôte et port de `SMTP_URL` (`smtp.gmail.com:465`…) | `.env` | e-mails |
| `graph.instagram.com`, `api.instagram.com` | si `INSTAGRAM_APP_ID` | publication Instagram |
| `huggingface.co`, `*.huggingface.co`, `*.hf.co` | sauf `SORTIE_HUGGINGFACE=0` | modèles (descriptions, séries), au premier usage ; vu à l'essai : redirection vers `us.aws.cdn.hf.co` |
| hôte de `TRANSLATE_URL` s'il est externe | `.env` | traduction (le LibreTranslate de la pile est joint en direct) |
| `SORTIE_NOMS` (`nom`, `nom:port`, `*.domaine`) | `.env` | ce qu'une fonction nouvelle demande |

Relevé dans le code le 19 octobre 2026 : toutes les sorties du site passent par `fetch` (openid-client, Instagram, horodatage,
téléchargement des modèles : `server/describe-worker.js`, `server/series-suggest.js` ; transformers.js lui-même ne télécharge
rien, `allowRemoteModels = false`), sauf les e-mails (nodemailer). `fetch` suit `HTTPS_PROXY` avec `NODE_USE_ENV_PROXY=1`
(Node 22.21 et plus ; l'image est en 22.23, le site refuse de démarrer sur une version trop ancienne plutôt que de sortir en
direct) ; nodemailer reçoit le mandataire par son option `proxy` (`server/mailer.js`). La Vigie, le tunnel et le
traducteur ne passent pas par lui.

## Règles de l'hôte

`regles.sh --afficher` imprime tout ce qui serait posé, sans rien toucher. Matrice des flux voulus (BV-11) :

| De | Vers | Port |
|---|---|---|
| tunnel `172.29.42.10` | site `172.29.42.30` | 3000 |
| tunnel | console de la Vigie `172.29.42.20` | 4200 |
| réseau `nicephos-vigie-ingest` (le site) | réception de la Vigie `172.29.43.10` | 4100 |
| site | traducteur `172.29.42.40` | 5000 |
| réseau `nicephos-sortie` (le site) | mandataire `172.29.44.10` | 3128 |

Tout autre paquet entre deux adresses des trois réseaux de Nicephos : rejeté, journalisé `NICEPHOS-FLUX`. Sorties vers
l'extérieur de ces réseaux : permises au tunnel, à la Vigie et au traducteur ; pour tout autre conteneur de la pile (le site,
la sauvegarde), rejetées et journalisées `NICEPHOS-SORTIE`. Journal limité à 20 lignes par minute (rafales de 40). Les
réponses des connexions acceptées passent ; rien d'autre de l'hôte n'est visé (ni les autres conteneurs, ni les règles de
Docker). Les règles se posent d'un coup (`iptables-restore --noflush` sur les chaînes `NICEPHOS*`) ; relancé, le script ne
double rien ; `--retirer` enlève tout.

Pour cela, le site et le traducteur ont désormais une **adresse fixe** (`SITE_IP`, `TRADUCTION_IP`, hors de la plage des
adresses automatiques, comme le tunnel et la console) ; si vous avez changé `NET_SUBNET`, changez-les avec.

## Mise en place, pas à pas

### 1. Instance de test d'abord

Sur la machine de test (Ubuntu, rsyslog et iptables présents), la pile Unraid se lance à côté de l'instance actuelle sous un
autre nom de projet, avec un `.env` d'essai (dossiers d'essai, `LAN_PORT` libre, un tunnel d'essai ou un faux jeton si le
tunnel n'est pas l'objet de l'essai). Vérifiez d'abord que `172.29.42.0/24`, `172.29.43.0/24` et `172.29.44.0/24` sont
libres (`docker network inspect` de chaque réseau, `ip route`) ; sinon réglez `NET_SUBNET`, `VIGIE_NET_SUBNET`,
`SORTIE_NET_SUBNET` et les adresses fixes ensemble.

1. Dossiers (en plus de ceux de l'étape 2 du [README](../README.md)) :
   ```bash
   mkdir -p "$NICEPHOS_DIR/reseau/mandataire" "$NICEPHOS_DIR/reseau/hote"
   chown 99:100 "$NICEPHOS_DIR/reseau/mandataire"     # le mandataire écrit ici (PUID:PGID)
   chmod 755 "$NICEPHOS_DIR/reseau" "$NICEPHOS_DIR/reseau/hote"   # rsyslog (root) écrit dans hote/
   ```
2. `.env` de la pile : ajoutez `sortie` aux profils et dites au site d'y passer :
   ```
   COMPOSE_PROFILES=vigie,sortie
   SORTIE_MANDATAIRE=http://sortie:3128
   ```
   « Compose Up ». Contrôle : `docker logs nicephos-sortie` liste les noms autorisés ; `docker inspect nicephos-sortie`
   dit `healthy`.
3. Essayez chaque fonction qui sort : connexion à l'admin (Zitadel), une preuve horodatée, un e-mail (récapitulatif d'une
   rencontre), une description « Léger » ou une suggestion de série (premier téléchargement des modèles), Instagram si réglé.
   Chaque sortie apparaît dans `NICEPHOS_DIR/reseau/mandataire/mandataire.log` (`"evt":"accepte"`). Un refus
   (`"evt":"refus"`) d'une fonction légitime : ajoutez le nom à `SORTIE_NOMS` (et dites-le, pour qu'il entre dans la liste
   par défaut).
4. Vigie : dans `vigie.env`,
   ```
   VIGIE_RESEAU_MANDATAIRE=/reseau/mandataire/mandataire.log
   VIGIE_RESEAU_HOTE=/reseau/hote/hote.log
   ```
   « Compose Up » (la Vigie monte `NICEPHOS_DIR/reseau` en lecture seule sur `/reseau`). Contrôle :
   `docker exec nicephos-vigie node vigie/cli.js reseau` ; console, page Santé, carte « Réseau ».
5. Règles de l'hôte, dans cet ordre :
   ```bash
   sudo bash deploy/unraid/reseau/regles.sh --env /chemin/du/.env --afficher   # relire
   sudo bash deploy/unraid/reseau/regles.sh --env /chemin/du/.env --rsyslog    # journal dédié (relance rsyslog)
   sudo bash deploy/unraid/reseau/regles.sh --env /chemin/du/.env              # poser
   sudo bash deploy/unraid/reseau/regles.sh --env /chemin/du/.env --battement  # premier battement
   sudo iptables -L DOCKER-USER -n --line-numbers | head -3                     # NICEPHOS en tête
   sysctl net.bridge.bridge-nf-call-iptables                                    # doit valoir 1
   ```
   Sur la machine de test, la configuration de rsyslog va dans `/etc/rsyslog.d/` (relancé par `systemctl`) ; vérifiez que
   `/etc/rsyslog.conf` inclut ce dossier.
6. Vérifiez (section suivante), puis laissez tourner quelques jours : aucune alerte réseau ne doit sortir d'un usage normal.

### 2. Sur Unraid

1. Mêmes dossiers et même `.env` (étapes 1 à 4 ci-dessus), sur `NICEPHOS_DIR`.
2. Copiez `regles.sh` sur la clé USB (elle survit au redémarrage) : `/boot/config/nicephos/regles.sh`. La clé est en FAT32 :
   le script se lance par `bash`, jamais directement.
3. Greffon « User Scripts » (Community Applications) :
   - script `nicephos-reseau`, planification **At Startup of Array** :
     ```bash
     #!/bin/bash
     # Attendre Docker (la grappe démarre avant lui).
     for i in $(seq 1 60); do iptables -S DOCKER-USER >/dev/null 2>&1 && break; sleep 5; done
     bash /boot/config/nicephos/regles.sh --rsyslog
     bash /boot/config/nicephos/regles.sh
     bash /boot/config/nicephos/regles.sh --battement
     ```
   - script `nicephos-reseau-battement`, planification **Hourly** :
     ```bash
     #!/bin/bash
     bash /boot/config/nicephos/regles.sh --battement
     ```
   Le `.env` est lu à `/boot/config/plugins/compose.manager/projects/nicephos/.env` (sinon `--env`), **jamais exécuté** :
   seules les clés d'adresses et `NICEPHOS_DIR` en sont lues, puis vérifiées.
4. Lancez une fois `nicephos-reseau` à la main (« Run Script »), puis vérifiez.

## Vérifier

Depuis le site (chaque commande doit échouer, et chaque échec se voir) :

```bash
# Nom hors liste, par le mandataire : refus 403 → "evt":"refus" dans mandataire.log → reseau_sortie_refusee (moyen)
docker exec nicephos node -e "fetch('https://example.com').then(r=>console.log(r.status)).catch(e=>console.log('refusé', e.cause?.message))"
# Sortie directe, sans le mandataire : connexion rejetée → NICEPHOS-SORTIE dans hote.log → reseau_sortie_directe (haut)
docker exec nicephos node -e "require('net').connect(443,'1.1.1.1').on('connect',()=>console.log('SORTI : règles absentes')).on('error',e=>console.log(e.code))"
# Le site vers la console (mouvement latéral) : rejeté → NICEPHOS-FLUX → reseau_flux_hors_liste (haut)
docker exec nicephos node -e "require('net').connect(4200,'172.29.42.20').on('connect',()=>console.log('JOINT : règles absentes')).on('error',e=>console.log(e.code))"
```

Puis `docker exec nicephos-vigie node vigie/cli.js reseau --lire` (lecture immédiate), `… alertes`, et la carte « Réseau »
de la page Santé (« Lu », battements récents). Classez les alertes d'essai : `… classer <n°> test`.
`tail -f $NICEPHOS_DIR/reseau/hote/hote.log` montre les rejets en direct.

## Revenir en arrière

Dans l'ordre inverse, chaque étape seule :

1. Règles : `bash /boot/config/nicephos/regles.sh --retirer` ; désactivez les deux scripts de « User Scripts » ;
   `rm /etc/rsyslog.d/nicephos-reseau.conf` et relancez rsyslog (`/etc/rc.d/rc.rsyslogd restart`).
2. Vigie : retirez `VIGIE_RESEAU_*` de `vigie.env`, « Compose Up ».
3. Mandataire : retirez `SORTIE_MANDATAIRE` du `.env` et `sortie` de `COMPOSE_PROFILES`, « Compose Up » : le site sort de
   nouveau en direct (ses variables de mandataire redeviennent vides).

Les adresses fixes du site et du traducteur peuvent rester.

## Limites connues, et la suite

- **DNS** : le résolveur intégré de Docker relaie les noms depuis le démon, hors de `DOCKER-USER` ; une fuite par requêtes
  DNS reste possible. Parade suivante : `dns:` du site vers un petit résolveur à liste autorisée qui journalise les refus.
- **IPv6** : les réseaux de la pile sont en IPv4 seul ; si IPv6 y était activé, il faudrait les mêmes règles en `ip6tables`.
- **Journal du noyau limité en débit** : au-delà de 20 lignes par minute, des rejets ne sont pas écrits (ils sont toujours
  rejetés) ; la Vigie voit la tentative, pas son volume exact.
- **Redémarrage de Docker** : s'il retirait l'appel en tête de `DOCKER-USER`, le battement horaire dit `etat=absentes` et la
  Vigie ouvre « Journal réseau illisible ou muet, ou règles de l'hôte absentes » ; relancez `nicephos-reseau`.
- **Découpage du réseau `nicephos` par flux (BV-11, « empêcher ») : étape suivante.** Aujourd'hui seul le mandataire a son
  réseau (`nicephos-sortie`, interne) ; le site reste sur `nicephos`, routé, et c'est la règle de l'hôte qui l'empêche de
  sortir. Le découpage complet demande de déplacer le tunnel, la console et le traducteur sur des réseaux à eux et le site
  hors de `nicephos` (qui changerait l'adresse de confiance `TRUST_PROXY`, les modèles de conteneurs Unraid et les essais de
  déploiement) : à faire une fois les règles éprouvées, quand une coupure de la pile est prévue. Réseaux proposés, tous
  **internes** sauf ceux d'une seule sortie :

  | Réseau | Interne | Membres |
  |---|---|---|
  | `nicephos-tunnel` | oui | tunnel, site (`:3000`), console de la Vigie (`:4200`) |
  | `nicephos-tunnel-sortie` | non | tunnel seul (vers Cloudflare) |
  | `nicephos-vigie-ingest` (existe) | oui | site, réception de la Vigie |
  | `nicephos-traduction` | oui | site, traducteur |
  | `nicephos-traduction-sortie` | non | traducteur seul (modèles au premier lancement ; retirable ensuite) |
  | `nicephos-sortie` (existe) | oui | site, mandataire |
  | `nicephos-sortie-internet` (existe) | non | mandataire seul |
  | `nicephos-vigie-sortie` | non | Vigie seule (Zitadel, Cloudflare, listes de menaces, e-mail) |
  | aucun (`network_mode: none`) | — | `backup`, comme `vigie-backup` |

  Le site n'aurait alors plus aucun réseau routé : il ne pourrait plus sortir qu'en passant par le mandataire, même sans les
  règles de l'hôte, qui resteraient pour **signaler** (BV-11 : ce que le découpage n'interdit pas, deux conteneurs qui
  partagent légitimement un réseau, passe toujours par `NICEPHOS-FLUX`). Point à trancher avant : Docker ne publie pas de
  port d'un conteneur qui n'est que sur des réseaux internes ; l'accès de contrôle depuis le réseau local (`LAN_PORT`)
  passerait alors par le tunnel (Cloudflare Access) ou par un petit relais à lui.
