# Library gaps

Verified against the published `@20baht/ui` and `@20baht/angular` **0.3.41**, with
`@20baht/element` **0.1.1**, on 2026-11-27. One gap is open (a theme switch fades through both
themes), with a workaround in the app. The seventeen below it are resolved, six
of them in 0.3.41 (a workflow step's own label, a new definition that keeps the run, hidden fields,
an alert's actions, an app's field type named and framed through `@20baht/ui`, segmented-nav items
that keep their width), four in 0.3.38 (a `schedule` field type, `baht-cron`, the app shell's fold
button, `clock` and `bot` icons).

## Open: a theme switch fades through both themes

Affected: `<baht-theme-toggle>`, every `--baht-*` colour with a transition; owner: `@20baht/ui`.

**What happens.** Flipping `data-baht-theme` restyles the page, and every element whose colours
have a transition (`.baht-button` 120ms, an app's own hover or highlight) fades to the new theme at
its own pace. For that moment the page shows both themes at once: verified in kammacron 0.3.41,
150ms after a switch to light the Pause button is still the dark theme's near-black with near-white
text under a light header, and the Kanban columns are still dark with their headings already dark.
The toggle's own icon is blank in that moment.

**Wanted.** The toggle (and any code that sets `data-baht-theme` through the library) holds
transitions for the frame the new theme is drawn in, so the theme lands at once. A theme switch is
not a motion with a purpose; it should not animate.

**Workaround in kammacron.** `core/theme-switch.ts` watches `data-baht-theme` on `<html>` and puts
`.app-theme-switching` there for two frames; `styles.css` sets `transition: none !important` under
it. Public API only (the attribute the toggle documents); remove it when the library does the same.

## Resolved: a workflow step's label is also the key its rules and data use

Affected: `WorkflowDefinition`, `<baht-workflow>`; owner: `@20baht/engine` / `@20baht/ui`.

**Was.** A step showed its `form_name`, and rules and the run's data were keyed by the same name:
a translated step label became the key, so the cron-job and project wizards built every rule and
read of the data from translated names.

**Published fix.** 0.3.41: `WorkflowForm.label`, what the steps strip shows; `form_name` stays the
key. kammacron's steps are now `what` / `task` / `when` and `folder` / `access` / `start`
(`CRON_STEPS`, `PROJECT_STEPS`), with their translated `label`.

## Resolved: a new workflow definition starts the run over

Affected: `<baht-workflow>` (`workflow`); owner: `@20baht/ui`.

**Was.** Setting `workflow` reset the run, so the cron-job wizard kept `getState()` before reading
another project's models and agents and called `restore()` after (`afterRenderEffect`), and compared
its definition by content so a live list's new arrays would not start the run over.

**Published fix.** 0.3.41: a new definition with the same `workflow_id` keeps the run (data, step,
Back history). Both workarounds are gone from `CronWizardComponent`.

## Resolved: a workflow drops starting data that no field has

Affected: `<baht-workflow>`, the form engine; owner: `@20baht/engine` / `@20baht/ui`.

**Was.** Starting data for a key no field has (the job's project, when it is not asked) was not in
the submitted data, and there was no hidden field to carry it: the wizard fell back to the project
it had read the options for.

**Published fix.** 0.3.41: a field with `hidden: true` is never shown and still sent. The cron-job
wizard carries `project_id` that way when it does not ask, and the fallback is gone.

## Resolved: an alert has no place for an action

Affected: `<baht-alert>`; owner: `@20baht/ui`.

**Was.** "Cron job added" wanted "See cron jobs" inside the alert; the board put the button beside
it in its `.banner` row.

**Published fix.** 0.3.41: a child with `data-slot="actions"` goes in a row at the end of the
alert. The button is inside it again.

## Resolved: a field type of the app's own cannot be named through `@20baht/ui`, and draws its own label

Affected: `CustomFieldTypes` / `CustomFieldValues`, `<baht-form>`; owner: `@20baht/ui`,
`@20baht/engine`.

**Was.** An app with only `@20baht/ui` could not augment `@20baht/engine`'s `CustomFieldTypes`
(TS2664), and `<baht-form>` drew no label around an app's control.

**Published fix.** 0.3.41: the global `BahtFieldTypes` / `BahtFieldValues` (which the engine's
interfaces extend) take an app's types with `declare global` (checked: a form with an app's type
compiles with only `@20baht/ui`), and a type that asks for `frame` gets its label, help and error
drawn by `<baht-form>`. kammacron has no field type of its own now; nothing to remove.

## Resolved: short segmented-nav items are squeezed to nothing by a long one

Affected: `baht-segmented-nav`; owner: `@20baht/ui`.

**Was.** Every item was `flex: 1 1 auto` with `min-width: 0`: beside a 120-character project name
at 360px, "All" and the other short names shrank to a letter or two.

**Published fix.** 0.3.41: items no longer grow and shrink in proportion. Checked on the board at
360px with that name: "All" and "Baan Kanom" keep their width and the long name ends in an
ellipsis.

## Resolved: a `schedule` field type — when something repeats, set like an alarm clock

Affected: the form engine and `<baht-form>`; owner: `@20baht/engine` / `@20baht/ui`.

**Was.** A form that asks "when does this repeat" had only `time`, `dropdown`, `radio` and `text`
to build it from: kammacron's first try was six radio cards that could not say "Tuesday and
Thursday at 07:30" without typing cron. kammacron built the control itself (`<kc-schedule>`, a
field type of its own) and specified it here: four cards (every few minutes, every hour, days and
time, cron), the days as chips, a sentence that reads the pick back, and a value that is a cron
string, `null` while the pick lacks something.

**Published fix.** 0.3.38: the built-in `type: 'schedule'` (`<baht-schedule>`), with
`modes`, `intervals` and `week_starts` on the field, the check and the read-only display. The
cron job form uses it with `week_starts: 'mon'` (`apps/web/src/app/shared/forms.ts`); the app's
element, its parsing and sentences, and its styles are gone. Checked in the browser: Tue and Thu
at 07:30 gives `30 7 * * 2,4`, the Cron card starts from it, and the API stores the string.

## Resolved: a `baht-cron` element — a cron expression in five boxes

Affected: a new element; owner: `@20baht/ui`. `baht-otp` stays a one-time code.

**Was.** No control for the five fields of a cron expression; kammacron's `<kc-cron>` typed them
as a one-time code is (a space moves on, Backspace steps back, a pasted expression fills all five,
a box its field does not take marked invalid).

**Published fix.** 0.3.38: `<baht-cron>`, the Cron card of `<baht-schedule>` (and the control of
a `cron` field type). `<kc-cron>` is gone; the demo video kit types `* * * * *` into the
library's boxes (`.claude/skills/demo-video/kit/scripts/record.py`).

## Resolved: the app shell cannot fold its navigator away

Affected component: `baht-app-shell`.

**Was.** From 900px up the navigator was a fixed 270px column, so a four-column board or two
windows side by side could not have the width. kammacron hid `.baht-shell-side` with a class of
its own and put a button in `data-slot="breadcrumb"`, leaning on the shell's internal class names.

**Published fix.** 0.3.38: `collapsible` (a button at the start of the header, labelled from the
catalog), `nav-collapsed`, `storage-key` and `baht-nav-collapse`. `app.html` sets `collapsible
storage-key="kammacron.nav-hidden"`, the same key and the same `"1"`/`"0"` the app kept, so a
reader's choice carries over; the class, the button, the signal and the CSS are gone. Checked in
the browser: folding drops the column, and a reload keeps it folded.

## Resolved: the curated icon set has no clock and no robot

Affected: `IconName`.

**Was.** No `clock` and no `bot`: Cron jobs used `refresh`, and the auto-pilot owner `sparkles`.

**Published fix.** 0.3.38: `clock`, `bot`, `timer` and `hourglass`. The navigator's Cron jobs
entry is `clock` and the auto-pilot owner `bot`; Claude keeps `sparkles` and Codex `code` on the
Runs cards, so the two stay told apart.

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
