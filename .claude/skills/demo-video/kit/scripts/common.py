"""Shared bits of the demo scripts: the work dir, the API, signing a browser in, a visible cursor."""
import json, os, urllib.request

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the work dir setup.sh made
PORT = int(os.environ.get('DEMO_PORT', '7431'))
BASE = f'http://127.0.0.1:{PORT}'


def token():
    return json.load(open(os.path.join(SP, 'data', 'secrets.json')))['api_token']


def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'authorization': 'Bearer ' + token(), 'content-type': 'application/json'},
    )
    with urllib.request.urlopen(req) as r:
        text = r.read().decode()
        return json.loads(text) if text else None


def sign_in(page):
    """A one-time code, as `kammacron open` does."""
    code = api('POST', '/api/session/code')['code']
    page.goto(f'{BASE}/login#code={code}')
    page.wait_for_url(lambda u: '/login' not in u, timeout=15000)


# a cursor the recording can see (headless Chromium draws none), and a ring on each click
CURSOR_JS = r"""
(() => {
  if (window.__cursor) return
  const c = document.createElement('div')
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);transition:none'
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l14 10-6.5 1.2L15 20l-3 1.4-3.3-6.9L4 18z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  const add = () => document.documentElement.appendChild(c)
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add)
  window.__cursor = c
  document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div')
    r.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #e8743b;z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out`
    document.documentElement.appendChild(r)
    requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0' })
    setTimeout(() => r.remove(), 500)
  }, true)
})()
"""
