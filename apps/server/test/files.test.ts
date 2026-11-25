import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { purgeOrphans } from '../src/services/attachments'
import { must, testApp, type TestApp } from './helpers'

// the smallest valid PNG: 1x1, transparent
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

let t: TestApp
beforeEach(async () => {
  t = await testApp()
})
afterEach(() => t.close())

type Uploaded = { id: string; mime: string; url: string; markdown: string }

const uploadMultipart = (bytes: Uint8Array<ArrayBuffer>, name: string) => {
  const form = new FormData()
  form.append('file', new File([bytes], name, { type: 'image/svg+xml' })) // the claimed type is ignored
  return t.app.handle(
    new Request('http://localhost/api/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${t.ctx.auth.apiToken}` },
      body: form,
    }),
  )
}

describe('attachments', () => {
  test('keeps a PNG told by its bytes and serves it back guarded, with safe headers', async () => {
    const response = await uploadMultipart(PNG, 'shot.png')
    expect(response.status).toBe(200)
    const file = (await response.json()) as Uploaded
    expect(file.mime).toBe('image/png')
    expect(file.markdown).toBe(`![shot.png](/files/${file.id})`)

    const anonymous = await t.app.handle(new Request(`http://localhost${file.url}`))
    expect(anonymous.status).toBe(401)
    const served = await t.call('GET', file.url)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(served.headers.get('content-security-policy')).toContain('sandbox')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array(PNG))
  })

  test('refuses an SVG or anything that is not one of the four image types', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    const response = await uploadMultipart(svg, 'x.png')
    expect(response.status).toBe(422)
    expect(((await response.json()) as { code: string }).code).toBe('UNSUPPORTED_TYPE')
  })

  test('base64 upload (the MCP tool); a card linking it owns it, and get_card lists it', async () => {
    const file = await t.json<Uploaded>('POST', '/api/files/base64', {
      filename: 'bug.png',
      data: PNG.toString('base64'),
    })
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    const [card] = await t.json<{ id: number }[]>('POST', '/api/cards/batch', {
      cards: [{ project_id: project.id, title: 'broken button', body: `see ${file.markdown}` }],
    })
    const full = await t.json<{ attachments: { id: string }[] }>(
      'GET',
      `/api/cards/${String(must(card).id)}`,
    )
    expect(full.attachments.map((a) => a.id)).toEqual([file.id])
  })

  test('purges files nobody linked once they are old enough', async () => {
    const linked = await t.json<Uploaded>('POST', '/api/files/base64', {
      filename: 'a.png',
      data: PNG.toString('base64'),
    })
    const orphan = await t.json<Uploaded>('POST', '/api/files/base64', {
      filename: 'b.png',
      data: PNG.toString('base64'),
    })
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    await t.json('POST', '/api/cards/batch', {
      cards: [{ project_id: project.id, title: 'x', body: linked.markdown }],
    })

    expect(await purgeOrphans(t.ctx.db, t.ctx.filesDir, 0)).toBe(1)
    expect((await t.call('GET', orphan.url)).status).toBe(404)
    // the same bytes are still held by the linked row, so they stay on disk
    expect((await t.call('GET', linked.url)).status).toBe(200)
  })
})
