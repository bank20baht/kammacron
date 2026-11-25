# Library gaps

Things the `@20baht/*` libraries lack or get wrong, found while building kammacron. Each entry says
what happened, the workaround in this repo (so it can be removed once the library is fixed), and
what the library could do instead.

## `baht-card` moves its children, and Angular's anchors with them

**What happened.** In the playbook editor, switching between playbooks did nothing and the console
said `NG05106` (insertBefore on a node that is not a child). In the Schedules card, a new schedule
appeared below the form instead of above it. Both were `@if` / `@for` blocks placed directly inside
`<baht-card>`: the card relocates its light-DOM children, so the comment nodes Angular anchors a
block on are no longer where it put them.

**Workaround.** One plain `<div>` directly inside the card, holding everything else
(`playbook-editor.component.ts`, `project-settings.component.html`, with a comment saying why).

**What the library could do.** Project children through a `<slot>` instead of moving them, or say
in the card's docs that framework control flow must sit inside one wrapper element.

The earlier gaps were settled in this repo: the Kanban board is `app-kanban`
(`apps/web/src/app/shared/kanban/`), with keyboard moves, and the dark theme's layers are set with
the library's tokens in `apps/web/src/styles.css`.
