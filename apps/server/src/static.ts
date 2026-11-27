import { join, normalize, resolve, sep } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

import { Elysia } from 'elysia'

const RESERVED = /^\/(api|mcp|live|files|openapi)(\/|$)/
/**
 * A file the build named by its content (`main-L7F2M64O.js`, `chunk-B-9Iq97L.js`, a font's
 * `-USE2SQXJ.woff2`): a new build writes a new name, so the browser may keep this one for good.
 */
const HASHED = /-[\w-]{8}\.(js|css|woff2?)$/
/** Text worth compressing; images and fonts are compressed already. */
const TEXT = /\.(js|css|html|json|svg|webmanifest|txt)$/
/** Smaller than this, compressing saves less than the headers it adds. */
const MIN_BYTES = 1024

type Packed = { body: Uint8Array<ArrayBuffer>; encoding: 'br' | 'gzip' }

/**
 * Brotli or gzip, whichever the browser takes, made once a file (and again when it changes) and
 * kept: the web app is a few hundred KB of text that shrinks to a quarter, which a person on a
 * tunnel feels; on this machine it costs a lookup.
 */
const packer = () => {
  const kept = new Map<string, Packed>()
  return async (path: string, file: Bun.BunFile, accept: string): Promise<Packed | null> => {
    const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
    if (!encoding || !TEXT.test(path) || file.size < MIN_BYTES) return null
    const key = `${encoding}:${path}:${String(file.size)}:${String(file.lastModified)}`
    const hit = kept.get(key)
    if (hit) return hit
    const raw = new Uint8Array(await file.arrayBuffer())
    const body =
      encoding === 'br'
        ? Uint8Array.from(
            brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
          )
        : Bun.gzipSync(raw, { level: 9 })
    for (const old of kept.keys()) if (old.startsWith(`${encoding}:${path}:`)) kept.delete(old)
    const packed = { body, encoding } satisfies Packed
    kept.set(key, packed)
    return packed
  }
}

/**
 * The built Angular app, from `webDir`: a file when one matches, `index.html` for any other path
 * (the router's deep links). `index.html` is never cached, so a new version shows on reload.
 * Text goes out compressed when the browser takes it.
 */
export const staticRoutes = (webDir: string | null) => {
  const app = new Elysia({ name: 'kammacron-static' })
  if (!webDir) return app
  const root = resolve(webDir)
  const indexPath = join(root, 'index.html')
  const pack = packer()
  return app.get(
    '/*',
    async ({ request }) => {
      const { pathname } = new URL(request.url)
      if (RESERVED.test(pathname))
        return Response.json({ code: 'NOT_FOUND', message: 'no such route' }, { status: 404 })
      const accept = request.headers.get('accept-encoding') ?? ''
      const target = normalize(join(root, decodeURIComponent(pathname)))
      if (target.startsWith(root + sep) && !target.endsWith(sep)) {
        const file = Bun.file(target)
        if (await file.exists()) {
          const headers: Record<string, string> = {
            'cache-control': HASHED.test(target)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
            vary: 'accept-encoding',
          }
          const packed = await pack(target, file, accept)
          if (!packed) return new Response(file, { headers })
          return new Response(packed.body, {
            headers: { ...headers, 'content-type': file.type, 'content-encoding': packed.encoding },
          })
        }
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
