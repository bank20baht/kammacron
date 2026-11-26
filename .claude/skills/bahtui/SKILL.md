---
name: bahtui
description: Author, validate and simulate bahtui (@20baht/*) form/workflow JSON, or build an app on the libraries (@20baht/ui elements, @20baht/validator on the server, @20baht/store for host state, @20baht/stickers for animated art). Use when the user wants to create or edit a form or workflow schema, wire <baht-*> elements into an app, validate submissions server-side, add rules/approval steps/reference lookups, or scaffold an app on these libs.
---

# bahtui: one schema, every layer

One JSON schema drives everything. `@20baht/ui` renders it in the browser (Lit Web Components plus a
DOM-free rules engine), `@20baht/validator` re-runs the same engine on the server for every submission,
and `@20baht/store` binds the state two-way for host code. Author once, validate everywhere.

| Package | Current line | Role |
| --- | --- | --- |
| `@20baht/engine` | 0.3.x | the headless engine on its own: rules, validators, workflow runtime, form session; no DOM |
| `@20baht/ui` | 0.3.x | 95 `<baht-*>` elements, the engine re-exported (`/engine`), tokens, SSR |
| `@20baht/validator` | 0.3.x | `parseSchema` gate, `validateSubmission`, `verifyReferences`; peer `@20baht/engine` |
| `@20baht/store` | 0.3.x | key-value store bound to a form/workflow; React hooks |
| `@20baht/stickers` | 0.1.x | `<baht-sticker>` animated illustrations that follow the `--baht-*` tokens |
| `@20baht/dashboard` | 0.1.x | A dashboard from one JSON definition (spec 08): `<baht-dashboard>`, the charts, `parseDashboard`, `dashboardData` for the server |
| `@20baht/angular` | 0.3.x | Angular adapter: generated typed directives on every `<baht-*>`, `[(value)]`, store signals |
| `@20baht/cli` | 0.3.x | `20baht create / new / init / update / g model / g form` |

Every library except the stickers and the dashboard has the same version number, released together. The rest of the family
(sign-in, OAuth, the typed Angular client, tables, formats, working days) and how an app puts them together
is the `20baht` skill.
Check `npm view <pkg> version` before quoting a version to a user; the lines above drift.

## The authoring loop

1. **Read the reference, don't guess shapes.** `spec/00`–`06` is the behaviour source of truth (schema,
   fields, validators, rules, workflow, approval); `spec/07-naming-map.md` maps spec names to code names.
   Outside this repo, the `bahtui-mcp` server serves the same docs and runs the engine.
2. **Write the schema** (`FormDefinition` or `WorkflowDefinition`). Wire keys are **snake_case**
   (`form_id`, `form_name`, `min_rows`, `options_from`).
3. **Gate the structure:** `parseSchema(json)` from `@20baht/validator` throws readable messages
   (unknown refs, duplicate keys, unsafe patterns, broken transitions, wrong key casing).
4. **Exercise the rules without a browser:** `evaluate(schema, data)` (visible/enabled/readonly/required/
   computed per `Form.key`) and `walkPath(schema, data)` (the forms a submission walks) from
   `@20baht/ui/engine`. Run **both** branches of every rule.
5. **Test submissions:** `validateSubmission(schema, data, registry)` with a valid payload, an invalid one,
   and one smuggling a value into a rule-hidden field (it must come back cleared from `result.data`).

### A worked workflow (runs as written)

```ts
const leave = {
  workflow_id: 'leave',
  forms: [
    { form_id: 'f1', form_name: 'Request', order: 1, fields: [
      { type: 'dropdown', key: 'kind', label: 'Leave type', required: true,
        options: [{ key: 'sick', label: 'Sick' }, { key: 'annual', label: 'Annual' }] },
      { type: 'number', key: 'days', label: 'Days', required: true, min: 1, max: 30 },
      { type: 'file', key: 'note', label: 'Doctor’s note' },
    ] },
    { form_id: 'f2', form_name: 'Manager', order: 2, kind: 'approval', fields: [] },
  ],
  rules: [{
    id: 'sick-note',
    when: { field: 'Request.kind', op: 'eq', value: 'sick' },
    then: [{ action: 'show', target: { form: 'Request', field: 'note' } },
           { action: 'required', target: { form: 'Request', field: 'note' } }],
    else: [{ action: 'hide', target: { form: 'Request', field: 'note' } }],
  }],
};
const schema = parseSchema(leave);
evaluate(schema, { Request: { kind: 'sick' } }).fields['Request.note'];  // visible, required
walkPath(schema, { Request: { kind: 'annual', days: 2 } });               // ['Request', 'Manager']
validateSubmission(schema, {
  Request: { kind: 'annual', days: 2, note: [/* smuggled */] },
  Manager: { decision: 'approved' },                                     // 'approved' | 'rejected'
}).data.Request;                                                          // { kind, days }: note cleared
```

Rule vocabulary: conditions `{ field, op, value | value_field }` combined with `and` / `or` / `not`; ops
`eq ne gt gte lt lte in notIn contains notContains startsWith endsWith isEmpty isNotEmpty`; actions
`show hide enable disable readonly required optional`, `setValue` (with a value expression), and
`showForm hideForm skipForm`. Rules carry `priority` (higher wins, ties go to the later rule) and an
optional `flag`. Row-scoped rules address one repeater row: `Account.accounts[].type` in a condition,
`accounts[].last4` in a target (spec 02 §2a; show/hide/enable/disable/readonly/required only). A rule whose
condition reads a row ref must target row fields only: `parseSchema` rejects it otherwise. Ordering ops
(`gt gte lt lte`) are false when either side is empty.

Field types (22): `text textarea markdown number currency email password dropdown multiselect tags
checkbox radio toggle rating range date time file reference label section repeater`.

## Approval steps on a server

`<baht-workflow>` walks one person through a run. A workflow whose approval steps wait for other people
is kept on the server by **`@20baht/runs`**: it stores the run and each step's tasks, takes decisions,
and moves the run with the same engine (`advanceRun`, `settleStep`), so browser and server agree on the
path. An approval step says who decides it with `assignment` (`assign_to` targets and a `rule`: `any`,
`all` or `{ "quorum": n }`; spec 03 §4.1). The host answers two questions the JSON cannot: `resolve`
(who is this target, here) and `authorize` (may this caller decide, now). Do not walk the path or count
votes yourself. Details: the `20baht` skill and `packages/core/runs/README.md`.

## Hard rules (engine invariants; violating one is always a bug)

- Refs are `formName.fieldKey`. Keys and form names contain no dots and are never `__proto__` /
  `constructor` / `prototype`.
- `eq`/`ne` are strict (`"5"` ≠ `5`); ordering ops coerce.
- Rule-hidden or flag-off fields are cleared from the payload and excluded from validation, on the client
  and on the server. Persist `result.data`, never the raw body.
- Patterns nesting or overlapping unbounded quantifiers (`(a+)+`, `(\w|\d)+`) are rejected, and a pattern
  never runs on input past the field's `max_length` (1024 when unset).
- Repeaters nest one level only; row errors read `key[i].subKey`.
- Functions never travel in JSON: formatters, validators, option fetchers, uploaders, scripts and reference
  lookups are named in JSON and resolved from a `Registry` passed as a property.
- Rich element props are set as **properties**: `el.workflow = json`, never `setAttribute`.

## Building an app on the libs

```bash
bun add @20baht/ui @20baht/validator @20baht/store   # + @20baht/stickers for art
```

- **Client:** `import '@20baht/ui'` (registers every `<baht-*>`) or per-tag
  `@20baht/ui/components/<name>`; `import '@20baht/ui/tokens.css'`. Fonts are not bundled: load
  Anuphan, Archivo (width axis) and IBM Plex Mono yourself. Optional peers, only when used: `date` fields
  need `flatpickr` + `@20baht/ui/css/datepicker.css`; `markdown` fields need `marked` + `dompurify`;
  SSR needs `@lit-labs/ssr`. **Angular:** `@20baht/angular` (`imports: [BAHT_UI]`, typed outputs,
  `[(value)]`). Other recipes: `packages/core/ui/docs/frameworks/{react,angular,vanilla}.md`.
- **Server:** `parseSchema` when a schema is stored or at boot; `validateSubmission` per POST, then
  `await verifyReferences(schema, result.data, registry)` when the schema has `reference` fields. Strict by
  default: an unregistered `custom` validator or `submit` script is an issue.
- **Host state:** `createBahtStore()` + `store.bind(el)`; React hooks from `@20baht/store/react`.
- **Stickers:** `import '@20baht/stickers/all'` then `<baht-sticker name="piggy-bank">`, or one icon from
  `@20baht/stickers/icons/<name>` (see `/baht-sticker`).
- **Scaffolding:** `bunx @20baht/cli create <name>`; a form from the field DSL:
  `20baht g form <domain>/<name> --fields "title:text:required,qty:number:min=1"`.

## Per-library skills

Reach for these when the work sits inside one package:

- `/bank20baht-ui`: elements, engine, tokens and theming, SSR (`packages/core/ui`)
- `/bank20baht-validator`: server validation, `parseSchema`, `verifyReferences` (`packages/core/validator`)
- `/bank20baht-store`: two-way binding and React hooks (`packages/core/store`)
- `/baht-sticker`: drawing stickers and the sticker runtime (`packages/core/stickers`)
- `/bank20baht-cli`: scaffolding and the field DSL (`packages/tooling/cli`)
- `/docs-site`: the Astro/Starlight docs site (`apps/docs`); `/release`: publishing

## In this repo

- `NOTES.md` is the dated decision log: read the entry before revisiting anything settled, and append one
  when you settle something new.
- These skill files are bundled into `bahtui-mcp` as its agent guides (`apps/mcp/scripts/gen-docs.ts`),
  so write them for an agent working in someone else's app, too.
- `bun run test` before claiming a change works; `bun run check` before a release.
