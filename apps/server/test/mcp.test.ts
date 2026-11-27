import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { must, testApp, type TestApp } from './helpers'

let t: TestApp
beforeEach(async () => {
  t = await testApp()
})
afterEach(() => t.close())

type RpcBody = {
  result?: {
    tools?: { name: string }[]
    isError?: boolean
    content?: { type: string; text: string }[]
  }
}

let rpcId = 0
const rpc = async (method: string, params: unknown, headers: Record<string, string> = {}) => {
  const response = await t.call(
    'POST',
    '/mcp',
    { jsonrpc: '2.0', id: ++rpcId, method, params },
    {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...headers,
    },
  )
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as RpcBody }
}

describe('mcp', () => {
  test('lists only the tools meant for Claude: no settings, review decisions or token', async () => {
    const { status, body } = await rpc('tools/list', {})
    expect(status).toBe(200)
    const names = must(body.result?.tools)
      .map((tool) => tool.name)
      .sort()
    expect(names).toEqual([
      'add_comment',
      'archive_card',
      'create_cards',
      'get_calendar',
      'get_card',
      'get_run',
      'list_cards',
      'list_projects',
      'move_card',
      'update_card',
      'upload_image',
    ])
  })

  test('refuses a call without the token', async () => {
    const { status } = await rpc('tools/list', {}, { authorization: 'Bearer wrong' })
    expect(status).toBe(401)
  })

  test('list_cards answers a tool with titles, and a bounded number of them; the web app gets what it asks for', async () => {
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    for (let batch = 0; batch < 3; batch++)
      await t.json('POST', '/api/cards/batch', {
        cards: Array.from({ length: 40 }, (_, i) => ({
          project_id: project.id,
          title: `card ${String(batch * 40 + i)}`,
          body: 'a long description '.repeat(50),
        })),
      })
    type Row = { title: string; body: string }
    const cardsOf = (answer: { body: RpcBody }) =>
      JSON.parse(must(answer.body.result?.content?.[0]).text) as Row[]
    const listed = cardsOf(await rpc('tools/call', { name: 'list_cards', arguments: {} }))
    expect(listed).toHaveLength(100)
    expect(listed.every((card) => card.body === '')).toBe(true)
    // it can ask for the bodies, and for fewer or more
    const asked = cardsOf(
      await rpc('tools/call', { name: 'list_cards', arguments: { lean: 'false', limit: 2 } }),
    )
    expect(asked).toHaveLength(2)
    expect(asked[0]?.body).toContain('a long description')
    // the board, not a tool: every card, as before
    const board = await t.json<Row[]>('GET', '/api/cards')
    expect(board).toHaveLength(120)
    expect(board[0]?.body).toContain('a long description')
  })

  test("a tool call runs the route; a comment from the worker's run is marked as the worker's", async () => {
    const project = await t.json<{ id: number }>('POST', '/api/projects', { slug: 'p', name: 'P' })
    const created = await rpc('tools/call', {
      name: 'create_cards',
      arguments: { cards: [{ project_id: project.id, title: 'from mcp', tags: ['auto-pilot'] }] },
    })
    expect(created.body.result?.isError).toBeFalsy()
    const [card] = JSON.parse(must(created.body.result?.content?.[0]).text) as { id: number }[]

    t.ctx.worker.runTokens.set('token-of-run-seven', { runId: 7, cardId: must(card).id })
    await rpc(
      'tools/call',
      { name: 'add_comment', arguments: { id: String(must(card).id), body: 'done in abc123' } },
      { authorization: 'Bearer token-of-run-seven' },
    )
    await rpc('tools/call', {
      name: 'add_comment',
      arguments: { id: String(must(card).id), body: 'from a desktop client' },
    })
    const full = await t.json<{ comments: { author: string; run_id: number | null }[] }>(
      'GET',
      `/api/cards/${String(must(card).id)}`,
    )
    expect(full.comments.map((c) => [c.author, c.run_id])).toEqual([
      ['claude-worker', 7],
      ['mcp', null],
    ])
  })
})
