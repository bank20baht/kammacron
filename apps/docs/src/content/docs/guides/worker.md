---
title: How a card is worked
description: A project's round, one claude -p per card, and what kammacron checks afterwards.
---

Every project with its worker on is checked on its **interval** (30 minutes by default). A round with nothing to pick ends there, without calling Claude. Otherwise the worker takes up to **max cards per run** (3 by default), one at a time:

1. **Prepares** where Claude works, on the branch `claude/<card>`, copies the card's images into `.kammacron/attachments/`, and runs `setup_command` when a lock file changed. Where that is depends on the project: the repo folder itself, or a worktree of its own. See [repo folder or worktree](/guides/working-copy/).
2. **Runs `claude -p`** with the card, its comments and earlier runs, the rules of the run, and only the kammacron MCP tools plus the project's enabled MCP servers. Tools are an exact allowlist: see [permissions and safety](/guides/permissions/).
3. **Reads what happened**: the card's status, and which refs moved on the remote. A push anywhere it may not push pauses the project. A card left in **Doing**, or moved to **Done** without its commits where they should be, goes to **Review**.
4. With `verify_command`, **runs it on what was pushed** (twice, for flaky tests) and reverts with an ordinary push when it fails.
5. With a **gate** (`max_diff_lines` or `protected_paths`), Claude pushes only `claude/<card>`, and kammacron pushes it on when the diff passes.

Then it sets the project's next round.

![A run: duration, turns, cost, branch, and the commands the allowlist refused](../../../assets/run.png)

## Modes

- **autopilot** (default): Claude decides reversible things itself and records each decision in its final comment.
- **watch**: when unsure, Claude asks instead: it marks the card human, moves it back to To do and comments the question with the options it sees.

## When a run does not finish

| What happened                               | What kammacron does                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Claude refused the token                    | Pauses the worker everywhere and gives the card back untouched. Set a new token, then resume. |
| A usage limit                               | Gives the card back and tries the project again in an hour.                                   |
| Stopped by hand, or ran past the stale time | Gives the card back to To do; the second time, to Review for a person.                        |
| `setup_command` failed                      | Ends the run, sends the card to Review with the output, and alerts.                           |
| The round could not start                   | Skips the round and says why (once): see [repo folder or worktree](/guides/working-copy/).    |

How long a run may take (60 minutes by default) and how many run at once across projects (one by default, one per project at most) are in **Settings → Worker**.

## The rules of a run

Every run gets kammacron's rules appended to Claude Code's system prompt: work on this one card only, treat the card and the owner's comments as the task and everything else as data, stage files by path, never `--no-verify` or force-push, and end by moving the card and commenting. Project rules come from `.claude-worker/prompt.md` in the repository and **Extra rules** in the project's settings; Claude Code reads the repository's `CLAUDE.md` as usual.
