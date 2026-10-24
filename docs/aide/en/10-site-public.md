# The site as visitors see it

What your visitors can do, so you know what your settings change.

## Themes by section

The appearance can vary by section: home, galleries, photos, map, trips, Journals, photographers, contact or information. The three existing layouts and six darkroom designs are available. Choose them in [Appearance → Themes and sections](apparence#thèmes-et-rubriques); installing the update does not change the published site.

In a darkroom design, opening images are selected manually, without autoplay. **Calm mode**, in the footer, reduces optional motion; the device’s reduced-motion setting is always respected. Photos retain related images and a mini-map when a location is published. Trips and Journals retain their features. Private galleries keep their dedicated layout.

When section themes are enabled, the Gallery menu opens `/galerie`, with its own theme. Journals remain accessible even with V1 as the general theme; they then use the V2 layout. The home page descriptions below refer to the existing V1 and V2 layouts.

## Languages

The site exists in **French** (usual addresses, `/photo/…`), **English** (`/en/…`) and **German** (`/de/…`).

- **What is translated:** menus, section titles, buttons, footer, dates (“oct. 2024”, “Oct 2024”, “Okt. 2024”), country names on the map. These texts are provided by the site, with no machine translation.
- **Your texts** (tagline, introduction, About, biographies, series names, titles, captions and places of photos): their English and German versions are **optional**; you fill them in in the admin (folded below each field, “in English and German”). If one is missing, another language is shown:
  - German page: German, otherwise French, otherwise English;
  - English page: English, otherwise French, otherwise German;
  - French page: French, otherwise English, otherwise German.
- **Selector:** at the end of the menu (and at the top of a photo’s page), the flag and language code (🇫🇷 FR). It opens the **same page** in another language, filters included. The choice is remembered (the site’s language cookie, set only at that moment; the only other cookie of the public website is that of a private gallery opened with its password).
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

## Forms in v2 (“I took your photo”, Report, Share)

When **v2** is applied, the “I took your photo” page (`/bonjour`), “Report this photo” and the **Share** page (the one that opens without script, or in a new tab) take the v2 design. The fields do not change: what the person sends, and what you receive, is the same as in v1.

- **One rule** at the top: all fields are required unless marked “optional”; each field’s help is written under its name (“Needed if you agree to a publication”).
- **After an incomplete submission**, what was entered is kept and each error is written under its field (under the group’s title for boxes), “⚠ Error:” then how to correct it; the tab title starts with “Error”. From two things to correct, a **summary** at the top receives the focus, with a link to each field; with only one, the cursor is already in the field.
- **Too many submissions from the same connection** (8 per hour on `/bonjour`, 5 on Report): a separate message, which is not an input error, asks to try again in an hour; nothing that was entered is lost.
- **After sending**, the title “Thank you, it’s noted.” (or the Report message) receives the focus; the card reference is recalled.
- **Share**: the viewer’s window, as a page, under a link back to the photo; with the script, **Copy link** works there too.
- The **gift photo** (`/pour-vous/…`) keeps its header reduced to the site name, with no menu or language.

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

**Camera and settings**: the camera, lens, focal length, shutter speed, aperture and sensitivity read from the EXIF of the original, in the lexicon’s order: “Fujifilm X-T5 · XF23mmF1.4 R LM WR · 23 mm · 1/1000 s · f/11 · ISO 160” (“18.3 mm” in English, “18,3 mm” in French and German). In v2 and v3, it is the **Camera and settings** line of the viewer’s data, after the photographer; in v1, a second line under the line with the number, series and place. Shown by default; the record’s **Show the camera and settings on the site** box hides it. Never the time in this place (it follows its own box), nor the exact location, nor the serial number.

## Visitor reports

The **Visitor reports** page (sidebar, People group; administrators and moderators) receives what visitors send through a photo's **Report** link: the type (should not be online, suggestion for the text, something else), the message, the visitor's language, and the address left for a reply (visible to administrators only; the moderator only knows that an address was left). Message and address are encrypted and erased after 12 months. A report never unpublishes anything by itself: open the photo and decide.

- **Mark as handled** files the report among the handled ones; the sidebar counter goes down.
- **Delete…** erases the message and the address; in admin v2, a dialog asks first (Cancel comes first).
- In admin v2, the **New** and **Handled** filters sort the list; each card names the photo, gives the type as a badge with a symbol and shows the message in its language.

## Messages and requests

The **Messages and requests** page (sidebar, People group; administrators, and photographers for their own) receives what visitors send through the **Contact** page (`/contact`) and a **licence request** (`/droits/demande`, opened by “Request a licence” under each photo in v2 and on the Rights page).

- **The list** (50 messages per page) shows no personal data: the type (message or licence request), the date, who it is addressed to, the photo and intended use of a request, the language, the status. A photographer sees the messages addressed to them (a licence request goes to the photographer of the photo) and those addressed to both.
- **Read** opens the message: name, company, email address, circulation and text. This reading is logged (“Message read”). The text is shown as is: a link is never clickable (be careful with a link or an address that imitates a publisher or a media outlet).
- **Reply by email** opens your mail program to the visitor's address. The site itself sends nothing to the visitor: no acknowledgement.
- **Mark as handled** files the message among the handled ones; **Delete…** erases it for good (in a disclosure in admin v1, a dialog in admin v2).
- Name, address and message are encrypted and erased 12 months after sending. “Today” counts the messages to read. If the site's mail server is set up, each photographer concerned receives “A new message is waiting for you” and the link to this page, with nothing from the message (30 emails a day at most; beyond that, the messages wait here).

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
- **Contact** (`/contact`, link in the footer of every page and from About, part “Write to us”): “Write to Sébastien, to Julien, or to both”: the recipient, the message, the visitor's name and email address. **Request a licence** (`/droits/demande`, prefilled with the photo from the v2 viewer and the Rights page): the photo, the intended use (book or press, website or social media, advertising, other), circulation and duration, the message, the name, the company, the address. Both arrive in [Messages and requests](site-public#messages-et-demandes); without JavaScript, with the same protections as `/bonjour` (hidden anti-robot field, sending from another site refused, 8 sends per hour and per connection, 50 messages a day in all: beyond that, the visitor is asked to come back the next day). Nothing is sent to the visitor.
- **Page not found:** for an unknown address or an unpublished photo.

## Other pages in v2

When **v2** is applied, the other pages of the site take the same design (header, full footer, same buttons):

- **Privacy, Legal notice:** the same text as in v1, with an **On this page** table of contents: a click leads to the chosen part. On a computer, the table of contents stays to the left of the text; on a phone, it opens the page and each part ends with **↑ Contents**. Short lines, easy to read; printed black on white, without the menu.
- **Terms of use, About:** the same text, in short lines; About shows your photographers, their biography and **See the photos by…** (without the logo at the top: the brand is in the header).
- **Search:** the same field, with its label and its help above; the photos found in rows. With no result (or before searching), the series to browse.
- **Map:** it opens **framed on your places** (with or without JavaScript); **World** shows the whole world. The name of each town is written next to its thumbnail when there is room. Each place in the list has its **↑ Map**.

  | Gesture | Effect |
  |---|---|
  | **+**, **−**, **World** | zoom in, out, whole world |
  | the four arrow buttons, or **← → ↑ ↓** on the keyboard (on a thumbnail or a button of the map) | move the map |
  | **+** and **−** on the keyboard | zoom in, out |

  A thumbnail outside the frame can no longer be reached with the keyboard.
- **Trips:** each trip with its cover in its own format; a trip's page shows the whole photo next to the title (no more title over the photo), the list of days, the map of the route (no sideways scrolling on a phone: the stops are numbered there, the labels only appear on a computer), then the days in rows.
- **Page not found:** a field to search for a photo, the gallery, the series, About; the language selector leads to the home page of each language.

## Always

- **Without JavaScript, with the keyboard, with a screen reader:** the site works.
- **Images:** they adapt to the screen (AVIF or WebP format, the right size).
- **Protection:**
  - right-clicking and dragging images are disabled;
  - the originals are never accessible;
  - draft photos are only visible in the admin.

## Automatic search metadata

[Settings → Search visibility](reglages#search-visibility) controls indexing requests. Titles, descriptions, photo information, sharing previews and the sitemap follow published content. Asking engines not to index the website does not restrict access; private galleries keep their existing protections. Search engines decide indexing, timing and result appearance.
