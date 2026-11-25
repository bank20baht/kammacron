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

  test('a browser on this machine gets a session cookie that opens /api', async () => {
    const session = await t.app.handle(new Request('http://localhost/api/session'))
    expect(session.status).toBe(200)
    const cookie = must(must(session.headers.get('set-cookie')).split(';')[0])
    expect(session.headers.get('set-cookie')).toContain('HttpOnly')
    const cards = await t.app.handle(
      new Request('http://localhost/api/cards', { headers: { cookie } }),
    )
    expect(cards.status).toBe(200)
  })

  test('through a tunnel (another host name) the cookie needs the token first', async () => {
    t.ctx.auth.allowedHosts = ['board.example.net']
    const viaTunnel = await t.app.handle(new Request('http://board.example.net/api/session'))
    expect(viaTunnel.status).toBe(401)
    const withToken = await t.app.handle(
      new Request('http://board.example.net/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: t.ctx.auth.apiToken }),
      }),
    )
    expect(withToken.status).toBe(200)
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
      { ref: 'small', project_id: projectId, title: 'fix the typo', tags: ['claude'] },
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
      { project_id: projectId, title: 'login bug', tags: ['claude'] },
      { project_id: projectId, title: 'docs', body: 'mentions a BUG here' },
      { project_id: projectId, title: 'other' },
    ])
    expect(await t.json<Card[]>('GET', '/api/cards?q=bug')).toHaveLength(2)
    expect(await t.json<Card[]>('GET', '/api/cards?tag=claude')).toHaveLength(1)
    expect(await t.json<Card[]>('GET', '/api/cards?status=done')).toHaveLength(0)
  })
})

describe('worker selection', () => {
  test('picks claude cards that wait on nothing unfinished, by priority then age; one claimer wins', async () => {
    await t.json('PATCH', `/api/projects/${String(projectId)}`, {
      worker_enabled: true,
      repo_path: '/tmp/x',
    })
    const [dep, blocked, low, high] = await create([
      { ref: 'dep', project_id: projectId, title: 'dep', tags: ['claude'] },
      { project_id: projectId, title: 'blocked', tags: ['claude'], waits_on: ['dep'], priority: 9 },
      { project_id: projectId, title: 'low', tags: ['claude'], priority: 1 },
      { project_id: projectId, title: 'high', tags: ['claude'], priority: 5 },
      { project_id: projectId, title: 'human', tags: ['claude'], human: true, priority: 99 },
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
    await create([{ project_id: projectId, title: 'x', tags: ['claude'] }])
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
        base_sha: null,
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
