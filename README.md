# kammacron

A self-hosted Kanban board with cron jobs you make in a GUI: a small Ansible. Point a project at a
directory, put the work on the board, and schedule what runs: Claude or Codex with your own
prompt, or any command (ping a server, run tests, back up, deploy). Look only when something fails
or waits for a decision.

- **A board agents can work.** Create, edit, move and archive cards, with tags. A card tagged
  `auto-pilot` is open to agents: they reach the board over MCP, take the card, and write the
  result on it.
- **Cron jobs in a GUI.** Every N minutes, hourly, daily, weekdays, weekly, or a cron expression.
  A job runs Claude or Codex with a prompt (tick **Use the Kanban board** to hand it the open
  auto-pilot cards, or say so in the prompt), a shell command, or a playbook.
- **Any command.** A command job is `sh -c` in the project's directory. A failure opens a card and
  notifies you (desktop or webhook).
- **Playbooks.** Steps in order, run for a card; one fails and the rest stop. A step is a command
  or Claude.
- **No agent required, no login kept.** Commands need nothing but a shell. Claude and Codex use the
  `claude` and `codex` you installed and signed in to; kammacron keeps no login of its own.

For example: tag cards `auto-pilot`, then add a cron job **Codex, hourly** with the prompt "Take one
auto-pilot card, do it, and write the result on the card." Each hour Codex takes the best card
through MCP and leaves what it did on it.

## What it does

| Area          | In short                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playbook**  | Per project, the steps of a run: Claude steps and shell commands (`ssh`, tests, deploys), in order; a failing step stops the rest. Edited in the project's settings, with templates.                                                                                                    |
| **Board**     | Four columns (To do, Doing, Review, Done) per project or all together, live. Drag or Alt+arrows to move; one-line quick add. A card has a markdown body with pasted images, an owner (auto pilot or a person), tags, a priority, and cards it waits on.                                 |
| **Worker**    | On each project's interval it picks the next `auto-pilot` card and runs the project's playbook on it, in the project's directory as it is. Modes `autopilot` / `watch`.                                                                                                                 |
| **Review**    | The cards waiting for you: handed over by an agent, or stopped by a failing step, with the reason and the step's output. Approve, or send back with a comment for the next run.                                                                                                         |
| **Runs**      | Every run with its steps, the agent's live event stream (Claude or Codex), turns and cost; stop one that is going.                                                                                                                                                                      |
| **Sessions**  | Every Claude Code and Codex session open on the machine, whoever started it: which are working, the tokens of the last 5 minutes and hour, subscription or API key, which look stuck; stop one, or every one that is working.                                                           |
| **Calendar**  | What runs on its own and when: each project's worker round, its cron jobs and the daily housekeeping ahead; the runs that happened behind. Day, week, month.                                                                                                                            |
| **Stats**     | Week by week: runs done, sent to review, failed, and what they cost.                                                                                                                                                                                                                    |
| **Cron jobs** | Per project, set in the GUI like an alarm clock (a time and the days of the week, every N minutes, every hour, or a custom cron): Claude or Codex with your own prompt, optionally with the board's `auto-pilot` cards; a shell command (when it fails it opens a card); or a playbook. |
| **MCP**       | The board as tools for Claude Code, Claude Desktop and claude.ai (`/mcp`; OAuth behind a public URL): list, create, move and comment on cards, read runs and the calendar. A tool's list of cards has titles, tags and status, 100 at a time; one card in full is asked for by number.  |
| **Alerts**    | In the app, as desktop notifications, or to a webhook: a card needs review, a project paused, a round skipped.                                                                                                                                                                          |
| **Settings**  | The worker (pause, concurrency, stale time, PATH), access (allowed hosts, public URL), MCP, each project's directory, playbook and limits, what is kept and for how long (run logs, runs, done and archived cards, alerts), and the language.                                           |
| **Runs on**   | One process on your machine: a CLI, a background service, PGlite by default or Postgres, light and dark themes, English for now (other languages slot in).                                                                                                                              |

Documentation: **[kammacron.pages.dev](https://kammacron.pages.dev)** (the Starlight site in `apps/docs`: `bun run --filter docs dev`, and `bun run --filter docs deploy` to publish it). The design and its reasons: [`docs/spec.md`](docs/spec.md) (Thai). What the `@20baht/*` libraries
lacked while building it: [`LIB_GAP.md`](LIB_GAP.md).

## Install

Needs [Bun](https://bun.sh) 1.3+, on macOS or Linux. Install whatever your commands use; for Claude steps, [Claude Code](https://claude.com/claude-code), signed in. It idles at about 210 MB of memory; the first start, which creates the database, briefly takes about 1.1 GB.

```sh
bunx kammacron start          # try it: http://127.0.0.1:7420
```

```sh
bun add -g kammacron          # keep it
kammacron install-service     # launchd (macOS) or systemd --user (Linux), with your PATH
kammacron open
```

It installs as an app (a PWA) for the Dock or the taskbar: the install icon in Chrome or Edge's address bar, or Safari's _File → Add to Dock_.

Or one file with nothing to install: `bun run compile` builds `dist/bin/kammacron-<os>-<arch>`.

## First steps

1. **Project**: Settings → Projects → add one and set its directory (any folder, say `~/ops`). Turn
   **Run this project on its schedule** on if you want the worker to take cards on its own; cron
   jobs run without it.
2. **Cron job with a command**: **Cron jobs** in the navigator → **Runs: Command**, set **When**
   like an alarm clock (a time and the days, every N minutes, every hour, or a custom cron) and give
   it a command:

   ```sh
   curl -fsS --max-time 10 https://example.com/health
   ```

   While it passes, nothing happens. When it fails you get one card and one notification, and later
   failures are added to that card.

3. **Cron job with an agent**: run `claude` or `codex` once on this machine and sign in. Then add a
   job with **Runs: Claude** or **Codex**, a prompt, and **Use the Kanban board** ticked: each time
   it takes an `auto-pilot` card and writes the result on it. A card tagged `auto-pilot` is also
   worked by the project's playbook when the worker is on (one Claude step in a new project).
   Cards can come from Claude Code over MCP too:

   ```sh
   kammacron token   # prints: claude mcp add --transport http kammacron http://127.0.0.1:7420/mcp --header "Authorization: Bearer …"
   ```

Project instructions for agents live in the directory: `CLAUDE.md`, and `.claude-worker/prompt.md`
(Codex also reads its own `AGENTS.md`), plus **Extra rules** in the project's settings.

## How a card is worked

Every project is checked on its interval. With a pickable card (tagged `auto-pilot`, not `human`, in
`todo`, everything it `waits_on` done) the worker claims it and runs the project's playbook:

| Step        | What it does                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude**  | `claude -p` with the card, its comments and earlier runs, the rules, and only the kammacron MCP tools plus the project's enabled servers. Goes on when Claude moves the card to done. |
| **Command** | `sh -c` in the directory, with `KAMMACRON_CARD_ID`, `_CARD_TITLE`, `_CARD_FILE` (the card as markdown), `_RUN_ID`, `_PROJECT_DIR`. `ssh` uses this machine's keys. Passes on exit 0.  |

A card tagged `playbook:<name>` runs that playbook instead of `default`, with or without the
`auto-pilot` tag. A failing step stops the rest: the card goes to review with the step's name and output. Claude
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
| `version`                               | the installed version                                           |

## Reaching it from elsewhere

It binds `127.0.0.1`. `kammacron open` signs your browser in; being on the machine is not enough. Put a tunnel in front, add its host under Settings → allowed hosts, and the
browser asks for the API token once. Set **Public URL** to the tunnel's `https://` address and
restart: `/mcp` then speaks OAuth, so claude.ai and Claude Desktop can connect (dynamic
registration; the consent page needs your session).

## Data

`~/.kammacron/`: `db/` (PGlite), `secrets.json` (API token, session secret; mode 600),
`files/` (images), `logs/` (server and one `.jsonl` per run), `mcp/`, `runs/` (a run's card file and images, while it goes). Set
`DATABASE_URL` to use Postgres instead of PGlite.

Once a day it lets go of what Settings → Data says is past its time (by default: run logs after 30
days, step output after 90, runs after a year; a done card is archived after 14 days and removed
180 days later; read alerts after 30) and tidies the database. Projects, cron jobs and playbooks
are removed only by you.

## Development

```sh
bun install
bun run dev        # server :7420 and ng serve :4200 (proxied to it)
bun run check      # lint, format, styles, typecheck, madge, deps, knip, dup, build, test (pre-push)
bun run styles     # after a component imports a new <baht-*> element: rewrites apps/web/src/elements.css
bun run pack       # dist/package: the npm package
bun run compile    # dist/bin: the single-file binary
```

```
apps/server   Elysia API, MCP, live, worker, scheduler, CLI (bun test)
apps/web      Angular + @20baht/ui pages
apps/docs     the documentation site (Astro + Starlight)
packages/kit  the typed client the web app uses
```

A page of the web app imports the `<baht-*>` elements its own template draws, so they arrive with
the page (`apps/web/src/elements.ts` holds only the shell's); lint fails on one that is missing.

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
