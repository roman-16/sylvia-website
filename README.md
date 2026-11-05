# sylviapasmangiu.com

Static website for the painter Sylvia Pasmangiu. Three pages, no framework, no runtime dependencies.

## Layout

```
public/     everything that gets served, and nothing else
src/        Tailwind source
originals/  the photographs and room pictures the site images are made from
.agents/    the pictures skill: how every site image is made from what arrives
.github/    deployment workflow
```

`public/` is the deploy root. Nothing outside it is ever reachable over the web, so `README.md`, `package.json` and the Tailwind source stay private.

## Working on it

```
direnv allow    # once, then the environment loads on cd

bun run dev     # watches the stylesheet and serves public/ on http://localhost:3000
bun run build   # minified build
```

`bun run dev` runs two things at once: Tailwind rebuilding `public/assets/css/site.css` on change, and `serve` publishing `public/`. Ctrl-C stops both. It refuses to start if port 3000 is taken rather than quietly moving to another one, because a preview server on an unexpected port is how you end up reading a stale page.

`serve` is given `public` and nothing else. Do not pass it `--config`: it resolves the path inconsistently and ends up publishing the repository root, which puts `README.md`, `originals/` and `src/` on a public port. The cost of leaving the config off is that `serve` redirects `/impressum.html` to `/impressum`, which GitHub Pages does not do. Local cosmetics only.

The toolchain is pinned with devbox: bun, git, actionlint, imagemagick, gcc-unwrapped and watchman. With direnv it loads on entering the directory; otherwise `devbox shell` does the same thing. Either way, dependencies install on entry if `node_modules` is missing. `actionlint` checks the deployment workflow and `imagemagick` turns the photographs into WebP.

`gcc-unwrapped` and `watchman` exist only so Tailwind's `--watch` works. Its file watcher needs `libstdc++.so.6`, which a devbox environment does not otherwise provide, and the init hook puts the package library directory on `LD_LIBRARY_PATH` so the watcher can load it. Without those, `--watch` dies at startup with `ERR_DLOPEN_FAILED`. If the stylesheet ever stops updating, run `bun run build` by hand and check that hook ran.

The site itself is plain HTML, CSS and one JavaScript file, with no runtime dependencies and nothing to install for a visitor. Bun and `serve` are build and preview tooling; neither reaches production. `serve` is a Node program, so it only runs through `bun run`, which supplies the `node` shim that the devbox environment lacks.

**Preview with `bun run dev`, not by double-clicking `index.html`.** Opening the file directly gives it a `file://` origin, where CORS does not exist, so the two font preloads fail and log errors in the console. The page still renders correctly with the real fonts, but the console noise is misleading. Those preloads carry `crossorigin` because browsers fetch fonts from CSS in anonymous-CORS mode, and the preload has to match or the font gets downloaded twice.

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

## Removing a painting

Delete its `<figure class="work">` and its two files in `public/assets/works/`. Its sources stay in `originals/`. Nothing else on the site names it afterwards, alt texts and file names included.

## Adding a painting

1. Make its two pictures with the `pictures` skill in `.agents/skills/pictures/`: the painting as `public/assets/works/NN-slug.webp` and its room picture as `NN-slug-room.webp`, their sources in `originals/`.
2. Copy any `<figure class="work">` block in `public/index.html` and edit it. The painting is the first `work__slide`, the room picture the second.
3. Set `data-slug`, the size class, and `data-medium` / `data-created` / `data-width` / `data-height` for the structured data. Leave `data-width` and `data-height` off until the canvas is measured; the structured data omits them rather than guessing.

Pieces are dated by year alone. Canvas sizes are written width × height, so a portrait canvas reads `30 × 40 cm` even when it is spoken of as a forty by thirty. Prices are shown in full: `€530` in English, `530 €` in German.

Everything else follows on its own. The counter, the arrows and dots on each frame, the lightbox, the contact form dropdown and the JSON-LD all read the gallery out of the page, so there is no second list to keep in sync. A piece with a single slide gets no arrows.

**Pictures.** Each frame is a horizontal scroll strip that snaps picture by picture, so phones swipe it natively and the arrows only scroll it. Every picture of a piece shares the painting's aspect ratio, so the frame never changes size between them. The painting photograph is never cropped; the room picture is cropped to fit it, the way Instagram crops a post.

**Size classes** decide how wide a piece hangs: `work--lg` (6 of 12 columns), `work--md` (5), `work--sm` (4). Add `work--right` to hang a piece flush with the right edge, and `work--drop` to push it down and break the top line. Choosing these is the act of hanging the wall, so pick them by eye. Nothing hangs wider than half the wall, so no painting fills the screen.

Works hang in the order of Sylvia's Instagram feed, newest post first. Pieces she has not posted follow, and sold pieces come last.

That order lives in the markup rather than in CSS, because the lightbox builds its previous/next sequence by reading the gallery in document order, picture by picture - reordering visually with `order` would leave the arrows stepping through pieces in a sequence that no longer matches the wall.

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
