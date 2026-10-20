# La Vigie en dossiers : corrélation entre entités et phases d'attaque

| | |
|---|---|
| Statut | Note de conception, aucune ligne de code. Décisions D31 à D39 à prendre (section 13). |
| Date | 20 octobre 2026, d'après le code de `main` à ea0528b (Vigie après #186). |
| Demande | « Est-ce que ce ne serait pas plus pertinent de travailler tout ça avec la vue « case » qui prendrait un artefact en origine (asset : ip, hostname source, dest, session utilisateur ou nom d'utilisateur) qui viendrait regrouper tous les événements suspects connexes en se servant d'une mécanique de pondération interne pour donner une idée du niveau de l'alerte ? Une corrélation automatique inter entités, avec une représentation de la timeline et une possibilité d'explorer (drill down) de la même façon les liens entre case et autres assets. » Puis : « je veux particulièrement bien détailler le côté « phase d'attaque » ». Point de départ : détecter l'accès aux données personnelles et leur sortie, en corrélant les lectures avec les authentifications et les signaux faibles (adresses multiples, adresse ou heure inhabituelle, empreinte différente). |
| Base | [`recadrage-vigie-edge-wake.md`](recadrage-vigie-edge-wake.md) (entités, score, quorum), [`journalisation-securite.md`](journalisation-securite.md) (cas DS1 à DS32), [`vigie-besoins-des-briques.md`](vigie-besoins-des-briques.md) (BV-1 à BV-30), `vigie/moteur.js`, `vigie/detecteurs.js`, `vigie/regles/*.yml`. |

---

## En bref

- **Un dossier** (« case ») rassemble tout ce qui touche une même attaque probable : les alertes, les signaux qui n'en ont pas déclenché, les faits ordinaires qui deviennent suspects dans ce contexte, et les entités qui les relient (adresse, réseau, appareil, session, compte, accès de galerie, objet lu). Aujourd'hui, une alerte correspond à **une règle et une seule entité**. Une même attaque se lit donc en quatre ou cinq alertes séparées, et l'analyste fait le lien à la main.
- **Les phases d'attaque sont le cœur du dossier.** Chaque signal reçoit une phase parmi huit : **repérage, tentative, accès, exploration, ancrage, collecte, exfiltration, impact**. Deux marqueurs hors chaîne s'y ajoutent : la **dissimulation** (aveugler la Vigie) et l'**atteinte à la disponibilité**. La phase vient d'abord de la technique MITRE ATT&CK, plus précise que la tactique. Un champ explicite la remplace quand la technique trompe. Un test bloque toute règle non classée. Classement des 88 règles et des 10 détecteurs actuels : section 4.7.
- **Distinguer les jalons des indices.** Un **jalon** prouve qu'une phase a eu lieu (lectures en masse, export, rôle donné). Un **indice** ne fait pas avancer l'attaque : il dit seulement qu'un accès est **douteux** (heure inhabituelle, nouvel appareil, pays inédit, adresses multiples, voyage impossible). Les indices règlent la **confiance**, les jalons la **progression**. C'est la réponse à la question de départ : une lecture ordinaire devient un jalon de collecte dès que l'accès qui la porte est douteux.
- **Trois axes pour la gravité**, lisibles chacun en une ligne :
  - **progression** : la phase la plus avancée, et combien de phases se suivent dans l'ordre ;
  - **confiance** : la part d'hostile dans les accès ;
  - **enjeu** : ce qui a été touché.

  Une grille fixe donne la gravité (section 6), sans formule cachée. Exemple d'explication : « Collecte atteinte, 4 phases dans l'ordre · confiance forte (cookie rejoué) · enjeu sensible (34 fiches de personnes) ».
- **Corrélation entre entités sans dossier fourre-tout.** Les liens **forts** (session → compte, session → appareil) se suivent sans limite. Les liens **faibles** (adresse IP, réseau) se suivent d'un saut, sur une fenêtre bornée, et jamais à travers une adresse de confiance ou une adresse vue avec un administrateur. Les **cibles** (une fiche, une galerie) ne se traversent jamais : deux comptes qui lisent la même fiche ne fusionnent pas leurs dossiers, ils deviennent des dossiers voisins.
- **Ce que ça corrige dans l'existant.** La chaîne d'attaque actuelle (`chaine_attaque`, DS23) ne voit une attaque que si repérage, tentative et accès tombent sur **la même entité**. Un scan depuis une adresse suivi d'un accès sur un compte ne se relie jamais. Elle ignore l'impact et le contrôle à distance, ainsi que les 6 règles qui ne portent qu'une technique, et elle oublie tout au redémarrage. De plus, le score d'entité perd la moitié de sa valeur chaque heure : un accès douteux à 9 h et des lectures à 14 h ne se rencontrent pas. Le dossier garde son histoire en base, sur des jours.
- **Plan en cinq PR** (section 12) : phases, moteur des dossiers, maquettes, console, puis données personnelles (catégories, couverture, volume). Aucun changement côté site avant la cinquième.

---

## 1. Ce qui existe, ce qui manque

| Brique | Aujourd'hui | Limite pour un dossier |
|---|---|---|
| Entités et score | `entities` : adresse, réseau, compte, session, appareil ; score qui perd la moitié de sa valeur en 1 h ; quorum de deux sources (`vigie/moteur.js:12`) | Une heure de mémoire : les étapes d'une attaque étalée sur une journée ne s'additionnent pas |
| Liens | `entity_links` : chaque paire d'entités vue dans un même événement, gardée 90 jours (`vigie/migrations/003_entites_alertes.sql:18`) | Tous les liens ont la même force ; rien ne dit qu'une adresse partagée est un lien faible |
| Alertes | Une par règle et par entité tant qu'elle est active ; `alert_events` relie l'alerte à ses événements | Une attaque produit plusieurs alertes sans lien entre elles |
| Chaîne d'attaque | `createChains` (`vigie/detecteurs.js`) : repérage, tentative et accès sur **une** entité en 24 h, en mémoire | Pas de passage d'une entité à l'autre ; ni impact ni contrôle à distance ; perdue au redémarrage |
| Étiquettes MITRE | Les 88 règles qui émettent un signal en portent toutes ; les 10 détecteurs aussi | 6 règles n'ont qu'une technique, sans tactique (`session_autre_appareil`, `restauration`, `csrf_repetes`, `csrf_repetes_invite`, `valeurs_impossibles_repetees`, `rafale_erreurs`), et la chaîne actuelle ne les voit pas |
| Fiche d'une entité | Console : score par source, liens dans les deux sens, alertes, décisions, derniers événements (`vigie/console/ecrans/evenements.js:940`) | Pas de vue d'ensemble d'une attaque ni de frise |
| Lectures de données | `sensitive_read`, `sensitive_export`, `sensitive_delete` ; règles `lectures_massives` (30 fiches en 1 h), `exports_nombreux`, détecteur `vitesse` | Mêmes seuils que l'accès soit sain ou douteux |

Ce qu'il faut ajouter : une **phase** sur chaque signal, la **force** des liens, un **objet** qui dure (le dossier), et une **gravité qui s'explique**.

---

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| Dossier | Ensemble daté d'entités et de signaux qui racontent une même attaque probable. A un numéro, un statut, une gravité et une explication. |
| Artefact (entité) | Ce sur quoi on pivote. **Acteurs** : adresse IP, réseau, appareil (empreinte), session, compte, accès de galerie privée, conteneur de la pile. **Cibles** : objet de données (personne 12, rencontre 7, message 40), galerie, réglage public, billet, compte visé par un changement de droits, la Vigie elle-même. |
| Rôle | Place d'une entité dans le dossier : **acteur** (d'où vient l'action), **cible** (ce qui est touché), **contexte** (vue avec l'acteur sans rien faire de suspect). |
| Force d'un lien | Fort, moyen ou faible (section 5.2). Décide si le dossier s'étend par ce lien. |
| Jalon | Signal qui prouve qu'une phase a eu lieu (exemple : `lectures_massives` → collecte). |
| Indice | Signal qui rend un accès douteux sans faire avancer l'attaque (exemple : `heure_inhabituelle`). Règle la confiance. |
| Contre-indice | Fait qui rend un accès légitime (identité confirmée par le second facteur après les indices, adresse de confiance, classement « légitime » par l'analyste). Fait baisser la confiance. |
| Fait | Événement ordinaire, sans règle (connexion, lecture d'une fiche). Il figure dans la frise. Il devient un jalon quand l'accès qui le porte est douteux (section 4.6). |
| Piste | Forme générale de l'attaque, d'après l'entité de départ : **identité** (un compte de l'équipe), **invité** (un accès de galerie privée), **serveur** (la pile elle-même), **externe** (une adresse ou un réseau, sans accès), **surveillance** (la Vigie aveuglée). |

---

## 3. Pourquoi huit phases plutôt que les quatorze tactiques MITRE

MITRE ATT&CK Enterprise compte 14 tactiques. Les reprendre telles quelles dans la console pose quatre problèmes :

1. **Elles ne sont pas ordonnées.** MITRE le dit lui-même : une tactique est un « pourquoi », pas une étape. Or un dossier a besoin d'un ordre pour mesurer la progression et vérifier que les étapes se suivent.
2. **Certaines sont vides ici.** La Vigie ne voit ni « Resource Development » ni l'exécution sur un poste. L'exécution n'existe que côté serveur, comme moyen d'entrer.
3. **Une même tactique mélange l'échec et la réussite.** Avec la technique T1078 (comptes valides), « Initial Access » couvre aussi bien une connexion refusée qu'une connexion réussie. La phase doit les séparer : c'est toute la différence entre **tentative** et **accès**.
4. **« Defense Evasion » n'est pas une étape.** Effacer ses traces ou couper la surveillance peut arriver n'importe quand. Ce n'est pas un degré de progression : c'est un **aggravant**.

Les huit phases retenues suivent l'ordre d'une attaque contre une application web à comptes, comme ce site. Le détail des techniques MITRE reste visible sur chaque signal : rien n'est perdu pour qui lit l'ATT&CK.

---

## 4. Les phases d'attaque

### 4.1 Les huit phases et les deux marqueurs

| N° | Phase | Question qu'elle pose | Tactiques MITRE d'origine | Techniques typiques ici | Ce qui la prouve dans la Vigie (exemples) |
|---|---|---|---|---|---|
| 1 | **Repérage** | Quelqu'un cartographie-t-il le site ? | Reconnaissance (TA0043), Discovery avant tout accès | T1595, T1595.002, T1595.003 | `scanner`, `piege`, `connexion_test`, `bordure_erreurs`, détecteur `exploration_lente` |
| 2 | **Tentative** | Essaie-t-on d'entrer, sans y parvenir ? | Credential Access (TA0006), Initial Access refusé, Execution comme moyen d'entrer | T1110 et ses variantes, T1190, T1185, T1204, T1036 | `oidc_echecs_repetes`, `zitadel_echecs_repetes`, `cible_commune`, `enumeration_jetons`, `galerie_essais_repartis`, `valeurs_impossibles_repetees`, `fichier_piege`, `console_refus` |
| 3 | **Accès** | Est-on entré, avec un moyen qui n'est pas le sien ? | Initial Access réussi, Credential Access réussi | T1078, T1539, T1550.004 | `cookie_rejoue`, `session_autre_appareil`, `ecritures_sans_identite`, `acces_pays_multiples` ; **et toute connexion réussie**, dont les indices règlent la confiance (4.3) |
| 4 | **Exploration** | Une fois dedans, cherche-t-on où aller ? | Discovery après accès, Lateral Movement | T1087, T1046 | `exploration_droits` (refus en série), `ecriture_hors_portee`, `reseau_flux_site` |
| 5 | **Ancrage** | S'est-on donné des droits, une porte durable ou une charge posée ? | Privilege Escalation (TA0004), Persistence (TA0003), Command and Control (TA0011) sans sortie de données | T1098, T1556, T1068, T1105, T1071, T1189, T1059.007 | `role_hors_application`, `administrateur_donne`, `zitadel_facteur`, `acces_longue_echeance`, `billet_construction_active`, `reseau_chaine_attaque`, détecteur `role_incoherent` |
| 6 | **Collecte** | Rassemble-t-on des données au-delà de l'usage ? | Collection (TA0009) | T1213, T1119, T1005 | `lectures_massives`, `aspiration_distribuee`, `bordure_rafale`, détecteur `vitesse` ; **lectures ordinaires sous un accès douteux** (4.6) |
| 7 | **Exfiltration** | Les données sortent-elles, par téléchargement ou par publication ? | Exfiltration (TA0010), Collection qui rend public | T1530, T1041, T1048 | `exports_nombreux`, `telechargements_en_masse`, `acces_nouvel_appareil_puis_siphonage`, `exif_complet`, `heures_visibles_en_masse`, `reseau_sortie_directe` |
| 8 | **Impact** | Détruit-on, défigure-t-on ou détourne-t-on le site ? | Impact (TA0040) sauf disponibilité | T1485, T1491, T1566 | `messages_effaces_en_masse`, `restauration`, `contact_public_change`, `textes_publics_en_serie`, `billets_modifies_en_masse` |
| — | **Dissimulation** (marqueur) | Cherche-t-on à aveugler la Vigie ou à effacer ses traces ? | Defense Evasion (TA0005) | T1562, T1070 | `surveillance_reduite`, `chaine_rompue`, `integrite_comptes`, `configuration`, `bordure_muette`, `reseau_muet`, détecteur `silence` |
| — | **Disponibilité** (marqueur) | Cherche-t-on à rendre le site indisponible ? | Impact : déni de service | T1498, T1499 | `messages_satures`, `galerie_scrypt_sature`, `zitadel_quota`, `mode_urgence`, `console_indisponible` |

### 4.2 Particularités de ce site

- **Exfiltrer, c'est aussi publier.** Sur un site de photographie, des données sortent sans téléchargement : il suffit de rendre publiques les heures de prise de vue (`heures_visibles_en_masse`) ou les EXIF complètes (`exif_complet`), ou qu'une galerie privée parte dans le cache public de Cloudflare (`bordure_cache_prive`). Ces règles portent l'étiquette « collection ». Leur phase est **exfiltration**, par un champ explicite.
- **Créer des accès de galerie en masse ouvre des portes de sortie** (`acces_crees_en_masse`). Chaque accès est un canal de téléchargement : c'est de l'**exfiltration** préparée, et non de la collecte.
- **Une charge posée dans un billet relève de l'ancrage** (`billet_construction_active`, T1189 et T1059.007). Elle vise les visiteurs plus tard. Ce n'est pas un impact immédiat.
- **Quatre règles marquent un changement fait après une session reprise ailleurs** : `acces_apres_session_reprise`, `billet_apres_session_reprise`, `reglage_apres_session_reprise` et `acces_debloque_apres_suspension`. Elles relèvent de l'**ancrage**, car l'attaquant s'installe. Leur technique T1078 les classerait à tort en « accès », d'où un champ explicite.
- **Le déni de service ne fait pas progresser une attaque.** Saturer le formulaire de contact ne demande aucun accès. Le marqueur « disponibilité » compte dans l'enjeu, jamais dans la progression : sans cela, un simple afflux de pourriels « atteindrait l'impact ».
- **Deux pistes ont leurs propres jalons d'accès.** Pour la piste **invité**, l'accès hostile est un lien de galerie qui fuit : réseaux ou pays multiples, nouvel appareil puis siphonage. Pour la piste **serveur**, l'accès est une exécution réussie : `reseau_chaine_attaque`, ou une sortie réseau qui suit une tentative d'injection.

### 4.3 Jalons et indices

Une connexion réussie est un **fait d'accès**. La question n'est pas de savoir s'il y a eu accès (il y en a eu), mais **à qui il appartient**. Les indices y répondent, sans faire avancer l'attaque d'une phase.

| Indice | Source | Points de confiance | D'où il vient |
|---|---|---|---|
| Heure jamais utilisée par le compte (28 jours) | site | 1 | détecteur `heure_inhabituelle` (DS18) |
| Pays jamais vu (90 jours) | site | 1,5 | détecteur `premiere_apparition` (DS4), `nouveau` contient le pays |
| Appareil jamais vu (90 jours) | site | 1,5 | même détecteur, `nouveau` contient « appareil » ; les deux se cumulent (3) |
| Nouvel opérateur réseau | bordure | 1 | `bordure_nouvel_operateur` (DS4) |
| Adresse sur une liste de menaces | listes | 1 à 2 (barème des listes) | `vigie/menaces.js` |
| Trois réseaux ou plus pour un compte en 24 h | site | 1,5 | **à créer** (règle `value_count`, PR E) |
| Réseau ou navigateur changé en cours de session (un des deux) | site | 2 | `session_context_change` « moyen » |
| Empreinte TLS changée en cours de session | bordure | 1 | observée aujourd'hui, à compter quand elle sera jugée stable (NC3) |
| Voyage impossible (> 500 km, > 900 km/h) | site, Zitadel | 3 | détecteur `voyage_impossible` (DS3) |
| Échecs puis connexion | site, Zitadel | 3 | détecteur `pivot_identifiants` (DS25) |

**Preuves** : ces signaux suffisent seuls à rendre la confiance forte, car un utilisateur légitime ne les produit pas :

- `cookie_rejoue` (DS1) ;
- `session_autre_appareil` « haut » (DS2) ;
- `ecritures_sans_identite` (DS2) ;
- `role_hors_application` (DS8) ;
- le détecteur `role_incoherent` (DS10) ;
- `acces_pays_multiples` (DS3, galeries).

**Contre-indices** :

| Contre-indice | Effet |
|---|---|
| Appareil habituel : empreinte vue sur ce compte depuis plus de 14 jours | −1 point. Poids faible et jamais opposé à une preuve : l'empreinte est faite d'en-têtes que le navigateur annonce, un attaquant peut les imiter |
| Identité confirmée par le second facteur **après** le dernier indice (`authn_reauth_success`, réponse `verifier_identite` déjà en place) | −3 points ; confiance plafonnée à « faible » tant qu'aucun nouvel indice n'arrive |
| Adresse de confiance (réglage existant, avec durée) | Les indices liés à cette adresse ne comptent pas |
| Dossier classé « légitime » par l'analyste | Les indices identiques (même pays, même appareil) ne comptent plus pour ce compte pendant 90 jours (D39) |

### 4.4 La confiance

Elle se calcule **par accès** (une session, ou un accès de galerie) puis remonte au dossier, qui prend la plus forte.

| Confiance | Condition |
|---|---|
| Aucune | Seulement des faits |
| Faible | Moins de 2 points d'indices (contre-indices déduits) |
| Moyenne | De 2 à 4,4 points ; ou indices venus de deux sources distinctes (site et bordure, site et Zitadel) |
| Forte | 4,5 points ou plus ; ou une preuve |

Deux règles de plus :

- **Une suite compte comme un indice.** Trois phases ou plus dans l'ordre, dont l'accès, montent la confiance d'un cran (section 4.8).
- **La confiance ne baisse jamais toute seule avec le temps** dans un dossier ouvert. Seul un contre-indice la fait baisser. À l'inverse, le score d'entité actuel perd la moitié de sa valeur chaque heure.

### 4.5 Comment une règle reçoit sa phase

L'ordre de priorité est le suivant, et le premier qui répond l'emporte :

1. **Le champ explicite** de la règle : `vigie: { phase: exfiltration }`, ou `nature: indice`. Il sert quand la technique trompe : 20 règles sur 88 (section 4.7).
2. **La table des techniques** (`vigie/phases.js`, à créer). La technique est plus précise que la tactique : T1078 veut dire « accès réussi », T1110 « tentative ». C'est elle qui sépare l'échec de la réussite.
3. **La table des tactiques**, en dernier recours.
4. **Plusieurs phases trouvées** : on retient la plus avancée. Exemple : `exports_nombreux`, étiquetée collection et exfiltration, est une exfiltration. Les marqueurs dissimulation et disponibilité s'ajoutent sans compter dans la progression. Par exemple, `messages_effaces_en_masse` est un impact, avec le marqueur dissimulation (T1070).

Table des techniques proposée :

| Techniques | Phase |
|---|---|
| T1595 (et sous-techniques) | 1 repérage |
| T1110 (et sous-techniques), T1190, T1185, T1204, T1036 | 2 tentative |
| T1078, T1539, T1550.004 | 3 accès |
| T1087, T1046 | 4 exploration |
| T1098, T1556, T1068, T1105, T1071, T1568, T1095, T1189, T1059 | 5 ancrage |
| T1213, T1119, T1005 | 6 collecte |
| T1530, T1041, T1048 | 7 exfiltration |
| T1485, T1491, T1566 | 8 impact |
| T1562, T1070 | marqueur dissimulation |
| T1498, T1499 | marqueur disponibilité |

Un **test bloquant** vérifie que chaque règle qui émet un signal, et chaque détecteur, reçoit une phase ou une nature. Une règle ajoutée sans classement fait échouer `npm run test:vigie`, comme le registre des briques l'exige déjà pour les permissions surveillées.

Les détecteurs portent leur phase dans `DETECTEURS` (`vigie/detecteurs.js:12`) : la même source sert au moteur et à l'écran des réglages.

| Détecteur | Phase ou nature |
|---|---|
| `premiere_apparition`, `heure_inhabituelle` | indice |
| `voyage_impossible`, `pivot_identifiants` | indice fort ; `pivot_identifiants` est aussi le jalon d'accès de la piste identité |
| `vitesse` | 6 collecte |
| `role_incoherent` | 5 ancrage (preuve) |
| `exploration_lente` | 1 repérage |
| `menaces` | indice (sur l'adresse) |
| `silence` | marqueur dissimulation |
| `chaine_attaque` | remplacé par la cohérence du dossier (4.8) |

### 4.6 Quand une lecture ordinaire devient un jalon

C'est le point de départ de la demande. Un fait de lecture ou d'export **porté par un accès de confiance moyenne ou forte** devient un jalon :

| Fait | Accès sain (confiance faible ou nulle) | Accès douteux (confiance moyenne) | Accès hostile (confiance forte) |
|---|---|---|---|
| `sensitive_read` (fiche, message, accès d'invité) | fait, dans la frise | jalon de collecte à partir de **8 fiches distinctes** dans la session | jalon de collecte **dès la première** |
| `sensitive_export` | fait (règle `exports_nombreux` inchangée) | jalon d'exfiltration **dès le premier** | jalon d'exfiltration dès le premier |
| `sensitive_delete` | fait | jalon d'impact à partir de 3 | jalon d'impact dès le premier |

Le seuil général de `lectures_massives` (30 fiches en 1 h) ne change pas : il reste la protection quand aucun indice n'existe. Les seuils sous accès douteux (8 fiches et 3 suppressions) sont des valeurs de départ, à recaler avec `vigie/banc.js` après un mois d'observation.

### 4.7 Classement des règles actuelles

Résultat de l'algorithme de la section 4.5 sur les 88 règles qui émettent un signal à ea0528b. Les règles marquées (e) reçoivent un champ explicite.

| Phase | Nombre | Règles |
|---|---|---|
| 1 Repérage | 4 | `connexion_test`, `scanner`, `piege`, `bordure_erreurs` |
| 2 Tentative | 18 | `saisie_compte_admin` (e), `fichier_piege`, `comptes_en_attente_rafale` (e), `oidc_echecs_repetes`, `csrf_repetes`, `cible_commune`, `valeurs_impossibles_repetees`, `enumeration_jetons`, `zitadel_echecs_repetes`, `rafale_erreurs`, `bordure_entetes_faux`, `galerie_echecs_adresse`, `galerie_essais_repartis`, `galerie_suspendue`, `acces_apres_revocation` (e), `csrf_repetes_invite`, `console_refus` (e), `console_refus_repetes` |
| 3 Accès | 7 | `cookie_rejoue`, `session_autre_appareil`, `ecritures_sans_identite` (e), `acces_reseaux_multiples`, `acces_groupe_reseaux_multiples`, `acces_pays_multiples`, `acces_groupe_pays_multiples` |
| Indice | 1 | `bordure_nouvel_operateur` (e) |
| 4 Exploration | 4 | `exploration_droits`, `reseau_flux_site`, `reseau_flux_repetes`, `ecriture_hors_portee` (e) |
| 5 Ancrage | 17 | `role_hors_application`, `administrateur_donne`, `zitadel_critique`, `controle_roles`, `zitadel_facteur`, `zitadel_droits`, `zitadel_politique`, `reseau_sorties_variees`, `reseau_chaine_attaque`, `reglage_apres_session_reprise` (e), `acces_debloque_apres_suspension` (e), `acces_apres_session_reprise` (e), `acces_longue_echeance`, `billet_construction_active`, `billet_apres_session_reprise` (e), `console_arrivee`, `console_droits` |
| 6 Collecte | 3 | `aspiration_distribuee`, `lectures_massives`, `bordure_rafale` |
| 7 Exfiltration | 9 | `exports_nombreux`, `bordure_cache_prive` (e), `reseau_sortie_refusee`, `reseau_sortie_directe`, `exif_complet` (e), `heures_visibles_en_masse` (e), `telechargements_en_masse`, `acces_nouvel_appareil_puis_siphonage`, `acces_crees_en_masse` (e) |
| 8 Impact | 7 | `restauration`, `messages_effaces_en_masse` (e), `contact_public_change`, `texte_public_contact` (e), `textes_publics_geste_massif`, `textes_publics_en_serie`, `billets_modifies_en_masse` |
| Dissimulation | 13 | `integrite_comptes`, `chaine_rompue`, `configuration` (e), `dechiffrement` (e), `ingestion_refusee`, `trou_zitadel`, `moteur_sature` (e), `controle_roles_degrade`, `regle_lente` (e), `canal_echec`, `surveillance_reduite`, `bordure_muette`, `reseau_muet` |
| Disponibilité | 5 | `messages_satures`, `zitadel_quota`, `mode_urgence`, `galerie_scrypt_sature`, `console_indisponible` |

Ce que le classement révèle :

- **La collecte est la phase la plus mince** : 3 règles et un détecteur. C'est le manque de départ (lectures de données personnelles). La section 4.6 et la PR E le comblent.
- **`dechiffrement`** (une valeur chiffrée altérée, étiquetée T1005, collecte) relève de la dissimulation : quelqu'un a écrit dans la base sans passer par le site. La phase vient donc d'un champ explicite.
- **`configuration`** (DS9, protections changées) relève aussi de la dissimulation, pas de l'impact : c'est l'attaquant qui baisse la garde.
- **Les six règles qui n'ont qu'une technique** reçoivent une phase par la table des techniques. Il n'est pas nécessaire de les réécrire, mais on leur ajoutera la tactique, par cohérence.

### 4.8 Progression et cohérence

- **Progression** : la phase la plus avancée parmi les jalons du dossier (de 1 à 8). Les indices et les marqueurs n'y comptent pas.
- **Cohérence** : le nombre de phases qui se suivent **dans l'ordre du temps**. Pour chaque phase, on prend son premier jalon, puis on cherche la plus longue suite croissante. Elle s'affiche en clair, par exemple : « Repérage → Tentative → Accès → Collecte, 4 phases dans l'ordre ».
- **Trois phases ou plus dans l'ordre, dont l'accès**, montent la confiance d'un cran et ouvrent l'alerte `chaine_attaque` (DS23). Cette alerte est désormais calculée sur le dossier, donc d'une entité à l'autre, en base, sans perte au redémarrage.
- **Une phase avancée sans les précédentes** signale le plus souvent un usage légitime. Exemple : de la collecte sans aucun indice d'accès, c'est un photographe qui trie ses fiches. La grille de gravité en tient compte par la confiance : collecte avec confiance faible = « bas ».
- **Les phases manquantes sont dites, pas inventées.** Une exfiltration avec un accès hostile mais sans repérage vu s'affiche « repérage non observé ». L'analyste sait alors où chercher, par exemple dans les journaux de Cloudflare.

### 4.9 Fenêtres de temps par phase

| Phase | Rattachée au dossier si elle survient… | Pourquoi |
|---|---|---|
| Repérage | dans les 7 jours avant le premier accès, sur une adresse ou un réseau liés | L'exploration lente dure jusqu'à 72 h (DS15) ; un repérage précède souvent l'attaque de quelques jours |
| Tentative | dans les 24 h avant l'accès, sur le compte visé ou une adresse liée | Bourrage d'identifiants puis réussite (DS25 : 6 h ; marge) |
| Indices | au moment de l'accès et pendant toute la session | Ils qualifient cet accès-là |
| Exploration, ancrage, collecte | pendant la session douteuse, et 24 h après sur le même compte | Un attaquant revient souvent avec une session neuve |
| Exfiltration, impact | jusqu'à 72 h après le dernier jalon | Export différé, défiguration programmée (publication à date) |
| Dissimulation | tant que le dossier est ouvert | Aveugler la Vigie pendant une attaque l'aggrave, quel que soit le moment |

---

## 5. Artefacts, liens et extension du dossier

### 5.1 Entités

Aux entités du moteur (`ip`, `reseau`, `compte`, `session`, `appareil`), le dossier ajoute :

- **`acces`** : l'accès d'une galerie privée. Il existe déjà dans les règles, sous la forme `site:acces:N`.
- **`objet`** : la fiche, le message ou la galerie lus. La clé suit le format `personne:12` ou `message:40`, tirée du champ `detail.objet` et `detail.id` que le site émet déjà (BV-24, BV-30).
- **`cible`** : ce qui est visé sans être une donnée lue, comme un réglage public, un billet, un compte dont on change les droits (`detail.compte`) ou la Vigie elle-même (entités `site:*` et `vigie:*` actuelles).

L'objet est ce qui relie le dossier au RGPD. Depuis une fiche, on voit qui l'a lue, depuis quelle session et dans quel dossier. C'est ce qu'il faut pour délimiter une violation à notifier (section 10.3).

### 5.2 Force des liens

| Lien | Force | Suivi pour étendre le dossier |
|---|---|---|
| session → compte | fort | toujours |
| session → appareil | fort | toujours |
| accès de galerie → session d'invité | fort | toujours |
| session → adresse IP (l'adresse de la session à ce moment) | moyen | oui, dans la fenêtre de la phase (4.9) |
| compte → adresse IP (toute adresse déjà utilisée) | faible | un saut, 72 h, avec les exclusions ci-dessous |
| adresse IP → réseau | faible | jamais pour étendre ; sert à grouper l'affichage |
| acteur → objet ou cible | dirigé | jamais traversé : la cible est une feuille |
| compte → conteneur (piste serveur) | — | pas de lien : la piste serveur se relie par le temps (4.9), pas par l'identité |

**Exclusions** : un lien faible ne s'étend jamais à travers :

- une adresse privée ;
- une adresse de confiance ;
- une adresse vue avec un administrateur dans les 30 jours, selon la règle déjà appliquée aux blocages automatiques (`vigie/moteur.js`, `respond`) ;
- un réseau qui porte plus de 5 comptes distincts en 30 jours (CGNAT d'opérateur mobile, wifi public).

**Plafonds** : 40 entités par dossier, 2 sauts au plus depuis la graine, 200 jalons. Au-delà, le dossier le dit (« dossier tronqué ») et l'analyste étend à la main.

### 5.3 Ouverture

Un dossier s'ouvre sur :

1. **une alerte**, quelle qu'elle soit, ouverte par le moteur actuel (`raise`). Les alertes, leurs modes et leurs notifications ne changent pas ;
2. **un jalon de phase 3 ou plus avec une confiance moyenne ou plus**, même si aucune règle n'alerte ;
3. **le franchissement du seuil d'une entité** (`entite.score`), qui ouvre déjà une alerte.

**Un indice seul n'ouvre jamais de dossier, ni plusieurs indices sans jalon** (D33). Sinon chaque voyage ou chaque nuit blanche ouvrirait un dossier.

**Graine** : l'entité de l'alerte, ou l'accès qui porte le jalon. La piste se déduit de la graine : compte ou session → identité ; `acces` → invité ; `site:sortie`, `conteneur:*` → serveur ; `ip` ou `reseau` sans accès → externe ; `vigie:*` → surveillance.

### 5.4 Rattachement

À chaque signal (jalon, indice, contre-indice) et à chaque fait sur une entité suivie :

1. **On cherche les dossiers ouverts** qui contiennent l'une de ses entités, par un index sur `(kind, key)`.
2. **S'il y en a un**, le signal s'y rattache. Ses entités nouvelles entrent si leur lien est fort ou moyen.
3. **S'il y en a plusieurs** reliés par un lien fort ou moyen, ils **fusionnent** : le plus ancien garde son numéro, l'autre pointe vers lui (`fusionne_dans`). La fusion est notée dans la chaîne. Des dossiers reliés seulement par un lien faible ne fusionnent pas : ils s'affichent comme **voisins**.
4. **Aucun** : le signal reste hors dossier, comme aujourd'hui.

### 5.5 Rattachement rétroactif

À l'ouverture, puis chaque fois qu'une entité entre, la Vigie remonte le temps sur cette entité, dans les fenêtres de la section 4.9. Elle rattache les indices de la connexion, les tentatives et le repérage des adresses liées, et les faits de la session.

C'est ce qui reconstitue la partie gauche de l'attaque. Une alerte « lectures massives » sur un compte retrouve ainsi :

- la connexion de 9 h depuis un appareil inconnu ;
- les trois échecs qui l'ont précédée ;
- le scan de la veille depuis la même adresse.

Requêtes bornées : `LIMIT`, fenêtres datées, index existants sur `sub`, `ip` et `ip_net`. Il faut **ajouter un index sur `events (session, recu_a)`**, qui n'existe pas aujourd'hui.

### 5.6 Cycle de vie

| Statut | Passage |
|---|---|
| Ouvert | à l'ouverture ; revient à « ouvert » sur tout nouveau jalon |
| En cours | l'analyste le prend en charge |
| En sommeil | 72 h sans nouveau jalon |
| Clos | 14 jours en sommeil, ou clôture par l'analyste avec un classement : incident, faux positif, test, légitime |
| Récidive | un jalon sur une entité d'un dossier clos depuis moins de 30 jours rouvre **ce dossier** (même numéro) et le marque « récidive » |

L'analyste peut **détacher** une entité, avec un motif obligatoire. Elle ne revient pas par le même lien. Il peut aussi **scinder** un dossier en deux et **rattacher à la main** une entité ou un dossier voisin. Chaque geste est noté dans la chaîne (`vigie_dossier`), comme les décisions.

---

## 6. Gravité

### 6.1 Enjeu

| Enjeu | Condition |
|---|---|
| Ordinaire | Rien de personnel ni de privilégié : pages publiques, refus, réglages sans effet visible |
| Personnel | Moins de 10 objets personnels lus ou exportés, ou un accès de galerie touché |
| Sensible | 10 objets personnels ou plus ; ou une catégorie particulière (personne mineure et nom du parent, signature d'accord, lieu précis d'une rencontre) ; ou un export de données personnelles ; ou des droits d'administrateur en jeu |
| Critique | Données personnelles sorties sous un accès douteux (jalon d'exfiltration sur des objets personnels, confiance moyenne ou forte) ; face publique changée (adresse de contact, textes, billets : les visiteurs sont visés) ; administrateur donné hors de l'application ; Vigie aveuglée pendant le dossier |

Avant la PR E, l'enjeu se lit sur `detail.objet` (personne, rencontre, message, accès), ce qui est grossier mais juste. La PR E ajoute les catégories (identité, coordonnées, image d'une personne, mineur, accord signé, localisation, message libre) et rend la grille fine.

### 6.2 Grille

Progression (en ligne) × confiance (en colonne) :

| Progression | Confiance faible | Confiance moyenne | Confiance forte |
|---|---|---|---|
| Approche (1, 2) | info | bas | moyen |
| Entrée (3, 4) | bas | moyen | haut |
| Installation et collecte (5, 6) | bas | haut | critique |
| Sortie et impact (7, 8) | moyen | haut | critique |

Modificateurs, appliqués dans l'ordre, sans dépasser « critique » :

1. **enjeu ordinaire** : −1 cran (jamais sous « info ») ; **personnel** et **sensible** : rien ; **critique** : +1 cran. L'enjeu sensible ne change pas le niveau : il change l'ordre de la liste et le texte de la notification. Sinon un photographe qui lit dix fiches depuis un nouvel appareil passerait directement en « critique » (scénario 7.2) ;
2. **dissimulation pendant le dossier** : +1 cran ;
3. **plancher** : jamais en dessous de la plus grave des alertes du dossier. Une preuve à source unique garde la gravité de sa règle.

Pour le **tri**, on utilise le rang de la gravité, puis la progression, la confiance, et enfin la date du dernier jalon. Il n'y a pas de score affiché : le score d'entité reste sur la fiche de l'entité.

### 6.3 Explication

Chaque dossier porte une explication de trois lignes, recalculée à chaque changement et gardée en JSON pour la console et les notifications :

> **Haut** · Collecte atteinte, 4 phases dans l'ordre (repérage → tentative → accès → collecte)
> Confiance moyenne : appareil inconnu, pays inédit, nouvel opérateur (2 sources)
> Enjeu sensible : 34 fiches de personnes lues en 52 min, dont 3 de personnes mineures

---

## 7. Scénarios déroulés

Les adresses viennent des plages réservées à la documentation. Les heures sont celles de Paris.

### 7.1 Vol de session d'un photographe, lectures puis export (piste identité)

| Heure | Événement | Phase ou nature | Entités | Effet sur le dossier |
|---|---|---|---|---|
| J-1 22:10 | `scanner` depuis 203.0.113.7 | repérage | ip 203.0.113.7 | hors dossier (externe, pas d'alerte de dossier) |
| 08:52 | 3 × `authn_login_fail` sur le compte A, même adresse | fait de tentative | compte A, ip | hors dossier |
| 08:55 | connexion réussie du compte A, nouvel appareil, pays NL | fait d'accès + indices 3 (pays 1,5, appareil 1,5) | session s1, appareil, ip | hors dossier (indices seuls) |
| 08:55 | `pivot_identifiants` | indice 3 → confiance **forte** (6) | compte A | **ouverture** (jalon d'accès, confiance forte) : dossier n° 12, graine session s1. Rétroactif : 3 échecs (tentative), scan de la veille (repérage, lien faible ip, hors exclusions) |
| 09:03 | 9 `sensitive_read` de fiches distinctes | collecte (4.6) | objets personne:… | progression 6, cohérence 4 ; enjeu personnel |
| 09:40 | 34e fiche ; `lectures_massives` à la 30e | collecte | | enjeu **sensible** |
| 09:47 | `sensitive_export` de `/admin/personnes/:id/export.zip` | exfiltration | objet | progression 7 ; enjeu **critique** (données sorties) |

Gravité : Sortie × forte = critique. Explication : « Exfiltration atteinte, 5 phases dans l'ordre · confiance forte (échecs puis connexion, appareil et pays inédits) · enjeu critique (export de données personnelles, 34 fiches lues) ».

Aujourd'hui, ce scénario donne `pivot_identifiants` (points), `lectures_massives` (points) et `exports_nombreux` (seulement au 4e export). Il faut que les points s'additionnent dans l'heure, et que deux sources contribuent, pour qu'une alerte de score s'ouvre. Rien ne relie le scan de la veille.

### 7.2 Photographe en voyage qui trie ses fiches (faux positif attendu)

**Avec son ordinateur habituel.** Le compte B se connecte à 02:14 depuis le Japon et lit 12 fiches.

| Élément | Points |
|---|---|
| Pays inédit | 1,5 |
| Heure inhabituelle | 1 |
| Appareil habituel (contre-indice) | −1 |
| **Total** | **1,5 → confiance faible** |

Les 12 lectures restent des faits : aucun dossier, aucune alerte (`lectures_massives` demande 30 fiches). C'est le résultat voulu.

**Avec un téléphone acheté sur place.**

| Heure | Événement | Phase ou nature | Effet |
|---|---|---|---|
| 02:14 | Connexion depuis le Japon, appareil inédit | indices : pays 1,5, appareil 1,5, heure 1 → **moyenne** (4) | hors dossier (pas de jalon) |
| 02:20 | 8e fiche distincte lue | collecte sous accès douteux (4.6) | **ouverture** : dossier n° 13 ; Installation et collecte × moyenne = **haut** |
| 02:31 | 12e fiche | collecte | enjeu sensible (10 fiches ou plus) : le niveau ne change pas (6.2), le dossier monte dans la liste |
| 02:40 | Identité confirmée par le second facteur (vérification demandée par une réponse, D37, ou par l'analyste) | contre-indice −3 → **faible** (1) | Installation et collecte × faible = **bas** |

L'analyste classe « légitime » : le Japon et ce téléphone ne comptent plus comme inédits pour ce compte pendant 90 jours (D39).

Ce scénario montre l'intérêt de la confiance et des contre-indices. Sans eux, 12 fiches lues de nuit depuis l'étranger ressemblent au 7.1. Avec eux, le dossier s'ouvre, se résout en quelques minutes et apprend.

### 7.3 Bourrage d'identifiants puis ancrage dans Zitadel (piste identité)

| Heure | Événement | Phase ou nature |
|---|---|---|
| 14:00 | `cible_commune` : 40 adresses essaient le compte C | tentative (graine ip, piste externe) |
| 14:35 | `zitadel_echecs_repetes` puis connexion | tentative, puis `pivot_identifiants` : confiance forte ; **la piste devient identité** |
| 14:37 | `zitadel_facteur` : un second facteur ajouté | ancrage |
| 14:39 | `zitadel_droits` puis `administrateur_donne` | ancrage ; enjeu critique |
| 14:41 | `surveillance_reduite` (seuil relevé depuis la console) | dissimulation : +1 cran |

Gravité : critique dès 14:39. Le marqueur de 14:41 dit à l'analyste que l'attaquant a aussi touché la Vigie, ce qui oriente la réponse vers les droits de la console.

### 7.4 Lien de galerie privée qui fuit (piste invité)

| Heure | Événement | Phase |
|---|---|---|
| J 10:00 | `galerie_entree` de l'invitée, appareil 1 | fait |
| J+2 18:00 | `galerie_nouvel_appareil` depuis un autre pays | fait d'accès, indice |
| J+2 18:04 | `acces_pays_multiples` | accès (preuve) → **ouverture**, graine `acces:41` |
| J+2 18:20 | `telechargements_en_masse` puis `acces_nouvel_appareil_puis_siphonage` | exfiltration |

Gravité : Sortie × forte = critique, enjeu personnel (une galerie) → critique. Réponse déjà prévue : `suspendre_acces`.

### 7.5 Compromission du serveur (piste serveur)

| Heure | Événement | Phase |
|---|---|---|
| 03:10 | `valeurs_impossibles_repetees` depuis 198.51.100.4 | tentative |
| 03:12 | `fichier_piege` (envoi refusé) | tentative |
| 03:20 | `reseau_sortie_refusee` depuis le conteneur du site | exfiltration (et contrôle à distance) |
| 03:20 | `reseau_chaine_attaque` (tentative puis sortie, déjà corrélées) | ancrage → **ouverture** |
| 03:25 | `reseau_sortie_directe` | exfiltration |
| 03:30 | `chaine_rompue` | dissimulation |

La piste serveur se relie **par le temps** : la tentative depuis une adresse et la sortie d'un conteneur n'ont aucune entité commune. Le rattachement se fait dans la fenêtre que la règle `reseau_chaine_attaque` utilise déjà. Gravité : critique.

---

## 8. Représentation dans la console

Maquettes à faire, en une seule passe de contrôle : MV-12 « Dossiers » et MV-13 « Un dossier ».

### 8.1 Liste des dossiers

- **Une ligne par dossier** : gravité (pastille et mot), titre généré, barre de progression en 8 cases avec la phase atteinte et les cases vues en ordre, confiance, enjeu, nombre d'entités, dernière activité, statut.
  - Titre généré : « Compte A : accès douteux → collecte (34 fiches) ».
- **Filtres** : statut, piste, gravité, phase atteinte.
- **Tri** par défaut, comme en 6.2.
- **Vue d'ensemble** (MV-01) : le nombre de dossiers ouverts par gravité remplace, ou complète, celui des alertes (D36).

### 8.2 Un dossier

1. **En-tête** : l'explication de 6.3, les décisions possibles (vérifier l'identité, révoquer, bloquer, suspendre l'accès), statut et classement.
2. **Frise en couloirs** :
   - les couloirs, de haut en bas : les 8 phases, puis Indices, Dissimulation et Faits (gris, repliés par défaut) ;
   - l'axe du temps en abscisse, avec zoom de l'heure à 7 jours ;
   - un repère par signal, dont la forme dit la nature (jalon, indice, contre-indice, preuve) et la couleur la gravité ;
   - un trait entre les premiers jalons des phases cohérentes, pour faire apparaître la chaîne ;
   - un clic sur un repère montre son détail et éclaire ses entités dans le graphe.
3. **Graphe des entités** :
   - acteurs à gauche (adresse, réseau, appareil), session et compte au centre, cibles à droite (objets regroupés par nature : « 34 fiches de personnes ») ;
   - chaque trait porte sa force (plein, tirets, pointillés) ;
   - les dossiers voisins apparaissent en satellites.
4. **Exploration** :
   - un clic sur une entité ouvre sa fiche (MV-04 existante), qui reçoit une section « Dossiers » ;
   - un clic sur un satellite ouvre l'autre dossier ;
   - un clic sur un objet ouvre « qui l'a lu » (périmètre, 10.3).
5. **Signaux** en tableau (équivalent de la frise), **entités** en tableau (équivalent du graphe), **journal du dossier** (ouverture, rattachements, fusions, gestes de l'analyste).

**Accessibilité** : la frise et le graphe ont chacun un tableau équivalent, se parcourent au clavier et ne codent jamais une information par la seule couleur. **Téléphone** : la frise devient verticale (une phase par bloc) et le graphe se replie en liste par rôle.

---

## 9. Modèle de données (Vigie, migration à créer)

```sql
CREATE TABLE dossiers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  piste         TEXT NOT NULL CHECK (piste IN ('identite', 'invite', 'serveur', 'externe', 'surveillance')),
  graine_kind   TEXT NOT NULL,
  graine_key    TEXT NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'sommeil', 'clos')),
  classement    TEXT CHECK (classement IN ('incident', 'faux_positif', 'test', 'legitime')),
  recidive      INTEGER NOT NULL DEFAULT 0,
  phase_max     INTEGER,                   -- 1 à 8, NULL tant qu'aucun jalon
  coherence     INTEGER NOT NULL DEFAULT 0,
  confiance     TEXT NOT NULL DEFAULT 'aucune' CHECK (confiance IN ('aucune', 'faible', 'moyenne', 'forte')),
  enjeu         TEXT NOT NULL DEFAULT 'ordinaire' CHECK (enjeu IN ('ordinaire', 'personnel', 'sensible', 'critique')),
  gravite       TEXT NOT NULL,
  dissimulation INTEGER NOT NULL DEFAULT 0,
  explication   TEXT NOT NULL DEFAULT '{}', -- JSON : les trois lignes et leurs éléments
  tronque       INTEGER NOT NULL DEFAULT 0,
  fusionne_dans INTEGER REFERENCES dossiers(id),
  ouvert_a      INTEGER NOT NULL,
  derniere      INTEGER NOT NULL,
  note          TEXT
);
CREATE INDEX dossiers_actifs ON dossiers (statut, derniere) WHERE fusionne_dans IS NULL;

CREATE TABLE dossier_entites (
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                -- ip, reseau, appareil, session, compte, acces, objet, cible
  key        TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('acteur', 'cible', 'contexte')),
  force      TEXT NOT NULL CHECK (force IN ('graine', 'fort', 'moyen', 'faible', 'manuel')),
  via        TEXT,                         -- « kind:key » de l'entité par laquelle elle est entrée
  ajoute_a   INTEGER NOT NULL,
  detache_a  INTEGER,                      -- détachée par l'analyste (ne revient pas par ce lien)
  PRIMARY KEY (dossier_id, kind, key)
);
CREATE INDEX dossier_entites_cle ON dossier_entites (kind, key) WHERE detache_a IS NULL;

CREATE TABLE dossier_signaux (
  dossier_id  INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,            -- événement (fait) ou vigie_signal (jalon, indice)
  survenu_a   INTEGER NOT NULL,
  nature      TEXT NOT NULL CHECK (nature IN ('jalon', 'indice', 'preuve', 'contre_indice', 'fait', 'dissimulation', 'disponibilite')),
  phase       INTEGER,                     -- 1 à 8 pour un jalon ou un fait qualifié
  regle       TEXT,
  points      REAL,                        -- points de confiance d'un indice
  entite_kind TEXT,
  entite_key  TEXT,
  alerte_id   INTEGER REFERENCES alerts(id),
  PRIMARY KEY (dossier_id, seq)
);
CREATE INDEX dossier_signaux_temps ON dossier_signaux (dossier_id, survenu_a);

ALTER TABLE alerts ADD COLUMN dossier_id INTEGER REFERENCES dossiers(id);
CREATE INDEX events_session ON events (session, recu_a);
```

Les gestes sur un dossier sont des événements chaînés `vigie_dossier` (ouverture, rattachement, fusion, aggravation, détachement, scission, classement). Le dossier se reconstruit à partir de la chaîne, comme les alertes.

`vigie_signal` porte désormais `phase` et `nature` dans son détail. Le dédoublonnage des signaux (une note par règle, par entité et par 10 minutes) ne change pas. Le dossier référence la note ; les points continuent de tous compter.

---

## 10. Coût, sécurité, RGPD

### 10.1 Coût et capacité

- **Pour chaque signal** : une recherche indexée de ses entités dans `dossier_entites`. Le coût est négligeable devant les règles Sigma.
- **À l'ouverture et à l'entrée d'une entité** : un parcours borné (2 sauts, 40 entités) et des requêtes rétroactives datées, avec `LIMIT`.
- **Abaques** ([`vigie-capacite.md`](vigie-capacite.md)) : à refaire avec `vigie/banc.js`, en ajoutant un banc de dossiers. Les cinq scénarios de la section 7 deviennent des tests, rejoués 1 000 fois pour mesurer.
- **Pas de mémoire non bornée** : l'état est en base. La chaîne d'attaque en mémoire (`createChains`, LRU de 50 000) disparaît.

### 10.2 Sécurité

- **Titres et détails générés à partir de champs choisis par l'attaquant** (navigateur, chemins, noms de fichiers) : longueur bornée, échappement à l'affichage (la console rend par Eta avec échappement), jamais de HTML construit à la main.
- **Gonfler un dossier exprès**, en se connectant depuis des centaines d'adresses : les plafonds (5.2) et la troncature affichée le contiennent. Le dossier reste lisible, et la troncature est elle-même un signal.
- **Se cacher dans le dossier d'un autre**, en se connectant depuis l'adresse de l'administrateur : les liens faibles ne passent pas par ces adresses, donc l'attaquant garde son propre dossier, ancré sur sa session.
- **Faire fusionner deux dossiers pour en diluer un** : une fusion n'abaisse jamais une gravité (plancher, 6.2). L'analyste peut scinder.
- **Les gestes de l'analyste sont chaînés.** Classer « légitime » efface des indices futurs (D39) : ce geste demande un motif et reste borné à 90 jours.

### 10.3 RGPD

- **La surveillance est elle-même un traitement.** Les dossiers contiennent les adresses, les empreintes et les habitudes des comptes de l'équipe. La Vigie est déjà absente des textes du dossier légal du 18 octobre ; il faut l'y ajouter (registre des traitements, base légale : intérêt légitime à sécuriser le site, durée de conservation).
- **Minimisation** : un dossier contient des clés (adresse, `sub`, `personne:12`), jamais le contenu d'une fiche ni un nom. La Vigie ne voit jamais le nom d'une personne photographiée. Les photographes retrouvent les fiches dans l'admin à partir des numéros.
- **Périmètre d'une violation** (articles 33 et 34) : depuis un dossier classé « incident », un export liste :
  - les objets touchés, par catégorie ;
  - la période ;
  - les comptes et sessions en cause ;
  - les phases atteintes (lu, exporté, publié).

  Il sert à juger s'il faut notifier la CNIL sous 72 h, puis prévenir les personnes.
- **Conservation** : celle des événements (183 jours, `retentionDays`), sauf les dossiers classés « incident », gardés sans les adresses complètes pour le registre des violations (article 33.5) (D38).

---

## 11. Impact sur le site et sur la Vigie

| PR | Site | Vigie |
|---|---|---|
| A, B, C, D | rien : aucune route, aucun événement nouveau | phases sur les règles et les détecteurs, migration des dossiers, console |
| E | catégories des objets dans `detail` (`categorie`), lectures des listes (`/admin/personnes`, `/admin/rencontres`, planche des cartes, `/admin/comptes`), compteur de déchiffrements par requête (`server/vault.js`), octets servis par route classée | règle « trois réseaux ou plus pour un compte », enjeu par catégorie, seuils sous accès douteux recalés |

Registre des briques : la PR E proposera **BV-31** (catégories de données personnelles lues ou exportées, et volume par session), rattaché à DS18.

---

## 12. Plan

| PR | Contenu | Taille |
|---|---|---|
| **A. Phases** | `vigie/phases.js` (tables des techniques et des tactiques) ; champs `phase` et `nature` dans le bloc `vigie` des règles (20 règles) ; phases des détecteurs dans `DETECTEURS` ; tactique ajoutée aux 6 règles qui n'ont qu'une technique ; test bloquant ; `vigie_signal` porte la phase ; la console montre la phase sur une alerte et un signal | petite |
| **B. Moteur des dossiers** | migration (section 9) ; ouverture, rattachement, rattachement rétroactif, fusion, cycle de vie ; confiance, contre-indices, lectures sous accès douteux (4.6) ; enjeu par objet ; grille et explication ; `chaine_attaque` calculée sur le dossier ; ligne de commande `dossiers` ; les cinq scénarios en tests et au banc | la plus grosse |
| **C. Maquettes** | MV-12 et MV-13, bureau et téléphone, une seule passe de contrôle | moyenne |
| **D. Console** | liste, fiche, frise, graphe, exploration, gestes de l'analyste, section « Dossiers » de la fiche d'entité, vue d'ensemble | moyenne |
| **E. Données personnelles** | site et Vigie (section 11) ; BV-31 | moyenne |

Chaque PR est suivie d'une revue de code et de sécurité, avant la suivante. Après la PR B, un mois d'observation (mode « observer ») sert à recaler les seuils et la grille, avant toute réponse automatique au niveau du dossier.

---

## 13. Décisions à prendre

| N° | Décision | Proposition |
|---|---|---|
| D31 | Découpage des phases | Huit phases ordonnées et deux marqueurs (dissimulation, disponibilité) ; les techniques MITRE restent affichées sur chaque signal |
| D32 | Origine de la phase | Champ explicite, puis technique, puis tactique ; la plus avancée l'emporte ; test bloquant pour toute règle non classée |
| D33 | Signaux faibles | Un indice seul n'ouvre jamais de dossier ; il règle la confiance d'un accès |
| D34 | Liens faibles | Un saut, 72 h, jamais par une adresse privée, de confiance, vue avec un administrateur, ou partagée par plus de 5 comptes ; cibles jamais traversées ; 40 entités au plus |
| D35 | Gravité | Grille progression × confiance ; enjeu ordinaire −1 cran, critique +1 ; dissimulation +1 ; plancher à l'alerte la plus grave ; pas de score affiché |
| D36 | Notifications | Inchangées (par alerte) pendant le mois d'observation ; ensuite, une notification par dossier et par aggravation, au lieu d'une par alerte |
| D37 | Réponses automatiques par dossier | Aucune au départ ; à rediscuter après le mois d'observation (par exemple : vérifier l'identité dès qu'un dossier atteint la collecte avec une confiance moyenne) |
| D38 | Conservation | 183 jours comme les événements ; dossiers « incident » gardés sans adresses complètes pour le registre des violations, durée à fixer avec le dossier légal |
| D39 | Classement « légitime » | Apprend les indices identiques (pays, appareil) pour ce compte pendant 90 jours, avec motif obligatoire, geste chaîné |
