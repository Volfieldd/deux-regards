# The site as visitors see it

What your visitors can do, so you know what your settings change.

## Languages

The site exists in **French** (usual addresses, `/photo/…`), **English** (`/en/…`) and **German** (`/de/…`).

- **What is translated:** menus, section titles, buttons, footer, dates (“oct. 2024”, “Oct 2024”, “Okt. 2024”), country names on the map. These texts are provided by the site, with no machine translation.
- **Your texts** (tagline, introduction, About, biographies, series names, titles, captions and places of photos): their English and German versions are **optional**; you fill them in in the admin (folded below each field, “in English and German”). If one is missing, another language is shown:
  - German page: German, otherwise French, otherwise English;
  - English page: English, otherwise French, otherwise German;
  - French page: French, otherwise English, otherwise German.
- **Selector:** at the end of the menu (and at the top of a photo’s page), the flag and language code (🇫🇷 FR). It opens the **same page** in another language, filters included. The choice is remembered (the site’s only cookie, set only at that moment).
- **Language on arrival** on a French page, if the visitor has not chosen anything:
  - French-speaking countries (France, Monaco, overseas territories, French-speaking Africa…): French;
  - Germany, Austria, Liechtenstein: German;
  - Belgium, Switzerland, Luxembourg, Canada: the browser language decides (a woman from Zurich gets German, a Dutch-speaking Belgian gets English);
  - elsewhere: English; unknown country (local network): the browser language.
- **Never redirected:** search engine robots (each language is indexed at its own address, linked to one another), link previews, and any address under `/en/` or `/de/` (a shared link opens in the language chosen by the person who shared it).

## Home page

- **Opening slideshow:**
  - full-screen photos that change every 6 seconds;
  - thumbnails to choose a photo;
  - **Pause** button to stop the slideshow (it becomes **Play** to restart it);
  - the slideshow also stops while the mouse or keyboard is on it.
- **Two perspectives:** “Both”, or one photographer. The gallery is filtered **without reloading the page**, and the address changes (`/auteur/julien`): it can be shared.
- **Series:** the index in large type. Hovering shows a photo from the series; one click filters, a second click removes the filter. Filters combine with the perspectives.
- **Order:** above the grid, **Selection** (the order you chose in the photo library, by default) or **Most recent** (by publication date, latest published first). The order combines with the filters, keeps its address (`?ordre=recentes`) and also applies to the previous and next photo. The date used is that of the **first** publication: a photo unpublished and then republished keeps its place.
- **Gallery:** all published photos, in the admin’s order.

## Viewer (a photo’s page)

| Gesture | Effect |
|---|---|
| **→** or swipe left | next photo |
| **←** or swipe right | previous photo |
| **Esc**, “Close” or the browser’s Back button | back to the series (or the gallery), with the same filter and at the spot you left |
| pinch (phone) | zoom into the photo |
| **Read more** | expands a long caption (3 lines otherwise); you read it by scrolling the page, **Show less** folds it again |

The first screen shows the photo, its title and the beginning of the caption; a short caption is shown in full. On phones, the ‹ › arrows are below the text.

The next photo depends on the active filter: in “Street, by Julien”, you stay within that selection.

**Back to the series:** moving from one photo to the previous or next one does not pile up in the browser history. After viewing ten photos, **a single** Back (or **Close**, or **Esc**) returns to the series, at the height where you left it, and the last photo viewed is brought back into view.

**Like and Report**: under each photo’s text, a **Like** heart (anonymous: no account, no cookie; visitors can take their like back, and the count is shown next to it) and a **Report** link: a photo that should not be online, a suggestion for the text, something else, with a message and an optional address. Someone who recognises themselves is sent to `/bonjour`. Reports arrive in “Today” and on the **Visitor reports** page; the number of likes is shown in the Audience section of the photo’s page.

## Other pages

- **About:** full logo, tagline, text, authors’ biographies.
- **Usage rights:** terms, contact and information on audience measurement, in three languages: `/droits` (French), `/en/droits` (English), `/de/droits` (German). The language selector in the menu switches between them (the old addresses `/droits/en` and `/droits/de` lead to the new ones). The texts are set in [Rights & privacy](reglages#droits-et-confidentialité).
- **Map** (if you have published it in [Public site](reglages#carte-du-monde)): a world map in the theme’s colours, with a round thumbnail of a photo on each town and, in a badge, the number of photos from that town. Towns too close to be told apart are grouped (combined number); a click on the group zooms the map in until they separate. Below the map, the list of places with their photos; a click on a thumbnail on the map leads there.

  | Gesture | Effect |
  |---|---|
  | **+**, **−**, **World** | zoom in, zoom out, back to the whole world |
  | pinch (phone), **Ctrl + scroll wheel** or trackpad pinch | zoom at the targeted spot |
  | drag (zoomed-in map) | move around |

  As you zoom in, the background becomes more detailed (coastlines, borders, small islands): only the displayed area is loaded. The scroll wheel alone and vertical swiping on the whole-world map scroll the page, as elsewhere. Without JavaScript, the map is fixed and the list of places stays complete.
- **“I took your photo”** (`/bonjour`): the page behind the QR code on consent cards and clothing (`/bonjour/J`: with the photographer’s name), with no link in the menu (see [Encounters](rencontres)).
- **Legal notice** (`/mentions-legales`, “Impressum” in German, linked in the footer of every page): publishers, address, contact, person responsible for the content, hosting (see [Rights & privacy](reglages#mentions-légales-impressum)).
- **Privacy** (`/confidentialite`, in three languages, linked in the footer): who is responsible, what the site collects and why, for how long, who receives it, and how to exercise your rights (see [Rights & privacy](reglages#droits-et-confidentialité)).
- **Page not found:** for an unknown address or an unpublished photo.

## Always

- **Without JavaScript, with the keyboard, with a screen reader:** the site works.
- **Images:** they adapt to the screen (AVIF or WebP format, the right size).
- **Protection:**
  - right-clicking and dragging images are disabled;
  - the originals are never accessible;
  - draft photos are only visible in the admin.
