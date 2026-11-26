# kammacron — Thai Risograph Illustrated UI

You plan. Claude works. You decide.

## Foundation and audit

The application remains Angular 22 with `@20baht/ui` and `@20baht/angular` **0.3.35**.
The installed package README, exports, declarations, element implementations and token CSS were
inspected before implementation. No dependencies or library internals were changed.

The library owns typography, spacing, radii, surfaces, controls, feedback, semantic tones, charts,
tables, forms, calendar, navigation, interaction and theme selection. Its Angular `BAHT_UI`
directives remain the integration layer. The existing application Kanban and its keyboard/drag
behavior remain unchanged. The library provides a JSON dashboard layout engine, but no standalone
Stack/Grid primitives; existing page CSS grids remain application compositions using library spacing.

Supported extension points used here:

- CSS custom properties from `tokens.css`, loaded first by Angular.
- `baht-page-header`'s `data-slot="art"`, `eyebrow`, `size`, and
  `--baht-page-header-art-size` API.
- `baht-empty-state`'s `data-slot="art"` API.
- `baht-card`'s `accent` and child composition, with an application wrapper for the illustrated layout.
- Existing `baht-stat`, `baht-section-header` and `baht-badge` inside illustrated compositions.

`LIB_GAP.md` records the child-relocation and brand-image fixes verified in 0.3.35.
No replacement controls, new UI library, fonts, spacing scales or grain on functional UI were added.

## Ink and paper

`apps/web/src/styles.css` follows konmek's cobalt `#2449C4` and pure white paper surfaces,
with orange `#FF7417`, light-blue dividers and deep ink `#142B49` mapped into the library's public
tokens. Page, header and table heads use theme surfaces rather than large blue background bands.
Orange uses deep ink
foreground. Dark mode uses lighter cobalt and orange against the existing layered blue-black
surfaces, with deep ink on primary buttons. Success, warning, danger and info tokens are preserved.
The library theme toggle continues to manage `data-baht-theme` and system preference.

Illustration pigments live in the assets; they do not define functional UI colors. Transparent
WebP artwork sits on either theme's surfaces without filters, blend modes, or opaque white boxes.
The user-supplied logo in `docs/screenshots/icon/app_icon.png` is the primary app identity.
Its full lockup appears on Welcome and the docs homepage; a portrait crop from that same image
occupies AppShell's public `brand-art` slot alongside its accessible text wordmark. The separate
user-supplied `docs/screenshots/icon/favicon.png` provides the transparent browser favicon.
Original source images remain untouched. Optimized exports and dimensions are recorded in
`apps/web/public/brand/MANIFEST.md`. Built-in imagegen removes the white paper background while
retaining the original white ink inside the mascot and scarf. The transparent master is
`docs/design/app-icon-transparent.png`; full logo and portrait WebP exports preserve its alpha
for both themes. Cropping and resizing do not add any backing surface.

## Illustration architecture

`apps/web/src/app/shared/illustration/` contains only presentation concerns:

- `illustration.registry.ts`: asset identifiers, run-state and worker-state mappings.
- `illustration.component.ts`: decorative, noninteractive image for public artwork slots.
- `illustrated-card.component.ts`: a library Card with editorial split or metric-corner composition.

The components have no API calls or worker actions. Pages supply existing live state. Text, badges,
metrics, controls, and technical information remain real selectable HTML/library components.

The current small-frame direction uses **one isolated object per decoration**, following the
user's refinement: a hanging calendar for Calendar, toolbox for Settings, plain rectangular tabletop mirror for
Review, and a small cloud for quiet/empty states. Fine cobalt contours, white ink, light-blue
stippled shading and sparse orange accents retain the Thai-cloud printmaking language. Each
object has a simple, complete silhouette and transparent margins; no people, buffalo scenes,
landscapes, architecture, object piles or backing rectangles appear in small card artwork.
The buffalo remains the primary brand logo. The earlier landscape experiments are archived in
`docs/design/landscape-archive/` and are no longer shipped as runtime card decorations.

The objects follow a Southern Thai rural working-household direction: plain, familiar,
economical, sturdy and used for years. Modest scuffs, rubbed paint, enamel chips, rough twine and
simple metal joints communicate material and use. No kanok/flame motifs, lotus emblems, carved
borders, filigree, ceremonial finishes or luxury styling. A break uses an ordinary enamel mug;
Review uses a cheap rectangular standing mirror, and schedules use a plain round wall clock.
The earlier ornamental object set is archived in `docs/design/ornamental-object-archive/`.

A quiet Bank signature appears as a tiny faded banknote corner tucked into the calendar binding
and toolbox lid seam, each under 5% of the main object's area. The cost metric uses one modest
folded banknote. These are generic illustrated notes with no denomination, portrait, official
seal, serial number or readable text; they communicate money without adding live financial data.

The illustrations have a 1:1 canvas and are sized for 48–96px display. Cards reserve separate
content and object regions; small artwork does not justify oversized empty panels. Metric art
sits in a compact corner. No CSS masks, blends or crops disguise the asset boundary. The style
references remain in `docs/design/`, and object-specific prompts are in the current manifest.

## Placement and meaning

| Area                         | Object and source of truth                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board                        | Small cloud as project/empty-state context; enamel mug only when the project is paused. No art on task cards.                                                             |
| Runs                         | Worker Card follows `/api/status`: paused → enamel mug, running → gear, otherwise → cloud. Explicit status badge remains.                                                 |
| Run detail                   | Actual status: running → gear, succeeded → harvested rice bundle, review → tabletop mirror, failed → broken wheel, stopped → enamel mug. Unknown/stale → no illustration. |
| Review                       | Tabletop mirror in the header; one cloud in the empty queue. Diff and approval stay primary.                                                                              |
| Calendar                     | A single hanging tear-off calendar with blank cells. Actual dates and events remain in the library Calendar.                                                              |
| Stats                        | Runs → gear; completed work → rice bundle; review → tabletop mirror; cost → one folded banknote. These identify metric categories, not inferred current status.           |
| Settings / project schedules | One toolbox; the schedules section uses a small clock. Project pause uses an enamel mug.                                                                                  |
| Onboarding                   | The user-supplied full brand logo remains in the library header.                                                                                                          |
| Alerts                       | Existing severity-first notification bell retains the library UI without added scenery.                                                                                   |

No time-of-day, MCP-connected, reverted, or all-tasks-complete artwork is inferred from incomplete
state. Those scenes can be added when an actual consumer needs them and supplies authoritative
state. The absence of a matching asset never substitutes an unrelated success illustration.

## Accessibility, responsiveness and performance

Artwork has empty alt text and an `aria-hidden` presentation host, does not receive focus, and
cannot intercept pointers. The explicit label carries every status. Decorative objects declare a 1:1
intrinsic size, use asynchronous decoding and lazy loading. There are no new animations, so no
additional reduced-motion handling is necessary. Existing library motion preferences apply.

Worker panels keep a small separate object track beside their text, including on mobile. Metric
panels reserve a compact corner region. Public header artwork sizing shrinks
on narrow screens. Existing library typography, focus behavior, controls, responsive shell and
calendar behavior are preserved.

Assets are in `apps/web/public/illustrations/`; Angular copies `public/` to the build output.
The [asset manifest](apps/web/public/illustrations/MANIFEST.md) records subjects, dimensions,
consumers, theme treatment and generation prompts. Generation used the built-in imagegen tool;
PNG outputs were resized and encoded to transparent WebP, without altering artwork content.

## Validation

Repository lint, format check, typecheck, production build and existing coverage test commands
were run. All 85 tests passed (17 web, 64 server, 4 kit), including two library-gap regression tests. Build succeeds with an initial
bundle warning (614 KB / 600 KB warning threshold) and docs content warnings. No budgets were raised.
Browser verification uses an isolated temporary database with worker execution disabled.

Browser checks covered desktop light/dark surfaces and 390px layouts for Board, Review, Calendar,
Settings, Welcome, Runs and Stats, with no document-level horizontal overflow. The pause action in
the isolated preview changed both the live label and artwork to the enamel mug. Native table
and tab scrolling remain available. Stats ranges sit in a constrained row below the page header;
chart and Settings grids allow their content tracks to shrink on narrow screens.

## Library gap verification — 0.3.35

Updated `@20baht/ui` and `@20baht/angular` together to 0.3.35, resolving
`@20baht/element` 0.1.1. An Angular integration regression test verifies direct Card `@if` switches
and `@for` insertion/reordering/removal, plus AppShell brand-art projection, brand name, link and
cancelable navigation. The workaround-only wrappers in playbooks and schedules were removed.
The illustrated Card wrapper remains because it owns the application artwork layout.
AppShell now supports `data-slot="brand-art"` and `--baht-shell-brand-art-size`; the production
shell uses the supplied buffalo portrait through that API, retaining its text wordmark and link.
