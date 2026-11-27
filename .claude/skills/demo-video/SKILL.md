---
name: demo-video
description: Make (or remake) kammacron's "AI factory" demo video from the real app and a real terminal — a bug-hunting cron job files cards, a second cron job fixes them one a minute, shown side by side — in the approved look: the owner's Thai landscapes behind paper windows and captions, the owner's ลายฉลุ buffalo mascot as a jointed หนังตะลุง puppet in the corner like a vtuber, Thai captions and light music. Use when the user asks for a demo, intro or promo video of kammacron, or to update it after a new feature.
---

# kammacron demo video ("AI factory")

The look the owner approved on 2026-11-27 ("ยอดเยี่ยม … ให้คงสไตล์แบบนี้ไว้"):
`docs/screenshots/kammacron-cron-agents-landscape.mp4` (1:49, 1920x1080, kit commit `6479dd3`).
**Keep this style in every remake**: the owner's landscapes as backgrounds, paper windows, tape,
torn caption strip and tags on top, one jointed mascot bottom-left. Remake it with this kit when the
app changes; change the story or the look only when asked.

## The approved look, at a glance

| Piece | How it is |
| --- | --- |
| Background | the owner's landscape for the scene (`paper.BACKGROUNDS`), full frame |
| Windows | real browser / terminal recordings, dark outline, shadow, washi tape on the top corners, a real URL bar |
| Captions | a torn cream paper strip along the bottom, a coloured paper tag over Thai text, centred right of the mascot |
| Top strip (split scenes) | paper tags: which run, 🐞 / 🔧 / ✅ / 👀 counts from the real board |
| Mascot | `docs/design/mascot.png`, one a frame, 420 px, bottom-left, bobbing; arm and jaw move on their pins |
| Cards | factory and end card: paper pieces popping up over a landscape, the mascot in the same corner |
| Sound | the synthesised bright track, a paper pop as pieces stand up, about −20 LUFS |

## The story (hard sell: an AI factory on your machine)

1. **Open on the action**: the Cron jobs page (`/cron`), a Claude cron job "หาบัคในโปรเจกต์"
   (`* * * * *`, haiku, a prompt that says: read the code, file one `auto-pilot` card per bug,
   do not fix, no duplicates; *Use the Kanban board* ticked). First caption states the pitch.
2. **Split screen, the hunt**: board on the left (the navigator folded on screen, so To do → Done
   sit in one row), Runs on the right (live events). Cards appear by themselves.
3. **Second cron job** "แก้บัคทีละใบ": take one auto-pilot card, do it, write the result on it.
4. **Split screen, the conveyor**: each minute a run starts by itself; cards go To do → Doing →
   Done. The first run at about 1.3x, later ones sped up ("โหมดโรงงาน ×N"), waits fast-forwarded.
   A top strip counts 🐞 cards / 🔧 doing / ✅ Done / 👀 review, from the real board.
5. **Terminal**: `git log --oneline` and `git diff --stat` of the shop: the agent's real commits.
6. **Paper conveyor card** (machines "Cron หาบัค" → belt → "Cron แก้บัค" → Done, the mascot
   in its corner) with the real numbers, then the **end card** (`bunx kammacron start`, kammacron.pages.dev).

## What the owner asked for (keep it so)

- **Real everything**: the real web app and a real terminal, real Claude runs. Never fake a
  result; captions say what *this* recording's agent did (a card in Review, a card left to a person).
- **Thai captions** on the torn paper strip *below* the windows — never over the page.
- **Storybook paper pop-up** pieces over the landscapes: textured paper, torn edges, pieces that
  stand up one after another. Bright, flat colours, **no gradients** of our own.
- **Backgrounds**: the owner's landscapes (2026-11-27), `docs/design/video-backgrounds/`
  (`waterfall`, `beach`, `field`, `hills`; blue and orange print style), one a scene by
  `paper.BACKGROUNDS`: the hunt's setup and the terminal on `hills`, the hunt on `waterfall`, the
  fix's setup and the factory card on `field`, the fix and the end card on `beach`. They fill the
  frame (`cover`); the windows, the tape, the torn caption strip and the paper tags stay on top.
  Never redraw or recolour them.
- **The mascot** is the owner's own design, `docs/design/mascot.png` (the buffalo in perforated
  ลายฉลุ paper, gear horns, the clock, a ผ้าขาวม้า, a thumb up; transparent PNG): never redraw
  it. **One mascot a frame**, big (`MASCOT_W` 420 px), in the bottom-left corner like a vtuber,
  running a little off the bottom, on top of everything, bobbing gently (laid on after the speed
  changes, so it keeps one pace through fast-forwards). Captions centre in the width right of it
  (`CAPTION_LEFT`).
- **It moves as a หนังตะลุง puppet does**: `paper.cut_mascot` cuts the one image into pieces on
  pins (`JOINTS`, source pixels): the forearm with its thumb up turns on the elbow's rivet (the
  rivet laid back on top), the lower jaw on the corner of the mouth, opening onto a dark mouth. The
  arm waves and the jaw talks in a 3.2 s loop (`MASCOT_LOOP`), rendered once to a transparent
  `mascot-loop.mov` that compose loops in every scene; the cards animate the same pieces in CSS.
  A cut that leaves a sliver of outline behind when the piece turns needs its polygon widened
  outward (the outside is transparent). - **Not the look** (tried on 2026-11-27 and set aside, do not bring back unasked): plain
  construction-paper backgrounds, a full shadow-puppet theme (commit `e7602dd`), an SVG buffalo
  of our own (`16dc63d`), a mascot in both margins (`071d5d1`). The earlier cuts stay in
  `docs/screenshots/` under their own names.
- The browser windows show an **address bar with the real URL** of that moment; terminal windows
  have a title bar; washi tape on the corners.
- **Light, bright background music** (synthesised in `music.py`, no licence issues) and a soft
  paper "pop" when cards stand up.
- **Under two minutes**. Side-by-side windows when something moves by itself.

## Run it

Needs: `vhs` (`brew install vhs`), `ffmpeg` with libx264 and aac, Python 3 with `playwright`
and `numpy`, `bun`, the Sukhumvit Set font (macOS), and `claude` signed in on this machine.

```sh
bun run --filter web build                                  # the server serves apps/web/dist
.claude/skills/demo-video/kit/setup.sh "$SCRATCH/video"     # a work dir (your scratchpad)
"$SCRATCH/video/make.sh"                                    # records: ~8 min, ~$0.05 of haiku
python3 "$SCRATCH/video/scripts/compose.py"                 # -> out/kammacron-cron-agents.mp4
```

- `make.sh` starts a **separate** kammacron (own data dir, port 7431, `DEMO_PORT` to change)
  and stops it at the end; the owner's own install (port 7420) is never touched. It turns each
  cron job off as soon as its runs are shown, so nothing keeps running or spending.
- Run `make.sh` in the background; it waits for real minutes.
- Then read `clips/stats.json` (cards, fixed, review, human, runs, cost) and the cards' titles.
  The end-of-section captions follow those numbers by themselves (`hunt_result`, `fix_result`
  in `compose.py`); read them against what happened before you trust them.

## Check before handing it over

- A contact sheet (`ffmpeg -vf "fps=1/6,scale=640:-1,tile=3x5"`), and look at it: captions off
  the page, Done column visible, the URL bar right, counts moving, nothing cut off.
- **No personal data on screen.** The Runs window shows the agents' commands as they type them,
  and an agent once wrote the owner's name and email into a `git -c user.name=… commit`. OCR the
  recordings (`tesseract`, two frames a second of `clips/*_right.webm` and `*_left.webm`) for the
  owner's name, email and `user.email`; blur the event list over any hit
  (`boxblur` on `crop=iw:ih-50:0:50` with `enable='between(t,a,b)'`), keep the original as
  `*.orig.webm`, OCR again, then compose. The shop repo has its own identity (`demo`), set by
  `setup.sh`, so its commits never carry the owner's.
- The factory card's "แก้ + commit N" counts the shop's real commits (`stats.json` `commits`),
  not Done plus Review: a card in Review may hold an edit that was never committed.
- `ffmpeg -af ebur128` says about −20 LUFS. You cannot hear it: say so, and that the chords
  were checked (each bar's strongest pitch classes match C–G–Am–F).
- **Saving**: `docs/screenshots/` is the owner's folder (git-ignored). Look before you write:
  never overwrite a file you did not make in this session, and keep earlier cuts (the owner
  wants them kept): save a new cut under a new name (`kammacron-cron-agents-<what>.mp4`).

## Adapting it to a new feature

- A new web scene: a function in `record.py` (use `Scene`: `go`, `click`, `type`, `mark`; it
  records the URL timeline), then an entry in `SINGLE` (one window) or `SPLITS` (two) in
  `compose.py` with its captions `(from, to, tag, text)` on the clip's own timeline.
- A new card: a function in `paper.py` returning `(html, seconds, pop times)` (build it from
  `piece`, `tag`, `buffalo` (the mascot), wrapped in `doc`); capture it with `paper.capture` like
  `factory()`; add it to `main()` in `compose.py`.
- Keep the total under two minutes: speed up typing (`speed` per scene), fast-forward waits.

## Gotchas this kit already handles (do not relearn them)

- Live pages keep an SSE stream open: wait for the `h1`, never `networkidle`.
- The shell scrolls inside `.baht-shell-main` (`scroll="main"`), not the window: scroll that
  element (or `scrollIntoView`), never `window.scrollTo`.
- A cron job is added in a three-step wizard (`web-cron-wizard`, a `<baht-workflow>` in a modal):
  **Add cron job** on `/cron`, then What (the name, Who does it) → Next → The task (prompt; Model
  and Agent only after the **More options** toggle) → Next → When → **Add cron job**. Its Who does it, Agent and Model are
  radio cards (the `input` is hidden: click its `label`); When is the library's `<baht-schedule>` (its value is a cron string): day chips are
  buttons named after the day ("Tuesday"), the time an `input[type=time]`, the cards
  `label.baht-choice:has(input[value="cron"])`, then a `<baht-cron>` of five inputs (a space moves
  to the next box). `<baht-tabs>` buttons are `role=tab` with a `data-key`; `<baht-form>` controls
  have ids `baht-<key>-<n>` (labels end in `*` when required); the card dialog is
  `app-card-dialog` and it scrolls in `.baht-modal-body`; the comments are `li.baht-comment`.
- Every few minutes stops at 5: use the Cron card with `* * * * *`. A cron job's first run comes
  at the next whole minute plus up to one 30 s scheduler tick.
- The board needs its navigator folded (the shell's own button by the brand, "Hide the
  navigator", remembered in `localStorage['kammacron.nav-hidden']`) for To do → Done to fit the
  split window.
- A person's card (`human`) stays in todo: the fix scene stops when no card an agent may take
  is left, not when todo is empty.
- vhs: quote paths; `Wait /regex/` for live states; `Menlo, Sukhumvit Set` draws Thai (Menlo
  alone garbles ำ). Never `git show` in a tape: it prints the author's name and email.
- Thai text in images: render with Chromium (Pillow misplaces Thai marks).
- `clip-path` cuts a `drop-shadow` off: shadow on a wrapper. A pop-up starts at
  `rotateX(-86deg)`, not past 90°.
- Python 3.9 here: no backslashes inside f-string expressions.
- Scripts derive every path from the work dir; `repo.txt` (written by `setup.sh`) points at
  this repo.

## Files

```
kit/setup.sh            work dir: scripts, bin/kammacron, tapes, the shop repo
kit/make.sh             one clean recording (copied into the work dir)
kit/scripts/record.py   the web scenes (Playwright), marks, URL and card-count timelines
kit/scripts/compose.py  the cut: windows on the landscapes, captions, the corner mascot, speeds, cards, music, mux
kit/scripts/paper.py    paper style: cards (factory, end, …), backdrops, tape, captions, bars, and
                        where the mascot (docs/design/mascot.png) stands
kit/scripts/music.py    the synthesised track and the pop
kit/scripts/common.py   work dir, API, sign-in, visible cursor
kit/tapes/              vhs: shell setup (template) and the git scene
kit/shop/               the demo site with five bugs (typo, missing alt, broken link,
                        getElementByID, string total); CLAUDE.md.in becomes its CLAUDE.md
```
