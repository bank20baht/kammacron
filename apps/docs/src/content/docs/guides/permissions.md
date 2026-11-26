---
title: Permissions and safety
description: The allowlist every Claude step gets, and what is always refused.
---

kammacron never runs Claude Code with `--dangerously-skip-permissions`. Every Claude step gets an `--allowedTools` list and a `--disallowedTools` list; anything not allowed is refused, and the refusal is recorded on the run. Command steps of the playbook are yours, and run as written.

## Allowed in every run

- reading and editing files **in the project's directory**, and reading the card's attachments. To reach outside it (a git worktree beside the project, a shared folder), allow the path: `Read(//home/me/shared/**)`, `Edit(//home/me/worktrees/**)`;
- the kammacron MCP tools, and the project's **enabled MCP servers** (from the directory's `.mcp.json`);
- git, so the project's instructions can choose the workflow: `status`, `diff`, `log`, `show`, `add`, `commit`, `fetch`, `pull`, `push`, `rebase`, `merge`, `cherry-pick`, `revert`, `restore`, `checkout`, `switch`, `branch`, `worktree`, `tag`, `rev-parse`, `stash`, `merge-base`, `ls-files`, `blame`, `mv`, `rm`;
- the project's **allowed bash** commands, such as `Bash(bun run test:*)`, and the step's own **more allowed Bash commands**, such as `Bash(ssh app-1:*)`;
- `WebSearch` and `WebFetch`, only with **web tools** on.

## Always refused

What can lose work, whatever the project allows: force pushes (`--force`, `-f`, `--force-with-lease`, a `+` refspec), `git push --delete` and `--mirror`, `--no-verify` on push or commit, `git commit -n`, `git reset --hard`, `git clean`, `git filter-branch`, `git branch -D`, `git config`, `git remote` and `git -c`.

## Commands blocked by the allowlist

Each run lists the commands Claude tried and was refused. Allow only what the project needs: **Open project permissions** goes straight to the list.

## The directory's own `.claude/`

A run does not load the directory's `.claude/settings.json` or `settings.local.json`: a hook or `apiKeyHelper` committed there would run commands, and none of the lists above would apply. Its skills, commands and agents are not loaded either. kammacron hands Claude the instructions itself, from `CLAUDE.md`, `.claude/CLAUDE.md` and `.claude-worker/prompt.md`; `@file` imports inside them are not expanded, and `CLAUDE.md` files in subdirectories are not read. Your own settings in `~/.claude` apply as usual.

## What the lists are not

The git rules match the command's text. They stop mistakes, not someone determined: git has many spellings, and an allowed command such as your test runner runs whatever the repository says. A run has your user's access to the machine. Point kammacron only at repositories you trust that much, or run it as a user of its own, in a container or a virtual machine.

## What kammacron does not do

kammacron does not check where a run pushed, gate its diff, or revert it: that is the playbook's and the project's business. Put the checks you want in the playbook (a test step after Claude, a deploy step only after it), in the repository's own hooks, and in the project's instructions.

`kammacron pause` stops the worker everywhere, at once.
