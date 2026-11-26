# kammacron

An easy scheduler on your own machine, with a board that shows what needs you: a small Ansible.
Point a project at a directory, give it commands to run on an interval (ping a server, run tests,
back up, deploy), and look only when something fails or waits for a decision.

- **Any command.** A schedule is `sh -c` in the project's directory. A failure opens a card and
  notifies you (desktop or webhook).
- **Playbooks.** Steps in order, run for a card; one fails and the rest stop. A step is a command,
  or an AI agent: Claude Code today.
- **No agent required.** Schedules and command playbooks need nothing but a shell. A Claude step
  uses the `claude` you have installed and signed in to; kammacron keeps no login of its own.

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
| **Schedules** | Per project, on an interval: a shell command (when it fails it opens a card and notifies you; tag the card `claude` to have it fixed), or a playbook (a card each time, run in the same round).                                                     |
| **MCP**       | The board as tools for Claude Code, Claude Desktop and claude.ai (`/mcp`; OAuth behind a public URL): list, create, move and comment on cards, read runs and the calendar.                                                                          |
| **Alerts**    | In the app, as desktop notifications, or to a webhook: a card needs review, a project paused, a round skipped.                                                                                                                                      |
| **Settings**  | The worker (pause, concurrency, stale time, PATH), access (allowed hosts, public URL), MCP, each project's directory, playbook and limits, and the language.                                                                                        |
| **Runs on**   | One process on your machine: a CLI, a background service, PGlite by default or Postgres, light and dark themes, English for now (other languages slot in).                                                                                          |

Documentation: **[kammacron.pages.dev](https://kammacron.pages.dev)** (the Starlight site in `apps/docs`: `bun run --filter docs dev`, and `bun run --filter docs deploy` to publish it). The design and its reasons: [`docs/spec.md`](docs/spec.md) (Thai). What the `@20baht/*` libraries
lacked while building it: [`LIB_GAP.md`](LIB_GAP.md).

## Install

Needs [Bun](https://bun.sh) 1.3+. Install whatever your commands use; for Claude steps, [Claude Code](https://claude.com/claude-code), signed in.

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

1. **Project**: Settings → Projects → add one, set its directory (any folder, say `~/ops`), turn
   **Run this project on its schedule** on.
2. **Schedule**: in the project, Schedules → add a command and an interval (5 minutes at least):

   ```sh
   curl -fsS --max-time 10 https://example.com/health
   ```

   While it passes, nothing happens. When it fails you get one card and one notification, and later
   failures are added to that card.

3. **Optional, Claude**: run `claude` once on this machine and sign in. Then a card tagged `claude`
   is worked by the project's playbook (one Claude step in a new project). Cards can also come from
   Claude Code over MCP:

   ```sh
   kammacron token   # prints: claude mcp add --transport http kammacron http://127.0.0.1:7420/mcp --header "Authorization: Bearer …"
   ```

Project instructions for Claude live in the directory: `CLAUDE.md`, and `.claude-worker/prompt.md`,
plus **Extra rules** in the project's settings.

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

`~/.kammacron/`: `db/` (PGlite), `secrets.json` (API token, session secret; mode 600),
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
