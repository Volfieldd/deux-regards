# Polices du filigrane

Polices du site converties en TTF pour le rendu du filigrane côté serveur (`server/watermark.js`) :
la version de Pango fournie avec `sharp` ne lit pas les formats WOFF/WOFF2 servis aux navigateurs.

Ce sont des versions modifiées (format, nom de famille) : conformément à la licence SIL OFL 1.1,
elles portent un nom de famille propre (« Filigrane … »), unique et sans ambiguïté pour fontconfig.

| Fichier | Famille | Source (@fontsource, sous-ensemble latin) | Licence |
|---|---|---|---|
| `Filigrane-Sans.ttf` | Filigrane Sans | Jost 500, `jost-latin-500-normal.woff2` | SIL OFL 1.1, `LICENSE-jost.txt` |
| `Filigrane-Serif.ttf` | Filigrane Serif | Cormorant Garamond 500 italique, `cormorant-garamond-latin-500-italic.woff2` | SIL OFL 1.1, `LICENSE-cormorant-garamond.txt` |
| `Filigrane-Mono.ttf` | Filigrane Mono | IBM Plex Mono 400, `ibm-plex-mono-latin-400-normal.woff2` | SIL OFL 1.1, `LICENSE-ibm-plex-mono.txt` |

Conversion (fontTools) : `TTFont(woff2)`, `flavor = None`, noms 1/2/4/6 remplacés, 16/17 retirés.
