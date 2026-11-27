---
title: Reaching it from elsewhere
description: A tunnel, allowed hosts, a public URL for OAuth, and the proxy's address header.
sticker: tunnel
---

kammacron binds `127.0.0.1`. Every browser signs in: `kammacron open` on the same machine, the API token anywhere else.

To reach it from another device:

1. Put a tunnel in front of port 7420 (Cloudflare Tunnel, Tailscale, ngrok…).
2. Add the tunnel's host under **Settings → Access & notifications → Allowed hosts**. Requests for any other host are refused.
3. Open it: the browser asks for the API token once (`kammacron token` shows it) and keeps a session.

To let **claude.ai** and **Claude Desktop** connect to `/mcp`, set **Public URL** to the tunnel's `https://` address and restart. `/mcp` then speaks OAuth (dynamic client registration; the consent page needs your session), and the API token keeps working for the worker and `claude mcp add`. `KAMMACRON_PUBLIC_URL` sets the same from the environment.

An OAuth client reaches the MCP tools only, never the rest of the API. **Settings → Rotate token** disconnects every one of them.

A tunnel gives all its callers one address, and so one rate limit on the OAuth endpoints. Name where your tunnel puts the caller's address with `KAMMACRON_TRUSTED_PROXY`: a header (`cf-connecting-ip` for Cloudflare Tunnel), or the number of proxies that append to `X-Forwarded-For`. Set it only behind a proxy that writes that header itself.
