---
title: Environment variables
description: What kammacron reads from its environment.
---

| Variable                  | What it does                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `KAMMACRON_PORT`, `PORT`  | The port (7420)                                                          |
| `KAMMACRON_HOST`          | The address to bind (127.0.0.1)                                          |
| `KAMMACRON_DATA_DIR`      | The data folder (`~/.kammacron`)                                         |
| `DATABASE_URL`            | A Postgres URL; PGlite in the data folder when unset                     |
| `CLAUDE_CODE_OAUTH_TOKEN` | The Claude token, over the one saved in Settings                         |
| `KAMMACRON_PUBLIC_URL`    | The public `https://` address, over the one saved in Settings            |
| `KAMMACRON_CLAUDE_BIN`    | The `claude` executable (`claude`)                                       |
| `KAMMACRON_PASS_ENV`      | More variable names to hand on to runs, comma-separated (`NODE_OPTIONS`) |
| `KAMMACRON_WEB_DIR`       | Serve the web app from this folder                                       |
| `KAMMACRON_MIGRATIONS`    | Where the database migrations are (the binary unpacks them)              |

Runs get a clean environment: `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TMPDIR`, `TERM`, `SSH_AUTH_SOCK`, the worker's `PATH`, the Claude token, and what `KAMMACRON_PASS_ENV` names. No API key is passed on.
