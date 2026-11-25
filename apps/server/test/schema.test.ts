import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { testApp, type TestApp } from './helpers'

let t: TestApp
beforeEach(async () => {
  t = await testApp()
})
afterEach(() => t.close())

// Elysia fills an optional `t.UnionEnum` that was not sent with its first value: these would fail
describe('optional choices stay unset when not sent', () => {
  test('a list without a status filter has every status', async () => {
    await t.json('POST', '/api/projects', { slug: 'p', name: 'P' })
    await t.json('POST', '/api/cards/batch', {
      cards: [
        { project_id: 1, title: 'a' },
        { project_id: 1, title: 'b' },
      ],
    })
    await t.json('POST', '/api/cards/2/move', { status: 'review', reason: 'x' })
    const all = await t.json<{ status: string }[]>('GET', '/api/cards')
    expect(all.map((c) => c.status).sort()).toEqual(['review', 'todo'])
  })

  test('a PATCH without mode or ship_policy leaves them', async () => {
    await t.json('POST', '/api/projects', {
      slug: 'p',
      name: 'P',
      mode: 'autopilot',
      ship_policy: 'push',
    })
    const after = await t.json<{ mode: string; ship_policy: string }>('PATCH', '/api/projects/1', {
      name: 'Q',
    })
    expect([after.mode, after.ship_policy]).toEqual(['autopilot', 'push'])
  })
})
