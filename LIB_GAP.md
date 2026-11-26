# Library gaps

Verified against the published `@20baht/ui` and `@20baht/angular` **0.3.36**, with
`@20baht/element` **0.1.1**, on 2026-11-26. Six gaps are open (a `schedule` field type;
a `baht-cron` element; a field type of the app's own cannot be named through
`@20baht/ui`, and draws its own label; the app shell cannot fold its navigator; the curated icons
have no clock and no robot; short segmented-nav items squeezed by a long one); the seven after
them are resolved.

## Open: a `schedule` field type — when something repeats, set like an alarm clock

Affected: the form engine and `<baht-form>` (a new built-in type), the validator, the builder;
owner: `@20baht/engine` / `@20baht/ui` / `@20baht/validator`.

**What happens.** A form that asks "when does this repeat" (a cron job, a reminder, a report,
a backup) has only `time`, `dropdown`, `radio` and `text` to build it from. kammacron's first try
was six radio cards (Every N min, Hourly, Daily, Weekdays, Weekly, Cron) with the fields of each
under them: long, and it could not say "Tuesday and Thursday at 07:30" without typing cron.
People set an alarm clock every day: a time and the days it rings, as chips.

**The control** (as kammacron built it, `apps/web/src/app/shared/schedule-input.ts`):

- four mode cards: **Every N min** (chips: 5, 10, 15, 20, 30, the steps that divide an hour),
  **Every hour** (the minute past), **Date** (a time, and days of the week as toggle chips,
  Mon … Sun, any number of them), **Cron** (the five fields: a `baht-cron`, below);
- a sentence that reads it back with the expression: "Runs on Tue and Thu at 07:30 · cron 30 7 * * 2,4";
- picking **Cron** fills its boxes with what the card before it made; an expression handed in is
  read back into the card that says it, when one does;
- the field's label and required mark, errors under it, light and dark themes, keyboard
  (chips are buttons with `aria-pressed`, modes a radio group, each box labelled).

**Value: a cron expression, a string** (`"30 7 * * 2,4"`), what `getData()` gives and the server
stores; `null` while the pick is not complete (so `required` speaks). The picker reads any
expression back: `M H * * D` is Date, `*/N * * * *` Every N min, `M * * * *` Every hour,
anything else the five boxes.

**Descriptor.**

```jsonc
{
  "order": 2,
  "type": "schedule",
  "key": "when",
  "label": "When",
  "required": true,
  "modes": ["interval", "hourly", "date", "cron"], // which cards, in order; default all four
  "intervals": [5, 10, 15, 20, 30], // the Every N min chips
  "week_starts": "mon",
} // chip order; default from the locale
```

**Helpers the engine should export** (pure, so a server and a table use them too):
`cronSummary(cron, locale)` → the sentence; `cronProblem(cron)` and `cronPartValid(text, index)`
→ the check; `nextRuns(cron, from, n)` → the next times, for a preview and the calendar.

**Check** (engine and validator alike): five fields, each in its range (minute 0-59, hour 0-23,
day 1-31, month 1-12, day of week 0-7) with `*`, lists, ranges and steps, or a macro; and a next
time that exists (`0 0 31 2 *` never comes). Catalog keys for each message (en, th).

**Read-only display**: the sentence and the expression.

**Workaround.** All of the above lives in the app as a field type of its own
(`registry.fieldTypes.schedule` in `apps/web/src/app/shared/forms.ts`, the element in
`shared/schedule-input.ts`, its cron boxes `<kc-cron>` in `shared/cron-input.ts`, the parsing, the
check and the sentences in `shared/schedule.ts` with
their tests in `schedule.spec.ts`, the styles under `kc-schedule` and `kc-cron` in
`apps/web/src/styles.css`). Copy from there.

## Open: a `baht-cron` element — a cron expression in five boxes

Affected: a new element in `@20baht/ui` (and its Angular directive); owner: `@20baht/ui`.
`baht-otp` stays as it is: a one-time code is one character a box, a cron field is not.

**What it is.** One box per field of a cron expression, captioned under it: minute, hour, day of
month, month, day of week. Typed the way a one-time code is: a space moves to the next box,
Backspace in an empty box steps back, the arrows cross boxes at their ends, and an expression
pasted into any box fills all five (a macro, `@daily`, spelt out). Each box takes digits and
`*` `,` `/` `-`, and is marked `aria-invalid` (a red border) when its text is not that field's:
a number out of its range, an empty step, a range backwards.

**API.**

```html
<baht-cron value="30 7 * * 2,4"></baht-cron>
```

|               |                                                                             |
| ------------- | --------------------------------------------------------------------------- |
| `value`       | the expression, a string (the five boxes joined by single spaces)           |
| `disabled`    | locks every box                                                             |
| `labels`      | the captions, from the catalog by default (en, th)                          |
| `baht-change` | every edit: `{ value, valid }` (`value` even while a box is empty or wrong) |
| `focus()`     | the first box                                                               |

It is also the built-in control of a `cron` field type (value: the string; check: the five
fields, each in its range, or a macro), and the **Cron** card of the `schedule` type.

**Workaround.** `<kc-cron>` in `apps/web/src/app/shared/cron-input.ts` is this element as the
app needed it (same `value`, `disabled`, `baht-change { value, valid }`, `focus()`); the per-field
check is `partValid()` in `shared/schedule.ts`, the styles `.kc-cron-*` in `apps/web/src/styles.css`.

## Open: a field type of the app's own cannot be named through `@20baht/ui`, and draws its own label

Affected: `CustomFieldTypes` / `CustomFieldValues`, `<baht-form>`; owner: `@20baht/ui`,
`@20baht/engine`.

**What happens.** `@20baht/ui/engine` is `export * from '@20baht/engine'`, so an app that installs
only `@20baht/ui` (as `20baht create` makes it) cannot write
`declare module '@20baht/engine' { interface CustomFieldTypes { … } }`: TypeScript says the module
cannot be found (TS2664), and augmenting `@20baht/ui/engine` does not merge into the interface.
Second, `<baht-form>` renders no label for a field of such a type: the control must draw the
label and the required mark itself (with `.baht-label` and `.baht-required-mark`).

**Fix wanted.** Re-export the two interfaces from a module the app has, or document adding
`@20baht/engine` at the same version; and have `<baht-form>` render the label (and help) around
any control, its own or the app's, so an app's control is only the control.

**Workaround.** `@20baht/engine` 0.3.36 added to `apps/web/package.json`; the schedule element
draws its label from `field.label` and `required`.

## Open: the app shell cannot fold its navigator away

Affected component: `baht-app-shell`; owner: `@20baht/ui`. Asked for in several apps already.

**What happens.** From 900px up the navigator is a fixed 270px column (`.baht-shell-body` is
`grid-template-columns: 270px minmax(0, 1fr)`), and nothing folds it. A page that needs the width
(a four-column Kanban board, two windows side by side) cannot have it. There is also no slot at
the start of the header for the button that would do it: `data-slot="actions"` sits at the end.

**Reproduce.** `<baht-app-shell scroll="main">` around a page whose content wants the full
width, at 1150px: the page gets 880px and there is no way to give it the navigator's 270px.

**Fix wanted.** A `nav-collapsed` property (reflected; `baht-nav-collapse` event when it
changes), with a built-in toggle at the start of the header (or a `data-slot="header-start"`
for the app's own), that drops the navigator column from 900px up and leaves the strip below
900px as it is. Ideally remembered per app (`storage-key`), and the toggle labelled from the
catalog ("Hide the navigator" / "Show the navigator").

**Workaround.** `apps/web/src/styles.css`: a `nav-hidden` class on the host sets
`.baht-shell-body { grid-template-columns: minmax(0, 1fr) }` and hides `.baht-shell-side`
from 901px up; the toggle is a `baht-button` in `data-slot="breadcrumb"` (the only slot by the
brand), its state in `localStorage['kammacron.nav-hidden']` (`app.ts`). It leans on the shell's
internal class names, so a change in them breaks it.

## Open: the curated icon set has no clock and no robot

Affected: `IconName` (`baht-button icon`, `baht-menu icon`, a radio card option's `icon`, a
navigator entry's `icon`); owner: `@20baht/ui`.

**What happens.** An app about scheduled agents has no icon for time or for the agent. The set
has `calendar`, `refresh`, `activity`, `sparkles`, `code`, `terminal`, but no `clock`/`timer`
and no `bot`/`robot`. The library draws a clock already (the `time` field's trigger), it is only
not in the set.

**Where kammacron wanted them.** The navigator's Cron jobs entry and the cron job form's When
cards (Every N min, Hourly) want `clock`; the Runs cards (Claude, Codex) and the board's agent
owner want `bot`.

**Fix wanted.** `clock` (the `time` field's glyph) and `bot` in `IconName`; `timer` and
`hourglass` would serve waits.

**Workaround.** `refresh` for Cron jobs and Every N min, `activity` for Hourly, `sparkles` for
Claude and the auto-pilot owner, `code` for Codex (`apps/web/src/app/shared/forms.ts`,
`core/navigation/navigation.ts`).

## Open: short segmented-nav items are squeezed to nothing by a long one

Affected component: `baht-segmented-nav`; owner: `@20baht/ui`.

**What happens.** Since 0.3.36 a label that does not fit ends in an ellipsis instead of drawing
over its neighbours, which fixed the overlap. But every item is `flex: 1 1 auto` with
`min-width: 0`, so items shrink in proportion to their width: at 360px, beside a 120-character
project name, "All", "Backlog" and "J" shrink to "A", "B." and "." while the long name keeps most
of the room.

**Reproduce.** `<baht-segmented-nav>` with items "All", "Backlog", "J" and
"ระบบจัดการคำสั่งซื้อและสต็อกสินค้าสำหรับร้านค้าออนไลน์หลายสาขา (Northwind Industries Holdings)" in a
320px container.

**Fix wanted.** Let short labels keep their width and take the shrinking from the long ones: for
example `flex: 0 1 auto` with `min-width: min(max-content, 4rem)` on an item (or `flex-shrink`
weighted by label length), or a horizontally scrolling nav once the items reach their minimum.

**Workaround.** None in the app.

## Resolved: a modal that is open when it moves loses its layer

Affected component: `baht-modal` (and `baht-panel`).

**Was.** An open modal that was moved (disconnected and connected again) dropped off the layer
stack, so Escape and the Tab trap stopped working. kammacron hit it on a `/board?card=12` link,
where `baht-app-shell` moves the page after the card's modal opens; the board delayed opening the
modal until the shell had placed the page.

**Published fix.** 0.3.36: `connectedCallback()` pushes the layer again when the modal is open.
The board's delay is gone; Escape closes a deep-linked card's modal (checked in the browser).

## Resolved: a card cannot fill its grid cell

Affected component: `baht-card`.

**Was.** A card's border ended at its content, so the Stats tiles had different heights;
`app-illustrated-card` stretched the card's light-DOM class names itself.

**Published fix.** 0.3.36 adds the `fill` attribute. `app-illustrated-card` uses
`<baht-card fill>` and no library class names; the four Stats tiles are the same height.

## Resolved: an alert does not wrap a long unbreakable string

Affected component: `baht-alert`.

**Was.** A long URL in a review reason widened the alert (89px past a 360px screen in the card
modal).

**Published fix.** 0.3.36: `.baht-alert-main { min-width: 0; overflow-wrap: anywhere; }`. The
reason now wraps inside the alert at 360px.

## Resolved: a block of code has no height limit

Affected component: `baht-code` (`variant="block"`).

**Was.** A run step's output (up to about 400 lines) made a 7,700px-tall block.

**Published fix.** 0.3.36 adds `max-lines` and `follow`. The run page shows each step's output in
20 lines that scroll inside, kept at the end while the output grows.

## Resolved: the table toolbar says "1 results"

Affected component: `baht-table` (`total`).

**Published fix.** 0.3.36 picks the string by count; the Runs page reads "1 result".

## Resolved: Card content relocation and Angular control-flow anchors

**Original issue (0.3.34).** Switching playbooks threw `NG05106` because Card moved the comment
anchors of direct `@if` / `@for` blocks. Newly added schedules could appear below their form.
Affected component: `baht-card`; shared owner: `@20baht/ui` / `@20baht/element`.

**Previous workaround.** A plain wrapper div around all Card children in the playbook editor and
project schedules, keeping Angular anchors away from the relocated host children.

**Published fix.** `@20baht/ui` 0.3.35 requires `@20baht/element` >=0.1.1. The element's supported
child-projection behavior forwards insert/remove/replace operations to the relocated node's actual
parent. Angular can use its original anchors without an application workaround.

**Verification.** `apps/web/src/app/shared/library-gaps.spec.ts` uses the installed published
packages with direct `@if` / `@for` children. Switching branches, appending, reordering and removing
rows all preserve the expected order before the add control, without exceptions.

**Application cleanup.** Removed the workaround-only wrappers from
`playbook-editor.component.ts` and `project-settings.component.html`. The illustrated Card's wrapper
is retained for its application layout, not to work around framework projection.

**Long-term solution.** Use the upstream fix and retain the integration regression test. No local
fork, renderer patch or library-internal modification is needed.

## Resolved: AppShell brand artwork API

**Original issue (0.3.34).** `baht-app-shell` exposed a text brand and slots for actions, breadcrumb
and nav-start, but no brand artwork slot. A real application logo could not sit inside the existing
brand link through a public API; the other slots place content in different regions.

**Requested capability / owner.** A public `data-slot="brand-art"` region and size token in
`@20baht/ui`, retaining the shell's accessible brand link and responsive behavior. Artwork belongs
to the consuming application.

**Published fix.** 0.3.35 provides `data-slot="brand-art"` and
`--baht-shell-brand-art-size` (default 28px). An image or SVG sits before the wordmark. Decorative
images use `alt=""`; the `brand` text supplies the name. The fallback mark is hidden by the library
when custom artwork exists.

**Verification.** The Angular integration regression test confirms the image is inside the original
brand link, the wordmark remains, and the existing cancelable `baht-navigate` event carries the
original href.

**Application adoption.** The user has supplied `docs/screenshots/icon/app_icon.png`. A portrait
crop from that logo now occupies the production shell's public `brand-art` slot, sized using
`--baht-shell-brand-art-size`. The full logo appears in Welcome. The text wordmark and accessible
brand link remain intact; no internal selectors or library workaround are needed.

## Supported application compositions

PageHeader and EmptyState artwork slots, Card composition, library theme tokens and existing
application CSS grids cover the illustration requirements. Buffalo scenes, asset registration,
state-to-scene mappings and artwork layout remain kammacron concerns.

The earlier Kanban and dark-layer concerns were already settled in the application: `app-kanban`
provides keyboard moves and drag interactions; `apps/web/src/styles.css` uses library theme tokens.
