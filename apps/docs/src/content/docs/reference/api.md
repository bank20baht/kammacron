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

The routes marked as tools are also served over MCP: see [Claude Code and MCP](/guides/mcp/).
