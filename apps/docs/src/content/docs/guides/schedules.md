---
title: Schedules and the calendar
description: Commands that run on an interval and open cards when they fail, and a calendar of everything that runs on its own.
---

## Schedules

A schedule is a shell command a project runs on an interval: tests, an audit, a link check. Add one under **Project settings → Schedules**: a name, the command (`bun run test`) and how often (once a day by default).

Schedules run inside the project's round, in the project's directory as it is.

When the command fails, kammacron opens a card titled `<name> fails`, tagged `claude`, with the output, so the worker picks it up. While that card is open, later failures add a comment to it instead of opening another.

## The calendar

![The calendar: worker rounds and schedules ahead, runs behind](../../../assets/calendar.png)

**Calendar** shows what runs on its own, and when:

- each project's **worker round**, its **schedules**, and the daily **housekeeping**, ahead, as dashed marks (a job that runs more often than every two hours shows as one line a day);
- the **runs** that happened, as solid blocks coloured by how they ended.

Day, week and month views; filter by layer or project. A click opens the run, the board or the project's schedules. Below, a table lists every job with its interval, next and last run, last result, and why it is off when it is (`worker off`, `paused: …`, `all work paused`).

Housekeeping removes run events older than the retention (30 days by default) and files no card uses any more.
