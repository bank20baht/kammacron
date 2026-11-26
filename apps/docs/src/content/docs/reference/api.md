---
title: HTTP API
description: The REST API under /api, its OpenAPI document, and authentication.
---

Everything the web app does goes through the HTTP API under `/api`.

- **OpenAPI document:** `/openapi/json`

Every request needs the API token as `Authorization: Bearer <token>` (`kammacron token` shows it) or the web session's cookie. `kammacron open` signs a browser on this machine in with a one-time code; otherwise it asks for the token once.

```sh
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:7420/api/cards?project_id=1
```

Card writes accept an `Idempotency-Key` header, so a retried request does not create a card twice.

A cron job runs exactly one of `command`, `playbook` or `agent` (`claude` or `codex`, with a `prompt`), on a `cron` expression or every `interval_minutes`:

```sh
curl -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"hourly codex","agent":"codex","prompt":"Take one auto-pilot card, do it, and write the result on the card.","use_board":true,"cron":"0 * * * *"}' \
  http://127.0.0.1:7420/api/projects/1/schedules
```

The routes marked as tools are also served over MCP: see [agents and MCP](/guides/mcp/).
