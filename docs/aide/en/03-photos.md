# Photos

The **Photo library** brings together import, search and all the photos, in site order, as a **contact sheet**: each thumbnail keeps the format of its photo. On the right, the **inspector** shows and edits what you select. Importing takes three steps: **choose and check**, **upload and processing**, **complete and publish**.

## Importing photos

### 1. Choose

1. Click **＋ Import photos**: the file picker opens straight away. You can also **drop photos anywhere on the page**.
2. Select your photos. **That's all: the upload starts by itself.**

- Files that will not go through are set aside **before any upload**, with the reason: “✕ Not an image”, “✕ Too large (90 MB max.)”, “✕ Too big (120 MP max.)”. **✕** removes them from the list.
- **Photographer and series for the batch:** at the top of the import panel (your record is preselected). Choose them before adding the photos if needed; otherwise, change them photo by photo in step 3.
- Photos added during the upload go out in turn.

### 2. Upload and processing

In the photo library, each uploaded photo **appears straight away on the contact sheet** and “develops” there: blurred and grey at first, sharp once its images are ready, with a progress bar. At the end, the batch is **selected**: the inspector offers to title the photos, give them a place and a series, then publish them — without changing page.

- **Per photo:** a bar shows the upload as a percentage, then “Processing: images *n* / 6” (the 6 images served by the site), then “✓ Ready”.
- **For the batch:** at the top, the count (ready, processing, uploading, failed), an overall bar and the estimated **time remaining**.
- **Connection interrupted:** only the photo concerned fails; **Try again** sends it again without touching the rest.
- **Cancel the rest:** stops the uploads not yet finished. Photos already uploaded stay as drafts.
- **During the upload**, keep the page open (the browser warns you if you leave it). **Processing**, on the other hand, carries on on the server even if you change page: the **Processing: *n* photos** indicator stays at the bottom of the sidebar, on every page.
- As soon as the upload is finished, **Complete and publish the *n* photos →** (or **the photo**) appears (and receives focus, unless you are typing or working elsewhere on the page): it leads to step 3, even if processing is not finished. The imported photos are also selected on the contact sheet, except while you are typing or if a selection is already in progress.

| | |
|---|---|
| Formats | JPEG, PNG, WebP, TIFF, HEIF |
| Size | 90 MB and 120 megapixels per file at most |
| Status | **draft**: nothing is visible on the site before publication |
| Title | **provisional**, taken from the file name (`IMG_2041 quai-nord.jpg` → “IMG 2041 quai nord”) |
| Date | **taken from the camera** (shooting date in the EXIF metadata), when it exists |

During processing, the site applies the camera orientation, computes the served images (watermark and metadata as currently set) and prepares the [proof of prior existence](preuves) of the original.

> Without JavaScript, importing is still possible: choose the files then **Import**; the whole batch goes at once and the report is shown at the end.

### 3. Complete and publish

All the photos in the batch are gathered on a single screen: title, series, place and date. A screen shows 200 at most: beyond that (a large memory card), it says so at the top and leads to the next ones.

- **On a computer:** a table, one row per photo.
- **On a phone:** **one card per photo**, with its checkbox, thumbnail and state, then the Title, Series, Place and Date fields one below the other.

- **Each field is saved when you leave it** (Tab, click elsewhere or Enter). The **State** column shows “Saving…” then “✓ Saved”. The message at the bottom of the screen offers **Undo** for a few seconds.
- **Provisional title:** as long as the title is the one from the file name, this is flagged under the field.
- **Date:** already filled in when the camera recorded it. Otherwise, in everyday language: “oct. 2026”, “octobre 2026”, “10/2026”, “5/10/2026” or “2026-10”. The site shows what it understood (“understood: oct. 2026”).
- **For the ticked photos** (all of them, at first), the top bar applies a **series** (including a new one), a **place** or a **date** **as soon as you change them** — no button to click, with **Undo** in the message. Then **Publish**.
  - On a computer, the bar stays visible when you scroll the table.
  - On a phone, it stays at the top of the page, without following the scroll. Its fields are folded away: tap **Series, place or date for all ticked…** to open them. They change all the ticked photos at once.

In practice, for a batch: type the titles, the place once in the bar, then **Publish**.
- **Publishing photos with a provisional title:** a single click is enough. The provisional title is flagged beforehand (“Provisional title (file name)” under the title) and recalled in the message that follows, with **Undo** to go back.

Caption, watermark and proof are set in each photo's details (see below).

## The contact sheet

- **Chips** at the top: **All**, **Published**, **Drafts**, **To finish** (drafts and provisional titles).
- **Search** (title, place, caption, address), **photographer**, **series**: the contact sheet updates straight away.
- **Size**: the slider enlarges or shrinks the thumbnails (kept for next time).
- **Contact sheet / List**: the list shows the photos in rows, with the order number, the photographer, the place and the **⋯** menu (**Edit details**, **Publish** or **Unpublish**, **Move up one place**, **Move down one place**).
- When hovering over a thumbnail: its title, series and date. A click on the title opens the details. Drafts carry the **○ Draft** chip, provisional titles **Provisional title**. These chips stack at the top right of the thumbnail, with the state (**▲ To check**, **✕ Blocked**) and the suggested series (**✦**); on a narrow thumbnail they move below the checkbox. On a small thumbnail they fade out while the title is shown (hover or selected photo): the inspector then shows everything.
- **On a phone:** tap a thumbnail to choose it; its title appears, underlined: tap it to open the details. The photo panel opens at the bottom of the screen.

> The No. in the admin is the position in the **whole** list, drafts included. On the site, published photos are numbered without gaps (N°01, N°02…).

## The inspector

It changes with the selection:

- **Nothing selected**: the photo library figures and the shortcuts.
- **One photo** (a click on it): at the top of the panel, the **Open details** button; then the large image, **title**, **caption**, **series** (chips), **place**, **date**, **photographer** and its **audience** over 30 days (for accounts that see statistics). Each field is saved when you leave it (or Enter); the message at the bottom offers **Undo**. **Open details**, or the **Full details** link at the bottom of the panel, leads to the details page (watermark, Instagram, proof of prior existence, deletion).
- **Several photos**: see below.

At the bottom, always: **Publish**, **Unpublish**, **Delete…**.

## Acting on several photos

1. **Select**: **Shift + click** takes the whole range from the last photo chosen, **⌘ + click** (Ctrl + click on a PC) adds or removes a photo, **⌘A** takes everything, **Esc** deselects. The thumbnail checkboxes do the same.
2. In the inspector:
   - **Series**: a click on a chip files the whole selection (“＋ New” creates the series);
   - **Place** and **Date**: applied to all as soon as you leave the field;
   - **Provisional titles**: the list of the photos concerned, to title one by one;
   - **Publish** (or the **P** key), **Unpublish**, **Delete…** (with confirmation).
3. Each action is announced at the bottom of the screen with **Undo** (or **⌘Z**).

**File by dragging**: drag a photo (or the selection) onto a series in the **sidebar**.

## The loupe

**L** (or **Space**, or a double click) opens the selected photo full size, with a filmstrip at the bottom. **←** **→** move from one photo to the next (the inspector follows); **Esc** (or **Space**) closes it.

## Changing the order

The order of the photo library is the order of the site: gallery, viewer and numbers. It can only be changed **with no filter**.

- **Contact sheet**: drag a thumbnail before or after another (left or right half of the target thumbnail). The order is **saved straight away**.
- **List**: drag a row (top half: before, bottom half: after — that is how you reach the last place), or, from the keyboard, **⋯** menu → **Move up one place** / **Move down one place**.

If saving fails (session expired…), the previous order comes back and a message invites you to reload the page.

## A photo's details

| Field | Rules |
|---|---|
| **Title** | required, 160 characters at most |
| **Address** | the end of the URL: `/photo/<adresse>`. Empty: derived from the title. Lower case, digits and hyphens; it must be unique. Changing it breaks old shared links (the opening slideshow, however, follows). |
| **Series**, **Photographer** | lists |
| **Place** | free text, 120 characters |
| **Date** | in everyday language: “mars 2024”, “3/2024”, “2/3/2024” or `2024-03` |
| **Caption** | shown under the photo, 2000 characters |
| **Status** | Draft or Published |
| **Watermark** | “As per settings”, or “Never on this photo” (see [Watermark and EXIF](filigrane-exif)) |
| **… in English and German** | under the title, the place and the caption: their English and German version, optional. Empty: the English or German page shows the French text (a photo described only in English is shown in English everywhere; see [The site as visitors see it](site-public)). |

**Suggest a translation** (under each English and German field, if the stack's translator is installed) fills in the field from the French text (or, if it is empty, from the other translation). The translator runs on your server: the text does not go out onto the Internet. It is a suggestion: read it over and correct it, then save; **Undo** restores the previous text.

Click **Save**. Translations are entered in the details; editing a field from the photo library or “Complete and publish” does not erase them.

The preview on the left shows the image as served (watermark included) and its dimensions. For a published photo, **view on the site** opens it in the gallery.

Further down:

- **Sections**: the details read from top to bottom, in collapsible sections, each with its summary: **Details** (title and its translations FR · EN · DE, address, series, photographer, shooting date and time, caption — with, if “Describe the photos” is on (Series page), a **suggested description** to use as caption —, **keywords** — separated by commas, for the site search; under the field, **suggestions**: a click adds the word, then save. They are picked from a vocabulary of about 130 words (lighthouse, mist, street, long exposure…) by the series suggestions model, which must be turned on. A vocabulary word is found by the search in all three languages: “phare” also answers “lighthouse” and “Leuchtturm”), **Where** (displayed place, town, world map), **Distribution** (status, watermark), then **People & consents**, **Instagram**, **Audience**, **Proof of prior existence**. Sections worth looking at open by themselves (consents to check, Instagram queued); a link to one of them opens it.
- **Status band** (at the top): the state for the site and for Instagram (✓ ready, ▲ to check, ✕ blocked), the faces detected with **Someone is in it** / **No one recognisable** to correct, the reasons and the confirmations (see [Encounters](rencontres#visages-et-état-des-photos)). A photo to check can only be published by ticking the confirmation under **Status**.
- **Photographed person**: the encounters linked to the photo, with the consent or refusal (see [Encounters](rencontres)). A refusal prevents the photo from being published;

- **Audience**: the openings of the photo over 30 days (see [Statistics](statistiques));
- **Instagram**: frame, watermark and caption for Instagram, and **Add to the Instagram queue** (see [Instagram](instagram));
- [Proof of prior existence](preuves): the fingerprint and timestamp of the original.

**Depending on the account’s role** (see [Accounts and roles](reglages#comptes-et-rôles)): the page only shows what the account can do.

- **Photographer**: the full page for their own photos, without the status choice (publishing is done by an administrator or a moderator) or Instagram; they can delete their photos.
- **Moderator**: the page read-only, with the **Publishing** section (publish, schedule, send back with a note, unpublish with a reason); they do not edit the photo. **Proofreader**: a form limited to texts (title, caption, place and their translations), including for a published photo. A photo to check waits for confirmation by the photographer or an administrator, who can see the people. Neither sees the people and consents: the status band keeps the state, without the details.
- **Notes**: a moderator or an administrator writes a note for the photographer (“the caption mentions the Loire, it is the Erdre”). It appears in the photographer’s “Today” and at the top of the page, until they click **Done**. Notes are about the photo, never about the people.

In the photo library likewise: the Publish, Unpublish, Delete and Import buttons, dragging to reorder, the ⌘K palette and the help only appear to those who are allowed.

## Deleting a photo

1. At the bottom of the details, open **Delete this photo**.
2. Confirm with **Delete permanently**.

The original, the site images and the proof of prior existence are erased, and the photo is removed from the opening slideshow.

**This cannot be undone from the admin.** Download the original and the proof first if you want to keep them. The original also remains in the server backups.

## The publishing workflow

A photographer does not publish on their own: they **submit**, and a moderator (or an administrator) **approves**.

- **Submit**: on the photo’s page, **Publishing** section, with an optional word for the moderator; or several photos from the library (**Submit for publishing** button); or a whole outing (**Submit the ready photos** on the outing page). Consents are checked at that moment, by the photographer, who can see the people: a blocked photo cannot be submitted, a photo to check asks for their confirmation. **Withdraw the submission** puts it back as a draft.
- **Approve**: the **To approve** page (Publish menu, with the number waiting) lists the submissions, oldest first, with the photographer’s word. Tick, then **Publish now** or **Schedule for** (Paris date and time). A scheduled photo is published automatically at that time if it is still ready; otherwise it goes back to the photographer with the reason. **Cancel the schedule** puts it back in waiting.
- **Send back with a note** (from the photo’s page): the moderator does not edit the photo; the note reaches the photographer’s “Today”, who corrects it and submits it again.
- **Unpublish**: the moderator says why; the photographer receives the reason.
- **Notifications**: “Today” tells everyone what is waiting for them (submissions to approve, submitted, scheduled, sent-back photos). Everyone can also choose to be notified **by email**, in **Your account** on the Today page (if sending email is configured on the server).
- **History**: each photo keeps who submitted, approved, scheduled, sent back or unpublished it, and when.
- **Per-photographer settings** (**Publishing workflow** page, moderators and administrators): **Publish their photos without approval** (the photographer then publishes their own photos directly, outside the workflow) **Edit their photos once published** (yes by default; removed, a published photo no longer changes without the moderator) and **Put their photos in the Instagram queue without approval** (see the “Instagram” help).

An administrator publishes directly, as before. A visitor report never unpublishes anything on its own: the moderator decides.

## Town and world map

Each photo can be attached to a **town**: this is what places it on the **world map** (the “Carte” page, off by default: see [Public site](reglages#carte-du-monde)).

- **Town field** (photo details, and photo library panel): start typing (“Ang…”), choose from the list (↑ ↓ then Enter, or a click). **Every municipality in France**, even the smallest (“Ars-en-Ré”, “Loix”), and elsewhere places with more than 500 inhabitants; a town can be found under its French, English or German names (“Londres”, “München”, “Antwerp”). The list shows it in the admin’s language, with its **region, state or province**, to tell namesakes apart: “Monterey, California, United States” is not “Monterey, Tennessee, United States”. The site’s map also gives the town’s name in the page’s language (“München” in German). For a precise spot (“Baie de Monterey”), keep the **Place** field: it stays free and it is what is shown on the site.
- **Suggested from GPS**: if the original contains the shooting position (phones, recent cameras), the nearest town is filled in at import, with the note “Suggested from the photo's GPS: please check it.” Photos imported before this feature also receive their suggestion. A town chosen by hand is never replaced.
- **Only the town is kept**, never the exact position: a photo taken at home will appear on your municipality, not on your house.
- **Show on the world map**: checkbox, **unticked by default**. Nothing appears on the map without your consent. A town is required; clearing the town removes the photo from the map.
- **Several photos**: select them in the photo library, then **On the map** or **Remove from the map** (only those that have a town are affected; **Undo** in the message).
