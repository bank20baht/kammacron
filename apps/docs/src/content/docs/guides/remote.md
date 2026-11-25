---
title: Reaching it from elsewhere
description: A tunnel, allowed hosts, and a public URL for OAuth.
---

kammacron binds `127.0.0.1`. A browser on the same machine signs in by itself.

To reach it from another device:

1. Put a tunnel in front of port 7420 (Cloudflare Tunnel, Tailscale, ngrok…).
2. Add the tunnel's host under **Settings → Access & notifications → Allowed hosts**. Requests for any other host are refused.
3. Open it: the browser asks for the API token once (`kammacron token` shows it) and keeps a session.

To let **claude.ai** and **Claude Desktop** connect to `/mcp`, set **Public URL** to the tunnel's `https://` address and restart. `/mcp` then speaks OAuth (dynamic client registration; the consent page needs your session), and the API token keeps working for the worker and `claude mcp add`. `KAMMACRON_PUBLIC_URL` sets the same from the environment.
