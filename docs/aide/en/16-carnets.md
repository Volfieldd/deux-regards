# Notebooks

The **Notebooks** are the site's posts: travel stories and workshop notes, dated and signed, with photos from the photo library. You write them in the administration (sidebar, “Publish” group, **Notebooks**); they appear on the public site **in version 2 only**: while v1 is applied (Settings → Appearance), their pages are only visible in the v2 preview.

The **Notebooks** page lists the posts, newest first, with their state (○ Draft, ◐ Proposed or Scheduled, ▲ To rework, ● Published, ✕ Withdrawn), their signatures, their section and their date. **New post**: a title, a section (Trips or Workshop notes) and one or two signatures; a photographer always signs their own posts.

## Writing a post

The editor opens on the French version, the original language. At the top: the title, the state, the meta (signatures, section, start date) and **Saved at …**.

- **Title** (120 characters at most) and **Standfirst** (300 characters at most, required to propose): the counters flag, without blocking, a title over 70 characters or a standfirst over 160 (search engines would cut the end).
- **Text**: in restricted Markdown (see below). A photo is written alone on its line: `photo:quai-7h12`.
- **Automatic save**: with the script, the text is kept aside every few seconds (“Saved at 10:42 pm”), never in the online post. When you reopen it, the editor takes this text back and offers **Save in the post** or **Discard**. If the network drops, a copy stays on the device. Without the script, **Save and see the preview**.
- **Preview**: under the text (on a phone, the **Preview** tab), the post as on the site, rendered by the server; an unpublished photo is marked.
- **Languages**: the **Français**, **English**, **Deutsch** tabs show the state of each language (published, to review, empty). A translation is only published when **Translation reviewed: also publish in …** is ticked; otherwise the page in that language shows the French text with a banner, without redirection. **Propose a translation** (if the local translator is installed) fills the fields, to review.
- **Other settings** (folded): signatures, section, cover and share image (by default, the first photo of the text), linked trip, “Write to …” at the bottom of the post, address (it follows the title until the first publication; changed afterwards, the old one leads to the new one), **Update shown** (“Updated on …”; a typo does not tick it), **Commercial notice** (content made in partnership) and **Reply** (right of reply: the reply of a named person, dated, after the post).
- **Versions**: each save keeps a version (the last 30), to restore. If someone saved in the meantime, nothing is overwritten: your text is kept, to take back.

## Formatting

| Write | For |
|---|---|
| `## Saturday, Lisbon` | a heading; at least two make the post's table of contents |
| <code>&#42;&#42;bold&#42;&#42;</code>, `*italic*` | emphasis |
| `> a quote` | a quote; `> (pt-PT) …` gives its language, `> Translation: …` its translation, `> — Inês` its source |
| `- an item` | a list |
| <code>[text]&#40;https://…)</code> | a link; title `"sponsored"` for a paid or affiliate link |
| <code>[text]&#40;serie:rue)</code>, `voyage:…`, `carnet:…`, `photo:…` | a link to the site (if it is not published, it shows as plain text) |
| `photo:quai-7h12` alone on its line | a photo |
| two `photo:` lines in a row | a pair (a diptych when they are the two views) |
| three to twelve `photo:` lines | a gallery |

The toolbar (with the script) inserts these forms; **Photo…**, **Gallery…** and **Internal link…** open the photo picker. Shortcuts: Ctrl or ⌘ + B, I, K (link), S (save). HTML is shown as text; an image from another site is removed; a link to an unknown scheme becomes text.

## The photos of a post

The **Photos of the post** panel lists each photo of the text, in order, with its state (● Published, ○ Draft, ▲ Consent to check, ✕ Blocked):

- **Describe the photo…**: its **alternative text** (what it shows, for those who cannot see it; required to propose, unless the photo is decorative), its **caption** and its **size** (text width or full width), per language. Empty, the alternative text is the photo library one.
- **Remove from the post**: its line disappears from the text in the three languages.
- **Add photos** (without the script): ticked photos are added at the end of the text, one line each. Only published photos, or your own, can be used.

On the site, an unpublished photo does not appear; each photo leads to the viewer in the context of the post (back to the post, neighbouring photos of the post).

## The publication workflow

As for photos: the photographer **proposes**, the moderator **publishes** (now or on a date) or **sends back** with a remark.

- **Propose to …**: checks the standfirst, the alternative texts and the consents; what blocks is listed at the top, with a link to each point. Photos still in draft go with the post.
- **Publish** or **Schedule** (**Publication** panel): write the day and time as you like (“Saturday 8 am”, “17/10 8:00”); a past date is refused. Photos still in draft are published (or scheduled at the same time) with the post if you can publish them; otherwise, publish them first. At the set time, the post is published by “scheduled publication”; if a photo is no longer published, it goes back to “to rework” with the reason.
- **Send back…** (remark required), **Unschedule**, **Withdraw from the site…** (reason required; the address answers “withdrawn”) and **Republish**. A post never published can be deleted; a published post is withdrawn.
- **Rights**: a photographer writes and proposes their posts (the ones they sign) and edits those that are online; “Publish their posts without approval” is set photographer by photographer (Settings → Publication workflow). The proofreader corrects the texts; the moderator publishes.

## On the site

In v2, **Notebooks** appears in the menu as soon as a post is published. The list filters by **section** and by **photographer** (each choice gives its number of posts), 12 posts per page. A post opens on its cover, its authors, its dates and its table of contents; then the text, “Write to …” (a message to the address set on the Notebooks page, by default the legal notice one; nothing is kept), **Share this post**, the post's photos and the neighbouring posts. Readers subscribe to the **notebooks RSS feed**, one per language. The sitemap and search engines only see published posts, in their published languages.
