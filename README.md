# sylviapasmangiu.com

Static website for the painter Sylvia Pasmangiu. Three pages, no framework, no runtime dependencies.

## Layout

```
public/     everything that gets served, and nothing else
src/        Tailwind source, plus the local preview server
.github/    deployment workflow
```

`public/` is the deploy root. Nothing outside it is ever reachable over the web, so `README.md`, `package.json` and the Tailwind source stay private.

## Working on it

```
bun install
bun run dev     # rebuilds public/assets/css/site.css on change
bun run serve   # preview on http://localhost:8000
bun run build   # minified build
```

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

## Still to fill in

| Placeholder | Where | What it needs |
| --- | --- | --- |
| `REPLACE_WITH_WEB3FORMS_ACCESS_KEY` | `public/index.html` | Free access key from web3forms.com, registered to `pasmangiusylvia@gmx.at`. Until it is set, the contact form fails gracefully and offers the email address instead. |
| Trade register details | `public/impressum.html` | Whether a Gewerbeberechtigung applies, plus GISA number and VAT ID if so. Question for the WKO. |
| `date to follow` | `public/index.html` | Signature dates for four pieces. |

Every dimension in the gallery is a placeholder until the paintings are measured, and Elefanten is flagged as sold only to demonstrate that state.

## Adding a painting

1. Put the photograph in `public/assets/works/` as `NN-slug.webp`, cropped to the canvas edge.
2. Copy any `<figure class="work">` block in `public/index.html` and edit it.
3. Set `data-slug`, `data-category` (`realistic`, `pop` or `abstract`), the size class, and `data-medium` / `data-created` / `data-width` / `data-height` for the structured data.

Everything else follows on its own. The filter, the counter, the lightbox, the contact form dropdown and the JSON-LD all read the gallery out of the page, so there is no second list to keep in sync.

**Size classes** decide how wide a piece hangs: `work--hero` (8 of 12 columns), `work--lg` (7), `work--md` (5), `work--sm` (4). Add `work--drop` to push a piece down and break the top line. Choosing these is the act of hanging the wall, so pick them by eye.

Works are listed newest first. Aspect ratios are never cropped.

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
