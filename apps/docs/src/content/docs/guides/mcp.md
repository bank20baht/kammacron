---
title: Agents and MCP
description: The board as MCP tools for Claude Code, Codex, Claude Desktop and claude.ai.
sticker: key
---

kammacron serves an MCP server at `/mcp`. The worker uses it in every run, and so can you: plan with Claude Code and let it write the cards.

## Claude Code

```sh
kammacron token
```

prints the command to run, with your API token:

```sh
claude mcp add --transport http kammacron http://127.0.0.1:7420/mcp --header "Authorization: Bearer …"
```

## Claude Desktop and claude.ai

They connect over OAuth, which needs an `https://` address: put a tunnel in front, set **Public URL** in Settings and restart. See [reaching it from elsewhere](/guides/remote/). `/mcp` then answers with where to sign in, and the consent page asks for your session.

## Tools

| Tool            | What it does                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `list_projects` | The projects cards belong to                                                                    |
| `list_cards`    | Find cards by project, status, tag or text                                                      |
| `get_card`      | A card with its comments, what it waits on, its last run and its attachments                    |
| `create_cards`  | Create one or more cards; cards of one batch can wait on each other by ref                      |
| `update_card`   | Change a card: title, body, tags, human, priority, waits_on                                     |
| `move_card`     | Move a card to todo, doing, review or done (review needs a reason)                              |
| `add_comment`   | Comment on a card                                                                               |
| `archive_card`  | Archive a card (there is no delete)                                                             |
| `upload_image`  | Upload an image; put the returned Markdown in a card body or a comment                          |
| `get_run`       | A run's summary, error, permission denials and events: why a run failed                         |
| `get_calendar`  | The cron jobs (worker rounds, schedules, housekeeping) with their next run, and runs in a range |

Settings, review decisions and the token are never tools: they stay in the web app and the CLI.

## The worker's own tokens

Each run gets a token of its own for `/mcp`, gone when the run ends. A worker round's run may write to the one card it works on. An agent cron job's run (Claude or Codex with your prompt) has no card of its own: it may write to the cards of its project, and to no other project's. Either way, ending a review stays the person's.
