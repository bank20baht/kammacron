import { createHmac } from 'node:crypto'

import { isToolCall } from '@20baht/elysia-openapi-mcp'
import { Elysia } from 'elysia'

import { newToken, sameSecret } from './secrets'

const SESSION_COOKIE = 'kammacron_session'

/** Hosts every install accepts; Settings adds a tunnel's host to them. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** What the guard reads on every request; replaced in place when the token rotates. */
export type AuthState = {
  apiToken: string
  sessionSecret: string
  allowedHosts: readonly string[]
  /** `settings.public_url`'s host name: allowed, and the issuer of OAuth tokens. */
  publicHost?: string | null | undefined
  /** The address the server is bound to, when it is not a local name: the worker calls it there. */
  bindHost?: string | null | undefined
  /** With OAuth on: is this an access token the provider issued? */
  verifyOAuth?: ((token: string) => Promise<boolean>) | undefined
  /** The run a worker's token belongs to, while that run goes. */
  runOf: (token: string) => RunScope | undefined
  /** Single-use sign-in codes of `kammacron open`, with when each expires. */
  loginCodes: Map<string, number>
}

/** What one worker run's token may write: its own card, and nothing else that exists. */
export type RunScope = { runId: number; cardId: number }

/** Paths that need the token or the session; everything else (the web app's files) is public. */
const PROTECTED = /^\/(api|mcp|live|files)(\/|$)/
/** Open to a caller with nothing yet: these check it themselves, or give nothing away. */
const SESSION_PATHS = new Set(['/api/session', '/api/identity'])
/** OAuth's own endpoints: called by MCP clients' servers and browsers of other origins. */
const OAUTH_PATHS = /^\/(authorize|token|register|revoke)$|^\/\.well-known\//

const hostnameOf = (host: string | null) => {
  if (!host) return null
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

const isAllowedHost = (hostname: string | null, state: AuthState) =>
  hostname !== null &&
  (LOCAL_HOSTS.has(hostname) || hostname === state.bindHost || isRemoteName(hostname, state))

/** A name the owner configured for reaching this install from elsewhere. */
const isRemoteName = (hostname: string, state: AuthState) =>
  state.allowedHosts.includes(hostname) || hostname === state.publicHost

/**
 * Is this `Origin` the board's own? Another port of this machine is another web app, so a local
 * origin must match `Host` port and all. A configured remote name is accepted by name, for tunnels
 * that rewrite `Host`.
 */
const isOwnOrigin = (origin: string, host: string, state: AuthState) => {
  if (!URL.canParse(origin)) return false
  const url = new URL(origin)
  return url.host === host.toLowerCase() || isRemoteName(url.hostname.toLowerCase(), state)
}

const cookieValue = (header: string | null, name: string) => {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

const bearerOf = (header: string | null) => {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

/**
 * Is the caller the owner: the API token or the session cookie? Never an OAuth token or a worker's
 * run token: those reach the MCP tools only.
 */
export const isOwner = (request: Request, state: AuthState) => {
  const bearer = bearerOf(request.headers.get('authorization'))
  if (bearer !== null) return sameSecret(bearer, state.apiToken)
  const session = cookieValue(request.headers.get('cookie'), SESSION_COOKIE)
  return session !== null && sameSecret(session, state.sessionSecret)
}

/** A caller that may use the MCP tools and nothing else. */
const isToolClient = async (token: string | null, state: AuthState) =>
  token !== null &&
  (state.runOf(token) !== undefined || ((await state.verifyOAuth?.(token)) ?? false))

/** The run whose token this request carries, if it is a worker's. */
export const runScopeOf = (request: Request, state: AuthState) => {
  const bearer = bearerOf(request.headers.get('authorization'))
  return bearer === null ? undefined : state.runOf(bearer)
}

const LOGIN_CODE_MS = 60_000

/** A code that opens one session, once, within a minute. */
export const newLoginCode = (state: AuthState) => {
  for (const [code, expires] of state.loginCodes)
    if (expires < Date.now()) state.loginCodes.delete(code)
  const code = newToken()
  state.loginCodes.set(code, Date.now() + LOGIN_CODE_MS)
  return code
}

export const useLoginCode = (state: AuthState, code: string) => {
  const expires = state.loginCodes.get(code)
  state.loginCodes.delete(code)
  return expires !== undefined && expires >= Date.now()
}

/** What proves a server holds this install's token, without the token being sent. */
export const identityProof = (token: string, nonce: string) =>
  createHmac('sha256', token).update(`kammacron-identity:${nonce}`).digest('base64url')

export const sessionCookie = (state: AuthState, secure: boolean) =>
  `${SESSION_COOKIE}=${encodeURIComponent(state.sessionSecret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`

const refuse = (status: number, code: string, message: string) =>
  Response.json({ code, message }, { status })

/** `/mcp` checks its own callers with OAuth on; without it, tool clients pass the guard here. */
const mayPass = async (request: Request, pathname: string, state: AuthState) => {
  if (isOwner(request, state)) return true
  // a tool call mcpify makes in process (a mark no client can forge), or a worker at /mcp
  if (!isToolCall(request) && !/^\/mcp(\/|$)/.test(pathname)) return false
  return isToolClient(bearerOf(request.headers.get('authorization')), state)
}

/**
 * Runs before routing, for every request (MCP's in-process tool calls too):
 * - `Host` must be a local name or an allowed host (DNS rebinding);
 * - an `Origin`, when sent, must be the board's own (CSRF from another site, port or sandbox);
 * - `/api`, `/mcp`, `/live` and `/files` need the owner, or a tool client making a tool call.
 */
export const authGuard = (state: AuthState) =>
  new Elysia({ name: 'kammacron-auth' }).onRequest(async ({ request }) => {
    const url = new URL(request.url)
    const host = request.headers.get('host') ?? url.host
    if (!isAllowedHost(hostnameOf(host), state))
      return refuse(
        421,
        'HOST_NOT_ALLOWED',
        'this host is not allowed; add it in Settings → allowed hosts',
      )
    if (OAUTH_PATHS.test(url.pathname)) return undefined
    const origin = request.headers.get('origin')
    const reads = request.method === 'GET' || request.method === 'HEAD'
    // `null` is a sandboxed frame or a redirected cross-origin form: it may read, never write
    if (origin !== null && !(origin === 'null' ? reads : isOwnOrigin(origin, host, state)))
      return refuse(403, 'ORIGIN_NOT_ALLOWED', 'cross-origin request refused')
    if (!PROTECTED.test(url.pathname) || SESSION_PATHS.has(url.pathname)) return undefined
    if (request.method === 'OPTIONS') return undefined
    // with OAuth on, /mcp is mcpify's: it answers 401 with the challenge that starts the flow
    if (state.verifyOAuth && /^\/mcp(\/|$)/.test(url.pathname)) return undefined
    if (!(await mayPass(request, url.pathname, state)))
      return refuse(
        401,
        'UNAUTHORIZED',
        'send Authorization: Bearer <token>, or run `kammacron open` on this machine',
      )
    return undefined
  })
