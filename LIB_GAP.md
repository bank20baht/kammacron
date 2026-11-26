# Library gaps

Verified against the published `@20baht/ui` and `@20baht/angular` **0.3.36**, with
`@20baht/element` **0.1.1**, on 2026-11-26. One gap is open (short segmented-nav items squeezed
by a long one); the seven after it are resolved.

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
