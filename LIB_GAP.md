# Library gaps

Things the `@20baht/*` libraries lack or get wrong, found while building kammacron. Each entry says
what happened, the workaround in this repo (so it can be removed once the library is fixed), and
what the library could do instead.

## @20baht/cli

### `create` pins `@20baht/engine` behind `@20baht/validator`

- **Seen:** `20baht create` (cli as of 2026-11-25) writes `"@20baht/engine": "0.3.11"` (exact) but
  `"@20baht/validator": "^0.3.11"` (range) in `apps/server/package.json`. The range resolves to
  validator 0.3.32, which imports `schemaWarnings` from engine; 0.3.11 does not export it, so the
  fresh scaffold's own `bun run check` fails: `SyntaxError: export 'schemaWarnings' not found in
'@20baht/engine'`.
- **Workaround:** ran `20baht update` right after `create`, which moved every `@20baht/*` to 0.3.32.
- **Fix in the lib:** pin engine and validator the same way (both exact, or both ranges), or make
  `create` write the latest published versions, and give validator a peer dependency on the engine
  version it needs.

## @20baht/live

### `changed()` needs LISTEN; the docs say otherwise elsewhere

- **Seen:** `changed(tx, topics)` from `@20baht/live/pg` is a `pg_notify` inside the transaction, so
  it only reaches the hub through a `pgSource` that LISTENs. The way to raise topics without LISTEN
  is `memorySource()` + `live.emit()`. Our spec assumed "`changed()` mode, no LISTEN", which mixed
  the two.
- **Workaround:** none needed. PGlite supports LISTEN/NOTIFY and `pgliteListener` works (spike S1:
  triggers, commit heard, rollback not heard, 20 parallel transactions all heard).
- **Fix in the lib:** a short "which source do I pick" table in the README: `memorySource` + `emit`
  (one process, code-only writes) vs `pgSource` + `changed`/triggers (heard on commit, any writer).

### The web app's lint reads server types that `lint` never builds

- **Seen:** `apps/web` and `packages/kit` type their Eden client from `apps/server/dist/types`, which only
  `build:types` writes (as `pretypecheck` / `prebuild` of `web`). `bun run check` and CI's `lint` job run
  `eslint .` first, with the type-aware rules, so on a fresh clone (no `dist/`) or after a server route
  changes, lint fails with `Unsafe call of a type that could not be resolved` on every `api.*` call.
- **Workaround:** root `package.json` has `"prelint": "bun run --filter server build:types"`.
- **Fix in the lib:** have `create` add that `prelint` (or make the CI lint job depend on a types step).
