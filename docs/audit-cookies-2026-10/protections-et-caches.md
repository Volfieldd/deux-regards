# Carte des données conservées et de leur protection

Complément du [rapport principal](README.md), lecture statique du commit `f44cdf3`, 24 octobre 2026. Cette carte précise les écarts à la politique demandée : chiffrement des données privées conservées, authenticité des états et suppression des copies évitables. Elle ne constitue pas un audit exhaustif de tous les traitements du dépôt ni une observation du chiffrement des supports réels.

## 1. Site public et traitements associés

| Ensemble | État applicatif actuel | Écart à la cible |
|---|---|---|
| Rencontres et `/bonjour` | Certains champs personnels, signatures et pièces passent par AES-256-GCM si DATA_KEY existe | Sans clé : clair. Références, dates, choix et métadonnées corrélables ne sont pas tous chiffrés |
| Contact/licence | Nom, e-mail, société, diffusion et message passent par le coffre conditionnel | Vérifier aussi métadonnées et copies ; pas de garantie sans clé |
| Signalements | Message et e-mail passent par le coffre conditionnel | Même dépendance à la clé |
| Libellé des invités | `space_invites.label` scellé à l’écriture si DATA_KEY | Pas de reprise générale `sealExisting()` des anciens libellés repérée : ajouter une clé ne suffit pas à migrer les créations antérieures |
| Sessions visiteur | Empreinte SHA-256 du bearer ; identifiant interne, CSRF, langue, contexte et dates lisibles | Le bearer brut n’est pas en base, mais les identifiants et liens sont pseudonymes, pas nécessairement anonymes |
| Récapitulatif Bonjour | Objet lisible en mémoire, jeton opaque côté navigateur ; lecture unique ; expiration logique 15 min | Pas de purge autonome à l’échéance. État de parcours supprimable par confirmation directe du POST |
| Audience | Empreintes HMAC quotidiennes en mémoire, agrégats en base | Traitement de données techniques avant agrégation ; suppression de l’état possible en abandonnant les visiteurs uniques |
| J’aime | Mémoire serveur IP/photo, 12 h logiques, purge au prochain usage ; localStorage côté navigateur | Deux stockages distincts ; retirer le navigateur ne supprime pas la mémoire serveur |
| Photos privées/offertes | Rendus JPEG en mémoire ou sur disque selon la fonction ; images privées cacheables avec revalidation | Recalcul/transmission à la demande et no-store sont des alternatives, avec coût de calcul et de réseau |

Sources : [server/encounters.js](../../server/encounters.js), 49–74, 553–562 et 680–705 ; [server/messages.js](../../server/messages.js), 112–118 et 153–158 ; [server/feedback.js](../../server/feedback.js), 9–57 ; [server/spaces.js](../../server/spaces.js), 269 et 283–316 ; [server/visitor-sessions.js](../../server/visitor-sessions.js), 25–75 ; [server/routes/public.js](../../server/routes/public.js), 66–94 et 121–133 ; [server/stats.js](../../server/stats.js), 58–113 ; [server/routes/prive.js](../../server/routes/prive.js), 349–402.

## 2. Administration

| Ensemble | État applicatif actuel | Écart à la cible |
|---|---|---|
| Comptes | `sub`, nom, e-mail, notification, rôles et liens conservés sans coffre | DATA_KEY ne les chiffre pas |
| Sessions | Bearer haché ; identité, nom, e-mail, ID token, CSRF et contexte lisibles | L’empreinte du bearer ne protège pas le reste de la ligne |
| Sessions révoquées | Empreinte, compte, contexte et dates ; 48 h avec la Vigie | Métadonnées personnelles lisibles |
| Journal admin | `sub`, nom, action, cible, détails et date ; conservation de 396 jours | Pas de coffre ni de chaîne générale d’intégrité dans ce journal |
| Changements de comptes | Données avant/après et tickets HMAC | Le ticket authentifie ses métadonnées ; il ne chiffre pas les comptes ni ne couvre universellement chaque ligne métier |
| Flash | JSON signé, 60 s, parfois données personnelles | Lisible dans le stockage cookie ; code de message générique préférable |
| Transaction OIDC | JSON signé, dont verifier PKCE et parfois identité de réauthentification | Contenu lisible ; délai normal contrôlé par cookie navigateur, pas par une date locale serveur |
| Brouillon Carnets de secours | Champs du brouillon en localStorage sans durée ni compte dans la clé | Copie privée durable en clair ; suppression du secours persistant proposée |

Sources : [server/accounts.js](../../server/accounts.js), 13–39, 51–56, 114–116, 150–157 et 212–224 ; [server/sessions.js](../../server/sessions.js), 13–35 ; [server/securite/site.js](../../server/securite/site.js), 114–120 ; [server/routes/admin.js](../../server/routes/admin.js), 267–285 ; [server/auth.js](../../server/auth.js), 290–342 ; [public/admin/carnet.js](../../public/admin/carnet.js), 41–96.

## 3. Vigie et liaisons avec le site

| Ensemble | État applicatif actuel | Écart à la cible |
|---|---|---|
| `events` | Données en clair dans SQLite avec chaîne HMAC-SHA-256 | Intégrité vérifiable, sans confidentialité du contenu |
| Signaux, entités, alertes, dossiers et notes | Tables/projections lisibles | Une source chaînée ne signifie pas que toutes les copies dérivées sont chiffrées ou individuellement authentifiées |
| Sessions console | Bearer haché ; identité, contexte, CSRF et dates lisibles ; purge à 7 jours | Chiffrement/minimisation des autres champs à concevoir |
| Transactions console | State, verifier PKCE, nonce, retour et date lisibles ; validité serveur 10 min, consommation unique | Délai d’accès correct ; nettoyage physique et confidentialité restent distincts |
| Habilitations console | Identités, noms, rôles et dates lisibles | Hors du coffre ; durée propre à examiner |
| File site → Vigie | Mémoire de traitement ; signature au transport | La signature ne chiffre pas la mémoire ni les copies de reprise |
| Tampon `securite-attente/*.ndjson` | Corps JSON écrit brut ; droits dossier 0700/fichier 0600 demandés ; re-signature au renvoi | Pas de chiffrement ni MAC conservé au repos dans ce format ; une modification locale n’est pas détectée par une signature d’origine du fichier |
| `securite-decisions.json` | Payload lisible signé Ed25519 ; métadonnées historiques locales hors signature | Chiffrer/authentifier l’enveloppe locale sans perdre la signature reçue ni la cohérence des suspensions |

La portée du constat sur le tampon est celle d’un acteur capable d’écrire dans son dossier. Aucun accès distant à ce fichier n’a été démontré. Les permissions sont une barrière, mais ne satisfont pas à elles seules la politique « tout authentifié au repos ».

Sources : [vigie/store.js](../../vigie/store.js), 19–24, 37–66 et 86–101 ; [vigie/console/sessions.js](../../vigie/console/sessions.js), 18–79 ; [vigie/console/droits.js](../../vigie/console/droits.js), 71–107 ; [server/securite/index.js](../../server/securite/index.js), 212–223 et 247–276 ; [server/securite/decisions.js](../../server/securite/decisions.js), 78–94 et 160–165.

## 4. Clés, sauvegardes et anciennes copies

Le coffre utilise AES-256-GCM si DATA_KEY est disponible ; sinon `seal()` renvoie la valeur d’origine. La configuration impose une longueur minimale seulement si la clé existe. Le lancement en production sans clé avertit mais continue. Une mauvaise clé produit un avertissement de lecture ou une valeur absente ; aucun témoin global n’interdit systématiquement de nouvelles écritures sous une clé différente.

**Cible :** clé obligatoire pour les écritures privées, témoin authentifié de compatibilité au démarrage, procédure versionnée de rotation et de restauration. Ne jamais remplacer simplement une clé existante. Les fichiers de sauvegarde doivent rester restaurables par une clé conservée à part.

Sources : [server/vault.js](../../server/vault.js), 4–9 et 27–62 ; [server/config.js](../../server/config.js), 88–89 ; [server/index.js](../../server/index.js), 22–34.

| Sauvegarde | Mécanisme applicatif | Conséquence |
|---|---|---|
| Site | Instantané SQLite et copies des originaux | Champs scellés toujours scellés ; clair des comptes/sessions et autres données recopié. Pas d’enveloppe cryptographique globale de l’instantané dans ce mécanisme |
| Vigie | Instantané SQLite et permissions restreintes | La chaîne HMAC interne n’est pas le chiffrement ni une signature globale de toutes les tables du fichier |

Sources : [server/db/backup.js](../../server/db/backup.js), 37–46 et 112–142 ; [vigie/backup.js](../../vigie/backup.js), 5–20. Le chiffrement des disques ou d’une destination externe peut ajouter une protection, mais n’a pas été observé ici. La case déclarative d’un disque chiffré ne vérifie pas techniquement les volumes.

**Les anciennes copies font partie du chantier.** Chiffrer les nouvelles écritures ne supprime pas automatiquement les anciennes valeurs en clair, sauvegardes, WAL, exports, téléchargements ou entrées du navigateur. Le programme doit prévoir reprise, nettoyage et preuve de restauration sans réintroduire des données effacées. Aucun nettoyage réel n’a été entrepris pendant le diagnostic.

## 5. Contraintes d’architecture à préserver

- **D6 :** clé de chaîne distincte des clés de transport et de COOKIE_SECRET. Ne pas fusionner toutes les fonctions cryptographiques sous DATA_KEY.
- **NC2 :** la Vigie contrôle indépendamment les rôles dans un instantané du site. Chiffrer cet instantané sans adapter le contrat rendrait ce contrôle aveugle ; ne pas lui transmettre silencieusement la clé complète du site.
- **MV18/MV23 :** la conception accepte actuellement une base Vigie non chiffrée sous isolation système. Votre exigence nouvelle change cet objectif : il faut une conception versionnée qui préserve recherches, index, corrélation, exports et chaîne historique.
- **AAD/enc2 :** le coffre courant authentifie les octets chiffrés, mais n’attache pas cryptographiquement chaque valeur à sa table, colonne et ligne. Ce sujet est déjà ouvert ; ne pas annoncer cette protection comme existante.
- **D38 :** chiffrer ne remplace ni les durées de conservation ni les purges et masquages. Ne pas réécrire rétroactivement le journal pour chiffrer son passé sans procédure compatible avec sa preuve d’intégrité.
- **Récapitulatif :** le choix « jamais sur disque » reste applicable. Supprimer le stockage par un rendu direct respecte ce choix ; introduire une nouvelle table ne le ferait pas.

Sources : [journalisation-securite.md](../etudes/journalisation-securite.md), décision D6 ; [vigie/config.js](../../vigie/config.js), 24–32 ; [vigie/controle-roles.js](../../vigie/controle-roles.js), 76–93 ; [annexe-vigie-architecture.md](../etudes/annexe-vigie-architecture.md), MV18/MV23 ; [PLAN.md](../../PLAN.md), sujet AAD/enc2 ; [vigie-dossiers.md](../etudes/vigie-dossiers.md), D38 ; [RGPD](../wiki/RGPD.md), récapitulatif.

Trois solutions de confidentialité Vigie restent à comparer : supports chiffrés vérifiés, champs/payloads chiffrés avec index pseudonymes, ou chiffrement de fichier de base adapté. Elles ne protègent pas contre les mêmes accès. Aucune nouvelle dépendance, base de données ou distribution de clé n’est décidée dans ce rapport.
