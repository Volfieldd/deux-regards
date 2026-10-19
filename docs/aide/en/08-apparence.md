# Appearance

The appearance of the **public site**: version (v1 or v2), theme, logo and icon. The admin always keeps its own.

## Public site: v1 or v2

At the top of the page. **v2** is the new design of the public site, from the usability audit of October 2026. It covers every public page (see [The site as visitors see it](site-public)) except the error and sign-in pages, which keep the v1 design. The administration does not change.

**v1 is kept**, for good: it remains a way back at any time, and receives security and accessibility fixes. New features (Notebooks, private galleries) only exist in v2.

1. **Switch from one version to the other, for you only:** at the top of every page of the public site, a small **View in v2** (or **View in v1**) button changes the version you see; one click, and the same page shows in the other version.
   - Next to it, a sentence reminds you what visitors see: “You see v1, like visitors” or “Only you see v2; visitors see v1”.
   - **Only you** see this button and this view, in this session (this device, this browser), until another click, sign-out or the end of the session. It needs the appearance permission.
   - Visitors always see the version chosen here, whatever they send (cookie, address): your view is kept on the server, never in the browser.
   - While you are signed in, your pages are kept in no cache (Cloudflare included): a visitor cannot receive the page you see, nor the button.
   - In the v1 view, the Notebooks cannot be found, as for a visitor in v1: on a Notebooks page, the button says **View the home page in v1** and opens the home page.
   - The button does not appear on the guest pages of private galleries.
   - From this section, **View the site in v2** (or **in v1**) does the same and opens the home page; **Back to the visitors’ version** forgets your view.
2. **Before applying v2 to everyone:** follow the [switch-over checklist](https://github.com/Volfieldd/deux-regards/wiki/Bascule-v2) (tries on iPad, computer and phone, recent backup, what to watch during the first week; in French).
3. **Apply it to everyone:** tick **v2**, then **Save the version**. Going back to v1 works the same way, at any time.

Every click on the button, and every change of version, is recorded in the [Log](reglages#journal).

## Choosing a theme

Each theme is shown with its three colours (background, ink, accent) and a description.

1. Click **Preview** below a theme: the site opens in a new tab with that theme.
   - **Only you** can see it.
   - A banner at the top of the page reminds you.
   - The preview follows your browsing for one hour, or until **Quitter l’aperçu** (exit preview).
2. To apply it for all visitors: tick the theme, then click **Save appearance**.

| Theme | Character |
|---|---|
| **Studio** | warm paper, italic headings |
| **Nicephos — night** | black gallery, white line, spaced capitals, sand accent |
| **Nicephos — day** | the same identity on a white background |

## Brand

- **Site name only**, or **Emblem + name (+ subtitle)**. The second option is only available once an emblem or an icon has been uploaded.
- **Subtitle**: for example “Photography gallery”, 60 characters at most.
- The site’s **name** is set in [Public site](reglages#site-public).

## Logos: four slots

| Slot | What to upload | Where it appears |
|---|---|---|
| **Emblem (design)** | the design alone, without text | header, next to the name, on computers |
| **Icon (simplified version)** | thick-line version, ideally a 512 px square | browser tab, phone home screen, header on phones |
| **Full logo** | the logo with the name (horizontal version) | large, at the top of the “About” page |
| **Sharing image** | 1080 px square or 1200 × 630 | preview when a page without a photo is shared on a social network |

- **Uploading:** choose the file (PNG, WebP or JPEG, 5 MB at most), then **Send**. **Replace** works the same way; the old file is deleted.
- **Removing:** a button below each slot.
- **Automatic colour:** emblem, icon and full logo take on **the theme’s colour** (white on a black background, black on a light background). A single version is enough, black or white: the direction of the line is detected. The edges are cropped automatically.
- **Tab icon:** a square icon on an opaque background is used as it is. Otherwise, it is composed automatically.
- **Photo of a drawing:** the phone’s orientation is applied; a photographed drawing is not shown sideways.
- **Sharing image:** re-encoded as JPEG, 1200 px at most. Transparency becomes a **white** background behind a dark drawing (cut-out black logo), **black** behind a light one.
- **SVG:** refused on upload.
