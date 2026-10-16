# Apparence et thèmes

L'apparence du site public se règle dans **Admin → Apparence**, sans toucher au code. Un nouveau thème s'ajoute en un fichier CSS et quelques lignes. L'admin garde toujours son apparence propre.

## Dans l'admin

### Choisir un thème

1. Ouvrir **Apparence**. Chaque thème est présenté avec ses trois couleurs (fond, encre, accent) et une description.
2. Cliquer sur **Aperçu** : le site s'ouvre dans un nouvel onglet avec ce thème.
   - **Vous seul** le voyez : il faut être connecté à l'admin.
   - Un bandeau le rappelle en haut de page.
   - L'aperçu suit la navigation pendant une heure, ou jusqu'à **Quitter l'aperçu**.
3. Pour l'appliquer à tous les visiteurs : cocher le thème, puis **Enregistrer l'apparence**.

Thèmes fournis :

| Thème | Esprit |
|---|---|
| **Atelier** | Le thème d'origine : papier chaud, Cormorant Garamond en italique, accent « lampe inactinique ». |
| **Nicephos — nuit** | D'après le logo : galerie noire, trait blanc, capitales espacées en Jost léger, sans italique, accent sable. |
| **Nicephos — jour** | La même identité sur fond blanc, encre noire. |

### Marque : quatre emplacements

Chaque emplacement accepte un PNG, un WebP ou un JPEG (5 Mo et 6000 px de côté au plus). Les SVG sont refusés : ils peuvent contenir du script, et les PNG aux bonnes tailles suffisent.

| Emplacement | Fichier à envoyer (kit Nicephos) | Où il apparaît |
|---|---|---|
| **Emblème (dessin)** | le dessin seul, sans texte | en-tête, à côté du nom, sur ordinateur |
| **Icône (version simplifiée)** | `NICEPHOS_icone_noir_512x512.png` | icône d'onglet et d'écran d'accueil ; en-tête sur téléphone, où le trait fin du dessin deviendrait illisible |
| **Logo complet** | `NICEPHOS_horizontal_noir_4320x1400.png` | en grand, en tête de la page « À propos » |
| **Image de partage** | `NICEPHOS_carre_noir_1080x1080.png` | aperçu quand une page sans photo (À propos, Droits…) est partagée sur un réseau social |

- **Emblème, icône, logo complet :** ils sont **transformés en masque**, recadrés au plus près du dessin. Leur couleur suit le thème : blanc sur la galerie noire, noir sur fond clair. La version noire ou blanche du kit donne le même résultat.
- **Icône d'onglet :** une icône carrée et opaque est reprise telle quelle. Sinon, l'icône d'onglet est composée (dessin clair sur carré sombre), à partir de l'icône simplifiée ou, à défaut, de l'emblème.
- **Image de partage :** elle est utilisée telle quelle, réencodée sans métadonnées, 1200 px de côté au plus.
- **Marque :** « Nom du site seulement », ou « Emblème + nom (+ sous-titre) ». Le nom et le sous-titre sont écrits par le site avec ses polices : nets, accessibles et modifiables. Le nom se règle dans **Réglages**.
- **Remplacer ou retirer :** chaque emplacement se remplace ou se retire indépendamment ; l'ancien fichier est effacé.

Sur téléphone, le sous-titre est masqué sous 480 px de large.

> Les fichiers de marque sont rangés dans les données (`STORAGE_DIR/brand/`, soit `DATA_DIR/brand/` sur l'hôte en Docker), servis sous `/brand/`, et sauvegardés avec elles. Ils ne sont pas dans le dépôt Git, qui est public.

## Créer un thème

Un thème, c'est :

- une **entrée** dans `server/themes.js` ;
- une **feuille de style** dans `public/themes/`, qui redéfinit des variables sous une classe posée sur `<html>`.

La mise en page, elle, ne change pas.

### 1. La feuille : `public/themes/mon-theme.css`

```css
.theme-mon-theme {
  --paper: #fbfaf7;          /* fond */
  --ink: #1b1b1b;            /* texte principal */
  --mute: #63605a;           /* texte secondaire : ≥ 4,5:1 sur --paper */
  --prose: #45423d;          /* paragraphes */
  --rule: #e3e0d9;           /* filets */
  --field: #8a867e;          /* bordure des champs de formulaire : ≥ 3:1 sur --paper */
  --frame: #efece6;          /* fond des images pendant leur chargement */
  --safelight: #2f5d50;      /* accent : états actifs, pastilles */
  --on-accent: #ffffff;      /* texte posé sur l'accent */
  --serif: 'Cormorant Garamond', Georgia, serif;   /* police des titres */
  --sans: Jost, Arial, sans-serif;                 /* police du texte */
  --display-style: italic;   /* titres en italique (normal pour les redresser) */
  color-scheme: light;       /* « dark » pour un thème sombre */
}
/* Règles ponctuelles, toujours préfixées par la classe du thème : */
.theme-mon-theme .idx { letter-spacing: .1em; }
```

Variables disponibles :

| Variable | Rôle |
|---|---|
| `--paper` | fond des pages |
| `--ink` | texte principal |
| `--mute` | texte secondaire (compteurs, pied de page, navigation) |
| `--prose` | paragraphes |
| `--rule` | filets |
| `--field` | bordure des champs des formulaires (« Je vous ai photographié », « Signaler ») : au moins 3:1 sur `--paper` (WCAG 1.4.11) |
| `--frame` | fond des images avant leur chargement |
| `--safelight` | accent (sélection, pastille, liens actifs) |
| `--on-accent` | texte posé sur l'accent |
| `--dark`, `--dark-ink`, `--dark-mute`, `--dark-rule` | ouverture et visionneuse, toujours sombres |
| `--serif` | police des titres |
| `--sans` | police du texte |
| `--display-style` | italique ou non des titres |
| `--gut` | marges latérales |

Polices disponibles, auto-hébergées : Cormorant Garamond (400 et 500, droit et italique), Jost (300, 400, 500) et IBM Plex Mono (400, 500). Une autre police doit être ajoutée à `@fontsource` puis déclarée dans `public/css/site.css` : le site ne charge **rien** depuis un autre domaine.

### 2. L'entrée : `server/themes.js`

```js
'mon-theme': {
  label: 'Mon thème',
  description: 'Une phrase qui le décrit dans l’admin.',
  stylesheet: 'themes/mon-theme.css',
  classes: 'theme-mon-theme',      // classes posées sur <html>
  scheme: 'light',                  // ou 'dark'
  preload: '/fonts/jost/files/jost-latin-300-normal.woff2',   // facultatif : police chargée en priorité
},
```

`preload` : la police la plus visible du thème (celle du texte ou des titres de l'ouverture), chargée en priorité dès le début de la page. Sans `preload`, aucune police n'est préchargée : n'en déclarez pas une que le thème n'utilise pas (le navigateur la téléchargerait pour rien).

Plusieurs variantes peuvent partager une feuille : c'est le cas de Nicephos (`theme-nicephos mode-nuit` et `theme-nicephos mode-jour`).

### 3. Les pastilles de l'admin : `public/admin/admin.css`

```css
.swatch-mon-theme i:nth-child(1) { background: #fbfaf7; }
.swatch-mon-theme i:nth-child(2) { background: #1b1b1b; }
.swatch-mon-theme i:nth-child(3) { background: #2f5d50; }
```

### 4. Vérifier

1. `npm test` : chaque thème déclaré doit avoir sa feuille.
2. Appliquer le thème sur le serveur de test.
3. `npm run e2e` : l'audit d'accessibilité axe contrôle notamment les **contrastes** de toutes les pages publiques avec le thème appliqué.
