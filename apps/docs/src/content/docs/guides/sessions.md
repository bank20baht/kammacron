---
title: Sessions on this machine
description: Every Claude Code and Codex session open on the machine, which are spending tokens, which look stuck, and Stop.
sticker: metrics
---

**Sessions** lists every Claude Code and Codex session open on this machine, whoever started it:
a terminal, an IDE, the desktop app, or kammacron itself. It reads again every few seconds while
the page is in view.

Each session says:

- **Working**: a turn is going, so tokens are being spent. **In a command**: it waits on a command
  it ran, and goes on spending once the command ends. **Idle**: it waits for you.
- The tokens of its answers in the **last 5 minutes** and the **last hour**: what it wrote, and
  what it read (its context, cached or not).
- How it pays: **Subscription** (counts against the plan's usage limits), **API key** (billed by
  the token) or **Cloud provider** (Bedrock, Vertex, Foundry), read from the process's environment.
  Codex says what its sign-in is.
- **May be stuck**: working or in a command, and nothing written for 15 minutes.
- **kammacron run #12**: one of kammacron's own runs. Stopping it stops the run, and its card goes
  back to To do.

The usage meters at the top are the same as on **Cron jobs**: Claude's from kammacron's last
Claude run, Codex's from its own files.

## Stop

**Stop** ends a session's process, as Ctrl+C twice would. Nothing is lost: the conversation stays
on disk, and `claude --resume <id>` (or `codex resume <id>`) takes it up again. A Codex thread of
the desktop app has no process of its own; stop it in the app.

**Stop the N working** ends every session that is working or in a command, kammacron's runs
included, after a confirmation that names them. Idle ones are left alone. It is the button for
"the weekly limit is nearly spent: stop everything now". To keep kammacron from starting more,
**Pause** the worker too.

Neither is an MCP tool: an agent can neither list the other sessions nor end one.

## How it knows

Claude Code writes a file per process in `~/.claude/sessions/` (its status: busy, in a command,
idle) and the conversation to `~/.claude/projects/`; Codex writes its conversations to
`~/.codex/sessions/`. kammacron reads those and the process list (`ps`), and changes nothing in
them. `CLAUDE_CONFIG_DIR` and `CODEX_HOME` move where it looks. These files are each tool's own,
not a published format: a new version of either may change them, and the page then shows less
until kammacron reads them again.
