# kammacron

A Kanban board, an MCP server and an unattended worker in one process on your own machine: a
small Ansible for your backlog. Each project points at a directory and has a **playbook**: steps in
order, such as a Claude step (`claude -p` on the card), then your commands (tests, `ssh` to a
server, a deploy, a migration). Cards tagged `claude` are run through it on a schedule. You only
see the cards that need a decision.

- **Runs without `--dangerously-skip-permissions`.** Claude steps get a tool allowlist (no force
  push, no `--no-verify`, nothing that loses work). Git and shipping follow the project's own
  instructions (`CLAUDE.md`): kammacron points at the directory and does not meddle.
- **Uses your subscription.** `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, and a pre-check
  that calls Claude only when there is a card to work.
- **Cards triaged before Claude works.** `claude` / `human`, `waits_on`, splitting a person's task
  into small Claude cards, and review only for what a person should decide.

## What it does

| Area          | In short                                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playbook**  | Per project, the steps of a run: Claude steps and shell commands (`ssh`, tests, deploys), in order; a failing step stops the rest. Edited in the project's settings, with templates.                                                                |
| **Board**     | Four columns (To do, Doing, Review, Done) per project or all together, live. Drag or Alt+arrows to move; one-line quick add. A card has a markdown body with pasted images, an owner (Claude or a person), tags, a priority, and cards it waits on. |
| **Worker**    | On each project's interval it picks the next card Claude may take and runs the project's playbook on it, in the project's directory as it is. Modes `autopilot` / `watch`.                                                                          |
| **Review**    | The cards waiting for you: handed over by Claude, or stopped by a failing step, with the reason and the step's output. Approve, or send back with a comment for the next run.                                                                       |
| **Runs**      | Every run with its steps, Claude's live event stream, turns and cost; stop one that is going.                                                                                                                                                       |
| **Calendar**  | What runs on its own and when: each project's worker round, its schedules and the daily housekeeping ahead; the runs that happened behind. Day, week, month.                                                                                        |
| **Stats**     | Week by week: runs done, sent to review, failed, and what they cost.                                                                                                                                                                                |
| **Schedules** | Per project, on an interval: a shell command (when it fails it opens a card for Claude, or comments on the open one), or a playbook (a card each time, run in the same round).                                                                      |
| **MCP**       | The board as tools for Claude Code, Claude Desktop and claude.ai (`/mcp`; OAuth behind a public URL): list, create, move and comment on cards, read runs and the calendar.                                                                          |
| **Alerts**    | In the app, as desktop notifications, or to a webhook: a card needs review, a project paused, a round skipped.                                                                                                                                      |
| **Settings**  | The Claude token (with a test run), the worker (pause, concurrency, stale time, PATH), access (allowed hosts, public URL), each project's directory, playbook and limits, and the language.                                                         |
| **Runs on**   | One process on your machine: a CLI, a background service, PGlite by default or Postgres, light and dark themes, English for now (other languages slot in).                                                                                          |

Documentation: **[kammacron.pages.dev](https://kammacron.pages.dev)** (the Starlight site in `apps/docs`: `bun run --filter docs dev`, and `bun run --filter docs deploy` to publish it). The design and its reasons: [`docs/spec.md`](docs/spec.md) (Thai). What the `@20baht/*` libraries
lacked while building it: [`LIB_GAP.md`](LIB_GAP.md).

## Install

Needs [Bun](https://bun.sh) 1.3+, git, and [Claude Code](https://claude.com/claude-code).

```sh
bunx kammacron start          # try it: http://127.0.0.1:7420
```

```sh
bun add -g kammacron          # keep it
kammacron install-service     # launchd (macOS) or systemd --user (Linux), with your PATH
kammacron open
```

Or one file with nothing to install: `bun run compile` builds `dist/bin/kammacron-<os>-<arch>`.

## First steps

1. **Token**: `claude setup-token`, then Settings → Claude → Keep (or set `CLAUDE_CODE_OAUTH_TOKEN`).
   **Test** runs one short `claude -p`.
2. **Project**: Settings → Projects → add one, set its directory, turn the worker on. Its
   **Playbook** is one Claude step; add commands around it as you need.
3. **Cards**: on the board, or from Claude Code itself:

   ```sh
   kammacron token   # prints: claude mcp add --transport http kammacron http://127.0.0.1:7420/mcp --header "Authorization: Bearer …"
   ```

Project rules for Claude live in the directory: `CLAUDE.md`, and `.claude-worker/prompt.md` (the
same file the `~/claude-worker/run.sh` setup used), plus **Extra rules** in the project's settings.

## How a card is worked

Every project is checked on its interval. With a pickable card (tagged `claude`, not `human`, in
`todo`, everything it `waits_on` done) the worker claims it and runs the project's playbook:

| Step        | What it does                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude**  | `claude -p` with the card, its comments and earlier runs, the rules, and only the kammacron MCP tools plus the project's enabled servers. Goes on when Claude moves the card to done. |
| **Command** | `sh -c` in the directory, with `KAMMACRON_CARD_ID`, `_CARD_TITLE`, `_CARD_FILE` (the card as markdown), `_RUN_ID`, `_PROJECT_DIR`. `ssh` uses this machine's keys. Passes on exit 0.  |

A card tagged `playbook:<name>` runs that playbook instead of `default`, with or without the
`claude` tag. A failing step stops the rest: the card goes to review with the step's name and output. Claude
handing the card to a person (review, or a question) ends the run there. All steps passed: done.

kammacron does not branch, reset, check or push the directory: that is the playbook's and the
project's instructions' business. The board shows the directory's git branch, read-only.

**Mode**: `autopilot` (decides reversible things, says so) or `watch` (asks when unsure).

## CLI

| Command                                 | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `start`                                 | foreground (`--port`, `--host`, `--data-dir`, `--no-worker`)    |
| `open` / `status`                       | the web app / is it running, paused, the run going              |
| `pause` / `resume`                      | stop or restart the worker everywhere                           |
| `token`                                 | the `claude mcp add` command                                    |
| `install-service` / `uninstall-service` | background service with the shell's PATH                        |
| `update`                                | the latest version (`install-service` again to restart onto it) |

## Reaching it from elsewhere

It binds `127.0.0.1`. `kammacron open` signs your browser in; being on the machine is not enough. Put a tunnel in front, add its host under Settings → allowed hosts, and the
browser asks for the API token once. Set **Public URL** to the tunnel's `https://` address and
restart: `/mcp` then speaks OAuth, so claude.ai and Claude Desktop can connect (dynamic
registration; the consent page needs your session).

## Data

`~/.kammacron/`: `db/` (PGlite), `secrets.json` (API token, session secret, Claude token; mode 600),
`files/` (images), `logs/` (server and one `.jsonl` per run), `mcp/`, `runs/` (a run's card file and images, while it goes). Set
`DATABASE_URL` to use Postgres instead of PGlite.

## Development

```sh
bun install
bun run dev        # server :7420 and ng serve :4200 (proxied to it)
bun run check      # lint, format, typecheck, madge, deps, knip, dup, build, test (pre-push)
bun run pack       # dist/package: the npm package
bun run compile    # dist/bin: the single-file binary
```

```
apps/server   Elysia API, MCP, live, worker, scheduler, CLI (bun test)
apps/web      Angular + @20baht/ui pages
apps/docs     the documentation site (Astro + Starlight)
packages/kit  the typed client the web app uses
```

The worker tests use a fake `claude` (`apps/server/test/fixtures/fake-claude.ts`) against real git
repos with a local bare remote. `TEST_DATABASE_URL=postgres://…` runs the server suite on Postgres.

### Words on the page (i18n)

Every word the web app shows comes from a catalog in `apps/web/src/app/core/i18n/`: English
(`en/`, one file per page) is the source. A component reads them with `t = inject(I18n).t` and
`t('board.newCard')` / `t('review.count', { count })` in its template; keys are type-checked, plurals
go through `Intl.PluralRules`. Forms and table columns are built from `t`, so they follow the
locale too, as do the dates, durations and money (`@20baht/formats`), and the library's own
validation messages.

To add a language, say Thai: write `th/` with the same shape as `en` (`ShapeOf<typeof en>`, so a
missing key fails the build), add it to `CATALOGS` and `ENGINE_LOCALE` in `i18n.service.ts`, and it
shows up in Settings → Language. What the server writes (alerts, run summaries, error messages) is
not translated.
