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
| D | Notifications (e-mail, Signal) ; console `vigie.nicephos.art` (Cloudflare Access + Zitadel) et affichage dans l'admin | notifications faites ; console et affichage à venir |
| E2 | Jeu d'attaques rejouable (`npm run attaques`) : scénarios joués contre un site et une Vigie neufs, alertes attendues vérifiées | fait |
| E4 | Source « réseau » : mandataire de sortie à liste autorisée, sorties directes et flux entre conteneurs hors liste rejetés et journalisés par l'hôte, journaux lus par la Vigie (BV-10, BV-11) | fait côté code ; à appliquer sur l'instance de test |

---

## Installer sur Unraid

Prérequis : la phase 0 faite ([`deploy/unraid/vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md)) ; les sauvegardes du site en place (service `backup`, `BACKUP_DIR`) : la Vigie les lit en lecture seule pour contrôler les administrateurs et **refuse de démarrer sans elles** (`VIGIE_SITE_BACKUP_DIR`, déjà réglé dans `compose.yaml`) ; pour Zitadel, la clé JSON du compte de service `vigie-lecture`.

1. **Dossiers** : `NICEPHOS_DIR/vigie`, `NICEPHOS_DIR/vigie-secrets` et `BACKUP_DIR-vigie`, créés à l'étape 2 du [guide Unraid](Unraid) (bloc « Vigie »).

   Pour Zitadel : copier la clé JSON dans `$NICEPHOS/vigie-secrets/zitadel.json` (`chmod 600`, propriétaire `99:100`).

2. **Clés** (une seule fois) :

   ```bash
   docker run --rm ghcr.io/volfieldd/deux-regards-vigie:latest node vigie/cli.js cles
   ```

   La commande affiche deux blocs :
   - **`.env` de la Vigie** : `VIGIE_INGEST_KEY`, `VIGIE_LOG_KEY`, `VIGIE_DECISIONS_PRIVATE_KEY` → dans `vigie.env`, à côté de `compose.yaml` (modèle : `vigie.env.example`) ;
   - **`.env` du site** : la même `VIGIE_INGEST_KEY`, et `VIGIE_DECISIONS_PUBKEY`.

   Gardez une copie des trois clés de la Vigie dans votre gestionnaire de mots de passe. `VIGIE_LOG_KEY` perdue : la chaîne du journal ne se vérifie plus (les événements restent lisibles).

3. **`vigie.env`** : les trois clés ; pour Zitadel, `VIGIE_ZITADEL_ISSUER=https://<instance>.zitadel.cloud`. Compose Manager ne l'affiche pas : créez-le dans le terminal, dans le dossier de la pile (celui qui contient son `docker-compose.yml` et son `.env`, en général `/boot/config/plugins/compose.manager/projects/nicephos/`), puis `chmod 600`.

4. **`.env` du site** : ajouter

   ```dotenv
   VIGIE_URL=http://vigie-reception:4100
   VIGIE_INGEST_KEY=…            # la même que dans vigie.env
   VIGIE_DECISIONS_PUBKEY=…
   COMPOSE_PROFILES=vigie        # démarre aussi la Vigie et sa sauvegarde ; « vigie,signal » : et la passerelle Signal
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
| `verifier-identite <sub> --duree 24h --motif "…"` | le site redemande l'identité du compte (nouvelle connexion chez Zitadel, clé d'accès comprise) avant toute écriture dans l'admin, à toute session authentifiée avant la décision ; lectures permises, bandeau dans l'admin ; 24 h par défaut, 7 jours au plus (voir « Vérification d'identité ») |
| `suspendre-acces <n°> --duree 7j --motif "…"` | accès d'une galerie privée (son numéro, `detail.acces`) suspendu par le site, une fois, comme après 30 refus : les invités sortent, l'équipe le rouvre dans l'admin (lever la décision ne le rouvre pas) ; 30 jours au plus |
| `verrouiller --comptes <sub,…> --adresses <ip,…> --duree 12h` | seuls ces comptes ou adresses entrent dans l'admin, 24 h au plus |
| `lever <numéro>`, `lever --tout` | annule une décision, ou toutes |
| `interrupteur blocages arret --duree 2h` | arrête les blocages automatiques (phase C) pour une durée (obligatoire, 7 jours au plus) ; `detection`, `alertes` de même |

Chaque action est notée dans la base de la Vigie, avec l'utilisateur du système. Le site applique une décision en quelques secondes.

## Alertes (phase C1)

Concepts repris de marlinOS ([recadrage](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/recadrage-vigie-edge-wake.md)) :

- **Entités** : adresse, réseau, compte (`sub`, le même sur le site et chez Zitadel), session. Chaque événement y dépose des points (barème : `vigie/poids.js`) ; le score perd la moitié de sa valeur chaque heure ; chaque source (site, Zitadel, bordure, contrôles de la Vigie) a sa part.
- **Quorum** : une alerte de score (« moyen », « haut » au double du seuil) demande le seuil franchi **et deux sources** ; une source seule fait monter le score, jamais l'alerte. Seuils de départ : adresse 7, réseau 12, compte 7, session 5.
- **Exceptions à source unique** (alerte immédiate) : rôle donné hors de l'application, administrateur donné, déclencheurs ou tickets des comptes altérés, chaîne rompue, contrôle des rôles en écart ou impossible, moteur saturé, cookie rejoué depuis un autre appareil (autre réseau **et** autre navigateur), session reprise depuis un autre appareil, saisie malveillante depuis un compte de l'admin, Zitadel critique (emprunt d'identité, administrateur ajouté, politique affaiblie), configuration changée, restauration, déchiffrement impossible, ingestion refusée, trou Zitadel.
- **Modes** (par règle) : `arret`, `observer` (alerte ouverte et marquée, sans notification ni réponse : le mois d'observation), `alerter`, `bloquer` (réponse automatique). Au départ, tout est en `observer`, sauf le cookie rejoué (sessions du compte fermées), le rôle donné hors de l'application (compte gelé 24 h, sessions fermées) et la session reprise depuis un autre appareil, avec ses deux corrélations (réglage public ou billet piégé dans l'heure ; identité redemandée 24 h), en `bloquer`, et les preuves sans réponse possible (administrateur donné, journal des comptes altéré, sauvegarde différente de ce que déclare le site, contrôle des rôles impossible, chaîne du journal rompue), en `alerter` : jamais muettes.
- **Réponses automatiques** : seulement en mode `bloquer` et interrupteur `blocages` en marche ; jamais en double ; une adresse n'est jamais bloquée automatiquement si elle est privée (réseau Docker, proxy), « de confiance », ou d'où un **administrateur** s'est connecté (connexion réussie, 30 jours). Un compte ordinaire ne protège pas son adresse, et un événement qui cite un administrateur (cookie rejoué, refus de droit) non plus : sinon un attaquant s'achèterait l'exemption.
- **Vérification d'identité** (`verifier_identite`, décision du propriétaire du 19 octobre 2026) : plutôt que geler un compte ou fermer ses sessions, le site redemande son identité. Toute session du compte **authentifiée chez Zitadel avant la décision** (heure `auth_time` du jeton d'identité, gardée avec la session) ne peut plus rien écrire dans l'admin : un formulaire mène à `/auth/verifier` (nouvelle connexion chez Zitadel, `prompt=login`, `max_age=300` : la clé d'accès est redemandée), un appel `fetch` reçoit un 403 avec le lien ; les lectures restent permises, sous un bandeau « Par sécurité, confirmez votre identité avant de modifier quoi que ce soit » (FR/DE/EN). Au retour, le site exige **le même compte** et une authentification **faite à l'instant**, puis ouvre une **session neuve** (l'ancienne est détruite) et ramène à la page. La personne légitime passe en quelques secondes ; un voleur du seul cookie de session, non (ni d'un cookie de session Zitadel : `prompt=login`). Réponse automatique de `session_autre_appareil` (DS2), `reglage_apres_session_reprise` et `billet_apres_session_reprise` (DS23), en mode `bloquer` d'emblée : la réponse est douce. Elle vise aussi un administrateur ou un compte de `ADMIN_SUBS` (c'est le cas utile, et personne n'est tenu dehors) ; rien de nouveau si l'identité a été confirmée après la dernière session reprise, ni tant qu'une vérification en cours n'est pas satisfaite ; une nouvelle reprise après une confirmation : une nouvelle vérification. Événements du site : `authz_reauth_required` (écriture arrêtée ; une fois par minute, par session et par route) et `authn_reauth_success` (identité confirmée) ; un retour d'un autre compte est un `authn_login_fail` (« autre compte », haut). Règle `ecritures_sans_identite` (`80-admin.yml`) : 5 routes d'écriture différentes arrêtées en 15 minutes pour un compte (Haute, DS2, mode Alerter : geler le compte se décide à la main). Sans Vigie, ou avec `VIGIE_APPLIQUER=0`, rien ne change. Une session ouverte avant la migration 058 du site (sans `auth_time`) est tenue pour ancienne.
- **Une alerte par règle et par entité** tant qu'elle est ouverte et active : les événements suivants s'y ajoutent (compteur, sources, gravité la plus haute). Une aggravation est notée (événement `vigie_alerte`, action `aggravee`) ; en mode `bloquer`, la réponse est reprise (au plus toutes les 15 minutes) si la décision a expiré ou a été levée alors que l'attaque continue. Après 24 heures sans nouvel événement, une reprise ouvre une nouvelle alerte ; une alerte restée **ouverte** 7 jours sans nouvel événement est close « sans suite » (une alerte prise en charge reste à son intervenant). Ordre partout (console, `alertes`, résumé de l'admin) : gravité, ouverte avant prise en charge, la plus récente d'abord.
- **Surveillance réduite** : arrêter un interrupteur, passer une règle en arrêt ou dans un mode plus faible (Bloquer → Alerter → Observer), relever un seuil, ajouter une adresse de confiance ou accepter une référence du contrôle des rôles ouvre l'alerte « Surveillance réduite » (Moyenne, mode Alerter) et envoie **un message à chaque geste**, même quand l'alerte est déjà ouverte, hors du plafond de 20 messages par heure, **même si l'interrupteur des alertes ou de la détection vient d'être arrêté** : « [Moyenne] Surveillance réduite : blocages automatiques arrêtés jusqu'à 15 h 10 » (ni adresse ni motif). Cette règle ne s'arrête pas. En ligne de commande, chacun de ces gestes demande `--motif "…"`. Une règle arrêtée reprend, à la fin, le mode qu'elle avait avant l'arrêt. `controle --accepter` est refusé tant qu'une alerte du contrôle des rôles est ouverte (classez-la d'abord).
- **Analyse hors de la réception** : la réception répond au site sans attendre le moteur (file traitée par lots de 200). Si la file déborde (100 000 événements), les événements restent dans la base et la chaîne, mais ne sont pas analysés : alerte « moteur saturé ».

| Commande | Effet |
|---|---|
| `alertes` (`--toutes`) | alertes ouvertes, de la plus grave à la moins grave |
| `alerte <id>` | règle, entité, sources, réponse, et « D'où vient le signal » (les événements, leur heure à la source et l'écart jusqu'à leur réception par la Vigie, leur composant, leur émetteur, leur confiance) |
| `prendre <id>`, `classer <id> <incident\|faux_positif\|test> --note "…"` | prise en charge ; clôture |
| `entites` | entités les plus chaudes (score, sources) |
| `regles`, `regle <règle> <mode>`, `seuil <classe> <points>` | modes et seuils ; `regle <règle> arret --duree 4h --motif "…"` : une règle ne s'arrête que pour une durée (7 jours au plus), puis reprend son mode de départ |
| `confiance ajouter <ip> --duree 7j --motif "…"`, `confiance retirer <ip>` | adresses jamais bloquées automatiquement, pour une durée (7 jours au plus) |

## Règles et détecteurs (phase C2)

- **Règles au format Sigma** (`vigie/regles/*.yml`, décision D20) : 34 règles et 13 corrélations (`event_count`, `value_count`), chacune avec son cas (DS…), sa gravité (`level`), ses tactiques MITRE ATT&CK (`tags`) et un bloc `vigie` : entité visée, preuve à source unique (`source_unique: true`, alerte immédiate) ou points déposés sur l'entité (quorum), réponse automatique, mode par défaut. Format standard, lisible ; une règle mal écrite empêche la Vigie de démarrer (jamais une règle ignorée en silence, jamais une erreur à chaque événement : modificateurs et expressions vérifiés au chargement). Sous-ensemble pris en charge : sélections (carte = ET, liste = OU), modificateurs `contains`, `startswith`, `endswith`, `re`, `gte`, `gt`, `lte`, `lt`, `exists`, `all` ; conditions `and`, `or`, `not`, parenthèses, `1 of`, `all of` ; corrélations `event_count`, `value_count` (conditions `gte` ou `gt` : `lte` et `eq` sont refusés, ils se déclencheraient au premier événement), `temporal`. Une règle sur l'entité `site` ou `vigie` doit être `source_unique` (aucun score ne s'y dépose). `contexte: true` : les points de la règle comptent dans le score, jamais comme une source du quorum (un fait que la même action produit déjà chez une autre source). Deux réglages facultatifs du bloc `vigie` : `expire: AAAA-MM-JJ` (règle temporaire, inactive après ce jour, marquée « EXPIRÉE » par `regles`) et `delai_re_ms: 1 à 1000` (chaque expression régulière de la règle est arrêtée au bout de ce délai : l'événement ne correspond pas, alerte « règle lente » une fois par heure ; environ 0,25 ms de plus par essai, à réserver aux expressions difficiles à relire ou venues d'ailleurs). Corrélations : un résumé du site compte pour son `nombre`, les points vont aux sources des événements qui y ont contribué (une corrélation site + Zitadel peut faire le quorum), mémoire bornée (200 000 points au total, 10 000 groupes par corrélation, valeurs gardées en empreinte courte).
- **Ce qu'un compte fait une fois entré** (registre des briques, [`docs/etudes/vigie-besoins-des-briques.md`](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/vigie-besoins-des-briques.md), BV-1 et BV-2) : après chaque écriture d'un compte de l'admin, le site compare l'état d'avant et d'après. Il compare les réglages publics (version du site, mentions légales, contacts, accroche, ouverture, thème, EXIF), le nombre de photos à l'heure visible et le mode EXIF. Événements `config_public_changed` et `privacy_exposure_changed`, valeur seulement pour un réglage sans donnée personnelle. Règles (`80-admin.yml`) : contact ou directeur de la publication remplacé (DS9), EXIF complet publié (DS18), heure rendue visible sur 20 photos ou plus en 10 minutes (DS18), réglage changé dans l'heure qui suit une session reprise depuis un autre appareil (Haute, DS23 ; mode Bloquer, identité redemandée), écritures tentées en série sans confirmer l'identité demandée (Haute, DS2).
- **Galeries privées et Carnets** (registre des briques, BV-12 à BV-26 et « Tranché » ; `85-galeries-carnets.yml`, prêtes pour les PR #149 et #151) : un invité n'est jamais un compte, ses règles visent l'**accès** (entité `site`, clé `acces:<n°>`), son adresse ou sa session visiteur (`reference` `visiteur:…`) ; les règles de connexion de l'admin ne retiennent que `site · connexion`. Toutes en mode **Alerter** le premier mois (Tranché 5), sauf le billet piégé dans l'heure d'une session reprise : mode Bloquer, identité redemandée (décision du 19 octobre 2026, hors du Tranché 5).
  - Mot de passe d'un accès (BV-16) : 10 refus d'une adresse en 15 min (points sur l'adresse, DS16) ; refus venus de 3 adresses sur un accès en 1 h (Haute, DS31 : le lien a fui) ; accès suspendu après 30 refus (DS16 ; `authn_login_lock`, ou `authn_login_disabled` avec `type_attendu` tant que la PR envoie l'ancienne forme ; une pause n'alerte pas, Tranché 3) ; calculs de mot de passe saturés 5 minutes sur 10 (DS21).
  - Accès qui fuit (BV-18) : 4 réseaux en 7 jours (10 pour un lien de groupe, Tranché 4 et 6 ; DS18) ; 3 pays en 24 h (5 pour un lien de groupe ; Haute, DS3), seule règle à **réponse automatique** : décision `suspendre_acces` en mode Bloquer (à y passer après le premier mois).
  - Téléchargements (BV-19) : limite de 50 photos en 1 h ou de 3 archives par jour atteinte (DS15) ; nouvel appareil (au-delà du premier) puis limite atteinte dans l'heure (Haute, DS18). Accès retiré ou lien remplacé encore présenté (BV-22, DS1). 3 échecs CSRF d'une session d'invité en 1 h (BV-25, points sur la session, DS14).
  - Admin (BV-23) : 5 accès créés ou liens renouvelés en 1 h par un compte (DS18) ; accès débloqué dans les 24 h de sa suspension sans nouveau mot de passe (DS16) ; accès créé ou élargi dans l'heure d'une session reprise (Haute, DS23) ; échéance de plus de 90 jours (Basse, Tranché 2).
  - Écriture hors portée (BV-14 : billet, galerie, accès, voyage ; DS10). Billet dont le rendu a neutralisé une construction active (BV-12, DS11 ; du HTML inoffensif ou une image externe n'alertent pas), et la même chose dans l'heure d'une session reprise (Haute, DS23). 3 billets en ligne changés en 1 h par un compte (BV-21, Tranché 10, DS9 ; un geste compte une fois, quelles que soient les langues).
- **Détecteurs comportementaux** (`vigie/detecteurs.js`, inspirés de marlinOS) : première apparition (pays ou appareil jamais vus pour un compte en 90 jours, DS4), heure inhabituelle (heure UTC jamais vue en 28 jours, DS18), vitesse (lectures du jour au-delà de la moyenne + 3 écarts-types, vue dès la rafale, DS17), voyage impossible (plus de 500 km à plus de 900 km/h entre deux connexions, à l'heure de l'événement, DS3), pivot d'identifiants (3 échecs puis une connexion en 6 h, une fois par compte et par 6 h, DS25), rôle incohérent (export réservé à l'administrateur fait par un autre compte ; geste des galeries privées ou des Carnets que les rôles du compte ne donnent pas, ou accès sur une galerie commune ou celle d'un autre photographe par un compte de portée « les miennes », d'après les rôles du dernier instantané contrôlé, jamais d'un compte changé depuis : preuve, critique, DS10), exploration lente (un réseau dans les pièges sur 12 heures distinctes en 72 h, calculée une fois par heure, DS15), chaîne d'attaque (repérage, tentative puis accès sur une entité en 24 h, critique, DS23), site silencieux (plus de 3 min sans événement du site, DS24).
- **Listes de menaces** (D22) : Spamhaus DROP, abuse.ch Feodo Tracker, sorties Tor, téléchargées une fois par jour par la Vigie ; une adresse listée prend des points (3, 3, 1) une fois par jour et par liste, qui **ne comptent pas** comme une source du quorum. Aucune adresse de visiteur n'est envoyée à un tiers. Garde-fous : Feodo et Tor, adresses seules ; Spamhaus, réseaux de /10 (IPv4) ou /19 (IPv6) au plus large ; 20 000 entrées par liste ; une liste qui triple d'un jour à l'autre est refusée (l'ancienne reste) ; pas de redirection suivie. `VIGIE_MENACES=0` pour ne pas les télécharger (celles déjà en base ne marquent plus rien).
- **Contrôle des rôles sur les sauvegardes du site** (obligatoire) : une minute après le démarrage puis chaque heure, à chaque nouvelle sauvegarde, la Vigie ouvre l'instantané en lecture seule (`VIGIE_SITE_BACKUP_DIR`, le `BACKUP_DIR` du site monté en lecture seule). Seul un fichier ordinaire au nom d'instantané (`site-AAAA-MM-JJTHHMMSS.db`), daté au plus tard maintenant, est lu (ni lien, ni tube, ni nom fabriqué). **Critique** : administrateur actif que le site n'a pas déclaré, nouvel administrateur depuis l'instantané précédent sans changement journalisé par le site (le site peut mentir dans ses déclarations, pas dans une sauvegarde faite par un autre conteneur), déclencheur du journal des comptes absent ou au texte changé sans migration, instantané illisible. **Haut** : aucun instantané, sauvegarde de plus de 48 h, aucune déclaration du site, déclencheur changé par une migration (à vérifier). Les administrateurs dont l'adresse n'est jamais bloquée automatiquement sont ceux du dernier contrôle réussi, jamais la seule déclaration du site. Le contrôle garde aussi les rôles, réglages du circuit et photographe lié de chaque compte actif (référence du détecteur « rôle incohérent ») et, dès que la table des galeries privées existe, les accès ouverts : un accès apparu depuis l'instantané précédent sans `privacy_exposure_changed` « cree » du site est **critique** (écrit hors de l'application, BV-23).
- **Événements de Zitadel** : le compte retenu est celui qui est visé (l'utilisateur de l'agrégat, ou de la session), l'auteur de l'action est gardé dans le détail (`auteur`).
- **Résumés côté site** (D23) : pour les pièges, pages introuvables, jetons faux, valeurs impossibles, blocages et limites venant du public, le premier événement d'une adresse part tout de suite, les suivants de la même fenêtre de 5 minutes partent en un seul événement (`agrege`, `nombre`).

| Commande | Effet |
|---|---|
| `menaces` | date et taille des listes de menaces |
| `controle` | contrôle des rôles sur la dernière sauvegarde du site, tout de suite (alertes ouvertes comme dans le service) |
| `controle --accepter --motif "…"` | après vérification d'un écart expliqué ailleurs (administrateur ajouté directement dans la base, par exemple) : l'instantané actuel devient la référence |

## Bordure Cloudflare (phase C3, facultative)

Un **Worker** Cloudflare (`bordure/worker.js`, offre gratuite) devant l'admin, la connexion et les pages :

- **bloque avant le site** les adresses bloquées par la Vigie : liste signée (Ed25519), copiée par la Vigie dans Workers KV, ne contenant **que** des adresses (ni compte ni session ne part chez Cloudflare), 1 000 au plus (décisions manuelles d'abord ; le site applique toute la liste). Mêmes garde-fous que le site (jamais tout le monde) ; chemin décodé comme le routeur du site (`/%61dmin` est `/admin`). Liste de plus de 24 h ou plus ancienne que celle en place : refusée ; entrée illisible : écartée seule ; refus signalé à la Vigie (alerte « bordure muette »). KV en panne : la liste précédente reste ; sans liste, la requête passe et le site applique les siennes ;
- **transmet au site**, en en-têtes `x-bordure-*` signés (HMAC, `VIGIE_BORDURE_KEY`), l'opérateur réseau (ASN) et deux empreintes TLS ; le site ne les croit que signés, frais (60 s) et pour cette adresse et cette requête ; des en-têtes faux sont signalés (`edge_signature_invalid`, cas DS32) ;
- **écrit un point par requête** dans Analytics Engine (adresse, classe de route, statut, opérateur, empreinte TLS, premier segment du chemin seulement), lu chaque minute par la Vigie : rafales de pages (DS15), page de l'admin servie depuis un opérateur jamais vu (DS4), blocages appliqués, rafales d'erreurs 4xx (DS16). La bordure est une **source du quorum** à part entière par ce que le site ne voit pas : avec le site ou Zitadel sur la même adresse, une alerte s'ouvre. Les erreurs 4xx vues en bordure sont les mêmes que celles que signale le site : elles ajoutent des points **en contexte**, sans compter comme une seconde source (arbitrage NC3-1). Réponse d'une galerie privée (`/g/…`, `/prive/…`) ou marquée privée par le site (`cache-control` `private` ou `no-store`) servie par le cache de Cloudflare (`cf-cache-status` ni `DYNAMIC` ni `BYPASS`) : point `cache_prive` (nature `lien`, `page`, `image` ou `fichier` et statut du cache, jamais le chemin), événement `bordure_cache_prive`, alerte **Haute** (BV-26, DS18 : contrôler « Bypass cache » et Always Online, procédure de violation). Bordure muette : alerte (DS24) si le battement du Worker (toutes les 5 minutes) manque depuis 20 minutes, si aucune requête n'est vue en bordure depuis 6 h, ou si la lecture échoue.

**Empreintes TLS : observées d'abord.** Cloudflare donne l'empreinte de la connexion chiffrée sur toutes les offres, mais certains navigateurs la font varier d'une connexion à l'autre (valeurs GREASE, extensions mélangées). Un changement d'empreinte pendant une session est donc noté en « info » (`session_context_change`, `tls_change`), sans alerte, le temps de mesurer sa stabilité sur l'instance de test (requête sur la base de la Vigie : part des sessions ordinaires dont l'empreinte change).

**Offre gratuite** : 100 000 requêtes de Worker par jour (routes en « laisser passer » au-delà), 10 ms de calcul par requête ; KV : 100 000 lectures et 1 000 écritures par jour (la Vigie écrit au plus toutes les 2 minutes) ; Analytics Engine : 100 000 points écrits et 10 000 lectures par jour (la Vigie lit une fois par minute), données gardées 3 mois.

### Liste des adresses bloquées chez Cloudflare (phase E3, facultative)

Avec `VIGIE_CF_LISTE=vigie_bloquees`, la Vigie recopie dans une liste d'adresses du compte Cloudflare ses blocages **de tout le site, de 24 h et plus** (adresse IPv4 seule ou réseau /8 à /32 ; IPv6 ramenée à son /64 au plus fin) ; une règle du pare-feu de Cloudflare (`ip.src in $vigie_bloquees` → Block) les arrête avant le Worker, dont le quota gratuit est ainsi épargné, et le blocage tient si le Worker est coupé. Les blocages plus courts ou d'une partie du site restent au Worker et au site. Rapprochement toutes les 5 minutes et 30 s après chaque décision : ce que la Vigie ne connaît plus est retiré, mais seulement ses entrées (commentaire « Vigie #… ») ; une entrée ajoutée à la main n'est jamais touchée. Échec (droit manquant, liste pleine) : visible sur la page Santé, signalé une fois par heure (`vigie_bordure_erreur`, opération « liste »). Mise en place : [`vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md), étape 3.4.

### Mode urgence de Cloudflare (« I'm Under Attack », facultatif)

Avec `VIGIE_CF_ZONE_ID` et un jeton à part (*Zone Settings : Edit* sur la seule zone), la console (Règles et réglages ; Analyste ou Administrateur, identité redemandée, motif) et la ligne de commande (`urgence marche --duree 2h --motif "…"`, `urgence arret`, `urgence`) passent la zone en mode urgence : chaque visiteur est vérifié par Cloudflare avant le site. Toujours pour une durée (24 h au plus par défaut, `VIGIE_CF_URGENCE_MAX`, 7 jours au plus) ; à l'échéance, la Vigie remet le niveau de sécurité d'avant ; un niveau changé à la main chez Cloudflare n'est jamais écrasé (la Vigie note seulement la fin du mode). Activation et prolongation : alerte haute « Mode urgence de Cloudflare activé » (les Administrateurs sont prévenus). Mise en place : `vigie-phase-0.md`, étape 3.6.

### Installer (instance de test d'abord, D19)

Marche à suivre pas à pas, dans un ordre qui ne coupe jamais le site : [`vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md), **étape 3.7** (espace KV, clé partagée, jetons, `vigie.env`, déploiement par le service `bordure` du compose, routes, vérification, retour en arrière). Le Worker tourne **chez Cloudflare**, devant le tunnel (c'est ce qui lui fait bloquer avant le site et voir l'opérateur et l'empreinte TLS) ; le service `bordure` (profil du même nom, jamais démarré par `up`) ne fait que l'envoyer : `docker compose --profile bordure run --rm bordure [--essai | --desactiver | --reactiver]`, avec un jeton à part (« Edit Cloudflare Workers ») dans `NICEPHOS_DIR/bordure-secrets/cloudflare-deploiement`. En bref :

- **Espace KV `vigie-blocages`** (Vigie → Worker) : son **identifiant** dans `VIGIE_CF_KV_NAMESPACE` et dans `wrangler.toml` ;
- **jeu de données Analytics Engine `vigie_bordure`** (Worker → Vigie) : un **nom**, le même des deux côtés, créé par Cloudflare au premier point ; `VIGIE_CF_DATASET` n'est à mettre que pour un autre nom ;
- **`VIGIE_BORDURE_KEY`** du site = secret `BORDURE_KEY` du Worker ; **`VIGIE_DECISIONS_PUBKEY`** du site = `DECISIONS_PUBKEY` du Worker ;
- **jeton** de la Vigie dans `VIGIE_SECRETS_DIR/cloudflare-token` : *Account Analytics : Read* et *Workers KV Storage : Edit* (plus *Account Filter Lists : Edit* pour la liste de la phase E3).

**Vérifier** : `docker exec nicephos-vigie node vigie/cli.js regles | grep bordure` ; après quelques minutes de trafic, des événements `bordure_*` dans `alertes --toutes` ou la base ; une adresse bloquée par `bloquer` reçoit la page « Accès refusé » de Cloudflare, sans que la requête n'atteigne le site (journal du site muet).

**Délais** : une décision (ou une levée) atteint la bordure en 4 à 5 minutes au plus (copie dans KV au plus toutes les 2 minutes, propagation de KV, cache du Worker d'une minute). Le site, lui, l'applique tout de suite.

**Dernier recours** (adresse d'un administrateur bloquée par erreur, Worker qui dérange) : `docker compose --profile bordure run --rm bordure --desactiver` (tout passe, rien n'est compté), ou supprimer la route du Worker dans le tableau de bord. `VIGIE_APPLIQUER=0` ne concerne que le site.

**En-têtes refusés par le site** (`edge_signature_invalid`) : motif « adresse différente » → l'adresse que voit le site n'est pas celle que voit Cloudflare (vérifier `TRUST_PROXY`, l'adresse de cloudflared) ; « signature fausse » → clé différente entre le Worker et le site, ou chemin transformé en route ; « en-têtes périmés » → horloge du serveur décalée. La règle (DS32) reste en mode « observer » tant que l'instance de test n'a pas validé.

**Quotas** : 100 000 requêtes par jour, y compris celles d'une adresse bloquée ; au-delà, la route laisse passer (le site garde ses protections) et la bordure se tait : alerte quand le battement manque (20 minutes, si Cloudflare arrête aussi les tâches planifiées, ce qu'il ne documente pas) ou qu'aucune requête n'est vue (6 h). La seule règle gratuite de limite de débit reste sur les images (annexe Cloudflare) ; la liste `vigie_bloquees` (règle R1, recopiée par l'API en phase E) bloquera les adresses connues avant le Worker, sans consommer son quota. Le jeton « Workers KV Storage Edit » vaut pour tous les espaces KV du compte (Cloudflare ne permet pas mieux) : le garder dans `VIGIE_SECRETS_DIR` seulement.

**Retirer** : supprimer la route (ou le Worker), retirer `VIGIE_BORDURE_KEY` du site et `VIGIE_CF_*` de la Vigie. Le site retire les empreintes de bordure de ses sessions avec le reste du contexte quand la Vigie est retirée.

## Réseau (phase E4, facultatif)

Une **source « réseau »** du quorum, constatée **hors du site** (registre des briques, BV-10 et BV-11 ; décisions D24 et D25) :
un site compromis ne peut ni la provoquer ni la taire. Mise en place, vérification et retour en arrière :
[`deploy/unraid/reseau/README.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/reseau/README.md).

- **Mandataire de sortie** (service `sortie`, profil « sortie ») : le site ne joint Internet que par lui (`HTTPS_PROXY`,
  `NODE_USE_ENV_PROXY=1` pour `fetch`, option `proxy` de nodemailer). Il n'accepte que les noms dont le site a besoin, tirés
  de son `.env` (Zitadel, horodatage, SMTP, Instagram, Hugging Face au premier téléchargement des modèles) et `SORTIE_NOMS` ;
  il refuse une adresse IP écrite telle quelle, un nom qui mène au réseau local et le HTTP en clair. Une ligne JSON par
  demande, sans chemin ni contenu.
- **Règles de l'hôte** (`regles.sh`, chaîne `DOCKER-USER`, lancées au démarrage par « User Scripts ») : toute autre sortie
  du site, et tout flux entre conteneurs hors de la matrice (tunnel → site et console ; site → réception, traducteur,
  mandataire), est rejeté et journalisé (`NICEPHOS-SORTIE`, `NICEPHOS-FLUX`, 20 lignes par minute au plus), rangé par
  rsyslog dans un fichier à part ; un battement horaire dit si les règles sont en place.
- **La Vigie** lit les deux journaux (montés en lecture seule sur `/reseau`, `VIGIE_RESEAU_MANDATAIRE` et
  `VIGIE_RESEAU_HOTE` dans `vigie.env`) chaque minute, en suivant (position gardée avec les événements, rotation et
  troncature reconnues, 1 Mo par passage, lignes de même nature regroupées en un événement qui les compte).

| Événement | Quand | Règle (`vigie/regles/75-reseau.yml`) |
|---|---|---|
| `reseau_sortie_refusee` | nom hors liste demandé au mandataire | **Moyenne**, source unique (MV11) ; **Haute** au-delà de 3 noms différents en 1 h |
| `reseau_sortie_directe` | conteneur de la pile vers Internet sans le mandataire, rejeté par l'hôte | **Haute**, source unique, mode Alerter (MV11) |
| `reseau_flux_hors_liste` | paquet entre conteneurs hors de la matrice | depuis le site : **Haute**, source unique, mode Alerter (MV16) ; d'un autre conteneur : **Haute** à partir de 3 en 1 h |
| `vigie_reseau_silence` | journal illisible ; aucune ligne depuis 24 h alors que le site tourne ; règles de l'hôte absentes ou incomplètes | **Moyenne** (DS24) |
| chaîne DS23 | saisie malveillante (moyenne ou plus) ou fichier piégé, et sortie refusée ou directe, dans la même heure | **Critique**, mode Alerter |

Ces événements ne portent ni adresse de visiteur ni compte (seulement des conteneurs et des destinations) : ils ne
déposent pas de points, leurs règles ouvrent l'alerte elles-mêmes ; la chaîne DS23 réunit les sources « site » et
« réseau ». Console : carte **Réseau** de la page Santé (journaux, battements, constats sur 24 h). Ligne de commande :
`reseau` (et `reseau --lire` pour un passage tout de suite).

**Limites** : une fuite par requêtes DNS reste possible (le résolveur de Docker est hors de `DOCKER-USER`) ; le découpage
du réseau `nicephos` en réseaux par flux est l'étape suivante (proposé dans le guide).

## Notifications (phase D)

- **Quand** : à l'ouverture d'une alerte **haute ou critique**, et quand une alerte s'aggrave jusque-là ; seulement pour une règle en mode `alerter` ou `bloquer` (jamais `observer`, le mois d'observation) et interrupteur `alertes` en marche.
- **Quoi** : un message court, **sans adresse, sans compte, sans donnée personnelle** :

  ```
  [Critique] Rôle donné, retiré ou compte changé hors de l'application
  Source : site
  Réponse : compte gelé 1 j, sessions du compte fermées
  14 h 02 · https://vigie.nicephos.art/alertes/412
  ```

  La ligne « Réponse » dit ce que la Vigie a déjà fait (sans cible), ou « Aucune réponse automatique ». L'e-mail rappelle : « Ouvrez la Vigie depuis votre favori ; elle ne demande jamais votre mot de passe par message. »

- **Par où** : Signal d'abord (service `signal` de la pile, profil `signal` ; numéro et groupe « Vigie Nicephos » : [`deploy/unraid/signal/`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/signal/README.md)) ; l'**e-mail** si Signal n'est pas réglé ou échoue. Un canal en échec ouvre une alerte (« canal en échec », une fois par heure). 20 messages par heure au plus et par canal, puis un message de synthèse à la fin de l'heure.
- **Réglages** (`vigie.env`) : `VIGIE_SIGNAL_NUMERO`, `VIGIE_SIGNAL_GROUPE` (étape 8 du guide Signal), `VIGIE_SIGNAL_URL` (`http://nicephos-signal:8080` par défaut) ; `VIGIE_SMTP_URL`, `VIGIE_MAIL_FROM`, `VIGIE_MAIL_TO` (adresses séparées par des virgules) ; `VIGIE_CONSOLE_URL` (`https://vigie.nicephos.art`). La Vigie et la passerelle partagent le réseau interne `nicephos-vigie-signal`, créé par la pile (vide sans le profil `signal`).
- **Essai** : `docker exec nicephos-vigie node vigie/cli.js notifier essai signal` (ou `email`).
- **Contre l'imitation** : les messages invitent à ouvrir un lien vers la console ; une fausse page pourrait le copier. Défenses : second facteur par **clé d'accès** (passkey, WebAuthn) exigé pour l'application « Vigie » dans Zitadel (fait le 18 oct. 2026), la phrase « ouvrez la Vigie depuis votre favori » dans chaque e-mail, et, pour l'e-mail de secours, un domaine d'envoi protégé par **SPF, DKIM et DMARC** (réglage du fournisseur de messagerie).
- **Résumé pour l'admin du site** : le site lit chaque minute `GET /v1/resume` (requête signée, réponse signée par la clé des décisions, usage « resume ») : nombre d'alertes ouvertes par gravité, gravité, date et numéro de la première (pour le lien vers la console) ; **ni titre, ni adresse, ni compte** (un attaquant devenu administrateur du site n'apprend pas ce qui l'a vu). Les alertes en observation n'y figurent pas. **Affichage dans l'admin** (phase D3d, maquette MV-10 ; `server/vigie-admin.js`), pour les seuls comptes qui ont la permission `securite.voir` (le rôle Administrateur l'a, les autres non) et seulement si la Vigie est réglée côté site : l'entrée **Sécurité** de la barre latérale (groupe Réglages, après Journal ; aussi dans le menu du téléphone) ouvre la console (`VIGIE_CONSOLE_URL`, réglée côté site, jamais reprise du résumé) dans un nouvel onglet (`rel="noopener noreferrer"`), avec un badge : ▲ et le nombre des alertes hautes et critiques, le nombre seul pour les moyennes et basses ; une ligne de « Aujourd'hui » (« Sécurité : 2 alertes critiques, 1 haute et 1 moyenne dans la Vigie », urgente pour haute et critique, bientôt pour moyenne) dont le bouton ouvre `/alertes/<numéro>` ; un **bandeau** rouge en tête de toutes les pages tant que `critique_a_prendre` est vrai (une critique ouverte, sans intervenant). **Résumé indisponible** (plus de 5 minutes, ou jamais reçu depuis le démarrage du site) : jamais un faux « aucune alerte » ; ▲ seul sur l'entrée, la ligne et le bandeau disent le dernier état connu et depuis quand l'admin ne sait plus (« Au dernier résumé, 14 h 10 : … », « Résumé de la Vigie indisponible depuis 14 h 11 », l'heure de la première lecture manquée). Le module des décisions garde pour cela le dernier résumé reçu (`lastSummary`, avec `recu_a`) et l'heure de la première lecture manquée (`summaryFailedAt`) ; le getter `summary` ne change pas. La permission ne sert qu'à montrer : aucune donnée de la Vigie n'est dans le site, et la console garde ses propres verrous.

| Commande | Effet |
|---|---|
| `notifier essai <signal\|email>` | message d'essai sur le canal |
| `bordure` | état de la bordure : copie des blocages, battement du Worker, constats, en-têtes refusés par le site (et leur motif), part des sessions dont l'empreinte TLS change (grille de lecture de l'essai) |
| `reseau`, `reseau --lire` | source « réseau » (phase E4) : journaux lus, positions, battements du mandataire et des règles de l'hôte, constats sur 24 h, noms refusés et acceptés ; `--lire` : un passage de lecture tout de suite |

## Console (phase D3)

Adresse : `https://vigie.nicephos.art`, servie par la Vigie elle-même sur le port 4200, à son adresse fixe du réseau du tunnel (`VIGIE_CONSOLE_IP`, `172.29.42.20` par défaut). Facultative : sans `VIGIE_CONSOLE_CLIENT_ID`, rien n'écoute sur ce port. Écrans : maquettes MV-01 à MV-11 (`docs/maquettes-vigie/`). Le socle (D3a) apporte les verrous, les sessions, les droits et la vue d'ensemble ; les écrans de lecture (D3b) et les actions (D3c) sont faits ; l'intégration dans l'admin du site (D3d) suit.

- **Écrans de lecture** (D3b) : alertes (liste filtrée, fiche : règle, cas, tactiques MITRE, réponse faite, événements, score par source, historique), journal des événements (filtres sur un index, pages par numéro, fiche d'un événement avec ses deux heures, son origine et son maillon de chaîne), **export CSV** pour les Analystes (10 000 lignes au plus, cellules neutralisées contre les formules, chaque export noté au journal : `vigie_console_export`), entités (les plus chaudes, fiche : score, liens, alertes, décisions, derniers événements), santé (battement du site, analyse, Zitadel, contrôle des rôles, chaîne, canaux, bordure, listes de menaces, disque, version), **flux et provenance des alertes** (diagrammes de MV-11 sur 7 ou 30 jours, rendus par le serveur ; barre de provenance sur la vue d'ensemble). Un **bandeau** rappelle en tête de chaque page les alertes critiques sans intervenant.
- **Actions** (D3c), chacune en formulaire, vérifiée par le droit de l'action et le rôle relu chez Zitadel à l'instant, puis faite par les mêmes fonctions que la ligne de commande (mêmes garde-fous, mêmes événements, composant « vigie · console ») ; un message dit ce qui a été fait ou pourquoi c'est refusé, près du champ en cause ; la réponse est une redirection (recharger ne refait jamais le geste) :
  - **Intervenant** : prendre en charge, classer, noter une alerte ; décisions (bloquer une adresse ou un réseau, redemander l'identité d'un compte, fermer les sessions d'un compte ou une session, geler un compte, verrouiller l'admin, suspendre un accès de galerie privée) et levée, avec **ré-authentification** de moins de 5 minutes. Motif obligatoire (l'alerte en tient lieu depuis sa fiche), portée choisie, jamais « tout » par défaut ; bloquer sa propre adresse ou une adresse d'où un administrateur s'est connecté depuis 30 jours demande une confirmation ; le verrouillage admet d'office le compte et l'adresse (avec son /64 en IPv6) de qui le décide ; geler ou fermer les sessions de son propre compte ou d'un administrateur demande une confirmation, pas redemander l'identité (décision douce : personne n'est tenu dehors) ; la fiche d'une alerte ou d'un compte propose d'abord « Redemander l'identité » ;
  - **Analyste** : interrupteurs généraux, mode des règles, seuils (ré-authentification ; réduire la surveillance demande un motif et prévient les Administrateurs), vérifier la chaîne, essayer un canal, recopier les blocages à la bordure ;
  - **Administrateur** : droits de la console (attribution, jamais la sienne ni celle de l'amorce), adresses de confiance (7 jours au plus, motif), accepter la sauvegarde du site comme référence des administrateurs (jamais pendant qu'une alerte du contrôle des rôles est ouverte).
- **Lecteur** : adresses tronquées partout (/24, /48), y compris dans les adresses des pages : une fiche d'adresse le renvoie à celle de son réseau ; ni extrait de saisie, ni export.

- **Trois verrous**, à chaque requête, fichiers statiques compris :
  1. **Cloudflare Access** : la Vigie vérifie le jeton `Cf-Access-Jwt-Assertion` (signature RS256 par les clés de l'équipe, émetteur, audience `VIGIE_ACCESS_AUD`, dates). Sans lui, 403 sobre. Un conteneur du réseau du tunnel qui joindrait la console directement n'obtient rien.
  2. **Connexion Zitadel propre à la console** : application « Console Vigie » du projet « Vigie », code avec secret client, PKCE, state et nonce. Le **second facteur** est exigé (`amr` contient `mfa` ; Zitadel l'y met pour une clé d'accès). Sessions de 1 h au plus, fermées après 15 min sans activité. Le cookie `__Host-vigie` (HttpOnly, Secure, SameSite=Lax) ne vaut qu'avec l'identité Access de son ouverture, et la base n'en garde que l'empreinte. Le rafraîchissement automatique de la vue d'ensemble ne prolonge pas la session.
  3. **Droits à deux clés** (annexe architecture § 5.4) : le **plafond**, rôle `vigie.viewer`, `vigie.handler`, `vigie.analyst` ou `vigie.admin` donné dans Zitadel (organisation `VIGIE_CONSOLE_ORG_ID`), et l'**attribution** réglée dans la Vigie (Lecteur sans attribution). Le droit effectif est le plus faible des deux. L'amorce `VIGIE_ADMIN_SUBS` est toujours Administratrice côté Vigie, jamais au-dessus de son plafond. Le plafond est relu par l'API de gestion de Zitadel (compte de service de la lecture des événements) toutes les 5 minutes et avant toute action ; si Zitadel est injoignable, la lecture continue 15 minutes sur le dernier plafond lu, et aucune action n'est faite. Pour couper l'accès à quelqu'un, y compris à un compte de l'amorce : retirer son rôle `vigie.*` dans Zitadel.
- **Ré-authentification** (`max_age=300`, `prompt=login`) de moins de 5 minutes, par le même compte, avant une action forcée ou un changement d'interrupteur.
- **Formulaires** : jeton CSRF de la session, et requête de même origine (`Origin`, `Sec-Fetch-Site`).
- **En-têtes** : CSP stricte (`default-src 'none'`, scripts et styles de la console seulement, rien en ligne, `frame-ancestors 'none'`), `no-store`, `no-referrer`, `noindex`.
- **Journal et alertes** : connexions (`vigie_console_connexion`), sorties, **connexions refusées** (`vigie_console_refus`, DS30 : jeton Access absent ou faux, sans rôle `vigie.*`, sans second facteur, cookie rejoué sous une autre identité Access, CSRF, ré-authentification par un autre compte ; alerte moyenne, haute au-delà de 3 en une heure), **arrivée d'un compte sans attribution** (`vigie_console_arrivee`, DS29, moyenne) et **changement de droits** (`vigie_console_droits`, DS29, haute : plafond changé chez Zitadel ou attribution changée). Jeton Access absent : une ligne par adresse et par 10 minutes, 30 par heure au plus.
- **Réglages** (`vigie.env`, guide [`vigie-phase-0.md`](https://github.com/Volfieldd/deux-regards/blob/main/deploy/unraid/vigie-phase-0.md), étapes 3.1 et 3.2) : `VIGIE_CONSOLE_CLIENT_ID`, `VIGIE_CONSOLE_PROJECT_ID`, `VIGIE_CONSOLE_ORG_ID`, `VIGIE_ACCESS_TEAM`, `VIGIE_ACCESS_AUD`, `VIGIE_ADMIN_SUBS`, `VIGIE_ROLES` (`deux-cles` par défaut, ou `zitadel` : une seule clé) ; secret client dans `VIGIE_SECRETS_DIR/console-secret`. La console exige aussi `VIGIE_ZITADEL_ISSUER` et le compte de service. Dans Zitadel, application « Console Vigie », onglet *Token Settings* : *User roles inside ID Token* et *Include user's profile info in the ID Token* cochés ; application « Cloudflare Access » : *Include user's profile info in the ID Token* coché. Dans Cloudflare : nom public `vigie.nicephos.art` du tunnel vers `http://172.29.42.20:4200`, un seul connecteur. En cas de souci : [Dépannage](#dépannage).

## Dépannage

Symptômes rencontrés à la première mise en service (octobre 2026), dans l'ordre où ils apparaissent. Les commandes se lancent dans le terminal de l'Unraid.

### La Vigie refuse de démarrer

Le journal du conteneur (`docker logs nicephos-vigie`) donne la variable en cause ; la Vigie préfère ne pas démarrer plutôt que tourner avec un réglage douteux.

- **« La console exige VIGIE_ZITADEL_ISSUER et le compte de service »** : `VIGIE_CONSOLE_CLIENT_ID` est réglé (la console est demandée) mais `VIGIE_ZITADEL_ISSUER` est vide ou encore commenté dans `vigie.env`. Le décommenter (`https://<instance>.zitadel.cloud`) et poser la clé JSON du compte `vigie-lecture` dans `VIGIE_SECRETS_DIR/zitadel.json` (`chmod 600`, propriétaire `99:100`). Pour démarrer sans console : commenter `VIGIE_CONSOLE_CLIENT_ID`.
- **Une variable de la console « attendue » ou « illisible »** alors qu'elle semble remplie : dans `vigie.env`, rien après la valeur (pas d'explication ni de commentaire en fin de ligne) ; le secret client est dans `VIGIE_SECRETS_DIR/console-secret`, celui de « Console Vigie ».

### « Zitadel : lecture impossible » dans le journal

Le message donne l'appel en cause et le motif de Zitadel :

- `(/oauth/v2/token) : …` : le jeton est refusé. Clé JSON créée ailleurs que sur le compte de service (**Users → Service Users → vigie-lecture → Keys → JSON** : le fichier contient `"type":"serviceaccount"` et un `userId`), clé expirée, ou horloge de l'Unraid décalée ;
- `(/admin/v1/events/_search) : 403` / `PermissionDenied` : le rôle `IAM_OWNER_VIEWER` n'est pas posé au niveau de l'**instance** (phase 0, étape 1.3.3) ;
- `no more than 30 item(s)` : image d'avant le 18 octobre 2026 (Zitadel refuse plus de 30 types par requête ; la Vigie lit désormais par lots) → **Compose Pull** puis **Compose Up** ;
- seulement `réponse 400` sans motif : image plus ancienne encore, même remède.

Une lecture réussie se voit dans `docker exec nicephos-vigie node vigie/cli.js etat` (« Zitadel : lu le … »). La console a besoin de ce même compte pour relire les rôles : tant que la lecture échoue, elle refuse toute action.

### Cloudflare : « User email was not returned »

Au test de la méthode de connexion Zitadel (Zero Trust → *Settings → Authentication → Login methods → Zitadel → Test*), une réponse avec seulement `id` et `amr` (`"oidc_fields": {}`) : Zitadel ne met pas l'e-mail dans l'ID token, or Cloudflare ne lit que lui. `amr` y est toujours, c'est normal.

- Dans Zitadel, l'application dont le **Client ID** est l'*App ID* saisi dans Cloudflare (« Cloudflare Access », pas « Console Vigie ») → *Token Settings* → **Include user's profile info in the ID Token** (ancien nom : *User Info inside ID Token*) → **Save**.
- Côté Cloudflare, scopes par défaut (`openid email profile`), champ *OIDC Claims* vide.
- Le compte Zitadel a une adresse e-mail, et c'est elle qui figure dans la politique Access.

### « Host Error » ou « Bad gateway » (502) sur `vigie.nicephos.art`

Cloudflare n'atteint pas la console. Dans l'ordre :

1. **Adresse du tunnel** : le nom public doit pointer vers **HTTP** `172.29.42.20:4200`, pas vers l'adresse de l'Unraid (le port 4200 n'est pas publié sur l'hôte). Les journaux du tunnel montrent la configuration reçue :
   ```bash
   docker logs nicephos-tunnel --tail 50 2>&1 | grep -i -E "error|vigie|4200"
   ```
2. **La console répond-elle, depuis le réseau du tunnel ?** Un `403` est la bonne réponse (pas de jeton Access) :
   ```bash
   docker run --rm --network container:nicephos-tunnel --entrypoint node ghcr.io/volfieldd/deux-regards-vigie:latest \
     -e "fetch('http://172.29.42.20:4200/').then(r=>console.log('depuis le tunnel:',r.status)).catch(e=>console.log('échec:',e.cause?.code||e.message))"
   ```
3. **Un second connecteur sur le même tunnel** : si la console répond `403` ci-dessus mais que le 502 revient une fois sur deux (souvent au retour de Zitadel, après une redirection qui a marché), un autre `cloudflared` fait tourner le même tunnel et reçoit une partie des requêtes sans pouvoir joindre le réseau de la console. Le voir :
   ```bash
   docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}' | grep -i -E "cloudflare|tunnel"
   ```
   et dans Zero Trust, onglet **Connectors** du tunnel. Avant d'arrêter l'autre (et de couper son démarrage automatique), vérifier que `nicephos-tunnel` joint aussi les autres services servis par ce tunnel, en remplaçant les adresses :
   ```bash
   docker run --rm --network container:nicephos-tunnel --entrypoint node ghcr.io/volfieldd/deux-regards-vigie:latest -e "
   for (const u of ['http://<adresse-unraid>:<port>/','http://172.29.42.20:4200/'])
     fetch(u,{redirect:'manual'}).then(r=>console.log(u,r.status)).catch(e=>console.log(u,'échec:',e.cause?.code||e.message))"
   ```
   Si l'un échoue, garder les deux conteneurs mais donner à la pile son propre tunnel (`TUNNEL_TOKEN` du `.env`), pour `www`, `nicephos.art` et `vigie` seulement. Ne pas brancher un `cloudflared` extérieur sur le réseau `nicephos`.

La console elle-même ne répond jamais 502 (Cloudflare remplacerait sa page par la sienne). Quand l'échange du code avec Zitadel échoue au retour de connexion, elle répond 503, page « Connexion impossible pour l’instant », note « Vigie : console : retour de Zitadel refusé » dans son journal et un refus de raison `jeton`, motif à côté (`node vigie/cli.js console`, ci-dessous) : souvent le secret client (`console-secret` d'une autre application, ou régénéré depuis) ou une application « Console Vigie » qui n'est pas en méthode **CODE**.

### « Connexion refusée » ou « Clé d’accès exigée » dans la console

Cloudflare Access et la connexion Zitadel sont passés ; la console refuse l'entrée. La raison exacte est notée à chaque refus :

```bash
docker exec nicephos-vigie node vigie/cli.js console
```

(« Connexions refusées », colonne raison) :

- **`role`** : aucun rôle `vigie.*` dans l'ID token. Vérifier, dans Zitadel :
  1. **Projet Vigie → Authorizations** : le compte a `vigie.admin` (clé exacte, pas le nom affiché) ;
  2. application **« Console Vigie »** → *Token Settings* : **User roles inside ID Token** et **Include user's profile info in the ID Token** cochés, **Save** ; réglage du projet *Assert Roles on Authentication* (*Assign user roles during authentication*) coché ;
  3. `VIGIE_CONSOLE_ORG_ID` : identifiant numérique de l'organisation **propriétaire du projet** ; un rôle donné dans une autre organisation est ignoré.
- **`zitadel`** (avec une erreur) : Zitadel a refusé lui-même, en général un compte sans autorisation dans le projet quand *Check authorization on Authentication* est coché.
- **`mfa`** (« Clé d’accès exigée ») : pas de second facteur dans `amr`, contenu de `amr` à côté (phase 0, étape 1.1).

Après une correction dans Zitadel : **Se reconnecter**. `VIGIE_ADMIN_SUBS` ne suffit pas seule : elle règle l'attribution côté Vigie, le plafond vient toujours de Zitadel.

## Horodatages et capacité

- **Deux heures par événement** : `survenu_a`, l'heure de la source (site, Zitadel), et `recu_a`, l'heure de réception par la Vigie. Les détecteurs (heure inhabituelle, voyage impossible) prennent l'heure de la source, bornée à 30 jours en arrière et 5 minutes en avant ; hors bornes, l'heure reçue est gardée telle quelle dans le détail (`horodatage_site_brut`). Les horloges du site et de la Vigie ne peuvent pas diverger de plus de 60 s : un lot signé plus décalé est refusé.
- **Capacité** : abaques, facteurs limitants et leviers dans [`docs/etudes/vigie-capacite.md`](https://github.com/Volfieldd/deux-regards/blob/main/docs/etudes/vigie-capacite.md). Pour mesurer sur la machine, dans un conteneur à part, sans secret ni réseau (base jetable, effacée à la fin, jamais la vraie) :

  ```bash
  mkdir -p "$NICEPHOS/vigie-banc" && chown 99:100 "$NICEPHOS/vigie-banc"     # $NICEPHOS : guide Unraid, étape 2
  docker run --rm --network none --user 99:100 -v "$NICEPHOS/vigie-banc":/banc \
    ghcr.io/volfieldd/deux-regards-vigie:latest node vigie/banc.js --dossier /banc --historique 1000000 --evenements 5000
  ```

## Jeu d'attaques (phase E2)

Un jeu de scénarios rejouable (`scripts/attaques/`) vérifie de bout en bout ce que la Vigie fait d'attaques réelles : pour chaque scénario, un **site et une Vigie neufs**, reliés, dans des dossiers temporaires, sur des ports libres de `127.0.0.1` (base de démonstration de `npm run seed`, listes de menaces coupées, aucun accès au réseau extérieur : jamais contre l'instance de test ni la démo). Les scénarios envoient de **vraies requêtes HTTP** au site ; chaque visiteur a son adresse et son pays, par `X-Forwarded-For` et `cf-ipcountry`, que le site croit parce que la requête vient du proxy de confiance (`TRUST_PROXY=127.0.0.1`, comme cloudflared). Le banc vide ensuite la file du site, attend que le moteur ait tout lu (`engine.drain`) et fait lire les décisions au site.

**Lancer** :

```bash
npm run attaques                                   # tout le jeu (≈ 1 min)
node scripts/attaques/index.mjs --liste            # scénarios, familles, cas
node scripts/attaques/index.mjs --scenario cookie-rejoue --scenario galeries   # un scénario, ou une famille
node scripts/attaques/index.mjs --scenario galeries --garder                   # dossiers gardés (chemin affiché)
```

Code de sortie : 0 si tout est vert, 1 sinon. `node --test test/vigie-attaques.test.js` joue tout le jeu dans la suite de tests.

**Lire le rapport** : une ligne par scénario (✓ ou ✗, cas DS, durée), puis ses étapes. Chaque attente dit ce qui a été vérifié (`alerte <règle> sur <entité> (<gravité>) [<mode>]`, `signal`, `score`, `décision`, réponse du site) et ce qui a été trouvé ; « autres alertes de l'étape » liste ce qui s'est ouvert sans être attendu. `note :` explique un choix (quorum, mode de départ) ; `trou constaté :` décrit un écart connu entre l'attente et ce que font la Vigie ou le site, avec le fichier et la ligne en cause : le scénario reste rouge tant qu'il n'est pas comblé (dans la suite de tests, c'est un sous-test « todo »).

Ce qu'il faut savoir pour lire les attentes : les règles qui déposent des **points** n'ouvrent une alerte qu'avec deux sources (quorum) ; le site seul produit donc un **signal** et un score, pas d'alerte. Le scénario `quorum-bordure` ajoute la seconde source (Worker Cloudflare simulé : Analytics Engine factice) et vérifie l'alerte, puis le blocage une fois la règle en mode Bloquer (403 sur l'adresse). Les règles en mode Alerter (galeries, Carnets, textes) ouvrent leur alerte sans réponse ; les réponses automatiques (cookie rejoué : sessions du compte fermées ; accès qui fuit : accès suspendu) sont vérifiées jusqu'à leur application par le site.

**Ajouter un scénario** : dans le fichier de sa famille (`scripts/attaques/scenarios/<famille>.mjs`, ou un nouveau fichier ajouté à `scenarios/index.mjs`), un objet :

```js
{
  nom: 'mon-scenario', famille: 'exploration', titre: 'Ce qu’il fait', cas: ['DS15'],
  resume: 'Le déroulé, en une phrase.',
  // preparerBase(db) { … }    données de départ, écrites avant le démarrage du site (facultatif)
  // bordure: true             Worker Cloudflare simulé : b.banc.cf.ajouter({ ip, classe, statut, n })
  async jouer(b) {
    const n = b.nav({ ip: '203.0.113.9', ua: b.UA.linux, pays: 'DE' });   // visiteur ; b.equipe(…) pour l'admin
    await n.get('/.env');                                                 // b.julien : l'administrateur, déjà connecté
    await b.verifier('étape', [
      { signal: 'sigma.piege', entite: 'ip:203.0.113.9' },
      { alerte: 'sigma.x', entite: 'compte:local:julien', gravite: 'moyen', mode: 'alerter' },
      { pasAlerte: 'entite.score', note: 'pourquoi' },
    ]);
    b.constat('étape', 'ce que le site a répondu', condition, 'détail');
  },
}
```

Attentes possibles : `alerte`, `pasAlerte`, `aucuneAlerte`, `signal`, `pasSignal`, `decision`, `pasDecision`, `score` (avec `min`, `sources`) ; chacune vaut pour ce qui s'est passé depuis l'étape précédente, et peut porter `note` ou `trou`. Les entités s'écrivent `ip:…`, `reseau:…`, `compte:<sub>`, `session:…`, `site:acces:<n°>`. Préparation commune : comptes de Julien (administrateur, `local:julien`, connecté depuis `192.0.2.10`) et de Sébastien (photographe, `zitadel-sebastien`), sauvegarde du site contrôlée par la Vigie (administrateurs connus, rôles pour le détecteur « rôle incohérent »).

- **Ce que le jeu a révélé, et corrigé** (19 octobre 2026) : les textes publiés pesaient comme des résumés (« nombre » lu comme un poids : six traductions ouvraient « textes réécrits en série ») ; une corrélation ne se redéclenchait pas dans sa fenêtre (une attaque qui continue ne reprenait pas sa réponse, même après le passage de la règle en Bloquer) : elle repart désormais de zéro après chaque signal.
- **Limite connue** : la force brute **répartie** contre un compte de l'admin n'est visible que par Zitadel (`zitadel_echec` porte le compte) ; un échec de connexion vu par le site ne dit pas quel compte était visé (l'identité n'est connue qu'après une connexion réussie).

## Garde-fous

- **Le site ne bloque jamais tout le monde** : une liste qui contiendrait `0.0.0.0/0`, `::/0`, un réseau plus large que /8 (IPv4) ou /32 (IPv6), une plage IPv6 qui recouvre l'IPv4, la boucle locale, plus de l'équivalent d'un /8 au total ou plus de 10 000 entrées est refusée en entier ; toute décision expire ; les comptes de `ADMIN_SUBS` ne sont jamais gelés ni tenus dehors par un verrouillage (une vérification d'identité, elle, les vise aussi : ils confirment leur identité comme les autres, sans jamais être tenus dehors).
- **Réception** : elle n'écoute que sur le réseau interne `nicephos-vigie-ingest`, à l'adresse `VIGIE_INGEST_IP` (`172.29.43.10` par défaut) ; le site l'appelle `vigie-reception`.
- **Vigie arrêtée** : le site applique la dernière liste valide (gardée dans `STORAGE_DIR/securite-decisions.json`) jusqu'à ses fins, et garde ses événements en attente (50 Mo au plus).
- **Dernier recours** : `VIGIE_APPLIQUER=0` dans le `.env` du site puis redémarrage : les décisions sont lues mais jamais appliquées (un avertissement le dit dans les journaux du site).
- **Signature** : le site n'applique qu'une liste signée par la clé privée de la Vigie (Ed25519), et jamais une liste plus ancienne que celle en place. La Vigie n'accepte que des lots signés par le site (HMAC), datés à 60 s près, jamais rejoués.

## Quota de l'API de Zitadel Cloud

L'offre gratuite de Zitadel Cloud compte **5 000 requêtes par mois** à son API de gestion (toute requête autorisée sur `/admin`, `/management`, `/v2`… ; jamais l'obtention d'un jeton). La Vigie en fait deux usages : la lecture des événements (une requête par passage, toutes les 30 minutes : environ 1 450 par mois, plus une par page de 500 événements au-delà) et la relecture des droits de la console (deux requêtes par relecture : toutes les 5 minutes pour chaque session ouverte, et avant chaque action ; une heure de console par jour : environ 720 par mois). Usage ordinaire : de l'ordre de 2 200 requêtes par mois.

- **Compté** par mois et par usage (`vigie/cli.js etat`, carte Zitadel de la page Santé).
- **Alerte** moyenne à 80 % du quota, haute à 95 % (`vigie_zitadel_quota`, règle `zitadel_quota`).
- **Au-delà de 95 %**, la lecture des événements passe d'elle-même à une toutes les 4 heures jusqu'au mois suivant (l'historique gratuit de Zitadel est d'un jour : la marge reste suffisante).
- **Réglages** (`vigie.env`) : `VIGIE_ZITADEL_INTERVAL_S` (1800 par défaut), `VIGIE_ZITADEL_QUOTA` (5000 ; 0 : pas de quota, offre payante).
- **Plus tard** : recevoir les événements par les Actions v2 de Zitadel (étude `docs/etudes/vigie-crowdsec-et-actions-zitadel.md`), qui ne comptent pas comme des requêtes.

## Ce que garde la Vigie

- **Événements** : 6 mois (`VIGIE_RETENTION_DAYS`), chaînés (une ligne modifiée, insérée à la main ou effacée se voit à la vérification quotidienne, critique) ; compteurs par jour 25 mois. Chaque nuit, la tête de la chaîne (numéro, maillon, signature) est écrite dans le journal du conteneur (`docker logs nicephos-vigie | grep tete_chaine`) : la comparer d'un jour à l'autre montre une base revenue en arrière.
- **Zitadel** : 210 types d'événements suivis (`vigie/zitadel/types-suivis.json`, tirés de la liste de l'instance), lus toutes les 30 minutes (`VIGIE_ZITADEL_INTERVAL_S`, de 5 minutes à 6 heures), **en une requête par passage** (tous les événements, triés par la Vigie ; repli par lots de 30 types si Zitadel refusait) ; seuls quelques champs sans donnée personnelle sont gardés (rôles, projet, réglages de connexion, adresse IP de l'agent quand Zitadel la donne) ; plus de 20 h sans lecture : signalé.
- **Sauvegardes** : conteneur `nicephos-vigie-sauvegarde`, un instantané contrôlé par jour, 14 gardés, dans `BACKUP_DIR-vigie` (par exemple `/mnt/user/backups/nicephos-vigie`).

## Retirer la Vigie

Vider `VIGIE_URL` (et retirer `COMPOSE_PROFILES=vigie`) dans le `.env` du site, **Compose Up**. Le site oublie les décisions et les événements en attente ; la base de la Vigie reste dans son dossier jusqu'à ce que vous l'effaciez.
