"""
Storybook paper pop-up graphics at 1920x1080: textured paper, torn edges, pieces that stand up
off the page one after another. Cards are CSS animations captured frame by frame (each frame
seeks every animation to its time), so the motion is exact and the frames crisp.

Also the static pieces the scenes use: a construction-paper backdrop with a torn caption strip,
washi tape for the windows' corners, caption text, and paper tags. The mascot is the owner's buffalo
in perforated paper (ลายฉลุ, docs/design/mascot.png): it stands in the wide margins of
single-window scenes and rocks on the cards.
"""
import base64, html, os, random, shutil, subprocess

from playwright.sync_api import sync_playwright

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SP, 'paper')
W, H = 1920, 1080
FPS = 30

INK = '#2B2340'
PAPER = '#F5EAD6'
CREAM = '#FFF9EC'
YELLOW = '#FFC93C'
TEAL = '#2EC4B6'
BLUE = '#4D8DFF'
CORAL = '#FF6F59'
PURPLE = '#8E5CF7'
GREEN = '#43C463'
PINK = '#FF8FB1'

FONT = "'Sukhumvit Set', 'Thonburi', sans-serif"
MONO = "Menlo, 'Sukhumvit Set', monospace"

NOISE = ("data:image/svg+xml;base64," + base64.b64encode(b"""<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>
<filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>
<feColorMatrix values='0 0 0 0 .32  0 0 0 0 .24  0 0 0 0 .16  0 0 0 .11 0'/></filter>
<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.018' numOctaves='2' stitchTiles='stitch' seed='4'/>
<feColorMatrix values='0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .07 0'/></filter>
<rect width='100%' height='100%' filter='url(#g)'/><rect width='100%' height='100%' filter='url(#f)'/></svg>""").decode())

CSS = f"""
*{{box-sizing:border-box}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;font-family:{FONT};color:{INK}}}
.page{{position:absolute;inset:0;background:url({NOISE}),{PAPER}}}
.paper{{position:absolute;filter:drop-shadow(5px 7px 0 rgba(43,35,64,.22))}}
.stage{{position:absolute;inset:0;perspective:1500px;perspective-origin:50% 35%}}
.pop{{transform-origin:50% 100%;backface-visibility:hidden;animation:pop .8s cubic-bezier(.34,1.56,.64,1) both}}
.rise{{animation:rise .9s cubic-bezier(.2,.9,.3,1.1) both}}
.slide{{animation:slide .6s cubic-bezier(.2,.9,.3,1.2) both}}
.grow{{animation:grow .5s cubic-bezier(.34,1.56,.64,1) both}}
.spin{{animation:spin 9s linear both}}
.bob{{animation:bob 2.4s ease-in-out infinite alternate both}}
@keyframes pop{{0%{{transform:rotateX(-86deg);opacity:0}}12%{{opacity:1}}100%{{transform:rotateX(0);opacity:1}}}}
@keyframes rise{{from{{transform:translateY(110%)}}to{{transform:translateY(0)}}}}
@keyframes slide{{from{{transform:translateX(-60px);opacity:0}}to{{transform:none;opacity:1}}}}
@keyframes grow{{from{{transform:scale(0)}}to{{transform:scale(1)}}}}
@keyframes spin{{from{{transform:rotate(0)}}to{{transform:rotate(40deg)}}}}
@keyframes bob{{from{{transform:translateY(0)}}to{{transform:translateY(-10px)}}}}
@keyframes rock{{0%,100%{{transform:rotate(-2deg) translateY(0)}}50%{{transform:rotate(2deg) translateY(-6px)}}}}
@keyframes wave{{0%,100%{{transform:rotate(0)}}25%{{transform:rotate(-11deg)}}50%{{transform:rotate(3deg)}}75%{{transform:rotate(-8deg)}}}}
@keyframes talk{{0%,30%,100%{{transform:rotate(0)}}8%{{transform:rotate(9deg)}}16%{{transform:rotate(2deg)}}23%{{transform:rotate(7deg)}}55%{{transform:rotate(0)}}62%{{transform:rotate(10deg)}}70%{{transform:rotate(1deg)}}78%{{transform:rotate(6deg)}}86%{{transform:rotate(0)}}}}
.m-live{{animation:rock 3.2s ease-in-out infinite both}}
.m-live .m-arm{{animation:wave 1.6s ease-in-out infinite both}}
.m-live .m-jaw{{animation:talk 1.6s linear infinite both}}
.label{{background:url({NOISE}),{CREAM}}}
"""


def torn(w, h, seed, jag=7, step=26):
    """A clip-path polygon (px) for a w x h piece of paper with torn edges."""
    r = random.Random(seed)
    pts = []
    for x in range(0, w + 1, step):
        pts.append((min(x, w), r.uniform(0, jag)))
    for y in range(step, h + 1, step):
        pts.append((w - r.uniform(0, jag), min(y, h)))
    for x in range(w, -1, -step):
        pts.append((max(x, 0), h - r.uniform(0, jag)))
    for y in range(h, 0, -step):
        pts.append((r.uniform(0, jag), max(y, 0)))
    return 'polygon(' + ','.join(f'{x:.1f}px {y:.1f}px' for x, y in pts) + ')'


def piece(x, y, w, h, color, inner='', cls='', delay=0.0, seed=1, extra='', jag=7):
    """A torn piece of paper; the shadow is on a wrapper, since clip-path would cut it off."""
    anim = f'animation-delay:{delay:.2f}s;' if cls else ''
    return (f'<div class="paper {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;{anim}">'
            f'<div style="position:absolute;inset:0;background:url({NOISE}),{color};clip-path:{torn(w, h, seed, jag)};{extra}">{inner}</div></div>')


# The owner's landscapes (docs/design/video-backgrounds), one a scene
BACKGROUNDS = {
    'hunt_setup': 'hills', 'hunt': 'waterfall', 'fix_setup': 'field', 'fix': 'beach',
    'git': 'hills', 'factory': 'field', 'end': 'beach',
}


def background_uri(scene):
    """The scene's landscape as a data URI; None for a scene without one."""
    name = BACKGROUNDS.get(scene)
    if not name:
        return None
    repo = open(os.path.join(SP, 'repo.txt')).read().strip()
    path = os.path.join(repo, 'docs/design/video-backgrounds', name + '.png')
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def page_style(scene, color=PAPER):
    """The page behind a scene: its landscape, filling the frame; else paper of a colour."""
    uri = background_uri(scene)
    return f'background:url({uri}) center/cover no-repeat' if uri else f'background:url({NOISE}),{color}'


def doc(body, scene=None):
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>'
            f'<body><div class="page" style="{page_style(scene)}"></div><div class="stage">{body}</div></body></html>')


def icon_uri():
    repo = open(os.path.join(SP, 'repo.txt')).read().strip()
    path = os.path.join(repo, 'apps/web/public/brand/app-icon.webp')
    return 'data:image/webp;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


# ---- the mascot: the owner's buffalo, cut-paper ลายฉลุ (docs/design/mascot.png) ----

MASCOT_SIZE = (1448, 1086)  # the source image
MASCOT_RATIO = MASCOT_SIZE[1] / MASCOT_SIZE[0]
# one mascot a frame, big, in the bottom-left corner like a vtuber; it runs a little off the bottom
MASCOT_W = 420
MASCOT_H = round(MASCOT_W * MASCOT_RATIO)
MASCOT_X, MASCOT_Y = -14, H - MASCOT_H + 26
# captions keep clear of it: they centre in what is left of the width
CAPTION_LEFT = MASCOT_X + MASCOT_W - 20

# The mascot as a หนังตะลุง puppet: pieces cut from the one image, each turning on its pin
# (source pixels). The forearm with its thumb up turns on the elbow's rivet; the lower jaw on the
# corner of the mouth, opening onto a dark mouth as a puppet's cut does.
JOINTS = {
    'arm': {'pivot': (988, 858), 'poly': [(950, 820), (995, 785), (1035, 745), (1030, 700), (1040, 540), (1080, 518),
                                           (1142, 522), (1168, 584), (1228, 616), (1250, 690), (1236, 764), (1178, 808),
                                           (1142, 834), (1094, 886), (1078, 934), (1010, 938), (950, 898)]},
    'jaw': {'pivot': (845, 520), 'poly': [(838, 525), (860, 505), (885, 505), (950, 488), (1000, 478), (1025, 482),
                                           (1028, 505), (1015, 540), (995, 562), (945, 572), (895, 572), (850, 558)]},
}
MOUTH = (10, 30, 92, 255)


def _source():
    repo = open(os.path.join(SP, 'repo.txt')).read().strip()
    return os.path.join(repo, 'docs/design/mascot.png')


def _uri(path):
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def cut_mascot():
    """The mascot's pieces as PNGs the size of the source: the body (pieces cut out, the mouth dark
    behind the jaw), each moving piece, and the elbow's rivet to lay back on top of the arm."""
    from PIL import Image, ImageDraw
    os.makedirs(OUT, exist_ok=True)
    paths = {k: os.path.join(OUT, f'mascot-{k}.png') for k in ('body', 'arm', 'jaw', 'pin')}
    if all(os.path.exists(p) for p in paths.values()):
        return paths
    src = Image.open(_source()).convert('RGBA')
    body = src.copy()
    for name, j in JOINTS.items():
        mask = Image.new('L', src.size, 0)
        ImageDraw.Draw(mask).polygon(j['poly'], fill=255)
        piece = Image.new('RGBA', src.size, (0, 0, 0, 0))
        piece.paste(src, (0, 0), mask)
        piece.save(paths[name])
        # what the piece leaves: nothing for the arm (the screen shows), the mouth for the jaw
        hole = Image.new('RGBA', src.size, MOUTH if name == 'jaw' else (0, 0, 0, 0))
        body.paste(hole, (0, 0), mask)
    pin = Image.new('L', src.size, 0)
    x, y = JOINTS['arm']['pivot']
    ImageDraw.Draw(pin).ellipse((x - 32, y - 32, x + 32, y + 32), fill=255)
    rivet = Image.new('RGBA', src.size, (0, 0, 0, 0))
    rivet.paste(src, (0, 0), pin)
    rivet.save(paths['pin'])
    body.save(paths['body'])
    return paths


def buffalo(width, live=True, flip=False):
    """
    The mascot (the owner's design: the buffalo in perforated paper, gear horns, the clock, a
    ผ้าขาวม้า, a thumb up), facing right (`flip`: left), as a jointed puppet: `live` waves the
    forearm on its elbow, works the jaw as if it talked, and rocks it gently; otherwise it stands.
    """
    parts = {k: _uri(v) for k, v in cut_mascot().items()}
    w, h = MASCOT_SIZE
    origin = lambda k: f'{JOINTS[k]["pivot"][0] / w * 100:.2f}% {JOINTS[k]["pivot"][1] / h * 100:.2f}%'
    layer = lambda k, cls='': (f'<img class="{cls}" src="{parts[k]}" style="position:absolute;inset:0;width:100%;height:100%;'
                              f'transform-origin:{origin(k) if k in JOINTS else "50% 50%"}">')
    flip_t = 'transform:scaleX(-1);' if flip else ''
    return (f'<div class="{"m-live" if live else ""}" style="position:relative;width:{width:.0f}px;height:{width * MASCOT_RATIO:.0f}px;'
            f'transform-origin:50% 100%;filter:drop-shadow(5px 7px 0 rgba(43,35,64,.22));{flip_t}">'
            f'{layer("body")}{layer("jaw", "m-jaw")}{layer("arm", "m-arm")}{layer("pin")}</div>')


def corner_mascot(live=True):
    """The one mascot of a frame, in the bottom-left corner."""
    return f'<div style="position:absolute;left:{MASCOT_X}px;top:{MASCOT_Y}px">{buffalo(MASCOT_W, live)}</div>'


MASCOT_PAD = 40  # room round the corner mascot for the arm to swing out
MASCOT_LOOP = 3.2  # seconds: the rock, two waves and two bursts of talk come round together


def mascot_loop(browser):
    """The corner mascot moving (arm, jaw), its rock left to compose: a transparent loop (PNG in MOV)."""
    out = os.path.join(OUT, 'mascot-loop.mov')
    frames = os.path.join(OUT, 'mascot-frames')
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames)
    page = browser.new_page(viewport={'width': MASCOT_W + 2 * MASCOT_PAD, 'height': MASCOT_H + 2 * MASCOT_PAD})
    page.set_content(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}'
                     f'.m-live{{animation:none}}</style></head><body><div style="position:absolute;left:{MASCOT_PAD}px;top:{MASCOT_PAD}px">'
                     f'{buffalo(MASCOT_W, live=True)}</div></body></html>')
    page.wait_for_timeout(300)
    for f in range(int(MASCOT_LOOP * FPS)):
        page.evaluate(f'document.getAnimations().forEach(a => {{ a.pause(); a.currentTime = {f * 1000 / FPS:.1f} }})')
        page.screenshot(path=os.path.join(frames, f'{f:04d}.png'), omit_background=True)
    page.close()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(FPS),
                    '-i', os.path.join(frames, '%04d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', out], check=True)
    return out


ICONS = {
    'board': f'''<svg viewBox="0 0 120 100" width="130"><rect x="4" y="4" width="112" height="92" rx="10" fill="{CREAM}" stroke="{INK}" stroke-width="6"/>
      <rect x="18" y="20" width="22" height="30" rx="3" fill="{YELLOW}" stroke="{INK}" stroke-width="4"/><rect x="18" y="56" width="22" height="24" rx="3" fill="{CORAL}" stroke="{INK}" stroke-width="4"/>
      <rect x="49" y="20" width="22" height="22" rx="3" fill="{TEAL}" stroke="{INK}" stroke-width="4"/><rect x="80" y="20" width="22" height="40" rx="3" fill="{BLUE}" stroke="{INK}" stroke-width="4"/></svg>''',
    'clock': f'''<svg viewBox="0 0 110 110" width="120"><circle cx="55" cy="55" r="48" fill="{CREAM}" stroke="{INK}" stroke-width="6"/>
      <path d="M55 24 V55 L76 68" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="55" cy="55" r="6" fill="{CORAL}" stroke="{INK}" stroke-width="3"/></svg>''',
    'robot': f'''<svg viewBox="0 0 120 120" width="120"><line x1="60" y1="8" x2="60" y2="26" stroke="{INK}" stroke-width="6"/><circle cx="60" cy="10" r="8" fill="{YELLOW}" stroke="{INK}" stroke-width="4"/>
      <rect x="14" y="26" width="92" height="74" rx="16" fill="{CREAM}" stroke="{INK}" stroke-width="6"/><circle cx="42" cy="58" r="10" fill="{BLUE}" stroke="{INK}" stroke-width="4"/><circle cx="78" cy="58" r="10" fill="{BLUE}" stroke="{INK}" stroke-width="4"/>
      <rect x="40" y="78" width="40" height="9" rx="4" fill="{INK}"/></svg>''',
    'done': f'''<svg viewBox="0 0 120 110" width="126"><rect x="6" y="6" width="108" height="98" rx="12" fill="{CREAM}" stroke="{INK}" stroke-width="6"/>
      <path d="M30 56 L52 78 L92 34" fill="none" stroke="{GREEN}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>''',
}


def hills(delay=0.0):
    """Torn paper hills along the bottom, rising one layer after another."""
    out = ''
    for k, (color, top, seed) in enumerate([(TEAL, 860, 11), (GREEN, 910, 12), (YELLOW, 975, 13)]):
        out += piece(-40, top, W + 80, H - top + 40, color, cls='rise', delay=delay + k * 0.12, seed=seed, jag=22)
    return out


def sun(x, y, r, delay):
    rays = ''.join(f'<div style="position:absolute;left:{r - 9}px;top:{-r * 0.55:.0f}px;width:18px;height:{r * 0.45:.0f}px;'
                   f'background:{YELLOW};border:4px solid {INK};border-radius:9px;transform-origin:9px {r * 1.55:.0f}px;'
                   f'transform:rotate({a}deg)"></div>' for a in range(0, 360, 45))
    return (f'<div class="grow" style="position:absolute;left:{x}px;top:{y}px;width:{2 * r}px;height:{2 * r}px;animation-delay:{delay:.2f}s">'
            f'<div class="spin" style="position:absolute;inset:0;animation-delay:{delay:.2f}s">{rays}</div>'
            f'<div style="position:absolute;inset:0;border-radius:50%;background:url({NOISE}),{YELLOW};border:5px solid {INK}"></div></div>')


def cloud(x, y, s, delay, seed):
    return piece(x, y, int(220 * s), int(86 * s), CREAM, cls='slide', delay=delay, seed=seed, jag=10,
                 extra='border-radius:60px;')


def tag(text, color, size=30, white=False):
    return (f'<span style="display:inline-block;background:url({NOISE}),{color};padding:6px 22px 10px;font-size:{size}px;'
            f'font-weight:700;border-radius:8px;filter:drop-shadow(3px 4px 0 rgba(43,35,64,.25));{"color:#fff;" if white else ""}">{html.escape(text)}</span>')


# ---- the cards: (html, seconds, [times a piece pops, for the sound]) ----

def title():
    chips = [('Kanban', YELLOW), ('Cron Job', TEAL), ('Claude', BLUE), ('Codex', PURPLE), ('MCP', PINK)]
    body = sun(1600, 110, 85, 0.2) + cloud(120, 120, 1.1, 0.35, 21) + cloud(1250, 300, 0.8, 0.5, 22) + hills(0)
    body += piece(330, 250, 1260, 250, CORAL, cls='pop', delay=0.45, seed=31, jag=10,
                  inner=f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:150px;font-weight:800;letter-spacing:.05em">KAMMACRON</div>')
    body += piece(500, 520, 920, 150, CREAM, cls='pop', delay=0.8, seed=32,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:42px;font-weight:700;line-height:1.3">Kanban Board + Cron Job<br>ที่สั่ง Claude หรือ Codex ด้วย prompt ของคุณ</div>')
    for k, (t, c) in enumerate(chips):
        body += (f'<div class="pop" style="position:absolute;left:{470 + k * 205}px;top:710px;animation-delay:{1.05 + k * 0.12:.2f}s">'
                 f'{tag(t, c, 32, c in (BLUE, PURPLE))}</div>')
    body += (f'<div class="pop" style="position:absolute;left:110px;top:520px;width:300px;height:300px;animation-delay:.65s">'
             f'<div class="paper" style="inset:0;border-radius:50%;background:url({NOISE}),{CREAM};border:6px solid {INK}"></div>'
             f'<img src="{icon_uri()}" style="position:absolute;left:18px;top:30px;width:264px"></div>')
    pops = [0.45, 0.65, 0.8] + [1.05 + k * 0.12 for k in range(len(chips))]
    return doc(body), 4.2, pops


STEPS = [
    (YELLOW, 'board', 'ติดแท็ก auto pilot', 'การ์ดที่ agent<br>หยิบไปทำได้'),
    (TEAL, 'clock', 'ตั้ง Cron Job ใน GUI', 'รอบเวลา + Claude/Codex<br>+ prompt ของคุณ'),
    (BLUE, 'robot', 'ถึงรอบ agent ทำงาน', 'อ่านและอัปเดตบอร์ด<br>ผ่าน MCP'),
    (CORAL, 'done', 'ผลกลับมาที่การ์ด', 'คอมเมนต์ + ย้ายไป Done<br>+ commit ในโปรเจกต์'),
]


def flow():
    body = hills(0) + cloud(1500, 90, 0.9, 0.2, 41)
    body += piece(640, 70, 640, 110, PURPLE, cls='pop', delay=0.15, seed=42,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:54px;font-weight:800">ทำงานยังไง</div>')
    pops = [0.15]
    for i, (color, icon, head, sub) in enumerate(STEPS):
        x = 130 + i * 430
        d = 0.55 + i * 0.55
        pops.append(d)
        inner = (f'<div style="position:absolute;left:0;right:0;top:26px;display:flex;justify-content:center">'
                 f'<div style="width:76px;height:76px;border-radius:50%;background:{INK};color:{CREAM};font-size:46px;font-weight:800;display:flex;align-items:center;justify-content:center">{i + 1}</div></div>'
                 f'<div style="position:absolute;left:0;right:0;top:118px;display:flex;justify-content:center">{ICONS[icon]}</div>'
                 f'<div class="label" style="position:absolute;left:24px;right:24px;bottom:28px;height:200px;border-radius:6px;padding:18px 14px;text-align:center">'
                 f'<div style="font-size:35px;font-weight:800;line-height:1.2">{head}</div>'
                 f'<div style="font-size:26px;line-height:1.35;margin-top:10px">{sub}</div></div>')
        body += piece(x, 240, 360, 560, color, cls='pop', delay=d, seed=50 + i, jag=9, inner=inner)
        if i < 3:
            body += (f'<div class="grow" style="position:absolute;left:{x + 365}px;top:490px;animation-delay:{d + 0.35:.2f}s">'
                     f'<svg viewBox="0 0 60 50" width="58"><path d="M4 25 H44 M30 8 L50 25 L30 42" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>')
    return doc(body), 4.6, pops


def summary(stats, commits):
    tiles = [
        (YELLOW, f'{stats["runs"]} รอบ', 'cron job ทุก 1 นาที'),
        (TEAL, f'{stats["done"]} ใบ', 'การ์ดที่ agent ทำเสร็จ'),
        (BLUE, ' / '.join(f'{s} วิ' for s in stats['secs']), 'เวลาของแต่ละรอบ'),
        (PINK, f'{stats["turns"]}', 'turn ของ Claude รวม'),
        (GREEN, f'${stats["cost"]:.3f}', 'ค่าใช้จ่ายรวม (haiku)'),
        (PURPLE, f'{len(commits)} commit', '  '.join(c.split()[0] for c in commits)),
    ]
    body = hills(0)
    body += piece(380, 60, 1160, 120, CORAL, cls='pop', delay=0.15, seed=61,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:50px;font-weight:800">สองรอบ สองการ์ด โดยไม่มีใครกดอะไรเลย</div>')
    pops = [0.15]
    for k, (c, v, label) in enumerate(tiles):
        x = 200 + (k % 3) * 520
        y = 240 + (k // 3) * 300
        d = 0.5 + k * 0.16
        pops.append(d)
        white = c in (BLUE, PURPLE)
        inner = (f'<div style="position:absolute;left:30px;top:34px;font-size:{64 if len(v) > 9 else 80}px;font-weight:800;{"color:#fff;" if white else ""}">{html.escape(v)}</div>'
                 f'<div class="label" style="position:absolute;left:30px;right:30px;bottom:26px;padding:8px 16px 12px;border-radius:5px;font-size:27px;font-weight:700;{"font-family:" + MONO + ";font-size:24px;" if c == PURPLE else ""}">{html.escape(label)}</div>')
        body += piece(x, y, 470, 250, c, cls='pop', delay=d, seed=70 + k, inner=inner)
    return doc(body), 4.4, pops


def end():
    body = sun(160, 120, 70, 0.1) + cloud(1450, 140, 1.0, 0.25, 81) + hills(0)
    body += (f'<div class="pop" style="position:absolute;left:810px;top:70px;width:300px;height:300px;animation-delay:.3s">'
             f'<div class="paper" style="inset:0;border-radius:50%;background:url({NOISE}),{CREAM};border:6px solid {INK}"></div>'
             f'<img src="{icon_uri()}" style="position:absolute;left:18px;top:30px;width:264px"></div>')
    body += piece(430, 400, 1060, 170, CORAL, cls='pop', delay=0.55, seed=91, jag=10,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:110px;font-weight:800;letter-spacing:.05em">KAMMACRON</div>')
    body += piece(470, 600, 980, 110, CREAM, cls='pop', delay=0.8, seed=92,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700">ติดแท็ก auto pilot · ตั้ง cron job · ปล่อยให้ agent ทำ</div>')
    body += (f'<div class="pop" style="position:absolute;left:660px;top:745px;animation-delay:1.05s">'
             f'<span style="display:inline-block;background:{INK};color:{GREEN};font-family:{MONO};font-size:42px;padding:16px 36px;border-radius:14px;filter:drop-shadow(5px 7px 0 rgba(43,35,64,.25))">$ bunx kammacron start</span></div>')
    body += f'<div class="pop" style="position:absolute;left:800px;top:880px;animation-delay:1.25s">{tag("kammacron.pages.dev", PURPLE, 34, True)}</div>'
    return doc(body), 4.6, [0.3, 0.55, 0.8, 1.05, 1.25]


def capture(name, page_html, seconds, browser):
    """Every frame of a card, as JPEGs, then an MP4."""
    frames = os.path.join(OUT, name + '-frames')
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames)
    page = browser.new_page(viewport={'width': W, 'height': H})
    page.set_content(page_html)
    page.wait_for_timeout(400)
    for f in range(int(seconds * FPS)):
        page.evaluate(f'document.getAnimations().forEach(a => {{ a.pause(); a.currentTime = {f * 1000 / FPS:.1f} }})')
        page.screenshot(path=os.path.join(frames, f'{f:04d}.jpg'), type='jpeg', quality=93)
    page.close()
    out = os.path.join(OUT, name + '.mp4')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(FPS),
                    '-i', os.path.join(frames, '%04d.jpg'), '-vf', 'fade=out:st=%.2f:d=0.3' % (seconds - 0.3),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), out],
                   check=True)
    return out


# ---- static pieces for the scenes ----

BAND_Y = 912  # the caption strip's top: windows end above it


def backdrop(color, windows, labels=(), scene=None):
    """The scene's landscape (or paper of its colour), window outlines and shadows, a torn caption strip."""
    body = ''
    for (x, y, w, h) in windows:
        body += (f'<div style="position:absolute;left:{x + 12}px;top:{y + 12}px;width:{w}px;height:{h}px;background:rgba(43,35,64,.35);border-radius:16px"></div>'
                 f'<div style="position:absolute;left:{x - 5}px;top:{y - 5}px;width:{w + 10}px;height:{h + 10}px;background:{INK};border-radius:16px"></div>')
    for (x, y, text, c, right) in labels:
        pos = f'right:{W - x}px' if right else f'left:{x}px'
        body += f'<div style="position:absolute;{pos};top:{y}px">{tag(text, c, 24, c in (BLUE, PURPLE))}</div>'
    body += piece(-30, BAND_Y, W + 60, H - BAND_Y + 30, CREAM, seed=101, jag=14)
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>'
            f'<body><div class="page" style="{page_style(scene, color)}"></div>{body}</body></html>')


def tape(windows):
    """Washi tape over the top corners of each window."""
    out = ''
    for k, (x, y, w, _) in enumerate(windows):
        for j, (tx, rot) in enumerate([(x - 34, -32), (x + w - 96, 32)]):
            c = [PINK, YELLOW, TEAL, YELLOW][(k * 2 + j) % 4]
            out += (f'<div style="position:absolute;left:{tx}px;top:{y - 22}px;width:130px;height:40px;background:{c};opacity:.85;'
                    f'transform:rotate({rot}deg);clip-path:{torn(130, 40, 200 + k * 2 + j, 3, 8)}"></div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}</style></head>'
            f'<body>{out}</body></html>')


def caption(tag_text, text, color):
    """The caption's words on the torn strip (the strip itself is in the backdrop)."""
    body = (f'<div style="position:absolute;left:{CAPTION_LEFT}px;right:20px;top:{BAND_Y + 18}px;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">'
            f'{tag(tag_text, color, 22, color in (BLUE, PURPLE))}'
            f'<div style="font-size:34px;font-weight:700;text-align:center;max-width:{W - CAPTION_LEFT - 40}px;line-height:1.3">{html.escape(text)}</div></div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}</style></head>'
            f'<body>{body}</body></html>')


def badge(text, color, top=10):
    body = f'<div style="position:absolute;left:0;right:0;top:{top}px;display:flex;justify-content:center">{tag(text, color, 26, color in (BLUE, PURPLE, INK))}</div>'
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}</style></head>'
            f'<body>{body}</body></html>')


def browser_bar(url, width, height):
    shown = url.split('://', 1)[-1]
    host, _, path = shown.partition('/')
    lights = ''.join(f'<span style="width:15px;height:15px;border-radius:50%;background:{c};display:inline-block"></span>'
                     for c in ['#FF5F57', '#FEBC2E', '#28C840'])
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:{INK}}}</style></head><body>'
            f'<div style="width:{width}px;height:{height}px;border-radius:12px 12px 0 0;overflow:hidden;background:#EEF0F5;display:flex;align-items:center;gap:16px;padding:0 18px;border-bottom:2px solid #D5D9E3">'
            f'<div style="display:flex;gap:8px">{lights}</div>'
            f'<div style="flex:1;height:{height - 20}px;background:#fff;border:2px solid #CCD2DE;border-radius:{(height - 20) // 2}px;display:flex;align-items:center;padding:0 16px;font-size:{int(height * 0.42)}px;color:#5B6275">'
            f'<span style="color:{INK};font-weight:600">{html.escape(host)}</span><span>/{html.escape(path)}</span></div></div></body></html>')


def terminal_bar(width, height, title):
    lights = ''.join(f'<span style="width:15px;height:15px;border-radius:50%;background:{c};display:inline-block"></span>'
                     for c in ['#FF5F57', '#FEBC2E', '#28C840'])
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:{INK}}}</style></head><body>'
            f'<div style="width:{width}px;height:{height}px;border-radius:12px 12px 0 0;overflow:hidden;background:#2A2B3D;display:flex;align-items:center;padding:0 18px;position:relative">'
            f'<div style="display:flex;gap:8px">{lights}</div><div style="position:absolute;left:0;right:0;text-align:center;color:#C6C8D8;font-size:{int(height * 0.4)}px;font-weight:600">{html.escape(title)}</div></div></body></html>')


def render_static(items, browser):
    """items: [(name, html, transparent, clip (w, h) or None)] -> PNGs."""
    page = browser.new_page(viewport={'width': W, 'height': H})
    for name, page_html, transparent, clip in items:
        page.set_content(page_html)
        page.wait_for_timeout(150)
        kw = {'clip': {'x': 0, 'y': 0, 'width': clip[0], 'height': clip[1]}} if clip else {}
        page.screenshot(path=os.path.join(OUT, name + '.png'), omit_background=transparent, **kw)
    page.close()


# ---- the AI factory ----

FACTORY_CSS = """
@keyframes belt{from{transform:translateX(0)}to{transform:translateX(var(--d))}}
@keyframes roll{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
.belt-card{position:absolute;animation:belt 2.4s linear infinite both}
.roller{animation:roll 1s linear infinite both}
.lamp{animation:blink .8s ease-in-out infinite both}
"""

MACHINE_ICONS = {
    'hunt': f'''<svg viewBox="0 0 120 120" width="120"><circle cx="50" cy="50" r="32" fill="{CREAM}" stroke="{INK}" stroke-width="8"/>
      <line x1="74" y1="74" x2="108" y2="108" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>
      <path d="M40 44 q10 -14 20 0" fill="none" stroke="{CORAL}" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="58" r="6" fill="{CORAL}"/></svg>''',
    'fix': f'''<svg viewBox="0 0 120 120" width="120"><path d="M78 16 a26 26 0 0 0 -30 34 L14 84 a10 10 0 0 0 14 14 L62 64 a26 26 0 0 0 34 -30 L82 48 L70 36 Z"
      fill="{CREAM}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/></svg>''',
}


def machine(x, y, label, icon, color, delay):
    lamp = f'<div class="lamp" style="position:absolute;right:26px;top:22px;width:22px;height:22px;border-radius:50%;background:{GREEN};border:4px solid {INK};animation-delay:{delay:.2f}s"></div>'
    inner = (f'{lamp}<div style="position:absolute;left:0;right:0;top:40px;display:flex;justify-content:center">{MACHINE_ICONS[icon]}</div>'
             f'<div class="label" style="position:absolute;left:22px;right:22px;bottom:22px;padding:8px 10px 12px;border-radius:6px;text-align:center;font-size:30px;font-weight:800;line-height:1.2">{label}</div>')
    return piece(x, y, 300, 320, color, cls='pop', delay=delay, seed=int(x), inner=inner, jag=8)


def belt(x0, x1, y, card_color, text, delay):
    """A conveyor from x0 to x1 with paper cards riding on it."""
    w = x1 - x0
    rollers = ''.join(f'<div class="roller" style="position:absolute;left:{10 + k * 56}px;top:9px;width:26px;height:26px;border-radius:50%;'
                      f'border:4px dashed {CREAM};animation-delay:{delay:.2f}s"></div>' for k in range(max(1, w // 56)))
    cards = ''
    for k in range(3):
        cards += (f'<div class="belt-card" style="left:-40px;top:-74px;--d:{w}px;animation-delay:{-k * 0.8 + delay:.2f}s">'
                  f'<div style="width:110px;height:70px;background:url({NOISE}),{card_color};border:4px solid {INK};border-radius:8px;'
                  f'display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;{"color:#fff;" if card_color in (CORAL, BLUE, PURPLE) else ""}">{text}</div></div>')
    return (f'<div class="grow" style="position:absolute;left:{x0}px;top:{y}px;width:{w}px;height:44px;animation-delay:{delay:.2f}s">'
            f'<div style="position:absolute;inset:0;background:{INK};border-radius:22px;overflow:hidden">{rollers}</div>'
            f'<div style="position:absolute;left:0;right:0;top:0;height:0;overflow:visible;clip-path:inset(-200px 0 0 0)">{cards}</div></div>')


def factory(stats):
    body = ''
    body = body.replace('</div>', '</div>', 1)
    body += piece(480, 50, 960, 116, PURPLE, cls='pop', delay=0.1, seed=301,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:54px;font-weight:800">🏭 โรงงาน AI บนเครื่องของคุณ</div>')
    body += machine(110, 260, 'Cron<br>หาบัค', 'hunt', BLUE, 0.35)
    body += belt(410, 790, 520, CORAL, 'บัค', 0.6)
    body += machine(790, 260, 'Cron<br>แก้บัค', 'fix', YELLOW, 0.55)
    body += belt(1090, 1450, 520, GREEN, '✓ Done', 0.8)
    extra = f'+{stats["review"]} ส่งให้คนเช็ค' if stats['review'] else f'+{stats["human"]} รอคนตัดสินใจ'
    body += piece(1450, 330, 330, 250, GREEN, cls='pop', delay=0.75, seed=302,
                  inner=f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:{INK}">'
                        f'<div style="font-size:84px;font-weight:800;line-height:1">{stats["fixed"]} Done</div>'
                        f'<div class="label" style="margin-top:16px;padding:6px 18px 10px;border-radius:6px;font-size:27px;font-weight:800">{extra}</div></div>')
    facts = [(f'AI เปิดการ์ดบัค {stats["cards"]} ใบ', CORAL), (f'แก้ + commit {stats.get("commits", stats["fixed"])} ใบ', GREEN),
             (f'{stats["runs"]} รอบ ใน {stats["minutes"]:g} นาที', BLUE), (f'${stats["cost"]:.3f} (haiku)', YELLOW),
             ('ไม่มีใครกดอะไรเลย', PINK)]
    row = ''.join(f'<div class="pop" style="animation-delay:{1.0 + k * 0.14:.2f}s;white-space:nowrap">{tag(t, c, 34, c in (BLUE, PURPLE, CORAL))}</div>'
                  for k, (t, c) in enumerate(facts))
    body += f'<div style="position:absolute;left:0;right:0;top:690px;display:flex;justify-content:center;gap:26px">{row}</div>'
    body += f'<div class="slide" style="animation-delay:.2s">{corner_mascot()}</div>'
    html_doc = doc(body, 'factory').replace('</style>', FACTORY_CSS + '</style>', 1)
    return html_doc, 5.0, [0.1, 0.35, 0.55, 0.75] + [1.0 + k * 0.14 for k in range(len(facts))]


def topbar(label, label_color, c):
    """The split scene's top strip: which run (or the fast-forward) and the factory's counts."""
    parts = [(label, label_color), (f'🐞 การ์ดบัค {c["found"]}', CORAL), (f'🔧 กำลังแก้ {c["doing"]}', YELLOW),
             (f'✅ Done {c["done"]}', GREEN)] + ([(f'👀 รอคนเช็ค {c["review"]}', PURPLE)] if c.get('review') else [])
    chips = ''.join(tag(t, col, 24, col in (BLUE, PURPLE, INK, CORAL)) for t, col in parts)
    body = f'<div style="position:absolute;left:0;right:0;top:10px;display:flex;justify-content:center;gap:14px">{chips}</div>'
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}</style></head>'
            f'<body>{body}</body></html>')


def end_card():
    body = ''
    body += (f'<div class="pop" style="position:absolute;left:810px;top:60px;width:300px;height:300px;animation-delay:.3s">'
             f'<div class="paper" style="inset:0;border-radius:50%;background:url({NOISE}),{CREAM};border:6px solid {INK}"></div>'
             f'<img src="{icon_uri()}" style="position:absolute;left:18px;top:30px;width:264px"></div>')
    body += piece(430, 390, 1060, 170, CORAL, cls='pop', delay=0.5, seed=91, jag=10,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:110px;font-weight:800;letter-spacing:.05em">KAMMACRON</div>')
    body += piece(400, 590, 1120, 110, CREAM, cls='pop', delay=0.75, seed=92,
                  inner='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700">Kanban + Cron Job ให้ Claude หรือ Codex หาบัคเอง แก้เอง บนเครื่องคุณ</div>')
    body += (f'<div class="pop" style="position:absolute;left:660px;top:740px;animation-delay:1.0s">'
             f'<span style="display:inline-block;background:{INK};color:{GREEN};font-family:{MONO};font-size:42px;padding:16px 36px;border-radius:14px;filter:drop-shadow(5px 7px 0 rgba(43,35,64,.25))">$ bunx kammacron start</span></div>')
    body += f'<div class="pop" style="position:absolute;left:800px;top:875px;animation-delay:1.2s">{tag("kammacron.pages.dev", PURPLE, 34, True)}</div>'
    body += f'<div class="slide" style="animation-delay:1.3s">{corner_mascot()}</div>'
    return doc(body, 'end'), 4.6, [0.3, 0.5, 0.75, 1.0, 1.2]
