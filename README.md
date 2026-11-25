# kammacron

An Angular app and an Elysia server on the `@20baht` libraries, scaffolded by
[`@20baht/cli`](https://github.com/bank20baht/20baht) (`20baht create`).

```
apps/web          the Angular app (:4200): @20baht/ui app shell, one page calling one API route
apps/server       Elysia API (:3001) under /api; exports `type App` as built declarations
packages/kit      the typed ngx-eden client and error text, compiled into the app as @kammacron/kit
```

## Quickstart

```sh
bun install
bun run dev        # every apps/* dev script in parallel
bun run check      # lint, format, typecheck, madge, boundaries, knip, dup, build, test
```

## The form

`apps/server/src/forms/contact.form.ts` is one form as data. The server serves it
(`GET /api/contact/form`) and validates a submission against it (`POST /api/contact`, the form as
the route's body: `formRoute`, so a refused one answers `422 { issues }` before the handler runs);
`apps/web/src/app/modules/contact` renders it with `<baht-form>`. That
is all a form needs: no workflow, no approval step. Add a field to the schema and both sides have it.
The schema is declared with `defineForm`, so its data is typed from it on both sides (`ContactMessage`):
rename a field and the server's handler and the page stop compiling until they agree. For the next
form, copy the three pieces.

## The table

The same file declares the list of what was received: `contactTable = defineTable(contactForm, …)`.
A field's label is the column's header and its type how the column filters; `received_at` is a
column the form does not have. The server sends the columns (`GET /api/contact/table`) and answers
each query (`POST /api/contact/search`, `tableRoute`); the Contact page shows it with
`<baht-table [table]>` and asks the server again whenever it is sorted, filtered, searched (the box
above it, the row under its headers) or paged. The rows
are kept in memory (`queryRows`), so the starter needs no database: with one, insert the row in
`POST /api/contact` and answer the search with `tableQueryOf(sql, contactTable, { … })`.

## Add a page

A component under `apps/web/src/app/modules/<page>/`, a route in `app.routes.ts`, an entry in
`core/navigation/navigation.ts`. What a page asks the server goes in a service under `services/`,
through the kit's `Api`.

## Things that are this way on purpose

- The web app sees the server only as types, from `apps/server/dist/types` (`build:types` runs
  before every web build and typecheck). Keep the server's imports extensionless: Angular's
  compiler rejects `./x.ts` specifiers in sources it follows.
- `apps/web` lists `marked`, `dompurify` and `flatpickr`: they are optional peers of @20baht/ui,
  which imports them when a markdown or date field renders.
- In dev the app calls the server on `:3001`; in production it calls `/api` on its own origin, so
  serve both behind one web server.
- This is one app. Microfrontends on Native Federation (a host that reads its remotes from a
  manifest at runtime) are another scaffold: `20baht create <name> --federation`.
