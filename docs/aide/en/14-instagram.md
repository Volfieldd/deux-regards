# Instagram

Photos published on the site can go out on **an Instagram account** (Nicephos’s), **one at a time, at the times you choose**, with a caption drawn from a **template**. For each photo, you can change the frame, the watermark and the caption.

Setting it up is done only once: a **professional Instagram account**, a **Meta app**, two lines in the server configuration, then **Connect** in the admin. Allow half an hour.

## Day to day

1. **Choose what goes out on Instagram.** By default, nothing gets in by itself: open the page of a photo published on the site and, in the **Instagram** section, click **Add to the Instagram queue**. (A draft photo must first be published on the site.) To have a whole series go out automatically, tick it in **Instagram → Settings → Automatic queueing**: every photo published in that series will then enter the **Instagram queue**.
2. **At the times you choose** (6.30 pm by default, Paris time), the first photo in the queue goes out on Instagram. One per slot. In the settings, write the times separated by commas: “18:30”, “9:00” or “18 h 30” all work; an unreadable time is ignored, and the message after saving says so.
3. **Until it goes out**, everything can be adjusted:
   - on the **photo’s page**, **Instagram** section: frame, watermark, caption, with an exact preview of the image sent, then **Update**; **Remove from the queue** takes it out;
   - on the **Instagram** page: the order of the queue (↑ ↓), **Publish now**, **Remove**. After **Publish now**, a progress bar shows each step without reloading the page (checks, image sent, processing by Instagram, publishing). At the end it shows ✓ with the link to the post, or ✕ with the reason.
4. Once published, the photo’s page gives the link **view the post ↗**, and the Instagram page the link **View ↗** under **Latest posts**.

**The Instagram page** shows:
- at the top, the account, the posting schedule and the usage;
- on the left, the **queue**;
- on the right, the **failed** photos (with **Try again**) and the **10 latest posts**;
- at the bottom, the **log**: queueing, sending, steps, posts, failures, pauses, resumes, repost requests. For each event: the date, the status (✓ success, ✕ failed, ▲ warning, info), the photo and who triggered it (otherwise “automatic”). The log is kept 90 days.

The **settings** are folded below the log.

> A photo never enters the queue twice on its own: unpublished then republished, or **removed** from the queue, it is not offered again. To share it again, use **Republish (put back in the queue)** on its page.

## Proposing for Instagram (photographers)

A photographer does not put their photos in the queue themselves: they **propose** them, and the moderator (or an administrator) decides.

- **Propose**: on the page of a photo published on the site, **Instagram** section, choose the frame, watermark, signature and caption (with the exact preview), add a note for the moderator if needed, then **Propose for Instagram**. Consents are checked at that moment: a blocked photo cannot be proposed, a photo to check needs your confirmation. Until a decision is made, **Update the proposal** and **Withdraw the proposal** remain possible.
- **Decide**: the **To approve** page (**Instagram** section) lists the proposals with their choices and the photographer’s note. **Put in the Instagram queue** places it there as it is. **Send back with the note** returns it to the photographer: the note arrives in their “Today” and on the photo’s page, and they can propose again.
- **Notifications**: “Today” shows pending proposals to both. Those who chose emails are notified at the proposal and at the decision.
- **Without approval**: on the **Publishing workflow** page, the box **Put their photos in the Instagram queue without approval** gives a photographer control of the queue, for their photos only. They add, adjust or remove them themselves; the order of the queue and **Publish now** stay with the moderator.

## The image frame

Instagram only accepts images between **4:5** (portrait) and **1.91:1** (landscape). Your 2:3 portrait photos do not fit as they are. Three choices, as a default in the settings (**Crop** if you have not chosen anything) and photo by photo on its page:

| Frame | Result |
|---|---|
| **White mat** | the whole photo, with a white margin, on a 4:5 canvas of 1080 × 1350 px: an even feed |
| **Black mat** | the same on a black background |
| **Crop (no border)** | no border: portrait photos are cropped to 4:5 (around the centre of interest), the others keep their format |

The image sent is a JPEG 1080 px wide, **with no metadata at all**. The **watermark** (a checkbox on the photo’s page, default value in the settings) is the one from **Watermark & EXIF**, even if it is turned off on the site. A photo set to “never a watermark” has none on Instagram either.

## The caption

The **template** (Instagram → Settings) applies to all photos, with these variables:

| Variable | Replaced by |
|---|---|
| `{titre}` · `{legende}` · `{lieu}` · `{date}` | the photo’s fields (date in words: “Nov 2023”) |
| `{auteur}` · `{serie}` | its author, its series |
| `{site}` | the site’s name |
| `{hashtags}` | the hashtags “for all photos”, then those of its series, without duplicates, 30 at most |
| `{signature}` | the photographer’s signature (see below); without this variable in the template, it goes just below the caption |

**Photographer’s signature**: each photographer sets their own in [Photographers](auteurs) (for example “— Julien · @julien.photo”). It is added to the post **only when the photo has a caption**. For one photo, untick **Add my signature** in the Instagram section of its page, then **Add to the queue** or **Update**: it will not appear. The site itself does not show the signature.

**A line whose variables are all empty disappears**, and a comma left on its own is removed: a photo with no place or date does not leave a “,” in its caption.

**For one photo**, on its page: edit the caption directly. The **Custom caption** box ticks itself; **Back to the template** brings back the template’s caption. The counter shows the length (2,200 characters at most). Warnings point out a link (not clickable on Instagram: prefer “link in bio”) or more than 30 hashtags.

## API limits

There is no paid tier of the Instagram API: Meta allows **100 posts per account over a rolling 24 hours** and a number of calls it works out itself. The site therefore publishes within a **budget**, set in **Instagram → Settings → API limits**:

| Setting | Posts over 24 h | Gap between two | Calls per hour |
|---|---|---|---|
| **Cautious** (default) | 25 | 60 min | 100 |
| **Meta’s limits** | the quota read from Instagram (100 today) | none | 200 |
| **Custom** | 1 to 100 | 0 to 1,440 min | 20 to 1,000 |

- **Over budget**, the photo waits in the queue. **Publish now** refuses, explaining why and when it will be possible (“Last post 20 min ago; at least 60 min between two posts: next possible at 2.30 pm”).
- In **Custom**, a field left empty takes the default value (that of **Cautious**). A post needs up to 12 calls: hence at least 20 calls per hour.
- **If Instagram reports a limit**, the queue is **paused** for the time it gives (7 days at most; otherwise 1 h, then 2 h, 4 h, 8 h, 24 h). The photo stays at the top of the queue and **the attempt is not counted**. A banner announces it on the **Instagram** page, with **Resume now** to lift the pause by hand. When it resumes, one photo per slot, never a burst.
- The **Instagram** page shows the **usage**: posts over 24 h, calls in the last hour, quota read from Instagram. This quota is read again before each sending; read as full, it holds the queue for an hour, then it is read again (**Resume now** and a new connection also forget it).
- Pause and resume times are shown in the admin’s language (“14:30” in English and German).

## Likes and comments

Every morning (after 6 am), the site collects the **likes** and **comments** of the photos it has published on Instagram, and keeps one reading per day.

- **A photo’s page**, Instagram section: “39 likes · 4 comments”, the date of the reading and a line chart of the likes over time.
- **Instagram page**, “Most liked on Instagram”: the photos ranked by likes, with the link to each post. **Collect now** takes a reading without waiting for the next day (once every 10 minutes at most).
- **Only numbers**: Instagram does not say who liked or what the comments say.
- **Posts published directly on Instagram**, without going through the site: they are not collected (they are not linked to any photo on the site).
- The reading costs 1 to 3 calls a day, counted within the limits above. If it fails (Instagram unavailable), a new attempt takes place an hour later and the reason is shown on the Instagram page.

## If it fails

- **Automatic retry:** the photo stays at the top of the queue, and the error message is shown in the queue and on the photo’s page. It goes again at the next slot, **3 attempts at most**.
- **After 3 failures:** it moves to **Failed**, with **Try again**. The photo’s page also offers **Repost (back to the front of the queue)**. **Try again** only applies to the photo’s latest sending, while it is still published on the site: if it is already back in the queue, it is refused (it would go out twice).
- **The photographer** (who does not handle the queue) sees the failure in **Today** and on the photo’s page, with **Ask for a repost**. One request per failure. It then shows, marked ▲ “Repost requested”, in the **Today** of those who handle the queue, under **Failed** on the Instagram page and on the photo’s page; they also get it by email if they chose to. It clears when the photo goes back into the queue. If the photo is already in the queue, there is nothing to request.
- **Access expired:** the access token lasts 60 days and renews itself. If it has expired (more than 60 days without working), reconnect the account from the **Instagram** page: **Disconnect**, then **Connect the Instagram account**. If the admin shows **Reconnect the account** (encryption key changed, see step 6), simply click it.

---

## Setting up (once)

### 1. Switch the Instagram account to a professional account

The publishing API only works with a **Creator** or **Business** account. It is free, you lose no followers or posts, and it can be reversed.

1. In the Instagram app, open the **profile** of the Nicephos account, then the **☰** menu.
2. **Settings and activity** → **Account type and tools** → **Switch to professional account**.
3. Choose **Creator** (recommended for photographers) or **Business**.
4. Category: **Photographer**. Public contact details are optional.
5. No Facebook page is needed: the connection is made directly with Instagram.

### 2. Create a Meta developer account

1. Go to **developers.facebook.com** and click **Get started**.
2. Sign in with a Facebook account, that of one of you two.
3. Accept the terms and confirm your email or phone if Meta asks.

### 3. Create the app

1. **My apps** → **Create app**.
2. App name: for example “Nicephos”. Contact email: yours.
3. Use case: **Manage messaging & content on Instagram** (“Instagram API”), then next until **Create app**.
4. The app is in **Development mode**. That is enough: to publish to your **own** account, no review by Meta is needed.

### 4. Get the credentials and declare the redirect address

1. In the app: **Instagram** → **API setup with Instagram login**.
2. Write down:
   - the **Instagram app ID**, to put in `INSTAGRAM_APP_ID`;
   - the **Instagram app secret** (“Show”), to put in `INSTAGRAM_APP_SECRET`.

   These are the app’s **Instagram** credentials, different from its Facebook ID shown at the top.
3. **Set up Instagram business login** section → **Business login settings**:
   - **Valid OAuth redirect URIs:** `https://www.nicephos.art/admin/instagram/callback`. This is the address shown on the admin’s **Instagram** page, to the character.
   - Save.
4. Permissions requested by the site, nothing to tick: `instagram_business_basic` and `instagram_business_content_publish`.

### 5. Authorise the Nicephos account on the app

In Development mode, only invited accounts can connect:

1. In the Meta app: **App roles** → **Roles** → **Add people** → **Instagram Tester**. Enter the account name (@nicephos).
2. In Instagram, on the Nicephos account: **Settings and activity** → **Apps and websites** → **Tester invites** → **Accept**. On a computer, it is also possible on instagram.com → Settings → Apps and websites.

### 6. Configure the server

In the server’s `.env` file (on Unraid: **Edit Stack → ENV File**):

```dotenv
INSTAGRAM_APP_ID=…            # ID de l'application Instagram
INSTAGRAM_APP_SECRET=…        # clé secrète de l'application Instagram
```

Recommended: `INSTAGRAM_TOKEN_KEY`, an encryption key for the access token (`openssl rand -base64 32`). Without it, the key is derived from `COOKIE_SECRET`: changing that secret, or restoring the database on a server that has a different one, then means you have to **reconnect** the account (the admin says so; no photo is lost).

Then restart the site (**Compose Up**). The site must use **HTTPS** (`PUBLIC_URL=https://…`): Meta rejects `http` addresses, and must be able to download the image.

### 7. Connect

1. Admin → **Instagram** → **Connect the Instagram account**.
2. Instagram asks you to authorise the app. Sign in **with the Nicephos account**, then accept.
3. Back in the admin: “Instagram account @nicephos connected”. The queue can start.

### If the connection fails

| Message | Cause, solution |
|---|---|
| “Invalid redirect_uri” / “redirect_uri is missing” | the redirect address declared (step 4) is not exactly the one shown in the admin |
| “Insufficient developer role” | the tester invite has not been accepted (step 5), or another Instagram account is signed in in the browser |
| “Connection refused: the request did not come from this screen or has expired” | more than 10 minutes between the click and the return, or return in another browser: start again |
| “The site must use HTTPS” | `PUBLIC_URL` in `http://`: connecting is only possible online |
| “image rejected by Instagram” | rare; try another frame for this photo |

**Disconnect** (Instagram page) erases the token from the server. To also remove access on the Instagram side: **Settings** → **Apps and websites** → **Active** → the app → **Remove**.
