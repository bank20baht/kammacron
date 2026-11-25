---
title: Data on disk
description: What lives in ~/.kammacron.
---

| Path           | What it holds                                                     |
| -------------- | ----------------------------------------------------------------- |
| `db/`          | The PGlite database (unless `DATABASE_URL` points at Postgres)    |
| `secrets.json` | The API token, the session secret and the Claude token; mode 600  |
| `files/`       | Images attached to cards                                          |
| `logs/`        | The server log, and one `.jsonl` per run (`logs/runs/<id>.jsonl`) |
| `mcp/`         | The MCP config each run is given                                  |
| `runs/`        | A folder per run going (the card file, its images); gone after it |

Nothing is ever deleted from the board: cards are archived. Housekeeping removes run events past the retention and image files no card refers to.
