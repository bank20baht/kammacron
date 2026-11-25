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

## Upstream (not `@20baht/*`), noted because the scaffold hides them

### Elysia 1.4.32 on Bun 1.3.14: a coerced path param answers 500 on a real server

- **Seen:** a route with `params: t.Object({ id: t.Numeric() })` (or `t.Integer()` / `t.Number()`) answers
  `500 Attempting to change configurable attribute of unconfigurable property.` when served by
  `Bun.serve` (`app.listen`). The same route through `app.handle()` answers 200, so tests written the way
  the `20baht create` scaffold writes them (only `app.handle`) never see it. Query numerics are fine;
  `new Elysia({ aot: false })` also avoids it.
- **Workaround:** path ids are `t.String({ pattern: '^[1-9][0-9]{0,9}$' })` (`apps/server/src/routes/params.ts`),
  read with `Number(params.id)`; `test/api.test.ts` has a test that goes through a listening server.
- **For the scaffold:** a starter test that calls the app through `app.listen({ port: 0 })` and `fetch`,
  beside the `app.handle` ones.

## @20baht/strict

### ESLint lints git worktrees that sit inside the repo

- **Seen (spike S6):** with a worktree at `<repo>/.worktrees/claude` (listed in `.git/info/exclude`), `eslint .`
  in the main repo lints the worktree's copy as well: 49 of 98 files. Prettier, tsc and knip skip it.
  The flat config ignores what `.gitignore` lists, not `.git/info/exclude`, so a worker's half-done
  worktree can fail the owner's own `bun run check`.
- **Workaround:** kammacron keeps worktrees outside the repo, at `~/.kammacron/worktrees/<slug>`.
- **Fix in the lib:** add `.worktrees/**` (and `.claude/worktrees/**`) to the default ignores of the
  `base` ESLint config.

## @20baht/formats

### No display formats for time, duration or money

- **Seen:** the spec planned `@20baht/formats` for "x minutes ago", run durations and cost. The package (0.1.0)
  validates and formats identifiers (Thai ID, tax ID, phone, E.164, card number, IBAN), not those.
- **Workaround:** `apps/web/src/app/shared/format.ts`, a few lines over `Intl.RelativeTimeFormat` and
  `Intl.NumberFormat`.
- **Fix in the lib:** `relativeTime(date, now?)`, `duration(ms)` and `money(amount, currency)` beside the
  identifier formats, Thai and English, so every 20baht app shows them the same way.

## @20baht/elysia-idempotency

### `idempotent: true` widens the route's 200 to `Response | Body`

- **Seen:** on a route with `idempotent: true` the macro's `beforeHandle` returns the replayed answer as a raw
  `Response`, so Elysia types the route's 200 as `Response | <the handler's body>`. Every typed client (Eden,
  `@20baht/ngx-eden`, `typedLive`) then hands back `Response | Card[]`, and `const [card] = await …` does not
  compile.
- **Workaround:** `answer()` in `packages/kit/src/answer.ts` narrows the type (over HTTP the body is always parsed).
- **Fix in the lib:** type the macro's `beforeHandle` so it does not add to the route's response, e.g. return
  the replay through `status(...)` with the route's own type, or document `response:` on idempotent routes.

### Elysia 1.4.32: an optional `t.UnionEnum` that was not sent gets its first value

- **Seen:** `query: t.Object({ status: t.Optional(t.UnionEnum(['todo', 'done'])) })` hands the handler
  `{ status: 'todo' }` when no `status` was sent. The board's "all cards" list became "todo only", and a
  PATCH body with an optional `UnionEnum` (`mode`) would reset the field. `t.Union` of `t.Literal`s does not.
- **Workaround:** `oneOf()` in `apps/server/src/routes/params.ts`; `test/schema.test.ts` guards both cases.
- **For 20baht:** worth a line in the `@20baht/cli` scaffold's notes (or a lint rule in `@20baht/strict`
  against `t.Optional(t.UnionEnum(...))`), since nothing fails until the data is wrong.

## @20baht/elysia-openapi-mcp

### A description on a union (`anyOf`) is not read

- **Seen:** `status: t.Optional(t.Union([t.Literal('todo'), …], { description: '…' }))` emits
  `{ description, anyOf: [...] }`, yet mcpify warns `no description for status` and the tool's input schema
  carries none. Descriptions on plain types and on nullable unions are read.
- **Workaround:** none; Claude sees the allowed values, only the sentence is lost.
- **Fix in the lib:** read `description` from the union itself, as it already does for `t.Nullable`.
