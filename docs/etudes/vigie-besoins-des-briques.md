# Ce que les nouvelles briques demandent à la Vigie

Registre tenu à chaque PR qui ajoute une brique au site (v2, Carnets, galeries privées, boutique…). Pour chaque surface
nouvelle ou modifiée, on se demande trois choses :

1. **Ce qu'un attaquant ou un abus pourrait y faire.**
2. **Si la Vigie le voit déjà** : quel événement le site émet (vocabulaire fermé de `server/securite/vocabulaire.js`,
   E1 à E24 de [l'étude](journalisation-securite.md) § 2.2) et à quel cas de détection il se rattache (DS1 à DS32,
   [§ 3](journalisation-securite.md#3-cas-de-détection) et `vigie/regles/`).
3. **Sinon, le besoin à verser à la Vigie** : un nouveau cas d'usage (numéroté ici `BV-n`, à renuméroter en `DS` par la
   Vigie quand elle le prend), avec l'événement à émettre, la règle, le seuil et la gravité proposés.

Ce registre ne code rien dans `vigie/` ni `server/securite/` : il liste. La Vigie décide, numérote et implémente ; elle
coche ici ce qu'elle a pris (colonne « Pris »).

Relevé du 18 octobre 2026, sur main après les PR #114, #115, #117, #119, #122 et #127, complété par la PR #129 (pages v2 sans formulaire).

Partage convenu le 18 octobre 2026 avec la session de la Vigie : elle prend BV-1, BV-2, BV-4 et BV-6 (`server/securite/`, `vigie/`, point d'émission dans `app.audit.log`) ; le site prend BV-3, BV-5 et BV-7 (et l'émission du partage par QR de BV-6), dans la PR `fix/vigie-bv3-bv5-bv7`.

### Suivi (colonne « Pris »)

| Besoin | Rattaché à | Pris | Où | État |
|---|---|---|---|---|
| BV-1 Réglage public sensible changé | DS9 (contact ou directeur de la publication), DS23 (après une session reprise) | ✓ Vigie | `feat/vigie-actions-admin` : point d'émission unique dans `server/securite/site.js`, événement `config_public_changed`, règles `vigie/regles/80-admin.yml` | fait |
| BV-2 Donnée personnelle rendue publique | DS18 | ✓ Vigie | même PR : `privacy_exposure_changed` (heure visible, EXIF complet), règles `exif_complet` et `heures_visibles_en_masse` | fait |
| BV-3 Valeurs de filtre impossibles | DS12 | ✓ site | `fix/vigie-bv3-bv5-bv7` | en cours |
| BV-4 Seuils DS15 face à la v2 | DS15 | ✓ Vigie | recalage sur le trafic de l'aperçu (phase D), sans changement avant d'avoir des chiffres | à faire |
| BV-5 Aucun lien interne vers une 404 | prérequis de DS15 | ✓ site | `fix/vigie-bv3-bv5-bv7` | en cours |
| BV-6 Statistiques gonflées | DS22 | ✓ Vigie et site | déjà couvert par `excess_rate_limit_exceeded` (1 point sur l'adresse) ; émission du partage par QR côté site | en cours |
| BV-7 Referer de la photo offerte | durcissement | ✓ site | `fix/vigie-bv3-bv5-bv7` | en cours |
| BV-8 Saisie de recherche impossible | DS12 | site (prochain lot) | `input_validation_fail`, la règle DS12 existante s'applique | à faire |
| BV-9 Recherches en rafale | DS15, DS22 | site (prochain lot) | limite et `excess_rate_limit_exceeded` ; la Vigie compte déjà 1 point par dépassement | à faire |

---

## Constat transversal : la Vigie ne voit pas les changements faits dans l'admin

Le journal d'audit de l'admin (`app.audit.log`, table `audit_log`) n'est lu ni par `server/securite/` ni par `vigie/`.
La Vigie voit les connexions, les sessions, les refus de droits et de CSRF, les saisies et les pièges, mais pas **ce
qu'un compte légitime fait une fois entré**. Or les briques récentes ajoutent des réglages qui changent ce que voient
tous les visiteurs ou ce qui est publié d'une personne. Un compte volé (session reprise, DS2 ; nouvel appareil, DS4) qui
s'en sert ne déclenche rien aujourd'hui.

**BV-1 — Réglage public sensible changé.** Émettre un événement (proposition : `config_public_changed`, gravité `bas`,
composant `site · admin`) quand change un réglage qui touche tous les visiteurs ou qui sert de point de contact :
version du site public (`public_version`, PR #115), mentions légales et hébergement (`legal_*`, PR #114), adresse de
contact de la confidentialité, accroche et ouverture de l'accueil, thème publié. Détail : clé du réglage, ancienne et
nouvelle valeur **sauf** si elle contient une donnée personnelle (alors seulement « modifiée »). Règle : alerte `moyen`
si l'adresse de contact ou le directeur de la publication change (une adresse de contact remplacée sert à hameçonner les
personnes photographiées qui exercent leurs droits) ; `haut` si le changement vient d'une session marquée par DS2, DS3
ou DS4 dans l'heure (corrélation DS23). Se rattache à DS9, qui ne couvre aujourd'hui que l'empreinte des variables
d'environnement.

**BV-2 — Donnée personnelle rendue publique.** Émettre un événement (proposition : `privacy_exposure_changed`, gravité
`info`, composant `site · admin`) quand un compte rend publique une donnée qui dit où était une personne et quand :
case « Montrer l'heure sur le site » cochée (`photos.show_time`, PR #117), mode EXIF passé à « Tout l'EXIF » (GPS et
heure dans les images servies), photo d'une personne liée à une rencontre publiée. Règle : plus de 20 photos rendues
« heure visible » en 10 minutes par un compte, ou « Tout l'EXIF » activé : alerte `moyen` (`haut` avec DS2/DS4). Se
rattache à DS18 (accès inhabituel aux données personnelles), qui ne couvre aujourd'hui que les **lectures** et exports.

Implémentation suggérée pour les deux : un seul point d'émission dans `app.audit.log` (une liste des actions qui
intéressent la Vigie), plutôt qu'un `emit` à chaque route.

---

## Par brique

| PR | Surface | Abus possible | Déjà vu par la Vigie | Besoin |
|---|---|---|---|---|
| #114 correctifs | Formulaire Droits et confidentialité : 4 champs d'hébergement, téléphone et e-mail exigés | compte volé qui remplace l'adresse de contact ou l'hébergeur | CSRF (`authz_csrf_fail`, DS14), droit `reglages.droits` (`authz_fail`, DS10) | **BV-1** |
| #114 correctifs | Menu de l'admin sans script (`#admin-nav`) | — (ancre locale, aucune requête) | — | aucun |
| #115 v2 | `POST /admin/apparence/apercu-v2` | ouverture par une page tierce ; aperçu par un compte sans droit | `authz_csrf_fail` (DS14), `authz_fail` (DS10) | aucun (l'aperçu ne touche que la session) |
| #115 v2 | Réglage `public_version` | bascule de tout le site public par un compte volé | rien | **BV-1** |
| #115 v2 | Pages publiques en `private, no-store` pendant l'aperçu | — | — | aucun |
| #117 heure | Case `show_time` de la fiche photo | publication en masse de l'heure et du lieu (localiser des personnes) | `authz_fail` hors portée (DS10), CSRF (DS14) | **BV-2** |
| #117 heure | Images servies recalculées au changement de la case | — | `upload_rejected` ne s'applique pas | aucun |
| #119 test | Galerie sans animation au retour | — | — | aucun |
| #122 v2 | Filtres de galerie `?regard=`, `?serie=`, `?ordre=` | valeurs forgées (sondage, injection) | DS11 (crochet commun sur la requête) pour les motifs d'injection | **BV-3** |
| #122 v2 | Galerie en rangées, `sizes` par plage, diaporama | — | DS15 (aspiration), règle bordure `bordure_rafale` | **BV-4** (faux positifs) |
| #122 v2 | Menu v2 vers `/#galerie`, `/#series` ; `/galerie` et `/series` en 404 | lien interne cassé qui ferait compter des 404 à des visiteurs | `malicious_excess_404` (E17, DS15 exploration lente) | **BV-5** (faux positifs) |
| #127 v2 | `/bonjour` (mêmes champs, champ piège `website`) | robot, envoi depuis un autre site, rafale, code de carte deviné | `malicious_honeypot`, `input_validation_fail` (DS12, « Origin étranger sur /bonjour »), `excess_rate_limit_exceeded`, `token_guess` (DS16) | aucun |
| #127 v2 | Signaler | idem | idem | aucun |
| #127 v2 | Partager sans script : « Copier le lien » désormais compté par `POST /photo/<slug>/partage` | gonfler les statistiques de partage | `gate()` : `input_validation_fail` (autre site), `excess_rate_limit_exceeded` | **BV-6** (seuils) |
| #127 v2 | Photo offerte `/pour-vous/<jeton>` | jeton deviné ; fuite du jeton par le Referer | `token_guess` (DS16) | **BV-7** (durcissement, hors Vigie) |
| #129 v2 | Recherche `?q=` (formulaire GET, 100 caractères) | injection, sondage | `malicious_input` (E14) par le crochet commun, DS11, DS22, DS23 ; identique en v1 et v2 | **BV-8**, **BV-9** |
| #129 v2 | Carte, voyages, 404 v2 | parcours systématique, scanners | `malicious_excess_404` (E17, DS15/DS16), piège (E18), règle `bordure_rafale` | aucun |
| #129 v2 | Pages légales et confidentialité | — (texte identique à la v1, journal de sécurité compris) | — | aucun |

### BV-3 — Valeurs de filtre impossibles

`server/routes/public.js` (`readFilter`, ~l. 213) **ignore** sans rien dire un `regard`, une `serie` ou un `ordre`
inconnus. Un navigateur qui suit l'interface ne produit jamais ces valeurs (les filtres sont des liens) : c'est
exactement le signal de DS12. Proposition : émettre `input_validation_fail` (raison « valeur de filtre hors liste »,
paramètre, valeur tronquée à 60 caractères et échappée) quand l'un d'eux est présent et inconnu ; la règle DS12
existante (2 en 10 minutes par adresse) s'applique telle quelle. Exception à prévoir : une série ou un photographe
**supprimé** depuis moins de 30 jours (liens anciens, moteurs de recherche) n'émet pas.

### BV-4 — La galerie v2 et l'aspiration (DS15)

La v2 charge plus d'images par page (rangées, plus de vignettes au premier écran, diaporama de l'accueil qui charge une photo
à chaque pas quand on le lance) et des tailles qui dépendent de l'écran. Deux règles de DS15 risquent des faux
positifs :

- « **toutes les tailles d'une même photo** » : faire pivoter un iPad, redimensionner une fenêtre ou passer en plein
  écran dans la visionneuse demande légitimement deux ou trois tailles de la même photo ;
- « plus de **300 images** en 10 minutes » : une visite attentive de la galerie complète en v2, au bureau, en demande
  environ une par photo publiée, plus les tailles de la visionneuse.

Proposition : à la bascule de la v2 pour tous (et dès l'aperçu, sur les sessions d'administrateurs), relever les seuils
sur le trafic réel d'une semaine d'aperçu ; ne compter « toutes les tailles » que si elles arrivent **sans** la page HTML
correspondante ni la feuille de style ; garder le parcours systématique (slugs dans l'ordre, sans `Accept-Language`)
comme signal principal. À faire avec le recalage des seuils prévu en phase D.

### BV-5 — Aucun lien interne vers une 404

`malicious_excess_404` compte les pages introuvables par adresse. Un lien cassé dans la v2 ferait monter le score
d'adresse (DS22) de visiteurs ordinaires. Pas d'événement nouveau : un **prérequis** côté site, un test qui parcourt tous
les liens internes des pages v2 (fr, en, de) et exige zéro 404, à lancer avant la bascule de la v2. Les adresses
`/galerie` et `/series` restent des 404 voulues tant qu'aucun lien n'y mène (testé par la PR #122).

### BV-6 — Statistiques gonflées (J'aime, partages)

Les J'aime et partages sont comptés par adresse et limités (`gate()`). La v2 ajoute le compte des « Copier le lien »
depuis la page sans script. Aucun événement nouveau ; proposition : que la Vigie suive le rapport
`excess_rate_limit_exceeded` / envois acceptés sur `partage` et `aime` pour recaler la limite (phase D), et rattache une
rafale sur ces deux routes au score d'adresse (DS22) plutôt qu'à DS15.

### BV-8 — Saisie de recherche impossible pour le formulaire

Le champ de recherche est limité à 100 caractères et n'existe qu'une fois. Le serveur coupe une saisie plus longue et
garde un seul `q` sans rien dire. Une saisie plus longue, ou un `q` répété, ne vient donc pas de l'interface : c'est le
signal de DS12. Proposition : `input_validation_fail` (raison « saisie de recherche hors formulaire », longueur, nombre
de `q`), gravité `moyen` ; la règle DS12 existante s'applique.

### BV-9 — Recherches en rafale

Aujourd'hui, ni limite ni signal côté site sur `/recherche` (seule la règle `bordure_rafale` le voit, si le Worker
Cloudflare est installé). Proposition : une limite par adresse (60 en 10 minutes) qui, une fois atteinte, répond 429 et
émet `excess_rate_limit_exceeded` (détail : `limite: 'recherche'`), gravité `bas`, rattachée à DS15 et au score
d'adresse (DS22).

### BV-7 — Referer de la photo offerte (durcissement, pas un cas de détection)

La page `/pour-vous/<jeton>` pose `Referrer-Policy: no-referrer`, mais le crochet `onSend` de `server/app.js` (~l. 290)
réécrit tous les en-têtes de sécurité à la fin et le remplace par `strict-origin-when-cross-origin`. Les autres sites ne
reçoivent que l'origine, jamais le jeton : risque faible. Correctif : ne pas réécrire `referrer-policy` quand la route
l'a déjà posé. Même question pour `/partage/instagram/<jeton>` et `/bonjour/<réf>-<code>`. Rien à détecter ; noté ici
parce que le fichier est partagé avec la Vigie.

---

## Pour les briques à venir (à compléter à leur étude)

| Brique | Surfaces prévues | Besoins pressentis pour la Vigie |
|---|---|---|
| Carnets (MQ-11, MQ-12, MQ-20) | routes `/carnet/…`, éditeur de billet dans l'admin, paramètre `?carnet=` de la visionneuse | DS11 sur le contenu des billets (saisie riche : XSS stocké) ; BV-1 pour la publication d'un billet ; BV-3 pour `?carnet=` inconnu ; permissions nouvelles à ajouter au contrôle des rôles |
| Galeries privées (MQ-16 à MQ-18) | lien temporaire + mot de passe, partage à des personnes choisies | nouveaux événements : mot de passe de galerie faux (proche E1/E19), lien expiré rejoué ; cas : force brute sur une galerie (DS16 étendu, verrouillage), lien partagé utilisé depuis de nombreuses adresses (fuite du lien) ; BV-1 pour la création et la prolongation d'un accès |
| Admin v2 (MQ-07 à MQ-10) | choix v1/v2 par compte, nouveaux écrans | le choix par compte n'intéresse pas la Vigie ; garder le bandeau critique et les badges de la phase C sur les gabarits v2 |
| Boutique (plus tard) | panier, paiement, commandes, factures | à étudier à part : fraude au paiement, énumération de commandes, données de facturation (DS18) |
