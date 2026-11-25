import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'

import { must, testApp, type TestApp } from './helpers'

const PUBLIC = 'https://board.example.net'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

let t: TestApp
beforeEach(async () => {
  t = await testApp({ publicUrl: PUBLIC, loopback: false })
})
afterEach(() => t.close())

const at = (path: string, init: RequestInit = {}) =>
  t.app.handle(new Request(`${PUBLIC}${path}`, init))
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...headers,
  },
  body: JSON.stringify(body),
})
const rpc = (method: string, params: unknown, token: string) =>
  at(
    '/mcp',
    json(
      { jsonrpc: '2.0', id: 1, method, params },
      { authorization: `Bearer ${token}`, 'mcp-protocol-version': '2025-06-18' },
    ),
  )

describe('OAuth for claude.ai and Claude Desktop', () => {
  test('register, authorize with consent, exchange, then call tools with the token', async () => {
    // 1. no token: the challenge that starts the flow
    const challenge = await at('/mcp', json({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(challenge.status).toBe(401)
    expect(challenge.headers.get('www-authenticate')).toContain('resource_metadata=')

    // 2. discovery
    const prm = (await (await at('/.well-known/oauth-protected-resource/mcp')).json()) as {
      authorization_servers: string[]
    }
    expect(prm.authorization_servers).toEqual([PUBLIC])

    // 3. dynamic client registration
    const registered = (await (
      await at(
        '/register',
        json({
          redirect_uris: [REDIRECT],
          client_name: 'Claude',
          token_endpoint_auth_method: 'none',
        }),
      )
    ).json()) as { client_id: string }

    // 4. authorize, with PKCE
    const verifier = randomBytes(32).toString('base64url')
    const challengeS256 = createHash('sha256').update(verifier).digest('base64url')
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: registered.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challengeS256,
      code_challenge_method: 'S256',
      scope: 'kammacron',
      state: 'xyz',
      resource: `${PUBLIC}/mcp`,
    })
    const authorize = await at(`/authorize?${query.toString()}`)
    expect(authorize.status).toBe(302)
    const consentUrl = new URL(must(authorize.headers.get('location')))
    expect(consentUrl.pathname).toBe('/oauth/consent')

    // 5. consent needs the owner: without a session, to the login page
    const anonymous = await at(`${consentUrl.pathname}${consentUrl.search}`)
    expect(must(anonymous.headers.get('location'))).toContain('/login?next=')
    const forged = await at('/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `auth=${must(consentUrl.searchParams.get('auth'))}&decision=allow`,
    })
    expect(forged.status).toBe(403)

    const session = await at('/api/session', json({ token: t.ctx.auth.apiToken }))
    const cookie = must(must(session.headers.get('set-cookie')).split(';')[0])
    const page = await at(`${consentUrl.pathname}${consentUrl.search}`, { headers: { cookie } })
    expect(await page.text()).toContain('Connect Claude?')
    const allowed = await at('/oauth/consent', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', origin: PUBLIC },
      body: `auth=${must(consentUrl.searchParams.get('auth'))}&decision=allow`,
    })
    const back = new URL(must(allowed.headers.get('location')))
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT)
    expect(back.searchParams.get('state')).toBe('xyz')

    // 6. code for a token
    const tokens = (await (
      await at('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: must(back.searchParams.get('code')),
          redirect_uri: REDIRECT,
          client_id: registered.client_id,
          code_verifier: verifier,
          resource: `${PUBLIC}/mcp`,
        }).toString(),
      })
    ).json()) as { access_token: string }
    expect(tokens.access_token).toBeTruthy()

    // 7. the tools, with that token; a tool call goes through /api with it too
    const listed = (await (await rpc('tools/list', {}, tokens.access_token)).json()) as {
      result: { tools: unknown[] }
    }
    expect(listed.result.tools.length).toBeGreaterThan(5)
    await t.json('POST', '/api/projects', { slug: 'p', name: 'P' })
    const created = (await (
      await rpc(
        'tools/call',
        {
          name: 'create_cards',
          arguments: { cards: [{ project_id: 1, title: 'from claude.ai' }] },
        },
        tokens.access_token,
      )
    ).json()) as { result: { isError?: boolean } }
    expect(created.result.isError).toBeFalsy()
    expect((await t.json<{ title: string }[]>('GET', '/api/cards')).map((c) => c.title)).toEqual([
      'from claude.ai',
    ])

    // 8. the API token still opens /mcp (the worker, `claude mcp add`)
    expect((await rpc('tools/list', {}, t.ctx.auth.apiToken)).status).toBe(200)
    // and a made-up token does not
    expect((await rpc('tools/list', {}, 'not-a-token')).status).toBe(401)
  })
})
