import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { claimCard, pickableCards } from '../src/services/cards'
import { must, testApp, type TestApp } from './helpers'

type Card = {
  id: number
  status: string
  title: string
  review_reason: string | null
}

let t: TestApp
let projectId: number

beforeEach(async () => {
  t = await testApp()
  const project = await t.json<{ id: number }>('POST', '/api/projects', {
    slug: 'demo',
    name: 'Demo',
  })
  projectId = project.id
})
afterEach(() => t.close())

const create = (cards: unknown[]) => t.json<Card[]>('POST', '/api/cards/batch', { cards })

describe('auth', () => {
  test('refuses /api without the token, and a foreign Host or Origin', async () => {
    const bare = await t.app.handle(new Request('http://localhost/api/cards'))
    expect(bare.status).toBe(401)

    const wrong = await t.call('GET', '/api/cards', undefined, { authorization: 'Bearer nope' })
    expect(wrong.status).toBe(401)

    const rebinding = await t.call('GET', '/api/cards', undefined, { host: 'evil.example' })
    expect(rebinding.status).toBe(421)

    const csrf = await t.call(
      'POST',
      '/api/cards/batch',
      { cards: [] },
      { origin: 'https://evil.example' },
    )
    expect(csrf.status).toBe(403)
  })

  test('being on this machine opens nothing: a session takes the token or a one-time code', async () => {
    const bare = await t.app.handle(new Request('http://localhost/api/session'))
    expect(bare.status).toBe(401)
    expect(bare.headers.get('set-cookie')).toBeNull()

    const { code } = await t.json<{ code: string }>('POST', '/api/session/code')
    const open = () =>
      t.app.handle(
        new Request('http://localhost/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        }),
      )
    const session = await open()
    expect(session.status).toBe(200)
    expect(session.headers.get('set-cookie')).toContain('HttpOnly')
    expect((await open()).status).toBe(401) // once only
    const cookie = must(must(session.headers.get('set-cookie')).split(';')[0])
    for (const path of ['/api/cards', '/api/session'])
      expect(
        (await t.app.handle(new Request(`http://localhost${path}`, { headers: { cookie } })))
          .status,
      ).toBe(200)
  })

  test('another port or a sandboxed frame cannot write with the cookie', async () => {
    const post = (origin: string) =>
      t.call('POST', '/api/token/rotate', undefined, { origin, host: 'localhost:7420' })
    expect((await post('http://localhost:3000')).status).toBe(403)
    expect((await post('null')).status).toBe(403)
    expect((await post('http://localhost:7420')).status).toBe(200)
  })

  test('rotating the token stops the old one', async () => {
    const old = t.ctx.auth.apiToken
    await t.json('POST', '/api/token/rotate')
    const stale = await t.call('GET', '/api/cards', undefined, { authorization: `Bearer ${old}` })
    expect(stale.status).toBe(401)
    expect((await t.call('GET', '/api/cards')).status).toBe(200)
  })
})

describe('cards', () => {
  test('a batch can wait on its own cards by ref; get_card shows the edge', async () => {
    const [small, big] = await create([
      { ref: 'small', project_id: projectId, title: 'fix the typo', tags: ['auto-pilot'] },
      { project_id: projectId, title: 'redesign', human: true, waits_on: ['small'] },
    ])
    const full = await t.json<{ waits_on: { id: number }[] }>(
      'GET',
      `/api/cards/${String(must(big).id)}`,
    )
    expect(full.waits_on.map((w) => w.id)).toEqual([must(small).id])
  })

  test('refuses a waits_on loop', async () => {
    const [a, b] = await create([
      { ref: 'a', project_id: projectId, title: 'a' },
      { project_id: projectId, title: 'b', waits_on: ['a'] },
    ])
    const loop = await t.call('PATCH', `/api/cards/${String(must(a).id)}`, {
      waits_on: [must(b).id],
    })
    expect(loop.status).toBe(422)
    expect(((await loop.json()) as { code: string }).code).toBe('WAITS_ON_CYCLE')
  })

  test('moving to review needs a reason, and leaving review clears it', async () => {
    const [card] = await create([{ project_id: projectId, title: 'x' }])
    const path = `/api/cards/${String(must(card).id)}/move`
    expect((await t.call('POST', path, { status: 'review' })).status).toBe(422)
    const inReview = await t.json<Card>('POST', path, {
      status: 'review',
      reason: 'pre-push failed',
    })
    expect(inReview.review_reason).toBe('pre-push failed')
    const back = await t.json<Card>('POST', `/api/cards/${String(must(card).id)}/send-back`, {
      comment: 'try again',
    })
    expect(back.status).toBe('todo')
    expect(back.review_reason).toBeNull()
  })

  test('an Idempotency-Key retry creates the cards once', async () => {
    const send = () =>
      t.call(
        'POST',
        '/api/cards/batch',
        { cards: [{ project_id: projectId, title: 'once' }] },
        { 'idempotency-key': 'k1' },
      )
    const first = await send()
    const again = await send()
    expect(again.headers.get('idempotent-replayed')).toBe('true')
    expect(await again.json()).toEqual(await first.json())
    const all = await t.json<Card[]>('GET', '/api/cards?q=once')
    expect(all).toHaveLength(1)
  })

  test('search by text, tag and status', async () => {
    await create([
      { project_id: projectId, title: 'login bug', tags: ['auto-pilot'] },
      { project_id: projectId, title: 'docs', body: 'mentions a BUG here' },
      { project_id: projectId, title: 'other' },
    ])
    expect(await t.json<Card[]>('GET', '/api/cards?q=bug')).toHaveLength(2)
    expect(await t.json<Card[]>('GET', '/api/cards?tag=auto-pilot')).toHaveLength(1)
    expect(await t.json<Card[]>('GET', '/api/cards?status=done')).toHaveLength(0)
  })
})

describe('worker selection', () => {
  test('picks auto-pilot cards that wait on nothing unfinished, by priority then age; one claimer wins', async () => {
    await t.json('PATCH', `/api/projects/${String(projectId)}`, {
      worker_enabled: true,
      repo_path: '/tmp/x',
    })
    const [dep, blocked, low, high] = await create([
      { ref: 'dep', project_id: projectId, title: 'dep', tags: ['auto-pilot'] },
      {
        project_id: projectId,
        title: 'blocked',
        tags: ['auto-pilot'],
        waits_on: ['dep'],
        priority: 9,
      },
      { project_id: projectId, title: 'low', tags: ['auto-pilot'], priority: 1 },
      { project_id: projectId, title: 'high', tags: ['auto-pilot'], priority: 5 },
      { project_id: projectId, title: 'human', tags: ['auto-pilot'], human: true, priority: 99 },
      { project_id: projectId, title: 'untagged', priority: 99 },
    ])
    const picked = await pickableCards(t.ctx.db, projectId, 10)
    expect(picked.map((c) => c.title)).toEqual(['high', 'low', 'dep'])

    await t.json('POST', `/api/cards/${String(must(dep).id)}/move`, { status: 'done' })
    const after = await pickableCards(t.ctx.db, projectId, 10)
    expect(after.map((c) => c.id)).toEqual([must(blocked).id, must(high).id, must(low).id])

    const claims = await Promise.all([
      claimCard(t.ctx.db, must(high).id, 1),
      claimCard(t.ctx.db, must(high).id, 2),
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
  })

  test('nothing is picked while the project has no repo or the worker is off', async () => {
    await create([{ project_id: projectId, title: 'x', tags: ['auto-pilot'] }])
    expect(await pickableCards(t.ctx.db, projectId)).toHaveLength(0)
  })
})

describe('on a real server', () => {
  // `app.handle` skips Bun.serve's router, where Elysia once failed to coerce path params (500)
  test('every route with a path param answers through Bun.serve', async () => {
    const [card] = await create([{ project_id: projectId, title: 'served' }])
    const server = t.app.listen({ hostname: '127.0.0.1', port: 0 })
    try {
      const base = `http://127.0.0.1:${String(must(server.server).port)}`
      const headers = { authorization: `Bearer ${t.ctx.auth.apiToken}` }
      for (const path of [
        `/api/cards/${String(must(card).id)}`,
        `/api/projects/${String(projectId)}`,
      ]) {
        const response = await fetch(`${base}${path}`, { headers })
        expect(`${path} ${String(response.status)}`).toBe(`${path} 200`)
      }
      const comment = await fetch(`${base}/api/cards/${String(must(card).id)}/comments`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'via Bun.serve' }),
      })
      expect(comment.status).toBe(200)
    } finally {
      await server.stop()
    }
  })
})

describe('runs search', () => {
  test('term, sort and page over runs, with the total', async () => {
    const [a, b] = await create([
      { project_id: projectId, title: 'login bug' },
      { project_id: projectId, title: 'docs' },
    ])
    const { createRun } = await import('../src/services/runs')
    for (const card of [must(a), must(b), must(a)])
      await createRun(t.ctx.db, {
        project_id: projectId,
        card_id: card.id,
        log_path: null,
      })
    const found = await t.json<{ rows: { card_id: number }[]; total: number }>(
      'POST',
      '/api/runs/search',
      {
        term: 'login',
        sort: { key: 'id', dir: 'asc' },
        page: 1,
        pageSize: 1,
      },
    )
    expect(found.total).toBe(2)
    expect(found.rows.map((r) => r.card_id)).toEqual([must(a).id])
    const bad = await t.call('POST', '/api/runs/search', { columns: { nope: 'x' } })
    expect(bad.status).toBe(400)
  })
})

describe('the card list', () => {
  test('lean leaves the bodies empty, and still finds by text in them', async () => {
    await create([{ project_id: projectId, title: 'tile', body: 'a long description of the work' }])
    type Row = { title: string; body: string }
    const [full] = await t.json<Row[]>('GET', '/api/cards')
    expect(full?.body).toBe('a long description of the work')
    const [lean] = await t.json<Row[]>('GET', '/api/cards?lean=true')
    expect(lean?.title).toBe('tile')
    expect(lean?.body).toBe('')
    expect(await t.json<Row[]>('GET', '/api/cards?lean=true&q=description')).toHaveLength(1)
  })
})

describe('a column kept in order by hand', () => {
  test('cards dropped into one gap again and again keep their order: the column is spread out', async () => {
    const made = await create(['a', 'b', 'c'].map((title) => ({ project_id: projectId, title })))
    const ids = made.map((card) => must(card).id)
    const [a, b, c] = [must(ids[0]), must(ids[1]), must(ids[2])]
    type Row = { id: number; position: number }
    const move = (id: number, position: number) =>
      t.json<Row>('POST', `/api/cards/${String(id)}/move`, { status: 'todo', position })
    const column = async () =>
      (await t.json<Row[]>('GET', '/api/cards?status=todo')).map((row) => [row.id, row.position])
    expect(await column()).toEqual([
      [a, 1],
      [b, 2],
      [c, 3],
    ])
    // a gap halved until it is nearly gone: c right after a, then b in between, and so on
    const low = 1
    let high = 2
    for (let i = 0; i < 30; i++) {
      high = (low + high) / 2
      await move(i % 2 === 0 ? c : b, high)
    }
    const after = await column()
    expect(after.map(([id]) => id)).toEqual([a, b, c])
    expect(after.map(([, position]) => position)).toEqual([1, 2, 3])
    // and the answer to the move that crowded it carries the new position
    high = 2
    let last: Row | undefined
    for (let i = 0; i < 25; i++) {
      high = (low + high) / 2
      last = await move(c, high)
    }
    expect(Number.isInteger(must(last).position)).toBe(true)
  })
})

describe('a run and its events', () => {
  test('the newest page, earlier pages by `before`, and how many there are', async () => {
    const [card] = await create([{ project_id: projectId, title: 'long run' }])
    const { addRunEvent, createRun } = await import('../src/services/runs')
    const run = await createRun(t.ctx.db, {
      project_id: projectId,
      card_id: must(card).id,
      log_path: null,
    })
    for (let seq = 1; seq <= 450; seq++)
      await addRunEvent(t.ctx.db, run.id, seq, {
        type: 'assistant',
        summary: `line ${String(seq)}`,
        data: null,
      })
    type Page = { events: { seq: number }[]; events_total: number }
    const seqs = (p: Page) => p.events.map((e) => e.seq)
    const newest = await t.json<Page>('GET', `/api/runs/${String(run.id)}`)
    expect(newest.events_total).toBe(450)
    expect(seqs(newest)).toEqual(Array.from({ length: 200 }, (_, i) => 251 + i))
    const earlier = await t.json<Page>('GET', `/api/runs/${String(run.id)}?before=251`)
    expect(seqs(earlier)).toEqual(Array.from({ length: 200 }, (_, i) => 51 + i))
    const first = await t.json<Page>('GET', `/api/runs/${String(run.id)}?before=51`)
    expect(seqs(first)).toEqual(Array.from({ length: 50 }, (_, i) => 1 + i))
    const after = await t.json<Page>('GET', `/api/runs/${String(run.id)}?after=440`)
    expect(seqs(after)).toEqual(Array.from({ length: 10 }, (_, i) => 441 + i))
  })
})

describe('calendar', () => {
  test('the cron jobs with why each is off, and the runs in the range', async () => {
    await t.json('PATCH', `/api/projects/${String(projectId)}`, {
      worker_enabled: true,
      interval_minutes: 60,
    })
    await t.json('POST', `/api/projects/${String(projectId)}/schedules`, {
      name: 'nightly tests',
      command: 'bun test',
      interval_minutes: 1440,
    })
    const [card] = await create([{ project_id: projectId, title: 'login bug' }])
    const { createRun } = await import('../src/services/runs')
    await createRun(t.ctx.db, {
      project_id: projectId,
      card_id: must(card).id,
      log_path: null,
    })
    const from = new Date(Date.now() - 86_400_000).toISOString()
    const to = new Date(Date.now() + 86_400_000).toISOString()
    const cal = await t.json<{
      jobs: { key: string; kind: string; every_minutes: number; off: string | null }[]
      runs: { card_title: string }[]
    }>('GET', `/api/calendar?from=${from}&to=${to}`)
    expect(cal.jobs.map((j) => [j.kind, j.every_minutes])).toEqual([
      ['worker', 60],
      ['schedule', 1440],
      ['housekeeping', 1440],
    ])
    // no worker loop in tests, and no repo path: nothing runs, and each says why
    expect(cal.jobs.every((j) => j.off !== null)).toBe(true)
    expect(cal.runs.map((r) => r.card_title)).toEqual(['login bug'])

    const later = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const none = await t.json<{ runs: unknown[] }>('GET', `/api/calendar?from=${to}&to=${later}`)
    expect(none.runs).toEqual([])
    expect((await t.call('GET', `/api/calendar?from=${to}&to=${from}`)).status).toBe(400)
  })
})
