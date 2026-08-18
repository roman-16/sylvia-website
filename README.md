# sylviapasmangiu.com

Static website for the painter Sylvia Pasmangiu. Three pages, no framework, no runtime dependencies.

## Layout

```
public/     everything that gets served, and nothing else
src/        Tailwind source, plus the local preview server
originals/  the photographs the gallery images are made from
.github/    deployment workflow
```

`public/` is the deploy root. Nothing outside it is ever reachable over the web, so `README.md`, `package.json` and the Tailwind source stay private.

## Working on it

```
direnv allow    # once, then the environment loads on cd

bun run dev     # rebuilds public/assets/css/site.css on change
bun run serve   # preview on http://localhost:8000
bun run build   # minified build
```

The toolchain is pinned with devbox: bun, git, actionlint and imagemagick. With direnv it loads on entering the directory; otherwise `devbox shell` does the same thing. Either way, dependencies install on entry if `node_modules` is missing. Without devbox, `bun install` plus a local Bun is all the site itself needs. `actionlint` checks the deployment workflow, and `imagemagick` is there for turning the photographs into WebP once the shoot happens.

`bun` only compiles the stylesheet and runs the preview server. The site itself is plain HTML, CSS and one JavaScript file, with no runtime dependencies and nothing to install for a visitor.

`bun run serve` is `src/serve.js`, about twenty lines on top of `Bun.serve`. It serves `public/` verbatim with correct MIME types, so what you see locally is exactly what deploys. Set `PORT` to use a different port.

**Preview with `bun run serve`, not by double-clicking `index.html`.** Opening the file directly gives it a `file://` origin, where CORS does not exist, so the two font preloads fail and log errors in the console. The page still renders correctly with the real fonts, but the console noise is misleading. Those preloads carry `crossorigin` because browsers fetch fonts from CSS in anonymous-CORS mode, and the preload has to match or the font gets downloaded twice.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which installs dependencies, builds the stylesheet and publishes `public/` to GitHub Pages.

One-time setup in the repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Pages → Custom domain:** `sylviapasmangiu.com`, then tick **Enforce HTTPS** once the certificate is issued.
3. Point the DNS at GitHub:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `roman-16.github.io` |

`public/CNAME` keeps the custom domain in source so it survives redeploys.

## Selling

When a piece sells, swap its `tag--available` span for `<span class="tag tag--sold" data-de="Verkauft">Sold</span>`, delete its price and its Enquire button, and move its figure below the available pieces. The contact form drops sold pieces from its dropdown on its own.

## Adding a painting

1. Put the photograph in `originals/paintings/`, named after the piece.
2. Correct it to the canvas plane and write it to `public/assets/works/` as `NN-slug.webp`.
3. Copy any `<figure class="work">` block in `public/index.html` and edit it.
4. Set `data-slug`, `data-category` (`realistic`, `pop` or `abstract`), the size class, and `data-medium` / `data-created` / `data-width` / `data-height` for the structured data. Leave `data-width` and `data-height` off until the canvas is measured; the structured data omits them rather than guessing.

Pieces are dated by year alone. Canvas sizes are written width × height, so a portrait canvas reads `30 × 40 cm` even when it is spoken of as a forty by thirty. Prices are shown in full: `€530` in English, `530 €` in German.

**Correcting a photograph.** A phone is never exactly square-on to a canvas, so the photograph keystones and opposite edges of the painting come out different lengths. Cropping cannot fix that, because the shape is wrong rather than the framing. Map the four canvas corners onto a rectangle instead:

```
magick originals/paintings/panther.jpeg -auto-orient -virtual-pixel none \
  -set option:distort:viewport 2000x1000+0+0 \
  -distort Perspective '597,750 0,0  3593,770 2000,0  3581,2270 2000,1000  605,2206 0,1000' \
  -shave 3x3 -resize 2000x1000! -quality 82 public/assets/works/06-panther.webp
```

The pairs are each source corner followed by where it should land, clockwise from top left. Pick an output size matching the canvas proportions, and check no wall survives along any edge - a strip one or two pixels wide is interpolation and is what `-shave` removes.

The viewport matters: without it the result is clipped to the source photograph's dimensions, which silently crops the output whenever the target is larger than the original.

Everything else follows on its own. The filter, the counter, the lightbox, the contact form dropdown and the JSON-LD all read the gallery out of the page, so there is no second list to keep in sync.

**Size classes** decide how wide a piece hangs: `work--hero` (8 of 12 columns), `work--lg` (7), `work--md` (5), `work--sm` (4). Add `work--drop` to push a piece down and break the top line. Choosing these is the act of hanging the wall, so pick them by eye.

Works are listed newest first, with sold pieces after the available ones. Aspect ratios are never cropped.

That order lives in the markup rather than in CSS, because the lightbox builds its previous/next sequence by reading the gallery in document order - reordering visually with `order` would leave the arrows stepping through pieces in a sequence that no longer matches the wall.

## Translations

The page is written in English. German lives beside it in `data-de` attributes on the same element:

```html
<h2 data-de="Alle Bilder sind Originale.">All pieces are originals.</h2>
<img alt="A black panther…" data-de-alt="Ein schwarzer Panther…">
```

Attributes follow the same pattern: `data-de-alt`, `data-de-aria-label`, `data-de-content`, `data-de-placeholder`, `data-de-title`.

English is the default. German is shown only when the visitor's **primary** browser language is German, since Austrian browsers routinely list German as a secondary language even when set to English. An explicit click on DE/EN overrides detection and is remembered.

## Notes

The site sets no cookies, loads no analytics, embeds nothing external and self-hosts its fonts, so it needs no consent banner. Keep it that way: adding an Instagram embed or Google Analytics would put a consent dialog in front of every painting.

The URL never changes. No fragments, no query parameters, no history entries.
