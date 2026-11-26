---
title: Global settings
description: Settings that apply to the whole install.
---

| Section                | Setting                  | Default       | What it does                                                               |
| ---------------------- | ------------------------ | ------------- | -------------------------------------------------------------------------- |
| Worker                 | A run may take (minutes) | 60            | A run is stopped after this long, and a card stuck in Doing goes back      |
| Worker                 | Runs at once             | 1             | Cards running at once across projects, one per project at most             |
| Worker                 | PATH for the worker      | the service's | Where runs find their tools                                                |
| Access & notifications | Allowed hosts            | none          | Hosts other than 127.0.0.1 the app answers                                 |
| Access & notifications | Webhook URL              | none          | Receives a JSON POST for each notification                                 |
| Access & notifications | Desktop notifications    | on            | macOS and Linux                                                            |
| Access & notifications | Public URL (a tunnel)    | none          | The tunnel's `https://` address; turns OAuth on for `/mcp` (read at start) |
| This machine           | Language                 | English       | The web app's language, kept per browser                                   |

Run events are kept for 30 days (`run_log_retention_days`).
