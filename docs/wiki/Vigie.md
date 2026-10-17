# Vigie : journalisation de sécurité (facultative)

La Vigie est un composant **à part** du site : son propre conteneur, sa propre base, ses propres secrets. Le site lui envoie ses événements de sécurité (connexions, sessions, saisies malveillantes, pièges, droits, comptes…) et applique les décisions qu'elle publie (blocages, révocations, gel d'un compte, verrouillage de l'admin). Elle lit aussi les événements de Zitadel. Conception : [étude](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/annexe-vigie-architecture.md).

**Facultative** : sans elle, le site fonctionne exactement comme avant. On l'ajoute par un profil Compose et quatre variables ; on la retire en vidant `VIGIE_URL`.

| Phase | Contenu | État |
|---|---|---|
| A | Le site émet ses événements | fait |
| B | Conteneur de la Vigie : réception signée, base chaînée, décisions signées appliquées par le site, interrupteurs, ligne de commande, lecture de Zitadel, sauvegarde | fait |
| C | Règles de détection (DS1 à DS30) et alertes | à venir |
| D | Console `vigie.nicephos.art` (Cloudflare Access + Zitadel), notifications (admin, e-mail, Signal) | à venir |

---

## Installer sur Unraid

Prérequis : la phase 0 faite ([`deploy/unraid/vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md)) ; pour Zitadel, la clé JSON du compte de service `vigie-lecture`.

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
