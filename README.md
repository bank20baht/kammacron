# kammacron

A Kanban board, an MCP server and an unattended Claude Code worker in one process on your own
machine. Cards tagged `claude` are picked up on a schedule: one `claude -p` per card in a git
worktree, which fixes the bug, pushes through your repo's pre-push hook, and comments on the card.
You only see the cards that need a decision.

- **Runs without `--dangerously-skip-permissions`.** An exact tool allowlist (no force push, no
  `--no-verify`, no pushing to other branches), the repo's own pre-push as the gate, a check of what
  actually reached the remote after every run, and an optional `verify_command` that reverts a push
  that breaks the branch.
- **Uses your subscription.** `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, and a pre-check
  that calls Claude only when there is a card to work.
- **Cards triaged before Claude works.** `claude` / `human`, `waits_on`, splitting a person's task
  into small Claude cards, and review only for what could not ship.

The design and its reasons: [`docs/spec.md`](docs/spec.md) (Thai). What the `@20baht/*` libraries
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
2. **Project**: Settings → Projects → add one, set its repo path, turn the worker on. The checklist
   says whether the path is a repo with `origin`, a default branch and a pre-push hook.
3. **Cards**: on the board, or from Claude Code itself:

   ```sh
   kammacron token   # prints: claude mcp add --transport http kammacron http://127.0.0.1:7420/mcp --header "Authorization: Bearer …"
   ```

Project rules for the worker live in the repo at `.claude-worker/prompt.md` (the same file the
`~/claude-worker/run.sh` setup used), plus **Extra rules** in the project's settings.

## How a card is worked

Every project is checked on its interval. With a pickable card (tagged `claude`, not `human`, in
`todo`, everything it `waits_on` done) the worker:

1. prepares `~/.kammacron/worktrees/<project>` on `claude/<card>` from `origin/<default>`, copies the
   card's images into it, and runs `setup_command` when a lock file changed;
2. runs `claude -p` with the card, its comments and earlier runs, the rules, and only the
   kammacron MCP tools plus the project's enabled servers;
3. reads what happened: the card's status, which refs moved on the remote. A push anywhere else
   pauses the project; a card left in `doing`, or `done` without its commits on the default branch,
   goes to review;
4. with `verify_command`, runs it on what was pushed (twice) and reverts with an ordinary push when
   it fails;
5. with a **gate** (`max_diff_lines` or `protected_paths`), Claude only pushes `claude/<card>` and
   kammacron pushes it on when the diff passes.

**Shipping**: `push` (Claude pushes to the default branch) or `branch` (you approve each one).
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

It binds `127.0.0.1`. Put a tunnel in front, add its host under Settings → allowed hosts, and the
browser asks for the API token once. Set **Public URL** to the tunnel's `https://` address and
restart: `/mcp` then speaks OAuth, so claude.ai and Claude Desktop can connect (dynamic
registration; the consent page needs your session).

## Data

`~/.kammacron/`: `db/` (PGlite), `secrets.json` (API token, session secret, Claude token; mode 600),
`files/` (images), `logs/` (server and one `.jsonl` per run), `mcp/`, `worktrees/`. Set
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
