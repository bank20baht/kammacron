---
title: Project settings
description: Every setting of a project, with its default.
---

Under **Settings → Projects → (a project)**, in five sections.

## General

| Setting                   | Default            | What it does                                                                                                             |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Name                      |                    | Shown on the board                                                                                                       |
| Claude works this project | off                | The worker's switch for this project                                                                                     |
| Repo path                 | empty              | The repository. Empty: a board without a worker                                                                          |
| Separate worktree         | off                | Off: Claude works in the repo folder. On: in a worktree of its own. See [repo folder or worktree](/guides/working-copy/) |
| Default branch            | from `origin/HEAD` | Where runs start and ship with a worktree                                                                                |

## Worker and limits

| Setting               | Default       | What it does                                                    |
| --------------------- | ------------- | --------------------------------------------------------------- |
| Mode                  | autopilot     | `autopilot` decides reversible things; `watch` asks when unsure |
| Check every (minutes) | 30            | How often the project's round runs                              |
| Cards per round       | 3             | Cards run one after another in a round                          |
| Max turns per card    | 60            | `--max-turns` of each `claude -p`                               |
| Model                 | Claude Code's | `--model`, such as `sonnet`                                     |

## Shipping and verification

| Setting                     | Default | What it does                                                                                    |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| Shipping                    | push    | `push`: Claude pushes to the branch. `branch`: only to `claude/<card>`, a person merges         |
| Verify after push           | none    | Run on what was pushed (twice); a failure reverts. See [shipping and review](/guides/shipping/) |
| Gate: most lines per change | none    | With protected paths, the gate before the branch                                                |
| Gate: protected paths       | none    | Globs a run may not touch without a person                                                      |
| Setup command               | none    | Run before a run when a lock file changed (`bun install`)                                       |

## Permissions

| Setting                               | Default | What it does                                                              |
| ------------------------------------- | ------- | ------------------------------------------------------------------------- |
| Allowed Bash commands                 | none    | More `Bash(…)` patterns for the allowlist, such as `Bash(bun run test:*)` |
| WebSearch and WebFetch                | off     | Allows `WebSearch` and `WebFetch`                                         |
| MCP servers from the repo's .mcp.json | none    | Servers from the repository's `.mcp.json` the run may use                 |

## Advanced

| Setting                        | Default                                    | What it does                                       |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| Files copied into the worktree | `.mcp.json`, `.claude/settings.local.json` | Copied from the repo folder into the worktree      |
| Extra rules for Claude         | empty                                      | Appended to the rules of every run of this project |

Not in the form, but in the API: `worktree_path` (default `~/.kammacron/worktrees/<slug>`), `lock_files` (the lock files whose change reruns setup), `verify_timeout_minutes` (15).

**Schedules** has its own section: see [schedules and the calendar](/guides/schedules/).
