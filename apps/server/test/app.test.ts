import { describe, expect, test } from 'bun:test'

import { buildApp } from '../src/app'

const post = (body: unknown) =>
  buildApp().handle(
    new Request('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

describe('api', () => {
  test('says hello', async () => {
    const response = await buildApp().handle(new Request('http://localhost/api/hello'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello from the server' })
  })

  test('serves the contact form the browser renders', async () => {
    const response = await buildApp().handle(new Request('http://localhost/api/contact/form'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ form_name: 'Contact' })
  })

  test('keeps a valid submission and refuses an invalid one with the field at fault', async () => {
    const good = await post({ name: 'Ada', email: 'ada@example.com', message: 'Hello' })
    expect(good.status).toBe(200)
    expect(await good.json()).toEqual({
      received: { name: 'Ada', email: 'ada@example.com', message: 'Hello' },
    })

    const bad = await post({ name: 'Ada', email: 'not-an-email' })
    expect(bad.status).toBe(422)
    const refused = (await bad.json()) as { issues: { ref: string }[] }
    expect(refused.issues.map((issue) => issue.ref).sort()).toEqual(['email', 'message'])
  })

  test('lists what it received: a page of rows for a query, and refuses an unknown column', async () => {
    const app = buildApp()
    const call = (path: string, body: unknown) =>
      app.handle(
        new Request(`http://localhost/api/contact${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    await call('', { name: 'Ada', email: 'ada@example.com', message: 'Hello' })
    await call('', { name: 'Bob', email: 'bob@example.com', message: 'Goodbye' })

    const found = await call('/search', { columns: { name: 'ada' } })
    expect(found.status).toBe(200)
    const page = (await found.json()) as { rows: { name: string }[]; total: number }
    expect(page.total).toBe(1)
    expect(page.rows.map((row) => row.name)).toEqual(['Ada'])

    const sorted = await call('/search', { sort: { key: 'name', dir: 'desc' } })
    const names = ((await sorted.json()) as { rows: { name: string }[] }).rows.map(
      (row) => row.name,
    )
    expect(names).toEqual(['Bob', 'Ada'])

    const refused = await call('/search', { columns: { colour: 'red' } })
    expect(refused.status).toBe(400)

    const table = await app.handle(new Request('http://localhost/api/contact/table'))
    expect(await table.json()).toMatchObject({
      visible: ['received_at', 'name', 'email', 'message'],
    })
  })
})
