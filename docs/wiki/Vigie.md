# Vigie : journalisation de sécurité (facultative)

La Vigie est un composant **à part** du site : son propre conteneur, sa propre base, ses propres secrets. Le site lui envoie ses événements de sécurité (connexions, sessions, saisies malveillantes, pièges, droits, comptes…) et applique les décisions qu'elle publie (blocages, révocations, gel d'un compte, verrouillage de l'admin). Elle lit aussi les événements de Zitadel. Conception : [étude](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/annexe-vigie-architecture.md).

**Facultative** : sans elle, le site fonctionne exactement comme avant. On l'ajoute par un profil Compose et quatre variables ; on la retire en vidant `VIGIE_URL`.

| Phase | Contenu | État |
|---|---|---|
| A | Le site émet ses événements | fait |
| B | Conteneur de la Vigie : réception signée, base chaînée, décisions signées appliquées par le site, interrupteurs, ligne de commande, lecture de Zitadel, sauvegarde | fait |
| C1 | Moteur d'entités : score composite qui s'efface avec le temps, quorum entre sources (deux sources pour une alerte « moyen » ou « haut »), exceptions à source unique, alertes, modes par règle, réponses automatiques prudentes | fait |
| C2 | Règles au format Sigma, détecteurs comportementaux, listes de menaces, contrôle des rôles sur les sauvegardes, verdicts agrégés | fait |
| C3 | Capteur en bordure (Cloudflare Worker) | à venir |
| D | Console `vigie.nicephos.art` (Cloudflare Access + Zitadel), notifications (admin, e-mail, Signal) | à venir |

---

## Installer sur Unraid

Prérequis : la phase 0 faite ([`deploy/unraid/vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md)) ; les sauvegardes du site en place (service `backup`, `BACKUP_DIR`) : la Vigie les lit en lecture seule pour contrôler les administrateurs et **refuse de démarrer sans elles** (`VIGIE_SITE_BACKUP_DIR`, déjà réglé dans `compose.yaml`) ; pour Zitadel, la clé JSON du compte de service `vigie-lecture`.

1. **Dossiers** (terminal Unraid) :

   ```bash
   mkdir -p /mnt/cache/appdata/nicephos/vigie /mnt/cache/appdata/nicephos/vigie-secrets /mnt/user/backups/nicephos-vigie
   chown -R 99:100 /mnt/cache/appdata/nicephos/vigie /mnt/cache/appdata/nicephos/vigie-secrets /mnt/user/backups/nicephos-vigie
   chmod 700 /mnt/cache/appdata/nicephos/vigie /mnt/cache/appdata/nicephos/vigie-secrets
   ```

   Pour Zitadel : copier la clé JSON dans `/mnt/cache/appdata/nicephos/vigie-secrets/zitadel.json` (`chmod 600`, propriétaire `99:100`).

2. **Clés** (une seule fois) :

   ```bash
   docker run --rm ghcr.io/volfieldd/deux-regards-vigie:latest node vigie/cli.js cles
   ```

   La commande affiche deux blocs :
   - **`.env` de la Vigie** : `VIGIE_INGEST_KEY`, `VIGIE_LOG_KEY`, `VIGIE_DECISIONS_PRIVATE_KEY` → dans `vigie.env`, à côté de `compose.yaml` (modèle : `vigie.env.example`) ;
   - **`.env` du site** : la même `VIGIE_INGEST_KEY`, et `VIGIE_DECISIONS_PUBKEY`.

   Gardez une copie des trois clés de la Vigie dans votre gestionnaire de mots de passe. `VIGIE_LOG_KEY` perdue : la chaîne du journal ne se vérifie plus (les événements restent lisibles).

3. **`vigie.env`** : les trois clés ; pour Zitadel, `VIGIE_ZITADEL_ISSUER=https://<instance>.zitadel.cloud`.

4. **`.env` du site** : ajouter

   ```dotenv
   VIGIE_URL=http://vigie-reception:4100
   VIGIE_INGEST_KEY=…            # la même que dans vigie.env
   VIGIE_DECISIONS_PUBKEY=…
   COMPOSE_PROFILES=vigie        # démarre aussi la Vigie et sa sauvegarde
   ```

5. **Compose Pull** puis **Compose Up**.

**Vérifier :**

```bash
docker exec nicephos-vigie node vigie/cli.js etat
```

Au bout d'une minute : « Chaîne : intacte », des événements des dernières 24 h (au moins `sys_heartbeat` du site), et « Zitadel : lu le … » si configuré. Les journaux du site ne doivent plus contenir « Vigie injoignable ».

## Ligne de commande (secours)

Toujours disponible, même sans console :

```bash
docker exec nicephos-vigie node vigie/cli.js <commande>
```

| Commande | Effet |
|---|---|
| `etat` | chaîne, événements des dernières 24 h, Zitadel, interrupteurs, décisions actives |
| `verifier` | vérifie la chaîne du journal |
| `decisions` | décisions actives (numéro, cible, fin, auteur, motif) |
| `bloquer 203.0.113.7 --duree 24h --portee tout --motif "scan"` | bloque une adresse ou un réseau (`--portee admin` : l'admin et la connexion ; `auth` : la connexion) ; IPv4 de /8 à /32, IPv6 de /32 à /128, 30 jours au plus |
| `revoquer-session <empreinte>` | ferme une session (empreinte de 12 caractères, vue dans les événements) |
| `revoquer-compte <sub>` | ferme toutes les sessions ouvertes du compte (il se reconnecte par Zitadel) |
| `geler <sub> --duree 24h` | compte traité comme désactivé sur le site (sessions fermées, connexion refusée), 30 jours au plus |
| `verrouiller --comptes <sub,…> --adresses <ip,…> --duree 12h` | seuls ces comptes ou adresses entrent dans l'admin, 24 h au plus |
| `lever <numéro>`, `lever --tout` | annule une décision, ou toutes |
| `interrupteur blocages arret --duree 2h` | arrête les blocages automatiques (phase C) pour une durée (obligatoire, 7 jours au plus) ; `detection`, `alertes` de même |

Chaque action est notée dans la base de la Vigie, avec l'utilisateur du système. Le site applique une décision en quelques secondes.

## Alertes (phase C1)

Concepts repris de marlinOS ([recadrage](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/recadrage-vigie-edge-wake.md)) :

- **Entités** : adresse, réseau, compte (`sub`, le même sur le site et chez Zitadel), session. Chaque événement y dépose des points (barème : `vigie/poids.js`) ; le score perd la moitié de sa valeur chaque heure ; chaque source (site, Zitadel, bordure, contrôles de la Vigie) a sa part.
- **Quorum** : une alerte de score (« moyen », « haut » au double du seuil) demande le seuil franchi **et deux sources** ; une source seule fait monter le score, jamais l'alerte. Seuils de départ : adresse 7, réseau 12, compte 7, session 5.
- **Exceptions à source unique** (alerte immédiate) : rôle donné hors de l'application, administrateur donné, déclencheurs ou tickets des comptes altérés, chaîne rompue, contrôle des rôles en écart ou impossible, moteur saturé, cookie rejoué depuis un autre appareil (autre réseau **et** autre navigateur), session reprise depuis un autre appareil, saisie malveillante depuis un compte de l'admin, Zitadel critique (emprunt d'identité, administrateur ajouté, politique affaiblie), configuration changée, restauration, déchiffrement impossible, ingestion refusée, trou Zitadel.
- **Modes** (par règle) : `arret`, `observer` (alerte ouverte et marquée, sans notification ni réponse : le mois d'observation), `alerter`, `bloquer` (réponse automatique). Au départ, tout est en `observer`, sauf le cookie rejoué (sessions du compte fermées) et le rôle donné hors de l'application (compte gelé 24 h, sessions fermées), en `bloquer`.
- **Réponses automatiques** : seulement en mode `bloquer` et interrupteur `blocages` en marche ; jamais en double ; une adresse n'est jamais bloquée automatiquement si elle est privée (réseau Docker, proxy), « de confiance », ou vue avec un **administrateur** (30 jours). Un compte ordinaire ne protège pas son adresse : sinon un attaquant qui ouvre un compte s'achèterait l'exemption.
- **Une alerte par règle et par entité** tant qu'elle est ouverte et active : les événements suivants s'y ajoutent (compteur, sources, gravité la plus haute). Une aggravation est notée (événement `vigie_alerte`, action `aggravee`) ; en mode `bloquer`, la réponse est reprise (au plus toutes les 15 minutes) si la décision a expiré ou a été levée alors que l'attaque continue. Après 24 heures sans nouvel événement, une reprise ouvre une nouvelle alerte ; une alerte restée **ouverte** 7 jours sans nouvel événement est close « sans suite » (une alerte prise en charge reste à son intervenant).
- **Analyse hors de la réception** : la réception répond au site sans attendre le moteur (file traitée par lots de 200). Si la file déborde (100 000 événements), les événements restent dans la base et la chaîne, mais ne sont pas analysés : alerte « moteur saturé ».

| Commande | Effet |
|---|---|
| `alertes` (`--toutes`) | alertes ouvertes, de la plus grave à la moins grave |
| `alerte <id>` | règle, entité, sources, réponse, et « D'où vient le signal » (les événements, leur heure à la source et l'écart jusqu'à leur réception par la Vigie, leur composant, leur émetteur, leur confiance) |
| `prendre <id>`, `classer <id> <incident\|faux_positif\|test> --note "…"` | prise en charge ; clôture |
| `entites` | entités les plus chaudes (score, sources) |
| `regles`, `regle <règle> <mode>`, `seuil <classe> <points>` | modes et seuils |
| `confiance ajouter\|retirer <ip>` | adresses jamais bloquées automatiquement |

## Règles et détecteurs (phase C2)

- **Règles au format Sigma** (`vigie/regles/*.yml`, décision D20) : 34 règles et 13 corrélations (`event_count`, `value_count`), chacune avec son cas (DS…), sa gravité (`level`), ses tactiques MITRE ATT&CK (`tags`) et un bloc `vigie` : entité visée, preuve à source unique (`source_unique: true`, alerte immédiate) ou points déposés sur l'entité (quorum), réponse automatique, mode par défaut. Format standard, lisible ; une règle mal écrite empêche la Vigie de démarrer (jamais une règle ignorée en silence, jamais une erreur à chaque événement : modificateurs et expressions vérifiés au chargement). Sous-ensemble pris en charge : sélections (carte = ET, liste = OU), modificateurs `contains`, `startswith`, `endswith`, `re`, `gte`, `gt`, `lte`, `lt`, `exists`, `all` ; conditions `and`, `or`, `not`, parenthèses, `1 of`, `all of` ; corrélations `event_count`, `value_count` (conditions `gte` ou `gt` : `lte` et `eq` sont refusés, ils se déclencheraient au premier événement), `temporal`. Une règle sur l'entité `site` ou `vigie` doit être `source_unique` (aucun score ne s'y dépose). Deux réglages facultatifs du bloc `vigie` : `expire: AAAA-MM-JJ` (règle temporaire, inactive après ce jour, marquée « EXPIRÉE » par `regles`) et `delai_re_ms: 1 à 1000` (chaque expression régulière de la règle est arrêtée au bout de ce délai : l'événement ne correspond pas, alerte « règle lente » une fois par heure ; environ 0,25 ms de plus par essai, à réserver aux expressions difficiles à relire ou venues d'ailleurs). Corrélations : un résumé du site compte pour son `nombre`, les points vont aux sources des événements qui y ont contribué (une corrélation site + Zitadel peut faire le quorum), mémoire bornée (200 000 points au total, 10 000 groupes par corrélation, valeurs gardées en empreinte courte).
- **Détecteurs comportementaux** (`vigie/detecteurs.js`, inspirés de marlinOS) : première apparition (pays ou appareil jamais vus pour un compte en 90 jours, DS4), heure inhabituelle (heure UTC jamais vue en 28 jours, DS18), vitesse (lectures du jour au-delà de la moyenne + 3 écarts-types, vue dès la rafale, DS17), voyage impossible (plus de 500 km à plus de 900 km/h entre deux connexions, à l'heure de l'événement, DS3), pivot d'identifiants (3 échecs puis une connexion en 6 h, une fois par compte et par 6 h, DS25), rôle incohérent (export réservé à l'administrateur fait par un autre compte : preuve, critique, DS10), exploration lente (un réseau dans les pièges sur 12 heures distinctes en 72 h, calculée une fois par heure, DS15), chaîne d'attaque (repérage, tentative puis accès sur une entité en 24 h, critique, DS23), site silencieux (plus de 3 min sans événement du site, DS24).
- **Listes de menaces** (D22) : Spamhaus DROP, abuse.ch Feodo Tracker, sorties Tor, téléchargées une fois par jour par la Vigie ; une adresse listée prend des points (3, 3, 1) une fois par jour et par liste, qui **ne comptent pas** comme une source du quorum. Aucune adresse de visiteur n'est envoyée à un tiers. Garde-fous : Feodo et Tor, adresses seules ; Spamhaus, réseaux de /10 (IPv4) ou /19 (IPv6) au plus large ; 20 000 entrées par liste ; une liste qui triple d'un jour à l'autre est refusée (l'ancienne reste) ; pas de redirection suivie. `VIGIE_MENACES=0` pour ne pas les télécharger (celles déjà en base ne marquent plus rien).
- **Contrôle des rôles sur les sauvegardes du site** (obligatoire) : une minute après le démarrage puis chaque heure, à chaque nouvelle sauvegarde, la Vigie ouvre l'instantané en lecture seule (`VIGIE_SITE_BACKUP_DIR`, le `BACKUP_DIR` du site monté en lecture seule). Seul un fichier ordinaire au nom d'instantané (`site-AAAA-MM-JJTHHMMSS.db`), daté au plus tard maintenant, est lu (ni lien, ni tube, ni nom fabriqué). **Critique** : administrateur actif que le site n'a pas déclaré, nouvel administrateur depuis l'instantané précédent sans changement journalisé par le site (le site peut mentir dans ses déclarations, pas dans une sauvegarde faite par un autre conteneur), déclencheur du journal des comptes absent ou au texte changé sans migration, instantané illisible. **Haut** : aucun instantané, sauvegarde de plus de 48 h, aucune déclaration du site, déclencheur changé par une migration (à vérifier). Les administrateurs dont l'adresse n'est jamais bloquée automatiquement sont ceux du dernier contrôle réussi, jamais la seule déclaration du site.
- **Événements de Zitadel** : le compte retenu est celui qui est visé (l'utilisateur de l'agrégat, ou de la session), l'auteur de l'action est gardé dans le détail (`auteur`).
- **Résumés côté site** (D23) : pour les pièges, pages introuvables, jetons faux, valeurs impossibles, blocages et limites venant du public, le premier événement d'une adresse part tout de suite, les suivants de la même fenêtre de 5 minutes partent en un seul événement (`agrege`, `nombre`).

| Commande | Effet |
|---|---|
| `menaces` | date et taille des listes de menaces |
| `controle` | contrôle des rôles sur la dernière sauvegarde du site, tout de suite (alertes ouvertes comme dans le service) |
| `controle --accepter --motif "…"` | après vérification d'un écart expliqué ailleurs (administrateur ajouté directement dans la base, par exemple) : l'instantané actuel devient la référence |

## Horodatages et capacité

- **Deux heures par événement** : `survenu_a`, l'heure de la source (site, Zitadel), et `recu_a`, l'heure de réception par la Vigie. Les détecteurs (heure inhabituelle, voyage impossible) prennent l'heure de la source, bornée à 30 jours en arrière et 5 minutes en avant ; hors bornes, l'heure reçue est gardée telle quelle dans le détail (`horodatage_site_brut`). Les horloges du site et de la Vigie ne peuvent pas diverger de plus de 60 s : un lot signé plus décalé est refusé.
- **Capacité** : abaques, facteurs limitants et leviers dans [`docs/etudes/vigie-capacite.md`](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/vigie-capacite.md). Pour mesurer sur la machine, dans un conteneur à part, sans secret ni réseau (base jetable, effacée à la fin, jamais la vraie) :

  ```bash
  mkdir -p /mnt/cache/appdata/nicephos/vigie-banc && chown 99:100 /mnt/cache/appdata/nicephos/vigie-banc
  docker run --rm --network none --user 99:100 -v /mnt/cache/appdata/nicephos/vigie-banc:/banc \
    ghcr.io/volfieldd/deux-regards-vigie:latest node vigie/banc.js --dossier /banc --historique 1000000 --evenements 5000
  ```

## Garde-fous

- **Le site ne bloque jamais tout le monde** : une liste qui contiendrait `0.0.0.0/0`, `::/0`, un réseau plus large que /8 (IPv4) ou /32 (IPv6), une plage IPv6 qui recouvre l'IPv4, la boucle locale, plus de l'équivalent d'un /8 au total ou plus de 10 000 entrées est refusée en entier ; toute décision expire ; les comptes de `ADMIN_SUBS` ne sont jamais gelés ni tenus dehors par un verrouillage.
- **Réception** : elle n'écoute que sur le réseau interne `nicephos-vigie-ingest`, à l'adresse `VIGIE_INGEST_IP` (`172.29.43.10` par défaut) ; le site l'appelle `vigie-reception`.
- **Vigie arrêtée** : le site applique la dernière liste valide (gardée dans `STORAGE_DIR/securite-decisions.json`) jusqu'à ses fins, et garde ses événements en attente (50 Mo au plus).
- **Dernier recours** : `VIGIE_APPLIQUER=0` dans le `.env` du site puis redémarrage : les décisions sont lues mais jamais appliquées (un avertissement le dit dans les journaux du site).
- **Signature** : le site n'applique qu'une liste signée par la clé privée de la Vigie (Ed25519), et jamais une liste plus ancienne que celle en place. La Vigie n'accepte que des lots signés par le site (HMAC), datés à 60 s près, jamais rejoués.

## Ce que garde la Vigie

- **Événements** : 6 mois (`VIGIE_RETENTION_DAYS`), chaînés (une ligne modifiée, insérée à la main ou effacée se voit à la vérification quotidienne, critique) ; compteurs par jour 25 mois. Chaque nuit, la tête de la chaîne (numéro, maillon, signature) est écrite dans le journal du conteneur (`docker logs nicephos-vigie | grep tete_chaine`) : la comparer d'un jour à l'autre montre une base revenue en arrière.
- **Zitadel** : 210 types d'événements suivis (`vigie/zitadel/types-suivis.json`, tirés de la liste de l'instance), lus toutes les minutes ; seuls quelques champs sans donnée personnelle sont gardés (rôles, projet, réglages de connexion, adresse IP de l'agent quand Zitadel la donne) ; plus de 20 h sans lecture : signalé.
- **Sauvegardes** : conteneur `nicephos-vigie-sauvegarde`, un instantané contrôlé par jour, 14 gardés, dans `/mnt/user/backups/nicephos-vigie`.

## Retirer la Vigie

Vider `VIGIE_URL` (et retirer `COMPOSE_PROFILES=vigie`) dans le `.env` du site, **Compose Up**. Le site oublie les décisions et les événements en attente ; la base de la Vigie reste dans son dossier jusqu'à ce que vous l'effaciez.
