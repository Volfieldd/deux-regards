# Getting started

## Signing in

1. Open the site address followed by `/admin`.
2. You are sent to the sign-in page (Zitadel). Sign in with your account, or with “Continuer avec Google” (continue with Google) if that is how your account was created.
3. You land on **Today**, or on the page you had asked for.

- **“Accès refusé” (access denied):** your account does not have the administration role. Use “Utiliser un autre compte” (use another account), or ask the other photographer for the role.
- **Test sign-in:** on a test server only, a “Connexion de test” (test sign-in) form replaces Zitadel. It asks for the photographer to act as and a token. A red “Local test sign-in” banner then stays at the top of the admin.

## Finding your way around

The **sidebar**, on the left, is always there. It is organised by intent:

| Group | Entry | For |
|---|---|---|
| | **Search, act… ⌘K** | the command palette: a photo, a series, a page or an action, from the keyboard |
| | **Today** | what is left to do and the state of the site at a glance |
| **Work** | **Outings** | one row per shooting day: its photos and the people met, to sort together (see [Encounters](rencontres#les-sorties)) |
| | **Photo library** | import, view, complete, publish, order, delete |
| | **People** | the photographed people, with all their encounters: consents, refusals, photos, rights (see [Encounters](rencontres#les-personnes)) |
| **Publish** | **Public site** | site name, texts, opening slideshow photos, world map |
| | **Series** | create, rename, order the series; under the entry, *the list of series*, where you **drop** photos dragged from the photo library |
| | **Instagram** | the queue of photos to publish on Instagram, and its settings |
| | **Statistics** | site traffic, measured anonymously |
| **In the field** | **App, cards, QR** | the Encounter app on the phone, the consent cards to print, the QR code for clothing |
| **Settings** | **Photographers** | photographer records, card letter, link with their account |
| | **Appearance** | site theme, logo, icon |
| | **Watermark & EXIF** | mark the images, choose the metadata |
| | **Rights & privacy** | usage rights texts, privacy page |
| | **Help** | this help |
| | **View site** | the public site, in a new tab |

**Admin language**: at the end of the menu, the same selector as on the site (flag and code: Français, English, Deutsch). The choice is kept on **your photographer record**: it follows you on the computer as well as on the phone (including the Field app); an account not linked to any photographer keeps it in this browser. Screens, buttons and messages change language; your texts (titles, captions, series…) keep their own translations, and this help is also available in English and German. In the app, the part handed to the photographed person stays in the language they choose.

**Admin vocabulary**: a **series** is a theme of the public site (what the visitor sees); an **outing** is a photographer's shooting day (their photos from that day and the people met); a **consent** (or a **refusal**) is what a photographed person has decided, use by use; the **consent card** is the card to have signed; the **world map** is the public page `/carte`.

**States** can be read without colour: **✓** (circle) is fine, **▲** (triangle) to check, **✕** (square or cross) blocked; the colour (blue, yellow, vermilion) only underlines it.

At the bottom: your name, the **sun / moon** button that switches the admin to **light or dark mode**, and **Sign out**. If you make no choice, the admin follows your computer's light or dark setting; your choice is kept for later visits.

While an import is being processed, the **Processing: *n* photos** indicator also appears at the bottom of the sidebar.

**On a phone (iPhone…)**, the sidebar folds away: a **tab bar** at the bottom gives Today, Photos, **Import** (the big button in the middle), **Field** (the Field home: new encounter, my QR, today's outing) and **Menu** (which opens the sidebar, even without JavaScript; **Close**, at the top, closes it; while it is open, the keyboard stays in the menu). Buttons, checkboxes and fields are large enough for a finger. Screens adapt: for example, “Complete and publish” shows one card per photo (see [Complete and publish](photos#3-compléter-et-publier)).

Each screen has a **“Help for this page”** link (in the photo library: **Help**, top right) that goes straight to the right section.

## Admin v2

The admin comes in two versions, side by side. **v2** is the new one, from the October 2026 usability audit; **v1** is the one you know. **Each account chooses its own**: your choice changes nothing for others, nor for the public site.

- **Try v2**: at the bottom of the sidebar, above your name, **Try admin v2**. One click and you are there.
- **Back to v1**: in the same place, **Back to admin v1**. One click too, whenever you like. The choice can also be set in **My account** (click your name), along with notification emails.
- **A screen not yet redone** is shown in v1, in full: the v1 sidebar says so (“Screen not yet in v2”) and keeps the button to go back. The other screens stay in v2.

What v2 changes:

- **The menu in four groups**: **Photos** (Photo library, Series, Outings, Trips), **People** (People, Reports, Field app), **Publish** (To approve or My proposals, Public site, Notebooks, Private galleries, Instagram), **Team** (Accounts and roles, Publishing workflow, Log, Security, Statistics). At the bottom: Settings, Help, View site, language, What’s new. An entry only appears if your role can open the page.
- **Tabbed Settings**: Identity and appearance, Watermark and EXIF, Legal notice and privacy, Photographers, **Analysis assistants** (the aids computed on the server, each with its switch). On a phone, the tabs are boxes, all visible.
- **One way to save**: what can be undone is saved when you leave the field or touch the switch; the message at the bottom offers **Undo** for 10 seconds (it waits while the mouse or keyboard is on it). The **indicator** under the title says “Saved at 22:40”, or “1 field not saved” with a link to the field. What has a public effect (the legal notice, publishing, proposing) keeps a button that says so. Without JavaScript, a **Save** button appears.
- **Complete and propose** (an import batch): English and German titles folded under each title, the series suggestion in one click, **For the ticked photos** (series, place, map town, date) which changes nothing before **Apply**, **To fix** and **Consent to check** filters. **Propose** (or **Publish**, for those who publish) first shows what is left to review — provisional title, rejected date, consent to check — and is fixed in place.
- **A photo’s record**: the photo on the left, the fields on the right, in the order the visitor sees them (title, caption, alternative text, keywords), then **Where and when** (series, photographer, place, map town, date, time shown) and **Distribution** (watermark, address). Each field is saved when you leave it, with **Undo**. A suggestion (description, translation, keyword) fills the field without saving anything: review it, then **Save**. No more “Draft / Published” buttons: **Publish…**, **Propose…** and **Unpublish…** (which asks for a reason, sent to the photographer) go through a dialog, as do **Send back** and **Delete**. Consents and faces come first, with a provisional title flagged.
- **The photo library**: state filters with their symbol (○ Drafts, ● Published, ◐ Submitted, ▲ Consent to check…), a **Filter** button (lists no longer act on the first arrow key), the inspector names the chosen photo and shows an error under its field. **P** first opens the publication dialog, which shows provisional titles; every action offers **Undo** without reloading the page. Single-letter keys (**P**, **I**, **L**, **Space**) only work when a thumbnail or the inspector has focus, and can be turned off in **My account** (**Single-key shortcuts**).
- **To approve**: one line per proposal, with the consent state and provisional title; **Send back…** from the line, **Cancel the schedule** from the scheduled list; **Approve the ticked photos** first says how many go, and when.
- **The field app**: a title, the time your session ends, **Hand the phone to the person** which folds your part, the person’s language without flags, what is missing said in their language, the signature kept after an error and **Clear** that can be undone; if the connection drops or the session expires, the consent stays on screen until **Retry**.
- **People and an encounter**: two pages with distinct titles, **People** (one line per person, their decision as a badge, what is left to handle) and **Requests and encounters** (the New, In progress, Done filters; entering a signed card folded away). An encounter’s page puts the decision first, the person and the history side by side, the outing’s photos and the linked photos with their title; **Erase the data…**, **Erase this person…** and **Apply the refusal…** go through a dialog (Cancel first). Nothing more is shown than in v1.
- **Series, Outings and Trips**: one card per series, its statement readable; **Edit** unfolds the fields, saved when you leave them, with **Undo**; the order changes with the ⠿ handle and the up and down arrows, or through the ⋯ menu, with **Undo**; **Delete…** says where the photos go. On an outing, the place is saved when you leave it and the buttons for ticked photos say what they do. On a trip, the name and text are saved when you leave them; **Put the page online…**, **Take the page off the site…** and **Delete the trip…** go through a dialog that says what changes.
- **Identity and appearance** (a Settings tab): the site name is shown (it is set in Public site); the **subtitle**, the **brand** and the **theme** are saved as you go, with **Undo**; a **logo** is saved as soon as the file is chosen (in an empty slot, **Undo** removes it); replacing it or **Remove…** goes through a dialog first, because the old file is erased. The public site version (v1, v2, v3) keeps its **Save the version** button, and your session view its buttons.
- **Accounts and roles**: one card per account (status, roles, linked photographer, last sign-in), accounts **awaiting a role** first, their form open with the identifier to check; **Edit** unfolds the roles, the linked photographer and **Deactivated**; saving happens in place, with **Undo**. **Delete this account…** is only offered for a deactivated or pending account, through a dialog that names it.
- **Public site**: each text is saved when you leave the field, each box when you tick it; the opening slideshow is ordered with **←**, **→** and **✕** in place, each gesture with **Undo**; a suggested translation fills the field and waits for **Save the translation**. Without JavaScript, a single button: **Save the public site**.

Vigie is the same as in v1: the **Security** entry and its badge, the line at the top of **Today**, the banner of a critical alert.

## After each action

A message appears at the top of the page:

- **green edge**: the action succeeded (“Photo saved.”);
- **red edge**: it was refused, with the reason.

In the photo library, quick changes are announced by a message at the bottom of the screen, with **Undo** (or **⌘Z** / **Ctrl+Z**).

When a form contains an error, the faulty fields are flagged in red, with a message under each, and **the rest of your input is kept**.

## Sessions and security

- **Duration:** a session stays open for **8 hours without activity**, and **24 hours at most**. Beyond that, the admin sends you to sign in, then brings you back where you were.
- **Shared computer:** click **Sign out**. The session is closed on the site and at Zitadel.
- **“Formulaire expiré” (form expired):** the page had stayed open beyond your session, or in an old session. Reload the page and start again.
- **“Trop de tentatives” (too many attempts):** too many sign-ins were attempted from your network within 10 minutes. Wait a few minutes.

All admin actions are logged with the account that performed them.
