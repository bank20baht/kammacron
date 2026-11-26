---
title: Install
description: What kammacron needs, and three ways to run it.
---

kammacron needs [Bun](https://bun.sh) 1.3 or later on the machine that runs it, and whatever your commands use. For Claude steps, also [Claude Code](https://claude.com/claude-code), signed in as the same user.

## Try it

```sh
bunx kammacron start
```

`kammacron open` signs your browser in. It serves the web app on [http://127.0.0.1:7420](http://127.0.0.1:7420) and keeps its data in `~/.kammacron`. Stop it with Ctrl+C.

## Keep it running

```sh
bun add -g kammacron
kammacron install-service     # launchd on macOS, systemd --user on Linux
kammacron open
```

`install-service` saves your shell's `PATH` with the service, so runs find your tools the way your terminal does. Run it again after `kammacron update` to restart onto the new version.

## One file, nothing to install

From a clone of the repository:

```sh
bun run compile    # dist/bin/kammacron-<os>-<arch>
```

The binary carries the server, the web app and the database migrations.

Next: [first steps](/start/first-steps/).
