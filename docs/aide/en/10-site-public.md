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

## Home page, gallery and series in v2

When **v2** is applied (Appearance → Public site: v1 or v2), these pages change as follows:

- **Opening:** the **whole** photo, at the height of the screen, with no veil or text on top; below it, your tagline as the title and its label (title, photographer, place, date, **View photo**). The slideshow is **stopped**: the dots choose a photo, **Play** starts it (one photo every 6 seconds), **Pause** stops it; it waits under the mouse, stops as soon as the keyboard enters the opening, and does not run if the visitor asked for less motion. Only the first photo loads with the page. The frame takes the widest format of your opening photos: a vertical one among horizontals fits whole, narrower.
- **Two points of view:** “Both” leads to the gallery of the home page, a photographer to their gallery (`/auteur/julien`).
- **Series:** a row of covers (the first photo of each series), each leading to its series page.
- **Gallery:** at the bottom of the home page (`/#galerie`). A **filter** bar (the photographer, the **Order** in a menu, the series with their cover and number of photos); each choice opens a page with its own address, to share, without script. Beyond the phone, the bar stays at the top of the screen while scrolling.
- **Rows:** each photo keeps its format (a vertical stays vertical), at a common height, and **in the order of the photo library**: the first row reads from left to right, then the next; the keyboard follows the same order. On a phone, two photos per row at most.
- **Two filters with no photo in common** (a shared address, for example “Travel, by Julien”): the page says so and offers the whole series or all the photographer’s photos; each filter is removed in one gesture (**✕**).
- **A series page** (`/serie/rue`): its name as the title, the number of photos, the photographers and the years, then the photos from the first screen (no large cover), “The same series, one photographer” and the other series.

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

**Like and Report**: under each photo’s text, a **Like** heart (anonymous: no account, no cookie; visitors can take their like back, and the count is shown next to it; two people behind the same connection, the same home router for instance, count a single like per photo for 12 hours) and a **Report** link: a photo that should not be online, a suggestion for the text, something else, with a message and an optional address. Someone who recognises themselves is sent to `/bonjour`. Reports arrive in “Today” and on the **Visitor reports** page, opened from **Reports** in the sidebar (with the number of new ones), even once everything is handled (the address left there is only visible to administrators; the moderator reads the message); the number of likes is shown in the Audience section of the photo’s page.

**Share**: next to the heart. On a phone, it opens the phone’s share menu (Instagram, Signal, Messages, WhatsApp…). On a computer, a window shows the preview (image, title, photographer, site), the WhatsApp, Facebook, Bluesky, X, Pinterest and Email buttons, **View on Instagram** if the photo was posted from the site, the link to copy and a QR code to open the photo on a phone. The page is shared, never the file. These are plain links: no script from these services is loaded, no cookie is set. Without JavaScript, the button leads to a page with the same links. Shares are counted anonymously (see [Statistics](statistiques)).

**Where and nearby**: if the photo’s record has **Show on the world map** ticked, a small map is shown next to the text, framed on its town. The photo’s thumbnail appears in a circle, and the other photos taken within 250 km as markers, with their town’s name; each marker leads to its photo. Below the photo, the **Nearby** row shows the closest ones, with their town and distance. Only photos ticked “on the map” appear, and only the town is known, never the exact position. The **See the world map** link appears if the Map page is published.

**Date and time**: the photo’s date as you entered it (to the month or to the day). The shooting time only appears if the record ticks **Show the time on the site** and the date is to the day: “1 May 2025, 2:32 pm” (“14 h 32”, “14:32 Uhr”), in the caption and the “Place, date and time” line. It is only shown on the photo’s page, never in the gallery, Nearby, the map or the sharing previews.

## Other pages

- **About:** full logo, tagline, text, authors’ biographies.
- **Trips** (as soon as a trip is published, see [Photographed people](rencontres#les-voyages)): the list of trips, then one page per trip. At the top, a large photo, the name, the dates, the photographers, then the text. Next, a **map framed on the trip**: the route as a dotted line, a numbered marker per stop (two days in a row at the same place make one), and a “D1 · 1 Sept · Lisbon” label linked to each stop; clicking a stop leads to its day. Finally, the **day by day** story, with each day’s published photos, in the order they were taken (the large photo is the first one, as in the admin). Only published photos appear, and the map only places those ticked “Show on the world map” (without any, no map). On phones, the map slides with a finger.
- **Search** (if offered, see [Public site](reglages#search)): a field, then the photos found, most relevant first. Every word must be found; the start of a word is enough (“mis” finds “mist”); accents and capitals do not matter; ß, œ, æ, ø count as ss, oe, ae, o (“strasse” finds “Straße”). For equal relevance, the gallery order. A one-letter word is not enough: the page asks for at least two. Result pages are not indexed by search engines.
- **Usage rights:** terms, contact and information on audience measurement, in three languages: `/droits` (French), `/en/droits` (English), `/de/droits` (German). The language selector in the menu switches between them (the old addresses `/droits/en` and `/droits/de` lead to the new ones). The texts are set in [Rights & privacy](reglages#droits-et-confidentialité).
- **Map** (if you have published it in [Public site](reglages#carte-du-monde)): a world map in the theme’s colours, with a round thumbnail of a photo on each town and, in a badge, the number of photos from that town. Towns too close to be told apart are grouped (combined number); a click on the group zooms the map in until they separate. Below the map, the list of places with their photos; a click on a thumbnail on the map leads there.

  | Gesture | Effect |
  |---|---|
  | **+**, **−**, **World** | zoom in, zoom out, back to the whole world |
  | pinch (phone), **Ctrl + scroll wheel** or trackpad pinch | zoom at the targeted spot |
  | drag (zoomed-in map) | move around |

  As you zoom in, the background becomes more detailed (coastlines, borders, small islands): only the displayed area is loaded. The scroll wheel alone and vertical swiping on the whole-world map scroll the page, as elsewhere. Without JavaScript, the map is fixed and the list of places stays complete.
- **“I took your photo”** (`/bonjour`): the page behind the QR code on consent cards and clothing (`/bonjour/J`: with the photographer’s name), with no link in the menu (see [Encounters](rencontres)).
- **Legal notice** (`/mentions-legales`, “Impressum” in German, linked in the footer of every page): publishers, address, contact (email as a link, phone), person responsible for the content (publication director), hosting (see [Rights & privacy](reglages#mentions-légales-impressum)).
- **Privacy** (`/confidentialite`, in three languages, linked in the footer): who is responsible, what the site collects and why, for how long, who receives it, and how to exercise your rights (see [Rights & privacy](reglages#droits-et-confidentialité)).
- **Page not found:** for an unknown address or an unpublished photo.

## Always

- **Without JavaScript, with the keyboard, with a screen reader:** the site works.
- **Images:** they adapt to the screen (AVIF or WebP format, the right size).
- **Protection:**
  - right-clicking and dragging images are disabled;
  - the originals are never accessible;
  - draft photos are only visible in the admin.
