"""
The video's look: a southern Thai shadow-puppet play (หนังตะลุง), made mechanical and modern. The
scenes sit on a lit screen (จอหนัง) framed in perforated leather (ลายฉลุ, geometric, with coloured
gels in some holes); windows hang from the frame on puppet rods (ไม้ตับ) and are pinned with brass
rivets; captions are cut into a leather band. The mascot is the app's buffalo as a jointed leather
puppet (gear horns, the clock over its head, a ผ้าขาวม้า scarf): head, legs and tail on rivets, the
gears turning. Pieces of the cards swing down on their rods and settle.

Cards are CSS animations captured frame by frame (each frame seeks every animation to its time), so
the motion is exact and the frames crisp. (The module keeps its old name: compose.py imports it.)
"""
import html, math, os, shutil, subprocess

from playwright.sync_api import sync_playwright  # noqa: F401  (compose.py opens the browser)

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SP, 'paper')
W, H = 1920, 1080
FPS = 30

# the lit screen and the leather
SCREEN = '#F3D9A6'
SCREEN_HOT = '#FCEFD2'
LEATHER = '#1D130E'
LEATHER2 = '#3B2619'
BRASS = '#D6A23E'
BRASS_DARK = '#8E6420'
ROD = '#9A6A35'
CREAM = '#FBEFD5'

# the gels: the brand's orange and blue, and the puppets' dyes (names kept for compose.py)
INK = LEATHER
CORAL = '#F2602A'  # the brand's orange
BLUE = '#2450C8'  # the brand's blue
YELLOW = '#E9A91B'
TEAL = '#17866A'
GREEN = '#3E9441'
PURPLE = '#6B3EA8'
PINK = '#C93B62'

FONT = "'Sukhumvit Set', 'Thonburi', sans-serif"
MONO = "Menlo, 'Sukhumvit Set', monospace"

CSS = f"""
*{{box-sizing:border-box}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;font-family:{FONT};color:{LEATHER}}}
.screen{{position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 30%,{SCREEN_HOT} 0%,{SCREEN} 62%,#E7C68C 100%)}}
.stage{{position:absolute;inset:0}}
.pop{{transform-origin:50% -40px;animation:swing 1.1s cubic-bezier(.3,1.5,.5,1) both}}
.grow{{animation:grow .5s cubic-bezier(.34,1.56,.64,1) both}}
@keyframes swing{{0%{{transform:translateY(-120px) rotate(-14deg);opacity:0}}15%{{opacity:1}}55%{{transform:translateY(0) rotate(5deg)}}78%{{transform:rotate(-2deg)}}100%{{transform:none;opacity:1}}}}
@keyframes grow{{from{{transform:scale(0)}}to{{transform:scale(1)}}}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
@keyframes spinback{{to{{transform:rotate(-360deg)}}}}
@keyframes nod{{0%,100%{{transform:rotate(-4deg)}}50%{{transform:rotate(6deg)}}}}
@keyframes tick{{0%,100%{{transform:rotate(-8deg)}}50%{{transform:rotate(8deg)}}}}
@keyframes step{{0%,100%{{transform:rotate(-14deg)}}50%{{transform:rotate(14deg)}}}}
@keyframes stepb{{0%,100%{{transform:rotate(12deg)}}50%{{transform:rotate(-12deg)}}}}
@keyframes wag{{0%,100%{{transform:rotate(-10deg)}}50%{{transform:rotate(16deg)}}}}
@keyframes sway{{0%,100%{{transform:translateY(0) rotate(-1deg)}}50%{{transform:translateY(-8px) rotate(1deg)}}}}
.b-live .b-head{{animation:nod 1.6s ease-in-out infinite both}}
.b-live .b-legf{{animation:step 1.6s ease-in-out infinite both}}
.b-live .b-legb{{animation:stepb 1.6s ease-in-out infinite both}}
.b-live .b-tail{{animation:wag 1.1s ease-in-out infinite both}}
.b-live .b-gear{{animation:tick 1.6s ease-in-out infinite both}}
.b-live .b-hand{{animation:spin 3s linear infinite both}}
.b-live .b-body{{animation:sway 1.6s ease-in-out infinite both}}
.gear-spin{{animation:spin 5s linear infinite both}}
.gear-back{{animation:spinback 5s linear infinite both}}
svg *{{transform-box:view-box}}
"""


def luminous(color):
    """Light text on a dark gel, dark text on a light one."""
    c = color.lstrip('#')
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    return 0.299 * r + 0.587 * g + 0.114 * b < 150


# ---- the leather: perforated bands, rivets, rods, gears ----

def chalu_tile(h, accent, k=0):
    """One repeat of a perforated band (h tall, 2h wide): a lozenge, flame curls, dots; a gel in some."""
    w = 2 * h
    m = h / 2
    gel = accent if k % 3 == 0 else SCREEN_HOT
    curl = lambda x, flip: (f'<path d="M{x:.1f} {m + h * .28:.1f} q{flip * h * .34:.1f} {-h * .1:.1f} {flip * h * .2:.1f} {-h * .46:.1f} '
                            f'q{-flip * h * .02:.1f} {h * .22:.1f} {-flip * h * .2:.1f} {h * .46:.1f}z" fill="{SCREEN_HOT}"/>')
    return (f'<g transform="translate({k * w} 0)">'
            f'<rect width="{w}" height="{h}" fill="{LEATHER}"/>'
            f'<path d="M{h} {h * .14:.1f} L{h * 1.36:.1f} {m} L{h} {h * .86:.1f} L{h * .64:.1f} {m}z" fill="{gel}"/>'
            f'<circle cx="{h}" cy="{m}" r="{h * .08:.1f}" fill="{LEATHER}"/>'
            f'{curl(h * .2, 1)}{curl(w - h * .2, -1)}'
            f'<circle cx="{h * .5:.1f}" cy="{h * .2:.1f}" r="{h * .06:.1f}" fill="{SCREEN_HOT}"/>'
            f'<circle cx="{h * 1.5:.1f}" cy="{h * .2:.1f}" r="{h * .06:.1f}" fill="{SCREEN_HOT}"/>'
            f'<circle cx="{h * .5:.1f}" cy="{h * .8:.1f}" r="{h * .06:.1f}" fill="{SCREEN_HOT}"/>'
            f'<circle cx="{h * 1.5:.1f}" cy="{h * .8:.1f}" r="{h * .06:.1f}" fill="{SCREEN_HOT}"/></g>')


_ids = iter(range(1, 1_000_000))


def chalu_band(x, y, w, h, accent, scallop='bottom'):
    """A perforated leather band, with a scalloped edge (สาบ) on one side."""
    cid = f'cb{next(_ids)}'  # unique: a page holds several bands
    tiles = ''.join(chalu_tile(h, accent, k) for k in range(int(w // (2 * h)) + 2))
    edge = ''
    if scallop:
        r = h * .28
        cy = h if scallop == 'bottom' else 0
        edge = ''.join(f'<circle cx="{i * r * 2 + r:.1f}" cy="{cy}" r="{r:.1f}" fill="{LEATHER}"/>'
                       for i in range(int(w / (2 * r)) + 1))
    over = h * .3 if scallop else 0
    top = -over if scallop == 'top' else 0
    return (f'<svg style="position:absolute;left:{x}px;top:{y + top}px;overflow:visible" width="{w}" height="{h + over}" '
            f'viewBox="0 {top} {w} {h + over}"><clipPath id="{cid}"><rect y="{top}" width="{w}" height="{h + over}"/></clipPath>'
            f'<g clip-path="url(#{cid})">{tiles}{edge}</g></svg>')


def rivet(x, y, r=9):
    return (f'<svg style="position:absolute;left:{x - r - 2}px;top:{y - r - 2}px" width="{2 * r + 4}" height="{2 * r + 4}">'
            f'<circle cx="{r + 2}" cy="{r + 2}" r="{r}" fill="{BRASS}" stroke="{BRASS_DARK}" stroke-width="2.5"/>'
            f'<circle cx="{r + 2 - r * .3:.1f}" cy="{r + 2 - r * .3:.1f}" r="{r * .3:.1f}" fill="{CREAM}"/></svg>')


def rod(x1, y1, x2, y2, w=7):
    """A puppet rod (ไม้ตับ), bamboo brown, from (x1, y1) to (x2, y2)."""
    length = math.hypot(x2 - x1, y2 - y1)
    angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return (f'<div style="position:absolute;left:{x1}px;top:{y1 - w / 2}px;width:{length:.1f}px;height:{w}px;'
            f'background:{ROD};border-radius:{w}px;transform-origin:0 50%;transform:rotate({angle:.2f}deg);'
            f'box-shadow:0 0 0 1.5px {LEATHER2}"></div>')


def gear_path(cx, cy, r, teeth=10, depth=None):
    depth = depth or r * .22
    pts = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4)
        rr = r + depth if i % 4 in (1, 2) else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'


def gear_svg(size, color, cls='', delay=0.0, teeth=10):
    """A leather gear with a gel inside and spokes cut out."""
    c = size / 2
    r = size * .36
    holes = ''.join(f'<circle cx="{c + r * .55 * math.cos(a):.1f}" cy="{c + r * .55 * math.sin(a):.1f}" r="{r * .17:.1f}" fill="{SCREEN_HOT}"/>'
                    for a in [k * math.pi / 3 for k in range(6)])
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" class="{cls}" style="animation-delay:{delay:.2f}s">'
            f'<path d="{gear_path(c, c, r, teeth)}" fill="{LEATHER}"/>'
            f'<circle cx="{c}" cy="{c}" r="{r * .82:.1f}" fill="{color}" opacity=".92"/>{holes}'
            f'<circle cx="{c}" cy="{c}" r="{r * .2:.1f}" fill="{BRASS}" stroke="{BRASS_DARK}" stroke-width="3"/></svg>')


# ---- the mascot: the buffalo as a jointed leather puppet ----

def _dots(points, r, color=SCREEN_HOT):
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>' for x, y in points)


def horn_path(cx, cy, r0, r1, a0, a1, teeth=7):
    """A gear-toothed crescent: the arc of a gear between angles a0 and a1 (degrees)."""
    pts_out, pts_in = [], []
    n = teeth * 4
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        rr = r1 + (r1 - r0) * .45 if i % 4 in (1, 2) else r1
        pts_out.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    for i in range(n, -1, -1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts_in.append((cx + r0 * math.cos(a), cy + r0 * math.sin(a)))
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts_out + pts_in) + 'Z'


def buffalo(width, live=True, flip=False, rods=True):
    """
    The buffalo of the logo, side on, facing right: a heavy body with a hump, the head low and
    forward, a horn that is the arc of a gear, the clock on a rod over its head, a checked scarf.
    Body, head, legs and tail are leather pieces on brass rivets; `live` makes it walk and nod (for
    the cards), otherwise it stands still (the scenes' margins).
    """
    o = lambda x, y: f'transform-origin:{x}px {y}px'
    check = (f'<pattern id="pk" width="20" height="20" patternUnits="userSpaceOnUse">'
             f'<rect width="20" height="20" fill="{CREAM}"/><rect width="10" height="10" fill="{CORAL}"/>'
             f'<rect x="10" y="10" width="10" height="10" fill="{CORAL}" opacity=".7"/>'
             f'<rect x="10" width="10" height="10" fill="{BLUE}" opacity=".5"/></pattern>')

    def leg(x, top, cls, origin, far=False):
        cut = '' if far else f' stroke="{SCREEN_HOT}" stroke-width="3"'
        return (f'<g class="{cls}" style="{origin}"><path d="M{x} {top} l50 0 q4 70 -6 130 l4 30 h-48 l2 -30 q-10 -60 -2 -130z" '
                f'fill="{LEATHER2 if far else LEATHER}"{cut}/>'
                + _dots([(x + 24, top + 40), (x + 22, top + 80), (x + 20, top + 118)], 5) + '</g>')

    body = (f'<path d="M96 250 q-4 -86 100 -104 q70 -10 150 -4 q60 -40 120 -8 q50 26 50 96 '
            f'q4 92 -60 112 q-150 30 -300 0 q-60 -16 -60 -92z" fill="{LEATHER}"/>'
            # the perforated saddle: a gel band of lozenges, dots under it
            f'<path d="M170 176 q140 -26 270 -4 l-4 30 q-130 -22 -262 2z" fill="{SCREEN_HOT}"/>'
            f'<path d="M182 182 q130 -22 246 -2 l-2 14 q-120 -18 -240 2z" fill="{LEATHER}"/>'
            + ''.join(f'<path d="M{x} 189 l8 -8 l8 8 l-8 8z" fill="{CORAL if i % 2 else BLUE}"/>' for i, x in enumerate(range(196, 420, 28)))
            + _dots([(x, 250) for x in range(150, 470, 28)], 7)
            + _dots([(x, 282) for x in range(164, 456, 28)], 5)
            + ''.join(f'<path d="M{x} 314 q10 -14 20 0 q-10 8 -20 0z" fill="{SCREEN_HOT}"/>' for x in range(170, 440, 44)))
    tail = (f'<g class="b-tail" style="{o(100, 212)}"><path d="M104 206 q-46 20 -56 120 l-12 30 l26 -6 l12 -24 '
            f'q4 -74 40 -104z" fill="{LEATHER}"/></g>')
    horn = (f'<path d="{horn_path(520, 150, 54, 74, 150, 330, 8)}" fill="{CORAL}"/>'
            f'<path d="{horn_path(520, 150, 54, 74, 150, 330, 8)}" fill="none" stroke="{LEATHER}" stroke-width="6"/>'
            + _dots([(520 + 64 * math.cos(math.radians(a)), 150 + 64 * math.sin(math.radians(a))) for a in range(170, 330, 30)], 4, LEATHER))
    clock = (f'<line x1="520" y1="88" x2="520" y2="36" stroke="{ROD}" stroke-width="6"/>'
             f'<circle cx="520" cy="10" r="30" fill="{CREAM}" stroke="{LEATHER}" stroke-width="9"/>'
             f'<line x1="520" y1="10" x2="520" y2="-8" stroke="{BLUE}" stroke-width="6" stroke-linecap="round"/>'
             f'<g class="b-hand" style="{o(520, 10)}"><line x1="520" y1="10" x2="537" y2="10" stroke="{CORAL}" stroke-width="6" stroke-linecap="round"/></g>'
             f'<circle cx="520" cy="10" r="5" fill="{BRASS}"/>')
    far_horn = (f'<path d="{horn_path(500, 146, 50, 68, 170, 320, 7)}" fill="{BLUE}"/>'
                f'<path d="{horn_path(500, 146, 50, 68, 170, 320, 7)}" fill="none" stroke="{LEATHER}" stroke-width="6"/>')
    head = (f'<g class="b-head" style="{o(480, 200)}">'
            f'<g class="b-gear" style="{o(500, 146)}">{far_horn}</g>'
            f'<g class="b-gear" style="{o(520, 150)}">{horn}</g>{clock}'
            # the head: broad brow, long face sloping down to a wide muzzle
            f'<path d="M462 168 q40 -42 98 -20 q34 14 44 58 l18 70 q8 36 -22 44 q-34 8 -60 -10 q-30 -22 -52 -56 '
            f'q-30 -44 -26 -86z" fill="{LEATHER}" stroke="{SCREEN_HOT}" stroke-width="4"/>'
            # the ear: a leaf out to the side
            f'<path d="M470 176 q-62 -8 -84 26 q46 14 86 -8z" fill="{LEATHER}" stroke="{SCREEN_HOT}" stroke-width="4"/>'
            f'<path d="M462 186 q-36 -2 -54 14" stroke="{SCREEN_HOT}" stroke-width="5" fill="none" stroke-linecap="round"/>'
            # the happy closed eye, the nostril, the smile: cut out
            f'<path d="M518 184 q14 12 28 0" stroke="{SCREEN_HOT}" stroke-width="6" fill="none" stroke-linecap="round"/>'
            f'<ellipse cx="612" cy="270" rx="9" ry="6" fill="{SCREEN_HOT}" transform="rotate(30 612 270)"/>'
            f'<path d="M576 300 q20 10 36 -4" stroke="{SCREEN_HOT}" stroke-width="5" fill="none" stroke-linecap="round"/>'
            + _dots([(540, 222), (556, 246), (532, 250)], 5) + '</g>')
    scarf = (f'<path d="M444 176 q46 -6 72 46 l-24 22 q-24 -44 -62 -40z" fill="url(#pk)" stroke="{LEATHER}" stroke-width="5"/>'
             f'<path d="M478 236 l-10 78 l26 4 l10 -70z" fill="url(#pk)" stroke="{LEATHER}" stroke-width="5"/>')
    pins = ''.join(rivet_svg(x, y) for x, y in [(480, 200), (162, 300), (440, 300), (100, 212), (520, 150)])
    sticks = ''
    if rods:
        sticks = (f'<line x1="290" y1="240" x2="290" y2="700" stroke="{ROD}" stroke-width="9" stroke-linecap="round"/>'
                  f'<line x1="452" y1="470" x2="540" y2="700" stroke="{ROD}" stroke-width="6" stroke-linecap="round"/>')
    puppet = (f'<defs>{check}</defs>{sticks}'
              f'<g class="b-body" style="{o(290, 260)}">'
              f'{leg(186, 296, "b-legb", o(211, 300), True)}{leg(462, 296, "b-legf", o(487, 300), True)}'
              f'{tail}{body}{leg(138, 296, "b-legf", o(163, 300))}{leg(414, 296, "b-legb", o(439, 300))}'
              f'{head}{scarf}{pins}</g>')
    flip_t = 'transform:scaleX(-1);' if flip else ''
    return (f'<svg class="{"b-live" if live else ""}" width="{width:.0f}" height="{width * 780 / 660:.0f}" '
            f'viewBox="0 -60 660 780" style="overflow:visible;{flip_t}">{puppet}</svg>')


def rivet_svg(x, y, r=8):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BRASS}" stroke="{BRASS_DARK}" stroke-width="2.5"/>'
            f'<circle cx="{x - r * .3:.1f}" cy="{y - r * .3:.1f}" r="{r * .3:.1f}" fill="{CREAM}"/>')


# ---- tags, plaques ----

def tag(text, color, size=30, white=None):
    """A leather tag with a gel face, stitched with rivets at its ends."""
    light = luminous(color) if white is None else white
    return (f'<span style="display:inline-flex;align-items:center;gap:10px;background:{color};padding:5px 16px 8px;'
            f'font-size:{size}px;font-weight:700;border-radius:6px;border:3px solid {LEATHER};'
            f'box-shadow:4px 5px 0 rgba(29,19,14,.35);color:{CREAM if light else LEATHER}">'
            f'<i style="width:{size * .32:.0f}px;height:{size * .32:.0f}px;border-radius:50%;background:{BRASS};border:2px solid {BRASS_DARK};flex:none"></i>'
            f'{html.escape(text)}'
            f'<i style="width:{size * .32:.0f}px;height:{size * .32:.0f}px;border-radius:50%;background:{BRASS};border:2px solid {BRASS_DARK};flex:none"></i></span>')


def plaque(x, y, w, h, color, inner, delay=0.0, cls='pop', hang=160):
    """A leather plaque with a gel panel and a perforated rim, hanging on two rods `hang` px long."""
    rods = (rod(x + w * .2, y - hang, x + w * .2, y + 4) + rod(x + w * .8, y - hang, x + w * .8, y + 4)) if hang else ''
    rim = ''.join(f'<i style="position:absolute;left:{10 + k * 26}px;top:7px;width:10px;height:10px;border-radius:50%;background:{SCREEN_HOT}"></i>'
                  f'<i style="position:absolute;left:{10 + k * 26}px;bottom:7px;width:10px;height:10px;border-radius:50%;background:{SCREEN_HOT}"></i>'
                  for k in range(max(1, (w - 20) // 26)))
    return (f'<div class="{cls}" style="position:absolute;left:0;top:0;animation-delay:{delay:.2f}s">{rods}'
            f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{LEATHER};border-radius:14px;'
            f'box-shadow:10px 12px 0 rgba(29,19,14,.28)">{rim}'
            f'<div style="position:absolute;inset:24px 18px;background:{color};border-radius:8px;overflow:hidden">{inner}</div>'
            f'{rivet(18, 18, 8)}{"".join([])}</div>'
            f'{rivet(x + 18, y + 18, 8)}{rivet(x + w - 18, y + 18, 8)}{rivet(x + 18, y + h - 18, 8)}{rivet(x + w - 18, y + h - 18, 8)}</div>')


def frame():
    """The screen's frame: a perforated band on top, leather posts on the sides."""
    return (chalu_band(0, 0, W, 34, CORAL, 'bottom')
            + f'<div style="position:absolute;left:0;top:0;width:18px;height:{H}px;background:{LEATHER}"></div>'
            + f'<div style="position:absolute;right:0;top:0;width:18px;height:{H}px;background:{LEATHER}"></div>')


def doc(body, extra_css=''):
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head>'
            f'<body><div class="screen"></div><div class="stage">{body}{frame()}</div></body></html>')


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

BAND_Y = 912  # the caption band's top: windows end above it


def _transparent(body):
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:transparent}}</style></head>'
            f'<body>{body}</body></html>')


def backdrop(color, windows, labels=()):
    """The lit screen in its frame, the windows' leather mounts, puppets in wide margins, the caption band."""
    body = ''
    for (x, y, w, h) in windows:
        body += (f'<div style="position:absolute;left:{x + 16}px;top:{y + 18}px;width:{w}px;height:{h}px;background:rgba(29,19,14,.30);border-radius:14px"></div>'
                 f'<div style="position:absolute;left:{x - 7}px;top:{y - 7}px;width:{w + 14}px;height:{h + 14}px;background:{LEATHER};border-radius:14px"></div>')
    left = min(x for x, _, _, _ in windows)
    if left >= 300:
        # a wide margin on each side: the buffalo on the left, a gear tower on the right
        body += f'<div style="position:absolute;left:36px;top:250px">{buffalo(250, live=False)}</div>'
        gx = W - left + 40
        body += rod(gx + 120, 30, gx + 120, BAND_Y)
        for k, (size, gel, dy) in enumerate([(170, color, 150), (120, YELLOW, 330), (150, BLUE, 470), (110, CORAL, 640)]):
            body += f'<div style="position:absolute;left:{gx + 120 - size / 2:.0f}px;top:{dy}px">{gear_svg(size, gel, teeth=9 + k)}</div>'
    else:
        # narrow margins: perforated posts
        for px in (22, W - 22 - 56):
            body += (f'<div style="position:absolute;left:{px}px;top:60px;width:56px;height:{BAND_Y - 90}px;overflow:hidden;border-radius:8px">'
                     f'<div style="transform:rotate(90deg) translate(0,-56px);transform-origin:0 0;width:{BAND_Y - 90}px">'
                     f'{chalu_band(0, 0, BAND_Y - 90, 56, color, None)}</div></div>')
    # the labels over the frame's band, so it does not hide them
    over = ''.join(f'<div style="position:absolute;{f"right:{W - x}px" if right else f"left:{x}px"};top:{y}px">{tag(text, c, 22)}</div>'
                   for (x, y, text, c, right) in labels)
    # the caption band: leather, its top edge perforated
    body += (f'<div style="position:absolute;left:0;top:{BAND_Y + 22}px;width:{W}px;height:{H - BAND_Y}px;background:{LEATHER}"></div>'
             + chalu_band(0, BAND_Y - 4, W, 30, color, 'top'))
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>'
            f'<body><div class="screen"></div>{body}{frame()}{over}</body></html>')


def tape(windows):
    """What holds each window: a rod up to the frame from each top corner, brass rivets at the corners."""
    out = ''
    for (x, y, w, h) in windows:
        for tx in (x + 60, x + w - 60):
            out += rod(tx, 26, tx, y + 4, 8)
        for cx, cy in [(x, y), (x + w, y), (x, y + h), (x + w, y + h)]:
            out += rivet(cx, cy, 11)
        for tx in (x + 60, x + w - 60):
            out += rivet(tx, y, 8)
    return _transparent(out)


def caption(tag_text, text, color):
    """The caption's words on the leather band (the band itself is in the backdrop)."""
    body = (f'<div style="position:absolute;left:0;right:0;top:{BAND_Y + 30}px;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">'
            f'{tag(tag_text, color, 21)}'
            f'<div style="font-size:35px;font-weight:700;text-align:center;max-width:1720px;line-height:1.3;color:{CREAM}">{html.escape(text)}</div></div>')
    return _transparent(body)


def badge(text, color, top=10):
    body = f'<div style="position:absolute;left:0;right:0;top:{top}px;display:flex;justify-content:center">{tag(text, color, 26)}</div>'
    return _transparent(body)


def browser_bar(url, width, height):
    shown = url.split('://', 1)[-1]
    host, _, path = shown.partition('/')
    lights = ''.join(f'<span style="width:15px;height:15px;border-radius:50%;background:{c};display:inline-block"></span>'
                     for c in ['#FF5F57', '#FEBC2E', '#28C840'])
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:{LEATHER}}}</style></head><body>'
            f'<div style="width:{width}px;height:{height}px;border-radius:12px 12px 0 0;overflow:hidden;background:#EEF0F5;display:flex;align-items:center;gap:16px;padding:0 18px;border-bottom:2px solid #D5D9E3">'
            f'<div style="display:flex;gap:8px">{lights}</div>'
            f'<div style="flex:1;height:{height - 20}px;background:#fff;border:2px solid #CCD2DE;border-radius:{(height - 20) // 2}px;display:flex;align-items:center;padding:0 16px;font-size:{int(height * 0.42)}px;color:#5B6275">'
            f'<span style="color:{LEATHER};font-weight:600">{html.escape(host)}</span><span>/{html.escape(path)}</span></div></div></body></html>')


def terminal_bar(width, height, title):
    lights = ''.join(f'<span style="width:15px;height:15px;border-radius:50%;background:{c};display:inline-block"></span>'
                     for c in ['#FF5F57', '#FEBC2E', '#28C840'])
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}html,body{{background:{LEATHER}}}</style></head><body>'
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


def topbar(label, label_color, c):
    """The split scene's top strip: which run (or the fast-forward) and the factory's counts."""
    parts = [(label, label_color), (f'🐞 การ์ดบัค {c["found"]}', CORAL), (f'🔧 กำลังแก้ {c["doing"]}', YELLOW),
             (f'✅ Done {c["done"]}', GREEN)] + ([(f'👀 รอคนเช็ค {c["review"]}', PURPLE)] if c.get('review') else [])
    chips = ''.join(tag(t, col, 22) for t, col in parts)
    body = f'<div style="position:absolute;left:0;right:0;top:8px;display:flex;justify-content:center;gap:12px">{chips}</div>'
    return _transparent(body)


# ---- the cards ----

FACTORY_CSS = """
@keyframes belt{from{transform:translateX(0)}to{transform:translateX(var(--d))}}
.belt-card{position:absolute;animation:belt 2.4s linear infinite both}
"""


def machine(x, y, label, color, delay, k):
    """A cron job as a puppet machine: a plaque with two gears that turn against each other."""
    inner = (f'<div style="position:absolute;left:0;right:0;top:14px;display:flex;justify-content:center;gap:0">'
             f'<div style="margin-right:-18px">{gear_svg(130, CORAL if k else BLUE, "gear-spin", delay, 10)}</div>'
             f'<div style="margin-top:50px">{gear_svg(96, YELLOW, "gear-back", delay, 8)}</div></div>'
             f'<div style="position:absolute;left:14px;right:14px;bottom:14px;padding:6px 8px 10px;border-radius:6px;background:{LEATHER};'
             f'color:{CREAM};text-align:center;font-size:30px;font-weight:800;line-height:1.2">{label}</div>')
    return plaque(x, y, 300, 330, color, inner, delay, hang=80)


def belt(x0, x1, y, card_color, text, delay):
    """A leather belt from x0 to x1, perforated, with leather cards riding on it."""
    w = x1 - x0
    cards = ''
    for k in range(3):
        cards += (f'<div class="belt-card" style="left:-40px;top:-70px;--d:{w}px;animation-delay:{-k * 0.8 + delay:.2f}s">'
                  f'<div style="width:112px;height:64px;background:{card_color};border:4px solid {LEATHER};border-radius:8px;'
                  f'display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:800;color:{CREAM if luminous(card_color) else LEATHER}">{text}</div></div>')
    wheels = ''.join(f'<div style="position:absolute;left:{k}px;top:-14px">{gear_svg(72, BRASS, "gear-spin", delay, 8)}</div>' for k in (-36, w - 36))
    return (f'<div class="grow" style="position:absolute;left:{x0}px;top:{y}px;width:{w}px;height:44px;animation-delay:{delay:.2f}s">'
            f'<div style="position:absolute;inset:0;overflow:hidden;border-radius:22px">{chalu_band(0, 0, w, 44, card_color, None)}</div>{wheels}'
            f'<div style="position:absolute;left:0;right:0;top:0;height:0;overflow:visible;clip-path:inset(-200px 0 0 0)">{cards}</div></div>')


def factory(stats):
    body = plaque(470, 70, 980, 120, CORAL, '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
                  f'color:{CREAM};font-size:50px;font-weight:800">โรงงาน AI บนเครื่องของคุณ</div>', 0.1)
    body += machine(110, 290, 'Cron<br>หาบัค', TEAL, 0.35, 0)
    body += belt(430, 780, 560, CORAL, 'บัค', 0.6)
    body += machine(800, 290, 'Cron<br>แก้บัค', YELLOW, 0.55, 1)
    body += belt(1120, 1450, 560, GREEN, '✓ Done', 0.8)
    extra = f'+{stats["review"]} ส่งให้คนเช็ค' if stats['review'] else f'+{stats["human"]} รอคนตัดสินใจ'
    body += plaque(1470, 360, 330, 250, GREEN,
                   f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:{CREAM}">'
                   f'<div style="font-size:78px;font-weight:800;line-height:1">{stats["fixed"]} Done</div>'
                   f'<div style="margin-top:14px;padding:5px 16px 8px;border-radius:6px;background:{LEATHER};font-size:26px;font-weight:800">{extra}</div></div>', 0.75, hang=150)
    # the buffalo walks along below, as if it ran the factory
    body += f'<div style="position:absolute;left:40px;top:610px">{buffalo(300, live=True)}</div>'
    facts = [(f'AI เปิดการ์ดบัค {stats["cards"]} ใบ', CORAL), (f'แก้ + commit {stats.get("commits", stats["fixed"])} ใบ', GREEN),
             (f'{stats["runs"]} รอบ ใน {stats["minutes"]:g} นาที', BLUE), (f'${stats["cost"]:.3f} (haiku)', YELLOW),
             ('ไม่มีใครกดอะไรเลย', PINK)]
    row = ''.join(f'<div class="pop" style="animation-delay:{1.0 + k * 0.14:.2f}s;white-space:nowrap">{tag(t, c, 30)}</div>'
                  for k, (t, c) in enumerate(facts))
    body += f'<div style="position:absolute;left:330px;right:40px;top:760px;display:flex;flex-wrap:wrap;justify-content:center;gap:18px 22px">{row}</div>'
    return doc(body, FACTORY_CSS), 5.0, [0.1, 0.35, 0.55, 0.75] + [1.0 + k * 0.14 for k in range(len(facts))]


def end_card():
    body = f'<div class="pop" style="position:absolute;left:150px;top:150px;animation-delay:.2s">{buffalo(460, live=True)}</div>'
    body += plaque(760, 170, 1000, 190, CORAL, '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
                   f'color:{CREAM};font-size:104px;font-weight:800;letter-spacing:.05em">KAMMACRON</div>', 0.45)
    body += (f'<div class="pop" style="position:absolute;left:760px;top:420px;width:1000px;animation-delay:.7s;text-align:center;'
             f'font-size:36px;font-weight:700;line-height:1.35">Kanban + Cron Job ให้ Claude หรือ Codex<br>หาบัคเอง แก้เอง บนเครื่องคุณ</div>')
    body += (f'<div class="pop" style="position:absolute;left:0;top:590px;width:{W}px;padding-left:760px;width:1760px;display:flex;justify-content:center;animation-delay:.95s">'
             f'<span style="display:inline-block;background:{LEATHER};color:#7EE08A;font-family:{MONO};font-size:42px;padding:16px 36px;border-radius:14px;'
             f'box-shadow:8px 10px 0 rgba(29,19,14,.28)">$ bunx kammacron start</span></div>')
    body += (f'<div class="pop" style="position:absolute;left:760px;top:730px;width:1000px;display:flex;justify-content:center;animation-delay:1.15s">'
             f'{tag("kammacron.pages.dev", PURPLE, 34)}</div>')
    return doc(body), 4.6, [0.2, 0.45, 0.7, 0.95, 1.15]
