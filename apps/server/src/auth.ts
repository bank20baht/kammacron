import { Elysia } from 'elysia'

import { sameSecret } from './secrets'

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
  /** With OAuth on: is this an access token the provider issued? */
  verifyOAuth?: ((token: string) => Promise<boolean>) | undefined
}

/** Paths that need the token or the session; everything else (the web app's files) is public. */
const PROTECTED = /^\/(api|mcp|live|files)(\/|$)/
/** Where a browser without a session gets one: these check the caller themselves. */
const SESSION_PATHS = new Set(['/api/session'])
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
  (LOCAL_HOSTS.has(hostname) ||
    state.allowedHosts.includes(hostname) ||
    hostname === state.publicHost)

export const isLocalHost = (hostname: string | null) =>
  hostname !== null && LOCAL_HOSTS.has(hostname)

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

/** Does the request carry the API token, an OAuth access token, or the session cookie? */
export const isAuthenticated = async (request: Request, state: AuthState) => {
  const bearer = bearerOf(request.headers.get('authorization'))
  if (bearer !== null)
    return sameSecret(bearer, state.apiToken) || ((await state.verifyOAuth?.(bearer)) ?? false)
  const session = cookieValue(request.headers.get('cookie'), SESSION_COOKIE)
  return session !== null && sameSecret(session, state.sessionSecret)
}

export const sessionCookie = (state: AuthState) =>
  `${SESSION_COOKIE}=${encodeURIComponent(state.sessionSecret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`

const refuse = (status: number, code: string, message: string) =>
  Response.json({ code, message }, { status })

/**
 * Runs before routing, for every request (MCP's in-process tool calls too):
 * - `Host` must be a local name or an allowed host (DNS rebinding);
 * - an `Origin`, when sent, must be one too (CSRF from another site);
 * - `/api`, `/mcp`, `/live` and `/files` need `Authorization: Bearer <token>` or the session cookie.
 */
export const authGuard = (state: AuthState) =>
  new Elysia({ name: 'kammacron-auth' }).onRequest(async ({ request }) => {
    const url = new URL(request.url)
    if (!isAllowedHost(hostnameOf(request.headers.get('host') ?? url.host), state))
      return refuse(
        421,
        'HOST_NOT_ALLOWED',
        'this host is not allowed; add it in Settings → allowed hosts',
      )
    if (OAUTH_PATHS.test(url.pathname)) return undefined
    const origin = request.headers.get('origin')
    if (
      origin !== null &&
      origin !== 'null' &&
      !isAllowedHost(hostnameOf(URL.canParse(origin) ? new URL(origin).host : null), state)
    )
      return refuse(403, 'ORIGIN_NOT_ALLOWED', 'cross-origin request refused')
    if (!PROTECTED.test(url.pathname) || SESSION_PATHS.has(url.pathname)) return undefined
    if (request.method === 'OPTIONS') return undefined
    // with OAuth on, /mcp is mcpify's: it answers 401 with the challenge that starts the flow
    if (state.verifyOAuth && /^\/mcp(\/|$)/.test(url.pathname)) return undefined
    if (!(await isAuthenticated(request, state)))
      return refuse(
        401,
        'UNAUTHORIZED',
        'send Authorization: Bearer <token>, or open the web app from this machine',
      )
    return undefined
  })
