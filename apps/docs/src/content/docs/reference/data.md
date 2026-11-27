---
title: Data on disk
description: What lives in ~/.kammacron.
---

| Path           | What it holds                                                     |
| -------------- | ----------------------------------------------------------------- |
| `db/`          | The PGlite database (unless `DATABASE_URL` points at Postgres)    |
| `secrets.json` | The API token and the session secret; mode 600                    |
| `files/`       | Images attached to cards                                          |
| `logs/`        | The server log, and one `.jsonl` per run (`logs/runs/<id>.jsonl`) |
| `mcp/`         | The MCP config each run is given                                  |
| `runs/`        | A folder per run going (the card file, its images); gone after it |

## How long it is kept

Once a day the housekeeping lets go of what is past its length, set under **Settings → Data** (each can be 7, 14, 30, 90 or 180 days, a year, or **Keep until I remove it**). **Clean now** runs it at once; picking a shorter length shows how much would go before you save.

| Kind                  | Default  | What goes                                                                                           |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Run logs              | 30 days  | Each run's events (its timeline) and its `logs/runs/<id>.jsonl`                                     |
| Step output           | 90 days  | The end of what each step printed                                                                   |
| Runs                  | 1 year   | The runs themselves: status, times, cost, summary (what Stats counts). A running one never goes     |
| Archive done cards    | 14 days  | A card done this long is archived: off the board, still there, can be brought back                  |
| Remove archived cards | 180 days | An archived card, with its comments and attachments; the runs that worked it stay, without the card |
| Read alerts           | 30 days  | Alerts you have read                                                                                |

The days count from when a card reached done (moved back, its clock stops) or was archived, not from its last edit. Images no card refers to go with each housekeeping too.

**Never removed on their own:** projects, cron jobs, playbooks and settings. Only you remove them, from the web app: a cron job's **Remove** (turning it off keeps it), and a project's **Settings → Advanced → Remove project**, which asks you to type its name and takes its cards, runs, cron jobs and log files with it. None of these is an MCP tool: an agent can archive a card, never remove anything.
