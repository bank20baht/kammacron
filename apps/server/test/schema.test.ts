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

  test('a PATCH without mode or playbook leaves them; a new project has the one Claude step', async () => {
    await t.json('POST', '/api/projects', { slug: 'p', name: 'P', mode: 'watch' })
    const after = await t.json<{ mode: string; playbooks: unknown }>('PATCH', '/api/projects/1', {
      name: 'Q',
    })
    expect(after.mode).toBe('watch')
    expect(after.playbooks).toEqual([
      { name: 'default', steps: [{ kind: 'claude', name: 'Claude' }] },
    ])
  })

  test('a playbook is checked: steps of a known kind, with what each needs', async () => {
    await t.json('POST', '/api/projects', { slug: 'p', name: 'P' })
    const good = [
      { kind: 'run', name: 'Install', command: 'bun install' },
      { kind: 'claude', name: 'Claude', max_turns: 40 },
      { kind: 'run', name: 'Deploy', command: "ssh app './deploy.sh'", timeout_minutes: 10 },
    ]
    const saved = await t.json<{ playbooks: unknown }>('PATCH', '/api/projects/1', {
      playbooks: [{ name: 'default', steps: good }],
    })
    expect(saved.playbooks).toEqual([{ name: 'default', steps: good }])
    for (const bad of [
      [],
      [{ kind: 'run', name: 'No command' }],
      [{ kind: 'shell', name: 'x', command: 'ls' }],
    ])
      expect(
        (await t.call('PATCH', '/api/projects/1', { playbooks: [{ name: 'default', steps: bad }] }))
          .status,
      ).toBe(422)
    // a key no step has is dropped, not kept
    const stripped = await t.json<{ playbooks: { steps: unknown }[] }>('PATCH', '/api/projects/1', {
      playbooks: [{ name: 'default', steps: [{ kind: 'claude', name: 'x', surprise: true }] }],
    })
    expect(stripped.playbooks[0]?.steps).toEqual([{ kind: 'claude', name: 'x' }])
  })
})
