"""
Records the web scenes of the "AI factory" demo against the real app, one video per scene, and
writes when each moment happened (seconds from the scene's start), the URL the page showed, and
the board's card counts over time to clips/marks.json.

  python3 record.py hunt_setup hunt fix_setup fix

- hunt_setup / fix_setup: the Cron jobs page, a Claude cron job (`* * * * *`) is added
- hunt / fix: the board (left) and Runs (right) side by side through that job's runs; the job is
  turned off when its runs are shown
"""
import json, os, shutil, sys, time

sys.path.insert(0, os.path.dirname(__file__))
from common import BASE, CURSOR_JS, SP, api, sign_in
from playwright.sync_api import sync_playwright

CLIPS = os.path.join(SP, 'clips')
MARKS = os.path.join(CLIPS, 'marks.json')
STATE = os.path.join(SP, 'state.json')
VIEW = {'width': 1440, 'height': 900}
# the split windows: laid out at 1150 wide, recorded at 0.8 so the text stays readable when shown
SPLIT_VIEW = {'width': 1150, 'height': 1075}
SPLIT_SIZE = {'width': 920, 'height': 860}

# the two cron jobs: what they are called and what they are told
HUNT = {
    'name': 'หาบัคในโปรเจกต์',
    'prompt': 'อ่านโค้ดทั้งโปรเจกต์ หาบัคหรือจุดที่ผิด แล้วสร้างการ์ดใบละเรื่อง ติดแท็ก auto-pilot '
              'บอกไฟล์และวิธีแก้สั้น ๆ ห้ามแก้โค้ดเอง และห้ามสร้างซ้ำกับการ์ดที่มีอยู่',
}
FIX = {
    'name': 'แก้บัคทีละใบ',
    'prompt': 'หยิบการ์ด auto pilot หนึ่งใบมาทำ แล้วบันทึกผลลงการ์ด',
}
MAX_FIX_RUNS = 5

marks = json.load(open(MARKS)) if os.path.exists(MARKS) else {}


class Scene:
    """One recorded browser context; `mark()` notes a moment, `done()` saves the video."""

    def __init__(self, browser, name, viewport=VIEW, size=VIEW):
        self.name = name
        self.ctx = browser.new_context(
            viewport=viewport, record_video_dir=os.path.join(CLIPS, 'raw'), record_video_size=size,
            storage_state=STATE, device_scale_factor=1,
        )
        self.ctx.add_init_script(CURSOR_JS)
        self.page = self.ctx.new_page()
        self.t0 = time.time()
        self.pos = (720, 450)
        self.marks = {}
        # every address the page shows, with when: the video's address bar follows it
        self.urls = []
        self.page.on('framenavigated', lambda f: f == self.page.main_frame and self.note_url(f.url))

    def note_url(self, url):
        t = round(time.time() - self.t0, 2)
        if not self.urls or self.urls[-1][1] != url:
            self.urls.append([t, url])

    def mark(self, key):
        self.marks[key] = round(time.time() - self.t0, 2)
        print(f'  {self.name}.{key} = {self.marks[key]}')

    def wait(self, ms):
        # in steps, so a router's pushState (no navigation event) is still seen
        end = time.time() + ms / 1000
        while True:
            left = end - time.time()
            if left <= 0:
                break
            self.page.wait_for_timeout(min(250, left * 1000))
            if not self.page.is_closed():
                self.note_url(self.page.url)

    def go(self, path):
        self.page.goto(BASE + path)
        # live pages hold a stream open, so never "networkidle": wait for the page's heading
        self.page.locator('h1').first.wait_for(timeout=15000)
        self.wait(700)
        self.page.mouse.move(*self.pos)

    def move_to(self, locator, steps=28):
        locator.scroll_into_view_if_needed()
        box = locator.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        self.page.mouse.move(x, y, steps=steps)
        self.pos = (x, y)
        self.wait(180)

    def click(self, locator, pause=450):
        self.move_to(locator)
        self.page.mouse.down()
        self.page.mouse.up()
        self.wait(pause)

    def type(self, locator, text, delay=55):
        self.click(locator, 250)
        self.page.keyboard.type(text, delay=delay)
        self.wait(300)

    def done(self):
        video = self.page.video
        self.ctx.close()
        shutil.move(video.path(), os.path.join(CLIPS, self.name + '.webm'))
        marks[self.name] = {**marks.get(self.name, {}), **self.marks, 'urls': self.urls}
        json.dump(marks, open(MARKS, 'w'), indent=1)


def field(form, key):
    """A <baht-form> field by its key: its control's id is `baht-<key>-<n>` (labels carry a `*`)."""
    return form.locator(f'[id^="baht-{key}-"]:not(label)').first


DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']


def day_chip(page, day):
    """A day of the When field (`<baht-schedule>`), by cron's number: 1 = Monday … 0 = Sunday."""
    return page.locator('baht-schedule').get_by_role('button', name=DAY_NAMES[day]).first


def schedule_card(page, mode):
    """One of the When field's cards: interval, hourly, date or cron."""
    return page.locator('baht-schedule label.baht-choice', has=page.locator(f'input[value="{mode}"]')).first


def scroll_bottom(page):
    """The page scrolls inside the shell (`scroll="main"`), not the window."""
    page.evaluate("""() => {
      const m = document.querySelector('.baht-shell-main') || document.scrollingElement
      m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' })
    }""")


def schedule_scene(b, name, job, first):
    """The Cron jobs page: Add cron job, then the wizard's three steps (who, the task, when)."""
    s = Scene(b, name)
    s.go('/cron')
    s.mark('start')
    s.wait(900)
    s.click(s.page.get_by_role('button', name='Add cron job'), 900)
    wizard = s.page.locator('web-cron-wizard')
    # step 1, What: Claude does it (no template: the prompt is the job's own)
    s.click(wizard.locator('label', has=s.page.locator('input[value="claude"]')).first, 600)
    s.click(wizard.get_by_role('button', name='Next'), 700)
    # step 2, The task: the prompt; Use the Kanban board is on; the model under More options
    s.mark('prompt')
    s.type(field(wizard, 'prompt'), job['prompt'], delay=14)
    s.wait(400)
    s.move_to(s.page.get_by_text('Use the Kanban board', exact=True))
    s.wait(700)
    s.click(wizard.get_by_text('More options: model and agent'), 600)
    s.click(wizard.locator('label', has=s.page.locator('input[value="haiku"]')).first, 600)
    s.click(wizard.get_by_role('button', name='Next'), 700)
    # step 3, When
    if first:
        # the alarm-clock way, once: Days and time, Tuesday and Thursday ("Runs on Tue and Thu")
        s.click(schedule_card(s.page, 'date'), 600)
        for day in (2, 4, 1):
            s.click(day_chip(s.page, day), 600)
        s.wait(700)
    # every minute, for the demo (every few minutes stops at 5): the Cron card, typed in
    s.click(schedule_card(s.page, 'cron'), 700)
    s.mark('cron')
    # the five boxes, as a one-time code: empty them, then type; a space moves to the next box
    boxes = s.page.locator('baht-schedule baht-cron input')
    for i in range(5):
        boxes.nth(i).fill('')
    s.type(boxes.first, '* * * * *', delay=90)
    # the name the wizard filled in from the prompt, replaced by the job's
    field(wizard, 'name').fill('')
    s.type(field(wizard, 'name'), job['name'], delay=25)
    s.wait(500)
    s.click(wizard.get_by_role('button', name='Add cron job'), 600)
    s.mark('added')
    s.wait(1800)
    s.done()


def counts():
    cards = api('GET', '/api/cards?project_id=1')
    pilot = [c for c in cards if 'auto-pilot' in c['tags']]
    return {
        'found': len(pilot),
        'todo': sum(c['status'] == 'todo' for c in pilot),
        'doing': sum(c['status'] == 'doing' for c in pilot),
        'done': sum(c['status'] == 'done' for c in pilot),
    }


def split_scene(b, name, job, runs_max, stop):
    """The board and Runs side by side, through the job's runs, until `stop()` or runs_max."""
    left = Scene(b, name + '_left', SPLIT_VIEW, SPLIT_SIZE)
    right = Scene(b, name + '_right', SPLIT_VIEW, SPLIT_SIZE)
    right.t0 = left.t0  # one clock for both, so the two videos line up
    # Runs has its navigator folded from the start; the board folds its own on screen, once
    nav = lambda hidden: f"try {{ localStorage.setItem('kammacron.nav-hidden', '{hidden}') }} catch (e) {{}}"
    right.ctx.add_init_script(nav('1'))
    left.ctx.add_init_script(nav('0' if name == 'hunt' else '1'))
    left.go('/board/shop')
    right.go('/runs')
    if name == 'hunt':
        left.wait(600)
        left.click(left.page.get_by_role('button', name='Hide the navigator'), 900)
        left.mark('folded')
    tally = []

    def note():
        c = counts()
        if not tally or {k: v for k, v in tally[-1].items() if k != 't'} != c:
            tally.append({'t': round(time.time() - left.t0, 2), **c})

    def both(key):
        left.mark(key)
        right.mark(key)

    def idle(ms):
        end = time.time() + ms / 1000
        while time.time() < end:
            left.wait(300)
            note()

    both('start')
    note()
    seen, n = set(), 0
    for n in range(1, runs_max + 1):
        if stop():
            n -= 1
            break
        run_id = None
        while not run_id:
            running = [r for r in api('GET', '/api/status')['running'] if r['run_id'] not in seen]
            run_id = running[0]['run_id'] if running else None
            if not run_id:
                idle(400)
        seen.add(run_id)
        both(f'run{n}_start')
        right.wait(900)
        row = right.page.locator(f'a[href="/runs/{run_id}"]')
        if not row.count():
            row = right.page.get_by_text(job['name'])
        right.click(row.first, 700)
        if f'/runs/{run_id}' not in right.page.url:
            right.go(f'/runs/{run_id}')
        right.click(right.page.locator('baht-tabs button[data-key="events"]').first, 400)
        both(f'run{n}_open')
        while api('GET', f'/api/runs/{run_id}')['status'] == 'running':
            scroll_bottom(right.page)
            right.wait(900)
            note()
        both(f'run{n}_end')
        idle(2000)
        if n < runs_max and not stop():
            right.click(right.page.get_by_role('link', name='Runs').first, 600)
    # this job's work is shown: it stops here (no more runs, no more cost)
    for sched in api('GET', '/api/projects/1/schedules'):
        if sched['name'] == job['name']:
            api('PATCH', f'/api/schedules/{sched["id"]}', {'enabled': False})
    idle(1200)
    both('end')
    left.done()
    right.done()
    marks[name] = {**left.marks, 'runs': n, 'tally': tally}
    json.dump(marks, open(MARKS, 'w'), indent=1)


def main():
    os.makedirs(CLIPS, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        if not os.path.exists(STATE):
            ctx = b.new_context(viewport=VIEW)
            page = ctx.new_page()
            sign_in(page)
            ctx.storage_state(path=STATE)
            ctx.close()
        for name in sys.argv[1:]:
            if name == 'hunt_setup':
                schedule_scene(b, 'hunt_setup', HUNT, True)
            elif name == 'hunt':
                split_scene(b, 'hunt', HUNT, 1, lambda: False)
            elif name == 'fix_setup':
                schedule_scene(b, 'fix_setup', FIX, False)
            elif name == 'fix':
                # a card a person holds stays in todo: stop when nothing an agent may take is left
                ready = lambda: [c for c in api('GET', '/api/cards?project_id=1')
                                 if 'auto-pilot' in c['tags'] and c['status'] == 'todo' and not c['human']]
                split_scene(b, 'fix', FIX, MAX_FIX_RUNS, lambda: not ready())
        b.close()


if __name__ == '__main__':
    main()
