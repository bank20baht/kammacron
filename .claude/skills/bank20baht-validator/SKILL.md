---
name: bank20baht-validator
description: Work on or with @20baht/validator (packages/core/validator): server-side validation of bahtui form/workflow JSON by re-running the client engine, the parseSchema authoring gate, and async verifyReferences for reference fields. Use when validating submissions on a server, gating schema storage, checking that picked records exist, adding a validator or field-type shape check, or wiring an Elysia/Bun/Node endpoint.
---

# @20baht/validator (`packages/core/validator`)

The schema your builder exported **is** the validator: at request time it runs the exact
`@20baht/ui/engine` code the browser ran. No JSON-Schema translation, no codegen, no drift.
`validateSubmission(workflow, body, …, { form, context })` validates one step of a run kept on a server, the other steps' data in `context` (read by the rules, not validated). Version line 0.20.x (shared with the other libraries); `peerDependencies` pins the matching engine minor (`@20baht/engine`, the package `@20baht/ui/engine` re-exports); no peer on `@20baht/ui`.

## API (`src/index.ts`, single file)

| Export | Use |
| --- | --- |
| `validateSubmission(schema, data, registry?, locale?, options?)` | the one server entry point; dispatches on schema kind |
| `validateFormData(form, …)` / `validateWorkflowData(workflow, …)` | the two halves it dispatches to |
| `verifyReferences(schema, data, registry)` | **async**: do the ids in `reference` fields exist? Call after `validateSubmission` |
| `parseSchema(json)` | structural gate before storing builder output; **throws** readable messages |
| `schemaWarnings(json, registry?)` | keys nothing reads (`fields[0].default`, "Did you mean \"value\"?"): `{ path, message, suggestion? }[]`, **warnings only**, never throws, never a refusal. From `@20baht/engine` |
| `isFormDefinition` / `isWorkflowDefinition` | kind guards |
| re-exports | `applyFlags`, `evaluate`, `validateField`, `defaultValue`, `approvalFields`, `resolveViewFields`, `setLocale` |

Results are `{ valid, issues, data }`; each issue is `{ ref, message }` where `ref` is `key` (form) or
`form_name.key` (workflow), repeater rows `key[i].subKey`. **`data` is canonical** (defaults filled,
hidden fields cleared, `setValue` computed, tags normalised): persist `result.data`, never the raw body.

**Strict by default** (`options.strict`, default `true`): an unregistered `custom` validator or `submit`
script, or a script that throws, is an issue. `{ strict: false }` restores the client's warn-and-skip, for
previews only.

## What it enforces

- Value **shape** per field type before any validator (`{"$gt":""}` is rejected, not "non-empty"):
  `tags` string arrays, `rating` whole numbers `1…max`, `range` within bounds and on the step grid,
  `reference` an id string, `markdown` a string within `max_length` (default 100000).
- Every declarative validator: `required`, min/max length, `min`, `max`, `pattern` (unsafe patterns are
  rejected through the engine's `isUnsafePattern`; never run past `max_length`, and never past 10000 characters), `email`, `compare`,
  `custom` (`registry.validators[name]`).
- Workflow rules first, including row-scoped repeater rules: rule-hidden and flag-off fields are excluded
  and smuggled values cleared. Validate flag-gated schemas as `validateSubmission(applyFlags(schema, flags), data)`.
- Approval steps: `decision` must be `'approved'` or `'rejected'`; comment policy `required` /
  `requireOnReject`.
- `label` and `section` are static: no value, dropped from `data`.
- `parseSchema`: unknown refs, duplicate keys, unsafe patterns, broken transitions, wrong key casing,
  bad `max` for rating, row refs used where they are not allowed (transitions, value expressions,
  `setValue` targets, two repeaters in one rule).
- `parseSchema` does **not** refuse a key it does not know (a stored definition may carry one): that is
  `schemaWarnings`' to say. Show its warnings where the author looks (definitions' `check` / `saveDraft` /
  `publish` return them). The key tables are `packages/core/engine/src/schema-keys.ts`, typed from the
  interfaces: a new descriptor key goes in `types.ts` and the table in the same change (it does not compile
  otherwise). A key apps carry by decision but no type names (a step's `stage`, `cancel`) is
  `UNDECIDED_STEP_KEYS` there.

## Server pattern (Elysia; full listing in `packages/core/validator/README.md`)

```ts
const schemas = new Map([['todo', parseSchema(json)]]);        // at boot or on save: authoring gate
.post('/api/submissions', async ({ body, status }) => {
  const schema = schemas.get(body.id);
  if (!schema) return status(404, { error: 'unknown form' });
  const r = validateSubmission(schema, body.data, registry);
  if (!r.valid) return status(422, { errors: r.issues });
  const missing = await verifyReferences(schema, r.data, registry);   // only if it has reference fields
  if (missing.length) return status(422, { errors: missing });
  return status(201, { data: r.data });
}, { body: t.Object({ id: t.String(), data: t.Any() }) })            // data stays open on purpose
```

The server registry holds the same named `validators`, `formatters`, `scripts` (for `submit`) and
`references` (with `resolve`) the client used. Option fetchers and uploaders are client-only. A lookup the
schema names but the server registry lacks is an issue; a lookup without `resolve` is trusted. Reference
fields inside repeater rows are not resolved yet.

## Working here

- Tests: `tests/*.spec.ts` (vitest, node). Every check needs the trio: a valid payload, an invalid one,
  and one smuggling a value into a rule-hidden field (it must come back cleared).
- Build the engine first (`bun run --filter @20baht/engine build`); `@20baht/cli` tests read this package's dist.
- A field type of the app's own (spec 01 §5.1) is not a change here: `parseSchema(json, registry)` and
  `validateSubmission(…, registry)` read `registry.fieldTypes`.
- A new built-in field type in core does not compile here until `SHAPES` (`src/shape.ts`) has its entry: what a
  direct API call may send for it. A new validator lands here in the same change, with a test that client and
  server agree message for message.
- Core minor bump means moving the peer range in the same release, or `tsc` resolves a stale copy from npm.
