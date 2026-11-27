import { Elysia, t } from 'elysia'

import { identityProof, isOwner, newLoginCode, sessionCookie, useLoginCode } from '../auth'
import type { AppContext } from '../context'
import { sameSecret } from '../secrets'
import { disconnectOAuth } from '../services/oauth-storage'
import { RETENTION_KEYS, cleanUp, dataSummary, retentionOf } from '../services/retention'
import { getSettings, rotateToken, updateSettings } from '../services/settings'

/** A retention length: days, or null to keep until a person removes it. */
const Days = t.Nullable(t.Integer({ minimum: 1, maximum: 3650 }))
/** A length being chosen, to see what it would let go: days, or `never`. */
const Length = t.Union([t.Literal('never'), t.String({ pattern: '^[1-9][0-9]{0,3}$' })])

/** Behind an https tunnel the cookie must never travel in the clear. */
const isHttps = (request: Request) => request.headers.get('origin')?.startsWith('https://') ?? false

/**
 * Session, settings and the switches of the whole install. None of these are MCP tools: pausing,
 * rotating the token and changing allowed hosts are the person's alone.
 */
export const systemRoutes = (ctx: AppContext) =>
  new Elysia()
    // Being on this machine proves nothing (other accounts are too): a session starts with the
    // token, or with a one-time code `kammacron open` asked for using it.
    .get(
      '/session',
      ({ request, status }) =>
        isOwner(request, ctx.auth)
          ? { ok: true as const }
          : status(401, {
              code: 'TOKEN_NEEDED',
              message: 'run `kammacron open`, or enter the API token',
            }),
      { detail: { operationId: 'open_session', summary: 'Is there a web session' } },
    )
    .post(
      '/session',
      ({ body, request, set, status }) => {
        const ok =
          'code' in body
            ? useLoginCode(ctx.auth, body.code)
            : sameSecret(body.token, ctx.auth.apiToken)
        if (!ok) return status(401, { code: 'BAD_TOKEN', message: 'wrong or expired' })
        set.headers['set-cookie'] = sessionCookie(ctx.auth, isHttps(request))
        return { ok: true as const }
      },
      {
        body: t.Union([
          t.Object({ token: t.String({ maxLength: 200 }) }),
          t.Object({ code: t.String({ maxLength: 200 }) }),
        ]),
        detail: {
          operationId: 'open_session_with_token',
          summary: 'Start a web session with the API token or a one-time code',
        },
      },
    )
    .post('/session/code', () => ({ code: newLoginCode(ctx.auth) }), {
      detail: { operationId: 'new_session_code', summary: 'A one-time sign-in code' },
    })
    .get('/identity', ({ query }) => ({ proof: identityProof(ctx.auth.apiToken, query.nonce) }), {
      query: t.Object({ nonce: t.String({ minLength: 16, maxLength: 100 }) }),
      detail: { operationId: 'prove_identity', summary: 'Proof this server holds the token' },
    })
    .get(
      '/settings',
      async () => {
        const row = await getSettings(ctx.db)
        return {
          paused: row.paused,
          stale_minutes: row.stale_minutes,
          ...Object.fromEntries(RETENTION_KEYS.map((k) => [k, row[k]])),
          allowed_hosts: row.allowed_hosts,
          worker_path: row.worker_path,
          concurrency: row.concurrency,
          webhook_url: row.webhook_url,
          desktop_notifications: row.desktop_notifications,
          public_url: row.public_url,
          oauth: ctx.oauth !== null,
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
            run_log_retention_days: Days,
            step_output_retention_days: Days,
            run_retention_days: Days,
            done_card_archive_days: Days,
            archived_card_retention_days: Days,
            alert_retention_days: Days,
            allowed_hosts: t.Array(t.String({ pattern: '^[a-z0-9.-]+$' })),
            worker_path: t.Nullable(t.String()),
            concurrency: t.Integer({ minimum: 1, maximum: 8 }),
            webhook_url: t.Nullable(t.String({ pattern: '^https?://' })),
            desktop_notifications: t.Boolean(),
            public_url: t.Nullable(t.String({ pattern: '^https://[^/]+/?$' })),
          }),
        ),
        detail: { operationId: 'update_settings', summary: 'Pause, timeouts, allowed hosts' },
      },
    )
    // what is kept, for how long, and letting go of it now: the person's, never an agent's
    .get(
      '/data',
      async ({ query }) => {
        const r = await retentionOf(ctx.db)
        // a length being chosen (not saved yet): what it would let go
        for (const k of RETENTION_KEYS) {
          const v = query[k]
          if (v !== undefined) r[k] = v === 'never' ? null : Number(v)
        }
        return { retention: r, kinds: await dataSummary(ctx.db, ctx.worker.dataDir, r) }
      },
      {
        query: t.Partial(
          t.Object({
            run_log_retention_days: Length,
            step_output_retention_days: Length,
            run_retention_days: Length,
            done_card_archive_days: Length,
            archived_card_retention_days: Length,
            alert_retention_days: Length,
          }),
        ),
        detail: {
          operationId: 'data_summary',
          summary: 'How much is kept of each kind, and how much the retention lets go now',
        },
      },
    )
    .post('/data/clean', () => cleanUp(ctx.db, ctx.worker.dataDir), {
      detail: {
        operationId: 'clean_data',
        summary: 'Let go now of what the retention lengths have passed (the daily housekeeping)',
      },
    })
    .post(
      '/token/rotate',
      async ({ request, set }) => {
        const next = await rotateToken(ctx.db, ctx.secretsPath, ctx.secrets)
        Object.assign(ctx.secrets, next)
        ctx.auth.apiToken = next.api_token
        ctx.auth.sessionSecret = next.session_secret
        // a new token means "cut everyone off": connected OAuth clients too
        await disconnectOAuth(ctx.db, ctx.oauth)
        set.headers['set-cookie'] = sessionCookie(ctx.auth, isHttps(request))
        return { ok: true as const }
      },
      {
        detail: {
          operationId: 'rotate_token',
          summary: 'A new API token; the old one stops working, OAuth clients are disconnected',
        },
      },
    )
    .get('/token', () => ({ token: ctx.secrets.api_token }), {
      detail: { operationId: 'get_token', summary: 'The API token, for `claude mcp add`' },
    })
