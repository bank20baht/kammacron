---
name: bank20baht-ui
description: Work on or with @20baht/ui (packages/core/ui): the 95 <baht-*> Lit Web Components, the DOM-free rules engine (@20baht/ui/engine), dialog/toast overlay, React typings, SSR/hydration and the --baht-* design tokens and themes. Use when adding or changing a component, an engine rule/validator, a field type, tokens/theming/dark mode, keyboard shortcuts, SSR, or when wiring the elements into an app.
---

# @20baht/ui (`packages/core/ui`)

**JSON in, form out.** 95 `<baht-*>` elements (Lit, **light DOM**, so page CSS reaches every node) plus a
pure-TypeScript engine with no DOM dependency. Version line 0.20.x, the number every bahtui library except the stickers shares.

## Map

```
src/index.ts            registers every element; re-exports engine + primitives
src/engine.ts           `@20baht/ui/engine`: re-exports @20baht/engine (packages/core/engine)
../engine/src/          engine: types.ts (the schema types), engine/{evaluate,graph,conditions,expressions,scripts},
                        validators, defaults, display, views, flags, approval, i18n, dates, urls, pattern-safety,
                        shortcut, legacy (snake_case normaliser)
src/components/         baht-form.ts (L1), baht-workflow.ts (L2), base.ts (BahtElement), field-base.ts
                        (BahtFieldBase), define.ts (customElement), layers.ts (modal stack), shortcuts.ts,
                        menu-controller.ts, motion.ts, primitives/ (one baht-<name>.ts per tag + shared modules)
src/tokens/tokens.css   --baht-* tokens; generated theme-scope / theme-light blocks
src/overlay.ts | react.ts | ssr.ts | hydrate.ts | register.ts     extra entry points
tests/core/             node env        tests/components/   happy-dom (@vitest-environment docblock)
tests/ssr/              real node render + hydration against the built dist
docs/                   theming.md, ssr.md, components/<tag>.md (bundled into bahtui-mcp), frameworks/
dist/                   vite lib build + custom-elements.json + web-types.json (apps/docs and apps/mcp read them)
```

Entry points (`exports`): `.`, `./engine`, `./overlay` (`dialog`, `toast`), `./react`, `./ssr`
(`renderToString`), `./hydrate`, `./register`, `./components/<name>` (one per tag, plus `form`/`workflow`),
`./tokens.css`, `./css/*.css` (split sheets; `css/datepicker.css` is opt-in). Optional peers, loaded on
demand: `flatpickr` (`<baht-datepicker>`), `marked` + `dompurify` (`markdown`), `@lit-labs/ssr`, `react`.

## The two engines

- `<baht-form>` (L1): a controlled component. `el.form = FormDefinition`, `el.value`, `el.registry`,
  `el.flags`, `view` / `readonly` attributes. Methods `getData()`, `setValue(patch)`, `reset()`,
  `validate()`. Events `baht-input`, `baht-change`, `baht-validity`. No buttons, no fetch: the host owns state.
  `value` is the starting point, not a live binding: a new `value` drops only the edits to keys it
  changes (by content), and `<baht-workflow>` ignores a `value` equal by content to the last (`sameData`
  in `base.ts`).
- `<baht-workflow>` (L2): `el.workflow = WorkflowDefinition` (forms by `order`, `rules`, optional
  `transitions`). Owns Next/Back/Submit and approval steps. Methods `getData()` (nested
  `{ form_name: { key } }`), `setValue(form_name, patch)`, `next()`, `back()`, `approve()`, `reject()`,
  `gotoStart()`. Events `baht-next`, `baht-submit`, `baht-complete`, `baht-data-change`,
  `baht-step-change`, `baht-nav-blocked`, `baht-approve`, `baht-reject`. Approval decisions are
  `'approved' | 'rejected'`.
- Headless (`@20baht/ui/engine`): `evaluate`, `walkPath`, `resolveNext`, `visibleForms`,
  `updateWorkflow` / `replayWorkflow` / `nextTarget` / `currentForm` / `snapshotOf` (the workflow runtime: state + message in, state + events out; `<baht-workflow>` tells each step as `baht-transition`), `updateForm` / `formData` / `formFieldState` / `emptyFormState` (the form session: one form's edits, errors and script state, the same way), `validateField`,
  `displayValue`, `applyFlags`, `resolveViewFields`, `defaultValue`, `approvalFields`, `advanceRun` (a server-kept run's next step), `askedTargets` / `settleStep` (an approval step's `assignment`, spec 03 §4.1: who is asked, and when the step is settled; for a server), `runScripts` /
  `createScriptContext`, `isUnsafePattern`, `normalizeTagsValue`, `rangeBounds`, `ratingMax`, `isSafeUrl`,
  `parseShortcut` / `formatShortcut` / `matchShortcut`, `setLocale` / `setCatalog` / `t`.

Field types (22): `text textarea markdown number currency email password dropdown multiselect tags
checkbox radio toggle rating range date time file reference label section repeater`. Widths
`1/4 | 1/2 | 3/4 | full`. Value shapes worth remembering: `tags` is a trimmed, de-duplicated `string[]`;
`rating` is `1…max` or `null`; `range` is `number | null` (null = never touched); `time` is `"HH:mm"`
(24-hour) or `null`; `reference` holds the
record **id**, never `{ id, label }`; `markdown` is a string (raw HTML renders as text).

Registry slots (functions by name, never in JSON): `formatters`, `validators`, `options` (for
`options_from`), `uploaders`, `scripts`, `references` (`{ search(term, data), resolve?(id) }`) and
`markdownImage(href)` (which image hosts may embed; same origin when unset).

## Invariants (see also CLAUDE.md)

- Refs are `formName.fieldKey`; no dots in keys; never `__proto__`/`constructor`/`prototype`.
- `eq`/`ne` strict, ordering ops coerce. Hidden and flag-off fields are cleared and excluded.
- Client scripts (spec 01 §14): `form.scripts[] = { on: 'load'|'change'|'submit', field?, handler }`;
  `handler(g, event)` with a `g_form`-style context. Script state overrides rule state; `submit` re-runs in
  the validator, `load`/`change` do not.
- Wire JSON is snake_case; props, events and registry keys camelCase.
- Elements register through `components/define.ts`'s `customElement`, which skips (and warns on) a tag
  another copy already defined. Keep the decorator name: the CEM analyzer keys on it.
- SSR: no module-level id counters (use the element `uid`); guard document listeners with `hasDom()`;
  honour `defer-hydration`. Every shipped tag renders deterministically in `tests/ssr/render.spec.ts`.
- Keyboard shortcuts (`<baht-button shortcut>`, split-button and menu items) are **bound** by the library
  through one document listener; the topmost open modal scopes them (`layers.ts`).
- Motion is light and CSS-owned; everything respects `prefers-reduced-motion`.

## Tokens and themes (`docs/theming.md`)

- Override `--baht-*` on `:root` or any ancestor. Main knobs: `--baht-primary` (action, blue #2e4a9e
  since 0.18.2), `--baht-neutral` (navy shell band), `--baht-accent`, `--baht-carbon`, `--baht-base-100/200/300`,
  fonts `--baht-font-family` / `-display` / `-mono` / `-label`.
- Type: size steps are `--baht-text-xs|sm|base|md|lg|xl|2xl`; the semantic sizes are `--baht-font-size`
  (14px) and its `-label` / `-error` / `-control`. There is no `--baht-font-size-sm`. Line height
  `--baht-leading-tight` (1.1) / `--baht-leading-normal` (1.5). Table at the top of `tokens.css`.
- Dark: `data-baht-theme="dark"` (or `.baht-dark`) on `<html>` or any wrapper; light inside dark with
  `data-baht-theme="light"` / `.baht-light`. Dark never activates from the OS alone; `<baht-theme-toggle>`
  flips and persists it (`default="system"` opts in to the OS).
- The theme-scope and theme-light blocks in `tokens.css` are **generated**: after editing a token run
  `bun run --filter @20baht/ui tokens:theme-scope`, or `tests/core/theme-scope.spec.ts` fails.
- The docs site's banknote palettes (`data-note`) swap `--baht-primary` / `--baht-neutral` and the
  `--baht-green-*` ramp; check new styles under them and in dark.

## Adding or changing a component

1. Seam first: a failing test in `tests/components/<tag>.spec.ts` (happy-dom) against the public
   attribute/property/event contract; engine behaviour goes in `tests/core/`.
2. Implement `src/components/primitives/baht-<name>.ts`: extend `BahtElement` (or `BahtFieldBase` for a
   field), `@customElement` from `define.ts`, JSDoc on the class and every `@property` (the analyzer turns
   them into `custom-elements.json` and the docs API tables). Export from `primitives/index.ts`.
   An element that places its light-DOM children overrides `adoptChildren()` (base.ts): it runs after
   every render and whenever a framework adds a child, so never adopt in `firstUpdated`/`updated`.
   Adopt into a container with no template part inside or after it (a part re-rendering clears
   what follows it: the `<baht-button loading>` bug, NOTES 2026-11-14).
3. Style with tokens only (`--baht-color-*`, `--baht-radius-*`, `--baht-space-*`), light DOM, no shadow.
4. An **app's own field type** needs no change here: `registry.fieldTypes[type] = { tag, check, display }` (spec 01
   §5.1); `<baht-form>` renders the tag, the engine and the validator run `check`. It works as a repeater column too. A new **built-in field type** is: the
   name in `BuiltInFieldType` (`packages/core/engine/src/types.ts`) and its value in `form-values.ts`; one entry in
   `BUILT_IN_TYPES` (`engine/src/built-in-types.ts`: `tag`, `empty`, `display`, `check`, `maxLength`; its check and
   display functions go in `type-checks.ts` / `type-display.ts`) plus i18n strings; the element; one entry in
   `SHAPES` (`packages/core/validator/src/shape.ts`); and spec 01. The compiler asks for both entries. The tag map,
   the CLI DSL and `BUILT_IN_FIELD_TYPES` read the table. The docs builder still wants its palette item, preview
   and inspector controls.
5. After adding an element or a public property, run `bun run --filter @20baht/ui generate`: `src/register.ts`
   and `src/react.ts` are generated from the manifest (a test fails until you do). Do not edit them by hand.
6. Document every event the element dispatches as `@fires {CustomEvent<Detail>} name - …` on the class (a
   test enforces it; name types exported from `@20baht/ui`). Then `bun run --filter @20baht/angular
   generate`: the Angular adapter's directive for the new element or prop is generated, not written.
6. Add `packages/core/ui/docs/components/<tag>.md` (bundled into bahtui-mcp), then the docs page, sidebar
   entry and catalog specimen in `apps/docs` (see `/docs-site`).
7. `bun run --filter @20baht/ui build`, `bun run test`, `bun run lint`, `bun run knip`, `bun run size`.
   Raise a size budget only with the measured number and a NOTES entry.

## Consuming from an app

```ts
import '@20baht/ui';               // or '@20baht/ui/components/<name>' per tag
import '@20baht/ui/tokens.css';    // fonts are not bundled: load Anuphan, Archivo, IBM Plex Mono
import { dialog, toast } from '@20baht/ui/overlay';
el.form = json;                       // property, never setAttribute
```

React 19 passes props to custom elements as properties; typings in `@20baht/ui/react`. **Angular: use
`@20baht/angular`** (`imports: [BAHT_UI]`): typed inputs, `(bahtChange)="save($event.data)"` outputs that
emit the detail, `[(value)]`, `#f="bahtForm"` → `f.element.validate()`, `bahtSignal(store, ref)` from `/store`,
no `CUSTOM_ELEMENTS_SCHEMA`. Vanilla recipes in `docs/frameworks/`. SSR: `renderToString` from `@20baht/ui/ssr`, then
`@20baht/ui/hydrate` on the client (`docs/ssr.md`). Module Federation hosts: share `@20baht/ui` with
all secondaries as one singleton, or two copies race to define the same tags.

## Release

`/release`. A minor bump of core moves the peer ranges of `@20baht/validator` and `@20baht/angular`
(`>=0.X.0 <0.(X+1).0`) in the same release, with the adapter regenerated; a patch does not.
