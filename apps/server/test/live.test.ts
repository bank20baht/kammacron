import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { testApp, type TestApp } from './helpers'

let t: TestApp
beforeEach(async () => {
  t = await testApp()
})
afterEach(() => t.close())

type Frame = { type: string; id?: string; data?: unknown; rows?: unknown; reason?: string }

/** Reads `data:` frames of an SSE body until `until` says stop (or the time runs out). */
const readFrames = async (response: Response, until: (frames: Frame[]) => boolean, ms = 4000) => {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  const frames: Frame[] = []
  let buffer = ''
  const deadline = Date.now() + ms
  while (Date.now() < deadline && !until(frames)) {
    const chunk = await Promise.race([
      reader.read(),
      Bun.sleep(Math.max(0, deadline - Date.now())).then(() => null),
    ])
    if (!chunk || chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const lines = event.split('\n')
      const type = lines
        .find((l) => l.startsWith('event:'))
        ?.slice(6)
        .trim()
      const data = lines.find((l) => l.startsWith('data:'))?.slice(5)
      if (type && data) frames.push({ ...(JSON.parse(data) as object), type })
    }
  }
  await reader.cancel()
  return frames
}

describe('live', () => {
  test('a board subscription gets a snapshot, then the card created after it', async () => {
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    const stream = await t.call('POST', '/live', {
      subscriptions: [{ id: 'board', method: 'GET', path: '/api/cards' }],
    })
    expect(stream.status).toBe(200)
    const framesP = readFrames(
      stream,
      (frames) => frames.filter((f) => f.type !== 'unchanged').length >= 2,
    )
    await Bun.sleep(300)
    await t.json('POST', '/api/cards/batch', {
      cards: [{ project_id: project.id, title: 'appears live' }],
    })
    const frames = await framesP
    const types = frames.map((f) => f.type)
    expect(types[0]).toBe('snapshot')
    expect(types.slice(1).some((type) => type === 'patch' || type === 'snapshot')).toBe(true)
    expect(JSON.stringify(frames.at(-1))).toContain('appears live')
  })

  test("a run's new event arrives as a patch of that event, not the whole run", async () => {
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    const { addRunEvent, createRun } = await import('../src/services/runs')
    const run = await createRun(t.ctx.db, { project_id: project.id, card_id: null, log_path: null })
    for (let seq = 1; seq <= 30; seq++)
      await addRunEvent(t.ctx.db, run.id, seq, { type: 'assistant', summary: 'old', data: null })
    const stream = await t.call('POST', '/live', {
      subscriptions: [{ id: 'run', method: 'GET', path: `/api/runs/${String(run.id)}` }],
    })
    const framesP = readFrames(stream, (frames) => frames.some((f) => f.type === 'patch'))
    await Bun.sleep(300)
    await addRunEvent(t.ctx.db, run.id, 31, { type: 'assistant', summary: 'new line', data: null })
    const frames = await framesP
    expect(frames[0]?.type).toBe('snapshot')
    const patch = frames.find((f) => f.type === 'patch')
    const text = JSON.stringify(patch)
    expect(text).toContain('new line')
    expect(text).not.toContain('"old"')
    expect(text).toContain('"events_total":31')
  })

  test('a stream without the token is refused', async () => {
    const response = await t.app.handle(
      new Request('http://localhost/live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriptions: [] }),
      }),
    )
    expect(response.status).toBe(401)
  })
})
