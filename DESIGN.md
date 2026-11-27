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

`apps/web/src/styles.css` maps the palette into the library's public tokens.

| Role                                                     | Light                             | Dark                              |
| -------------------------------------------------------- | --------------------------------- | --------------------------------- |
| Page / sunken (board columns) / surface (cards)          | `#EBEBE8` / `#E1E1DD` / `#FFFFFF` | `#18181A` / `#202022` / `#2A2A2D` |
| Text / muted / subtle                                    | `#1C1C1E` / `#5F5F63` / `#636367` | `#FAFAFA` / `#A3A3A8` / `#9A9AA0` |
| Primary: actions, links, the current page, a chosen item | cobalt `#2449C4`                  | `#8DB8FF`                         |
| Success / warning / danger (as text)                     | `#1F7A4D` / `#8A5D00` / `#B91C1C` | `#4ADE80` / `#FBBF24` / `#FF6B74` |

Greys are neutral: no blue or silver cast. Dark is charcoal, each layer a step apart. Every text
colour meets 4.5:1 on every layer it sits on (subtle included, on the sunken grey). Links use the
primary, so there is one blue. The orange accent `#FF7417` is left to the library's gold badge;
the app does not use it for state.

**Status colours mean one thing everywhere.** Green is done or idle, gold is review (a person
decides), red is failed: in badges, the board's column edges, the calendar, and the Stats outcomes
chart (`#1F7A4D` / `#C98A00` / `#C8202F` in both themes, checked with the dataviz palette
validator). A chosen item (a queue card, a board tile, a choice) is the primary, never a status
colour. The library theme toggle continues to manage `data-baht-theme` and system preference; a
switch lands in one frame (the toggle holds transitions while it draws the new theme, 0.3.42).

## Stickers

`@20baht/stickers` (animated isometric slabs, coloured from the `--baht-*` tokens, so they follow
both themes) add life where a page has none of its own, and nowhere else. The illustrated objects
above stay the page headers' art; a sticker never sits beside one.

| Where                       | Sticker                              | Why there                                           |
| --------------------------- | ------------------------------------ | --------------------------------------------------- |
| Sign-in                     | `key`                                | The first screen; nothing else on it                |
| Welcome, the two step cards | `terminal`, `kanban`                 | Seen once; a small sticker in each card's corner    |
| Not found                   | `street-sign`                        | In place of the generic error art                   |
| A project with no cron job  | `cron`                               | The one moving thing on an empty list               |
| Docs, each guide's title    | one a guide (frontmatter `sticker:`) | Reference pages and Playbooks (its graph) have none |

Each pops in once a beat after the page shows, rests on its still frame, and replays on hover;
under reduced motion it is the still frame from the start. They are decorative (`aria-hidden`):
the words beside them say everything. No sticker that paints in the danger red (`hot`) goes beside
a neutral message, since red means failed. Four or five in the app is the ceiling: a sticker on a
page people open many times a day stops being delight and starts being noise.

## Type

Noto Sans Thai (self-hosted variable font, `@fontsource-variable/noto-sans-thai`) for both Thai
and Latin: the UI is English, the cards, prompts and comments people write are often Thai, and
one family keeps the two scripts matched. All weights come from one file per script; the Thai
file loads only on a page with Thai text. Headings and labels use the same family. Code stays in
the system monospace, with Thai inside it falling through to Noto Sans Thai.

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

## Interaction rules (UX review, 2026-11-27)

- **Drafts are never lost silently.** `<baht-save-bar warn-on-leave>` covers reload and closing the
  tab only; in-app navigation goes through `draftGuard` (`core/draft.guard.ts`), which asks the page
  (`canLeave()`) and shows the library `dialog.confirm` (Stay / Discard and leave). The router uses
  `canceledNavigationResolution: 'computed'` so a stopped Back keeps the history in place. Project
  settings also asks before the Playbook tab closes over an unsaved playbook.
- **Destructive actions go by saved values.** Settings → Data shuts Clean now while a changed length
  is unsaved (Save or Discard first), then confirms with the summary of the saved lengths, removed
  apart from archived.
- **Every loader has four states.** Loading (skeleton), failed (`<baht-error-state>` with Try again:
  `resource.reload()`, or a fresh live subscription), empty (`<baht-empty-state>`), loaded. Read a
  `resource` through `hasValue()`; `value()` throws while it has failed. `liveFailed()` in
  `shared/live-state.ts` says when a live answer never came.
- **Cron jobs are edited in the wizard that adds them.** Edit opens the same three steps on the job;
  Save sends only what changed (`PATCH /schedules/:id`), so an every-N-minutes job keeps its interval
  unless a time is picked. The project is named in the list heading and above the steps.
- **Narrow screens take turns.** Under 900px Review shows the queue or the card, with Back to the
  queue and Next card; a decision moves on to the card after it. The queue is a listbox with one
  Tab stop (↑/↓, Home/End, Enter/Space). Under 600px Calendar opens on today's Day (a link's
  `?view=` always wins; resizing never swaps the view) under a header without description.

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
