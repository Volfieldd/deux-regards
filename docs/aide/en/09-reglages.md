# Public site, rights and privacy

Two pages in the **Publish** and **Settings** groups of the sidebar; each one only saves its own fields.

## Public site

What visitors see. Tagline, introduction and “About” each have an optional **English and German** version, folded below the French field (“… in English and German”; the status shows *optional*, *1 language of 2* or *translated*). Empty: English and German visitors read the French text (see [The site as visitors see it](site-public)). The **Suggest a translation** button pre-fills a field (see [Photos](photos), “A photo’s record”).

In **admin v2**, each field is saved when you leave it (the whole form is sent, as with the button), with **Undo**; the opening slideshow is ordered in place; without JavaScript, **Save the public site** (a single button).

| Field | Where it appears |
|---|---|
| **Site name** | text logo, page titles, the watermark’s `{site}` variable. Empty: the server’s default name. |
| **Tagline** | title of the home page’s “perspectives” section, title of “About”, description for search engines |
| **Introduction** | text below the tagline, on the home page |
| **About** | “About” page. Separate paragraphs with a blank line. |
| **World map** | see below |
| **Search** | see below |
| **Opening slideshow photos** | the full-screen slideshow on the home page, in the chosen order (see below) |
| **Opening slideshow on phones (v3)** | the home-page slideshow on phones, with public site v3 (see below) |

### World map

**Publish the world map** box, unticked by default. Ticked: the `/carte` page is open to visitors, a **Map** link appears in the site menu, and the page is added to `sitemap.xml`. Unticked: visitors get “page not found”; when signed in, you see it as a **preview** (banner at the top). The panel shows how many photos are on the map. Only **published** photos whose record has **Show on the world map** ticked appear on it (see [Photos](photos)).

### Search

**Offer the search** box, ticked by default: a **Search** link (a magnifier on phones) appears in the site menu and opens `/recherche`. Visitors search the published photos by keyword, in titles, captions, places, towns and regions, series, photographers and the photos’ **keywords**, in all three languages. Unticked: the page no longer exists for visitors.

**Show the keywords on the photo page** box, unticked by default. Ticked: the keywords are shown under the caption, and each leads to the search. Otherwise, they are only used for the search.

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

### Opening slideshow on phones (v3)

With the public site in **v3** (see [Appearance](apparence)), the opening photo fills the screen: on a computer, a landscape photo fills it; on a phone, a portrait one does. This second list is the opening **for phones**.

- **Same gestures** as the slideshow above: tick, order with ← →, remove with ✕; 8 photos at most.
- **Portrait photos only:** the pool only offers published photos that are taller than wide.
- **None chosen:** phones show the slideshow above (a landscape photo takes the width, the title comes below).
- **In v1 and v2**, this list is not used: the opening is the same everywhere.
- Each opening photo keeps its **focal point** (photo record): in v3, the opening crops by 10 % at most around it.

## Rights and privacy

### Legal notice (Impressum)

Required in France (LCEN) as in Germany (Impressum, § 5 DDG): the `/mentions-legales` page, linked at the bottom of **every page** of the site (“Mentions légales”, “Legal notice”, “Impressum” depending on the language; `/impressum` also leads there). The text is written by the site, in three languages; you only provide:

- **Publishers**: your first names and surnames;
- **Postal address**: an address where you can be reached (one line per address line);
- **Contact email**: published as a link on the page (if empty, the privacy contact replaces it when it is an email address, not an `https://` link);
- **Phone**: required for a person who publishes a website (LCEN, art. 1-1; § 5 DDG in Germany), whether or not you host the site;
- **Person responsible for the content**: the publication director, who answers for what is published (LCEN, art. 1-1; in Germany, “Verantwortlich nach § 18 MStV”);
- **Hosting**: **By the publishers, on their own server** (default: the page says so, with the address and phone number above) or **With a hosting provider**: its **name**, **address** and **phone** are then required, and the page names it (“The website is hosted by …”). Routing through Cloudflare is mentioned in both cases.

As long as a required item is missing (names, address, email, phone, person responsible; with a hosting provider, its name, address and phone), the section says so (“2 required items to fill in: Phone, Person responsible for the content”), “Today” flags it, and the page only shows what has been filled in. The links to the usage rights and privacy pages are added automatically.

| Field | Where it appears |
|---|---|
| **Usage rights: Français** | public page `/droits`. The field shows the published text, with a **Default text** or **Custom text** badge. Left as it is, the default text follows the photographers’ names; **Restore default text** brings it back (then save). |
| **Usage rights: English, Deutsch** | pages `/en/droits` (English) and `/de/droits` (German), offered to visitors through the language selector at the top of the page (Français, English, Deutsch). Same badges and same button. If the French text is customised and this one is not a translation of it, a warning says so: adapt it, otherwise foreign visitors read the translation of the default text. |
| **Usage rights: contact** | email address or `https://` link, shown as a link on `/droits` |
| **Privacy** | the controllers’ **contact** shown on the `/confidentialite` page (GDPR, in three languages) and two boxes to tick **only when it is true**: two-factor authentication for all admin accounts, and encrypted disks for data and backups (the page then states it). The page also shows whether encryption of personal data in the database (`DATA_KEY`) is active. The rest of the page follows the site automatically. |

## Accounts and roles

**Accounts and roles** (Settings group, administrators only) lists the accounts that have signed in.

In **admin v2**: one card per account, pending accounts first; **Edit** unfolds the form, saved in place with **Undo**; **Delete this account…** only appears for a **deactivated or pending** account, through a dialog that names it (Cancel first): deactivate an active account first.

- **First sign-in:** the account is created. If Zitadel gives it the “admin” role, it is an administrator; otherwise it stays **pending**, with no access, and “Today” says so. Name and address come from the identity provider (the address only if it verified it): before giving a role, check with the person the **identifier (sub)** shown under the account, which they also see on their “Account pending” page. An account never dealt with and left pending for 90 days is deleted (an account whose roles an administrator removed is kept, and the IdP cannot give it the “admin” role back).
- **Give a role:** tick it, then **Give this role** (or **Save**). It takes effect at once, without signing in again; removing it too.
  - **Administrator**: everything, including accounts, the log and the link to Vigie ([Security](reglages#sécurité)).
  - **Moderator**: approves, schedules, publishes and unpublishes (site and Instagram), handles reports, sends photos back or writes notes to the photographer, sets the publishing workflow; does not edit photos and never sees personal data (of a report, they read the message, never the address left).
  - **Proofreader**: proofreads and translates texts.
  - **Photographer**: only **their own** photos, outings and the people they met (consent is given per outing and per photographer). They import, edit and delete their photos (which remain their property), see the GDPR requests that concern them, use the Field app and their cards; they do not publish (they propose, for the site as for Instagram), and see neither the Instagram queue, nor settings, nor site traffic (their Statistics show only their photos). What belongs to the other photographer does not exist for them, even by typing the address. A person met by both only appears with their own encounters; merging, splitting, exporting or erasing them is left to the administrator.
- **Linked photographer:** used for defaults (import, Field app) and decides what a Photographer account sees; with no linked photographer, a Photographer account sees nothing. A photographer can only be linked to one account.
- **Deactivated:** the account can no longer sign in, and its current session loses access at once; a refused attempt does not change its “last sign-in” (the Log keeps it).
- **Delete this account:** a click unfolds the confirmation, then **Delete the account “…”**: the account and its sessions are erased, with its roles, linked photographer and settings; if it signs in again, it starts over as pending, with no role, even if Zitadel gives it the “admin” role.
- **Safeguards:** there is always at least one active administrator; you cannot deactivate or delete yourself; accounts listed in `ADMIN_SUBS` (server configuration, marked “protected”) remain administrators whatever happens (a deactivated or role-less account added to the list becomes an active administrator again when it signs in). The **identifier (sub)** shown under each account is the one to copy into `ADMIN_SUBS` (one click selects it).
- **Emails** (bottom of the page): shows whether the server can send emails (`SMTP_URL`, `MAIL_FROM`) and from which address. **Send the test** sends an email to the chosen address (yours by default). If it is refused, the reason is shown, for example credentials refused or server unreachable.

The menu only shows the pages the account can open.

## Log

**Log** (administrators): who did what in the admin, most recent first: sign-ins (successful, pending, refused), changes, publishing, actions on several photos, changed accounts (with the detail: roles, status, linked photographer), GDPR exports and downloaded originals. Filter by account or by word. Choosing the language and theme is not recorded. **Result**: “done”, or “refused” when the server refused the action (missing right, or refusal announced by an error message at the top of the page). The log is kept for 13 months.

## Security

**Security** (Settings group, after Log) opens, in a new tab, the console of **Vigie**, the site's security component (`https://vigie.nicephos.art`). The entry only appears to accounts allowed to see it (the Administrator role has it; the other roles do not) and only if Vigie is installed. The console has its own locks (Cloudflare Access, its Zitadel account with two-factor authentication): being an administrator of the site is not enough to get in.

The admin only knows what Vigie sends it every minute, signed: the number of open alerts per severity, the time and number of the most severe; never the title of a rule, an address or an account.

- **Entry badge**: ▲ and the number of high and critical alerts; the number alone for medium ones; nothing when no alert is open.
- **Today**: a row “Security: … in Vigie” (see [Dashboard](tableau-de-bord)).
- **Red banner**, at the top of every page, as long as a critical alert is taken on by nobody in the console; **Open alert #…** opens it directly.
- **Summary unavailable** (Vigie has not answered the site for more than 5 minutes): ▲ alone on the entry, and the admin says what it knew and since when it no longer knows (“at the last summary, 14:10 … unavailable since 14:11”); a critical banner stays, dated. Vigie itself keeps sending its alerts through its own channels (Signal, e-mail).
