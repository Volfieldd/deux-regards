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

### Emblème (logo dessiné), nom et sous-titre

- **Emblème :** envoyez **le dessin seul, sans le texte**. Le site écrit lui-même le nom du site et le sous-titre avec ses polices : ils restent nets, accessibles et modifiables.
  - Formats : PNG, WebP ou JPEG.
  - Le trait peut être sombre sur fond clair, clair sur fond sombre, ou déjà détouré : le sens est détecté.
  - L'image est **transformée en masque** et recadrée au plus près du dessin. Sa couleur suit le thème : blanche sur la galerie noire, noire sur fond clair. Un seul fichier suffit pour tous les thèmes.
  - Une **icône d'onglet** (favicon) est générée : l'emblème clair sur carré sombre.
- **Marque :** « Nom du site seulement », ou « Emblème + nom (+ sous-titre) ».
- **Sous-titre :** par exemple « Photography gallery ».
- **Nom du site :** il se règle dans **Réglages**.

Sur téléphone, l'emblème est réduit et le sous-titre masqué sous 480 px de large.

> Les fichiers de marque sont rangés dans les données (`DATA_DIR/brand/`) et sauvegardés avec elles. Ils ne sont pas dans le dépôt Git.

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
},
```

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
