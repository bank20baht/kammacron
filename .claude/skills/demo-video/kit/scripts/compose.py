"""
python3 compose.py   (after make.sh recorded the clips)

The "AI factory" cut: a cron job hunts bugs and files them as cards, a second one fixes them one
a minute, both shown side by side (board left, Runs right) with live counts; then the commits,
a paper conveyor of the real numbers, and the end. Storybook paper style, light music.
Writes out/kammacron-cron-agents.mp4.
"""
import json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
import music
import paper
from paper import BLUE, CORAL, GREEN, INK, PINK, PURPLE, TEAL, YELLOW
from playwright.sync_api import sync_playwright

SP = paper.SP
CLIPS = os.path.join(SP, 'clips')
P = paper.OUT
PARTS = os.path.join(SP, 'parts5')
OUT = os.path.join(SP, 'out', 'kammacron-cron-agents.mp4')
M = json.load(open(os.path.join(CLIPS, 'marks.json')))
STATS = json.load(open(os.path.join(CLIPS, 'stats.json')))
STARTS = STATS['starts']  # every run's local start, in order: the hunt first
FADE = 0.3
ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-an']

ONE = dict(x=320, y=38, w=1280, h=800, bar=48)
TWO = [dict(x=100, y=64, w=832, h=778, bar=44), dict(x=988, y=64, w=832, h=778, bar=44)]


def box(win):
    return (win['x'], win['y'], win['w'], win['h'] + win['bar'])


def duration(path):
    return float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).strip())


def end_of(name):
    return duration(os.path.join(CLIPS, name))


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


H, F = M['hunt'], M['fix']
FOUND = STATS['found']
READY = STATS['ready']


def hunt_result():
    """What the hunt left, in words that fit whatever this recording's agent did."""
    text = f'AI เปิดการ์ดบัค {STATS["cards"]} ใบ'
    if STATS['human']:
        text += f': {READY} ใบให้ AI แก้ได้ ส่วนอีก {STATS["human"]} ใบ AI ส่งให้คนตัดสินใจเอง'
    else:
        text += ' ติดแท็ก auto pilot พร้อมให้ AI ตัวต่อไปหยิบไปแก้'
    return text


def fix_result():
    text = f'Done {STATS["fixed"]} ใบ คนละ commit'
    if STATS['review']:
        text += f' · อีก {STATS["review"]} ใบ AI แก้แล้วแต่ส่งเข้า Review ให้คนเช็ค'
    if STATS['human']:
        text += f' · {STATS["human"]} ใบรอคนตัดสินใจ'
    return text + ' · ไม่มีใครกดอะไรเลย'

# the board's navigator folds on screen just before the hunt's marks start: show it
if 'folded' in H:
    H['intro_from'] = 1.0
# the fix job's last run found nothing left to take (only the person's card): end after the one before
while F['runs'] > 1 and f'run{F["runs"]}_end' in F and F[f'run{F["runs"]}_end'] - F[f'run{F["runs"]}_open'] < 8 and READY == F['runs'] - 1:
    F['end'] = F[f'run{F["runs"] - 1}_end'] + 1.5
    F['runs'] -= 1

SINGLE = {
    'hunt_setup': ('hunt_setup.webm', 'web', TEAL, M['hunt_setup']['start'], end_of('hunt_setup.webm'), 1.5, [
        (0, M['hunt_setup']['prompt'], 'โจทย์', 'ให้ AI หาบัคเอง แล้วแก้เอง ทุกนาที · เริ่มจากตั้ง cron job “หาบัค”'),
        (M['hunt_setup']['prompt'], 99, 'Cron job #1',
         'prompt: อ่านโค้ดทั้งโปรเจกต์ หาบัค แล้วสร้างการ์ด auto pilot ใบละเรื่อง · ทุก 1 นาที'),
    ]),
    'fix_setup': ('fix_setup.webm', 'web', YELLOW, M['fix_setup']['start'], end_of('fix_setup.webm'), 1.7, [
        (0, 99, 'Cron job #2', f'การ์ดที่ AI แก้ได้รออยู่ {READY} ใบ · ตั้ง cron job ตัวที่สอง หยิบมาแก้ทีละใบ ทุกนาที'),
    ]),
    'git': ('git.mp4', 'term', PURPLE, 0, end_of('git.mp4'), 1.2, [
        (0, 99, 'Terminal', 'ผลงานจริงในโฟลเดอร์โปรเจกต์: commit ที่ AI ทำ ทีละรอบ'),
    ]),
}


def segments(mk, first_target, later_target):
    """(from, to, speed, kind, n) over a split scene: waits fast-forwarded, runs sped to a target length."""
    segs, at = [], mk['start']
    if 'intro_from' in mk:
        # the click that folds the navigator, at its own pace
        segs.append((mk['intro_from'], mk['start'] + 0.4, 1.0, 'intro', 0))
        at = mk['start'] + 0.4
    for n in range(1, mk['runs'] + 1):
        wait_end = mk[f'run{n}_start'] - 0.6
        if wait_end - at > 0.5:
            segs.append((at, wait_end, max(1.0, (wait_end - at) / 1.5), 'ff', n))
            at = wait_end
        run_end = mk[f'run{n}_end'] + 1.6
        target = first_target if n == 1 else later_target
        segs.append((at, run_end, max(1.0, (run_end - at) / target), 'run', n))
        at = run_end
    segs.append((at, mk['end'] + 0.8, 1.0, 'tail', 0))
    return segs


SPLITS = {
    'hunt': dict(mk=H, color=BLUE, first=16, later=6, start_index=0, job='Cron หาบัค', text={
        'intro': 'หุบ sidebar ด้วยปุ่มบนหัวแอป บอร์ดได้พื้นที่เต็ม เห็น To do ถึง Done ในแถวเดียว',
        'ff': 'รอถึงรอบของ cron · ซ้ายคือบอร์ดที่ยังว่าง ขวาคือหน้า Runs · ไม่มีใครกดอะไร',
        'run': 'AI อ่านโค้ดทั้งโปรเจกต์ แล้วสร้างการ์ดบัคขึ้นบอร์ดเองผ่าน MCP · ดูการ์ดทางซ้ายเกิดขึ้นทีละใบ',
        'tail': hunt_result(),
    }),
    'fix': dict(mk=F, color=GREEN, first=13, later=5.5, start_index=1, job='แก้บัค', text={
        'ff': 'รอรอบถัดไปของ cron (ทุก 1 นาที)',
        'run1': 'รอบที่ 1: AI หยิบการ์ดบัค แก้โค้ด commit แล้วย้ายการ์ดไป Done เอง',
        'run': 'ทุกนาที รอบใหม่เริ่มเอง หยิบการ์ดใบถัดไป · โหมดโรงงาน เร่งให้ดู',
        'tail': fix_result(),
    }),
}


def split_text(key, kind, n):
    t = SPLITS[key]['text']
    if kind == 'run' and n == 1 and 'run1' in t:
        return t['run1']
    if kind == 'ff' and n == 1 and key == 'fix':
        return 'รอถึงรอบแรกของ cron แก้บัค'
    return t[kind]


def split_captions(key, segs):
    caps = []
    for a, b, _, kind, n in segs:
        text = split_text(key, kind, n)
        if caps and caps[-1][2] == text:
            caps[-1] = (caps[-1][0], b, text)
        else:
            caps.append((a, b, text))
    return caps


def tally_at(mk, t):
    cur = mk['tally'][0]
    for row in mk['tally']:
        if row['t'] <= t:
            cur = row
    return cur


def topbars(key, segs):
    """[(from, to, (label, colour, counts))] for the split's top strip, on the scene's timeline."""
    cfg = SPLITS[key]
    mk = cfg['mk']
    cuts = sorted({a for a, *_ in segs} | {r['t'] for r in mk['tally']} | {segs[-1][1]})
    out = []
    for a, b in zip(cuts, cuts[1:]):
        seg = next((s for s in segs if s[0] <= a < s[1]), segs[-1])
        _, _, speed, kind, n = seg
        if kind == 'intro':
            label, color = 'พร้อมแล้ว · รอรอบ cron', PURPLE
        elif kind == 'ff':
            label, color = '⏩ เร่งเวลา · รอรอบถัดไป', INK
        elif kind == 'run':
            idx = cfg['start_index'] + n - 1
            when = STARTS[idx] if idx < len(STARTS) else ''
            label = f'{cfg["job"]}{"" if key == "hunt" else f" รอบที่ {n}"} · เริ่มเอง {when}'
            if speed > 2.2:
                label += f' · ×{speed:.0f}'
            color = CORAL if key == 'hunt' else BLUE
        else:
            label, color = 'เสร็จรอบนี้แล้ว', PURPLE
        c = tally_at(mk, a)
        review = c['found'] - c['todo'] - c['doing'] - c['done']
        state = (label, color, (c['found'], c['doing'], c['done'], review))
        if out and out[-1][2] == state:
            out[-1] = (out[-1][0], b, state)
        else:
            out.append((a, b, state))
    return out


def url_spans(name, start, end):
    urls = M[name]['urls']
    return [(t, urls[k + 1][0] if k + 1 < len(urls) else 9999, u) for k, (t, u) in enumerate(urls)
            if (urls[k + 1][0] if k + 1 < len(urls) else 9999) >= start and t <= end]


def png(name):
    return os.path.join(P, name + '.png')


def graphics(browser):
    items = [('one-tape', paper.tape([box(ONE)]), True, None),
             ('two-tape', paper.tape([box(w) for w in TWO]), True, None),
             ('term-top', paper.terminal_bar(ONE['w'], ONE['bar'], 'shop — bash'), False, (ONE['w'], ONE['bar']))]
    urls = {}
    for key, (clip, kind, color, start, end, speed, caps) in SINGLE.items():
        items.append((f'back-{key}', paper.backdrop(color, [box(ONE)], scene=key), False, None))
        if kind == 'web':
            for _, _, u in url_spans(clip.split('.')[0], start, end):
                urls.setdefault(('one', u), f'u1-{len(urls)}')
        for j, (_, _, tag, text) in enumerate(caps):
            items.append((f'cap-{key}-{j}', paper.caption(tag, text, color), True, None))
    bars = {}
    for key, cfg in SPLITS.items():
        items.append((f'back-{key}', paper.backdrop(cfg['color'], [box(w) for w in TWO], [
            (TWO[0]['x'] + 120, 12, 'บอร์ด · สด', YELLOW, False),
            (TWO[1]['x'] + TWO[1]['w'] - 120, 12, 'Runs · สด', PINK, True)], scene=key), False, None))
        segs = segments(cfg['mk'], cfg['first'], cfg['later'])
        for side in ('left', 'right'):
            for _, _, u in url_spans(f'{key}_{side}', cfg['mk']['start'], cfg['mk']['end']):
                urls.setdefault(('two', u), f'u2-{len(urls)}')
        for j, (_, _, text) in enumerate(split_captions(key, segs)):
            items.append((f'cap-{key}-{j}', paper.caption('โรงงาน AI ทำงาน', text, CORAL), True, None))
        for _, _, state in topbars(key, segs):
            if state not in bars:
                bars[state] = f'top-{len(bars)}'
                label, color, (found, doing, done, review) = state
                items.append((bars[state], paper.topbar(label, color, {'found': found, 'doing': doing, 'done': done, 'review': review}), True, None))
    for (kind, u), name in urls.items():
        win = ONE if kind == 'one' else TWO[0]
        items.append((name, paper.browser_bar(u, win['w'], win['bar']), False, (win['w'], win['bar'])))
    paper.render_static(items, browser)
    paper.mascot_loop(browser)
    return urls, bars


def overlay_chain(chain, inputs, base, layers, first):
    cur = base
    for k, (path, x, y, t0, t1) in enumerate(layers):
        inputs += ['-i', path]
        chain.append(f"[{cur}][{first + k}:v]overlay={x}:{y}:enable='between(t,{t0:.2f},{t1:.2f})'[o{k}]")
        cur = f'o{k}'
    return cur


def mascot(chain, inputs, base, index, out_label):
    """The corner mascot over a part, on top of everything: its puppet loop (arm, jaw), bobbing gently."""
    inputs += ['-stream_loop', '-1', '-i', os.path.join(P, 'mascot-loop.mov')]
    x, y = paper.MASCOT_X - paper.MASCOT_PAD, paper.MASCOT_Y - paper.MASCOT_PAD
    chain.append(f"[{base}][{index}:v]overlay=x={x}:y='{y}+7*sin(2*PI*t/1.9)':eval=frame:shortest=1[{out_label}]")


def single(key, urls, out):
    clip, kind, color, start, end, speed, caps = SINGLE[key]
    length = (end - start) / speed
    at = lambda t: max(0.0, (t - start) / speed)
    inputs = ['-loop', '1', '-t', f'{length:.3f}', '-i', png(f'back-{key}'),
              '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', os.path.join(CLIPS, clip)]
    chain = ['[0:v]fps=30,format=yuv420p[bg]',
             f"[1:v]setpts=(PTS-STARTPTS)/{speed},fps=30,scale={ONE['w']}:{ONE['h']}:flags=lanczos[rec]",
             f"[bg][rec]overlay={ONE['x']}:{ONE['y'] + ONE['bar']}:shortest=1[v0]"]
    layers = []
    if kind == 'term':
        layers.append((png('term-top'), ONE['x'], ONE['y'], 0, length))
    else:
        for a, b, u in url_spans(clip.split('.')[0], start, end):
            layers.append((png(urls[('one', u)]), ONE['x'], ONE['y'], at(a), min(length, at(b))))
    layers.append((png('one-tape'), 0, 0, 0, length))
    for j, (a, b, _, _) in enumerate(caps):
        layers.append((png(f'cap-{key}-{j}'), 0, 0, at(max(a, start)), min(length, at(b))))
    last = overlay_chain(chain, inputs, 'v0', layers, 2)
    mascot(chain, inputs, last, 2 + len(layers), 'm')
    chain.append(f'[m]fade=in:st=0:d={FADE},fade=out:st={length - FADE:.2f}:d={FADE}[out]')
    ffmpeg(*inputs, '-filter_complex', ';'.join(chain), '-map', '[out]', *ENCODE, out)
    return length


def split(key, urls, bars, out):
    cfg = SPLITS[key]
    mk = cfg['mk']
    segs = segments(mk, cfg['first'], cfg['later'])
    s0, s1 = segs[0][0], segs[-1][1]
    length = s1 - s0
    rel = lambda t: max(0.0, t - s0)
    inputs = ['-loop', '1', '-t', f'{length:.3f}', '-i', png(f'back-{key}')]
    for side in ('left', 'right'):
        inputs += ['-ss', f'{s0:.3f}', '-to', f'{s1:.3f}', '-i', os.path.join(CLIPS, f'{key}_{side}.webm')]
    chain = ['[0:v]fps=30,format=yuv420p[bg]']
    for k, (label, win) in enumerate(zip('lr', TWO)):
        chain.append(f"[{k + 1}:v]setpts=PTS-STARTPTS,fps=30,scale={win['w']}:{win['h']}:flags=lanczos[{label}]")
    chain += [f"[bg][l]overlay={TWO[0]['x']}:{TWO[0]['y'] + TWO[0]['bar']}:shortest=1[a]",
              f"[a][r]overlay={TWO[1]['x']}:{TWO[1]['y'] + TWO[1]['bar']}[v0]"]
    layers = []
    for side, win in zip(('left', 'right'), TWO):
        for a, b, u in url_spans(f'{key}_{side}', s0, s1):
            layers.append((png(urls[('two', u)]), win['x'], win['y'], rel(a), min(length, rel(b))))
    layers.append((png('two-tape'), 0, 0, 0, length))
    for a, b, state in topbars(key, segs):
        layers.append((png(bars[state]), 0, 0, rel(a), min(length, rel(b))))
    for j, (a, b, _) in enumerate(split_captions(key, segs)):
        layers.append((png(f'cap-{key}-{j}'), 0, 0, rel(a), min(length, rel(b))))
    last = overlay_chain(chain, inputs, 'v0', layers, 3)
    chain.append(f'[{last}]split={len(segs)}' + ''.join(f'[p{k}]' for k in range(len(segs))))
    total = 0.0
    for k, (a, b, speed, _, _) in enumerate(segs):
        chain.append(f'[p{k}]trim=start={rel(a):.3f}:end={rel(b):.3f},setpts=(PTS-STARTPTS)/{speed:.4f},fps=30[q{k}]')
        total += (rel(b) - rel(a)) / speed
    chain.append(''.join(f'[q{k}]' for k in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0[cc]')
    # after the speed changes, so it bobs at one pace through the fast-forwards
    mascot(chain, inputs, 'cc', 3 + len(layers), 'm')
    chain.append(f'[m]fade=in:st=0:d={FADE},fade=out:st={total - FADE:.2f}:d={FADE}[out]')
    ffmpeg(*inputs, '-filter_complex', ';'.join(chain), '-map', '[out]', *ENCODE, out)
    # where each run starts in this part's output, for a little sound
    starts, t_out = [], 0.0
    for a, b, speed, kind, n in segs:
        if kind == 'run':
            starts.append(t_out)
        t_out += (b - a) / speed
    return total, starts


def main():
    os.makedirs(PARTS, exist_ok=True)
    os.makedirs(P, exist_ok=True)
    cards = {'factory': paper.factory(STATS), 'end': paper.end_card()}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        urls, bars = graphics(b)
        for name, (h, secs, _) in cards.items():
            paper.capture(name, h, secs, b)
        b.close()
    p = lambda n: os.path.join(PARTS, n)
    total, pops, parts = 0.0, [], []

    def add(name, secs, extra_pops=()):
        nonlocal total
        pops.extend(total + t for t in extra_pops)
        total += secs
        parts.append(p(name))
        print(f'{name}: {secs:.1f} s')

    add('01-hunt_setup.mp4', single('hunt_setup', urls, p('01-hunt_setup.mp4')))
    secs, starts = split('hunt', urls, bars, p('02-hunt.mp4')); add('02-hunt.mp4', secs, starts)
    add('03-fix_setup.mp4', single('fix_setup', urls, p('03-fix_setup.mp4')))
    secs, starts = split('fix', urls, bars, p('04-fix.mp4')); add('04-fix.mp4', secs, starts)
    add('05-git.mp4', single('git', urls, p('05-git.mp4')))
    for name in ('factory', 'end'):
        subprocess.run(['cp', os.path.join(P, name + '.mp4'), p(f'9-{name}.mp4')], check=True)
        add(f'9-{name}.mp4', cards[name][1], [t + 0.12 for t in cards[name][2]])
    open(p('list.txt'), 'w').write(''.join(f"file '{x}'\n" for x in parts))
    silent = p('video.mp4')
    ffmpeg('-f', 'concat', '-safe', '0', '-i', p('list.txt'), '-c', 'copy', silent)
    length = duration(silent)
    music.write(p('music.wav'), music.song(length))
    music.write(p('sfx.wav'), music.sfx_track(length, pops))
    ffmpeg('-i', silent, '-i', p('music.wav'), '-i', p('sfx.wav'), '-filter_complex',
           '[1:a]volume=0.55[m];[2:a]volume=0.45[s];[m][s]amix=inputs=2:normalize=0,loudnorm=I=-20:TP=-2:LRA=9[a]',
           '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
           '-movflags', '+faststart', OUT)
    print(f'{OUT}: {length:.1f} s, {len(pops)} pops')


if __name__ == '__main__':
    main()
