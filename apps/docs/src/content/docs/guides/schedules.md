---
title: Cron jobs and the calendar
description: Claude or Codex with your own prompt, commands and playbooks on a timer, and a calendar of everything that runs on its own.
---

## Cron jobs

A cron job (a schedule) runs in the project's directory as it is, on its own time: the project's worker switch does not have to be on, only a directory set and the project not paused. Add one under **Project settings → Schedules**. Pick what it **runs** and **when** with the tabs, give it a name, and fill in the fields that appear.

### When

| Tab         | Runs                                                     | Saved as       |
| ----------- | -------------------------------------------------------- | -------------- |
| Every N min | every N minutes (5 or more), from when it last ran       | the interval   |
| Hourly      | at a minute past every hour                              | `15 * * * *`   |
| Daily       | at a time of day                                         | `30 9 * * *`   |
| Weekdays    | at a time, Monday to Friday                              | `30 9 * * 1-5` |
| Weekly      | on a day of the week, at a time                          | `0 7 * * 1`    |
| Cron        | the expression you type: `minute hour day month weekday` | as typed       |

The line under the form shows the expression it will save. Times are the server's local time. Cron takes `*`, numbers, ranges (`1-5`), lists (`1,15`), steps (`*/10`) and `@hourly`, `@daily`, `@weekly`, `@monthly`; day-of-week 0 and 7 are both Sunday. An expression that never comes (`0 0 31 2 *`) is refused.

### What it runs

**Claude or Codex, with your prompt.** The agent runs once in the project directory with the prompt you wrote, and the run (its steps, tool calls and summary) is on **Runs** like any other, named after the cron job. Both agents reach the board through kammacron's MCP with a token of their own, which can read and write the cards of this project only. So a prompt can ask for the board in its own words ("look at the open bugs and…").

Tick **Use the Kanban board** and the prompt also comes with the cards tagged `auto-pilot` that are open now (in To do, not a person's, waiting on nothing), and the rules for taking one: move it to doing first, comment the result, then move it to done, or to review with the reason. A card a run moved to doing and left there goes back to To do as a stale card would.

For example, tag cards `auto-pilot`, and add a cron job: **Codex**, **Hourly**, prompt "Take one auto-pilot card, do it, and write the result on the card." Each hour Codex reads the board, takes the best card, and leaves what it did on it.

- **Claude** runs as `claude -p`, with the project's allowed commands, MCP servers and model (or the job's own model), as a Claude step of a playbook does. While Claude is not signed in or is out of usage, its cron jobs wait an hour.
- **Codex** runs as `codex exec --json` in a `workspace-write` sandbox that never stops to ask, with the job's model or Codex's default. Sign in once with `codex` on this machine, as the user kammacron runs as. Set `KAMMACRON_CODEX_BIN` if it is not on the worker's PATH.

**A command**, such as a health check (`curl -fsS --max-time 10 https://example.com/health`), tests or a backup. It passes on exit 0. When it fails, kammacron opens a card titled `<name> fails` with the output in a comment, and notifies you once (desktop or webhook; the output is not sent). While that card is open, later failures add a comment to it instead of opening another. The card is yours; to have agents work it, set the job's **Tags of that card** to `auto-pilot`. An agent reads the output as data, not as its task.

**A playbook** of the project, such as a nightly backup or a weekly deploy. Each time, kammacron opens a card titled with the job's name and the time, tagged `playbook:<name>`, and the worker runs it right after (when the project's worker is on). While the last such card is still open (it failed and waits in Review, say), no new one is opened.

## The calendar

![The calendar's month: worker rounds, schedules and housekeeping ahead (dashed), runs behind (solid)](../../../assets/calendar.png)

**Calendar** shows what runs on its own, and when:

- each project's **worker round**, its **cron jobs**, and the daily **housekeeping**, ahead, as dashed marks (a job that runs more often than every two hours shows as one line a day);
- the **runs** that happened, as solid blocks coloured by how they ended.

Day, week and month views; filter by layer or project. A click opens the run, the board or the project's schedules. Below, a table lists every job with its interval or cron expression, next and last run, last result, and why it is off when it is (`schedule off`, `paused: …`, `all work paused`).

Housekeeping removes run events older than the retention (30 days by default) and files no card uses any more.
