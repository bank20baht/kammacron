---
title: Development
description: The repository, its checks, and how the pieces fit.
---

```sh
bun install
bun run dev        # server :7420 and ng serve :4200 (proxied to it)
bun run check      # lint, format, typecheck, madge, deps, knip, dup, build, test (pre-push)
bun run pack       # dist/package: the npm package
bun run compile    # dist/bin: the single-file binary
```

| Folder         | What it is                                                   |
| -------------- | ------------------------------------------------------------ |
| `apps/server`  | Elysia API, MCP, live updates, the worker, scheduler and CLI |
| `apps/web`     | The Angular web app, built with `@20baht/ui`                 |
| `apps/docs`    | This site (Astro and Starlight): `bun run --filter docs dev` |
| `packages/kit` | The typed client the web app uses                            |

The worker tests use a fake `claude` (`apps/server/test/fixtures/fake-claude.ts`) against real git repositories with a local bare remote. `TEST_DATABASE_URL=postgres://…` runs the server suite on Postgres.

## Words on the page

Every word the web app shows comes from a catalog in `apps/web/src/app/core/i18n/`, English first, type-checked key by key. To add a language, write a catalog with the same shape as `en/` (a missing key fails the build) and add it to `CATALOGS` and `ENGINE_LOCALE` in `i18n.service.ts`; it shows up in **Settings → This machine → Language**.
