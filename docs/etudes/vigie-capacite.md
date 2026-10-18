# Vigie : capacité, abaques et leviers (17 octobre 2026)

Demandé à l'arbitrage NC6 de la revue des phases C1 et C2 : ce qui limite la Vigie, à partir de quel volume, et comment aller plus loin. Les mesures viennent du banc `vigie/banc.js`, à relancer sur la machine cible (commande dans [Vigie](../wiki/Vigie.md#horodatages-et-capacité)).

## 1. Besoin

D'après l'annexe architecture (section 2.1) :

| | Normal | Pire cas réaliste |
|---|---|---|
| Admin | 200 à 1 000 événements par jour | 5 000 (journée d'import) |
| Site public (événements suspects seulement) | 100 à 2 000 | 50 000 un jour de scan |
| Zitadel | quelques dizaines | quelques centaines |
| **Total** | **300 à 3 000 par jour** | **environ 55 000 un jour de scan** |

En pointe, le débit reste faible : 55 000 événements par jour font moins d'un par seconde en moyenne. Côté site, les pointes sont déjà amorties :
- 60 événements par heure et par réseau pour un même type ;
- résumés toutes les 5 minutes (D23) ;
- file de 10 000 événements ;
- lots de 200, envoyés chaque seconde ;
- 50 Mo d'attente sur disque si la Vigie est arrêtée, soit environ 70 000 événements, plus d'un jour de pire cas.

## 2. Mesures

Le banc a tourné sur la machine de développement (un seul cœur utilisé, disque SSD). Chaque mesure part d'un historique de N événements sur 30 jours, puis analyse 5 000 événements en lots de 20 (un envoi du site par seconde), par le même chemin que le service.

Le mélange d'événements :

| Type | Part |
|---|---|
| Lectures de l'admin | 35 % |
| Pages introuvables | 25 % |
| Pièges | 15 % |
| Connexions Zitadel | 10 % |
| Connexions | 5 % |
| Saisies malveillantes | 5 % |
| Refus de droit | 5 % |

| Historique | Analyse (événements/s) | ms par événement | Écriture seule (événements/s) | Vérification de la chaîne | Mémoire du processus | Base |
|---|---|---|---|---|---|---|
| 0 | 2 200 | 0,45 | — | 0,1 s | 77 Mo | 3 Mo |
| 100 000 | 1 510 | 0,66 | 7 500 | 1,6 s | 138 Mo | 50 Mo |
| 1 000 000 | 912 | 1,10 | 3 800 | 11,7 s | 156 Mo | 477 Mo |
| 3 000 000 | 707 | 1,41 | 3 100 | 40,7 s | 159 Mo | 1,4 Go |

**Avant les corrections de cette passe**, les chiffres étaient nettement plus bas :
- 1 160 événements/s sans historique ;
- 231 événements/s (4,3 ms chacun) à 1 million.

Deux causes, toutes deux corrigées :
- **Une transaction validée par événement analysé**, donc une écriture forcée sur disque à chaque fois. L'analyse d'un lot tient maintenant dans une seule transaction, avec un point de sauvegarde par événement : une erreur n'annule que le sien.
- **Pas d'index par compte et par type**. Une connexion relisait toutes les lignes du compte sur 90 jours. La migration 005 de la Vigie ajoute un index couvrant (compte, type, heure de réception, heure de la source). Le cache SQLite passe aussi de 2 à 32 Mo.

Taille sur disque : environ **500 octets par événement**, index compris.

### Rafale sur une adresse (18 octobre 2026, audit D3-D12)

Le mélange ci-dessus n'ouvre aucune alerte : il ne mesurait pas le coût des déclencheurs de la migration 009, qui tiennent la table `alert_flux` de la console à chaque événement rattaché à une alerte. Le banc ajoute donc une rafale (`--rafale N`, 5 000 par défaut, 0 pour s'en passer) :
- le site et Zitadel voient la même adresse (quorum) : une alerte de score s'ouvre ;
- puis N pages introuvables de cette adresse, en lots de 20, chacune rattachée à l'alerte ;
- enfin, le déclencheur seul : les mêmes liens écrits pour une autre alerte, avec puis sans lui (trois fois, médiane).

| Historique | Événements de la rafale | Rattachés à l'alerte | ms par événement de la rafale | Calcul par événement | Déclencheur, par lien | Lien sans déclencheur | Part du déclencheur |
|---|---|---|---|---|---|---|---|
| 100 000 | 5 000 | 5 007 | 0,34 | 344 µs | 6 µs | 4,5 µs | 1,8 % |
| 1 000 000 | 5 000 | 5 007 | 1,50 | 641 µs | 7 µs | 11,4 µs | 1,1 % |

Le déclencheur coûte quelques microsecondes par lien, moins de 2 % du calcul d'un événement : une adresse qui balaie le site et rattache des dizaines de milliers d'événements à son alerte ne ralentit pas le moteur (la relecture de mesure de la revue donnait +13,5 µs par lien, au plus +2 %). À un million de lignes, le temps écoulé par événement (1,5 ms) vient surtout de l'écriture sur disque, pas du calcul.

## 3. Abaques

Durée de conservation par défaut : 183 jours (`VIGIE_RETENTION_DAYS`). Les durées de vérification sont extrapolées à environ 13,5 s par million de lignes (mesuré : 40,7 s pour 3 millions).

### 3.1 Taille et vérification

| Événements par jour | Lignes gardées (183 jours) | Base | 14 sauvegardes | Vérification quotidienne |
|---|---|---|---|---|
| 1 000 | 183 000 | 90 Mo | 1,3 Go | 2,5 s |
| 3 000 (haut du normal) | 550 000 | 270 Mo | 3,8 Go | 7 s |
| 10 000 | 1,8 million | 0,9 Go | 13 Go | 25 s |
| 55 000 tous les jours (bien au-delà du pire cas) | 10 millions | 5 Go | 70 Go | 2 min 15 |

### 3.2 Débit et mémoire

- **Marge de débit** : le besoin de pointe tient dans une seconde d'analyse sur toute la plage mesurée, soit au moins 700 événements par seconde, même avec 3 millions de lignes. Un afflux de 10 000 événements (la file entière du site) est absorbé en 5 à 15 secondes ; la réception continue pendant ce temps.
- **Mémoire** : de 80 à 160 Mo, pour une limite du conteneur de 256 Mo. Elle ne dépend plus du retard d'analyse : la file est un curseur dans la base. Avant, 100 000 événements en attente occupaient 120 Mo.

  Ce qui est borné en mémoire :

  | Élément | Limite | Mémoire |
  |---|---|---|
  | Corrélations | 200 000 points | environ 25 Mo |
  | Dédoublonnages (LRU) | quelques dizaines de milliers de clés | quelques Mo |
  | Cache SQLite | 32 Mo | 32 Mo |

## 4. Ce qui limite, dans l'ordre où cela arrive

| Rang | Limite | Seuil | Signe à surveiller |
|---|---|---|---|
| 1 | **Disque des sauvegardes de la Vigie** : 14 instantanés de la base complète | dès 10 000 événements par jour : 13 Go | taille de `VIGIE_BACKUP_DIR` |
| 2 | **Vérification quotidienne de la chaîne** : linéaire, environ 13,5 s par million de lignes. Elle se fait désormais par paquets de 5 000 lignes et ne bloque plus la réception. Au démarrage, elle se fait d'une traite (rien d'autre ne tourne encore). | gênante au-delà de 10 millions de lignes (2 min au démarrage) | journal « tête de la chaîne » |
| 3 | **Historique par compte** : les détecteurs (heure inhabituelle, vitesse, voyage) lisent l'historique du compte, au plus une fois par heure. Le coût croît avec le nombre d'événements par compte. | au-delà de 1 million d'événements par compte | `analyse_ms_par_evenement` du banc |
| 4 | **Écriture** : 8 index par ligne et une chaîne HMAC sérielle, un seul écrivain. L'écriture seule tombe de 7 500 à 3 100 événements par seconde entre 100 000 et 3 millions de lignes : les index ne tiennent plus en cache. | des milliers par seconde, cent fois le besoin | — |
| 5 | **Mémoire** : 256 Mo pour le conteneur | atteinte seulement si on relève les bornes (corrélations, cache) | `docker stats nicephos-vigie` |
| 6 | **Un seul cœur** : Node exécute l'analyse sur un fil | de l'ordre de 1 000 événements par seconde soutenus | `etat` : « Analyse : N événement(s) en attente » |

## 5. Aller plus loin

Du moins coûteux au plus coûteux :

1. **Réglages, sans code** :
   - `VIGIE_RETENTION_DAYS=90` (de 30 à 400) : taille, sauvegardes et vérification divisées par deux ;
   - `VIGIE_BACKUP_KEEP=7` : moitié moins de disque pour les sauvegardes ;
   - `mem_limit: 384m` dans `compose.yaml`, si l'on relève le cache.
2. **Plus de résumés côté site** : fenêtre de résumé plus longue, budget par réseau plus bas. Le volume du public baisse sans perte de détection, puisque le nombre réel est gardé.
3. **Vérification incrémentale** : vérifier chaque nuit depuis la dernière tête vérifiée et signée, et vérifier tout une fois par semaine. Le coût nocturne devient proportionnel au volume du jour. Petit changement dans `vigie/store.js`.
4. **Compteurs horaires par compte** : une table de résumés (compte, heure, type, nombre), tenue à l'écriture, lue par les détecteurs à la place de l'historique. Le coût par événement ne dépend plus de l'historique.
5. **Analyse sur un second cœur** (`worker_threads`) : la réception et la chaîne d'un côté, le moteur de l'autre, chacun avec sa connexion SQLite (mode WAL). Environ deux fois plus de débit.
6. **Base découpée par mois** : un fichier SQLite par mois, attaché à la demande, scellé par une tête signée. La purge efface un fichier ; la vérification ne relit que le mois ouvert.
7. **Au-delà d'environ un million d'événements par jour**, ce n'est plus le rôle de la Vigie. Il faut exporter au format OCSF (phase E) vers un entrepôt fait pour cela (ClickHouse, OpenSearch) : un serveur de plus à tenir, ou un service payant. La Vigie garderait la détection et les décisions signées.

Pour le volume prévu, les leviers 1 et 2 suffisent largement. Les leviers 3 et 4 seraient à faire si le banc, relancé sur la machine cible avec un historique réel, montrait plus de 5 ms par événement.
