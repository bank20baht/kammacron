---
title: Project settings
description: Every setting of a project, with its default.
---

Under **Settings → Projects → (a project)**, in six sections.

## General

| Setting                          | Default | What it does                                                                       |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Name                             |         | Shown on the board                                                                 |
| Run this project on its schedule | off     | The worker's switch: its rounds take `auto-pilot` cards (cron jobs run without it) |
| Directory                        | empty   | Where runs happen, as it is (git or not). Empty: a board without a worker          |

**Check the directory** says whether it is there, its git branch, and which Claude instructions (`CLAUDE.md`, `.claude/CLAUDE.md`, `.claude-worker/prompt.md`) it found.

## Playbook

The steps a run takes with a card: one Claude step by default. See [playbooks](/guides/playbook/) for the step options.

## Worker and limits

| Setting               | Default       | What it does                                                    |
| --------------------- | ------------- | --------------------------------------------------------------- |
| Mode                  | autopilot     | `autopilot` decides reversible things; `watch` asks when unsure |
| Check every (minutes) | 30            | How often the project's round runs                              |
| Cards per round       | 3             | Cards run one after another in a round                          |
| Max turns per card    | 60            | `--max-turns` of a Claude step that does not set its own        |
| Model                 | Claude Code's | `--model` of a Claude step that does not set its own            |

## Permissions

| Setting                                    | Default | What it does                                                                                                                 |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Allowed Bash commands                      | none    | More `Bash(…)` patterns for the allowlist, such as `Bash(bun run test:*)`                                                    |
| WebSearch and WebFetch                     | off     | Allows `WebSearch` and `WebFetch`                                                                                            |
| MCP servers from the directory's .mcp.json | none    | Servers from the directory's `.mcp.json` a Claude step may use; one whose definition changed waits until you save this again |

## Advanced

| Setting                | Default | What it does                                              |
| ---------------------- | ------- | --------------------------------------------------------- |
| Extra rules for Claude | empty   | Appended to the rules of every Claude step of the project |

**Schedules** lists the project's cron jobs and adds one, as the **Cron jobs** page does: see [cron jobs and the calendar](/guides/schedules/).
