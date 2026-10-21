# La Vigie en dossiers : corrélation entre entités et phases d'attaque

| | |
|---|---|
| Statut | Note de conception. Décisions D31 à D39 prises le 20 octobre 2026 (section 13). PR A faite (#190, ATT&CK 20.0 et projection), PR B faite (moteur des dossiers, section 14), PR C faite (maquettes MV-12 à MV-14), avec une précision du propriétaire : la vue ATT&CK complète est conservée ; les huit phases servent aux dossiers, pas à la détection (section 3.1). |
| Date | 20 octobre 2026, d'après le code de `main` à ea0528b (Vigie après #186). |
| Demande | « Est-ce que ce ne serait pas plus pertinent de travailler tout ça avec la vue « case » qui prendrait un artefact en origine (asset : ip, hostname source, dest, session utilisateur ou nom d'utilisateur) qui viendrait regrouper tous les événements suspects connexes en se servant d'une mécanique de pondération interne pour donner une idée du niveau de l'alerte ? Une corrélation automatique inter entités, avec une représentation de la timeline et une possibilité d'explorer (drill down) de la même façon les liens entre case et autres assets. » Puis : « je veux particulièrement bien détailler le côté « phase d'attaque » ». Point de départ : détecter l'accès aux données personnelles et leur sortie, en corrélant les lectures avec les authentifications et les signaux faibles (adresses multiples, adresse ou heure inhabituelle, empreinte différente). |
| Base | [`recadrage-vigie-edge-wake.md`](recadrage-vigie-edge-wake.md) (entités, score, quorum), [`journalisation-securite.md`](journalisation-securite.md) (cas DS1 à DS32), [`vigie-besoins-des-briques.md`](vigie-besoins-des-briques.md) (BV-1 à BV-30), `vigie/moteur.js`, `vigie/detecteurs.js`, `vigie/regles/*.yml`. |

---

## En bref

- **Un dossier** (« case ») rassemble tout ce qui touche une même attaque probable : les alertes, les signaux qui n'en ont pas déclenché, les faits ordinaires qui deviennent suspects dans ce contexte, et les entités qui les relient (adresse, réseau, appareil, session, compte, accès de galerie, objet lu). Aujourd'hui, une alerte correspond à **une règle et une seule entité**. Une même attaque se lit donc en quatre ou cinq alertes séparées, et l'analyste fait le lien à la main.
- **Deux niveaux, ATT&CK complet partout.** La détection, les règles, les signaux et les alertes gardent MITRE ATT&CK tel quel : les 15 tactiques de la version 20.0 (13 octobre 2026), techniques et sous-techniques (section 3.1). Les phases ne sont qu'une **projection** propre aux dossiers. Le dossier montre les deux : la frise par phases et la matrice ATT&CK complète. La console gagne aussi une vue ATT&CK de toute la détection (couverture et observé).
- **Les phases d'attaque sont le cœur du dossier.** Dans un dossier, chaque signal reçoit une phase parmi huit : **repérage, tentative, accès, exploration, ancrage, collecte, exfiltration, impact**. Deux marqueurs hors chaîne s'y ajoutent : la **dissimulation** (aveugler la Vigie) et l'**atteinte à la disponibilité**. La phase vient d'abord de la technique MITRE ATT&CK, plus précise que la tactique. Un champ explicite la remplace quand la technique trompe. Un test bloque toute règle non classée. Classement des 88 règles et des 10 détecteurs actuels : section 4.7.
- **Distinguer les jalons des indices.** Un **jalon** prouve qu'une phase a eu lieu (lectures en masse, export, rôle donné). Un **indice** ne fait pas avancer l'attaque : il dit seulement qu'un accès est **douteux** (heure inhabituelle, nouvel appareil, pays inédit, adresses multiples, voyage impossible). Les indices règlent la **confiance**, les jalons la **progression**. C'est la réponse à la question de départ : une lecture ordinaire devient un jalon de collecte dès que l'accès qui la porte est douteux.
- **Trois axes pour la gravité**, lisibles chacun en une ligne :
  - **progression** : la phase la plus avancée, et combien de phases se suivent dans l'ordre ;
  - **confiance** : la part d'hostile dans les accès ;
  - **enjeu** : ce qui a été touché.

  Une grille fixe donne la gravité (section 6), sans formule cachée. Exemple d'explication : « Collecte atteinte, 4 phases dans l'ordre · confiance forte (cookie rejoué) · enjeu sensible (34 fiches de personnes) ».
- **Corrélation entre entités sans dossier fourre-tout.** Les liens **forts** (session → compte, session → appareil) se suivent sans limite. Les liens **faibles** (adresse IP, réseau) se suivent d'un saut, sur une fenêtre bornée, et jamais à travers une adresse de confiance ou une adresse vue avec un administrateur. Les **cibles** (une fiche, une galerie) ne se traversent jamais : deux comptes qui lisent la même fiche ne fusionnent pas leurs dossiers, ils deviennent des dossiers voisins.
- **Ce que ça corrige dans l'existant.** La chaîne d'attaque actuelle (`chaine_attaque`, DS23) ne voit une attaque que si repérage, tentative et accès tombent sur **la même entité**. Un scan depuis une adresse suivi d'un accès sur un compte ne se relie jamais. Elle ignore l'impact et le contrôle à distance, ainsi que les 6 règles qui ne portent qu'une technique (27 règles sur 88 ont des étiquettes fausses au regard d'ATT&CK 20.0, section 3.2), et elle oublie tout au redémarrage. De plus, le score d'entité perd la moitié de sa valeur chaque heure : un accès douteux à 9 h et des lectures à 14 h ne se rencontrent pas. Le dossier garde son histoire en base, sur des jours.
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

## 3. Pourquoi huit phases plutôt que les quinze tactiques MITRE

MITRE ATT&CK Enterprise compte 15 tactiques depuis la version 20.0 (13 octobre 2026), qui a scindé Defense Evasion en Stealth et Defense Impairment. Les reprendre telles quelles dans la console pose quatre problèmes :

1. **Elles ne sont pas ordonnées.** MITRE le dit lui-même : une tactique est un « pourquoi », pas une étape. Or un dossier a besoin d'un ordre pour mesurer la progression et vérifier que les étapes se suivent.
2. **Certaines sont vides ici.** La Vigie ne voit ni « Resource Development » ni l'exécution sur un poste. L'exécution n'existe que côté serveur, comme moyen d'entrer.
3. **Une même tactique mélange l'échec et la réussite.** Avec la technique T1078 (comptes valides), « Initial Access » couvre aussi bien une connexion refusée qu'une connexion réussie. La phase doit les séparer : c'est toute la différence entre **tentative** et **accès**.
4. **« Stealth » et « Defense Impairment » (l'ancienne Defense Evasion) ne sont pas des étapes.** Se fondre dans l'activité normale, effacer ses traces ou couper la surveillance peut arriver n'importe quand. Ce n'est pas un degré de progression : c'est un **aggravant**.

Les huit phases retenues suivent l'ordre d'une attaque contre une application web à comptes, comme ce site. Elles **s'ajoutent** à ATT&CK, elles ne le remplacent pas.

### 3.1 Deux niveaux : ATT&CK complet dans la détection, phases dans les dossiers

Décision du propriétaire (20 octobre 2026) : « je veux conserver la vue ATT&CK complète, même si on garde 8 tactiques dans les dossiers, pas dans la détection ».

| Niveau | Référentiel | Où |
|---|---|---|
| **Détection** : règles Sigma, détecteurs, signaux, alertes, notifications | **MITRE ATT&CK Enterprise complet** : les 15 tactiques de la version en vigueur (20.0), techniques et sous-techniques, avec leurs identifiants (TA0001…, T1078, T1550.004) | `tags` des règles (inchangés), `vigie_signal`, fiche d'une alerte (déjà : tactiques en français et techniques, `vigie/console/ecrans/alertes.js:33`) |
| **Dossiers** : progression, cohérence, frise, gravité | **Huit phases et deux marqueurs**, calculés à partir des étiquettes ATT&CK du signal | `dossier_signaux.phase` seulement |

Conséquences :

- **Les étiquettes ATT&CK restent la seule vérité.** La phase se déduit d'elles et ne les modifie jamais. Une règle n'est jamais réétiquetée pour obtenir la phase voulue : si la projection trompe, c'est le champ propre au dossier qui corrige (`vigie: { phase_dossier: … }`, section 4.5), pas les étiquettes.
- **ATT&CK doit donc être complet et juste.** Un référentiel `vigie/attack-enterprise.json`, produit par `scripts/attack-referentiel.mjs` depuis le jeu STIX publié par MITRE, recense les 15 tactiques dans l'ordre de la matrice, les 706 techniques et sous-techniques en vigueur, et les 149 révoquées avec leur remplaçante. `vigie/attack.js` le lit et donne les noms français des tactiques et des techniques employées. Un test vérifie, pour chaque règle qui émet un signal et chaque détecteur :
  - au moins une tactique, aucune tactique retirée ou inconnue ;
  - aucune technique révoquée ou inconnue ;
  - chaque technique rattachée à l'une de ses tactiques officielles (une sous-technique hérite de sa technique).

  À chaque nouvelle version d'ATT&CK (deux par an), on relance le script, et le test dit quelles règles corriger.

### 3.2 ATT&CK 20.0 : ce qui a changé pour la Vigie

La version 20.0, publiée le 13 octobre 2026, une semaine avant cette note, rend fausses les étiquettes de **27 règles sur 88** :

| Changement d'ATT&CK | Règles touchées | Correction |
|---|---|---|
| Defense Evasion (TA0005) supprimée, scindée en **Stealth** (TA0005, se fondre dans l'activité normale) et **Defense Impairment** (TA0112, casser les outils et les flux de surveillance) | 17 règles | Defense Impairment pour ce qui aveugle la Vigie (surveillance réduite, canal, bordure, réseau, chaîne, contrôle des rôles, ingestion, moteur saturé, règles lentes, politique Zitadel) ; Stealth pour `bordure_entetes_faux` (T1036) et `messages_effaces_en_masse` (T1070) |
| T1562 (Impair Defenses) révoquée → **T1685** (Disable or Modify Tools) ; T1562.004 → **T1686** (Disable or Modify System Firewall) | 7 règles | technique remplacée |
| T1550.004 (cookie de session web) ne relève plus que de Lateral Movement | 4 règles | Lateral Movement ajouté |
| Techniques portées sans l'une de leurs tactiques (inchangé en v20, mais faux avant) | 8 règles | tactique ajoutée (dont les 6 règles qui n'avaient qu'une technique) |

Les 10 détecteurs portent désormais leurs étiquettes dans leur barème (`DETECTEURS`). Deux étaient incomplets : `heure_inhabituelle` (technique sans tactique) et `pivot_identifiants` (T1078 sans l'une de ses tactiques). Initial Access leur est ajouté.

Effet sur la détection actuelle : la chaîne d'attaque (DS23) compte Stealth et Defense Impairment comme elle comptait Defense Evasion. Les règles qui gagnent une tactique alimentent aussi cette chaîne : Initial Access pour les tentatives, Lateral Movement et Collection pour l'accès. Les points, les seuils, les modes et les réponses ne changent pas.
- **Les signaux ne portent pas la phase.** `vigie_signal` garde ses étiquettes ATT&CK ; le moteur des dossiers calcule la phase au rattachement. Changer la projection (la table de la section 4.5) ne touche ni la détection ni la chaîne, et recalcule les dossiers ouverts.
- **Chaque dossier a aussi sa matrice ATT&CK complète** (section 8.2). La console gagne une **vue ATT&CK** de toute la détection (section 8.3).

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
| — | **Dissimulation** (marqueur) | Cherche-t-on à aveugler la Vigie ou à effacer ses traces ? | Stealth (TA0005), Defense Impairment (TA0112) | T1685, T1686, T1070 | `surveillance_reduite`, `chaine_rompue`, `integrite_comptes`, `configuration`, `bordure_muette`, `reseau_muet`, détecteur `silence` |
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

1. **Le champ explicite propre au dossier** dans le bloc `vigie` de la règle : `phase_dossier: exfiltration`, ou `nature_dossier: indice`. Il sert quand la technique trompe : 14 phases et 6 natures (1 indice, 5 preuves), sur 88 règles (section 4.7). Il ne change ni les étiquettes ATT&CK ni la détection (section 3.1).
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
| T1685, T1686, T1070 | marqueur dissimulation |
| T1498, T1499 | marqueur disponibilité |

Un **test bloquant** vérifie que chaque règle qui émet un signal, et chaque détecteur, reçoit une phase ou une nature. Une règle ajoutée sans classement fait échouer `npm run test:vigie`, comme le registre des briques l'exige déjà pour les permissions surveillées.

Les détecteurs gardent leurs étiquettes ATT&CK ; leur projection (phase ou nature dans le dossier) est notée dans `vigie/phases.js`, à côté de la table des techniques.

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

Résultat de l'algorithme de la section 4.5 sur les 88 règles qui émettent un signal, avec leurs étiquettes corrigées pour ATT&CK 20.0 (section 3.2). Les 14 règles marquées (e) reçoivent un champ `phase_dossier`. `bordure_nouvel_operateur` reçoit `nature_dossier: indice` ; `cookie_rejoue`, `session_autre_appareil`, `ecritures_sans_identite`, `role_hors_application` et `acces_pays_multiples` reçoivent `nature_dossier: preuve`.

| Phase | Nombre | Règles |
|---|---|---|
| 1 Repérage | 4 | `connexion_test`, `scanner`, `piege`, `bordure_erreurs` |
| 2 Tentative | 18 | `saisie_compte_admin`, `fichier_piege`, `comptes_en_attente_rafale` (e), `oidc_echecs_repetes`, `csrf_repetes`, `cible_commune`, `valeurs_impossibles_repetees`, `enumeration_jetons`, `zitadel_echecs_repetes`, `rafale_erreurs`, `bordure_entetes_faux`, `galerie_echecs_adresse`, `galerie_essais_repartis`, `galerie_suspendue`, `acces_apres_revocation` (e), `csrf_repetes_invite`, `console_refus` (e), `console_refus_repetes` |
| 3 Accès | 7 | `cookie_rejoue`, `session_autre_appareil`, `ecritures_sans_identite`, `acces_reseaux_multiples`, `acces_groupe_reseaux_multiples`, `acces_pays_multiples`, `acces_groupe_pays_multiples` |
| Indice | 1 | `bordure_nouvel_operateur` |
| 4 Exploration | 4 | `exploration_droits`, `reseau_flux_site`, `reseau_flux_repetes`, `ecriture_hors_portee` (e) |
| 5 Ancrage | 17 | `role_hors_application`, `administrateur_donne`, `zitadel_critique`, `controle_roles`, `zitadel_facteur`, `zitadel_droits`, `zitadel_politique`, `reseau_sorties_variees`, `reseau_chaine_attaque`, `reglage_apres_session_reprise` (e), `acces_debloque_apres_suspension` (e), `acces_apres_session_reprise` (e), `acces_longue_echeance`, `billet_construction_active`, `billet_apres_session_reprise` (e), `console_arrivee`, `console_droits` |
| 6 Collecte | 3 | `aspiration_distribuee`, `lectures_massives`, `bordure_rafale` |
| 7 Exfiltration | 9 | `exports_nombreux`, `bordure_cache_prive`, `reseau_sortie_refusee`, `reseau_sortie_directe`, `exif_complet` (e), `heures_visibles_en_masse` (e), `telechargements_en_masse`, `acces_nouvel_appareil_puis_siphonage`, `acces_crees_en_masse` (e) |
| 8 Impact | 7 | `restauration`, `messages_effaces_en_masse`, `contact_public_change`, `texte_public_contact`, `textes_publics_geste_massif`, `textes_publics_en_serie`, `billets_modifies_en_masse` |
| Dissimulation | 13 | `integrite_comptes`, `chaine_rompue`, `configuration`, `dechiffrement` (e), `ingestion_refusee`, `trou_zitadel`, `moteur_sature` (e), `controle_roles_degrade`, `regle_lente` (e), `canal_echec`, `surveillance_reduite`, `bordure_muette`, `reseau_muet` |
| Disponibilité | 5 | `messages_satures`, `zitadel_quota`, `mode_urgence`, `galerie_scrypt_sature`, `console_indisponible` |

Ce que le classement révèle :

- **La collecte est la phase la plus mince** : 3 règles et un détecteur. C'est le manque de départ (lectures de données personnelles). La section 4.6 et la PR E le comblent.
- **`dechiffrement`** (une valeur chiffrée altérée, étiquetée T1005, collecte) relève de la dissimulation : quelqu'un a écrit dans la base sans passer par le site. La phase vient donc d'un champ explicite.
- **`configuration`** (DS9, protections changées) relève aussi de la dissimulation, pas de l'impact : c'est l'attaquant qui baisse la garde. Depuis ATT&CK 20.0, sa technique (T1685) le dit d'elle-même.
- **Les six règles qui n'avaient qu'une technique** reçoivent leur tactique (section 3.2). Leur phase vient de la table des techniques.

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
- **`objet`** : la fiche, le message ou la galerie lus. Mise en œuvre : l'objet n'est pas une entité du dossier (34 fiches rempliraient son plafond de 40) ; il est gardé dans la colonne `objet` de chaque signal, d'où se tirent l'enjeu et la question « qui l'a lu ». La clé suit le format `personne:12` ou `message:40`, tirée du champ `detail.objet` et `detail.id` que le site émet déjà (BV-24, BV-30).
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
| Critique | Données personnelles sorties sous un accès douteux (jalon d'exfiltration sur des objets personnels, confiance moyenne ou forte) ; face publique changée (adresse de contact, textes, billets : les visiteurs sont visés) ; administrateur donné hors de l'application. La Vigie aveuglée pendant le dossier ne compte pas ici : elle est le modificateur « dissimulation » (6.2), compté une fois |

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

Gravité : critique dès 14:37. Tentative, accès puis ancrage font trois phases dans l'ordre, ce qui monte la confiance à « forte » (4.8) ; Installation × forte = critique. Le marqueur de 14:41 dit à l'analyste que l'attaquant a aussi touché la Vigie, ce qui oriente la réponse vers les droits de la console.

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

Maquettes faites (PR C, 20 octobre 2026), en une seule passe de contrôle : [MV-12 « Dossiers »](../maquettes-vigie/MV-12-dossiers.html), [MV-13 « Un dossier »](../maquettes-vigie/MV-13-dossier.html) et [MV-14 « ATT&CK »](../maquettes-vigie/MV-14-attack.html) ; données au § 3.20 du lexique de la console.

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
5. **Matrice ATT&CK du dossier**, en onglet à côté de la frise :
   - les 15 tactiques en colonnes, dans l'ordre de MITRE, y compris celles que la Vigie n'observe pas (grisées, avec la mention « non observable ici ») ;
   - les techniques et sous-techniques vues dans le dossier, avec leur identifiant, leur nom, le nombre de signaux et le numéro d'ordre de leur première apparition (1, 2, 3…), ce qui donne le chemin de l'attaque dans la matrice ;
   - un clic sur une technique filtre la frise et le tableau des signaux sur elle ;
   - sous chaque technique, la phase de dossier qu'elle donne : le lien entre les deux vues reste lisible.
6. **Signaux** en tableau (équivalent de la frise et de la matrice), **entités** en tableau (équivalent du graphe), **journal du dossier** (ouverture, rattachements, fusions, gestes de l'analyste).

**Accessibilité** : la frise, la matrice et le graphe ont chacun un tableau équivalent, se parcourent au clavier et ne codent jamais une information par la seule couleur. **Téléphone** : la frise devient verticale (une phase par bloc) et le graphe se replie en liste par rôle.

### 8.3 Vue ATT&CK de la détection

Un écran de la console, indépendant des dossiers : la matrice ATT&CK Enterprise complète (15 tactiques, version du référentiel) pour toute la détection.

- **Couverture** : pour chaque technique, les règles et les détecteurs qui la portent, leur mode (arrêt, observer, alerter, bloquer) et leur cas DS. Une technique sans règle reste visible, en vide : c'est là que la détection manque.
- **Observé** : le nombre de signaux et d'alertes par technique sur une période (24 h, 7 jours, 30 jours), et les dossiers qui la contiennent.
- **Exploration** : technique → ses règles → leurs alertes et leurs dossiers ; règle → sa fiche dans les réglages.
- **Export** : un calque au format d'ATT&CK Navigator (JSON), pour la couverture et pour l'observé. On l'ouvre dans l'outil public de MITRE ou dans une instance locale, sans rien envoyer depuis la Vigie.

Maquette MV-14, dans la même passe que MV-12 et MV-13. Équivalent en tableau (tactique, technique, règles, signaux) ; au téléphone, une tactique par bloc repliable.

---

## 9. Modèle de données (Vigie, migration 015)

Le schéma est dans [`vigie/migrations/015_dossiers.sql`](../../vigie/migrations/015_dossiers.sql) :

| Table | Contenu |
|---|---|
| `dossiers` | piste, graine, statut, classement, récidive, phase la plus avancée, cohérence, confiance, enjeu, gravité, dissimulation, explication (JSON : titre, trois lignes, modificateurs, chaîne, phases non observées), troncature, chaîne d'attaque déjà signalée, fusion, dates, prise en charge |
| `dossier_entites` | entités d'un dossier : rôle (acteur, cible, contexte), force du lien (graine, fort, moyen, faible, manuel), entité par laquelle elle est entrée, détachement |
| `dossier_signaux` | signaux et faits d'un dossier, **copiés** (les événements sont purgés à 6 mois) : règle, heure, nature, phase, marqueurs, points, source, entité, compte, session, adresse, objet lu, promotion d'un fait en jalon, alerte |
| `signaux_projetes` | tous les signaux projetés des 30 derniers jours, dossier ou pas : la confiance d'un compte et le rattachement rétroactif les relisent par compte, adresse, session ou entité |
| `alerts.dossier_id` | dossier d'une alerte |
| index `events (session, recu_a)` | faits d'une session |

Les gestes sur un dossier sont des événements chaînés `vigie_dossier` : ouverture, fusion, aggravation, sommeil, clôture, récidive, et les gestes de l'analyste (prise en charge, détachement, rattachement manuel, classement). Un rattachement de signal n'y est pas noté : le dossier le garde, et la chaîne a déjà l'événement d'origine.

`vigie_signal` ne change pas : il garde ses étiquettes ATT&CK, et la phase n'existe que dans `signaux_projetes` et `dossier_signaux` (section 3.1). Le dédoublonnage des signaux (une note par règle, par entité et par 10 minutes) ne change pas : un signal entre dans les dossiers quand il est noté, et les points continuent de tous compter.

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
| **A. ATT&CK et phases** | référentiel ATT&CK 20.0 (`scripts/attack-referentiel.mjs`, `vigie/attack-enterprise.json`, `vigie/attack.js`) ; étiquettes des 27 règles et des 2 détecteurs corrigées (section 3.2) ; étiquettes des détecteurs dans leur barème ; test de cohérence ATT&CK ; `vigie/phases.js` (projection) ; champs `phase_dossier` (14 règles) et `nature_dossier` (6 règles) ; test bloquant de projection ; la fiche d'une alerte nomme ses tactiques v20 et ses techniques. Points, seuils, modes et réponses inchangés | petite |
| **B. Moteur des dossiers** | migration (section 9) ; ouverture, rattachement, rattachement rétroactif, fusion, cycle de vie ; confiance, contre-indices, lectures sous accès douteux (4.6) ; enjeu par objet ; grille et explication ; `chaine_attaque` calculée sur le dossier ; ligne de commande `dossiers` ; les cinq scénarios en tests et au banc | la plus grosse |
| **C. Maquettes** | MV-12 (dossiers), MV-13 (un dossier : frise, matrice ATT&CK, graphe), MV-14 (vue ATT&CK de la détection), bureau et téléphone, une seule passe de contrôle | moyenne |
| **D. Console** | liste, fiche, frise, matrice ATT&CK du dossier, graphe, exploration, gestes de l'analyste, section « Dossiers » de la fiche d'entité, vue d'ensemble ; vue ATT&CK de la détection et export au format Navigator | moyenne |
| **E. Données personnelles** | site et Vigie (section 11) ; BV-31 | moyenne |

Chaque PR est suivie d'une revue de code et de sécurité, avant la suivante. Après la PR B, un mois d'observation (mode « observer ») sert à recaler les seuils et la grille, avant toute réponse automatique au niveau du dossier.

---

## 13. Décisions (prises le 20 octobre 2026)

Toutes les propositions sont validées par le propriétaire, D31 avec une précision.

| N° | Décision | Retenu |
|---|---|---|
| D31 | Découpage des phases | Huit phases ordonnées et deux marqueurs (dissimulation, disponibilité), **dans les dossiers seulement**. La détection garde ATT&CK complet (15 tactiques de la v20, techniques), la vue ATT&CK complète est conservée : matrice dans chaque dossier, vue ATT&CK de la détection, export Navigator (section 3.1) |
| D32 | Origine de la phase | Champ explicite propre au dossier (`phase_dossier`), puis technique, puis tactique ; la plus avancée l'emporte ; test bloquant pour toute règle non classée ; les étiquettes ATT&CK ne sont jamais modifiées pour la projection |
| D33 | Signaux faibles | Un indice seul n'ouvre jamais de dossier ; il règle la confiance d'un accès |
| D34 | Liens faibles | Un saut, 72 h, jamais par une adresse privée, de confiance, vue avec un administrateur, ou partagée par plus de 5 comptes ; cibles jamais traversées ; 40 entités au plus |
| D35 | Gravité | Grille progression × confiance ; enjeu ordinaire −1 cran, critique +1 ; dissimulation +1 ; plancher à l'alerte la plus grave ; pas de score affiché |
| D36 | Notifications | Inchangées (par alerte) pendant le mois d'observation ; ensuite, une notification par dossier et par aggravation, au lieu d'une par alerte |
| D37 | Réponses automatiques par dossier | Aucune au départ ; à rediscuter après le mois d'observation (par exemple : vérifier l'identité dès qu'un dossier atteint la collecte avec une confiance moyenne) |
| D38 | Conservation | 183 jours comme les événements ; dossiers « incident » gardés sans adresses complètes pour le registre des violations, durée à fixer avec le dossier légal |
| D39 | Classement « légitime » | Apprend les indices identiques (pays, appareil) pour ce compte pendant 90 jours, avec motif obligatoire, geste chaîné |

---

## 14. Mise en œuvre (PR B, 20 octobre 2026)

Code : [`vigie/dossiers.js`](../../vigie/dossiers.js), branché dans `vigie/moteur.js` ; tests : `test/vigie-dossiers.test.js`. Les cinq scénarios de la section 7 y passent de bout en bout : les événements traversent les règles et les détecteurs. Trois autres cas sont testés : un administrateur qui lit 50 fiches sur son appareil habituel n'ouvre aucun dossier ; les fusions et les exclusions d'adresses ; le cycle de vie, la purge et la ligne de commande.

Précisions et écarts par rapport aux sections précédentes :

| Point | Mise en œuvre |
|---|---|
| Confiance | Calculée **par compte**, sur la fenêtre du dossier (24 h avant son premier signe), et non par session : deux sessions du même compte comptent ensemble. C'est le choix prudent : la session légitime d'un compte volé est vue comme douteuse elle aussi. Une règle d'indice compte une fois, à son plus fort (une heure inhabituelle chaque heure ne s'additionne pas) ; `premiere_apparition` vaut 1,5 par attribut inédit (pays, appareil). Gardée une minute par compte, oubliée dès qu'un indice du compte arrive. |
| Accès (phase 3) | Compté dès que la confiance est moyenne ou forte, à l'heure du premier indice ou de la première preuve. `pivot_identifiants` (échecs puis connexion) est aussi un jalon d'accès, qui ouvre un dossier si la confiance est moyenne. |
| Faits promus | Lectures, exports, suppressions et échecs de connexion (6 h avant l'accès) deviennent des jalons dès que la confiance le permet (4.6), y compris ceux déjà rattachés. Une promotion ne se défait jamais : ce qui a eu lieu sous un accès douteux le reste, même après une identité confirmée (scénario 7.2). |
| Cibles | Ne relient jamais deux dossiers : fiche lue, réglage, `site:*`, `vigie:*`. Le compte qui reçoit des droits (`administrateur_donne`) entre comme acteur. |
| Piste serveur | `site:sortie`, `sortie_directe`, `chaine_sortie`, `flux`, `conteneur:*`, `donnees`, `restauration` : reliées par l'heure (une heure) ; les événements d'une corrélation (`detail.evenements`) apportent l'adresse de l'attaque. `site:battement` (site silencieux) relève de la piste surveillance. |
| Dissimulation | Un marqueur sans acteur (chaîne rompue, surveillance réduite, bordure ou réseau muets) s'ajoute à tous les dossiers ouverts. Il compte une fois, comme modificateur (+1), et non aussi dans l'enjeu. |
| Rattachement rétroactif | À l'ouverture, puis pour chaque acteur qui entre ensuite (adresse venue d'une corrélation, compte qui reçoit des droits). |
| Alerte qui dure | Le dossier est recalculé quand l'alerte s'ouvre ou s'aggrave ; sinon, il avance seulement sa date, au plus une fois par minute. |
| Chaîne d'attaque (DS23) | Ouverte une fois par dossier, sur son compte ou sa graine, quand trois phases ou plus se suivent dont l'accès (mode « observer », comme avant). L'ancienne chaîne par entité, en mémoire, est retirée. |
| Ligne de commande | `dossiers [--tous]`, `dossier <id>`, `dossier <id> prendre`, `classer` (« légitime » : motif obligatoire), `detacher` (motif obligatoire), `rattacher`, `fusionner`, `scinder --entites "compte:a,session:s" --signaux "12,13" --motif "…"` (D1). |
| Pas encore | Dessins du dossier (D2), vue ATT&CK (D3) ; catégories de données personnelles et règle « trois réseaux ou plus » (PR E) ; empreinte TLS comme indice (après sa mesure de stabilité). |
| Inchangé | Alertes, modes, seuils, notifications, réponses automatiques (D36, D37) ; aucun événement nouveau côté site. |
| Coût mesuré | Banc, 20 000 événements d'historique : analyse ordinaire de 0,58 à 0,65 ms par événement (dans le bruit de la mesure) ; rafale de 5 000 événements sur une adresse dont l'alerte a son dossier, de 0,39 à 0,42 ms (voir [`vigie-capacite.md`](vigie-capacite.md)). |


### 14.1 Console des dossiers — D1

Première livraison de la PR D : `vigie/console/ecrans/dossiers.js`, quatre vues Eta et les gestes dans `vigie/console/actions.js`. Les maquettes restent inchangées. La liste MV-12 et la fiche MV-13 utilisent les styles de leur section 25 ; les dessins SVG, les calques et les liens vers la vue ATT&CK sont réservés aux livraisons D2/D3. En D1, entités, signaux, alertes, réponses et journal sont des tableaux ou listes accessibles sans script. Les filtres GET sont statut, piste, gravité minimale et phase minimale. Le tri précède le plafond et la pagination (50 dossiers, 40 signaux) ; les valeurs inconnues sont signalées puis ignorées.

Les compteurs « Dossiers » et « Alertes » restent distincts (D36). La Lectrice lit avec adresses tronquées, y compris titres générés, explication, journal et liens. Les titres HTML ne portent que le numéro du dossier. Tous les gestes passent par un formulaire de confirmation, un POST CSRF et la vérification du rôle frais ; une empreinte du contenu interdit une confirmation périmée. « Légitime » affiche les indices qui seront appris, avec leur compte et leur durée ; plus de 200 indices distincts impose l'examen en ligne de commande. Les preuves ne s'apprennent pas.

La scission (§ 5.6), ajoutée au moteur et à la ligne de commande, sélectionne explicitement les entités actives **et** les signaux : un signal peut citer plusieurs acteurs, il n'est donc pas déplacé implicitement à partir d'une seule entité. Un aperçu annonce les deux partitions et les alertes transférées. Le motif est obligatoire ; chaque branche garde au moins une entité et un signal ; tous les signaux d'une alerte restent ensemble. La transaction conserve les numéros des signaux, déplace les alertes correspondantes, recalcule les deux dossiers et note deux événements chaînés. La migration 016 ajoute l'index du journal des dossiers, les paires séparées et les exclusions de signaux lors des recherches rétroactives.

Une séparation persiste au redémarrage et suit les scissions/fusions ultérieures. Pour les nouveaux signaux rejoignant deux branches, compte/session/accès prime sur adresse/réseau, puis sur la seule fenêtre temporelle serveur ; à égalité le plus ancien reçoit le signal. La fusion manuelle lève la séparation de la paire et rétablit ses entités actives. La scission ne change ni les notifications ni les réponses des alertes. L'historique des événements reste intact.

Correction du contrôle des rôles : l'événement `vigie_controle_roles` porte les comptes non déclarés ou sans changement journalisé dans `detail.comptes`, et dans `sub` s'il n'y en a qu'un. Les alertes de rôle donné hors application (#412 dans l'exemple) et du contrôle (#413) rejoignent ainsi le même dossier. Plusieurs comptes restent acteurs d'un seul rapport ; un défaut de déclencheur seul n'invente aucun compte.

Écarts explicites avec les textes des maquettes : la scission et la fusion ajoutent deux étapes de formulaire ; les liens ATT&CK et les dessins attendent D2/D3. Le détachement actuel du moteur bloque tout retour automatique jusqu'au rattachement manuel (la maquette suggère un retour lors d'un nouveau lien). La confirmation décrit cette réalité sans changer ce comportement. De même, la fusion conserve la gravité des alertes et recalcule celle du dossier ; elle ne promet pas un plancher supplémentaire sur l'ancienne gravité des dossiers. Les réponses restent celles des alertes, pas des actions prises depuis le dossier.

Tests durables : `test/vigie-console-dossiers.test.js`, `test/vigie-console-dossiers-actions.test.js`, extensions de `test/vigie-dossiers.test.js` et `test/vigie-regles.test.js`. Ils vérifient les lectures, droits, masquages, confirmations, erreurs, transactions, séparations et contrôle des rôles. Les essais navigateur, les deux suites complètes et les mesures avant/après sont rapportés dans la PR D1.

Mesure D1 sur la même machine, hors suites de tests : `node vigie/banc.js --dossier /tmp/vigie-d1-{avant,apres} --historique 20000 --evenements 5000 --rafale 5000` (deux exécutions séparées). Rafale : **0,464 → 0,424 ms/événement**, calcul **472 → 437 µs/événement**, 5 007 rattachements dans les deux cas ; analyse ordinaire **0,81 → 0,57 ms/événement**. Chaîne intacte dans les deux cas. Aucun ralentissement observé sur ce banc ; la variation de charge interdit d’attribuer le gain apparent au changement.

Revue complémentaire de D1 : la fusion présente le second dossier après sa sélection et confirme les deux empreintes sous le verrou d’écriture ; une modification de l’un ou de l’autre impose un nouvel aperçu. La fiche annonce la coupure au-delà de 200 alertes. La migration 016, affinée avant sa première fusion, distingue les occurrences sans événement source par heure et entité : écarter une ancienne exploration lente ne masque plus toutes les suivantes de sa règle. Un dossier sans entité ni signal montre un message, sans tableau vide défilant. Tests supplémentaires : moteur périodique réel après scission, retour arrière après le second événement de journal, provenance et jetons hostiles sur les six gestes, révision périmée hors des 200 entités affichées, sélection étrangère et seconde révision de fusion.

Banc après revue, mêmes paramètres : rafale **0,413 → 0,400 ms/événement**, calcul **423 → 412 µs/événement**, 5 007 rattachements et chaîne intacte des deux côtés ; analyse ordinaire **0,61 → 0,64 ms/événement**. Pas de ralentissement observé sur la rafale ; la variation de l’analyse ordinaire reste rapportée.
