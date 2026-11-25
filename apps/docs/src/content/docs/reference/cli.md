---
title: CLI
description: Every kammacron command.
---

```
kammacron <command> [options]
```

| Command                                 | What it does                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `start`                                 | Run in the foreground. `--port` (7420), `--host` (127.0.0.1), `--data-dir` (`~/.kammacron`), `--no-worker` |
| `open`                                  | Open the web app in the browser                                                                            |
| `status`                                | Is it running, on which port, paused or not, the run going, how many cards wait for review                 |
| `pause` / `resume`                      | Stop or restart the worker everywhere (the emergency stop)                                                 |
| `token`                                 | The `claude mcp add` command, with the API token                                                           |
| `install-service` / `uninstall-service` | Run it in the background at login: launchd on macOS, `systemd --user` on Linux, with your `PATH`           |
| `update`                                | Install the latest kammacron; run `install-service` again to restart onto it                               |
| `version`                               | The installed version                                                                                      |

```console
$ kammacron start
kammacron <version> on http://127.0.0.1:7420 (data: ~/.kammacron)

$ kammacron status
running: pid 61246, http://127.0.0.1:7420, since 2026-11-25T12:54:52.412Z
worker: on
review: 0 cards
```
