---
name: bank20baht-cli
description: Work on or with @20baht/cli (packages/tooling/cli): the `20baht` binary that scaffolds a bare bun workspace on the @20baht/strict toolchain (`new`), an Angular + Elysia app (`create`, with `--federation` a Native Federation dynamic host and remote, with `--react` the React + Elysia + Eden DDD monorepo), writes bahtui.json (`init`), and generates model packages and engine-validated form JSON from a field DSL (`g model`, `g form --fields`). Use when scaffolding a project, adding a generator, template or DSL type, or changing what generated repos contain.
---

# @20baht/cli (`packages/tooling/cli`)

Ships the `20baht` binary (`bahtui` up to 0.2.0) (`bunx @20baht/cli …`). Node ≥ 20.12 or bun; `bun` and `git` on `PATH`
for the post-scaffold steps. Version line 0.20.x (shared with the other libraries); depends on `@20baht/validator` of the same minor.

## Commands

| Command | Result |
| --- | --- |
| `20baht new <name>` | bare bun workspace, toolchain only: config extends `@20baht/strict` (tsconfig base, eslint `base`, lint-staged, commitlint, knip), plus prettier, madge, dependency-cruiser, jscpd, gitleaks, renovate, husky, a `.github/workflows/ci.yml`, `scripts/dev.ts` / `each.ts`, `.mcp.json` + `CLAUDE.md` for zvec_grep. `apps/` and `packages/` empty |
| `20baht create <name>` | `new`'s toolchain (template sets `new`, `angular`, then `standalone`) + one Angular app `apps/web` (plain `@angular/build:application`, @20baht/angular app shell, navigator in `core/navigation/navigation.ts`), Elysia `apps/server`, `packages/kit`. `g remote` / `g deploy` refuse it (no `federation.config.mjs` in `apps.web`) |
| `20baht create <name> --react` | full stack: `apps/web` (React 19 + Vite on @20baht/ui: tokens, per-element imports of `<baht-card>`/`<baht-badge>`/`<baht-theme-toggle>`, no-flash theme script), `apps/api` (Elysia exporting `type App`), `libs/shared/eden` (treaty client), `bahtui.json` |
| `20baht create <name> --federation` | `new`'s toolchain (template sets `new`, `angular` (server + kit), then `federation`) + Native Federation dynamic host `apps/shell`, first remote `apps/hello-web` (template set `remote`), Elysia `apps/server` (types via `dist/types`), `packages/kit` (ngx-eden client, `@<name>/kit` tsconfig path), `bahtui.json` `frontend: angular` |
| `20baht g deploy [nginx]` | federation workspace: `templates/deploy` (`__project__` in paths): `deploy/{nginx.conf,<name>.service,env.example,install.sh}`, `scripts/{release,deploy,preview}.ts`; adds the scripts to package.json, `.release` to `.gitignore`/`.prettierignore`/eslint ignores |
| `20baht g remote <name>` | federation workspace: `apps/<name>-web` from `templates/remote` (`__name__` in paths), inserted above the `// bahtui:remotes` line of `eslint.config.ts`, `knip.ts`, `.dependency-cruiser.mjs`, the host's dev environment, and into `public/federation.manifest.json` |
| `20baht update [version] [--dry-run] [--no-install]` | any repo root: every `@20baht/*` dependency in every `package.json` to its latest on npm (never lowered), or to `<version>` where the library has it (up or down), then `bun install`. `src/domain/update-plan.ts` is the pure plan (text edits, formatting kept), `src/application/update.ts` resolves targets through the `PackageRegistry` port (`src/infrastructure/npm-registry.ts`, plain `fetch`), which is why this one command is async |
| `20baht init [--frontend react\|none] [--backend elysia\|none]` | writes `bahtui.json` into an existing repo, enabling the generators |
| `20baht g model <domain>` | `<libsDir>/domain/<domain>/model` package (kebab-case domain) |
| `20baht g form <domain>/<name> --fields "<dsl>"` | a `FormDefinition`, checked with `@20baht/validator`'s `parseSchema`, written to `…/model/src/<name>.form.json` |
| `20baht g types <file.json> … [--check] [--from <module>] [--field-types a,b]` | any repo, no bahtui.json: each form or workflow JSON as a TypeScript module beside it (`x.form.json` → `x.form.ts`) declaring it with `defineForm` / `defineWorkflow` and exporting `…Values` (+ `…Submission` for a form). `src/domain/types-plan.ts` (`typesModule`) is pure; it maps no field type to a TypeScript type, the engine's `FormValues` does. `--check` fails on a missing or stale module; a `.ts` it did not write (no `GENERATED_MARK` first line) needs `--force` |

Flags: `--dry-run`, `--force`, `--check` (g types), `--skip-install`/`--no-install`, `--skip-git`/`--no-git`, `-h`, `-v`.
By default `new`/`create` run `git init`, `bun install` and a first commit, so the hooks prove themselves.

### Field DSL

Comma-separated `key:type[:modifier…]`; key `[a-z][a-z0-9_]*` (label derived: `due_date` → "Due Date").

- Types (18): `text textarea markdown number currency email password dropdown multiselect checkbox radio
  toggle date file rating range reference tags`.
- Modifiers: `required`, `options=a|b|c`, `min=N`, `max=N`, `step=N`, `ref=LOOKUP` (reference lookup
  name), `flag=NAME`.
- Not in the DSL (write JSON by hand, then `parseSchema`): `label`, `section`,
  `repeater`, validators beyond min/max/required, rules and workflows.
- Invalid DSL (unknown type, empty options, non-numeric `min`) fails before anything is written.

## Architecture (hexagonal)

```
src/cli.ts, args.ts                  arg parsing → application
src/domain/        naming, blueprint, form-dsl, create-plan, generate-plan   pure, fully unit-tested
src/application/   create.ts, generate.ts, ports.ts (Reader / Writer / Shell / TemplateSource)
src/infrastructure/ fs-reader, fs-writer, shell-runner, template-source, template-renderer
templates/new/  templates/create/    copied or rendered (.hbs) into the target; `_name` → `.name`
tests/  update, new, create, create-plan, generate, standalone (create), angular (create --federation), e2e (a real scaffold in a tmp dir)
scripts/accept-angular.ts   full proof of create (accept:angular) and create --federation (accept:federation): scaffold, install, the repo's own check (~1 min each)
```

## Working here

- Plan first, write second: every command produces a plan (file list) that `--dry-run` prints; tests
  assert the plan, and the e2e spec runs the real scaffold and `bun run check` inside it.
- `@20baht/validator` must be **built** before `bun run --filter @20baht/cli test` (`bun run build:libs`).
- Adding a template file: put it under `templates/<new|create|angular|standalone|federation|remote>/`, register it in the blueprint, extend the
  plan test. Generated repos must pass their own `bun run check` on the empty tree; for the Angular
  templates run `bun run --filter @20baht/cli accept:angular` and `accept:federation`. Angular `{{ }}` interpolation cannot sit in
  a `.hbs` file (the renderer owns `{{key}}`): bind with `[textContent]` there, or keep the file verbatim.
- A template `eslint.config.ts` must be named `eslint.config.ts.hbs`: ESLint 10 looks configs up from each file's
  folder, so a real `eslint.config.ts` under `templates/` becomes the config for the repo's own lint-staged run
  (and cannot import `@20baht/strict/eslint` from there).
- Toolchain rules for generated repos live in `@20baht/strict` (`packages/tooling/strict`, `docs/CONFIG_LIB_SPEC.md`):
  change a lint rule there, not in a template.
- Changing the DSL: `src/domain/form-dsl.ts` + tests, and the README table. Keep it a strict subset of the
  core field descriptor (spec 01) so generated JSON always passes `parseSchema`. When core adds a field
  type, decide whether it fits a one-token DSL type; if it needs nested config (like `repeater`), leave it out.
