# Series

Series group the photos together (Street, Portrait…). They form the site's index and serve as a filter. Each series is a **plate**: its first three photos, its name and its number of photos.

- **Create:** **＋ New series** at the top of the page puts the cursor in the creation card. Type the name, then **Enter** (or **Create**); **Esc** clears the input. The new series takes **first place**, with an address derived from the name.
- **See its photos:** **Photos ›** opens the list of photos filtered on this series.
- **Rename:** **Rename** opens the name in the card, then **Save**. Under the name, “Name in English and German”: the version shown on the English and German pages of the site (optional; empty: the French name). The address (`/serie/<adresse>`) is tucked away under “Series address (advanced)”: changing it breaks links already shared.
- **Order:** this is the order of the series index on the site.
  - with the mouse: grab the **⠿ Move** handle and drag the card to its new place;
  - with the keyboard: Tab to the handle, then **↑ / ←** (move forward one place) or **↓ / →** (move back one place);
  - everywhere, including on a phone: **⋯** menu, **Move up one place** or **Move down one place**.

  The order is saved straight away, and a message gives the new place.
- **Delete:** **⋯** menu, **Delete…**. A window opens.
  - Empty series: confirm.
  - Series with photos: **they are never deleted**. Choose the series to move them to, then **Move the *n* photos and delete**.

To file photos in a series, the quickest way is the [multiple selection](photos#agir-sur-plusieurs-photos) on the Photos page. On the site, a series with no published photo is greyed out and cannot be clicked.

## Suggested series

At the bottom of the Series page, **Suggest a series** helps you file incoming photos. It is **off by default**.

- **Switch on:** **Switch on suggestions**. The analysis model (about 90 MB, an open model called CLIP) is downloaded once into the data folder. Existing photos are then analysed in the background, with a progress bar; each imported photo is analysed straight away.
- **What it suggests:** on import, each photo gets the series chosen in the form. Until you have chosen it yourself, the server compares the photo with the photos already filed (yours and the other photographer’s: likeness is worked out per series). If **another** series looks clearly more like it, that series is suggested, and two are suggested when they are almost as close. A series is only suggested once it holds **3 filed photos**. A published photo never gets a suggestion.
- **Where to see it:** a **✦** star and a dotted outline mark it, without relying on colour.
  - on the thumbnail in the [contact sheet](photos#la-planche-contact), and with the **✦ Suggested series** filter;
  - in the [inspector](photos#linspecteur): **Move to “…”** applies it at once, **Keep “…”** confirms the current series;
  - on the [photo’s details](photos#la-fiche-dune-photo): **Choose** fills in the Series field, and **Save** confirms; the small thumbnails show the photos of the series that look most like it;
  - on an [outing](rencontres#les-sorties) page, under each photo;
  - in **Today**, a line “*n* photos with a suggested series”.
- **One photo at a time:** nothing is ever filed without your click, and there is no “accept all”. As soon as you choose a series (suggested or not, or by dragging the photo onto a series), the suggestion disappears and the photo becomes an example for the next ones.
- **Switch off:** **Switch off and delete** removes the model and all image fingerprints.

The analysis runs on your server: no image is sent anywhere else. A photo’s fingerprint (a series of numbers) is only used to compare images with each other. It cannot recognise a person, and it is deleted with the photo.

## Describing photos

Below **Suggest a series**, the **Describe the photos** panel suggests a short, factual sentence for each photo (“a red lighthouse on a small island”), shown on the photo’s page under the caption. It is **off by default**.

- **Turn on:** choose the model, **Light** (Florence-2 base, the default: about 270 MB to download, 2 GB of memory while computing, about 10 seconds per photo) or **Precise** (Florence-2 large: about 850 MB, 4 GB, a little more detailed). **Precise** needs the site to have 6 GB: add `SITE_MEM_LIMIT=6g` to the stack’s `.env`, then **Compose Up**. The panel shows the available memory and refuses **Precise** if it is not enough. Also choose the **night hours** (1 am to 6 am by default, Paris time), then **Turn on descriptions**. The model downloads once, at the first computation.
- **When:** photos without a description are described during the night hours, one at a time, on a single processor core, so as not to slow the rest of the server. The model only takes memory while computing.
- **On the photo’s page:** **Describe this photo** puts it first, right away (about a minute). Then **Use as caption** copies the sentence into the Caption field, to review, rewrite and save. **Describe again** recomputes it. Nothing is ever copied by itself.
- **Language:** the model writes in English. If the site has a translator (LibreTranslate), the sentence is translated into French and German; otherwise it stays in English.
- **Turn off:** **Turn off and delete the model** removes the model from disk; existing descriptions remain.

The analysis happens on your server: no image is sent elsewhere. The model describes what it sees, without ever naming people.
