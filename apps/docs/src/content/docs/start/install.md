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

## An app in the Dock or taskbar

The web app installs as an app of its own (a PWA), in its own window with its own icon:

- **Chrome or Edge** (macOS, Windows, Linux): the install icon at the right of the address bar, or the menu → _Cast, save and share_ → _Install page as app_.
- **Safari** (macOS 14+): _File_ → _Add to Dock_.

Its right-click menu (Dock or taskbar) jumps to the Board, Cron jobs or Runs. It is still the server on this machine: when kammacron is not running, the window says so and how to start it (`kammacron start`, or `install-service` to keep it running). Browsers install from `127.0.0.1` or `localhost`, or over https; from another machine's address over plain http they do not.

## One file, nothing to install

From a clone of the repository:

```sh
bun run compile    # dist/bin/kammacron-<os>-<arch>
```

The binary carries the server, the web app and the database migrations.

Next: [first steps](/start/first-steps/).
