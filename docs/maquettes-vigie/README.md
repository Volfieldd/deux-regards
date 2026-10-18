# Maquettes de la console de la Vigie (phase D2)

Onze maquettes en HTML et CSS, sans dépendance ni script obligatoire : dix écrans de la console de la Vigie (`https://vigie.nicephos.art`, annexe architecture, section 5) et son affichage dans l'administration du site (MV-10). Elles reposent sur le commun des maquettes de l'administration ([`../audit-ergonomie-2026-10-16/maquettes/_commun/`](../audit-ergonomie-2026-10-16/maquettes/_commun/)), sur **une seule feuille propre à la console**, [`_vigie/vigie.css`](_vigie/vigie.css), sur [`_vigie/admin-site.css`](_vigie/admin-site.css) pour ce qui ne sert qu'à l'admin du site, et sur le référentiel de mots et de données fictives [LEXIQUE-ET-DONNEES.md](LEXIQUE-ET-DONNEES.md). Grille du jury : celle de l'administration ([`GRILLE.md`](../audit-ergonomie-2026-10-16/maquettes/GRILLE.md)), avec ses contrôles outillés.

Dessinées par quatre personnes en parallèle (MV-01 et MV-02 ; MV-03 et MV-04 ; MV-05, MV-06 et MV-08 ; MV-07, MV-09 et MV-10), elles ont été consolidées le 18 oct. 2026 : une feuille au lieu de quatre, mêmes barre latérale, barre d'onglets, mots, données et composants d'un écran à l'autre, liens entre écrans vers les adresses que les autres montrent, arbitrages du § 3.13 du lexique repris partout. Après le jury v1 (deux jurés indépendants), la passe 2 du même jour applique les dix-huit arbitrages du § 3.14 ; après le jury v2, la passe 3 applique les treize du § 3.15 et montre comme faits les comportements de la PR #121 de la Vigie ; après le jury v3, les finitions appliquent les sept points du § 3.16 (textes de la PR #124). Après validation de MV-01 à MV-10 (PR #125), les photographes ont demandé MV-11, « Flux et provenance des alertes » (§ 3.17), et sa vignette dans MV-01.

## La liste

| Maquette | Écran | Adresse | Rendus |
|---|---|---|---|
| [MV-01](MV-01-vue-ensemble.html) | Vue d'ensemble : l'état en une phrase, interrupteurs, alertes ouvertes, décisions, santé, 7 jours | `/` | [bureau](MV-01-vue-ensemble-bureau.webp) · [téléphone](MV-01-vue-ensemble-mobile.webp) |
| [MV-02](MV-02-fiche-alerte.html) | Fiche d'une alerte : à faire maintenant, ce qui s'est passé, réponse déjà faite, d'où vient le signal, actions forcées, classement | `/alertes/412` | [bureau](MV-02-fiche-alerte-bureau.webp) · [téléphone](MV-02-fiche-alerte-mobile.webp) |
| [MV-03](MV-03-evenements.html) | Événements : le journal filtré, heure à la source et écart, saisie suspecte, export, pagination | `/evenements` | [bureau](MV-03-evenements-bureau.webp) · [téléphone](MV-03-evenements-mobile.webp) |
| [MV-04](MV-04-entite.html) | Entité (adresse, compte) : score par source, « Vue avec », alertes, événements, réponse automatique | `/entites/ip/198.51.100.23` | [bureau](MV-04-entite-bureau.webp) · [téléphone](MV-04-entite-mobile.webp) |
| [MV-05](MV-05-decisions.html) | Décisions et actions forcées : en cours, lever, nouvelle décision, verrouiller l'admin | `/decisions` | [bureau](MV-05-decisions-bureau.webp) · [téléphone](MV-05-decisions-mobile.webp) |
| [MV-06](MV-06-reglages.html) | Règles et réglages : interrupteurs à durée, seuils, adresses de confiance, canaux, les 54 règles | `/reglages` | [bureau](MV-06-reglages-bureau.webp) · [téléphone](MV-06-reglages-mobile.webp) |
| [MV-07](MV-07-sante.html) | Santé et intégrité : chaîne du journal, sources, contrôle des rôles, analyse, disque, canaux | `/sante` | [bureau](MV-07-sante-bureau.webp) · [téléphone](MV-07-sante-mobile.webp) |
| [MV-08](MV-08-droits.html) | Droits de la console : deux clés (plafond, attribution), journal, rôles, garde-fous | `/droits` | [bureau](MV-08-droits-bureau.webp) · [téléphone](MV-08-droits-mobile.webp) |
| [MV-09](MV-09-acces.html) | Accès, pages hors session : connexion refusée, second facteur, ré-authentification, session expirée, 403 | `/connexion`, `/reauth` | [bureau](MV-09-acces-bureau.webp) · [téléphone](MV-09-acces-mobile.webp) |
| [MV-10](MV-10-admin-site.html) | Dans l'admin du site : entrée « Sécurité », bandeau, ligne d'« Aujourd'hui » ; messages Signal et e-mail | `/admin` | [bureau](MV-10-admin-site-bureau.webp) · [téléphone](MV-10-admin-site-mobile.webp) |
| [MV-11](MV-11-flux.html) | Flux et provenance des alertes : diagramme des flux (origines, sources, chemins, issues), table équivalente, provenances ; vignette dans MV-01 | `/flux` | [bureau](MV-11-flux-bureau.webp) · [téléphone](MV-11-flux-mobile.webp) |

Le contenu attendu de chaque écran et ses états sont au § 4 du lexique ; les données, au § 3 (tableaux de référence à l'état final, § 3.1 à 3.6).

## Les ouvrir et les rendus

Ouvrez le fichier `MV-xx-….html` dans un navigateur, en gardant le dépôt entier : les pages chargent le commun de l'administration par `../audit-ergonomie-2026-10-16/maquettes/_commun/` et `_vigie/vigie.css` (console) ou `_vigie/admin-site.css` (MV-10). Aucune ressource externe, aucun script. `#sans-annotations` à la fin de l'adresse masque les annotations sans rien déplacer.

Rendus comme ceux de l'administration : `-bureau.webp` en pleine page à 1 440 × 900, densité 1, thème « Chambre noire » ; `-mobile.webp` sur Pixel 7 (412 × 839), densité 2, thème clair ; au-delà de 16 000 px de haut, la capture est coupée en bandes posées côte à côte, à lire de gauche à droite, coupées entre deux blocs. Rendus téléphone en 3 bandes, sauf MV-02, MV-08 et MV-09 (2). Les barres fixes du téléphone (barre d'actions, barre d'onglets) apparaissent une fois, au bas du premier écran.

## Règles propres à la console (état du 18 oct. 2026, après les finitions)

Elles s'ajoutent à celles de l'administration (planche MQ-00, `GRILLE.md`). `_vigie/vigie.css` les porte en sections numérotées (0 à 23), **un composant par besoin**, sans jeton redéclaré ni attribut `style` (CSP sans `unsafe-inline`) ; le numéro de section est entre parenthèses. La passe 2 applique les dix-huit arbitrages du lexique, § 3.14 ; la passe 3, les treize du § 3.15 ; les finitions, les sept du § 3.16.

**Échelle, marque, téléphone**

- **Rien sous 13 px** dans la console ; l'admin du site (MV-10) garde sa règle, 12 px (§ 0).
- **Même barre latérale** sur les huit écrans en session : « Vigie », « Sécurité de Nicephos » ; Vue d'ensemble ; Surveiller (Alertes 6, Événements, Entités, Santé ▲ 1) ; Agir (Décisions 4, compteur **neutre** : rien à faire) ; Régler (Règles et réglages, Droits) ; au pied, Sébastien, Administrateur, le thème, « Se déconnecter ». **Même barre d'onglets** au téléphone : Vue d'ensemble, Alertes, Décisions, Menu. Les pages hors session (MV-09) n'ont ni l'une ni l'autre (§ 16).
- **Au téléphone, l'essentiel d'abord** : l'en-tête ne garde que le numéro et l'heure (`.tel-non` s'efface) ; les filtres du journal et les 27 règles à points se replient en une ligne qui les résume et s'ouvrent sans script à leur ancre (`.vg-replie`, § 20) ; les paires clé-valeur et les cartes des droits s'empilent.
- **Titre de la page** : « Page · Vigie · Nicephos », une alerte par son numéro : ni compte ni adresse dans le titre. L'adresse de la page, elle, porte une adresse IP pour un Intervenant (`/entites/ip/…`) : toutes les pages sont servies `Cache-Control: no-store` et `Referrer-Policy: no-referrer`. Pour un Lecteur, une adresse complète n'est jamais acceptée dans l'adresse d'une page ni dans un filtre (redirection vers le réseau, filtres en /24 ou /48).

**Lire**

- **Flux** (MV-11, § 24) : un diagramme de Sankey rendu par le serveur, sans script ; quatre colonnes (origines, sources, chemins, issues), épaisseur proportionnelle aux événements (échelle dans la légende, 3 px au moins), une teinte par source jamais seule (libellé et nombre aux deux bouts), hachures (`<pattern>`) pour une corrélation, aplat pour une règle sur un seul événement, la part perdue en gris en bas ; une table équivalente le suit ; à moins de 936 px de place, le même pivoté de haut en bas, ses libellés en HTML. Mise en page : `dr-tmp/vigie-mq/flux.py`, référence du rendu serveur de D3.

- **Gravité : le mot, une jauge, la couleur** (`.grav`, § 1) ; la légende d'une liste d'alertes, dans la légende (`caption`) du tableau, n'a que Critique, Haute, Moyenne (Basse et Info ne se voient qu'au journal).
- **Un seul composant d'état** : la pastille de l'admin (`.etat`, symbole et mot), sa variante neutre pour un attribut sans action (« Protégée : vue avec un administrateur », « Administrateur ») (§ 10) ; le même dessin dans une phrase et sur une carte (l'icône d'une carte de santé ne déteint plus sur sa pastille, § 15).
- **Source : une puce neutre** (`.src`, § 2) ; la confiance en toutes lettres.
- **Adresses, comptes et noms de code en chasse fixe, jamais coupés en fin de ligne** (`.ip`, `.sub`, `code` : insécables, en bloc dans la ligne ; la largeur minimale d'une cellule reste la leur) (§ 3).
- **Pas de codes d'analyste à l'écran** : la règle en clair, son identifiant et son cas (DS8, DS22) en petit pour qui les cherche, « intégrité de la Vigie » en clair plutôt que MV11 ; la recherche des règles accepte « DS15 ». Une règle à points montre ses points, sans badge de gravité.
- **L'heure à la source, puis l'écart de réception** (`.vg-ecart`, § 9).
- **L'état en une phrase d'abord** (`.vg-etat`, § 5) ; **moins de texte dans l'écran**, l'explication passe dans l'encart.
- **Un bandeau, le même partout** (`.vg-bandeau`, § 4) : « 2 alertes critiques sans intervenant : #413 depuis 14 h 05, #412 depuis 14 h 02 », avec « Ouvrir l'alerte #413 ».
- **Un ordre des alertes, partout** (console, admin, résumé) : gravité, puis Ouverte avant Prise en charge, puis la plus récente d'abord : #413, #412, #409, #407, #414, #405.
- **Une alerte critique a un titre factuel** (« Un compte inconnu est devenu Administrateur hors de l'application »), la règle en sous-titre, et un bloc **« À faire maintenant »** en tête : des étapes numérotées (`.vg-etapes`, `.vg-afaire`, § 19).
- **Listes** : tableaux en cartes (§ 7), listes à lignes (§ 12), filtres GET (§ 8), pagination, liste vide ; saisie suspecte coupée à 24 signes (§ 9).

**Agir**

- **Un seul bouton plein par écran**, l'étape suivante : « Ouvrir l'alerte critique #413 » (vue d'ensemble), « Prendre en charge » (fiche), « Filtrer » (journal), « Ouvrir l'alerte #409 » (entité), « Ouvrir l'alerte #413 » (santé), « Attribuer » (droits), « Se reconnecter » (accès, sauf « Connexion refusée », où rien n'est principal : deux boutons en contour). Sur une page de confirmation, un seul bouton plein, la durée proposée ; les autres durées en contour.
- **L'identité confirmée tient en une ligne d'en-tête** : « Identité confirmée à 14 h 17, valable jusqu'à 14 h 22 » (`.vg-identite`, § 20) ; au-delà, « Confirmez votre identité » (dialogue avec le script, page sans), avec la clé d'accès.
- **Action forcée : effet et durée dans le bouton**, un bouton par durée ; **aucune portée de blocage cochée d'avance** (avec le script, les boutons restent inactifs ; sans, l'erreur près du champ) ; une adresse où un administrateur s'est connecté depuis 30 jours demande la même confirmation que votre propre adresse, partout.
- **Affaiblir la surveillance est un geste lourd** : arrêter un interrupteur, passer une règle en Arrêt, ajouter une adresse de confiance, accepter une référence du contrôle des rôles, prendre acte d'une rupture de la chaîne demandent un motif, une durée (7 jours au plus ; à la fin, une règle reprend le mode qu'elle avait avant), une page de confirmation qui dit ce qui ne sera plus vu, l'identité, et envoient à **chaque geste** un message « Surveillance réduite » (Moyenne, Alerter, mode figé, hors du plafond des alertes, même Alertes arrêtées) ; descendre une règle d'un mode et relever un seuil aussi (motif obligatoire). « Accepter comme référence » n'a pas de durée (l'instantané remplace la référence) et est refusé tant qu'une alerte du contrôle des rôles est ouverte. Une carte d'interrupteur n'a qu'un « Arrêter… », au bureau comme au téléphone : motif, durées et autre durée passent sur la page de confirmation.
- **Retour après chaque action**, en tête de la page qui revient (`.vg-retour`, `role="status"`, § 19) : « Décision #89 envoyée à 14 h 23 ; lue par le site à 14 h 23 » (suivi de lecture à créer), « Alerte prise en charge », « Gel levé », « Attribution changée ».
- **Une levée nommée par son objet** : « Lever le gel… », « Lever la fermeture des sessions… », « Lever le blocage… » ; deux liens de même nom portent leur numéro pour le lecteur d'écran.
- **Droits** : l'amorce `VIGIE_ADMIN_SUBS` l'emporte (rétrograder un compte de l'amorce est refusé, avec la raison ; pour lui couper l'accès, retirer son plafond `vigie.*` dans Zitadel : il perd l'accès dans les 5 minutes, et ne peut plus agir dès la requête suivante ; la relecture du plafond toutes les 5 minutes et avant toute action est à créer en D3) ; tout retrait de droit est confirmé, en danger.
- **Erreurs près du champ, saisie gardée** : filtre, réseau trop large, portée manquante, seuil, adresse de confiance, autre durée (le motif reste).
- **Commandes du serveur en bloc** (`pre.vg-commande`, § 22) : chaque mot est insécable, la ligne ne se coupe qu'aux espaces (jamais « controle -- » puis « accepter ») ; le bloc défile seul si un mot ne tient pas, à 320 px comme en espacement WCAG 1.4.12.
- **Formulaires POST** : jeton `_csrf` dans tous ; le retour après connexion n'accepte qu'un chemin local ; l'export CSV neutralise les cellules (`= + - @`, tabulation et retour chariot préfixés d'une apostrophe) ; le rafraîchissement par script lit une route qui ne prolonge pas la session (`ETag`, 304).

**Relier**

- **Chaque lien vers un autre écran pointe vers l'adresse que cet écran montre** : `/reglages#interrupteurs`, `/decisions#nouvelle`, `/decisions?type=…#nouvelle`, `/decisions#verrouiller`, `/decisions/<n°>/lever`, `/reglages#r-<identifiant>`, `/reglages#canaux`, `/alertes/413` (état de MV-02), `/entites/<ip|reseau|compte>/<clé>`, `/evenements?…`. `coherence-vigie.py` le vérifie.

**Messages et admin du site (MV-10)**

- **Message Signal** : [gravité] titre de la règle, la source, **la réponse déjà faite** (« Réponse : compte gelé 24 h, sessions du compte fermées » ou « Aucune réponse automatique », `responseOf`), l'heure, le lien ; « Surveillance réduite » dit ce qui est réduit et jusqu'à quand (« [Moyenne] Surveillance réduite : blocages automatiques arrêtés jusqu’à 15 h 10 », `reducedText`, apostrophe typographique ; une descente de mode : « … règle « Cookie d'une session fermée rejoué depuis un autre appareil » passée de Bloquer à Observer »), sans ligne « Réponse », sans motif ni adresse, avec le lien des réglages ; au-delà de 60 gestes par heure, leur nombre part au début de l'heure suivante ; l'e-mail ajoute « Ouvrez la Vigie depuis votre favori ; elle ne demande jamais votre mot de passe par message. » Le second facteur exigé pour l'application « Vigie » est une **clé d'accès** (passkey, WebAuthn), qui résiste à une fausse page (le contrôle de `amr` est à vérifier en D3) ; le favori fait foi ; l'e-mail de secours part d'une adresse protégée par SPF, DKIM et DMARC.
- **L'admin du site ne montre aucun titre de règle** : « 2 alertes critiques dans la Vigie · la dernière ouverte à 14 h 05 », le lien profond `/alertes/413`, le badge **▲ 3** (jamais ✕) ; bandeau daté quand le résumé manque ; le choix de la langue s'ouvre sur toute la largeur du pied de la barre (`admin-site.css`, § 1 à 7). En allemand, « Sicherheit » pour le menu, « Sicherheitswarnung » pour une alerte, validés le 18 oct.

**Accessibilité**

- **Contraste forcé** : bordure `ButtonText` des boutons, sélection en `Highlight` (§ 21) ; **mouvement réduit** : aucune transition ni animation ; **espacement du texte** (WCAG 1.4.12) tenu à 320, 412 et 1 440 px, et à 320 et 412 px tous les `<details>` ouverts.

**Encart** : « Ce que montre l'écran », la commande de `vigie/cli.js` équivalente, ce qui est « à créer », les écarts avec le lexique et le code, et les **styles à embarquer** (la console dépend de `liste-a`, `champ-a`, `note-a`, `kv-a`, `plier`, absents de `public/admin/admin.css` : D3) ; un seul bloc « Mesures », écrit par `mesures-vigie.py`.

## Contrôles passés (18 oct. 2026, MV-11 ajoutée)

Tous repassés sur les onze pages (MV-11 comprise), une colonne par maquette ; tout est à 0 défaut. Console (MV-01 à MV-09, MV-11) : textes à 13 px au moins, français seul ; admin du site (MV-10) : 12 px au moins, en français et avec la barre latérale allemande (« Sicherheit »), pied de la barre au toucher de 721 à 1 440 px (102 mesures, thème et « Se déconnecter » à 44 px). Les essais des deux jurés tournent à chaque passe ; depuis la passe 3, avec tous les `<details>` ouverts à 320 et 412 px, l'espacement du texte à 412 px et les noms en double cherchés dans chaque cadre d'état. Le poids d'une page de la console va de 288 à 439 ko : la feuille unique porte les composants des neuf écrans et se met en cache d'une page à l'autre.

| Contrôle | MV-01 | MV-02 | MV-03 | MV-04 | MV-05 | MV-06 | MV-07 | MV-08 | MV-09 | MV-10 | MV-11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| axe-core, bureau sombre et Pixel 7 clair (violations) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| axe-core sans `inert` (violations ; inert retirés) | 0 / 0 (4) | 0 / 0 (6) | 0 / 0 (3) | 0 / 0 (3) | 0 / 0 (7) | 0 / 0 (5) | 0 / 0 (5) | 0 / 0 (5) | 0 / 0 (6) | 0 / 0 (7) | 0 / 0 (5) |
| débordement, 11 largeurs, et à 320 et 412 px `<details>` ouverts | aucun | aucun | aucun | aucun | aucun | aucun | aucun | aucun | aucun | aucun | aucun |
| débordement de 320 à 1 440 px au pas de 16, à 900, 1 024, 1 100 px de haut (mesures) | 270 | 270 | 270 | 270 | 270 | 270 | 270 | 270 | 270 | 540 | 270 |
| ellipses | aucune | aucune | aucune | aucune | aucune | aucune | aucune | aucune | aucune | aucune | aucune |
| lignes qui défilent sans suite visible | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| barre latérale : rien n’en sort ; bas du compte (bureau) | oui ; 900 px | oui ; 900 px | oui ; 900 px | oui ; 900 px | oui ; 900 px | oui ; 900 px | oui ; 900 px | oui ; 900 px | sans barre | oui ; 900 px ; fr et de | oui ; 900 px |
| cibles sous 24 px (bureau) / 44 px (toucher) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| textes sous 13 px (console) ou 12 px (admin), bureau / téléphone | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| focus visible, sombre et clair, inert retirés (éléments, 0 invisible) | 49, 0 | 49, 0 | 73, 0 | 48, 0 | 77, 0 | 124, 0 | 35, 0 | 20, 0 | 11, 0 | 109, 0 | 38, 0 |
| focus caché par une barre fixe, menu ouvert compris | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| html-validate (erreurs) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| formulaires (noms, boutons, `_csrf` sur tout POST) | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire |
| annotations à 1 440, 412, 320 px | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire | rien à redire |
| insécables à poser | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| groupes de radios (aucun partagé entre cadres) | 0 | 2 | 0 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| cohérence des données (contradictions) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| espacement du texte (WCAG 1.4.12) à 320, 412, 1 440 px, et `<details>` ouverts à 320 et 412 px (défauts) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| contraste forcé : bouton sans bordure, sélection invisible | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| identifiants (.ip, .sub, code) coupés en fin de ligne, 320, 412, 1 440 px, `<details>` ouverts compris ; commandes coupées dans un mot | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| liens ou boutons de même nom vers des cibles différentes, écran et cadres d’état | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| transitions ou animations en mouvement réduit | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| diagrammes SVG : libellés qui se chevauchent, hors cadre ou sous 13 px, de 320 à 1 440 px | 0 (1 SVG, 0 libellés) | sans diagramme | sans diagramme | sans diagramme | sans diagramme | sans diagramme | sans diagramme | sans diagramme | sans diagramme | sans diagramme | 0 (19 SVG, 87 libellés) |
| poids, polices et CSS compris (ko) | 331 | 315 | 344 | 322 | 323 | 410 | 322 | 308 | 288 | 296 | 439 |


Les outils de `dr-work/outils/` filtrent sur `MQ-` ou visent le dossier des maquettes de l'administration : ils ont été **copiés et adaptés** dans `dr-work/dr-tmp/vigie-mq/` (sans les modifier), avec les générateurs. Depuis la consolidation, deux commandes suffisent :

- `build-vigie.sh` : génère les dix pages (`mv01.py` à `mv10.py`, sur `commun.py` et ses compléments `commun_a.py`, `commun_c.py`, `pieces_b.py` ; registre des règles lu du code par `regles-b.mjs`), pose les insécables, valide le HTML, contrôle les radios par cadre et la **cohérence des données** (`coherence-vigie.py`) ;
- `ctrl-vigie.sh` : axe-core, débordements, ellipses, lignes qui défilent, barre latérale, cibles et textes (`consol-vigie.mjs` pour la console, `consol-admin-c.mjs` pour MV-10 avec la barre allemande « Sicherheit »), débordements selon la hauteur (`debord-hauteurs-vigie.mjs`, `-c.mjs`), annotations, formulaires, pied de la barre au toucher (MV-10, `p6-coarse-me-c.mjs`), focus visible et focus caché (`p2adm-focus.mjs --sans-inert`, `focus-colle.mjs`, tels quels), et depuis la passe 2 les essais des deux jurés (`essais-vigie.mjs`, repris de `jury-vigie-1/probe.mjs` et `jury-vigie-2/jury.mjs` : espacement du texte à 320, 412 et 1 440 px, contraste forcé, identifiants coupés, liens de même nom, mouvement réduit ; depuis la passe 3, d'après `jury-vigie-1/v2/essais-ouverts.mjs` et `jury-vigie-2/v2/details.mjs` : espacement et identifiants à 320 et 412 px avec tous les `<details>` ouverts, liens de même nom dans chaque cadre d'état, inert retiré ; `consol-vigie.mjs` et `consol-admin-c.mjs` refont aussi leurs débordements à 320 et 412 px `<details>` ouverts ; depuis les finitions, une commande en bloc ne se coupe qu'à une espace, vérifié aussi en espacement WCAG) ; `mesures-vigie.py` en tire le bloc « Mesures » de chaque page et le tableau ci-dessus ; `bandes-vigie.py` compose les rendus.

`coherence-vigie.py` relève dans les dix pages (écran principal, cadres d'état, annotations) les numéros d'alerte et de décision, les heures, les adresses et les comptes, et signale toute contradiction avec les tableaux de référence du lexique et entre les pages : numéro, adresse, compte ou heure absents du lexique ; une alerte avec une autre gravité, un autre mode ou une autre heure d'ouverture ; une décision avec un autre type ou une autre fin ; une adresse prêtée à une autre personne ; un autre dernier message Signal ; un texte retiré par les arbitrages ; un lien vers une adresse ou une ancre qu'aucune maquette ne montre ; un autre compte d'alertes ouvertes. Lancé sur les pages d'avant la consolidation, il relevait 60 contradictions ; sur les pages consolidées, 0. Il liste à part les liens vers ce qui est annoncé « à créer » (filtre par alerte, export CSV, ligne du journal, confirmation « Accepter comme référence… »).

## La consolidation du 18 oct. 2026

**Une feuille.** `ajouts-a.css`, `ajouts-b.css` et `ajouts-c.css` sont fusionnés dans `_vigie/vigie.css` (sections 0 à 18) et supprimés ; ce qui ne sert qu'à l'admin du site est dans `_vigie/admin-site.css` (sections 1 à 5). Deux classes portaient le même nom pour deux dessins (`.vg-garde` en A et en B, `.vg-filtres` en A et en B) ; des variantes du même besoin coexistaient. Renommés ou réunis : `.vg-garde` (réponse automatique) → `.vg-auto` ; `.vg-garde` (garde-fous de Décisions) → `.vg-refus` et sa liste `.vg-garde-fous`, la même que celle des Droits ; les filtres du journal et des règles → un seul `.vg-filtres` ; `.vg-dec` → `.vg-lignes` ; `.vg-decs` → `.vg-decisions` ; `.vg-evts` → `.vg-evenements` ; `.vg-roles` (rôles et modes) → `.vg-defs` ; `.vg-ent-l` → `.vg-lien` ; l'écart de réception `.ecart` et `.vg-ecart` → `.vg-ecart` ; trois `.action-rappel` → un ; les petits et moyens boutons, répétés dans neuf composants, → la section 17 ; `input.mono` (qui prenait le 12 px gris de `.mono` de l'admin) → `input.vg-mono`. Les générateurs n'ont plus qu'une tête (`commun.head`), un bandeau, une ré-authentification (`commun.reauth`), une portée de blocage, des données de décisions (`commun.DEC`) et un bloc « Mesures ».

**Ajouts au lexique.** MV-01 et MV-02 ont ajouté des mots au § 1 et leurs données au § 3.7, relevé six écarts (§ 3.8) tranchés au § 3.9 ; MV-03 à MV-10 ont ajouté leurs mots et données aux § 3.10 à 3.12, et leurs écarts ont été tranchés au § 3.13. La consolidation n'a pas réécrit ces paragraphes, qui sont l'historique : elle a corrigé les tableaux de référence (§ 3.1 à 3.6) et deux cellules du § 4 pour qu'ils disent l'état final, chaque correction marquée « (consol.) ».

## La passe 2 (jury v1, 18 oct. 2026)

Notes de 7 à 9 ; sous le seuil de 8 : MV-01, MV-02, MV-05 (juré 1), MV-06, MV-07 (juré 2). Les dix-huit points du § 3.14 du lexique, faits par les générateurs :

1. **Surveillance affaiblie** : motif, durée, page de confirmation, identité et alerte « Surveillance réduite » pour un interrupteur arrêté, une règle en Arrêt, une adresse de confiance (MV-06), une référence acceptée, une rupture dont on prend acte (MV-07) ; « Accepter comme référence » refusé tant que #413 est ouverte. L'arrêt des blocages par Julien à 14 h 10 a donc ouvert **#414** (Moyenne, Alerter, sur Signal à 14 h 10) : 6 alertes ouvertes, dernier message Signal à 14 h 10.
2. **Retours** : MV-01, MV-02, MV-05 (#89 créée, gel levé), MV-06, MV-08.
3. **Portée** sans choix par défaut, erreur sans script (MV-05). 4. **Adresse liée à un administrateur** : la confirmation de votre propre adresse (MV-02, MV-04, MV-05).
5. **MV-02** : « À faire maintenant », titre factuel, règle en sous-titre, en-tête compact au téléphone, levées nommées par leur objet.
6. **Ordre** : #413 avant #412, partout ; le lien profond `/alertes/413` (état de MV-02).
7. **MV-10** sans titre de règle, badge ▲ 3. 8. **Signal** avec la réponse ; phrase du favori dans l'e-mail. 9. **Clé d'accès** (MV-09).
10. **Amorce** : « Rendre Julien Analyste » refusé (MV-08). 11. **Lectrice** : MV-04 dessine la redirection vers le réseau ; `no-store`, `no-referrer`. 12. **Rafraîchissement** sans prolonger la session (MV-01). 13. **CSV** neutralisé (MV-03).
14. **Erreurs** : filtre (MV-03), seuil, adresse de confiance, autre durée (MV-06), retour local (MV-09). 15. **Accessibilité** : contraste forcé, identifiants insécables, liens de même nom distingués, mouvement réduit.
16. **Homogénéité** : pastille d'état unique, compteur neutre, légende à trois gravités, trois chiffres sur une ligne, identité en une ligne d'en-tête, moins de texte, codes en petit. 17. **Téléphone** : filtres et règles à points repliés, en-tête compact. 18. **Encarts** : styles à embarquer (D3), blocs « Mesures » par `mesures-vigie.py`.

Le lexique garde les § 3.7 à 3.14 comme historique ; ses tableaux de référence (§ 3.1 à 3.6) disent l'état final, les ajouts de la passe 2 marqués « (passe 2) ».

## La passe 3 (jury v2, 18 oct. 2026)

Notes de 7 à 9 (jury 1 : MV-06 et MV-07 à 7 ; jury 2 : aucune sous 8). Les treize points du § 3.15 du lexique, faits par les générateurs, avec les textes lus dans le code de la PR #121 (`vigie/notifications.js` : `reducedText`, `responseOf`, `lengthOf` ; `vigie/moteur.js`), montrés comme faits :

1. **Surveillance réduite à chaque geste** : #414 au texte exact (MV-10), un message par geste, hors du plafond, même Alertes arrêtées ; « Ce qui ne part jamais » corrigé (MV-10, état 11) ; descente de mode et seuil relevé compris ; une règle reprend à la fin le mode qu'elle avait avant (MV-06).
2. **#412** : « Réponse : compte gelé 24 h, sessions du compte fermées », mot pour mot (MV-02, MV-10). 3. **Motif obligatoire** sur chaque page de confirmation, et pour relever un seuil (MV-06, MV-07).
4. **Accepter comme référence** sans durée : un seul bouton « Accepter comme référence », en danger ; refusé tant que #413 est ouverte (MV-07).
5. **MV-06** : `regles-b.json` régénéré depuis main, 54 règles (2 Bloquer, 6 Alerter, 46 Observer), « Surveillance réduite » au mode figé ; DS22 ; « intégrité de la Vigie » en clair ; une règle à points montre ses points ; au téléphone, un seul « Arrêter… » par interrupteur ; un seul bouton plein par page de confirmation ; l'erreur d'un seuil n'étire pas ses voisins.
6. **MV-07** : commandes en blocs qui se coupent ; une seule pastille d'état. 7. **MV-01** : légende collée au tableau. 8. **MV-05** : « Décision #89 envoyée », puis « lue par le site à 14 h 23 », suivi de lecture à créer. 9. **MV-04** : « Fiche de l'adresse 192.0.2.77 ».
10. **MV-08** : couper tout de suite un compte de l'amorce en retirant son plafond `vigie.*` dans Zitadel. 11. **MV-09** : « Se reconnecter » en contour sur « Connexion refusée » (la page n'a plus de bouton plein) ; le contrôle de `amr` à vérifier en D3.
12. **MV-10** : le choix de la langue reste dans la barre, menus ouverts, à 320 px (états 8 et 10).
13. **Contrôles** : les essais du jury v2 intégrés à `ctrl-vigie.sh` ; les blocs « Mesures » sont réellement remplis (`commun.mesures` cherchait « MV-06 » là où le fichier dit « MV-06-reglages », et retombait en silence sur « à mesurer » : il cherche désormais par préfixe et s'arrête si la mesure manque).

Le lexique garde le § 3.15 comme historique ; ses tableaux de référence disent l'état final, les ajouts de la passe 3 marqués « (passe 3) ».

## Les finitions (jury v3, 18 oct. 2026)

Notes de 9 à 10 ; dernier tour, sans nouveau jury. Les sept points du § 3.16 du lexique, par les générateurs, avec les textes de la PR #124 (`reducedText`, `MODE_A`, `MODE_DE`) montrés comme faits :

1. **Commandes de MV-07** : chaque mot insécable, coupure aux espaces seulement ; le bloc défile seul s'il le faut. 2. **Essai** : seules les commandes en bloc sont exclues de l'essai des identifiants, et l'on y vérifie qu'aucune ligne ne se coupe dans un mot (à 320 et 412 px, `<details>` ouverts, et en espacement WCAG).
3. **MV-08** : « retirez son plafond `vigie.*` dans Zitadel : il perd l'accès dans les 5 minutes, et ne peut plus agir dès la requête suivante » ; relecture du plafond à créer en D3. 4. **MV-01** : la légende des gravités dans la légende (`caption`) du tableau.
5. **MV-06** : un seul « Arrêter… » par carte, au bureau aussi ; motif, durées et autre durée sur la page de confirmation (l'erreur d'une autre durée y est dessinée) ; l'identité confirmée reste dans l'en-tête au téléphone.
6. **Textes** : apostrophe typographique (« jusqu’à 15 h 10 ») ; descente de mode « passée de Bloquer à Observer » (MV-06, MV-10) ; synthèse au-delà de 60 gestes par heure (MV-10). 7. **Imitation** : SPF, DKIM et DMARC nommés pour l'e-mail de secours (MV-10, lexique).

## MV-11, flux et provenance des alertes (après validation, 18 oct. 2026)

Demandée par les photographes en validant MV-01 à MV-10 (§ 3.17 du lexique), sur le modèle du bilan énergétique de Lawrence Livermore : bandes proportionnelles, hachures pour les natures, part perdue en gris ; en courbes lisses, en « Chambre noire », avec du vide.

- **Mise en page** (`flux.py`, sans dépendance, déterministe : la référence de `vigie/flux.js` en D3) : chemins → nœuds et liens regroupés par teinte, nature et surlignage ; une échelle commune (1 px par événement au bureau, plafonnée), un ordre du métier pour les chemins et les issues, des barycentres pour les origines et les sources tant que les croisements pondérés diminuent ; chaque lien placé dans ses nœuds selon la position de l'autre bout ; des rubans en Bézier cubiques, tangents au flux aux deux bouts.
- **Données** (`flux_donnees.py`, partagé avec la vignette de MV-01) : les 319 événements du journal de MV-03 répartis par origine et par chemin, d'accord avec les sources de MV-03 et les occurrences des alertes de MV-01 (vérifié par des assertions et par `coherence-vigie.py`, règles F1 à F3).
- **Téléphone** : pivoté de haut en bas, en trois étages entre quatre listes ; à 320 px, un diagramme horizontal laisserait moins de 100 px aux rubans une fois les libellés posés à 13 px.
- **Essai** `flux-lisible.mjs` : de 320 à 1 440 px au pas de 16, aucun libellé du SVG qui en chevauche un autre, ni hors du cadre, ni sous 13 px ; chaque diagramme a son titre et sa description.
