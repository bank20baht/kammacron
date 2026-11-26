// kammacron's service worker: what makes the web app installable (a Dock or taskbar shortcut).
// It caches nothing, so a new version always shows on reload. When the server is not running,
// opening a page answers with a short note on how to start it, not the browser's error page.

const OFFLINE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>kammacron is not running</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #ebebe8; color: #1d1d1f; }
      @media (prefers-color-scheme: dark) { body { background: #18181a; color: #ededed; } }
      main { max-width: 28rem; padding: 2rem; text-align: center; }
      img { width: 96px; height: 96px; }
      code { display: inline-block; padding: 0.4rem 0.7rem; border-radius: 6px; background: rgba(127, 127, 127, 0.18); }
      button { margin-top: 1.25rem; padding: 0.5rem 1.1rem; border: 0; border-radius: 6px; background: #2346c8; color: #fff; font: inherit; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <img src="/icon-192.png" alt="" />
      <h1>kammacron is not running</h1>
      <p>Start it on this machine, then try again:</p>
      <p><code>kammacron start</code></p>
      <button onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`

self.addEventListener('install', (event) => {
  // the note's picture, for when the server is gone
  event.waitUntil(caches.open('kammacron-offline').then((cache) => cache.add('/icon-192.png')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      ),
    )
  } else if (new URL(request.url).pathname === '/icon-192.png') {
    event.respondWith(fetch(request).catch(() => caches.match('/icon-192.png')))
  }
})
