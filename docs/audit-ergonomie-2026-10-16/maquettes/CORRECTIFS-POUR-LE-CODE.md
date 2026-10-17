# Correctifs à reporter dans main (relevés par le jury v1 des maquettes, 16 oct. 2026)

Rien n'a été modifié dans main. Ce fichier dit précisément quoi changer, où, et comment le vérifier. Les § 5 à 7 viennent de la passe 3 (administration), les § 8 et 9 du jury v2 (passe 4), le § 10 de la finalisation des maquettes (avant le jury final), les § 11 et 12 du jury final (passe 5, 17 oct. 2026). Les maquettes (dossier `docs/audit-ergonomie-2026-10-16/maquettes/_commun/`) appliquent déjà ces corrections dans `admin-plus.css` et `tokens.css`, sans toucher à leur copie d'`admin.css`, qui reste identique à main ; pour l'app de terrain (§ 5), dans un bloc « Ajouts des maquettes » à la fin de leur copie d'`app.css`, le reste du fichier restant identique à main.

## 1. Le focus est invisible sur un champ en erreur (à corriger en premier)

**Constat.** RGAA 10.7, WCAG 2.4.7 (AA). Dans l'administration, un champ qui porte `aria-invalid="true"` n'a plus de focus visible : son rendu est identique, pixel pour pixel, avant et après le focus (preuve du jury : `dr-work/jury-v1/out2/focus-planche.png`). C'est précisément le champ vers lequel le résumé d'erreurs et le message d'erreur envoient l'utilisateur.

**Cause.** `public/admin/admin.css`, lignes 142 et 143 :

```css
input:focus, select:focus, textarea:focus { outline: none; box-shadow: inset 0 0 0 2px var(--accent-ink), 0 0 0 4px var(--accent-soft); }
[aria-invalid="true"] { box-shadow: inset 0 0 0 1.5px var(--danger) !important; }
```

Le focus d'un champ est dessiné par `box-shadow` (le contour est retiré : `outline: none`), et la règle de l'erreur remplace ce `box-shadow` avec `!important`. Il ne reste que le filet rouge, focus ou pas.

**Correctif.** Dans `public/admin/admin.css`, ajouter juste après la ligne 143 (sans la modifier) :

```css
/* Erreur ET focus, visibles ensemble : le filet rouge reste (dedans), l'anneau du focus s'ajoute (dehors).
   Contour --accent-ink de 2 px à 2 px du bord : 9,3:1 sur --s1 en sombre ; en clair 5,4:1 sur blanc, 4,7:1 sur --s2 (≥ 3:1 exigé). */
:is(input, select, textarea, button)[aria-invalid="true"]:is(:focus, :focus-visible) {
  outline: 2px solid var(--accent-ink) !important;
  outline-offset: 2px !important;
  box-shadow: inset 0 0 0 2px var(--danger), 0 0 0 4px var(--accent-soft) !important;
}
```

Pourquoi elle l'emporte : spécificité (0,2,1), plus forte que `[aria-invalid="true"]` (0,1,0) ; les deux sont `!important`. Elle vaut aussi pour les cases et boutons radio en erreur (le contour est dessiné, même là où `box-shadow` ne l'est pas).

**Pages touchées** (gabarits qui posent `aria-invalid`) : `views/admin/photo.eta`, `batch.eta`, `series.eta`, `authors.eta`, `cards.eta`, `_encounter-form.eta`. Le site public (`views/bonjour.eta`, `views/report.eta`) n'est pas touché : son focus est un `outline` (`site.css`, ligne 44), que la règle d'erreur (`.hello-form [aria-invalid="true"] { border-color … }`, ligne 248) ne retire pas.

**Vérification.** Ouvrir une fiche de photo, saisir « demain matin » dans la date, enregistrer : le champ revient en erreur ; tabuler jusqu'à lui (ou suivre le lien du résumé). On doit voir le filet rouge **et** l'anneau ambre. Contrôle automatique possible dans les tests de bout en bout (Playwright) : comparer `getComputedStyle(champ).outlineStyle` avant et après `champ.focus()` (« none », puis « solid »), en thème clair et en sombre.

## 2. Le bouton danger se confond avec le bouton principal en « Chambre noire »

**Constat.** En thème sombre, `--danger: #e8743b` (orangé, 19° de teinte) et `--accent: #f0a94c` (ambre, 36°) ne diffèrent que de 1,5:1 en luminance : « Supprimer la photo » et « Publier » ont presque la même couleur, la même forme et le même texte foncé.

**Correctif** (`public/admin/admin.css`, ligne 20, bloc `:root` du thème sombre) : remplacer

```css
--danger: #e8743b; --on-danger: #1b0a04; --danger-soft: rgba(232,116,59,.12);
```

par

```css
--danger: #f0605a; --on-danger: #1b0a04; --danger-soft: rgba(240,96,90,.13);
```

`#f0605a` est un rouge (2°) : 5,8:1 sur `--s1` (texte d'erreur), 6,0:1 avec `--on-danger` (texte du bouton plein), 1,6:1 avec l'ambre. Le thème clair (`#b2410a`) ne change pas. Ajouter en plus, dans les gabarits, l'icône ✕ (ou la corbeille) devant le verbe des boutons `.btn.danger` pleins (dialogues de suppression, de dépublication) : la teinte ne porte jamais seule le sens. Corriger aussi le commentaire des lignes 18-19 (« bleu / jaune / vermillon ») en « bleu / jaune / rouge ».

## 3. Le numéro de version de la barre latérale est en 10 px

`public/admin/admin.css`, ligne 1140 : `.nav-ver { margin-left: auto; font-size: 10px; … }`. L'échelle de l'administration ne descend pas sous 12 px. Remplacer `font-size: 10px` par `font-size: 12px` (et, pour une donnée, `font-family: var(--mono)`, comme le reste des numéros).

## 4. Un libellé long de bouton est coupé au téléphone

`public/admin/admin.css`, ligne 152 : `.btn { … white-space: nowrap; … }`. En allemand, à 320 px, « Julien zur Veröffentlichung vorschlagen » sort de l'écran dans la barre d'actions du bas. Ajouter :

```css
@media (max-width: 720px) {
  .btn { white-space: normal; text-wrap: balance; line-height: 1.25; padding-block: 6px; text-align: center; }
}
```

(La ligne 1017 le fait déjà pour quelques blocs ; cette règle le généralise au téléphone.)

## 5. App de terrain : le focus est invisible sur un bouton radio en erreur, et le bouton inactif est pâli

**Constat.** RGAA 10.7 et 11.10, WCAG 2.4.7 et 3.3.1. Dans l'app de terrain (`views/admin/app.eta`), quand l'envoi est refusé parce qu'un choix manque (« Âge », « Décision »), seul l'encadré `.app-errors` du haut le dit : le groupe de boutons radio n'est marqué ni par `aria-invalid` ni par un filet. Et si on lui en donne un en `outline` (le seul dessin qu'un bouton radio natif accepte), il prend la place de l'anneau du focus : `public/admin/app.css`, ligne 25, `input:focus { outline: 2px solid var(--ink); outline-offset: 1px; }` écrit le même `outline`, et l'erreur et le focus ne se voient plus ensemble. Le bouton « Envoi… » inactif est rendu par `opacity: .6` (ligne 58, `.app-save[disabled]`) : un aplat gris de 4,3:1 avec son texte, qui ressemble encore au bouton plein ; le site et l'administration dessinent un bouton inactif en contour.

**Correctif.** Dans `views/admin/app.eta`, poser `aria-invalid="true"` sur les boutons radio du groupe refusé, et `aria-describedby` sur son `<fieldset>` vers la phrase d'erreur écrite juste sous la légende (dans la langue de la personne, comme le reste de sa section). Puis, à la fin de `public/admin/app.css` (le bloc est déjà dans la copie des maquettes, `_commun/app.css`, « Ajouts des maquettes ») :

```css
/* Boutons radio et cases en erreur : un filet rouge collé ; au focus, l'anneau encre s'ajoute dehors, le filet reste. */
:is(input[type="radio"], input[type="checkbox"])[aria-invalid="true"] { outline: 2px solid var(--ko); outline-offset: 1px; }
input[type="radio"][aria-invalid="true"] { border-radius: 50%; }
:is(input[type="radio"], input[type="checkbox"])[aria-invalid="true"]:focus-visible { outline: 2px solid var(--ink) !important; outline-offset: 4px; box-shadow: 0 0 0 2px var(--ko); }
/* Bouton inactif pendant l'envoi : en contour, jamais un aplat pâli. */
.app-save[disabled], .app-save[aria-disabled="true"] { opacity: 1; background: transparent; color: var(--mute); box-shadow: inset 0 0 0 1.5px var(--field); cursor: progress; }
/* Texte lu seulement : clip-path, la forme actuelle (clip est déprécié). */
.sr-only { clip-path: inset(50%); }
```

`--ko` (#b2410a) fait 5,2:1 sur le papier, l'encre 15,5:1, le filet `--field` du contour 3,3:1 (≥ 3:1, WCAG 1.4.11). La maquette MQ-10 l'écrit `var(--error, var(--ko))`, parce qu'elle charge aussi les jetons du site.

**Vérification.** Ouvrir `/admin/rencontre`, cocher « Accord », signer, ne pas répondre à « Âge », envoyer : les deux boutons radio portent le filet rouge ; tabuler jusqu'à eux : l'anneau encre apparaît à 4 px, le filet reste. Playwright : `getComputedStyle(radio).outlineOffset` vaut « 1px » puis « 4px » après `radio.focus()`. Pendant l'envoi (réseau lent simulé), « Envoi… » se lit en contour.

## 6. Mentions légales : le téléphone et l'e-mail sont obligatoires

**Constat.** UX-T-03 ; LCEN art. 1-1 (ex-art. 6-III-1) : une personne physique qui édite un site doit donner ses nom et prénom, son domicile, son numéro de téléphone et une adresse de courrier électronique ; l'Impressum allemand (§ 5 DDG) exige aussi un moyen de contact électronique rapide. Or `views/admin/settings.eta`, lignes 49 et 50, présente l'e-mail comme facultatif (« vide : celui de la confidentialité ») et le téléphone comme « facultatif » ; `legalMissing` (`server/legal.js`, l. 56 à 63) ne compte pas le téléphone, et accepte comme e-mail le contact de la confidentialité, qui peut être une adresse de formulaire et non un e-mail. Les mentions se disent complètes sans le téléphone.

**Correctif.**
- `views/admin/settings.eta`, l. 49 : libellé « E-mail de contact », aide « Publié en lien sur la page. », `type="email" autocomplete="email"`, sans « vide : … » ; l. 50 : libellé « Téléphone », aide « Dû, puisque vous hébergez le site. » (ou, avec le champ du § 7 réglé sur un hébergeur tiers, « Dû par la loi pour une personne qui édite un site. »), `inputmode="tel" autocomplete="tel"`, sans « facultatif ».
- `server/legal.js`, `legalMissing` : ajouter `if (!String(s.legal_phone || '').trim()) missing.push('phone');` et ne plus accepter `privacy_contact` à la place de `legal_email` que s'il s'agit d'une adresse e-mail (`contactLink(…)?.startsWith('mailto:')`, comme `server/routes/public.js`, l. 574).
- L'avertissement de l'onglet (« Incomplètes : … ») et le résumé d'erreurs de MQ-07 nomment alors le téléphone et l'e-mail quand ils manquent ; le texte d'aide de la l. 44 (« un e-mail ») ajoute « un téléphone ».

**Vérification.** Vider le téléphone dans les réglages : l'onglet « Mentions et confidentialité » signale la rubrique manquante ; le remplir : le signal disparaît, la page `/mentions-legales` affiche « Téléphone : … » sous Contact (déjà rendu par `LEGAL.fr.sections`, l. 13).

## 7. Mentions légales : un champ « Hébergement » (nouveau)

**Constat.** La rubrique « Hébergement » des mentions est écrite en dur dans `server/legal.js` (l. 15 à 18 en français, l. 30 et 45 pour l'anglais et l'allemand) : « hébergé par ses éditeurs, sur leur propre serveur, en France » et Cloudflare. C'est vrai aujourd'hui, mais un déménagement chez un hébergeur rendrait la page fausse sans qu'aucun réglage ne le montre ; et la LCEN (art. 1-1) demande alors le nom, l'adresse et le téléphone de l'hébergeur.

**Correctif** (MQ-07, onglet « Mentions et confidentialité », sous « Responsable de la publication ») : un groupe de deux boutons radio `legal_host` (« Par les éditeurs, sur leur serveur » · « Chez un hébergeur »), avec une phrase d'effet sous chaque choix (« La page le dit, avec l'adresse et le téléphone ci-dessus. » · « Son nom, son adresse et son téléphone seront demandés. ») ; le second fait apparaître trois champs (`legal_host_name`, `legal_host_address`, `legal_host_phone`), obligatoires dans `legalMissing` quand il est choisi. `server/admin-repo.js` (l. 490) enregistre ces quatre réglages (texte, 200, 400 et 40 signes). `server/legal.js` : la rubrique « Hébergement » (FR, EN, DE) rend la phrase actuelle pour « éditeurs » (valeur par défaut, aucun changement de la page publiée aujourd'hui) et, pour « hébergeur », « Le site est hébergé par {nom}, {adresse}, {téléphone}. » (DE « Die Website wird gehostet von … »), la phrase sur Cloudflare restant dans les deux cas.

**Vérification.** Sans toucher au réglage, `/mentions-legales` est identique (test de bout en bout : capture du texte avant et après la migration). Choisir « Chez un hébergeur » sans remplir les trois champs : l'onglet signale « 3 rubriques obligatoires à remplir » ; les remplir : la page publique nomme l'hébergeur, en trois langues.

## 8. Au téléphone, sans JavaScript, le menu de l'administration est hors d'atteinte (passe 4, jury v2)

**Constat.** WCAG 2.1.1 et critère 4 de la grille (usage sans JavaScript). Sous 720 px, `public/admin/admin.css` (l. 562) cache la barre latérale (`.side { transform: translateX(-102%); visibility: hidden }`) ; seule la classe `.open`, posée par le script (`public/admin/admin.js`, l. 316 à 327), la montre, et le bouton « Menu » de la barre d'onglets (`views/admin/layout.eta`, l. 172) est un `<button type="button" data-menu>`. Sans script, Réglages, Personnes, Signalements, Boutique, Carnets et Galeries privées ne sont joignables au téléphone qu'en tapant leur adresse (preuve du jury : `dr-work/jury-v2/admin/demo/demo.json`, `tel-menu-js-false.png` : `visibility` reste `hidden`).

**Correctif.**

- `views/admin/layout.eta`, l. 172 : le bouton devient un lien vers la barre, que le script transforme en bouton :
  `<a href="#admin-nav" data-menu><%~ ic('menu', 22) %><%= t('Menu') %></a>` ;
- en haut de la barre (`<aside class="side" id="admin-nav">`, à côté du nom du site), un lien « Fermer » visible au téléphone seulement, qui rend le focus au contenu :
  `<a class="side-fermer" href="#contenu"><%~ ic('x', 18) %><%= t('Fermer') %><span class="sr-only"> <%= t('le menu') %></span></a>` (le `<main>` a déjà `id="contenu" tabindex="-1"`) ;
- `public/admin/admin.css`, dans `@media (max-width: 720px)`, après `.side.open` : `.side:target { transform: none; visibility: visible; transition: transform .2s; }` ; et le style de `.side-fermer` (caché au-delà de 720 px ; 44 px de haut au téléphone), repris de `admin-plus.css` § 1 des maquettes ;
- `public/admin/admin.js`, menu mobile : au chargement, le lien est remplacé par le bouton d'aujourd'hui, `<button type="button" data-menu aria-expanded="false" aria-controls="admin-nav">` (même classe, même contenu ; html-validate refuse un `role="button"` posé sur un lien, et un vrai bouton n'a pas besoin de `preventDefault`) ; le lien « Fermer » appelle `set(false)` et rend le focus au bouton.

**Menu ouvert, le clavier reste dans le panneau (passe 5, jury final, défaut D2 ; WCAG 2.4.11, AA ; RGAA 10.7 et 12.8).** Le panneau (280 px, fixe) couvre la page sans la retirer : dans main avec le script, comme dans le correctif ci-dessus sans script, la tabulation passe du dernier lien du menu au contenu, puis à la barre d'onglets, sous lui (jury final, `menu-focus.mjs` : 13 éléments dans MQ-07, 17 dans MQ-09 ; `outils/focus-colle.mjs`, passe « menu ouvert » : 10 « CACHÉ » sur Pixel 7 dans MQ-07, 3 dans l'échantillon menu ouvert de MQ-00). Ce n'était écrit nulle part ; c'est à créer :

- sans script, `public/admin/admin.css`, dans `@media (max-width: 720px)` : `body.admin:has(> .shell > .side:target) > .shell > .main, body.admin:has(> .shell > .side:target) > :not(.shell, .skip) { visibility: hidden; }` (la page, la barre d'onglets, le message d'action et la fenêtre « Nouveautés » ; `visibility` les retire aussi de la tabulation ; le lien d'évitement reste ; « Fermer » est dans le panneau) — repris d'`admin-plus.css` § 1 des maquettes ;
- avec le script, `public/admin/admin.js`, dans `set(open)` : `for (const el of [$('.shell > .main'), ...document.querySelectorAll('body > :not(.shell, .skip, script)')]) el.inert = open;` — la page reste visible sous son voile, mais ni le clavier ni un lecteur d'écran n'y entrent ; à la fermeture (bouton, « Fermer », Échap, clic dehors), `inert` est retiré et le focus revient au bouton « Menu ».

**Vérification.** Navigateur au téléphone (412 px), JavaScript coupé : « Menu » ouvre la barre (l'adresse finit par `#admin-nav`) ; ses liens mènent où ils disent ; Tab depuis le dernier lien du menu ne va plus sur la page ni sur la barre d'onglets ; « Fermer » la referme et le focus est sur le contenu. Avec JavaScript : l'adresse ne change pas, `aria-expanded` suit l'état, `document.querySelector('.shell > .main').inert` vaut `true` menu ouvert et `false` fermé. Les maquettes le montrent (`admin-plus.css` § 1, échantillons de MQ-00 dont « menu ouvert », MQ-07 à MQ-09, MQ-18 à MQ-20) ; `outils/focus-colle.mjs` les parcourt menu ouvert (0 élément caché).

## 9. Au téléphone, le focus passe sous la barre d'onglets ; la palette n'a pas de focus visible (passe 4, contrôle outillé)

**Constat.** WCAG 2.4.11 (AA) et 2.4.7, RGAA 10.7. Sous 720 px, la barre d'onglets (`.tabbar`, fixe, 74 px) et, sur une fiche, la barre d'actions placée au-dessus couvrent le bas de l'écran : un champ atteint au clavier (Tab) s'y arrête dessous, entièrement caché (relevé par `dr-work/outils/focus-colle.mjs` sur les maquettes MQ-07 à MQ-20, qui reprennent ces barres de main). Au bureau, la barre « Pour les photos cochées » (`.main:not(.wide) .bulk`, collante, `admin.css` l. 381) cache de même les champs du lot en Shift+Tab. Dans la palette Ctrl K, `admin.css` l. 328 (`.pal-in input { box-shadow: none !important; }`) retire tout dessin au champ : son focus ne se voit pas.

**Correctif** (`public/admin/admin.css`) :

```css
@media (max-width: 720px) {
  html:has(> body.admin .tabbar) { scroll-padding-bottom: 90px; }        /* 74 px de barre + une marge */
  html:has(> body.admin .ep-actions) { scroll-padding-bottom: 155px; }   /* barre d'actions de la fiche au-dessus */
}
@media (min-width: 721px) { html:has(> body.admin .main:not(.wide) .bulk) { scroll-padding-top: 136px; } }
.pal-in:focus-within { box-shadow: inset 0 -2px 0 var(--accent-ink); }
```

(Dans main, la barre d'actions fixe de la fiche s'appelle autrement : reprendre son sélecteur.) Même chose pour l'en-tête collant de l'app de terrain (`public/admin/app.css`, `.app-bar`) : `html:has(.app-bar) { scroll-padding-top: 88px; }`.

**Vérification.** `run-pw.sh focus-colle.mjs` sur une page de main capturée (ou sur les maquettes) : aucun élément entièrement caché, au bureau, sur Pixel 7 et à 320 px ; dans la palette, le champ montre un trait ambre au focus.

## 10. App de terrain : sans JavaScript, la langue choisie pour la personne ne change pas son texte (finalisation, d'après MQ-10)

**Constat.** Grille, critère 4 (usage sans JavaScript) ; WCAG 3.1.2 (langue des passages). Dans l'app de terrain, on tend le téléphone à la personne photographiée ; elle choisit sa langue (« Français », « English », « Deutsch », boutons radio `data-lang-pick`, `views/admin/app.eta`, l. 58). Le texte qui lui est destiné (l'accord, ses portées, « J'accepte », « Je refuse », « Plus tard ») est écrit dans les trois langues (`[data-l]`, l. 61 à 73), et `public/admin/app.css`, l. 37, n'en montre qu'une, celle de `data-lang` sur le formulaire. Or `data-lang` est posé par le serveur (l. 28) et seul le script le change (`public/admin/app.js`, l. 63 : `form.dataset.lang = r.value`). Sans script (réseau de terrain qui charge mal, script bloqué), la personne coche « English » et continue de lire le français.

**Correctif.** À la fin de `public/admin/app.css` (le bloc est déjà dans la copie des maquettes, `_commun/app.css`, « Ajouts des maquettes », passe 4) : la case cochée décide, par `:has()`, là où le navigateur le comprend ; ailleurs, la règle de la l. 37 et le script restent.

```css
/* La langue de la personne change SANS script : la case cochée décide, par :has(). La règle de la ligne 37 (data-lang, posé
   par le serveur, changé par app.js) est neutralisée là où :has() existe, et reste celle des autres navigateurs. Les éléments
   [data-l] n'ont pas d'affichage propre (des span, et le div .app-l10n) : revert leur rend celui du navigateur. */
@supports selector(:has(*)) {
  .app-form[data-lang] [data-l]:not([data-l=""]) { display: revert; }
  .app-form:has([data-lang-pick][value="fr"]:checked) [data-l]:not([data-l="fr"]),
  .app-form:has([data-lang-pick][value="en"]:checked) [data-l]:not([data-l="en"]),
  .app-form:has([data-lang-pick][value="de"]:checked) [data-l]:not([data-l="de"]) { display: none; }
}
```

Pourquoi elle l'emporte : `.app-form:has(…:checked) [data-l]:not(…)` a une spécificité plus forte que la règle de la l. 37 ; `display: revert` rend d'abord à chaque texte son affichage, puis la seule langue cochée reste. Le script garde son rôle (il pose `data-lang`, que le serveur relit à l'envoi pour la langue de l'e-mail) ; il n'est plus nécessaire à l'affichage. Une quatrième langue s'ajoute par une ligne de plus.

**Vérification.** Navigateur au téléphone, JavaScript coupé : `/admin/rencontre`, cocher « Deutsch » : l'accord, les portées et les trois réponses passent en allemand, `lang="de"` compris ; « English » : en anglais. Avec JavaScript : comportement actuel. Playwright : `page.check('[data-lang-pick][value="de"]')` sans script (`javaScriptEnabled: false`), puis `getComputedStyle(document.querySelector('.app-l10n[data-l="fr"]')).display` vaut « none » et celui de `[data-l="de"]` « block ». La maquette MQ-10 le montre (repère « La langue de la personne, sans drapeau » : English coché, la section en anglais ; état « En allemand : le nom du parent manque ») ; contrôle des maquettes : `dr-work/outils/p4adm-langue.mjs`.

## 11. Mentions légales : « Directeur de la publication », le terme de la loi (passe 5, jury final)

**Constat.** Grille, critère 7 (signifiance) ; jurys finaux du site public et de l'administration. Main nomme la rubrique et le réglage « Responsable de la publication ». La loi dit « directeur de la publication » : LCEN (loi n° 2004-575), **art. 1-1**, issu de la loi SREN n° 2024-449 du 21 mai 2024 (en vigueur depuis le 23 mai 2024), qui reprend l'ancien art. 6, III, 1 : l'éditeur met à disposition « le nom du directeur ou du codirecteur de la publication et, le cas échéant, celui du responsable de la rédaction au sens de l'article 93-2 de la loi n° 82-652 du 29 juillet 1982 » ; l'art. 93-2 de la loi de 1982 impose à tout service de communication au public en ligne d'« avoir un directeur de la publication ». « Responsable de la publication » est un usage courant, mais inexact, et il se confond avec le « responsable de la rédaction », un autre rôle de la même phrase. Les maquettes (MQ-06, MQ-07, planche, lexique § 1) écrivent déjà « Directeur de la publication ».

**Correctif** (texte seulement ; ni le nom du réglage `legal_director` ni le modèle ne changent) :

| Fichier | Ligne | Aujourd'hui | À écrire |
|---|---|---|---|
| `server/legal.js` | 1 (commentaire) | `Mentions légales (France, LCEN art. 6)` | `Mentions légales (France, LCEN art. 1-1, ex-art. 6 depuis la loi SREN)` |
| `server/legal.js` | 10 | `` description: site => `Mentions légales du site ${site} : éditeurs, contact, responsable de la publication, hébergement.` `` | `… éditeurs, contact, directeur de la publication, hébergement.` |
| `server/legal.js` | 14 | `['Responsable de la publication', [d.director].filter(Boolean)]` | `['Directeur de la publication', [d.director].filter(Boolean)]` |
| `server/legal.js` | 55 (commentaire) | `… noms, adresse postale, e-mail, responsable.` | `… noms, adresse postale, e-mail, directeur de la publication.` |
| `views/admin/settings.eta` | 52 | `t('Responsable de la publication')` | `t('Directeur de la publication')` |
| `server/admin-i18n/80-mentions.json` | 42 | clé `"Responsable de la publication"` | clé `"Directeur de la publication"` (mêmes traductions : EN « Person responsible for the content », DE « Verantwortlich für den Inhalt ») |
| `server/todo.js` | 104 | `t('obligatoires en France et en Allemagne : éditeurs, adresse postale, responsable')` | `t('obligatoires en France et en Allemagne : éditeurs, adresse postale, directeur de la publication')`, et la même clé dans `80-mentions.json`, l. 54 (EN « …, publication director », DE inchangé « Verantwortliche ») |
| `docs/aide/09-reglages.md` | 52 et 54 | « **Responsable de la publication** : une personne… » ; « (noms, adresse, e-mail, responsable) » | « **Directeur de la publication** : la personne qui répond de ce qui est publié (LCEN, art. 1-1)… » ; « (noms, adresse, e-mail, directeur de la publication) » |
| `docs/aide/10-site-public.md` | 72 | « …, contact, responsable de la publication, hébergement » | « …, contact, directeur de la publication, hébergement » |

L'allemand (« Verantwortlich nach § 18 MStV », rubrique « Verantwortlich für den Inhalt ») et l'anglais (« Responsible for the content ») de `server/legal.js` restent : ce sont les termes de leur droit ou une traduction descriptive. Le rapport d'audit (`docs/audit-ergonomie-2026-10-16/README.md`, UX-T-03 et V0-04) cite la rubrique de main entre guillemets : il garde ses citations et dit le terme juste dans sa recommandation.

**Vérification.** `grep -rn "esponsable de la publication" server views docs/aide` : plus rien ; `/mentions-legales` affiche la rubrique « Directeur de la publication » ; `npm test` (les tests qui lisent le texte des mentions, s'il y en a, suivent).

## 12. Nom lu du bouton de langue : le code visible y manque (passe 5, jury final)

**Constat.** WCAG 2.5.3 (nom accessible contenant l'étiquette visible, niveau A), RGAA 6.1. `views/langs.eta`, l. 4 : `<summary aria-label="<%= t.nav.langCurrent %>">…<span><%= lang.toUpperCase() %></span></summary>`. L'`aria-label` (« Langue : français ») remplace tout le contenu du `<summary>` : la commande vocale « clique sur FR » ne trouve rien, puisque « FR », la seule étiquette visible, n'est pas dans le nom. Les maquettes (planche et toutes les pages du site) lisent « FR – Langue : français » : le code visible, puis le nom du code.

**Correctif.** `views/langs.eta`, l. 4 : retirer l'`aria-label` et mettre le nom du code en texte masqué après le code visible ; le drapeau reste décoratif.

```html
<summary><img class="flag" src="<%= flag(lang) %>" alt="" width="20" height="14"><span><%= lang.toUpperCase() %></span><span class="sr-only"> – <%= t.nav.langCurrent %></span></summary>
```

La classe `.sr-only` existe déjà (`public/css/site.css`, l. 46). Nom lu : « FR – Langue : français », « DE – Sprache: Deutsch », « EN – Language: English ». La liste garde `aria-label="<%= t.nav.lang %>"` (« Langue »), et la navigation `aria-label="<%= t.nav.label %>"` (« Navigation ») : rien d'autre ne change.

**Vérification.** Playwright sur `/` puis `/de/` : le nom accessible du `<summary>` (`page.locator('[data-lang-pick] summary')`, `toHaveAccessibleName`) vaut « FR – Langue : français », puis « DE – Sprache: Deutsch » ; axe-core avec la règle `label-content-name-mismatch` (étiquetée « experimental », à activer) : 0 violation.

## 13. « Lieu » et « Ville » : deux champs, un seul mot en allemand (passe 5, jury final, d'après MQ-08)

**Constat.** Critère 6 de la grille (homogénéité) ; RGAA 11.1 (étiquettes pertinentes). La fiche d'une photo a deux champs distincts : « Lieu » (`place`, texte libre affiché sous la photo, `views/admin/photo.eta` l. 84, et la colonne « Lieu » de `batch.eta`) et « Ville » (`city_label`, pour la carte du monde, liste GeoNames, l. 87). En allemand, `server/admin-i18n` les traduit tous deux par « Ort » : la fiche allemande montre deux champs « Ort ».

**Correctif.** `server/admin-i18n` (fichier qui porte « Ville ») : `"Ville": { "en": "Town for the map", "de": "Stadt für die Karte" }`, « Lieu » restant « Ort » ; dans la fiche, l'intitulé de la ville peut aussi devenir « Ville de la carte » en français (les maquettes l'écrivent ainsi : lexique § 1).

**Vérification.** `/admin/photos/24` en allemand : « Ort » puis « Stadt für die Karte ».

## Ce qui n'est pas un défaut de main

- La barre latérale de main a déjà Nouveautés et la version, « Traitement : n photos », la langue et le thème en formulaires POST : ce sont les maquettes qui les avaient perdus (corrigé dans la planche MQ-00 et `admin-plus.css`).
- Le lien « Séries » n'apparaît dans main que pour `series.gerer` (`layout.eta`) : main est juste ; c'est la variante Photographe des maquettes qui menait à une page 403 (corrigé).
- Le salut « Bonsoir » après 18 h est déjà dans `views/admin/home.eta`.
- Le bouton de thème de la barre de 220 px (tablette, 721 à 1 180 px) : main le garde (36 × 36 à 820 et à 1 024 px, démo du jury final) ; ce sont les maquettes de la passe 4 qui l'avaient masqué pour garder le nom du compte entier (jury final, défaut D1). Corrigé dans `admin-plus.css` § 1 : le bouton reste, c'est l'avatar, décoratif, qui s'efface à cette largeur. Main peut faire de même pour ne plus couper le nom par une ellipse (`.who`, `admin.css` l. 94), sans urgence.
- Le formulaire « Réactiver » d'un compte désactivé (MQ-09) : la route `POST /admin/comptes/:id` (`server/routes/admin.js`, l. 1051) lit les rôles cochés ; un formulaire qui n'envoie que `status` vide les rôles, et `accounts.update` met alors le compte « en attente » (`server/accounts.js`, l. 140). Main est juste : son formulaire envoie toujours les cases `roles` ; c'est la maquette qui les oubliait (corrigé : `roles=relecteur` en champ caché).
