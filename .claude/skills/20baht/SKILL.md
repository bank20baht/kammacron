---
name: 20baht
description: Build or extend an app on the 20baht family (the @20baht npm scope) - an Angular web app and an Elysia server that share types, forms, tables, sign-in and an MCP endpoint. Use when starting an app (20baht create), choosing which @20baht library does a job, wiring sign-in through identity-server, guarding API routes with OAuth scopes, serving a <baht-table> from Postgres, exposing an API to agents over MCP, or moving an app to newer @20baht versions (20baht update).
---

# 20baht: one family, one app shape

Nineteen libraries under `@20baht/*`, made to be used together. An app on them has one shape: an **Angular** web
app (or a Native Federation host and remotes) and an **Elysia** server, sharing the server's types, one form
schema, and one identity server. This skill is the map: which library does which job, and how they meet. Each
library's README is the reference; outside this repo the `bahtui` MCP server serves them (`list_libraries`,
`get_library`, `get_doc`) and runs the form engine.

Check `npm view @20baht/<name> version` before quoting a version: the libraries do not all share one number.

## Take only what you need

Nothing here needs the rest. Most apps stop at the first or second line:

| The app needs | Install | Nothing else required |
| --- | --- | --- |
| **A form**: render it, validate it on the server | `@20baht/ui` (+ `@20baht/angular` in Angular), `@20baht/validator` on the server | no workflow, no approvals, no sign-in, no database of ours |
| A form whose fields react to each other | the same: rules are part of the schema (a one-form workflow) | |
| A wizard one person walks through | the same: `<baht-workflow>` | |
| Approvals that wait for other people | add `@20baht/runs` (Postgres, drizzle) | only then tasks, an inbox, `resolve` and `authorize` |
| One job with no forms at all | that library alone: `formats`, `workdays`, `export`, `table-query`, `identity-client`, `ngx-eden`, the four `elysia-*` | they import no other `@20baht` library |

A form with no approver is the base case, not a cut-down one. Do not add `@20baht/runs`, an `assignment` or
approval steps to an app that only collects and validates data.

## Start: `20baht create`

```sh
bunx @20baht/cli create shop                # apps/web (Angular), apps/server (Elysia), packages/kit
bunx @20baht/cli create shop --federation   # apps/shell (dynamic host) + apps/hello-web (remote) instead of apps/web
cd shop && bun run dev                      # web :4200, server :3001
bun run check                               # lint, format, typecheck, boundaries, knip, dup, build, test
```

What the scaffold already wires, so do not redo it by hand:

- `apps/server` exports `type App`; `packages/kit` turns it into a typed client (`inject(Api).client.api.hello.get()`).
- One form, end to end and nothing more: the server holds the schema (`src/forms/contact.form.ts`), serves it
  at `GET /api/contact/form` and validates a submission at `POST /api/contact` (the form as the route's body,
  `formBody(contactForm)`); the web page renders it with `<baht-form>`. The schema is declared with
  `defineForm`, so the handler's `body`, the Eden client and the page's `$event.data` are typed from it.
  Copy that shape for the next form. There is no approval in it.
- One table beside it, declared from the same form (`contactTable = defineTable(contactForm, …)`): the server answers
  `POST /api/contact/search` with `tableRoute(contactTable)` (in memory, `queryRows`: swap for `tableQueryOf` and SQL
  when there is a database) and the Contact page shows it with `<baht-table [table]>`.
- The web app sees the server **only as types** (`apps/server/dist/types`). Keep the server's imports
  extensionless, and never import server runtime code into a web app.
- `@20baht/ui` elements are registered once (`void import('@20baht/ui')`) and used through `BAHT_UI` from
  `@20baht/angular`.
- The toolchain is `@20baht/strict`: every lint rule is an error, and `bun run check` is the gate.

Layers inside a web app, enforced by dependency-cruiser: pages in `modules/<page>/`, what a page asks the
server in `services/`, `core/` and `shared/` below them. Lower layers never import a page.

With `--federation`: the host reads its remotes from `federation.manifest.json` at runtime;
`20baht g remote <name>` adds one; apps never import each other; every app shares `@20baht/ui` as one copy.

## Which library for which job

| Job | Library | Entry |
| --- | --- | --- |
| Render a form or workflow from JSON, any UI element | `@20baht/ui` | `<baht-form>`, `<baht-workflow>`, `<baht-table>`, 87 `<baht-*>` elements of its own |
| A dashboard or a chart from JSON: filters, datasets, widgets | `@20baht/dashboard` | `<baht-dashboard>` (`/element`), `parseDashboard`, `dashboardData` + `/elysia` `dashboardRoute`; the charts (`<baht-bar-chart>`, `<baht-stat>`, …) |
| Use those elements in Angular with typed inputs and outputs | `@20baht/angular` | `imports: [BAHT_UI]`, `[(value)]`, `*bahtCell` |
| Check a submission on the server with the same rules | `@20baht/validator` | `parseSchema`, `validateSubmission`, `verifyReferences` |
| Run rules or a workflow with no DOM (server, tests, scripts) | `@20baht/engine` | `evaluate`, `walkPath`, `updateWorkflow`, `advanceRun` |
| Keep a workflow run on the server: tasks, inbox, decisions | `@20baht/runs` | `/pg` `runTables()`, `createRuns({ db, tables, resolve, authorize })` |
| Keep form, workflow and dashboard definitions in the database: draft, publish, activate | `@20baht/definitions` | `createDefinitions({ storage })`, `/pg` `pgStorage`, `/elysia` `definitionRoutes` |
| Read or write a form's values from host code | `@20baht/store` | `createBahtStore()`, `store.bind(el)` |
| Thai ID, tax ID, phone, card number, IBAN as a field format | `@20baht/formats` | `formatRegistry({ locale })` |
| Due dates in working days | `@20baht/workdays` | `workCalendar({ weekend, holidays, timeZone })` |
| Export rows as CSV or an Excel workbook (Thai that opens in Excel) | `@20baht/export` | `csv` / `csvStream` / `xlsx(sheets)`, `tableColumns(table)`, `download(body, filename)` |
| Answer `<baht-table>` / `<baht-reference-dialog>` / a dashboard's datasets from Postgres | `@20baht/table-query` | `parseTableQuery`, `tableQuery(sql, shape)`, `aggregateQuery(sql, { from, columns })` |
| Call the Elysia server from Angular with its types | `@20baht/ngx-eden` | `createEden<App>()`, `edenResource()` |
| Sign people in through identity-server; verify its tokens | `@20baht/identity-client` | `/browser` `createIdentityClient`, `/server` `createIdentityVerifier` |
| Guard Elysia routes with OAuth 2.1 tokens and scopes | `@20baht/elysia-resource-server` | `resourceServer({ resource, authorizationServers })` |
| A retried POST must not write twice (`Idempotency-Key`) | `@20baht/elysia-idempotency` | `idempotency({ store, scope })`, route option `idempotent`; `/pg` `pgStore`, `/sqlite` `sqliteStore` |
| Give agents the API as MCP tools | `@20baht/elysia-openapi-mcp` | `mcpify({ auth })` after `openapi()` |
| Be an OAuth 2.1 authorization server yourself | `@20baht/elysia-oauth-provider` | `oauthProvider({ issuer, storage, … })` |
| Animated illustrations for empty states and sign-in pages | `@20baht/stickers` | `<baht-sticker name="…">` |
| Scaffold, generate, update | `@20baht/cli` | `20baht create / g / update` |
| Lint, tsconfig, prettier, boundaries for an app | `@20baht/strict` | `@20baht/strict/eslint`, `/tsconfig`, `/knip`, `/depcruise` |

Two choices people get wrong:

- **`identity-client` or `elysia-resource-server`?** The API of an app that signs in at identity-server, and
  wants identity's own claims (`email`, `roles`, the org): `identity-client/server`. An API that accepts
  tokens from any OAuth 2.1 authorization server, with per-route `scope`: `elysia-resource-server`.
- **`oauth-provider`?** Only when this server issues the tokens. An app that signs in at identity-server
  does not need it.

## How they meet

**A form, end to end.** One `FormDefinition` JSON in a package both sides import. The web app renders it; the
server re-runs the same engine and persists what comes back, never the raw body:

```ts
// web: a component with imports: [BAHT_UI]
// <baht-form [form]="schema" [registry]="registry" (bahtSubmit)="save($event.data)"></baht-form>

// server
import { validateSubmission } from '@20baht/validator'
const result = validateSubmission(schema, body, registry)
if (!result.valid) return status(422, result.issues)
await db.insert(orders).values(result.data) // defaults filled, hidden fields cleared
```

**Typed from the schema.** Declare a schema in TypeScript with `defineForm` / `defineWorkflow` (`@20baht/engine`)
and its data is typed everywhere it goes, with no codegen: `result.data` above once `valid`; an Elysia route's
`body` with `{ body: formBody(schema) }` (`@20baht/validator/elysia`), and so the Eden client; `$event.data` of
`(bahtSubmit)` / `(bahtChange)` in Angular; `createBahtStore<FormValues<typeof schema>>()`; `runsOf(runs, workflow)`.
`FormValues` is the data as held, `ValidValues` after validation (required fields never null), `WorkflowValues` a
workflow's. The same declaration also checks what it names: `defineWorkflow` refuses a rule or transition that points
at no field (`Request.dayz`), `defineRegistry(schemas, registry)` a registry that lacks a function a schema names
(`fn: 'thaiTaxId'`). And it documents itself: `formRoute(schema)` (the body plus its `422 { issues }`, `ref` typed by
the form's fields) puts the form in the OpenAPI document as JSON Schema (`jsonSchemaOf`), so `@20baht/elysia-openapi-mcp`
gives an agent a tool whose arguments are the form's fields.

**A dashboard from JSON.** One `DashboardDefinition` (spec 08): `filters` is a form, `datasets` are aggregate
queries over a `source` the server answers, `widgets` draw them (`stat`, `bar`, `line`, `donut`, `heatmap`,
`meter`, `table`, `text`, and since dashboard 0.2 `funnel`, `waterfall`, `pareto`, `lollipop`, `waffle`, `segmented`,
`treemap`, `radial_bar`, `gauge`, `bullet`, `dumbbell`, `slope`, `radar`, `scatter`, `sankey`). The web app sets `el.dashboard = json` on `<baht-dashboard>` and either hands it the
rows (`el.rows = { expenses }`, aggregated in the browser) or `el.load`, which posts `{ dataset, filters }`. The
server answers with `dashboardData({ dashboard, answer })` (`@20baht/dashboard`): it folds the filters into the
query of the definition **it** holds, never one a browser sent, and `answer` runs it, with
`aggregateQuery(sql, shape).sql(query)` on Postgres or `aggregateRows` in memory. `@20baht/definitions` keeps
dashboards as a third kind; `parseDashboard` is the gate. The charts (`<baht-bar-chart>` and the rest) live in
this package; `@20baht/ui` re-exports them until 0.4.

**A table from the same form.** `defineTable(form, { pick, extra, walk })` (`@20baht/engine`) declares the list of the
records a form fills in: a field's label is the header, its type how the column filters, its options the choices.
`extra` adds what the form lacks (a number, a created date); `walk` lets a reference column be walked into
(`owner.name`). The web app hands `table.columns` to `<baht-table>`; the server writes the query with
`tableQueryOf(sql, table, { key, columns })` (`@20baht/table-query`), which must give SQL for every column;
`TableRow<typeof table>` is a row on both sides. Filtering, sorting and paging are the server's: the element only asks.
The route is `tableRoute(table)` (`@20baht/table-query/elysia`): a refused query answers `400 { message }`, and the
query and the page are in the OpenAPI document, so an agent can search the table over MCP. In Angular,
`<baht-table [table]="table" [items]="rows" (queryChange)="load($event)">` (`BahtTableOfDirective`) binds it in one
go and emits the one query to send: sort, filter, page, the terms of the search row (`column-search`) and `[term]`,
text typed into a `<baht-search>` outside the table. A long list pages by cursor: the server answers
`orders.keyset(body)` pages (`{ rows, next?, prev? }`, route options `tableKeysetRoute(table)`), and `[cursors]="page()"`
turns the footer into Prev / Next with `after` / `before` in the query. With no database yet, `queryRows(rows, query)` answers the same query in
memory. `defineTable(workflow, { pick: ['Request.days', …] })` is a table of a workflow's runs. A schema kept as a JSON **file** gets the same types from `20baht g types <file.json>`: it writes a `.ts` module
beside it that declares it with `defineForm` (`--check` in the project's check keeps the two in step). Only a
schema loaded at run time (a stored definition, the builder's output) has no types and reads as
`Record<string, unknown>`.

A named format is one registry on both sides: `formatRegistry({ locale: 'th' })` from `@20baht/formats`, then
`{ "formatter": "thaiId", "validators": [{ "type": "custom", "fn": "thaiId" }] }` in the schema. Functions never
travel in JSON: the schema names them, a `Registry` supplies them. The `bahtui` skill has the authoring loop
(`parseSchema` → `evaluate` → `walkPath` → `validateSubmission`); follow it for any schema work.

**A workflow with approvals, kept on the server.** Add `runTables()` to the drizzle schema, then
`createRuns({ db, tables, resolve, authorize })`. `start({ definition, requester, data })` validates the first
form and opens the first approval step's tasks; `inbox(caller)` is what waits for someone; `decide(task_id, …)`
records one decision and moves the run only when the step's `rule` is settled; `cancel`, `amend` and
`reassign` are the other changes. An app with request and task tables of its own keeps them as a read model
written in the `recorded` hook, inside the same transaction. `resolve` says who an
`assignment` target is (people, or a position anyone entitled may claim) and `authorize` whether this caller
may decide now. Never work the path out yourself: the package asks the engine. Postgres only for now.

**A table from Postgres.** `<baht-table>` posts a query; the server reads it with `parseTableQuery(body)`
(refuse when `!parsed.ok`), refuses a column that is not in the shape (`unknownColumn`), and writes
`where` / `orderBy` / `page` through drizzle's `sql`. Nothing the client sends becomes SQL text. Put your own
conditions (the tenant, the caller) beside its `where` with `and(...)`.

**Sign-in.** The browser: `createIdentityClient({ issuer, clientId, redirectUri, scopes, resource })`, then
`signIn(returnUrl)`, `handleCallback(location.href)` on the redirect page, and `getAccessToken()` in an
`HttpInterceptorFn` (the kit's `Api` goes through Angular's `HttpClient`, so interceptors apply). The server:
`createIdentityVerifier({ issuer, audience }).verify(bearer)` returns a token or `null`; a JWKS failure throws
`IdentityJwksError`, which is a 503, not a 401. Key users by `token.subject`. In a federation app the sign-in
pages, the guard and the interceptor live in one remote, with the session.

**Scopes on routes.** `resourceServer({ resource, authorizationServers, scopesSupported })`, then
`{ auth: true }` or `{ scope: 'tasks:read' }` on a route, and `caller` in the handler. Your own web client
unrestricted and everything else held to its scopes: `scopeLimited: (caller) => caller.clientId !== WEB_CLIENT_ID`
with `denyUnscoped: true`.

**The API as MCP tools.** `.use(openapi())` then `.use(mcpify({ auth: { resource, authorizationServers } }))`.
Tools come from the OpenAPI document, so a route needs `detail.summary` and a `response` schema to be a good
tool. `/mcp` is guarded by the same resource-server code.

## Rules of the family

- **Libraries ship no data that changes on someone else's schedule.** Holidays, org charts, option lists come
  from the host (a table, a registry), never from a package release.
- **Rich element props are properties, never attributes**: `[form]="schema"` in Angular, `el.form = schema` in
  plain DOM.
- **Wire JSON is snake_case** (`form_id`, `min_rows`); TypeScript props and events are camelCase.
- **Persist `validateSubmission(...).data`**, not the request body: rule-hidden and flag-off fields are cleared
  there.
- **An app that renders date or markdown fields lists `flatpickr`, `marked` and `dompurify` itself** and imports
  `@20baht/ui/css/datepicker.css`; `@20baht/ui` only peer-depends on them.
- **A federation app lists `@20baht/engine` beside `@20baht/ui`**, and every host and remote is on the same
  `@20baht/*` and `@angular/*` versions: shared packages are strict singletons, and a mismatch fails at
  runtime, not at build.
- **Colours come from the `--baht-*` tokens**, not literals (the `bahtui` eslint preset's `no-raw-color` and
  `known-token` check it).
- **An optional enum in a route schema is `t.Optional(t.Union([t.Literal('a'), …]))`**, never
  `t.Optional(t.UnionEnum([...]))`: Elysia 1.4.32 hands the handler the enum's first value when the key was
  not sent (`@20baht/strict`'s `base` reports it as `bahtui/no-optional-union-enum`).

## Moving to newer versions

```sh
20baht update --dry-run   # every @20baht/* dependency to its latest, listed
20baht update             # write it, then bun install
20baht update 0.3.0       # that version instead, for each library that has it (also rolls back)
```

It edits `package.json` files only. Read the libraries' changelogs for what changed, then `bun run check`. A
remote built in another repo needs the same update there.

## Where to read next

| For | Read |
| --- | --- |
| Form and workflow JSON, rules, approval steps | skill `bahtui`; `spec/00`–`07` |
| Elements, tokens, theming, SSR | skill `bank20baht-ui`; `packages/core/ui/docs/` |
| Server validation | skill `bank20baht-validator` |
| Host state | skill `bank20baht-store` |
| The CLI and what a scaffold contains | skill `bank20baht-cli`; `packages/tooling/cli/README.md` |
| Drawing a new sticker | skill `baht-sticker` |
| Any other library | its `README.md` under `packages/<group>/<name>/` |

Through the MCP server: `get_doc('guide/ecosystem')` is this page, `list_libraries` the table above with
current versions, `get_library('table-query')` one library's entry points and README.
