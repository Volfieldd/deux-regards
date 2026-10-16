# Watermark and EXIF

These settings apply to the **images served on the site**. The originals are never modified: you can change your mind at any time.

## Adding a text watermark

1. Tick **Add a watermark to the site’s images**, then choose **Type: Text**.
2. Enter the **text** (80 characters). Available variables:
   - `{auteur}`: name of the photo’s author;
   - `{annee}`: year the photo was taken, or else the year of import;
   - `{site}`: name of the site;
   - `{titre}`: title of the photo.

   For example, `© {auteur} {annee}` gives “© Julien 2024”.
3. **Font** (the site’s fonts) and **tone**:
   - light, for dark photos;
   - dark, for light photos;
   - **automatic**: chosen photo by photo, based on the brightness of the area where the watermark sits.
4. **Position**: nine locations, **Tiled** (pattern repeated diagonally across the whole image, the hardest to remove) or **Full frame** (centred, as large as the image, minus the margins).
5. **Opacity** (5 to 100 %), **width** (3 to 100 % of the image; no effect when full-frame), **margin** (0 to 20 %).
6. **Apply to sizes**:
   - all;
   - 1280 px and above (thumbnails spared);
   - 2000 px only.

   The largest image of each photo is always marked.

## Trying before saving

1. Choose the **Preview photo**.
2. Click **Preview without saving**: the image opens in a new tab with the form’s settings. **Nothing is saved.**

The image on the left of the page, on the other hand, shows the **saved** settings.

## Using the site logo large and faded

The recommended setting for signing photos without getting in the way too much:

1. Upload the **emblem** (or the **full logo**) in [Appearance](apparence), if you have not already done so.
2. Here, tick **Add a watermark**, then choose **Type: Site emblem** (or **Full site logo**).
3. **Tone: Automatic**. The design is light on dark photos and dark on light photos.
4. **Position: Full frame**, **margin** 5 to 8 %.
5. **Opacity: 15 to 25 %**. Below 10 %, the design almost disappears on some photos.
6. **Preview without saving** on a dark photo, then on a light one. Save when you are happy with the result.

The design is the one from Appearance: if you replace it there, the site’s images are recalculated with the new one.

## Using another logo as a watermark

1. In **Watermark logo**, upload a **PNG or WebP image with a transparent background**:
   - 5 MB and 4000 px per side at most;
   - 8 px at least;
   - width/height ratio of 10 at most.

   SVG files are refused.
2. Choose **Type: Logo uploaded below**, then save. This logo keeps its own colours: the tone does not apply to it.

**Remove logo** removes this watermark until the next upload.

## Excluding a photo

In the photo’s record: **Watermark → Never on this photo**, then **Save**. The chosen metadata still applies.

## Metadata (EXIF)

| Choice | The site’s images contain | For |
|---|---|---|
| **No metadata** (default) | nothing | disclosing nothing |
| **Copyright** | author, “© year author”, IPTC notices (credit, link to “Usage rights”) | signing the files; Google Images then shows a “Licensable” badge |
| **Shooting data** | copyright + camera, lens, aperture, shutter speed, ISO, focal length, date; **never the location** | sharing your technique |
| **All EXIF of the original** | everything, **including the GPS position** | rarely: reveals where the photo was taken |

EXIF fields only accept plain characters: “© 2024 Sébastien” becomes “(C) 2024 Sebastien” there. IPTC notices and the watermark keep accents.

## Updating the images

After **Save and update images**:

- a banner shows progress (“Updating images: 5 / 12”);
- the site stays online with the old images;
- each photo switches to the new ones as soon as they are ready, with no broken image;
- at the end, the banner says “Images up to date”, or lists the photos with errors.

Only accounts that set the watermark (administrators) see this banner: the list of photos with errors names photos of every photographer.

Allow a few seconds per photo.

The same recalculation is triggered when you rename an author, change the site name, or modify a photo’s title, date, author or watermark option.

**Going back:** untick the watermark, choose “No metadata”, then save. The images return to the originals.
