# Public site, rights and privacy

Two pages in the **Publish** and **Settings** groups of the sidebar; each one only saves its own fields.

## Public site

What visitors see. Tagline, introduction and “About” each have an optional **English and German** version, folded below the French field (“… in English and German”; the status shows *optional*, *1 language of 2* or *translated*). Empty: English and German visitors read the French text (see [The site as visitors see it](site-public)). The **Suggest a translation** button pre-fills a field (see [Photos](photos), “A photo’s record”).

| Field | Where it appears |
|---|---|
| **Site name** | text logo, page titles, the watermark’s `{site}` variable. Empty: the server’s default name. |
| **Tagline** | title of the home page’s “perspectives” section, title of “About”, description for search engines |
| **Introduction** | text below the tagline, on the home page |
| **About** | “About” page. Separate paragraphs with a blank line. |
| **World map** | see below |
| **Opening slideshow photos** | the full-screen slideshow on the home page, in the chosen order (see below) |

### World map

**Publish the world map** box, unticked by default. Ticked: the `/carte` page is open to visitors, a **Map** link appears in the site menu, and the page is added to `sitemap.xml`. Unticked: visitors get “page not found”; when signed in, you see it as a **preview** (banner at the top). The panel shows how many photos are on the map. Only **published** photos whose record has **Show on the world map** ticked appear on it (see [Photos](photos)).

### Opening slideshow photos

The full-screen slideshow on the home page, **in the order you choose**.

- **Add:** tick a published photo in “Add published photos”. It is added at the end of the slideshow.
- **Thumbnails:** each one shows the **whole** photo, without distorting or cropping it, in a 3:2 frame (neutral bands fill out portrait photos).
- **Ordering:** in “Slideshow order”, drag a thumbnail, or use **←** and **→** below each thumbnail.
- **Remove:** **✕** below the thumbnail.
- **Limit:** 8 photos. The counter (“5 / 8 chosen”) shows it; at 8, the other boxes are disabled and a message says so.
- **If none are chosen:** the first 5 published photos in the gallery.
- **Photo unpublished or deleted:** it leaves the opening slideshow. **Address changed:** it stays.

Click **Save opening slideshow** (or **Save public site** at the bottom of the page). Without JavaScript, the ← → ✕ buttons save immediately.

## Rights and privacy

### Legal notice (Impressum)

Required in France (LCEN) as in Germany (Impressum, § 5 DDG): the `/mentions-legales` page, linked at the bottom of **every page** of the site (“Mentions légales”, “Legal notice”, “Impressum” depending on the language; `/impressum` also leads there). The text is written by the site, in three languages; you only provide:

- **Publishers**: your first names and surnames;
- **Postal address**: an address where you can be reached (one line per address line);
- **Email** (empty: the privacy one) and **phone** (optional);
- **Person responsible for the content**: one person (in Germany, “Verantwortlich nach § 18 MStV”).

As long as the essentials are missing (names, address, email, person responsible), “Today” flags it and the page only shows what has been filled in. Hosting (your server, in France; routing through Cloudflare) and the links to the usage rights and privacy pages are added automatically.

| Field | Where it appears |
|---|---|
| **Usage rights: Français** | public page `/droits`. The field shows the published text, with a **Default text** or **Custom text** badge. Left as it is, the default text follows the photographers’ names; **Restore default text** brings it back (then save). |
| **Usage rights: English, Deutsch** | pages `/en/droits` (English) and `/de/droits` (German), offered to visitors through the language selector at the top of the page (Français, English, Deutsch). Same badges and same button. If the French text is customised and this one is not a translation of it, a warning says so: adapt it, otherwise foreign visitors read the translation of the default text. |
| **Usage rights: contact** | email address or `https://` link, shown as a link on `/droits` |
| **Privacy** | the controllers’ **contact** shown on the `/confidentialite` page (GDPR, in three languages) and two boxes to tick **only when it is true**: two-factor authentication for all admin accounts, and encrypted disks for data and backups (the page then states it). The page also shows whether encryption of personal data in the database (`DATA_KEY`) is active. The rest of the page follows the site automatically. |
