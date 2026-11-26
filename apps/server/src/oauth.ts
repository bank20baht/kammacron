import { oauthProvider } from '@20baht/elysia-oauth-provider'
import { Elysia, t } from 'elysia'

import type { Db } from './db'
import { dbOAuthStorage } from './services/oauth-storage'

/** The one scope: everything the MCP tools can do. */
export const OAUTH_SCOPE = 'kammacron'

/** Registration is open to anyone who reaches it, so what it can store is bounded. */
const MAX_REGISTRATION_BYTES = 8 * 1024
const MAX_UNUSED_CLIENTS = 50

/**
 * Behind a tunnel every caller has the tunnel's address, and so one rate limit. Set
 * KAMMACRON_TRUSTED_PROXY to the header the tunnel puts the caller's address in (as
 * `cf-connecting-ip`), or to the number of proxies appending to X-Forwarded-For.
 */
const trustedProxy = () => {
  const value = process.env['KAMMACRON_TRUSTED_PROXY']?.trim()
  if (!value) return undefined
  return /^\d+$/.test(value) ? Number(value) : value.toLowerCase()
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/** A plain page for the consent step: it must work before the web app's session exists. */
const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · kammacron</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1c1f23}button{font:inherit;padding:.5rem 1.2rem;margin-right:.5rem;border-radius:.5rem;border:1px solid #888;cursor:pointer}button.primary{background:#1d2b5c;color:#fff;border-color:#1d2b5c}code{background:#eee;padding:0 .3rem;border-radius:.3rem}@media (prefers-color-scheme:dark){body{background:#111418;color:#e8eaed}code{background:#2c323b}}</style></head><body>${body}</body></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      },
    },
  )

export type OAuth = ReturnType<typeof createOAuth>

/**
 * OAuth 2.1 for /mcp, so claude.ai and Claude Desktop can connect through a tunnel: dynamic client
 * registration, then a consent page only the owner (with the session cookie) can approve.
 * Built only when `settings.public_url` is set.
 */
export const createOAuth = (db: Db, publicUrl: string, isOwner: (request: Request) => boolean) => {
  const issuer = publicUrl.replace(/\/+$/, '')
  const proxy = trustedProxy()
  /** Before one more client: the oldest never-connected ones make room. */
  const makeRoom = async () => {
    const used = new Set((await helpers.listGrants()).map((g) => g.clientId))
    const unused = (await helpers.listClients())
      .filter((c) => c.dynamicallyRegistered && !used.has(c.clientId))
      .sort((a, b) => a.registrationDate - b.registrationDate)
    for (const client of unused.slice(0, Math.max(0, unused.length - MAX_UNUSED_CLIENTS + 1)))
      await helpers.deleteClient(client.clientId)
  }
  const provider = oauthProvider({
    issuer,
    storage: dbOAuthStorage(db),
    resource: `${issuer}/mcp`,
    scopesSupported: [OAUTH_SCOPE],
    clientRegistration: { maxBodyBytes: MAX_REGISTRATION_BYTES },
    hooks: { onClientRegister: makeRoom },
    ...(proxy === undefined ? {} : { rateLimit: { trustProxy: proxy } }),
    publicOrigin: new URL(issuer).origin,
    handleAuthorize: ({ authRequestId }) =>
      Response.redirect(`${issuer}/oauth/consent?auth=${encodeURIComponent(authRequestId)}`, 302),
  })
  const helpers = provider.decorator.oauthProvider

  const consent = new Elysia({ name: 'kammacron-oauth-consent' })
    .get(
      '/oauth/consent',
      async ({ query, request }) => {
        if (!isOwner(request))
          return Response.redirect(
            `${issuer}/login?next=${encodeURIComponent(`/oauth/consent?auth=${query.auth}`)}`,
            302,
          )
        const pending = await helpers.getAuthRequest(query.auth)
        if (!pending)
          return page(
            'Expired',
            '<h1>This request expired</h1><p>Start the connection again from the client.</p>',
          )
        const client = await helpers.lookupClient(pending.clientId)
        const name = escapeHtml(client?.clientName ?? pending.clientId)
        return page(
          'Connect',
          `<h1>Connect ${name}?</h1><p><strong>${name}</strong> asks to use this kammacron board through MCP: read projects, runs and cards, create and change cards, comment, and upload images. A card it tags for the worker runs that project’s playbook. It cannot change settings, approve reviews or see the token.</p><p>Redirects to <code>${escapeHtml(pending.redirectUri)}</code></p><form method="post" action="/oauth/consent"><input type="hidden" name="auth" value="${escapeHtml(query.auth)}"><button class="primary" name="decision" value="allow">Allow</button><button name="decision" value="deny">Deny</button></form>`,
        )
      },
      { query: t.Object({ auth: t.String() }), detail: { hide: true } },
    )
    .post(
      '/oauth/consent',
      async ({ body, request }) => {
        if (!isOwner(request)) return new Response('Forbidden', { status: 403 })
        const { redirectTo } =
          body.decision === 'allow'
            ? await helpers.completeAuthorization({
                authRequestId: body.auth,
                userId: 'owner',
                scopes: [OAUTH_SCOPE],
                props: {},
              })
            : await helpers.rejectAuthorization({ authRequestId: body.auth })
        return Response.redirect(redirectTo, 302)
      },
      { body: t.Object({ auth: t.String(), decision: t.String() }), detail: { hide: true } },
    )

  return {
    issuer,
    resource: `${issuer}/mcp`,
    plugin: new Elysia({ name: 'kammacron-oauth' }).use(provider).use(consent),
    /** Is this an access token the provider issued (not revoked, not expired)? */
    verify: async (token: string) =>
      (await helpers.verifyAccessToken(token).catch(() => null)) !== null,
    provider: helpers,
  }
}
