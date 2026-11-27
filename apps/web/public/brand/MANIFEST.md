# Application icon and favicon

**2026-11-27: the logo is the owner's glowing mark** (the buffalo in ลายฉลุ paper with gear horns,
the clock and the scarf, an orange and blue glow, no wordmark), supplied as a transparent PNG and
kept unchanged as `docs/design/app-icon-transparent.png`. The earlier master with the baked
wordmark and tagline is kept as `docs/design/app-icon-wordmark-2026-11-26.png`. Exports now:

| Export                                                  | From the master                                   | Size      |
| ------------------------------------------------------- | ------------------------------------------------- | --------- |
| `brand/app-icon.webp` (web and docs, docs `src/assets`) | the whole canvas                                  | 768 × 512 |
| `brand/app-mark.webp` (docs, docs `src/assets`)         | the art's square (x 300–1237, y 23–1000, centred) | 256 × 256 |
| `brand/app-mark.webp` (web: the shell draws it at 40px) | the docs export, scaled down                      | 96 × 96   |
| `apple-touch-icon.png` (web and docs)                   | the square, 92 %                                  | 180 × 180 |
| `icon-192.png`, `icon-512.png` (PWA)                    | the square, 94 %, transparent                     | 192, 512  |
| `icon-maskable-512.png` (PWA)                           | the square, 72 % (the safe zone), on `#ebebe8`    | 512       |

The web app's PNG icons are saved with a 256-colour palette (the art is two inks and a glow): 139 KB
for the four, from 690 KB. The docs keep the full-colour exports.

Logo links carry `v=glow-3`. The favicons (`favicon*.png`, `.ico`, docs `favicon.svg`) are their
own source and are unchanged. The notes below describe the earlier exports.

## Earlier exports (2026-11-26)

The user supplied both original images. Originals remain unchanged in `docs/screenshots/icon/`.
Built-in imagegen removes the white paper background from the primary logo, preserving the
white artwork inside the buffalo and scarf. The transparent master is
`docs/design/app-icon-transparent.png`. Pillow then crops/resizes and encodes the runtime assets;
no white padding or backing surface is added. The separate favicon is unchanged.

| Export                 | Source                          | Dimensions          | Use                                                                                                  |
| ---------------------- | ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `brand/app-icon.webp`  | `app_icon.png`                  | 768 × 512           | Full logo, name and tagline on Welcome; docs hero                                                    |
| `brand/app-mark.webp`  | `app_icon.png`                  | 256 × 256           | Portrait crop with clock, horns, face and scarf for AppShell's public brand-art slot and docs header |
| `apple-touch-icon.png` | Portrait crop of `app_icon.png` | 180 × 180           | Home-screen icon with transparent padding                                                            |
| `favicon-16x16.png`    | `favicon.png`                   | 16 × 16             | Small browser tab favicon                                                                            |
| `favicon-32x32.png`    | `favicon.png`                   | 32 × 32             | High-density browser tab favicon                                                                     |
| `favicon-48x48.png`    | `favicon.png`                   | 48 × 48             | Larger browser icon                                                                                  |
| `favicon.ico`          | `favicon.png`                   | Embedded 16, 32, 48 | Multi-resolution browser compatibility                                                               |

The portrait uses source coordinates `(350, 8, 1170, 704)` above the baked wordmark, fitted inside
an uncropped square with transparent padding. The full logo preserves its 3:2 aspect ratio. Logo exports derive from the transparent master. Favicon
exports preserve the source aspect ratio with transparent padding; they are never stretched.
WebP exports use quality 92 and PNG exports retain alpha where the source is transparent.

Matching public exports are in `apps/docs/public/`; Starlight's optimized logo/hero sources are
in `apps/docs/src/assets/app-mark.webp` and `app-icon.webp`. Favicon links carry `v=buffalo-1`; logo/touch-icon links carry `v=transparent-2`
to refresh browser caches. AppShell keeps real selectable brand text and its original navigation;
the adjacent portrait uses empty alt text to avoid duplicating the accessible name.

## Background-removal prompt

> Use case: background-extraction. Edit this exact kammacron logo ONLY to remove its white paper background and produce genuine alpha transparency. Preserve the original 3:2 canvas and exact composition. DO NOT redesign, redraw, stylize, recolor, move, scale or retype the logo. Retain the exact buffalo face, ink strokes and Risograph grain, gear horns, clock hands and orange radial marks, orange-white checkered scarf, cobalt wordmark and orange diagonal stripes. The wordmark MUST remain exactly 'kammacron'. Tagline MUST remain exactly 'You plan. Claude works. You decide.' with the same blue/orange coloring. Remove only the surrounding white paper/background and the background in open gaps between elements and letter counters. Preserve intentional WHITE INK enclosed inside the buffalo face, ears, horn faces and scarf checks; those whites are part of the artwork and must not be erased. Keep fine edges and grain clean without a white rectangular matte, halo, checkerboard pattern, drop shadow, new outline or tinted backdrop. The result must have fully transparent outer corners and transparent open spaces, ready to place over a dark UI without any white box.
