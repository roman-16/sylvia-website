---
name: pictures
description: Make every picture on the site from what arrives - a phone photo of a painting corrected to a front-on, edge-to-edge image, a painting on several canvases joined into one, its room picture cropped from a supplied one or generated with the painting placed in it, and the site photos (portrait, hero, atelier band, in-situ, link preview, monogram) cut to their slots - then check each is sharp enough and looks right on the page. Use whenever a picture on the site is added, replaced or changed.
---

# Pictures

Every painting on the site is shown twice, in the same shape: the painting itself, corrected to its canvas and never cropped, and a room picture with the painting hanging in it. The painting's pixels always come from a photograph of the painting. An image model may draw a room, never the painting.

`scripts/canvas.ts` does the geometry. Run it with bun from the repository root:

```console
$ bun .agents/skills/pictures/scripts/canvas.ts rectify PHOTO --corners X,Y X,Y X,Y X,Y --size WxH --out FILE [--inset T,R,B,L] [--max PX]
$ bun .agents/skills/pictures/scripts/canvas.ts hang ROOM PAINTING --corners X,Y X,Y X,Y X,Y --out FILE [--bleed PX]
$ bun .agents/skills/pictures/scripts/canvas.ts edges IMAGE [--sheet FILE]
```

Corners always run top-left, top-right, bottom-right, bottom-left, in pixels of the image as `magick IMAGE -auto-orient` shows it. `--size` is the canvas in centimetres, width by height. A `.webp` output is written with the site's WebP settings; every output has its metadata stripped.

## What arrives

| Picture | What it looks like | What it becomes |
| --- | --- | --- |
| Photo of a painting | A phone photo of the canvas on a wall: never square-on, so opposite edges differ in length; mild lens bulge; a canvas sometimes bowed on its stretchers; wall, the canvas's side and its shadow around it. Often compressed by a messenger to 1200-1600 px on the long side | The painting, `public/assets/works/NN-slug.webp` |
| One painting on several canvases | Each canvas photographed on its own, each exposed on its own | One picture of the whole, `NN-slug.webp` |
| Room picture | An interior mockup shot straight at the wall: warm low sunlight from a window, cream walls, light oak, stoneware, linen, the painting small above a piece of furniture | `NN-slug-room.webp`, in the painting's shape |
| No room picture | - | A generated room with the painting placed in it, `NN-slug-room.webp` |
| Photo of the artist | A phone photo, any shape | `public/assets/img/portrait.webp` |
| Studio and wall photos | Work in progress, palettes, a painting on a wall at an angle | The atelier band or the in-situ picture |

`NN` is the next free number in `public/assets/works/`, `slug` the title in lowercase with hyphens. Every source goes to `originals/` (`paintings/`, `rooms/`, `portrait/`, `atelier/`, `in-situ/`), named after the piece or what it shows. Nothing in `originals/` is ever deleted; it is how a picture is made again.

## A painting's photograph

Cropping cannot fix a photo of a painting, because its shape is wrong rather than its framing. A four-corner perspective map is not enough either: it maps straight lines to straight lines, so it can fix neither the lens bulge nor a bowed canvas. Two paintings shot in one frame once wanted opposite lens corrections, which is how a bow in the canvas shows itself.

1. **Find the corners roughly.** Crop a region around each corner from the photo, draw a cross at a guess and read it; ten pixels off is fine.

   ```console
   $ magick PHOTO -auto-orient -crop 200x200+X+Y +repage -fill none -stroke red -draw "line 100,0 100,200" -draw "line 0,100 200,100" /tmp/corner.png
   ```

2. **Rectify.**

   ```console
   $ bun .agents/skills/pictures/scripts/canvas.ts rectify originals/paintings/faith.jpeg --corners 190,277 1035,295 1068,1332 155,1340 --size 50x60 --out /tmp/faith.png
   ```

   At sixteen points along each edge it finds the wall-to-canvas boundary, walks inward past the canvas's side and its lit edge until the paint settles to the canvas's own tone, fits a smooth curve through each edge, and maps the four curves onto a rectangle of the canvas's real proportions with a cubic polynomial (`magick -distort Polynomial`), which takes out perspective, lens and bow together. The output is the canvas's own pixel size in the photo, never upscaled, with the long side capped at 2000 (`--max`).

3. **Read the edge sheet** it writes to `/tmp/NAME-edges.png`: every corner and the quarter points of every edge, magnified. Nothing on any tile may be wall, the canvas's side, its shadow or a lit rim, and the signature has to be whole. The printed scores compare each edge's outermost pixels with the paint just inside, lighter or darker; one marked `(look)` needs a closer look, and one where the painting itself changes at the edge can be fine. An edge is clean when the sheet says so, never on the numbers alone. For a closer look, crop 40 px at the edge and magnify it eight times.

4. **Correct an edge** with `--inset T,R,B,L`, in source pixels, positive cuts deeper, negative gives back. A signature often sits on the bottom edge, and where its last stroke runs into the canvas's edge band, giving back a pixel or two keeps the stroke without letting the band in. Take the smallest value that clears: an inset of one source pixel can cost several output pixels.

5. **Export.**

   ```console
   $ magick /tmp/faith.png -strip -quality 82 -define webp:method=6 public/assets/works/05-faith.webp
   ```

Using `-distort` by hand, always set `-set option:distort:viewport WxH+0+0`; without it the output is clipped to the source's size.

## One painting on several canvases

- Rectify each canvas on its own, with its own size.
- Align them by features that cross the seam, one near each end, not by their edges. When two features cannot line up at once, the canvases came out at slightly different scales: shrink the longer one until both align, then cut both to the same length.
- Canvases shot apart carry different exposures. Level them to each other before any shared adjustment, by matching a paint that appears on both, and by hue: pulling one colour channel down across a tonal range also drains it from the neutral canvas, which then turns cyan.
- Join them on a transparent background with the real gap between them. The gallery frame and the big view draw a fill and a shadow behind every picture, which outline a transparent gap; showing such a picture means teaching both to leave them off for it.

## Room pictures

A room picture has the painting's exact proportions, so the frame never changes size when it slides from one to the other.

**Supplied:** keep it in `originals/rooms/<slug>.<ext>`, crop it to the painting's proportions with the painting in view, and export it as `NN-slug-room.webp`.

**Generated:**

1. Look at every room in `originals/rooms/` and choose furniture and objects that none of them has yet, so no two rooms on the wall repeat.
2. Generate an empty room with a blank canvas of the painting's proportions with the image skill: `edit`, with two existing rooms as style references, portrait ones for a portrait painting, `--aspect` the closest to the painting's (the crop takes the rest), and this prompt with its brackets filled in:

   > The two photos are interior mockups from one series. Use them only as a style reference and create a new, different room from the same series: the same warm late-afternoon sunlight falling in from a window on the left, cream plaster walls, light oak furniture, stoneware vases with olive branches, linen lamp shades, cream boucle and linen textiles, a calm Scandinavian-Japandi look, photographed like an interior magazine shot at eye level. This room is [the room, e.g. a quiet bedroom or reading corner]: [the furniture and objects, e.g. a low light-oak chest of drawers against the wall with a stoneware vase of dried pampas or olive branches, two stacked coffee-table books and a small candle, a cream boucle armchair partly in frame at the lower right, a sheer linen curtain at the left edge]. Centred on the wall above the furniture hangs one single blank white stretched canvas, unframed, in [portrait / landscape / square] orientation with a width to height ratio of exactly [W] to [H], about [W] by [H] centimetres in real size so it reads as a [small / medium / large] painting. The camera faces the wall straight on, so the canvas's edges are perfectly horizontal and vertical and the canvas is a true rectangle with no perspective. The canvas face is completely plain white with nothing on it, lit by the same sunlight, casting a soft shadow on the wall below and to its right. No other artwork, no frames, no text on anything, no people.

   Faith's room came from `originals/rooms/old-fashion.png` and `originals/rooms/overthinking.png` with `--aspect 3:4` on the first attempt.
3. Keep the empty room as `originals/rooms/<slug>.png`.
4. Read the blank canvas's corners roughly and hang the rectified painting in it:

   ```console
   $ bun .agents/skills/pictures/scripts/canvas.ts hang originals/rooms/faith.png /tmp/faith.png --corners 404,267 766,267 766,698 404,698 --out public/assets/works/05-faith-room.webp
   ```

   It finds the blank canvas's edges, refuses when its shape is more than 2% off the painting's, maps the painting onto it a pixel past its rim (`--bleed`), and multiplies it by the blank canvas's own light, scaled so its brightest point stays as painted, so the room's sun and falloff land on the paint. Then it crops the room to the painting's proportions around the painting.
5. A refusal means the model drew the wrong shape: `revise` the room with the exact ratio. A better photo of the painting later reruns `hang` on the same room, with no new generation.

The alt text describes where the painting hangs, never whose home it is.

## Site photos

| Slot | File | Shape | Rule |
| --- | --- | --- | --- |
| Portrait | `img/portrait.webp` | 4:5 | Clipped to an oval that cuts the corners hard, so the face sits well inside it, not at an edge. About 410 px wide on a desktop, the full width on a phone |
| Hero | `img/hero.webp` | 4:3 | A room picture, shown whole at the right half of the first screen on a desktop and full width on a phone |
| Atelier band | `img/atelier.webp`, `img/atelier-tall.webp` | 2080 × 924, 1170 × 1170 | Full window width; the square one replaces it below 48rem. A source narrower than about 2000 px upscales visibly here |
| In-situ | `img/insitu.webp` | 1100 × 1428 | A framed photo at most 32rem wide |
| Link preview | `img/og.jpg` | 1200 × 630 | Rendered from a scratch HTML page using the site's fonts and colours, served over http because fonts fail on `file://`, screenshot at 1200 × 630, saved with `-strip -quality 88` |
| Monogram | `#mark` in `index.html`, `img/logo.svg`, `img/favicon.svg`, `img/apple-touch-icon.png` | 107 × 203 | The same two paths everywhere, with a stroke weight per size: 4.6 in the logo, 8 in the header, 11 in the favicon. A thin stroke that reads as elegant at large sizes vanishes at 16 px |

Every `<img>` carries the file's own `width` and `height`.

## Sharp enough

A picture needs about twice the CSS pixels it is shown at, for sharp screens. The largest each slot is shown at:

| Slot | Largest |
| --- | --- |
| Gallery frame | About 580 px wide for `work--lg`, 480 for `work--md`, 380 for `work--sm` |
| Big view (desktop) | 74% of the window's height, and zooming shows the file one pixel per CSS pixel |
| Portrait | About 410 px wide |
| Atelier band | The window's width |

A picture short of that is shipped only after telling the user it will look soft and where, and asking whether a larger original exists. A messenger's compressed copy is the usual cause; the original file fixes it without any change to the layout.

## On the page

Judge every new picture where it hangs, before and after, side by side: copy `public/` to `/tmp`, make the change in the copy, and take full-page screenshots of both with the browser skill, on a desktop width and a phone width. In the copy:

- The first screen fills the window, so a tall viewport shows nothing but the hero; take full-page shots or scroll to the section.
- Pictures load lazily and may still be blank when the shot is taken; strip `loading="lazy"` and `decoding="async"` in the copy.
- Fonts fail on `file://`; serve the copy over http when type matters.
