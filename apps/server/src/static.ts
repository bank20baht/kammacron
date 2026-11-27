import { join, normalize, resolve, sep } from 'node:path'

import { Elysia } from 'elysia'

const RESERVED = /^\/(api|mcp|live|files|openapi)(\/|$)/
/**
 * A file the build named by its content (`main-L7F2M64O.js`, `chunk-B-9Iq97L.js`, a font's
 * `-USE2SQXJ.woff2`): a new build writes a new name, so the browser may keep this one for good.
 */
const HASHED = /-[\w-]{8}\.(js|css|woff2?)$/

/**
 * The built Angular app, from `webDir`: a file when one matches, `index.html` for any other path
 * (the router's deep links). `index.html` is never cached, so a new version shows on reload.
 */
export const staticRoutes = (webDir: string | null) => {
  const app = new Elysia({ name: 'kammacron-static' })
  if (!webDir) return app
  const root = resolve(webDir)
  const indexPath = join(root, 'index.html')
  return app.get(
    '/*',
    async ({ request }) => {
      const { pathname } = new URL(request.url)
      if (RESERVED.test(pathname))
        return Response.json({ code: 'NOT_FOUND', message: 'no such route' }, { status: 404 })
      const target = normalize(join(root, decodeURIComponent(pathname)))
      if (target.startsWith(root + sep) && !target.endsWith(sep)) {
        const file = Bun.file(target)
        if (await file.exists())
          return new Response(file, {
            headers: {
              'cache-control': HASHED.test(target)
                ? 'public, max-age=31536000, immutable'
                : 'no-cache',
            },
          })
      }
      // a fresh handle each time: one kept from startup keeps the old size, and a rebuilt,
      // longer index.html would be served cut short (a blank page)
      const index = Bun.file(indexPath)
      if (!(await index.exists())) return new Response('web app not built', { status: 404 })
      return new Response(await index.arrayBuffer(), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
      })
    },
    { detail: { hide: true } },
  )
}
