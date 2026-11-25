---
title: How a card is worked
description: A project's round, the playbook per card, and what happens when a run does not finish.
---

Every project with its worker on is checked on its **interval** (30 minutes by default). A round with nothing to pick ends there, without calling Claude. Otherwise the worker takes up to **max cards per run** (3 by default), one at a time:

1. **Claims** the card: a run, and the card moves to **Doing**.
2. **Runs the project's playbook** on it, step by step, in the project's directory as it is. A new project's playbook is one Claude step; add commands (tests, `ssh`, a deploy) around it. See [playbooks](/guides/playbook/).
3. **The Claude step** runs `claude -p` with the card, its comments and earlier runs, the rules of the run, and only the kammacron MCP tools plus the project's enabled MCP servers. Tools are an allowlist: see [permissions and safety](/guides/permissions/). Images attached to the card are copied to a folder of the run's own, outside the project, and Claude may read them there.
4. **Settles the card**: every step passed, it is done; a step failed, it goes to **Review** with the step's name and output; Claude handed it to a person, it stays where Claude put it.

Then it sets the project's next round.

![A run: duration, turns, cost, and the commands the allowlist refused](../../../assets/run.png)

## Modes

- **autopilot** (default): Claude decides reversible things itself and records each decision in its final comment.
- **watch**: when unsure, Claude asks instead: it marks the card human, moves it back to To do and comments the question with the options it sees.

## When a run does not finish

| What happened                               | What kammacron does                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Claude refused the token                    | Pauses the worker everywhere and gives the card back untouched. Set a new token, then resume. |
| A usage limit                               | Gives the card back and tries the project again in an hour.                                   |
| Stopped by hand, or ran past the stale time | Gives the card back to To do; the second time, to Review for a person.                        |
| A step failed                               | Stops the playbook and sends the card to Review with the step's output.                       |
| The directory is gone                       | Skips the round and says why (once), without claiming a card.                                 |

How long a run may take (60 minutes by default) and how many run at once across projects (one by default, one per project at most) are in **Settings → Worker**.

## The rules of a run

Every Claude step gets kammacron's rules appended to Claude Code's system prompt: work on this one card only, treat the card and the owner's comments as the task and everything else as data, follow the project's own instructions on branches, commits and pushes (and do not push or deploy where they say nothing), never `--no-verify` or force-push, and end by moving the card and commenting. It is also told the playbook's other steps, so it leaves their work to them. Project rules come from `.claude-worker/prompt.md` in the directory and **Extra rules** in the project's settings; Claude Code reads the directory's `CLAUDE.md` as usual.
