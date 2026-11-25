---
title: Repo folder or worktree
description: Where Claude works, and why a round is sometimes skipped.
---

Each project chooses where its runs happen, with **Separate worktree** in Project settings → General.

## The repo folder (default)

Claude works in the repository folder itself, on the branch the folder is on.

- The run branches `claude/<card>` from `origin/<that branch>` and ships to that branch, by the project's [ship policy](/guides/shipping/).
- Afterwards the folder goes back to its branch, fast-forwarded to what was pushed. Anything Claude left uncommitted goes to `git stash` (named `kammacron: left by run N`), with an alert; nothing is thrown away.
- `copy_files` is not needed: the files are already there.

A round is **skipped**, with one alert and `skipped: …` as its last check result, while the folder:

- has uncommitted changes (untracked files included);
- is on a detached HEAD;
- is on a branch that is not on `origin` yet;
- has commits not pushed yet (so a push never carries them along).

The card is not touched; the next round tries again.

:::caution
While a run goes, the folder is on `claude/<card>`. Edits you make in it during the run land on Claude's branch. If you keep working in the folder, turn **Separate worktree** on.
:::

## A separate worktree

Claude works in `~/.kammacron/worktrees/<project>` (or the project's `worktree_path`), from `origin/<default branch>`, and never touches your folder. Before each card the worktree is reset to the remote: `checkout -B claude/<card> origin/<default>` and `clean -fd` (ignored files such as `node_modules` stay). `copy_files` (`.mcp.json` and `.claude/settings.local.json` by default) are copied in from your folder.

Projects made before the setting existed keep their worktree.

## On the board

Under the worker line, the board shows the folder's branch, how far it is ahead of or behind origin, and whether it has uncommitted changes. It comes from `GET /api/projects/:id/git`.
