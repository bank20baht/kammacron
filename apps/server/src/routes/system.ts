import { Elysia, t } from 'elysia'

import { isLocalHost, sessionCookie } from '../auth'
import type { AppContext } from '../context'
import { maskSecret, sameSecret } from '../secrets'
import { getSettings, rotateToken, updateSettings } from '../services/settings'

const hostnameOf = (request: Request) => new URL(request.url).hostname.toLowerCase()

/**
 * Session, settings and the switches of the whole install. None of these are MCP tools: pausing,
 * rotating the token and changing allowed hosts are the person's alone.
 */
export const systemRoutes = (ctx: AppContext) =>
  new Elysia()
    // A browser on this machine, at a local host name, gets the cookie by asking. A tunnel connects
    // from loopback too, so the host name is checked as well: through a tunnel it is the tunnel's.
    .get(
      '/session',
      ({ request, set, status }) => {
        const local = ctx.isLoopback(request) && isLocalHost(hostnameOf(request))
        if (!local)
          return status(401, {
            code: 'TOKEN_NEEDED',
            message: 'enter the API token once to open from another machine',
          })
        set.headers['set-cookie'] = sessionCookie(ctx.auth)
        return { ok: true as const }
      },
      { detail: { operationId: 'open_session', summary: 'Start a web session from this machine' } },
    )
    .post(
      '/session',
      ({ body, set, status }) => {
        if (!sameSecret(body.token, ctx.auth.apiToken))
          return status(401, { code: 'BAD_TOKEN', message: 'wrong token' })
        set.headers['set-cookie'] = sessionCookie(ctx.auth)
        return { ok: true as const }
      },
      {
        body: t.Object({ token: t.String() }),
        detail: {
          operationId: 'open_session_with_token',
          summary: 'Start a web session with the API token',
        },
      },
    )
    .get(
      '/settings',
      async () => {
        const row = await getSettings(ctx.db)
        const envToken = process.env['CLAUDE_CODE_OAUTH_TOKEN']
        return {
          paused: row.paused,
          stale_minutes: row.stale_minutes,
          run_log_retention_days: row.run_log_retention_days,
          allowed_hosts: row.allowed_hosts,
          claude_token: {
            source: envToken
              ? ('env' as const)
              : ctx.secrets.claude_oauth_token
                ? ('settings' as const)
                : null,
            last4: maskSecret(envToken ?? ctx.secrets.claude_oauth_token),
          },
        }
      },
      { detail: { operationId: 'get_settings', summary: 'Settings of the install' } },
    )
    .patch(
      '/settings',
      async ({ body }) => {
        const row = await updateSettings(ctx.db, body)
        if (body.allowed_hosts) ctx.auth.allowedHosts = row.allowed_hosts
        return row
      },
      {
        body: t.Partial(
          t.Object({
            paused: t.Boolean(),
            stale_minutes: t.Integer({ minimum: 5, maximum: 24 * 60 }),
            run_log_retention_days: t.Integer({ minimum: 1, maximum: 3650 }),
            allowed_hosts: t.Array(t.String({ pattern: '^[a-z0-9.-]+$' })),
          }),
        ),
        detail: { operationId: 'update_settings', summary: 'Pause, timeouts, allowed hosts' },
      },
    )
    .post(
      '/token/rotate',
      async ({ set }) => {
        const next = await rotateToken(ctx.db, ctx.secretsPath, ctx.secrets)
        Object.assign(ctx.secrets, next)
        ctx.auth.apiToken = next.api_token
        ctx.auth.sessionSecret = next.session_secret
        set.headers['set-cookie'] = sessionCookie(ctx.auth)
        return { ok: true as const }
      },
      {
        detail: {
          operationId: 'rotate_token',
          summary: 'A new API token; the old one stops working',
        },
      },
    )
    .get('/token', () => ({ token: ctx.secrets.api_token }), {
      detail: { operationId: 'get_token', summary: 'The API token, for `claude mcp add`' },
    })
