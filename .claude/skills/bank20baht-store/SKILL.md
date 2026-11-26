---
name: bank20baht-store
description: Work on or with @20baht/store (packages/core/store): the tiny key-value state adapter that binds two-way to a <baht-form> or <baht-workflow>, with React hooks in @20baht/store/react and an Angular signals recipe. Use when host code needs to read or write form data outside the element, drive a live JSON panel, prefill or patch values, react to one field, or add a framework adapter.
---

# @20baht/store (`packages/core/store`)

Bind once, then read and write form data from anywhere with plain refs. Framework-free core; React is an
optional peer. Version line 0.20.x (shared with the other libraries). Types only from `@20baht/ui`: binding is duck-typed, so it works with
any core version that keeps the `setValue` / event contract.

## API (`src/index.ts`)

```ts
const store = createBahtStore(initial?);
const unbind = store.bind(el);          // <baht-form> or <baht-workflow>; pulls the element's data now
store.get('Request.days');              // workflow ref: form_name.key
store.get('Request.items[0].qty');      // repeater row
store.get();                            // whole tree
store.set('Request.days', 3);           // UI updates in place: no step reset, no focus loss
store.patch(partial); store.replace(data); store.reset();
const off = store.subscribe((data) => …);
parseRef / getPath / setPath            // the ref grammar the engine speaks
```

- `<baht-form>` data is flat at the root (`store.get('days')`); `<baht-workflow>` is nested
  `{ form_name: { key: value } }`.
- Updates are immutable: untouched subtrees keep identity, so snapshots memoise cheaply.
- React (`@20baht/store/react`): `useBahtStore(store)` (whole tree) and `useBahtValue(store, ref)` →
  `[value, set]`, re-rendering only when that subtree changes.
- Angular: a `signal` the store's `subscribe` writes into (README, "Angular (signals)").

## How binding works

`bind()` listens for `baht-change` on a `<baht-form>` and `baht-data-change` on a `<baht-workflow>`, writes
into the store, and on `set()` / `patch()` calls the element's `setValue` (form: `setValue(patch)`;
workflow: `setValue(form_name, patch)`). `setValue` **merges**: `reset()` / `replace()` that drop keys
send them as explicit `undefined`. Never bypass `setValue` with direct DOM writes.

The store holds what the user typed; it is not canonical. Send it to the server and persist
`validateSubmission(...).data` (rule-hidden fields cleared), not the store snapshot.

## Working here

- Tests: `tests/*.spec.ts` (happy-dom for binding, node for path utils), run against the workspace core
  (`@20baht/ui: workspace:*`). Seams: `get/set/patch/replace/reset/subscribe`, the binding round-trip in
  both directions, repeater row refs, hook re-render granularity.
- A change to an element's `setValue` or change events in core is mirrored here in the same change.
