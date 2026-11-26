---
title: Permissions and safety
description: The allowlist every Claude step gets, and what is always refused.
---

kammacron never runs Claude Code with `--dangerously-skip-permissions`. Every Claude step gets an `--allowedTools` list and a `--disallowedTools` list; anything not allowed is refused, and the refusal is recorded on the run. Command steps of the playbook are yours, and run as written.

## Allowed in every run

- `Read`, `Edit`, `Write`, `Glob`, `Grep`;
- the kammacron MCP tools, and the project's **enabled MCP servers** (from the directory's `.mcp.json`);
- git, so the project's instructions can choose the workflow: `status`, `diff`, `log`, `show`, `add`, `commit`, `fetch`, `pull`, `push`, `rebase`, `merge`, `cherry-pick`, `revert`, `restore`, `checkout`, `switch`, `branch`, `worktree`, `tag`, `rev-parse`, `stash`, `merge-base`, `ls-files`, `blame`, `mv`, `rm`;
- the project's **allowed bash** commands, such as `Bash(bun run test:*)`, and the step's own **more allowed Bash commands**, such as `Bash(ssh app-1:*)`;
- `WebSearch` and `WebFetch`, only with **web tools** on.

## Always refused

What can lose work, whatever the project allows: force pushes (`--force`, `-f`, `--force-with-lease`, a `+` refspec), `git push --delete` and `--mirror`, `--no-verify` on push or commit, `git commit -n`, `git reset --hard`, `git clean`, `git filter-branch`, `git branch -D`, `git config`, `git remote` and `git -c`.

## Commands blocked by the allowlist

Each run lists the commands Claude tried and was refused. Allow only what the project needs: **Open project permissions** goes straight to the list.

## What kammacron does not do

kammacron does not check where a run pushed, gate its diff, or revert it: that is the playbook's and the project's business. Put the checks you want in the playbook (a test step after Claude, a deploy step only after it), in the repository's own hooks, and in the project's instructions.

`kammacron pause` stops the worker everywhere, at once.
