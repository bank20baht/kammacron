---
title: Alerts and notifications
description: What kammacron tells you, and where.
---

kammacron raises an alert, in the app's bell, when something needs a person: a card needs review, a run was reverted, a project paused, a round was skipped, the token was refused, a setup command failed.

The ones worth interrupting you for are also sent:

- as **desktop notifications** (macOS through `osascript`, Linux through `notify-send`), on by default;
- to a **webhook**, when one is set in **Settings → Access & notifications**.

The webhook gets a JSON `POST`:

```json
{
  "text": "*#12 needs review*\nDemo app: Fix login redirect loop",
  "title": "#12 needs review",
  "message": "Demo app: Fix login redirect loop",
  "source": "kammacron"
}
```

`text` reads as a message in Slack and Discord-compatible hooks; the other fields are there for anything else.
